import { randomUUID } from "node:crypto";
import { WebSocket, type WebSocketServer } from "ws";
import { scoreBark, type AudioFrame, type BarkScore, type CalibrationProfile } from "@klaeff/scoring";
import {
  addPlayer,
  addReport,
  createMatch,
  createPrivateLobby,
  createPublicLobby,
  createReportState,
  currentBarker,
  computeStandings,
  evaluateCountdown,
  isDeviceExcludedFromPublicQueue,
  isMatchFinished,
  BarkScoreSchema,
  kickPlayer,
  LobbyError,
  LobbySnapshotSchema,
  markConnection,
  MatchError,
  parseClientMessage,
  removePlayer,
  sanitizeNickname,
  startPrivateLobby,
  submitRoundResult,
} from "@klaeff/protocol";
import type {
  AvatarSeed,
  ClientMessage,
  DeviceUuid,
  Lobby,
  LobbyId,
  Match,
  MatchId,
  Player,
  PlayerId,
  ServerMessage,
} from "@klaeff/protocol";
import type { z } from "zod";

const PUBLIC_QUEUE_MODE = "public" as const;

export interface GameServerOptions {
  readonly roundTimeoutMs?: number;
  readonly countdownMs?: number;
  readonly tickIntervalMs?: number;
  readonly disconnectGraceMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly levelBroadcastMinIntervalMs?: number;
  readonly maxEnvelopeHistoryPerPlayer?: number;
  readonly idleLobbyGcMs?: number;
  readonly now?: () => number;
}

interface ServerSession {
  playerId: PlayerId;
  sessionToken: string;
  deviceUuid: DeviceUuid;
  ws: WebSocket | null;
  lastPongAt: number;
  disconnectGraceTimer: ReturnType<typeof setTimeout> | null;
}

interface RoundTimer {
  matchId: MatchId;
  roundIndex: number;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_CALIBRATION: CalibrationProfile = {
  noiseFloorDbfs: -50,
  refVoiceDbfs: -30,
  maxObservedDbfs: -3,
  headroomDb: 47,
  agcActive: false,
  calibratedAt: 0,
};

/**
 * Haelt den gesamten Match-State in-memory (siehe Auftrag: keine Datenbank).
 * Eine Instanz pro Prozess im Produktivbetrieb (ueber getGameServer()), aber
 * fuer Tests koennen beliebig viele isolierte Instanzen mit kurzen Timeouts
 * erzeugt werden.
 */
export class GameServer {
  private readonly options: Required<GameServerOptions>;
  private readonly startedAt: number;

  private readonly sessionsByToken = new Map<string, ServerSession>();
  private readonly sessionsByPlayerId = new Map<PlayerId, ServerSession>();
  private readonly lobbies = new Map<LobbyId, Lobby>();
  private readonly matches = new Map<MatchId, Match>();
  private readonly lobbyIdByPlayerId = new Map<PlayerId, LobbyId>();
  private readonly matchIdByLobbyId = new Map<LobbyId, MatchId>();
  private readonly calibrationByPlayerId = new Map<PlayerId, CalibrationProfile>();
  private readonly envelopeHistoryByPlayerId = new Map<PlayerId, number[][]>();
  private readonly lastLevelBroadcastAt = new Map<PlayerId, number>();
  private readonly roundTimers = new Map<MatchId, RoundTimer>();
  private reportState = createReportState();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: GameServerOptions = {}) {
    this.options = {
      roundTimeoutMs: options.roundTimeoutMs ?? 6_000,
      countdownMs: options.countdownMs ?? 20_000,
      tickIntervalMs: options.tickIntervalMs ?? 1_000,
      disconnectGraceMs: options.disconnectGraceMs ?? 60_000,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 15_000,
      levelBroadcastMinIntervalMs: options.levelBroadcastMinIntervalMs ?? 100,
      maxEnvelopeHistoryPerPlayer: options.maxEnvelopeHistoryPerPlayer ?? 5,
      idleLobbyGcMs: options.idleLobbyGcMs ?? 30 * 60_000,
      now: options.now ?? (() => Date.now()),
    };
    this.startedAt = this.options.now();
  }

  private now(): number {
    return this.options.now();
  }

  // --- Lifecycle ---------------------------------------------------------

  start(): void {
    if (this.tickTimer === null) {
      this.tickTimer = setInterval(() => this.tick(), this.options.tickIntervalMs);
      this.tickTimer.unref?.();
    }
    if (this.heartbeatTimer === null) {
      this.heartbeatTimer = setInterval(() => this.sendHeartbeats(), this.options.heartbeatIntervalMs);
      this.heartbeatTimer.unref?.();
    }
  }

  stop(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const roundTimer of this.roundTimers.values()) {
      clearTimeout(roundTimer.timer);
    }
    for (const session of this.sessionsByToken.values()) {
      if (session.disconnectGraceTimer) {
        clearTimeout(session.disconnectGraceTimer);
      }
    }
  }

  attach(wss: WebSocketServer): void {
    wss.on("connection", (ws) => {
      let session: ServerSession | null = null;

      ws.on("message", (raw) => {
        try {
          const parsed = parseClientMessage(JSON.parse(raw.toString()));
          if (parsed.type === "HELLO" || parsed.type === "RECONNECT") {
            session = this.handleHandshake(ws, parsed, session);
            return;
          }
          if (!session) {
            this.sendRaw(ws, { type: "ERROR", code: "NOT_HANDSHAKED", message: "Erst HELLO oder RECONNECT senden." });
            return;
          }
          this.handleMessage(session, parsed);
        } catch (error) {
          this.sendRaw(ws, {
            type: "ERROR",
            code: "BAD_MESSAGE",
            message: error instanceof Error ? error.message : "Ungueltige Nachricht.",
          });
        }
      });

      ws.on("close", () => {
        if (session) {
          this.handleDisconnect(session);
        }
      });

      ws.on("error", () => {
        // Wird durch das folgende "close"-Event abgeschlossen behandelt.
      });
    });
  }

  health(): { status: "ok"; uptimeSeconds: number; version: string; activeLobbies: number; playerCount: number } {
    return {
      status: "ok",
      uptimeSeconds: Math.floor((this.now() - this.startedAt) / 1000),
      version: process.env.npm_package_version ?? "0.1.0",
      activeLobbies: this.lobbies.size,
      playerCount: this.sessionsByPlayerId.size,
    };
  }

  // --- Handshake -----------------------------------------------------------

  private handleHandshake(
    ws: WebSocket,
    message: Extract<ClientMessage, { type: "HELLO" | "RECONNECT" }>,
    existing: ServerSession | null,
  ): ServerSession {
    if (message.type === "RECONNECT") {
      const found = this.sessionsByToken.get(message.sessionToken);
      if (!found || found.playerId !== message.playerId) {
        this.sendRaw(ws, { type: "ERROR", code: "RECONNECT_FAILED", message: "Sitzung nicht gefunden oder abgelaufen." });
        return existing ?? this.createOrphanSession(ws);
      }
      if (found.disconnectGraceTimer) {
        clearTimeout(found.disconnectGraceTimer);
        found.disconnectGraceTimer = null;
      }
      found.ws = ws;
      found.lastPongAt = this.now();
      this.sendRaw(ws, { type: "WELCOME", playerId: found.playerId, sessionToken: found.sessionToken });

      const lobbyId = this.lobbyIdByPlayerId.get(found.playerId);
      if (lobbyId) {
        const lobby = this.lobbies.get(lobbyId);
        if (lobby) {
          const updated = markConnection(lobby, found.playerId, true, this.now());
          this.lobbies.set(lobbyId, updated);
          this.broadcastToLobby(lobbyId, { type: "LOBBY_STATE", lobby: toSnapshot(updated) });
          this.broadcastToLobby(lobbyId, { type: "PRESENCE_STATUS", playerId: found.playerId, status: "connected" });
        }
      }
      return found;
    }

    const playerId = randomUUID();
    const sessionToken = randomUUID();
    const session: ServerSession = {
      playerId,
      sessionToken,
      deviceUuid: message.deviceUuid,
      ws,
      lastPongAt: this.now(),
      disconnectGraceTimer: null,
    };
    this.sessionsByToken.set(sessionToken, session);
    this.sessionsByPlayerId.set(playerId, session);

    const { nickname, wasBlocked } = sanitizeNickname(message.nickname, hashSeed(playerId));
    this.playerProfiles.set(playerId, { nickname, avatar: message.avatar, deviceUuid: message.deviceUuid });

    this.sendRaw(ws, { type: "WELCOME", playerId, sessionToken });
    this.sendRaw(ws, wasBlocked ? { type: "NICKNAME_REJECTED", fallbackNickname: nickname } : { type: "NICKNAME_ACCEPTED", nickname });

    return session;
  }

  private readonly playerProfiles = new Map<PlayerId, { nickname: string; avatar: AvatarSeed; deviceUuid: DeviceUuid }>();

  private createOrphanSession(ws: WebSocket): ServerSession {
    // Fallback falls ein RECONNECT ohne gueltige Sitzung ankommt: wie ein HELLO behandeln
    // ist hier nicht moeglich (keine Nickname/Avatar-Daten) - Verbindung bleibt ohne Session.
    const playerId = randomUUID();
    const sessionToken = randomUUID();
    return { playerId, sessionToken, deviceUuid: "unknown", ws, lastPongAt: this.now(), disconnectGraceTimer: null };
  }

  // --- Message-Dispatch ------------------------------------------------

  private handleMessage(session: ServerSession, message: ClientMessage): void {
    const now = this.now();

    switch (message.type) {
      case "HELLO":
      case "RECONNECT":
        return; // bereits im Handshake behandelt

      case "SET_NICKNAME": {
        const { nickname, wasBlocked } = sanitizeNickname(message.nickname, hashSeed(session.playerId));
        const profile = this.playerProfiles.get(session.playerId);
        if (profile) {
          profile.nickname = nickname;
        }
        this.sendToSession(session, wasBlocked ? { type: "NICKNAME_REJECTED", fallbackNickname: nickname } : { type: "NICKNAME_ACCEPTED", nickname });
        this.syncLobbyPlayer(session.playerId);
        return;
      }

      case "SET_AVATAR": {
        const profile = this.playerProfiles.get(session.playerId);
        if (profile) {
          profile.avatar = message.avatar;
        }
        this.syncLobbyPlayer(session.playerId);
        return;
      }

      case "QUICKMATCH_JOIN":
        this.handleQuickmatchJoin(session, now);
        return;

      case "QUICKMATCH_LEAVE":
      case "LOBBY_LEAVE":
        this.handleLeaveLobby(session, now);
        return;

      case "LOBBY_CREATE":
        this.handleLobbyCreate(session, now);
        return;

      case "LOBBY_JOIN":
        this.handleLobbyJoin(session, message.code, now);
        return;

      case "LOBBY_KICK":
        this.handleLobbyKick(session, message.targetPlayerId, now);
        return;

      case "LOBBY_START":
        this.handleLobbyStart(session, now);
        return;

      case "LEVEL_UPDATE":
        this.handleLevelUpdate(session, message.level, now);
        return;

      case "CALIBRATION_SUBMIT":
        this.calibrationByPlayerId.set(session.playerId, message.profile);
        return;

      case "BARK_SUBMIT":
        this.handleBarkSubmit(session, message.frames, now);
        return;

      case "EMOTE": {
        const lobbyId = this.lobbyIdByPlayerId.get(session.playerId);
        if (lobbyId) {
          this.broadcastToLobby(lobbyId, { type: "EMOTE_BROADCAST", playerId: session.playerId, emote: message.emote });
        }
        return;
      }

      case "REPORT_PLAYER":
        this.handleReportPlayer(session, message.targetPlayerId, now);
        return;

      case "HEARTBEAT_PONG":
        session.lastPongAt = now;
        return;

      default:
        return;
    }
  }

  // --- Lobby-Flows -------------------------------------------------------

  private buildPlayer(session: ServerSession, now: number): Player {
    const profile = this.playerProfiles.get(session.playerId) ?? {
      nickname: sanitizeNickname("Spieler", hashSeed(session.playerId)).nickname,
      avatar: DEFAULT_AVATAR,
      deviceUuid: session.deviceUuid,
    };
    return {
      id: session.playerId,
      deviceUuid: profile.deviceUuid,
      nickname: profile.nickname,
      avatar: profile.avatar,
      connected: true,
      isHost: false,
      joinedAt: now,
    };
  }

  private handleQuickmatchJoin(session: ServerSession, now: number): void {
    if (this.lobbyIdByPlayerId.has(session.playerId)) {
      return;
    }
    if (isDeviceExcludedFromPublicQueue(this.reportState, session.deviceUuid, now)) {
      this.sendToSession(session, {
        type: "ERROR",
        code: "PUBLIC_QUEUE_EXCLUDED",
        message: "Du wurdest zu oft gemeldet und bist vorerst von der oeffentlichen Schnellsuche ausgeschlossen. Private Lobbys gehen weiterhin.",
      });
      return;
    }

    const openLobby = [...this.lobbies.values()]
      .filter((l) => l.mode === PUBLIC_QUEUE_MODE && (l.phase === "waiting" || l.phase === "countdown") && l.players.length < l.maxPlayers)
      .sort((a, b) => a.createdAt - b.createdAt)[0];

    const lobby = openLobby ?? createPublicLobby(now);
    const player = this.buildPlayer(session, now);

    let updated: Lobby;
    try {
      updated = addPlayer(lobby, player, now);
    } catch (error) {
      this.sendLobbyError(session, error);
      return;
    }

    this.lobbies.set(updated.id, updated);
    this.lobbyIdByPlayerId.set(session.playerId, updated.id);
    this.sendToSession(session, { type: "QUICKMATCH_QUEUED", lobbyId: updated.id });
    this.broadcastToLobby(updated.id, { type: "LOBBY_STATE", lobby: toSnapshot(updated) });
    this.maybeAdvanceLobby(updated.id, now);
  }

  private handleLobbyCreate(session: ServerSession, now: number): void {
    if (this.lobbyIdByPlayerId.has(session.playerId)) {
      return;
    }
    const player = this.buildPlayer(session, now);
    const lobby = createPrivateLobby(player, now);
    this.lobbies.set(lobby.id, lobby);
    this.lobbyIdByPlayerId.set(session.playerId, lobby.id);
    this.broadcastToLobby(lobby.id, { type: "LOBBY_STATE", lobby: toSnapshot(lobby) });
  }

  private handleLobbyJoin(session: ServerSession, code: string, now: number): void {
    if (this.lobbyIdByPlayerId.has(session.playerId)) {
      return;
    }
    const lobby = [...this.lobbies.values()].find((l) => l.mode === "private" && l.code === code.toUpperCase());
    if (!lobby) {
      this.sendToSession(session, { type: "ERROR", code: "LOBBY_NOT_FOUND", message: "Kein Lobby mit diesem Code gefunden." });
      return;
    }
    const player = this.buildPlayer(session, now);
    let updated: Lobby;
    try {
      updated = addPlayer(lobby, player, now);
    } catch (error) {
      this.sendLobbyError(session, error);
      return;
    }
    this.lobbies.set(updated.id, updated);
    this.lobbyIdByPlayerId.set(session.playerId, updated.id);
    this.broadcastToLobby(updated.id, { type: "LOBBY_STATE", lobby: toSnapshot(updated) });
  }

  private handleLeaveLobby(session: ServerSession, now: number): void {
    const lobbyId = this.lobbyIdByPlayerId.get(session.playerId);
    if (!lobbyId) {
      return;
    }
    const lobby = this.lobbies.get(lobbyId);
    this.lobbyIdByPlayerId.delete(session.playerId);
    if (!lobby) {
      return;
    }
    const updated = removePlayer(lobby, session.playerId, now);
    if (updated.players.length === 0) {
      this.lobbies.delete(lobbyId);
      this.matchIdByLobbyId.delete(lobbyId);
    } else {
      this.lobbies.set(lobbyId, updated);
      this.broadcastToLobby(lobbyId, { type: "LOBBY_STATE", lobby: toSnapshot(updated) });
    }
  }

  private handleLobbyKick(session: ServerSession, targetPlayerId: PlayerId, now: number): void {
    const lobbyId = this.lobbyIdByPlayerId.get(session.playerId);
    const lobby = lobbyId ? this.lobbies.get(lobbyId) : undefined;
    if (!lobby) {
      return;
    }
    let updated: Lobby;
    try {
      updated = kickPlayer(lobby, session.playerId, targetPlayerId, now);
    } catch (error) {
      this.sendLobbyError(session, error);
      return;
    }
    this.lobbies.set(lobby.id, updated);
    this.lobbyIdByPlayerId.delete(targetPlayerId);
    const targetSession = this.sessionsByPlayerId.get(targetPlayerId);
    if (targetSession) {
      this.sendToSession(targetSession, { type: "ERROR", code: "KICKED", message: "Du wurdest vom Host aus der Lobby entfernt." });
    }
    this.broadcastToLobby(lobby.id, { type: "LOBBY_STATE", lobby: toSnapshot(updated) });
  }

  private handleLobbyStart(session: ServerSession, now: number): void {
    const lobbyId = this.lobbyIdByPlayerId.get(session.playerId);
    const lobby = lobbyId ? this.lobbies.get(lobbyId) : undefined;
    if (!lobby) {
      return;
    }
    let updated: Lobby;
    try {
      updated = startPrivateLobby(lobby, session.playerId, now);
    } catch (error) {
      this.sendLobbyError(session, error);
      return;
    }
    this.lobbies.set(lobby.id, updated);
    this.startMatchForLobby(updated, now);
  }

  private handleLevelUpdate(session: ServerSession, level: number, now: number): void {
    const lobbyId = this.lobbyIdByPlayerId.get(session.playerId);
    if (!lobbyId) {
      return;
    }
    const last = this.lastLevelBroadcastAt.get(session.playerId) ?? 0;
    if (now - last < this.options.levelBroadcastMinIntervalMs) {
      return;
    }
    this.lastLevelBroadcastAt.set(session.playerId, now);
    this.broadcastToLobby(lobbyId, { type: "LEVEL_BROADCAST", playerId: session.playerId, level });
  }

  private handleReportPlayer(session: ServerSession, targetPlayerId: PlayerId, now: number): void {
    const lobbyId = this.lobbyIdByPlayerId.get(session.playerId);
    const targetSession = this.sessionsByPlayerId.get(targetPlayerId);
    if (!lobbyId || !targetSession) {
      return;
    }
    this.reportState = addReport(this.reportState, {
      reporterId: session.playerId,
      targetDeviceUuid: targetSession.deviceUuid,
      lobbyId,
      at: now,
    });
    this.sendToSession(session, { type: "REPORT_ACK" });
  }

  private syncLobbyPlayer(playerId: PlayerId): void {
    const lobbyId = this.lobbyIdByPlayerId.get(playerId);
    if (!lobbyId) {
      return;
    }
    const lobby = this.lobbies.get(lobbyId);
    const profile = this.playerProfiles.get(playerId);
    if (!lobby || !profile) {
      return;
    }
    const updated: Lobby = {
      ...lobby,
      players: lobby.players.map((p) => (p.id === playerId ? { ...p, nickname: profile.nickname, avatar: profile.avatar } : p)),
    };
    this.lobbies.set(lobbyId, updated);
    this.broadcastToLobby(lobbyId, { type: "LOBBY_STATE", lobby: toSnapshot(updated) });
  }

  // --- Match-Flows -------------------------------------------------------

  private maybeAdvanceLobby(lobbyId: LobbyId, now: number): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      return;
    }
    const ticked = evaluateCountdown(lobby, now, this.options.countdownMs);
    if (ticked !== lobby) {
      this.lobbies.set(lobbyId, ticked);
      this.broadcastToLobby(lobbyId, { type: "LOBBY_STATE", lobby: toSnapshot(ticked) });
      if (ticked.phase === "countdown") {
        this.broadcastToLobby(lobbyId, { type: "COUNTDOWN_UPDATE", secondsRemaining: Math.ceil((ticked.countdownEndsAt! - now) / 1000) });
      }
      if (ticked.phase === "in-progress") {
        this.startMatchForLobby(ticked, now);
      }
    }
  }

  private startMatchForLobby(lobby: Lobby, now: number): void {
    const match = createMatch(lobby, now);
    this.matches.set(match.id, match);
    this.matchIdByLobbyId.set(lobby.id, match.id);
    this.broadcastToLobby(lobby.id, { type: "MATCH_STARTED", matchId: match.id, playerOrder: [...match.playerOrder] });
    this.startRound(match, lobby.id);
  }

  private startRound(match: Match, lobbyId: LobbyId): void {
    const barkerId = currentBarker(match);
    if (barkerId === null) {
      return;
    }
    const windowMs = 3_000;
    this.broadcastToLobby(lobbyId, {
      type: "ROUND_STARTED",
      roundIndex: match.currentRoundIndex,
      barkerPlayerId: barkerId,
      windowMs,
    });

    const existingTimer = this.roundTimers.get(match.id);
    if (existingTimer) {
      clearTimeout(existingTimer.timer);
    }
    const timer = setTimeout(() => {
      this.handleRoundTimeout(match.id, match.currentRoundIndex, lobbyId);
    }, this.options.roundTimeoutMs);
    timer.unref?.();
    this.roundTimers.set(match.id, { matchId: match.id, roundIndex: match.currentRoundIndex, timer });
  }

  private handleRoundTimeout(matchId: MatchId, roundIndex: number, lobbyId: LobbyId): void {
    const match = this.matches.get(matchId);
    if (!match || match.currentRoundIndex !== roundIndex || match.phase === "finished") {
      return;
    }
    const barkerId = currentBarker(match);
    if (barkerId === null) {
      return;
    }
    this.finalizeRound(match, lobbyId, barkerId, [], DEFAULT_CALIBRATION, this.now());
  }

  private handleBarkSubmit(session: ServerSession, framesInput: readonly AudioFrame[], now: number): void {
    const lobbyId = this.lobbyIdByPlayerId.get(session.playerId);
    const matchId = lobbyId ? this.matchIdByLobbyId.get(lobbyId) : undefined;
    const match = matchId ? this.matches.get(matchId) : undefined;
    if (!lobbyId || !match) {
      return;
    }
    if (currentBarker(match) !== session.playerId) {
      this.sendToSession(session, { type: "ERROR", code: "NOT_YOUR_TURN", message: "Du bist gerade nicht an der Reihe." });
      return;
    }
    const timer = this.roundTimers.get(match.id);
    if (timer) {
      clearTimeout(timer.timer);
      this.roundTimers.delete(match.id);
    }
    const calibration = this.calibrationByPlayerId.get(session.playerId) ?? DEFAULT_CALIBRATION;
    this.finalizeRound(match, lobbyId, session.playerId, framesInput, calibration, now);
  }

  private finalizeRound(
    match: Match,
    lobbyId: LobbyId,
    playerId: PlayerId,
    frames: readonly AudioFrame[],
    calibration: CalibrationProfile,
    now: number,
  ): void {
    const history = this.envelopeHistoryByPlayerId.get(playerId) ?? [];
    const score = scoreBark(frames, calibration, { previousRoundEnvelopes: history });

    const envelope = frames.map((f) => f.rmsDbfs);
    const nextHistory = [...history, envelope].slice(-this.options.maxEnvelopeHistoryPerPlayer);
    this.envelopeHistoryByPlayerId.set(playerId, nextHistory);

    let updatedMatch: Match;
    try {
      updatedMatch = submitRoundResult(match, { playerId, roundIndex: match.currentRoundIndex, score, calibration }, now);
    } catch (error) {
      if (error instanceof MatchError) {
        return;
      }
      throw error;
    }
    this.matches.set(updatedMatch.id, updatedMatch);

    this.broadcastToLobby(lobbyId, { type: "ROUND_RESULT", roundIndex: match.currentRoundIndex, playerId, score: toWireScore(score) });
    if (score.flags.length > 0) {
      this.broadcastToLobby(lobbyId, { type: "FLAG_BROADCAST", playerId, flags: [...score.flags] });
    }

    if (isMatchFinished(updatedMatch)) {
      const standings = computeStandings(updatedMatch).map((s) => ({
        playerId: s.playerId,
        rank: s.rank,
        score: s.result ? toWireScore(s.result.score) : null,
      }));
      this.broadcastToLobby(lobbyId, { type: "MATCH_RESULT", standings });
      const lobby = this.lobbies.get(lobbyId);
      if (lobby) {
        this.lobbies.set(lobbyId, { ...lobby, phase: "finished", updatedAt: now });
      }
      this.roundTimers.delete(updatedMatch.id);
    } else {
      this.startRound(updatedMatch, lobbyId);
    }
  }

  // --- Verbindung / Reconnect ---------------------------------------------

  private handleDisconnect(session: ServerSession): void {
    session.ws = null;
    const lobbyId = this.lobbyIdByPlayerId.get(session.playerId);
    if (lobbyId) {
      const lobby = this.lobbies.get(lobbyId);
      if (lobby) {
        const updated = markConnection(lobby, session.playerId, false, this.now());
        this.lobbies.set(lobbyId, updated);
        this.broadcastToLobby(lobbyId, { type: "PRESENCE_STATUS", playerId: session.playerId, status: "reconnecting" });
      }
    }

    session.disconnectGraceTimer = setTimeout(() => {
      this.finalizeDisconnect(session);
    }, this.options.disconnectGraceMs);
    session.disconnectGraceTimer.unref?.();
  }

  private finalizeDisconnect(session: ServerSession): void {
    const lobbyId = this.lobbyIdByPlayerId.get(session.playerId);
    this.lobbyIdByPlayerId.delete(session.playerId);
    this.sessionsByPlayerId.delete(session.playerId);
    this.sessionsByToken.delete(session.sessionToken);
    this.playerProfiles.delete(session.playerId);

    if (lobbyId) {
      const lobby = this.lobbies.get(lobbyId);
      if (lobby) {
        const updated = removePlayer(lobby, session.playerId, this.now());
        if (updated.players.length === 0) {
          this.lobbies.delete(lobbyId);
          this.matchIdByLobbyId.delete(lobbyId);
        } else {
          this.lobbies.set(lobbyId, updated);
          this.broadcastToLobby(lobbyId, { type: "LOBBY_STATE", lobby: toSnapshot(updated) });
          this.broadcastToLobby(lobbyId, { type: "PRESENCE_STATUS", playerId: session.playerId, status: "disconnected" });
        }
      }
    }
  }

  private sendHeartbeats(): void {
    for (const session of this.sessionsByToken.values()) {
      this.sendToSession(session, { type: "HEARTBEAT_PING" });
    }
  }

  // --- Tick / GC -----------------------------------------------------------

  private tick(): void {
    const now = this.now();
    for (const lobbyId of [...this.lobbies.keys()]) {
      this.maybeAdvanceLobby(lobbyId, now);
    }
    this.garbageCollectIdleLobbies(now);
  }

  private garbageCollectIdleLobbies(now: number): void {
    for (const [id, lobby] of this.lobbies) {
      const idleFor = now - lobby.updatedAt;
      const shouldGc =
        (lobby.players.length === 0 && idleFor > 1_000) || (lobby.phase === "finished" && idleFor > this.options.idleLobbyGcMs);
      if (shouldGc) {
        this.lobbies.delete(id);
        this.matchIdByLobbyId.delete(id);
      }
    }
  }

  // --- Utilities -----------------------------------------------------------

  private broadcastToLobby(lobbyId: LobbyId, message: ServerMessage): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      return;
    }
    for (const player of lobby.players) {
      const session = this.sessionsByPlayerId.get(player.id);
      if (session) {
        this.sendToSession(session, message);
      }
    }
  }

  private sendToSession(session: ServerSession, message: ServerMessage): void {
    this.sendRaw(session.ws, message);
  }

  private sendRaw(ws: WebSocket | null, message: ServerMessage): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendLobbyError(session: ServerSession, error: unknown): void {
    if (error instanceof LobbyError) {
      this.sendToSession(session, { type: "ERROR", code: error.code, message: lobbyErrorMessage(error.code) });
    } else {
      throw error;
    }
  }
}

const DEFAULT_AVATAR: AvatarSeed = {
  headShape: 0,
  ears: 0,
  furColor: 0,
  furPattern: 0,
  eyes: 0,
  snout: 0,
  collarColor: 0,
  collarCharm: 0,
  accessory: 0,
  idleSeed: 1,
};

function toSnapshot(lobby: Lobby): z.infer<typeof LobbySnapshotSchema> {
  return {
    id: lobby.id,
    code: lobby.code,
    mode: lobby.mode,
    phase: lobby.phase,
    players: lobby.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: { ...p.avatar },
      connected: p.connected,
      isHost: p.isHost,
      joinedAt: p.joinedAt,
    })),
    hostId: lobby.hostId,
    maxPlayers: lobby.maxPlayers,
    minPlayersToStart: lobby.minPlayersToStart,
    countdownEndsAt: lobby.countdownEndsAt,
  };
}

function toWireScore(score: BarkScore): z.infer<typeof BarkScoreSchema> {
  return { ...score, flags: [...score.flags] };
}

function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

function lobbyErrorMessage(code: string): string {
  switch (code) {
    case "LOBBY_FULL":
      return "Die Lobby ist voll.";
    case "LOBBY_NOT_WAITING":
      return "Die Lobby laeuft bereits oder ist beendet.";
    case "NOT_HOST":
      return "Nur der Host darf das.";
    case "PLAYER_NOT_FOUND":
      return "Spieler nicht gefunden.";
    case "ALREADY_JOINED":
      return "Du bist bereits in dieser Lobby.";
    case "NOT_ENOUGH_PLAYERS":
      return "Nicht genug Spieler zum Starten.";
    default:
      return "Unbekannter Fehler.";
  }
}

declare global {
  var __klaeffGameServer: GameServer | undefined;
}

export function getGameServer(): GameServer {
  if (!globalThis.__klaeffGameServer) {
    globalThis.__klaeffGameServer = new GameServer();
    globalThis.__klaeffGameServer.start();
  }
  return globalThis.__klaeffGameServer;
}

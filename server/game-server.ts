import { randomUUID } from "node:crypto";
import { WebSocket, type WebSocketServer } from "ws";
import {
  computeLiveIntensity,
  generateSyntheticBarkFrames,
  type AntiCheatFlag,
  type AudioFrame,
  type BotDifficulty,
  type CalibrationProfile,
} from "@klaeff/scoring";
import {
  addBotToLobby,
  addPlayer,
  addReport,
  advanceBracket,
  applyLiveTick,
  computeLiveStandings,
  createBotPlayer,
  createBracket,
  createCarouselLobby,
  createCarouselState,
  createLiveMatch,
  createPrivateLobby,
  createReportState,
  dequeueFromCarousel,
  enqueueForCarousel,
  isBotPlayer,
  isCurrentRoundComplete,
  isDeviceExcludedFromPublicQueue,
  isLiveMatchFinished,
  isQueued,
  kickPlayer,
  LobbyError,
  nextUndecidedMatchup,
  parseClientMessage,
  randomBotDifficulty,
  recordMatchupResult,
  removePlayer,
  ropePositionOf,
  RUDEL_LIVE_DURATION_MS,
  sanitizeNickname,
  setAudioMode,
  setMatchMode,
  setMaxPlayers,
  startPrivateLobby,
  TUG_OF_WAR_LIVE_THRESHOLD,
  TUG_OF_WAR_SUDDEN_DEATH_MS,
  tryPairNext,
} from "@klaeff/protocol";
import type {
  AudioMode,
  AvatarSeed,
  BracketState,
  ClientMessage,
  DeviceUuid,
  Lobby,
  LobbyId,
  LiveMatchState,
  LiveMatchStyle,
  MatchId,
  Player,
  PlayerId,
  PrivateMatchMode,
  ServerMessage,
} from "@klaeff/protocol";

type MatchKind = "carousel" | "duell" | "rudel" | "bracket";

function matchStyleForKind(kind: MatchKind): LiveMatchStyle {
  return kind === "rudel" ? "rudel" : "tugofwar";
}

/** Frame-Intervall fuer synthetische Bot-Frames - identisch zu FRAME_INTERVAL_MS in packages/scoring/src/bot.ts (dort nicht exportiert). */
const BOT_FRAME_INTERVAL_MS = 20;

export interface GameServerOptions {
  /** Intervall, in dem ein laufendes Live-Match seine Intensitaet akkumuliert und LIVE_MATCH_UPDATE broadcastet, siehe live-match.ts. */
  readonly liveTickIntervalMs?: number;
  readonly tickIntervalMs?: number;
  readonly disconnectGraceMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly levelBroadcastMinIntervalMs?: number;
  readonly idleLobbyGcMs?: number;
  /** Wartet ein Spieler im Kläffkarussell so lange ohne menschlichen Gegner, wird er mit einem Bot gepaart, siehe Auftrag. */
  readonly botFallbackMs?: number;
  /** Nur fuer Tests gedacht (schnellere Matches) - im Produktivbetrieb immer der Standardwert aus live-match.ts. */
  readonly tugOfWarThreshold?: number;
  readonly tugOfWarSuddenDeathMs?: number;
  readonly rudelDurationMs?: number;
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

/** Fortlaufender Zustand eines Bot-Frame-Stroms fuer genau ein laufendes Match, siehe nextBotFrames unten. */
interface BotStreamState {
  frames: AudioFrame[];
  cursor: number;
  cycleIndex: number;
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
  private readonly matches = new Map<MatchId, LiveMatchState>();
  private readonly matchKindByMatchId = new Map<MatchId, MatchKind>();
  private readonly lobbyIdByPlayerId = new Map<PlayerId, LobbyId>();
  private readonly matchIdByLobbyId = new Map<LobbyId, MatchId>();
  private readonly bracketByLobbyId = new Map<LobbyId, BracketState>();
  private readonly currentMatchupByLobbyId = new Map<LobbyId, string>();
  private readonly calibrationByPlayerId = new Map<PlayerId, CalibrationProfile>();
  private readonly lastLevelBroadcastAt = new Map<PlayerId, number>();
  private readonly tickIntervalsByMatchId = new Map<MatchId, ReturnType<typeof setInterval>>();
  /** Rollierender Frame-Puffer pro Spieler - befuellt durch BARK_FRAME, geleert bei jedem Live-Tick (siehe runLiveTick). Existiert nur, waehrend der Spieler an einem laufenden Match teilnimmt. */
  private readonly frameBufferByPlayerId = new Map<PlayerId, AudioFrame[]>();
  /** Kontinuierlicher Bark/Pause-Strom pro Bot innerhalb eines Matches, siehe nextBotFrames. Key: `${matchId}:${playerId}`. */
  private readonly botStreamByKey = new Map<string, BotStreamState>();
  private readonly playerProfiles = new Map<PlayerId, { nickname: string; avatar: AvatarSeed; deviceUuid: DeviceUuid }>();
  private carouselState = createCarouselState();
  private reportState = createReportState();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: GameServerOptions = {}) {
    this.options = {
      liveTickIntervalMs: options.liveTickIntervalMs ?? 150,
      tickIntervalMs: options.tickIntervalMs ?? 1_000,
      disconnectGraceMs: options.disconnectGraceMs ?? 60_000,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 15_000,
      levelBroadcastMinIntervalMs: options.levelBroadcastMinIntervalMs ?? 100,
      idleLobbyGcMs: options.idleLobbyGcMs ?? 30 * 60_000,
      botFallbackMs: options.botFallbackMs ?? 6_000,
      tugOfWarThreshold: options.tugOfWarThreshold ?? TUG_OF_WAR_LIVE_THRESHOLD,
      tugOfWarSuddenDeathMs: options.tugOfWarSuddenDeathMs ?? TUG_OF_WAR_SUDDEN_DEATH_MS,
      rudelDurationMs: options.rudelDurationMs ?? RUDEL_LIVE_DURATION_MS,
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
    for (const interval of this.tickIntervalsByMatchId.values()) {
      clearInterval(interval);
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

  health(): {
    status: "ok";
    uptimeSeconds: number;
    version: string;
    activeLobbies: number;
    playerCount: number;
    carouselQueueSize: number;
  } {
    return {
      status: "ok",
      uptimeSeconds: Math.floor((this.now() - this.startedAt) / 1000),
      version: process.env.npm_package_version ?? "0.1.0",
      activeLobbies: this.lobbies.size,
      playerCount: this.sessionsByPlayerId.size,
      carouselQueueSize: this.carouselState.queue.length,
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

      case "CAROUSEL_JOIN":
        this.handleCarouselJoin(session, now);
        return;

      case "CAROUSEL_LEAVE":
        this.handleCarouselLeave(session);
        return;

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

      case "LOBBY_ADD_BOT":
        this.handleLobbyAddBot(session, message.difficulty, now);
        return;

      case "LOBBY_SET_MAX_PLAYERS":
        this.withOwnLobby(session, (lobby) => setMaxPlayers(lobby, session.playerId, message.maxPlayers, now));
        return;

      case "LOBBY_SET_MATCH_MODE":
        this.withOwnLobby(session, (lobby) => setMatchMode(lobby, session.playerId, message.matchMode, now));
        return;

      case "LOBBY_SET_AUDIO_MODE":
        this.withOwnLobby(session, (lobby) => setAudioMode(lobby, session.playerId, message.audioMode, now));
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

      case "BARK_FRAME":
        this.handleBarkFrame(session, message.frame);
        return;

      case "AUDIO_BLOB_SUBMIT":
        this.handleAudioBlobSubmit(session, message);
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

  /** Hilfsfunktion fuer die drei Host-Einstellungs-Nachrichten (Modus/Ton/Spielerzahl). */
  private withOwnLobby(session: ServerSession, apply: (lobby: Lobby) => Lobby): void {
    const lobbyId = this.lobbyIdByPlayerId.get(session.playerId);
    const lobby = lobbyId ? this.lobbies.get(lobbyId) : undefined;
    if (!lobby) {
      return;
    }
    let updated: Lobby;
    try {
      updated = apply(lobby);
    } catch (error) {
      this.sendLobbyError(session, error);
      return;
    }
    this.lobbies.set(lobby.id, updated);
    this.broadcastToLobby(lobby.id, { type: "LOBBY_STATE", lobby: toSnapshot(updated) });
  }

  // --- Kläffkarussell ------------------------------------------------------

  private handleCarouselJoin(session: ServerSession, now: number): void {
    const existingLobbyId = this.lobbyIdByPlayerId.get(session.playerId);
    if (existingLobbyId) {
      const existingLobby = this.lobbies.get(existingLobbyId);
      if (existingLobby && existingLobby.phase !== "finished") {
        return; // noch in einer laufenden Begegnung
      }
      // Vorherige, bereits beendete Kläffkarussell-Begegnung verlassen, bevor neu eingereiht wird.
      this.lobbyIdByPlayerId.delete(session.playerId);
    }
    if (isQueued(this.carouselState, session.playerId)) {
      return;
    }
    if (isDeviceExcludedFromPublicQueue(this.reportState, session.deviceUuid, now)) {
      this.sendToSession(session, {
        type: "ERROR",
        code: "CAROUSEL_EXCLUDED",
        message: "Du wurdest zu oft gemeldet und bist vorerst vom Kläffkarussell ausgeschlossen. Private Lobbys gehen weiterhin.",
      });
      return;
    }

    const player = this.buildPlayer(session, now);
    this.carouselState = enqueueForCarousel(this.carouselState, player, now);
    this.sendToSession(session, { type: "CAROUSEL_QUEUED" });
    this.advanceCarousel(now);
  }

  private handleCarouselLeave(session: ServerSession): void {
    this.carouselState = dequeueFromCarousel(this.carouselState, session.playerId);
    const lobbyId = this.lobbyIdByPlayerId.get(session.playerId);
    if (!lobbyId) {
      return;
    }
    const lobby = this.lobbies.get(lobbyId);
    if (lobby && lobby.mode === "carousel") {
      this.lobbyIdByPlayerId.delete(session.playerId);
    }
  }

  private advanceCarousel(now: number): void {
    for (;;) {
      const result = tryPairNext(this.carouselState, now);
      this.carouselState = result.state;
      if (!result.lobby) {
        return;
      }
      const lobby = result.lobby;
      this.lobbies.set(lobby.id, lobby);
      for (const player of lobby.players) {
        this.lobbyIdByPlayerId.set(player.id, lobby.id);
      }
      this.broadcastToLobby(lobby.id, { type: "LOBBY_STATE", lobby: toSnapshot(lobby) });
      const [a, b] = lobby.players.map((p) => p.id);
      if (a && b) {
        this.beginMatch(lobby.id, [a, b], "carousel", now);
      }
    }
  }

  /**
   * Wartet ein Spieler im Kläffkarussell laenger als botFallbackMs ohne
   * menschlichen Gegner (kein zweiter Wartender), wird er automatisch mit
   * einem Bot zufaelliger Schwierigkeit gepaart - siehe Auftrag. Laeuft
   * ueber denselben Lobby-/Match-Aufbau wie eine normale Paarung
   * (advanceCarousel oben), nur mit einem synthetischen zweiten Spieler.
   */
  private pairStaleCarouselEntriesWithBots(now: number): void {
    const staleEntries = this.carouselState.queue.filter((entry) => now - entry.queuedAt >= this.options.botFallbackMs);
    for (const entry of staleEntries) {
      // Erneut pruefen: die Schleife unten kann einen Spieler bereits im
      // vorigen Durchlauf verpaart haben (dequeueFromCarousel darunter).
      if (!isQueued(this.carouselState, entry.player.id)) {
        continue;
      }
      this.carouselState = dequeueFromCarousel(this.carouselState, entry.player.id);
      const bot = createBotPlayer(randomBotDifficulty(), now);
      const lobby = createCarouselLobby(entry.player, bot, now);
      this.lobbies.set(lobby.id, lobby);
      this.lobbyIdByPlayerId.set(entry.player.id, lobby.id);
      this.lobbyIdByPlayerId.set(bot.id, lobby.id);
      this.broadcastToLobby(lobby.id, { type: "LOBBY_STATE", lobby: toSnapshot(lobby) });
      this.beginMatch(lobby.id, [entry.player.id, bot.id], "carousel", now);
    }
  }

  // --- Private Lobby -------------------------------------------------------

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
      this.bracketByLobbyId.delete(lobbyId);
      this.currentMatchupByLobbyId.delete(lobbyId);
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

  /** Host fuegt einen Bot in einen freien Slot ein, siehe Auftrag. Entfernen laeuft ueber das bestehende LOBBY_KICK. */
  private handleLobbyAddBot(session: ServerSession, difficulty: BotDifficulty, now: number): void {
    const lobbyId = this.lobbyIdByPlayerId.get(session.playerId);
    const lobby = lobbyId ? this.lobbies.get(lobbyId) : undefined;
    if (!lobby) {
      return;
    }
    const bot = createBotPlayer(difficulty, now);
    let updated: Lobby;
    try {
      updated = addBotToLobby(lobby, session.playerId, bot, now);
    } catch (error) {
      this.sendLobbyError(session, error);
      return;
    }
    this.lobbies.set(lobby.id, updated);
    this.lobbyIdByPlayerId.set(bot.id, lobby.id);
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
    this.broadcastToLobby(lobby.id, { type: "LOBBY_STATE", lobby: toSnapshot(updated) });
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

  private handleBarkFrame(session: ServerSession, frame: AudioFrame): void {
    const lobbyId = this.lobbyIdByPlayerId.get(session.playerId);
    if (!lobbyId) {
      return;
    }
    const lobby = this.lobbies.get(lobbyId);
    // Live-Relay nur noetig, wenn der Empfaenger einen Bark-Synth rendert
    // (Kläffkarussell oder eine private Lobby mit abgeschaltetem "Echter Ton").
    if (lobby && lobby.audioMode === "synth") {
      this.broadcastToLobby(lobbyId, { type: "BARK_FRAME_BROADCAST", playerId: session.playerId, frame });
    }
    // Speist den rollierenden Puffer fuer die laufende Live-Wertung (siehe
    // runLiveTick) - existiert nur, waehrend der Spieler an einem laufenden
    // Match teilnimmt (angelegt in beginMatch, entfernt in finishLiveMatch).
    const buffer = this.frameBufferByPlayerId.get(session.playerId);
    if (buffer) {
      buffer.push(frame);
    }
  }

  private handleAudioBlobSubmit(session: ServerSession, message: Extract<ClientMessage, { type: "AUDIO_BLOB_SUBMIT" }>): void {
    const lobbyId = this.lobbyIdByPlayerId.get(session.playerId);
    if (!lobbyId) {
      return;
    }
    const lobby = this.lobbies.get(lobbyId);
    // Echter Ton ist ausschliesslich in privaten Lobbys mit aktivem
    // "Echter Ton"-Modus erlaubt - harte Sicherheitsgrenze, siehe Auftrag.
    if (!lobby || lobby.mode !== "private" || lobby.audioMode !== "real") {
      return;
    }
    // Bewusst NICHT serverseitig zwischengespeichert (auch nicht kurz): direktes
    // Weiterreichen an die Lobby ist die konservativste Umsetzung von "nur
    // in-memory, nie auf Disk" - siehe BLOCKERS.md.
    this.broadcastToLobby(lobbyId, {
      type: "AUDIO_BLOB_BROADCAST",
      playerId: session.playerId,
      chunkSeq: message.chunkSeq,
      mimeType: message.mimeType,
      dataBase64: message.dataBase64,
    });
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

  /** Waehlt Teilnehmer + Match-Art passend zum Lobby-/Modus-Typ und startet das Live-Match. */
  private startMatchForLobby(lobby: Lobby, now: number): void {
    if (lobby.mode === "private" && lobby.matchMode === "bracket") {
      this.startBracket(lobby, now);
      return;
    }
    const playerIds = lobby.players.map((p) => p.id);
    if (lobby.mode === "carousel") {
      const [a, b] = playerIds;
      if (a && b) {
        this.beginMatch(lobby.id, [a, b], "carousel", now);
      }
      return;
    }
    if (lobby.matchMode === "duell") {
      const [a, b] = playerIds;
      if (a && b) {
        this.beginMatch(lobby.id, [a, b], "duell", now);
      }
      return;
    }
    // "rudel" (auch Fallback, falls matchMode wider Erwarten null waere - lobby.ts
    // laesst startPrivateLobby das aber nie zu): alle gleichzeitig, siehe live-match.ts.
    this.beginMatch(lobby.id, playerIds, "rudel", now);
  }

  private beginMatch(lobbyId: LobbyId, participantIds: readonly PlayerId[], kind: MatchKind, now: number): void {
    const style = matchStyleForKind(kind);
    const match = createLiveMatch(lobbyId, participantIds, style, now);
    this.matches.set(match.id, match);
    this.matchIdByLobbyId.set(lobbyId, match.id);
    this.matchKindByMatchId.set(match.id, kind);
    for (const playerId of participantIds) {
      this.frameBufferByPlayerId.set(playerId, []);
    }
    this.broadcastToLobby(lobbyId, {
      type: "MATCH_STARTED",
      matchId: match.id,
      participantIds: [...participantIds],
      style,
    });
    this.startLiveTick(match.id, lobbyId);
  }

  // --- Live-Tick (kein Knopf, kein Abwechseln - alle bellen durchgehend, siehe Auftrag) --

  private startLiveTick(matchId: MatchId, lobbyId: LobbyId): void {
    const existing = this.tickIntervalsByMatchId.get(matchId);
    if (existing) {
      clearInterval(existing);
    }
    const interval = setInterval(() => this.runLiveTick(matchId, lobbyId), this.options.liveTickIntervalMs);
    interval.unref?.();
    this.tickIntervalsByMatchId.set(matchId, interval);
  }

  private stopLiveTick(matchId: MatchId): void {
    const interval = this.tickIntervalsByMatchId.get(matchId);
    if (interval) {
      clearInterval(interval);
      this.tickIntervalsByMatchId.delete(matchId);
    }
  }

  private runLiveTick(matchId: MatchId, lobbyId: LobbyId): void {
    const match = this.matches.get(matchId);
    const lobby = this.lobbies.get(lobbyId);
    // Lobby verschwunden (z.B. alle Spieler haben verlassen) - Tick beenden
    // statt fuer immer ins Leere zu broadcasten.
    if (!match || match.phase === "finished" || !lobby) {
      this.stopLiveTick(matchId);
      this.matches.delete(matchId);
      return;
    }

    const intensityByPlayer: Record<PlayerId, number> = {};
    const flaggedPlayers: { playerId: PlayerId; flags: readonly AntiCheatFlag[] }[] = [];

    for (const playerId of match.participantIds) {
      const player = lobby.players.find((p) => p.id === playerId);
      const isBot = player ? isBotPlayer(player) : false;
      let frames: readonly AudioFrame[];
      if (isBot && player?.botDifficulty) {
        frames = this.nextBotFrames(matchId, playerId, player.botDifficulty);
      } else {
        frames = this.frameBufferByPlayerId.get(playerId) ?? [];
        this.frameBufferByPlayerId.set(playerId, []);
      }
      const calibration = this.calibrationByPlayerId.get(playerId) ?? DEFAULT_CALIBRATION;
      const { intensity, flags } = computeLiveIntensity(frames, calibration);
      intensityByPlayer[playerId] = intensity;
      if (flags.length > 0) {
        flaggedPlayers.push({ playerId, flags });
      }
    }

    const updated = applyLiveTick(match, intensityByPlayer);
    this.matches.set(matchId, updated);

    for (const { playerId, flags } of flaggedPlayers) {
      this.broadcastToLobby(lobbyId, { type: "FLAG_BROADCAST", playerId, flags: [...flags] });
    }

    this.broadcastToLobby(lobbyId, {
      type: "LIVE_MATCH_UPDATE",
      scores: updated.participantIds.map((playerId) => ({ playerId, cumulativeScore: updated.cumulativeScores[playerId] ?? 0 })),
      ropePosition: ropePositionOf(updated, this.options.tugOfWarThreshold),
    });

    const tuning = {
      tugOfWarThreshold: this.options.tugOfWarThreshold,
      suddenDeathMs: this.options.tugOfWarSuddenDeathMs,
      rudelDurationMs: this.options.rudelDurationMs,
    };
    if (isLiveMatchFinished(updated, this.now(), tuning)) {
      this.finishLiveMatch(matchId, lobbyId, updated, this.now());
    }
  }

  private finishLiveMatch(matchId: MatchId, lobbyId: LobbyId, match: LiveMatchState, now: number): void {
    this.stopLiveTick(matchId);
    const finished: LiveMatchState = { ...match, phase: "finished", finishedAt: now };
    this.matches.set(matchId, finished);
    for (const playerId of match.participantIds) {
      this.frameBufferByPlayerId.delete(playerId);
      this.botStreamByKey.delete(`${matchId}:${playerId}`);
    }
    const kind = this.matchKindByMatchId.get(matchId) ?? "carousel";
    this.matchKindByMatchId.delete(matchId);

    if (kind === "bracket") {
      this.handleBracketMatchupFinished(lobbyId, finished, now);
      return;
    }

    this.broadcastToLobby(lobbyId, { type: "MATCH_RESULT", standings: computeLiveStandings(finished) });
    const lobby = this.lobbies.get(lobbyId);
    if (lobby) {
      this.lobbies.set(lobbyId, { ...lobby, phase: "finished", updatedAt: now });
    }
  }

  /**
   * Erzeugt einen kontinuierlichen Bark/Pause-Strom fuer einen Bot: jede
   * synthetische Bell-Sequenz (siehe generateSyntheticBarkFrames - bereits
   * inklusive Vor-/Nach-Stille) wird als ein Zyklus wiederholt aneinander-
   * gehaengt, mit fortlaufend neuem Seed pro Zyklus fuer natuerliche
   * Variation. Laeuft durch dieselbe, unveraenderte computeLiveIntensity wie
   * echte Spieler - kein zweiter Wertungspfad.
   */
  private nextBotFrames(matchId: MatchId, playerId: PlayerId, difficulty: BotDifficulty): AudioFrame[] {
    const key = `${matchId}:${playerId}`;
    let state = this.botStreamByKey.get(key);
    if (!state) {
      state = { frames: [], cursor: 0, cycleIndex: 0 };
      this.botStreamByKey.set(key, state);
    }
    const framesPerTick = Math.max(1, Math.round(this.options.liveTickIntervalMs / BOT_FRAME_INTERVAL_MS));
    const out: AudioFrame[] = [];
    for (let i = 0; i < framesPerTick; i += 1) {
      if (state.cursor >= state.frames.length) {
        state.frames = generateSyntheticBarkFrames({ seed: `${key}:${state.cycleIndex}`, difficulty });
        state.cycleIndex += 1;
        state.cursor = 0;
      }
      const frame = state.frames[state.cursor];
      if (frame) {
        out.push(frame);
      }
      state.cursor += 1;
    }
    return out;
  }

  // --- Kläffduell (K.-o.-Bracket) ------------------------------------------

  private startBracket(lobby: Lobby, now: number): void {
    const bracket = createBracket(lobby.players.map((p) => p.id));
    this.bracketByLobbyId.set(lobby.id, bracket);
    this.advanceBracketFlow(lobby.id, now);
  }

  private advanceBracketFlow(lobbyId: LobbyId, now: number): void {
    let bracket = this.bracketByLobbyId.get(lobbyId);
    if (!bracket) {
      return;
    }
    if (bracket.champion === null && isCurrentRoundComplete(bracket)) {
      bracket = advanceBracket(bracket);
      this.bracketByLobbyId.set(lobbyId, bracket);
    }

    this.broadcastToLobby(lobbyId, { type: "BRACKET_STATE", matchups: [...bracket.matchups], champion: bracket.champion });

    if (bracket.champion !== null) {
      this.finishBracket(lobbyId, bracket, now);
      return;
    }

    const nextMatchup = nextUndecidedMatchup(bracket);
    if (!nextMatchup || nextMatchup.playerB === null) {
      return;
    }
    this.currentMatchupByLobbyId.set(lobbyId, nextMatchup.id);
    this.beginMatch(lobbyId, [nextMatchup.playerA, nextMatchup.playerB], "bracket", now);
  }

  private handleBracketMatchupFinished(lobbyId: LobbyId, match: LiveMatchState, now: number): void {
    const matchupId = this.currentMatchupByLobbyId.get(lobbyId);
    const bracket = this.bracketByLobbyId.get(lobbyId);
    if (!matchupId || !bracket) {
      return;
    }
    const winnerId = computeLiveStandings(match)[0]?.playerId;
    if (!winnerId) {
      return;
    }
    this.currentMatchupByLobbyId.delete(lobbyId);
    this.bracketByLobbyId.set(lobbyId, recordMatchupResult(bracket, matchupId, winnerId));
    this.advanceBracketFlow(lobbyId, now);
  }

  private finishBracket(lobbyId: LobbyId, bracket: BracketState, now: number): void {
    this.bracketByLobbyId.delete(lobbyId);
    this.currentMatchupByLobbyId.delete(lobbyId);
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      return;
    }
    const placements = computeBracketPlacements(bracket, lobby.players.map((p) => p.id));
    this.broadcastToLobby(lobbyId, {
      type: "MATCH_RESULT",
      // Die Gesamt-Turnierplatzierung ergibt sich aus der K.-o.-Ausscheidungsrunde,
      // nicht aus einem einzelnen cumulativeScore (das gilt nur pro Matchup) -
      // hier bewusst 0, das Ranking selbst steckt in "rank".
      standings: placements.map((p) => ({ playerId: p.playerId, rank: p.rank, cumulativeScore: 0 })),
    });
    this.lobbies.set(lobbyId, { ...lobby, phase: "finished", updatedAt: now });
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
    this.carouselState = dequeueFromCarousel(this.carouselState, session.playerId);

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
          this.bracketByLobbyId.delete(lobbyId);
          this.currentMatchupByLobbyId.delete(lobbyId);
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
    this.pairStaleCarouselEntriesWithBots(now);
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
        this.bracketByLobbyId.delete(id);
        this.currentMatchupByLobbyId.delete(id);
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

function markConnection(lobby: Lobby, playerId: PlayerId, connected: boolean, now: number): Lobby {
  return {
    ...lobby,
    players: lobby.players.map((p) => (p.id === playerId ? { ...p, connected } : p)),
    updatedAt: now,
  };
}

/**
 * Platzierung nach K.-o.-Ausscheidung: Champion zuerst, danach nach der
 * hoechsten erreichten Runde (spaeter ausgeschieden = besserer Platz).
 */
function computeBracketPlacements(bracket: BracketState, allPlayerIds: readonly PlayerId[]): { playerId: PlayerId; rank: number }[] {
  const eliminationRound = new Map<PlayerId, number>();
  for (const matchup of bracket.matchups) {
    if (matchup.winnerId === null || matchup.playerB === null) {
      continue;
    }
    const loser = matchup.playerA === matchup.winnerId ? matchup.playerB : matchup.playerA;
    eliminationRound.set(loser, matchup.round);
  }
  const ranked = allPlayerIds
    .map((playerId) => ({
      playerId,
      isChampion: playerId === bracket.champion,
      round: eliminationRound.get(playerId) ?? 0,
    }))
    .sort((a, b) => Number(b.isChampion) - Number(a.isChampion) || b.round - a.round);
  return ranked.map((entry, index) => ({ playerId: entry.playerId, rank: index + 1 }));
}

function toSnapshot(lobby: Lobby): {
  id: string;
  code: string | null;
  mode: Lobby["mode"];
  phase: Lobby["phase"];
  players: {
    id: string;
    nickname: string;
    avatar: AvatarSeed;
    connected: boolean;
    isHost: boolean;
    joinedAt: number;
    botDifficulty: BotDifficulty | null;
  }[];
  hostId: string | null;
  maxPlayers: number;
  minPlayersToStart: number;
  countdownEndsAt: number | null;
  matchMode: PrivateMatchMode | null;
  audioMode: AudioMode;
} {
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
      botDifficulty: p.botDifficulty ?? null,
    })),
    hostId: lobby.hostId,
    maxPlayers: lobby.maxPlayers,
    minPlayersToStart: lobby.minPlayersToStart,
    countdownEndsAt: lobby.countdownEndsAt,
    matchMode: lobby.matchMode,
    audioMode: lobby.audioMode,
  };
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
    case "MATCH_MODE_REQUIRED":
      return "Der Host muss vorher Kläffduell oder Rudel auswaehlen.";
    case "INVALID_MAX_PLAYERS":
      return "Ungueltige Spielerzahl-Grenze.";
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

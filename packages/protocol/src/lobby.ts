import { generateLobbyCode } from "./lobby-code.js";
import type { AudioMode, Lobby, Player, PlayerId, PrivateMatchMode } from "./types.js";

export const CAROUSEL_PLAYERS = 2;
export const PRIVATE_MAX_PLAYERS = 8;
export const PRIVATE_MIN_PLAYERS = 2;
export const PRIVATE_MIN_TO_START = 2;

export type LobbyErrorCode =
  | "LOBBY_FULL"
  | "LOBBY_NOT_WAITING"
  | "NOT_HOST"
  | "PLAYER_NOT_FOUND"
  | "ALREADY_JOINED"
  | "NOT_ENOUGH_PLAYERS"
  | "MATCH_MODE_REQUIRED"
  | "INVALID_MAX_PLAYERS";

export class LobbyError extends Error {
  constructor(public readonly code: LobbyErrorCode) {
    super(code);
    this.name = "LobbyError";
  }
}

function nextId(prefix: string, rand: () => number): string {
  return `${prefix}_${Math.floor(rand() * 1e12).toString(36)}`;
}

/**
 * Erzeugt eine bereits vollstaendig gepaarte Kläffkarussell-Begegnung aus
 * genau zwei Spielern (kommen fertig aus der Warteschlange, siehe
 * carousel.ts) - kein Warten, kein Countdown, startet direkt "in-progress".
 * Immer Bark-Synth statt echter Stimme (harte Regel, siehe Auftrag).
 */
export function createCarouselLobby(a: Player, b: Player, now: number, rand: () => number = Math.random): Lobby {
  return {
    id: nextId("lobby", rand),
    code: null,
    mode: "carousel",
    phase: "in-progress",
    players: [
      { ...a, isHost: false },
      { ...b, isHost: false },
    ],
    hostId: null,
    maxPlayers: CAROUSEL_PLAYERS,
    minPlayersToStart: CAROUSEL_PLAYERS,
    countdownEndsAt: null,
    matchMode: null,
    audioMode: "synth",
    createdAt: now,
    updatedAt: now,
  };
}

export function createPrivateLobby(host: Player, now: number, rand: () => number = Math.random): Lobby {
  return {
    id: nextId("lobby", rand),
    code: generateLobbyCode(rand),
    mode: "private",
    phase: "waiting",
    players: [{ ...host, isHost: true }],
    hostId: host.id,
    maxPlayers: PRIVATE_MAX_PLAYERS,
    minPlayersToStart: PRIVATE_MIN_TO_START,
    countdownEndsAt: null,
    matchMode: null,
    // "Echter Ton" ist der Standard in privaten Lobbys, siehe Auftrag.
    audioMode: "real",
    createdAt: now,
    updatedAt: now,
  };
}

export function hasRoom(lobby: Lobby): boolean {
  return lobby.players.length < lobby.maxPlayers;
}

export function isJoinable(lobby: Lobby): boolean {
  return lobby.phase === "waiting" && hasRoom(lobby);
}

export function addPlayer(lobby: Lobby, player: Player, now: number): Lobby {
  if (!isJoinable(lobby)) {
    throw new LobbyError(lobby.phase !== "waiting" ? "LOBBY_NOT_WAITING" : "LOBBY_FULL");
  }
  if (lobby.players.some((p) => p.id === player.id)) {
    throw new LobbyError("ALREADY_JOINED");
  }
  const isFirstPlayer = lobby.players.length === 0;
  const nextPlayer: Player = { ...player, isHost: lobby.mode === "private" && isFirstPlayer };
  return {
    ...lobby,
    players: [...lobby.players, nextPlayer],
    hostId: lobby.mode === "private" ? (lobby.hostId ?? player.id) : lobby.hostId,
    updatedAt: now,
  };
}

export function removePlayer(lobby: Lobby, playerId: PlayerId, now: number): Lobby {
  const remaining = lobby.players.filter((p) => p.id !== playerId);
  let hostId = lobby.hostId;
  let players = remaining;

  if (lobby.mode === "private" && lobby.hostId === playerId && remaining.length > 0) {
    // Host verlaesst die Lobby: der laengste anwesende Spieler wird neuer Host.
    const nextHost = [...remaining].sort((a, b) => a.joinedAt - b.joinedAt)[0];
    hostId = nextHost ? nextHost.id : null;
    players = remaining.map((p) => ({ ...p, isHost: p.id === hostId }));
  } else if (lobby.mode === "private" && remaining.length === 0) {
    hostId = null;
  }

  return {
    ...lobby,
    players,
    hostId,
    updatedAt: now,
  };
}

export function kickPlayer(lobby: Lobby, requesterId: PlayerId, targetId: PlayerId, now: number): Lobby {
  if (lobby.mode !== "private" || lobby.hostId !== requesterId) {
    throw new LobbyError("NOT_HOST");
  }
  if (requesterId === targetId) {
    throw new LobbyError("PLAYER_NOT_FOUND");
  }
  if (!lobby.players.some((p) => p.id === targetId)) {
    throw new LobbyError("PLAYER_NOT_FOUND");
  }
  return removePlayer(lobby, targetId, now);
}

/** Host-Einstellung: Spielerzahl-Limit 2..8, nur waehrend "waiting", nie unter die aktuelle Spielerzahl. */
export function setMaxPlayers(lobby: Lobby, requesterId: PlayerId, maxPlayers: number, now: number): Lobby {
  if (lobby.mode !== "private" || lobby.hostId !== requesterId) {
    throw new LobbyError("NOT_HOST");
  }
  if (lobby.phase !== "waiting") {
    throw new LobbyError("LOBBY_NOT_WAITING");
  }
  if (!Number.isInteger(maxPlayers) || maxPlayers < PRIVATE_MIN_PLAYERS || maxPlayers > PRIVATE_MAX_PLAYERS) {
    throw new LobbyError("INVALID_MAX_PLAYERS");
  }
  if (maxPlayers < lobby.players.length) {
    throw new LobbyError("INVALID_MAX_PLAYERS");
  }
  return { ...lobby, maxPlayers, updatedAt: now };
}

/** Host-Einstellung: Kläffduell (Bracket) oder Rudel, relevant ab 3 Spielern (bei 2 immer automatisch Duell). */
export function setMatchMode(lobby: Lobby, requesterId: PlayerId, matchMode: PrivateMatchMode, now: number): Lobby {
  if (lobby.mode !== "private" || lobby.hostId !== requesterId) {
    throw new LobbyError("NOT_HOST");
  }
  if (lobby.phase !== "waiting") {
    throw new LobbyError("LOBBY_NOT_WAITING");
  }
  return { ...lobby, matchMode, updatedAt: now };
}

/** Host-Einstellung: "Echter Ton" (Standard) an-/abschalten, siehe Auftrag. */
export function setAudioMode(lobby: Lobby, requesterId: PlayerId, audioMode: AudioMode, now: number): Lobby {
  if (lobby.mode !== "private" || lobby.hostId !== requesterId) {
    throw new LobbyError("NOT_HOST");
  }
  if (lobby.phase !== "waiting") {
    throw new LobbyError("LOBBY_NOT_WAITING");
  }
  return { ...lobby, audioMode, updatedAt: now };
}

/**
 * Manueller Start durch den Host einer privaten Lobby. Bei genau 2 Spielern
 * ist der Modus immer "duell" (kein Bracket noetig), ab 3 Spielern muss der
 * Host vorher per setMatchMode gewaehlt haben.
 */
export function startPrivateLobby(lobby: Lobby, requesterId: PlayerId, now: number): Lobby {
  if (lobby.mode !== "private" || lobby.hostId !== requesterId) {
    throw new LobbyError("NOT_HOST");
  }
  if (lobby.phase !== "waiting") {
    throw new LobbyError("LOBBY_NOT_WAITING");
  }
  if (lobby.players.length < lobby.minPlayersToStart) {
    throw new LobbyError("NOT_ENOUGH_PLAYERS");
  }
  const matchMode: PrivateMatchMode | null = lobby.players.length === 2 ? "duell" : lobby.matchMode;
  if (matchMode === null) {
    throw new LobbyError("MATCH_MODE_REQUIRED");
  }
  return { ...lobby, phase: "in-progress", matchMode, countdownEndsAt: null, updatedAt: now };
}

export function findPlayer(lobby: Lobby, playerId: PlayerId): Player | undefined {
  return lobby.players.find((p) => p.id === playerId);
}

export function markConnection(lobby: Lobby, playerId: PlayerId, connected: boolean, now: number): Lobby {
  return {
    ...lobby,
    players: lobby.players.map((p) => (p.id === playerId ? { ...p, connected } : p)),
    updatedAt: now,
  };
}

export function isEmpty(lobby: Lobby): boolean {
  return lobby.players.length === 0;
}

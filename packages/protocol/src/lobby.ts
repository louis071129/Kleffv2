import { generateLobbyCode } from "./lobby-code.js";
import type { Lobby, Player, PlayerId } from "./types.js";

export const PUBLIC_MAX_PLAYERS = 6;
export const PUBLIC_MIN_TO_START = 3;
export const PUBLIC_COUNTDOWN_MS = 20_000;
export const PRIVATE_MAX_PLAYERS = 8;
export const PRIVATE_MIN_TO_START = 2;

export type LobbyErrorCode =
  | "LOBBY_FULL"
  | "LOBBY_NOT_WAITING"
  | "NOT_HOST"
  | "PLAYER_NOT_FOUND"
  | "ALREADY_JOINED"
  | "NOT_ENOUGH_PLAYERS";

export class LobbyError extends Error {
  constructor(public readonly code: LobbyErrorCode) {
    super(code);
    this.name = "LobbyError";
  }
}

function nextId(prefix: string, rand: () => number): string {
  return `${prefix}_${Math.floor(rand() * 1e12).toString(36)}`;
}

export function createPublicLobby(now: number, rand: () => number = Math.random): Lobby {
  return {
    id: nextId("lobby", rand),
    code: null,
    mode: "public",
    phase: "waiting",
    players: [],
    hostId: null,
    maxPlayers: PUBLIC_MAX_PLAYERS,
    minPlayersToStart: PUBLIC_MIN_TO_START,
    countdownEndsAt: null,
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
    createdAt: now,
    updatedAt: now,
  };
}

export function hasRoom(lobby: Lobby): boolean {
  return lobby.players.length < lobby.maxPlayers;
}

export function isJoinable(lobby: Lobby): boolean {
  return (lobby.phase === "waiting" || lobby.phase === "countdown") && hasRoom(lobby);
}

/**
 * Fuegt einen Spieler hinzu. Bei Public-Lobbys wird der Countdown NICHT
 * zurueckgesetzt, wenn waehrend "countdown" nachgefuellt wird - nur neu
 * gestartet, wenn vorher noch "waiting" war und jetzt die Mindestzahl
 * erreicht wird (siehe evaluateCountdown).
 */
export function addPlayer(lobby: Lobby, player: Player, now: number): Lobby {
  if (!isJoinable(lobby)) {
    throw new LobbyError(lobby.phase !== "waiting" && lobby.phase !== "countdown" ? "LOBBY_NOT_WAITING" : "LOBBY_FULL");
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

  const shouldResetCountdown =
    lobby.mode === "public" && lobby.phase === "countdown" && players.length < lobby.minPlayersToStart;

  return {
    ...lobby,
    players,
    hostId,
    phase: shouldResetCountdown ? "waiting" : lobby.phase,
    countdownEndsAt: shouldResetCountdown ? null : lobby.countdownEndsAt,
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

/**
 * Reine "Tick"-Funktion fuer Public-Lobbys: startet den 20s-Countdown sobald
 * genug Spieler da sind, und startet das Match wenn der Countdown ablaeuft
 * (sofern immer noch genug Spieler da sind - sonst zurueck auf "waiting").
 */
export function evaluateCountdown(lobby: Lobby, now: number): Lobby {
  if (lobby.mode !== "public") {
    return lobby;
  }

  if (lobby.phase === "waiting" && lobby.players.length >= lobby.minPlayersToStart) {
    return { ...lobby, phase: "countdown", countdownEndsAt: now + PUBLIC_COUNTDOWN_MS, updatedAt: now };
  }

  if (lobby.phase === "countdown" && lobby.countdownEndsAt !== null && now >= lobby.countdownEndsAt) {
    if (lobby.players.length >= lobby.minPlayersToStart) {
      return { ...lobby, phase: "in-progress", countdownEndsAt: null, updatedAt: now };
    }
    return { ...lobby, phase: "waiting", countdownEndsAt: null, updatedAt: now };
  }

  return lobby;
}

/** Manueller Start durch den Host einer privaten Lobby. */
export function startPrivateLobby(lobby: Lobby, requesterId: PlayerId, now: number): Lobby {
  if (lobby.mode !== "private" || lobby.hostId !== requesterId) {
    throw new LobbyError("NOT_HOST");
  }
  if (lobby.phase !== "waiting" && lobby.phase !== "countdown") {
    throw new LobbyError("LOBBY_NOT_WAITING");
  }
  if (lobby.players.length < lobby.minPlayersToStart) {
    throw new LobbyError("NOT_ENOUGH_PLAYERS");
  }
  return { ...lobby, phase: "in-progress", countdownEndsAt: null, updatedAt: now };
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

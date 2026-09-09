import { addPlayer, createPublicLobby, isJoinable, removePlayer } from "./lobby.js";
import type { Lobby, Player, PlayerId } from "./types.js";

export interface MatchmakingState {
  readonly openLobbies: readonly Lobby[];
}

export function createMatchmakingState(): MatchmakingState {
  return { openLobbies: [] };
}

export interface EnqueueResult {
  readonly state: MatchmakingState;
  readonly lobby: Lobby;
}

/**
 * Spieler landen in der aeltesten offenen Lobby mit freiem Platz, sonst wird
 * eine neue eroeffnet. "Offen" heisst: waiting oder countdown, mit Platz.
 */
export function enqueuePlayer(state: MatchmakingState, player: Player, now: number): EnqueueResult {
  const sortedByAge = [...state.openLobbies].sort((a, b) => a.createdAt - b.createdAt);
  const target = sortedByAge.find((lobby) => isJoinable(lobby));

  if (target) {
    const updatedLobby = addPlayer(target, player, now);
    const openLobbies = state.openLobbies.map((lobby) => (lobby.id === target.id ? updatedLobby : lobby));
    return { state: { openLobbies }, lobby: updatedLobby };
  }

  const fresh = createPublicLobby(now);
  const withPlayer = addPlayer(fresh, player, now);
  return { state: { openLobbies: [...state.openLobbies, withPlayer] }, lobby: withPlayer };
}

/** Entfernt einen Spieler aus der Warteschlange (Lobby verlassen, solange sie noch nicht laeuft). */
export function dequeuePlayer(state: MatchmakingState, playerId: PlayerId, now: number): MatchmakingState {
  const openLobbies = state.openLobbies
    .map((lobby) => (lobby.players.some((p) => p.id === playerId) ? removePlayer(lobby, playerId, now) : lobby))
    .filter((lobby) => lobby.players.length > 0 || lobby.phase === "in-progress");
  return { openLobbies };
}

/** Ersetzt eine Lobby im Matchmaking-State (z.B. nach evaluateCountdown-Tick). */
export function updateLobby(state: MatchmakingState, lobby: Lobby): MatchmakingState {
  return { openLobbies: state.openLobbies.map((l) => (l.id === lobby.id ? lobby : l)) };
}

/** Entfernt Lobbys, die gestartet sind oder leer wurden, aus der offenen Warteschlange. */
export function pruneClosedLobbies(state: MatchmakingState): MatchmakingState {
  return { openLobbies: state.openLobbies.filter((lobby) => lobby.phase === "waiting" || lobby.phase === "countdown") };
}

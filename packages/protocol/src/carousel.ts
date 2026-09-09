import { createCarouselLobby } from "./lobby.js";
import type { Lobby, Player, PlayerId } from "./types.js";

export interface CarouselQueueEntry {
  readonly player: Player;
  readonly queuedAt: number;
}

export interface CarouselState {
  readonly queue: readonly CarouselQueueEntry[];
}

export function createCarouselState(): CarouselState {
  return { queue: [] };
}

/** Reiht einen Spieler ein (oder aktualisiert seinen Eintrag, falls er schon wartet). */
export function enqueueForCarousel(state: CarouselState, player: Player, now: number): CarouselState {
  const withoutPlayer = state.queue.filter((e) => e.player.id !== player.id);
  return { queue: [...withoutPlayer, { player, queuedAt: now }] };
}

export function dequeueFromCarousel(state: CarouselState, playerId: PlayerId): CarouselState {
  return { queue: state.queue.filter((e) => e.player.id !== playerId) };
}

export function isQueued(state: CarouselState, playerId: PlayerId): boolean {
  return state.queue.some((e) => e.player.id === playerId);
}

export interface CarouselPairResult {
  readonly state: CarouselState;
  readonly lobby: Lobby | null;
}

/**
 * Paart die zwei am laengsten wartenden Spieler sofort, sobald mindestens
 * zwei in der Warteschlange stehen - kein Countdown, kein Warten auf mehr
 * Spieler (reines 1v1, siehe Auftrag). Gibt {lobby: null} zurueck wenn
 * (noch) niemand gepaart werden kann.
 */
export function tryPairNext(state: CarouselState, now: number, rand: () => number = Math.random): CarouselPairResult {
  if (state.queue.length < 2) {
    return { state, lobby: null };
  }
  const sortedByAge = [...state.queue].sort((a, b) => a.queuedAt - b.queuedAt);
  const [first, second, ...rest] = sortedByAge;
  if (!first || !second) {
    return { state, lobby: null };
  }
  const lobby = createCarouselLobby(first.player, second.player, now, rand);
  return { state: { queue: rest }, lobby };
}

/** Paart wiederholt, bis weniger als zwei Spieler uebrig sind - fuer mehrere gleichzeitig wartende Paare. */
export function pairAll(state: CarouselState, now: number, rand: () => number = Math.random): { state: CarouselState; lobbies: Lobby[] } {
  const lobbies: Lobby[] = [];
  let current = state;
  for (;;) {
    const result = tryPairNext(current, now, rand);
    if (!result.lobby) {
      return { state: result.state, lobbies };
    }
    lobbies.push(result.lobby);
    current = result.state;
  }
}

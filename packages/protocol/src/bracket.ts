import type { PlayerId } from "./types.js";

export interface BracketMatchup {
  readonly id: string;
  readonly round: number;
  readonly playerA: PlayerId;
  /** null = Freilos bei ungerader Spielerzahl - playerA steht sofort als Sieger fest. */
  readonly playerB: PlayerId | null;
  readonly winnerId: PlayerId | null;
}

export interface BracketState {
  readonly matchups: readonly BracketMatchup[];
  readonly champion: PlayerId | null;
}

function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = arr[i];
    const b = arr[j];
    if (a === undefined || b === undefined) {
      continue;
    }
    arr[i] = b;
    arr[j] = a;
  }
  return arr;
}

/** Paart benachbarte Spieler der uebergebenen Reihenfolge, letzter Einzelner bei ungerader Zahl bekommt ein Freilos. */
function pairRound(playerIds: readonly PlayerId[], round: number): BracketMatchup[] {
  const matchups: BracketMatchup[] = [];
  const remaining = [...playerIds];
  let index = 0;
  while (remaining.length > 0) {
    const a = remaining.shift();
    if (a === undefined) {
      break;
    }
    const b = remaining.length > 0 ? (remaining.shift() ?? null) : null;
    matchups.push({ id: `bracket_r${round}_${index}`, round, playerA: a, playerB: b, winnerId: b === null ? a : null });
    index += 1;
  }
  return matchups;
}

/**
 * Erzeugt ein einfaches K.-o.-Bracket (Kläffduell) aus den Spieler-IDs -
 * zufaellig gepaart (Runde 1 gemischt, danach bracket-treu ohne erneutes
 * Mischen). Ungerade Spielerzahl -> ein zufaelliges Freilos pro Runde.
 */
export function createBracket(playerIds: readonly PlayerId[], rand: () => number = Math.random): BracketState {
  if (playerIds.length === 0) {
    return { matchups: [], champion: null };
  }
  if (playerIds.length === 1) {
    return { matchups: [], champion: playerIds[0] ?? null };
  }
  const shuffled = shuffle(playerIds, rand);
  const round1 = pairRound(shuffled, 1);
  return { matchups: round1, champion: null };
}

export function currentRoundMatchups(state: BracketState): BracketMatchup[] {
  if (state.matchups.length === 0) {
    return [];
  }
  const maxRound = Math.max(...state.matchups.map((m) => m.round));
  return state.matchups.filter((m) => m.round === maxRound);
}

export function isCurrentRoundComplete(state: BracketState): boolean {
  const current = currentRoundMatchups(state);
  return current.length > 0 && current.every((m) => m.winnerId !== null);
}

/** Naechstes noch offene Matchup (Freilose zaehlen nicht, deren Sieger steht schon fest). */
export function nextUndecidedMatchup(state: BracketState): BracketMatchup | null {
  return state.matchups.find((m) => m.winnerId === null) ?? null;
}

export function recordMatchupResult(state: BracketState, matchupId: string, winnerId: PlayerId): BracketState {
  return { ...state, matchups: state.matchups.map((m) => (m.id === matchupId ? { ...m, winnerId } : m)) };
}

/**
 * Erzeugt die naechste Runde aus den Gewinnern der aktuellen Runde, sobald
 * diese vollstaendig entschieden ist. Bleibt am Ende genau ein Gewinner
 * uebrig, ist das der Champion und es gibt keine weitere Runde.
 */
export function advanceBracket(state: BracketState): BracketState {
  if (state.champion !== null || !isCurrentRoundComplete(state)) {
    return state;
  }
  const winners = currentRoundMatchups(state)
    .map((m) => m.winnerId)
    .filter((id): id is PlayerId => id !== null);

  if (winners.length <= 1) {
    return { ...state, champion: winners[0] ?? null };
  }

  const maxRound = Math.max(...state.matchups.map((m) => m.round));
  const nextRound = pairRound(winners, maxRound + 1);
  return { ...state, matchups: [...state.matchups, ...nextRound] };
}

import type { Match, PlayerId, RoundResult, Standing } from "./types.js";

/** Seil-Skala reicht von -THRESHOLD (Spieler B fuehrt voll) bis +THRESHOLD (Spieler A). */
export const TUG_OF_WAR_THRESHOLD = 100;
/** Score-Baseline: ein Bark mit genau diesem Total zieht das Seil nicht (neutral). */
export const TUG_OF_WAR_NEUTRAL = 50;
/**
 * Ab dieser Rundenzahl greift der Sudden-Death-Fallback: die erste Runde ab hier,
 * die das Unentschieden bricht (Seilposition != 0), entscheidet das Match - auch
 * ohne dass die Schwelle erreicht wurde. Verhindert Endlos-Matches zwischen sehr
 * gleichwertigen Spielern, ohne je zufaellig zu entscheiden (siehe isTugOfWarDecided).
 */
export const TUG_OF_WAR_SAFETY_ROUNDS = 14;

export interface TugOfWarState {
  /** -THRESHOLD..+THRESHOLD, positiv = playerA (erster in match.playerOrder) fuehrt. */
  readonly ropePosition: number;
  readonly playerA: PlayerId | null;
  readonly playerB: PlayerId | null;
  readonly winnerId: PlayerId | null;
  /** true = durch Erreichen der Schwelle entschieden, false = durch den Sudden-Death-Fallback. */
  readonly decisive: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Berechnet die aktuelle Tauzieh-Seilposition aus den bisherigen Rundenergebnissen
 * eines 2-Spieler-Matches. Jeder Bark "zieht" das Seil um (score.total - NEUTRAL)
 * zur eigenen Seite - ein starker Bark (>50) zieht zu sich, ein schwacher (<50)
 * gibt Boden ab (zieht zur Gegenseite). Rein deterministisch aus echten Scores,
 * nie zufaellig. Dieselbe Funktion laeuft server- UND client-seitig (Server
 * entscheidet autoritativ, Client rendert live dieselbe Rechnung fuer die
 * Seil-Animation), siehe MatchScreen.
 */
export function computeTugOfWarState(match: Match): TugOfWarState {
  const [playerA, playerB] = [...new Set(match.playerOrder)];
  if (!playerA || !playerB) {
    return { ropePosition: 0, playerA: playerA ?? null, playerB: playerB ?? null, winnerId: null, decisive: false };
  }

  let rope = 0;
  for (let i = 0; i < match.results.length; i += 1) {
    const result = match.results[i];
    if (!result) continue;
    const pull = result.score.total - TUG_OF_WAR_NEUTRAL;
    rope += result.playerId === playerA ? pull : -pull;
    rope = clamp(rope, -TUG_OF_WAR_THRESHOLD, TUG_OF_WAR_THRESHOLD);

    if (rope >= TUG_OF_WAR_THRESHOLD) {
      return { ropePosition: TUG_OF_WAR_THRESHOLD, playerA, playerB, winnerId: playerA, decisive: true };
    }
    if (rope <= -TUG_OF_WAR_THRESHOLD) {
      return { ropePosition: -TUG_OF_WAR_THRESHOLD, playerA, playerB, winnerId: playerB, decisive: true };
    }
    if (i + 1 >= TUG_OF_WAR_SAFETY_ROUNDS && rope !== 0) {
      const winnerId = rope > 0 ? playerA : playerB;
      return { ropePosition: rope, playerA, playerB, winnerId, decisive: false };
    }
  }

  return { ropePosition: rope, playerA, playerB, winnerId: null, decisive: false };
}

export function isTugOfWarFinished(match: Match): boolean {
  return computeTugOfWarState(match).winnerId !== null;
}

/**
 * Standings fuer ein entschiedenes Tauzieh-Match: Gewinner Rang 1, Verlierer
 * Rang 2. `result` ist der jeweils letzte Bark des Spielers (fuer die
 * Breakdown-Anzeige) - die eigentliche Entscheidung ist die Seilposition,
 * nicht ein einzelner Score, daher `aggregateTotal` hier immer null.
 */
export function computeTugOfWarStandings(match: Match): Standing[] {
  const state = computeTugOfWarState(match);
  const playerIds = [state.playerA, state.playerB].filter((id): id is PlayerId => id !== null);
  const lastResultByPlayer = new Map<PlayerId, RoundResult>();
  for (const result of match.results) {
    lastResultByPlayer.set(result.playerId, result);
  }
  const winner = state.winnerId;
  const ranked = winner ? [winner, ...playerIds.filter((id) => id !== winner)] : playerIds;
  return ranked.map((playerId, index) => ({
    playerId,
    rank: index + 1,
    result: lastResultByPlayer.get(playerId) ?? null,
    aggregateTotal: null,
  }));
}

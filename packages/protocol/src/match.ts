import { compareBarkScores } from "@klaeff/scoring";
import type { BarkScore } from "@klaeff/scoring";
import type { Lobby, LobbyId, Match, MatchId, PlayerId, RoundResult, Standing } from "./types.js";

export class MatchError extends Error {
  constructor(public readonly code: "NOT_CURRENT_BARKER" | "MATCH_FINISHED" | "NO_PLAYERS") {
    super(code);
    this.name = "MatchError";
  }
}

function nextId(prefix: string, rand: () => number): string {
  return `${prefix}_${Math.floor(rand() * 1e12).toString(36)}`;
}

/**
 * Erzeugt ein Match mit einer explizit vorgegebenen Rundenreihenfolge -
 * Grundlage fuer Duell/Kläffkarussell/Kläffduell-Matchup (Tauzieh, siehe
 * buildDuelPlayerOrder) und Rudel (Spieler mehrfach nacheinander). Fuer den
 * einfachen Fall (jeder genau einmal) siehe createMatch.
 */
export function createMatchWithOrder(
  lobbyId: LobbyId,
  playerOrder: readonly PlayerId[],
  now: number,
  rand: () => number = Math.random,
): Match {
  if (playerOrder.length === 0) {
    throw new MatchError("NO_PLAYERS");
  }
  return {
    id: nextId("match", rand) as MatchId,
    lobbyId,
    playerOrder,
    currentRoundIndex: 0,
    results: [],
    phase: "in-progress",
    startedAt: now,
    finishedAt: null,
  };
}

/** Erzeugt ein Match aus einer gestarteten Lobby. Rundenreihenfolge = Beitrittsreihenfolge. */
export function createMatch(lobby: Lobby, now: number, rand: () => number = Math.random): Match {
  if (lobby.players.length === 0) {
    throw new MatchError("NO_PLAYERS");
  }
  return createMatchWithOrder(
    lobby.id,
    lobby.players.map((p) => p.id),
    now,
    rand,
  );
}

/**
 * Rundenreihenfolge fuer ein Tauzieh (Duell/Kläffkarussell/Kläffduell-
 * Matchup, 2 Spieler): abwechselnd p1,p2 wiederholt fuer `bestOf` Zyklen -
 * bewusst absichtlich lang (siehe TUG_OF_WAR_MAX_CYCLES), das eigentliche
 * Matchende bestimmt nicht das Ausgehen dieser Liste, sondern die
 * Seil-Schwelle (isTugOfWarFinished, siehe tug-of-war.ts).
 */
export function buildDuelPlayerOrder(playerA: PlayerId, playerB: PlayerId, bestOf: number): PlayerId[] {
  const order: PlayerId[] = [];
  for (let i = 0; i < bestOf; i += 1) {
    order.push(playerA, playerB);
  }
  return order;
}

/**
 * Rundenreihenfolge fuer Rudel: alle Spieler nacheinander, das Ganze fuer
 * `cycles` Durchgaenge wiederholt (Standard laut Auftrag: 3 Runden/Zyklen).
 */
export function buildRudelPlayerOrder(playerIds: readonly PlayerId[], cycles: number): PlayerId[] {
  const order: PlayerId[] = [];
  for (let i = 0; i < cycles; i += 1) {
    order.push(...playerIds);
  }
  return order;
}

export function currentBarker(match: Match): PlayerId | null {
  return match.playerOrder[match.currentRoundIndex] ?? null;
}

/** Nimmt das Rundenergebnis des aktuell an der Reihe befindlichen Spielers entgegen. */
export function submitRoundResult(match: Match, result: RoundResult, now: number): Match {
  if (match.phase === "finished") {
    throw new MatchError("MATCH_FINISHED");
  }
  const expected = currentBarker(match);
  if (expected === null || expected !== result.playerId) {
    throw new MatchError("NOT_CURRENT_BARKER");
  }

  const results = [...match.results, result];
  const nextIndex = match.currentRoundIndex + 1;
  const finished = nextIndex >= match.playerOrder.length;

  return {
    ...match,
    results,
    currentRoundIndex: nextIndex,
    phase: finished ? "finished" : "in-progress",
    finishedAt: finished ? now : null,
  };
}

/**
 * Standings fuer den einfachen Fall: jeder Spieler taucht genau einmal in
 * playerOrder auf. Sortiert nach bestem Score, Spieler ohne Ergebnis
 * (Timeout) landen am Ende. Kläffkarussell/Duell/Kläffduell-Matchup nutzen
 * inzwischen computeTugOfWarStandings (siehe tug-of-war.ts) statt dieser
 * Funktion - hier fuer den generischen "jeder genau einmal"-Fall erhalten.
 */
export function computeStandings(match: Match): Standing[] {
  const withResults = match.playerOrder
    .map((playerId) => ({ playerId, result: match.results.find((r) => r.playerId === playerId) ?? null }))
    .sort((a, b) => {
      if (a.result && b.result) {
        return compareBarkScores(b.result.score, a.result.score);
      }
      if (a.result && !b.result) {
        return -1;
      }
      if (!a.result && b.result) {
        return 1;
      }
      return 0;
    });

  return withResults.map((entry, index) => ({
    playerId: entry.playerId,
    rank: index + 1,
    result: entry.result,
    aggregateTotal: null,
  }));
}

/**
 * Standings fuer Rudel (N Spieler, mehrfach nacheinander): Rang nach Summe
 * der Scores ueber alle Zyklen. `result` zeigt das beste Einzelergebnis
 * des Spielers (fuer die Breakdown-Anzeige), `aggregateTotal` die Summe -
 * die eigentlich ranking-relevante Zahl.
 */
export function computeAggregateStandings(match: Match): Standing[] {
  const totals = new Map<PlayerId, number>();
  const bestResultByPlayer = new Map<PlayerId, RoundResult>();

  for (const result of match.results) {
    totals.set(result.playerId, (totals.get(result.playerId) ?? 0) + result.score.total);
    const best = bestResultByPlayer.get(result.playerId);
    if (!best || betterScore(result.score, best.score)) {
      bestResultByPlayer.set(result.playerId, result);
    }
  }

  const playerIds = [...new Set(match.playerOrder)];
  const ranked = playerIds
    .map((playerId) => ({
      playerId,
      total: totals.get(playerId) ?? 0,
      result: bestResultByPlayer.get(playerId) ?? null,
    }))
    .sort((a, b) => b.total - a.total);

  return ranked.map((entry, index) => ({
    playerId: entry.playerId,
    rank: index + 1,
    result: entry.result,
    aggregateTotal: entry.total,
  }));
}

function betterScore(a: BarkScore, b: BarkScore): boolean {
  return compareBarkScores(a, b) > 0;
}

export function isMatchFinished(match: Match): boolean {
  return match.phase === "finished";
}

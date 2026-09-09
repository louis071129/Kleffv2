import { compareBarkScores } from "@klaeff/scoring";
import type { Lobby, Match, MatchId, PlayerId, RoundResult, Standing } from "./types.js";

export class MatchError extends Error {
  constructor(public readonly code: "NOT_CURRENT_BARKER" | "MATCH_FINISHED" | "NO_PLAYERS") {
    super(code);
    this.name = "MatchError";
  }
}

function nextId(prefix: string, rand: () => number): string {
  return `${prefix}_${Math.floor(rand() * 1e12).toString(36)}`;
}

/** Erzeugt ein Match aus einer gestarteten Lobby. Rundenreihenfolge = Beitrittsreihenfolge. */
export function createMatch(lobby: Lobby, now: number, rand: () => number = Math.random): Match {
  if (lobby.players.length === 0) {
    throw new MatchError("NO_PLAYERS");
  }
  return {
    id: nextId("match", rand) as MatchId,
    lobbyId: lobby.id,
    playerOrder: lobby.players.map((p) => p.id),
    currentRoundIndex: 0,
    results: [],
    phase: "in-progress",
    startedAt: now,
    finishedAt: null,
  };
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

/** Sortiert die Spieler nach Ergebnis: bester Score zuerst. Spieler ohne Ergebnis (Timeout) landen am Ende. */
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

  return withResults.map((entry, index) => ({ playerId: entry.playerId, rank: index + 1, result: entry.result }));
}

export function isMatchFinished(match: Match): boolean {
  return match.phase === "finished";
}

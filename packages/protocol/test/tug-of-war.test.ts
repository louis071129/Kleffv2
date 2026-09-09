import { describe, expect, it } from "vitest";
import { computeTugOfWarState, isTugOfWarFinished, TUG_OF_WAR_SAFETY_ROUNDS, TUG_OF_WAR_THRESHOLD } from "../src/tug-of-war.js";
import { buildDuelPlayerOrder, createMatchWithOrder, submitRoundResult } from "../src/match.js";
import type { BarkScore } from "@klaeff/scoring";
import type { Match, RoundResult } from "../src/types.js";

const CAL = {
  noiseFloorDbfs: -50,
  refVoiceDbfs: -30,
  maxObservedDbfs: -3,
  headroomDb: 47,
  agcActive: false,
  calibratedAt: 0,
};

function makeScore(total: number): BarkScore {
  return {
    total,
    breakdown: { loudness: total, attack: 0, crest: 0, character: 0 },
    flags: [],
    peakDbfs: -10,
    peakTimeMs: 0,
    activeDurationMs: 500,
  };
}

function bark(match: Match, playerId: string, total: number, now = 1): Match {
  const result: RoundResult = { playerId, roundIndex: match.currentRoundIndex, score: makeScore(total), calibration: CAL };
  return submitRoundResult(match, result, now);
}

describe("computeTugOfWarState", () => {
  it("startet neutral bei 0, niemand fuehrt", () => {
    const match = createMatchWithOrder("lobby1", buildDuelPlayerOrder("a", "b", TUG_OF_WAR_SAFETY_ROUNDS), 0);
    const state = computeTugOfWarState(match);
    expect(state.ropePosition).toBe(0);
    expect(state.winnerId).toBeNull();
  });

  it("ein score genau 50 (neutral) zieht das Seil nicht", () => {
    let match = createMatchWithOrder("lobby1", buildDuelPlayerOrder("a", "b", TUG_OF_WAR_SAFETY_ROUNDS), 0);
    match = bark(match, "a", 50);
    expect(computeTugOfWarState(match).ropePosition).toBe(0);
  });

  it("ein starker Bark zieht das Seil zur eigenen Seite, ein schwacher zur Gegenseite", () => {
    let match = createMatchWithOrder("lobby1", buildDuelPlayerOrder("a", "b", TUG_OF_WAR_SAFETY_ROUNDS), 0);
    match = bark(match, "a", 80); // +30
    expect(computeTugOfWarState(match).ropePosition).toBe(30);
    match = bark(match, "b", 30); // b's pull = 30-50=-20 fuer b -> rope -= (-20) = +20 addiert? pruefen unten explizit
    // b schwach (30 < 50) gibt Boden ab - das Seil bewegt sich WEITER zu a, nicht zu b.
    expect(computeTugOfWarState(match).ropePosition).toBe(50);
  });

  it("erreicht die Schwelle und kuert sofort einen Gewinner, ohne alle Runden zu spielen", () => {
    let match = createMatchWithOrder("lobby1", buildDuelPlayerOrder("a", "b", TUG_OF_WAR_SAFETY_ROUNDS), 0);
    match = bark(match, "a", 95); // +45
    match = bark(match, "b", 20); // b schwach, zieht weiter zu a (+30)
    // rope = 75, noch nicht entschieden
    expect(isTugOfWarFinished(match)).toBe(false);
    match = bark(match, "a", 90); // +40 -> rope waere 115, geklemmt auf 100
    const state = computeTugOfWarState(match);
    expect(state.winnerId).toBe("a");
    expect(state.ropePosition).toBe(TUG_OF_WAR_THRESHOLD);
    expect(state.decisive).toBe(true);
    expect(isTugOfWarFinished(match)).toBe(true);
  });

  it("Spieler B kann ebenso gewinnen", () => {
    let match = createMatchWithOrder("lobby1", buildDuelPlayerOrder("a", "b", TUG_OF_WAR_SAFETY_ROUNDS), 0);
    for (let i = 0; i < 6; i += 1) {
      match = bark(match, "a", 10); // a schwach, pull=-40, rope -= -40*? siehe Vorzeichen unten
      if (isTugOfWarFinished(match)) break;
      match = bark(match, "b", 95);
      if (isTugOfWarFinished(match)) break;
    }
    const state = computeTugOfWarState(match);
    expect(state.winnerId).toBe("b");
    expect(state.ropePosition).toBe(-TUG_OF_WAR_THRESHOLD);
  });

  it("bricht ein Unentschieden am Sudden-Death-Punkt deterministisch (nie zufaellig)", () => {
    // Beide bellen abwechselnd exakt neutral (50) - Seil bleibt bei 0.
    let match = createMatchWithOrder("lobby1", buildDuelPlayerOrder("a", "b", TUG_OF_WAR_SAFETY_ROUNDS + 4), 0);
    for (let i = 0; i < TUG_OF_WAR_SAFETY_ROUNDS - 1; i += 1) {
      const barker = i % 2 === 0 ? "a" : "b";
      match = bark(match, barker, 50);
    }
    // Genau am Sudden-Death-Punkt: eine letzte, entscheidende Runde mit einem
    // knappen Vorsprung fuer "a" - deterministisch, kein Zufall im Code beteiligt.
    match = bark(match, match.currentRoundIndex % 2 === 0 ? "a" : "b", 51);
    const state = computeTugOfWarState(match);
    expect(state.winnerId).not.toBeNull();
    expect(state.decisive).toBe(false);
  });

  it("ist deterministisch: gleiche Eingabe liefert immer dasselbe Ergebnis", () => {
    let match = createMatchWithOrder("lobby1", buildDuelPlayerOrder("a", "b", TUG_OF_WAR_SAFETY_ROUNDS), 0);
    match = bark(match, "a", 70);
    match = bark(match, "b", 40);
    const s1 = computeTugOfWarState(match);
    const s2 = computeTugOfWarState(match);
    expect(s1).toEqual(s2);
  });
});

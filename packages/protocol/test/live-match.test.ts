import { describe, expect, it } from "vitest";
import {
  RUDEL_LIVE_DURATION_MS,
  TUG_OF_WAR_LIVE_THRESHOLD,
  TUG_OF_WAR_SUDDEN_DEATH_MS,
  applyLiveTick,
  computeLiveStandings,
  createLiveMatch,
  isLiveMatchFinished,
  ropePositionOf,
} from "../src/live-match.js";

describe("createLiveMatch", () => {
  it("startet mit cumulativeScores 0 fuer alle Teilnehmer, Phase in-progress", () => {
    const match = createLiveMatch("lobby1", ["a", "b"], "tugofwar", 0);
    expect(match.cumulativeScores).toEqual({ a: 0, b: 0 });
    expect(match.phase).toBe("in-progress");
    expect(match.finishedAt).toBeNull();
  });
});

describe("applyLiveTick", () => {
  it("addiert Intensitaet pro Spieler zur laufenden Gesamtpunktzahl", () => {
    let match = createLiveMatch("lobby1", ["a", "b"], "tugofwar", 0);
    match = applyLiveTick(match, { a: 80, b: 20 });
    expect(match.cumulativeScores).toEqual({ a: 80, b: 20 });
    match = applyLiveTick(match, { a: 80, b: 20 });
    expect(match.cumulativeScores).toEqual({ a: 160, b: 40 });
  });

  it("fehlender Intensitaets-Eintrag fuer einen Spieler zaehlt als 0 (kein Fehler)", () => {
    let match = createLiveMatch("lobby1", ["a", "b"], "tugofwar", 0);
    match = applyLiveTick(match, { a: 50 });
    expect(match.cumulativeScores).toEqual({ a: 50, b: 0 });
  });
});

describe("ropePositionOf", () => {
  it("ist null bei style 'rudel'", () => {
    const match = createLiveMatch("lobby1", ["a", "b", "c"], "rudel", 0);
    expect(ropePositionOf(match)).toBeNull();
  });

  it("ist die Differenz der cumulativeScores bei style 'tugofwar'", () => {
    let match = createLiveMatch("lobby1", ["a", "b"], "tugofwar", 0);
    match = applyLiveTick(match, { a: 30, b: 10 });
    expect(ropePositionOf(match)).toBe(20);
  });

  it("klemmt auf ±TUG_OF_WAR_LIVE_THRESHOLD", () => {
    let match = createLiveMatch("lobby1", ["a", "b"], "tugofwar", 0);
    match = applyLiveTick(match, { a: 500, b: 0 });
    expect(ropePositionOf(match)).toBe(TUG_OF_WAR_LIVE_THRESHOLD);
  });
});

describe("isLiveMatchFinished", () => {
  it("tugofwar: nicht beendet, solange das Seil die Schwelle nicht erreicht und die Zeit nicht um ist", () => {
    let match = createLiveMatch("lobby1", ["a", "b"], "tugofwar", 0);
    match = applyLiveTick(match, { a: 30, b: 10 });
    expect(isLiveMatchFinished(match, 1000)).toBe(false);
  });

  it("tugofwar: beendet sobald das Seil die Schwelle erreicht", () => {
    let match = createLiveMatch("lobby1", ["a", "b"], "tugofwar", 0);
    match = applyLiveTick(match, { a: TUG_OF_WAR_LIVE_THRESHOLD, b: 0 });
    expect(isLiveMatchFinished(match, 500)).toBe(true);
  });

  it("tugofwar: Sudden-Death-Fallback entscheidet nach TUG_OF_WAR_SUDDEN_DEATH_MS bei echtem Vorsprung", () => {
    let match = createLiveMatch("lobby1", ["a", "b"], "tugofwar", 0);
    match = applyLiveTick(match, { a: 5, b: 1 });
    expect(isLiveMatchFinished(match, TUG_OF_WAR_SUDDEN_DEATH_MS - 1)).toBe(false);
    expect(isLiveMatchFinished(match, TUG_OF_WAR_SUDDEN_DEATH_MS)).toBe(true);
  });

  it("tugofwar: bei exaktem Patt (Seil = 0) endet es auch nach der Sudden-Death-Zeit nicht (kein Zufallsentscheid)", () => {
    const match = createLiveMatch("lobby1", ["a", "b"], "tugofwar", 0);
    expect(isLiveMatchFinished(match, TUG_OF_WAR_SUDDEN_DEATH_MS + 10_000)).toBe(false);
  });

  it("rudel: nicht beendet vor Ablauf der Matchdauer", () => {
    const match = createLiveMatch("lobby1", ["a", "b", "c"], "rudel", 0);
    expect(isLiveMatchFinished(match, RUDEL_LIVE_DURATION_MS - 1)).toBe(false);
  });

  it("rudel: beendet nach Ablauf der Matchdauer, unabhaengig vom Punktestand", () => {
    const match = createLiveMatch("lobby1", ["a", "b", "c"], "rudel", 0);
    expect(isLiveMatchFinished(match, RUDEL_LIVE_DURATION_MS)).toBe(true);
  });
});

describe("computeLiveStandings", () => {
  it("rankt nach cumulativeScore absteigend", () => {
    let match = createLiveMatch("lobby1", ["a", "b", "c"], "rudel", 0);
    match = applyLiveTick(match, { a: 30, b: 90, c: 60 });
    const standings = computeLiveStandings(match);
    expect(standings.map((s) => s.playerId)).toEqual(["b", "c", "a"]);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3]);
    expect(standings[0]?.cumulativeScore).toBe(90);
  });

  it("bei exaktem Gleichstand entscheidet deterministisch die Beitrittsreihenfolge, nie der Zufall", () => {
    const match = createLiveMatch("lobby1", ["a", "b"], "tugofwar", 0);
    const standings = computeLiveStandings(match);
    expect(standings.map((s) => s.playerId)).toEqual(["a", "b"]);
  });

  it("tugofwar-Standings entsprechen der Seilrichtung", () => {
    let match = createLiveMatch("lobby1", ["a", "b"], "tugofwar", 0);
    match = applyLiveTick(match, { a: TUG_OF_WAR_LIVE_THRESHOLD, b: 0 });
    const standings = computeLiveStandings(match);
    expect(standings[0]?.playerId).toBe("a");
    expect(standings[0]?.rank).toBe(1);
  });
});

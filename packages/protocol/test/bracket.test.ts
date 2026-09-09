import { describe, expect, it } from "vitest";
import {
  advanceBracket,
  createBracket,
  currentRoundMatchups,
  isCurrentRoundComplete,
  nextUndecidedMatchup,
  recordMatchupResult,
} from "../src/bracket.js";

function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe("bracket", () => {
  it("paart bei einer geraden Spielerzahl (4) ohne Freilos", () => {
    const bracket = createBracket(["a", "b", "c", "d"], seededRand(1));
    expect(bracket.matchups).toHaveLength(2);
    for (const matchup of bracket.matchups) {
      expect(matchup.playerB).not.toBeNull();
      expect(matchup.winnerId).toBeNull();
    }
  });

  it("vergibt bei ungerader Spielerzahl (5) genau ein Freilos in Runde 1", () => {
    const bracket = createBracket(["a", "b", "c", "d", "e"], seededRand(2));
    expect(bracket.matchups).toHaveLength(3);
    const byes = bracket.matchups.filter((m) => m.playerB === null);
    expect(byes).toHaveLength(1);
    expect(byes[0]?.winnerId).toBe(byes[0]?.playerA);
  });

  it("kuert bei genau einem Spieler sofort den Champion ohne Matchup", () => {
    const bracket = createBracket(["a"]);
    expect(bracket.champion).toBe("a");
    expect(bracket.matchups).toHaveLength(0);
  });

  it("advanceBracket tut nichts, solange die aktuelle Runde nicht komplett ist", () => {
    const bracket = createBracket(["a", "b", "c", "d"], seededRand(3));
    const advanced = advanceBracket(bracket);
    expect(advanced).toEqual(bracket);
  });

  it("fuehrt ein 4er-Bracket vollstaendig bis zum Champion durch", () => {
    let bracket = createBracket(["a", "b", "c", "d"], seededRand(4));
    expect(currentRoundMatchups(bracket)).toHaveLength(2);

    // Runde 1: fuer beide Matchups einen Sieger eintragen.
    for (const matchup of currentRoundMatchups(bracket)) {
      const winner = matchup.playerA;
      bracket = recordMatchupResult(bracket, matchup.id, winner);
    }
    expect(isCurrentRoundComplete(bracket)).toBe(true);
    expect(nextUndecidedMatchup(bracket)).toBeNull();

    bracket = advanceBracket(bracket);
    expect(bracket.champion).toBeNull();
    const round2 = currentRoundMatchups(bracket);
    expect(round2).toHaveLength(1);
    expect(round2[0]?.round).toBe(2);

    const finalWinner = round2[0]?.playerA;
    bracket = recordMatchupResult(bracket, round2[0]!.id, finalWinner!);
    bracket = advanceBracket(bracket);
    expect(bracket.champion).toBe(finalWinner);
  });

  it("advanceBracket nach dem Champion aendert nichts mehr", () => {
    let bracket = createBracket(["a", "b"], seededRand(5));
    const matchup = currentRoundMatchups(bracket)[0]!;
    bracket = recordMatchupResult(bracket, matchup.id, matchup.playerA);
    bracket = advanceBracket(bracket);
    expect(bracket.champion).toBe(matchup.playerA);

    const again = advanceBracket(bracket);
    expect(again).toEqual(bracket);
  });

  it("Freilos-Spieler muss im naechsten advanceBracket-Aufruf nicht erneut bestaetigt werden", () => {
    let bracket = createBracket(["a", "b", "c"], seededRand(6));
    // Ein Matchup + ein Freilos in Runde 1.
    const real = bracket.matchups.find((m) => m.playerB !== null)!;
    bracket = recordMatchupResult(bracket, real.id, real.playerA);
    expect(isCurrentRoundComplete(bracket)).toBe(true);

    bracket = advanceBracket(bracket);
    const round2 = currentRoundMatchups(bracket);
    expect(round2).toHaveLength(1);
    expect(round2[0]?.round).toBe(2);
  });
});

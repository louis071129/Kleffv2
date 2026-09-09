import { describe, expect, it } from "vitest";
import type { BarkScore } from "@klaeff/scoring";
import {
  MatchError,
  buildDuelPlayerOrder,
  buildRudelPlayerOrder,
  computeAggregateStandings,
  computeDuelStandings,
  computeStandings,
  createMatch,
  createMatchWithOrder,
  currentBarker,
  isMatchFinished,
  submitRoundResult,
} from "../src/match.js";
import { addPlayer, createPrivateLobby } from "../src/lobby.js";
import type { Player, RoundResult } from "../src/types.js";

let counter = 0;
function makePlayer(): Player {
  counter += 1;
  return {
    id: `p${counter}`,
    deviceUuid: `device-${counter}`,
    nickname: `Spieler${counter}`,
    avatar: {
      headShape: 0,
      ears: 0,
      furColor: 0,
      furPattern: 0,
      eyes: 0,
      snout: 0,
      collarColor: 0,
      collarCharm: 0,
      accessory: 0,
      idleSeed: 1,
    },
    connected: true,
    isHost: false,
    joinedAt: 0,
  };
}

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

const CAL = {
  noiseFloorDbfs: -50,
  refVoiceDbfs: -30,
  maxObservedDbfs: -3,
  headroomDb: 47,
  agcActive: false,
  calibratedAt: 0,
};

describe("match", () => {
  function setupLobby(playerCount: number) {
    const host = makePlayer();
    let lobby = createPrivateLobby(host, 0);
    const players: Player[] = [host];
    for (let i = 1; i < playerCount; i += 1) {
      const p = makePlayer();
      players.push(p);
      lobby = addPlayer(lobby, p, 0);
    }
    return { lobby, players };
  }

  it("rundenreihenfolge folgt der Beitrittsreihenfolge", () => {
    const { lobby, players } = setupLobby(3);
    const match = createMatch(lobby, 0);
    expect(match.playerOrder).toEqual(players.map((p) => p.id));
    expect(currentBarker(match)).toBe(players[0]!.id);
  });

  it("lehnt ein Ergebnis ab, das nicht vom aktuellen Barker kommt", () => {
    const { lobby, players } = setupLobby(2);
    const match = createMatch(lobby, 0);
    const wrongResult: RoundResult = { playerId: players[1]!.id, roundIndex: 0, score: makeScore(50), calibration: CAL };
    expect(() => submitRoundResult(match, wrongResult, 0)).toThrow(MatchError);
  });

  it("wechselt nach jedem Ergebnis zum naechsten Spieler und beendet das Match am Ende", () => {
    const { lobby, players } = setupLobby(3);
    let match = createMatch(lobby, 0);

    match = submitRoundResult(match, { playerId: players[0]!.id, roundIndex: 0, score: makeScore(80), calibration: CAL }, 1);
    expect(isMatchFinished(match)).toBe(false);
    expect(currentBarker(match)).toBe(players[1]!.id);

    match = submitRoundResult(match, { playerId: players[1]!.id, roundIndex: 1, score: makeScore(60), calibration: CAL }, 2);
    expect(currentBarker(match)).toBe(players[2]!.id);

    match = submitRoundResult(match, { playerId: players[2]!.id, roundIndex: 2, score: makeScore(90), calibration: CAL }, 3);
    expect(isMatchFinished(match)).toBe(true);
    expect(currentBarker(match)).toBeNull();
  });

  it("wirft MATCH_FINISHED wenn nach Ende noch etwas eingereicht wird", () => {
    const { lobby, players } = setupLobby(1);
    let match = createMatch(lobby, 0);
    match = submitRoundResult(match, { playerId: players[0]!.id, roundIndex: 0, score: makeScore(80), calibration: CAL }, 1);
    expect(() =>
      submitRoundResult(match, { playerId: players[0]!.id, roundIndex: 1, score: makeScore(10), calibration: CAL }, 2),
    ).toThrow(MatchError);
  });

  it("computeStandings sortiert nach bestem Score, Spieler ohne Ergebnis landen am Ende", () => {
    const { lobby, players } = setupLobby(3);
    let match = createMatch(lobby, 0);
    match = submitRoundResult(match, { playerId: players[0]!.id, roundIndex: 0, score: makeScore(50), calibration: CAL }, 1);
    match = submitRoundResult(match, { playerId: players[1]!.id, roundIndex: 1, score: makeScore(90), calibration: CAL }, 2);
    // players[2] reicht nichts ein (Timeout) -> Match wird trotzdem als Rundenabfolge zu Ende gefuehrt via Standings

    const standings = computeStandings(match);
    expect(standings[0]?.playerId).toBe(players[1]!.id);
    expect(standings[1]?.playerId).toBe(players[0]!.id);
    expect(standings[2]?.playerId).toBe(players[2]!.id);
    expect(standings[2]?.result).toBeNull();
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  describe("Duell (Best-of-N)", () => {
    it("buildDuelPlayerOrder wechselt sich fuer jeden Zyklus ab", () => {
      expect(buildDuelPlayerOrder("a", "b", 5)).toEqual(["a", "b", "a", "b", "a", "b", "a", "b", "a", "b"]);
    });

    it("zaehlt Rundensiege pro Zyklus und rankt danach, nicht nach Score-Summe", () => {
      const { lobby, players } = setupLobby(2);
      const order = buildDuelPlayerOrder(players[0]!.id, players[1]!.id, 3);
      let match = createMatchWithOrder(lobby.id, order, 0);

      // Zyklus 1: p0 gewinnt knapp.
      match = submitRoundResult(match, { playerId: players[0]!.id, roundIndex: 0, score: makeScore(60), calibration: CAL }, 1);
      match = submitRoundResult(match, { playerId: players[1]!.id, roundIndex: 1, score: makeScore(50), calibration: CAL }, 1);
      // Zyklus 2: p1 gewinnt haushoch.
      match = submitRoundResult(match, { playerId: players[0]!.id, roundIndex: 2, score: makeScore(10), calibration: CAL }, 2);
      match = submitRoundResult(match, { playerId: players[1]!.id, roundIndex: 3, score: makeScore(95), calibration: CAL }, 2);
      // Zyklus 3: p0 gewinnt knapp.
      match = submitRoundResult(match, { playerId: players[0]!.id, roundIndex: 4, score: makeScore(60), calibration: CAL }, 3);
      match = submitRoundResult(match, { playerId: players[1]!.id, roundIndex: 5, score: makeScore(50), calibration: CAL }, 3);

      expect(isMatchFinished(match)).toBe(true);
      const standings = computeDuelStandings(match);
      // p0 hat 2 Rundensiege, p1 nur 1 - trotz p1s hoher Einzelrunde gewinnt p0 das Duell.
      expect(standings[0]?.playerId).toBe(players[0]!.id);
      expect(standings[0]?.wins).toBe(2);
      expect(standings[1]?.playerId).toBe(players[1]!.id);
      expect(standings[1]?.wins).toBe(1);
    });

    it("spielt immer alle Zyklen durch (kein vorzeitiges Ende), siehe BLOCKERS.md", () => {
      const { lobby, players } = setupLobby(2);
      const order = buildDuelPlayerOrder(players[0]!.id, players[1]!.id, 5);
      let match = createMatchWithOrder(lobby.id, order, 0);
      for (let cycle = 0; cycle < 3; cycle += 1) {
        match = submitRoundResult(
          match,
          { playerId: players[0]!.id, roundIndex: match.currentRoundIndex, score: makeScore(90), calibration: CAL },
          1,
        );
        match = submitRoundResult(
          match,
          { playerId: players[1]!.id, roundIndex: match.currentRoundIndex, score: makeScore(10), calibration: CAL },
          1,
        );
      }
      // p0 fuehrt schon 3:0 - trotzdem noch nicht fertig, es fehlen 2 weitere Zyklen.
      expect(isMatchFinished(match)).toBe(false);
      expect(match.currentRoundIndex).toBe(6);
    });
  });

  describe("Rudel (Ranking ueber mehrere Zyklen)", () => {
    it("buildRudelPlayerOrder wiederholt alle Spieler fuer jeden Zyklus", () => {
      expect(buildRudelPlayerOrder(["a", "b", "c"], 3)).toEqual(["a", "b", "c", "a", "b", "c", "a", "b", "c"]);
    });

    it("rankt nach Summe der Scores ueber alle Zyklen", () => {
      const { lobby, players } = setupLobby(2);
      const order = buildRudelPlayerOrder(
        players.map((p) => p.id),
        3,
      );
      let match = createMatchWithOrder(lobby.id, order, 0);
      const scoresP0 = [30, 30, 30]; // Summe 90
      const scoresP1 = [80, 5, 5]; // Summe 90 -> knapp dahinter durch Rundung vermeiden, siehe unten
      let i = 0;
      for (let cycle = 0; cycle < 3; cycle += 1) {
        match = submitRoundResult(
          match,
          { playerId: players[0]!.id, roundIndex: match.currentRoundIndex, score: makeScore(scoresP0[cycle]!), calibration: CAL },
          1,
        );
        match = submitRoundResult(
          match,
          { playerId: players[1]!.id, roundIndex: match.currentRoundIndex, score: makeScore(scoresP1[cycle]!), calibration: CAL },
          1,
        );
        i += 1;
      }
      expect(i).toBe(3);
      expect(isMatchFinished(match)).toBe(true);
      const standings = computeAggregateStandings(match);
      const p0 = standings.find((s) => s.playerId === players[0]!.id)!;
      const p1 = standings.find((s) => s.playerId === players[1]!.id)!;
      expect(p0.aggregateTotal).toBe(90);
      expect(p1.aggregateTotal).toBe(90);
      // Gleichstand hier bewusst nicht weiter aufgeloest (Randfall) - Haupttest unten mit echtem Unterschied.
    });

    it("Spieler mit hoeherer Score-Summe gewinnt, auch bei einer schwaecheren Einzelrunde", () => {
      const { lobby, players } = setupLobby(2);
      const order = buildRudelPlayerOrder(
        players.map((p) => p.id),
        3,
      );
      let match = createMatchWithOrder(lobby.id, order, 0);
      const scoresP0 = [40, 40, 40]; // Summe 120
      const scoresP1 = [90, 5, 5]; // Summe 100
      for (let cycle = 0; cycle < 3; cycle += 1) {
        match = submitRoundResult(
          match,
          { playerId: players[0]!.id, roundIndex: match.currentRoundIndex, score: makeScore(scoresP0[cycle]!), calibration: CAL },
          1,
        );
        match = submitRoundResult(
          match,
          { playerId: players[1]!.id, roundIndex: match.currentRoundIndex, score: makeScore(scoresP1[cycle]!), calibration: CAL },
          1,
        );
      }
      const standings = computeAggregateStandings(match);
      expect(standings[0]?.playerId).toBe(players[0]!.id);
      expect(standings[0]?.aggregateTotal).toBe(120);
      expect(standings[1]?.aggregateTotal).toBe(100);
    });
  });
});

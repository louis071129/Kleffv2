import { describe, expect, it } from "vitest";
import type { BarkScore } from "@klaeff/scoring";
import { MatchError, computeStandings, createMatch, currentBarker, isMatchFinished, submitRoundResult } from "../src/match.js";
import { addPlayer, createPublicLobby } from "../src/lobby.js";
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
    let lobby = createPublicLobby(0);
    const players: Player[] = [];
    for (let i = 0; i < playerCount; i += 1) {
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
});

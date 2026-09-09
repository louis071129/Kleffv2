import { describe, expect, it } from "vitest";
import { createMatchmakingState, dequeuePlayer, enqueuePlayer } from "../src/matchmaking.js";
import { evaluateCountdown } from "../src/lobby.js";
import type { Player } from "../src/types.js";

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
    ...{},
  };
}

describe("matchmaking", () => {
  it("eroeffnet eine neue Lobby wenn keine offene existiert", () => {
    const state = createMatchmakingState();
    const { state: next, lobby } = enqueuePlayer(state, makePlayer(), 0);
    expect(next.openLobbies).toHaveLength(1);
    expect(lobby.players).toHaveLength(1);
  });

  it("fuellt die aelteste offene Lobby zuerst auf, statt eine neue zu eroeffnen", () => {
    let state = createMatchmakingState();
    let result = enqueuePlayer(state, makePlayer(), 0);
    state = result.state;
    const firstLobbyId = result.lobby.id;

    result = enqueuePlayer(state, makePlayer(), 10);
    state = result.state;

    expect(state.openLobbies).toHaveLength(1);
    expect(result.lobby.id).toBe(firstLobbyId);
    expect(result.lobby.players).toHaveLength(2);
  });

  it("eroeffnet eine zweite Lobby wenn die erste voll ist", () => {
    let state = createMatchmakingState();
    let lastLobbyId = "";
    for (let i = 0; i < 6; i += 1) {
      const result = enqueuePlayer(state, makePlayer(), i);
      state = result.state;
      lastLobbyId = result.lobby.id;
    }
    expect(state.openLobbies).toHaveLength(1);

    const overflow = enqueuePlayer(state, makePlayer(), 100);
    expect(overflow.lobby.id).not.toBe(lastLobbyId);
    expect(overflow.state.openLobbies).toHaveLength(2);
  });

  it("fuenf gleichzeitig suchende Spieler landen in derselben Lobby und starten den Countdown", () => {
    let state = createMatchmakingState();
    let lobbyId = "";
    for (let i = 0; i < 5; i += 1) {
      const result = enqueuePlayer(state, makePlayer(), 0);
      state = result.state;
      lobbyId = result.lobby.id;
    }
    const lobby = state.openLobbies.find((l) => l.id === lobbyId);
    expect(lobby?.players).toHaveLength(5);

    const ticked = evaluateCountdown(lobby!, 0);
    expect(ticked.phase).toBe("countdown");
  });

  it("dequeuePlayer entfernt einen Spieler aus der Warteschlange", () => {
    let state = createMatchmakingState();
    const p1 = makePlayer();
    let result = enqueuePlayer(state, p1, 0);
    state = result.state;

    state = dequeuePlayer(state, p1.id, 10);
    expect(state.openLobbies).toHaveLength(0);
  });
});

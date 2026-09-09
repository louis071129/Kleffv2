import { describe, expect, it } from "vitest";
import {
  createCarouselState,
  dequeueFromCarousel,
  enqueueForCarousel,
  isQueued,
  pairAll,
  tryPairNext,
} from "../src/carousel.js";
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
  };
}

describe("carousel", () => {
  it("paart niemanden, solange nur ein Spieler wartet", () => {
    const state = enqueueForCarousel(createCarouselState(), makePlayer(), 0);
    const result = tryPairNext(state, 0);
    expect(result.lobby).toBeNull();
    expect(result.state.queue).toHaveLength(1);
  });

  it("paart die zwei am laengsten wartenden Spieler sofort, sobald zwei da sind - kein Countdown", () => {
    let state = createCarouselState();
    const p1 = makePlayer();
    const p2 = makePlayer();
    state = enqueueForCarousel(state, p1, 0);
    state = enqueueForCarousel(state, p2, 10);

    const result = tryPairNext(state, 20);
    expect(result.lobby).not.toBeNull();
    expect(result.lobby?.mode).toBe("carousel");
    expect(result.lobby?.phase).toBe("in-progress");
    expect(result.lobby?.players.map((p) => p.id).sort()).toEqual([p1.id, p2.id].sort());
    expect(result.state.queue).toHaveLength(0);
  });

  it("gepaarte Kläffkarussell-Lobby ist immer im Synth-Audiomodus", () => {
    let state = createCarouselState();
    state = enqueueForCarousel(state, makePlayer(), 0);
    state = enqueueForCarousel(state, makePlayer(), 0);
    const { lobby } = tryPairNext(state, 0);
    expect(lobby?.audioMode).toBe("synth");
  });

  it("pairAll paart mehrere gleichzeitig wartende Paare auf einmal", () => {
    let state = createCarouselState();
    for (let i = 0; i < 6; i += 1) {
      state = enqueueForCarousel(state, makePlayer(), i);
    }
    const { state: after, lobbies } = pairAll(state, 100);
    expect(lobbies).toHaveLength(3);
    expect(after.queue).toHaveLength(0);
  });

  it("bei ungerader Warteschlange bleibt einer uebrig", () => {
    let state = createCarouselState();
    for (let i = 0; i < 5; i += 1) {
      state = enqueueForCarousel(state, makePlayer(), i);
    }
    const { state: after, lobbies } = pairAll(state, 100);
    expect(lobbies).toHaveLength(2);
    expect(after.queue).toHaveLength(1);
  });

  it("dequeueFromCarousel entfernt einen wartenden Spieler (aktiv verlassen)", () => {
    let state = createCarouselState();
    const p1 = makePlayer();
    state = enqueueForCarousel(state, p1, 0);
    expect(isQueued(state, p1.id)).toBe(true);

    state = dequeueFromCarousel(state, p1.id);
    expect(isQueued(state, p1.id)).toBe(false);
  });

  it("erneutes Einreihen ersetzt den alten Eintrag statt zu duplizieren", () => {
    let state = createCarouselState();
    const p1 = makePlayer();
    state = enqueueForCarousel(state, p1, 0);
    state = enqueueForCarousel(state, p1, 50);
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0]?.queuedAt).toBe(50);
  });
});

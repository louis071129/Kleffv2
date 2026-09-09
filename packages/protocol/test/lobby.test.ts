import { describe, expect, it } from "vitest";
import {
  LobbyError,
  PUBLIC_COUNTDOWN_MS,
  PUBLIC_MIN_TO_START,
  addPlayer,
  createPrivateLobby,
  createPublicLobby,
  evaluateCountdown,
  kickPlayer,
  removePlayer,
  startPrivateLobby,
} from "../src/lobby.js";
import type { Player } from "../src/types.js";

let counter = 0;
function makePlayer(overrides: Partial<Player> = {}): Player {
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
    joinedAt: Date.now(),
    ...overrides,
  };
}

describe("lobby - public", () => {
  it("startet keinen Countdown unter der Mindestspielerzahl", () => {
    let lobby = createPublicLobby(0);
    lobby = addPlayer(lobby, makePlayer(), 0);
    lobby = evaluateCountdown(lobby, 0);
    expect(lobby.phase).toBe("waiting");
    expect(lobby.countdownEndsAt).toBeNull();
  });

  it("startet den 20s-Countdown sobald 3 Spieler da sind", () => {
    let lobby = createPublicLobby(0);
    for (let i = 0; i < PUBLIC_MIN_TO_START; i += 1) {
      lobby = addPlayer(lobby, makePlayer(), 0);
    }
    lobby = evaluateCountdown(lobby, 0);
    expect(lobby.phase).toBe("countdown");
    expect(lobby.countdownEndsAt).toBe(PUBLIC_COUNTDOWN_MS);
  });

  it("Nachfuellen bis 6 Spieler resettet den Countdown NICHT", () => {
    let lobby = createPublicLobby(0);
    for (let i = 0; i < 3; i += 1) {
      lobby = addPlayer(lobby, makePlayer(), 0);
    }
    lobby = evaluateCountdown(lobby, 0);
    const endsAt = lobby.countdownEndsAt;

    lobby = addPlayer(lobby, makePlayer(), 5000);
    lobby = evaluateCountdown(lobby, 5000);

    expect(lobby.countdownEndsAt).toBe(endsAt);
    expect(lobby.phase).toBe("countdown");
  });

  it("startet das Match wenn der Countdown ablaeuft und genug Spieler da sind", () => {
    let lobby = createPublicLobby(0);
    for (let i = 0; i < 3; i += 1) {
      lobby = addPlayer(lobby, makePlayer(), 0);
    }
    lobby = evaluateCountdown(lobby, 0);
    lobby = evaluateCountdown(lobby, PUBLIC_COUNTDOWN_MS);
    expect(lobby.phase).toBe("in-progress");
  });

  it("bricht den Countdown ab wenn zu viele Spieler die Queue verlassen", () => {
    let lobby = createPublicLobby(0);
    const players = [makePlayer(), makePlayer(), makePlayer()];
    for (const p of players) {
      lobby = addPlayer(lobby, p, 0);
    }
    lobby = evaluateCountdown(lobby, 0);
    expect(lobby.phase).toBe("countdown");

    lobby = removePlayer(lobby, players[0]!.id, 1000);
    lobby = removePlayer(lobby, players[1]!.id, 1000);

    expect(lobby.phase).toBe("waiting");
    expect(lobby.countdownEndsAt).toBeNull();
  });

  it("entfernt einen verlassenden Spieler aus der Public-Lobby korrekt entfernt aus der Liste", () => {
    let lobby = createPublicLobby(0);
    const p1 = makePlayer();
    lobby = addPlayer(lobby, p1, 0);
    lobby = removePlayer(lobby, p1.id, 1);
    expect(lobby.players).toHaveLength(0);
  });

  it("wirft LOBBY_FULL wenn die Lobby voll ist", () => {
    let lobby = createPublicLobby(0);
    for (let i = 0; i < 6; i += 1) {
      lobby = addPlayer(lobby, makePlayer(), 0);
    }
    expect(() => addPlayer(lobby, makePlayer(), 0)).toThrow(LobbyError);
  });

  it("wirft ALREADY_JOINED bei doppeltem Join derselben Spieler-ID", () => {
    let lobby = createPublicLobby(0);
    const p = makePlayer();
    lobby = addPlayer(lobby, p, 0);
    expect(() => addPlayer(lobby, p, 0)).toThrow(LobbyError);
  });
});

describe("lobby - private", () => {
  it("der erste Spieler wird automatisch Host", () => {
    const host = makePlayer();
    const lobby = createPrivateLobby(host, 0);
    expect(lobby.hostId).toBe(host.id);
    expect(lobby.players[0]?.isHost).toBe(true);
    expect(lobby.code).toHaveLength(6);
  });

  it("nur der Host kann kicken", () => {
    const host = makePlayer();
    let lobby = createPrivateLobby(host, 0);
    const guest = makePlayer();
    lobby = addPlayer(lobby, guest, 0);

    expect(() => kickPlayer(lobby, guest.id, host.id, 0)).toThrow(LobbyError);

    const afterKick = kickPlayer(lobby, host.id, guest.id, 0);
    expect(afterKick.players).toHaveLength(1);
  });

  it("wenn der Host geht, uebernimmt der laengste anwesende Spieler", () => {
    const host = makePlayer({ joinedAt: 0 });
    let lobby = createPrivateLobby(host, 0);
    const guest = makePlayer({ joinedAt: 10 });
    lobby = addPlayer(lobby, guest, 10);

    lobby = removePlayer(lobby, host.id, 20);

    expect(lobby.hostId).toBe(guest.id);
    expect(lobby.players.find((p) => p.id === guest.id)?.isHost).toBe(true);
  });

  it("Host verlaesst leere Lobby -> hostId wird null", () => {
    const host = makePlayer();
    let lobby = createPrivateLobby(host, 0);
    lobby = removePlayer(lobby, host.id, 1);
    expect(lobby.hostId).toBeNull();
    expect(lobby.players).toHaveLength(0);
  });

  it("Host startet manuell mit genug Spielern", () => {
    const host = makePlayer();
    let lobby = createPrivateLobby(host, 0);
    lobby = addPlayer(lobby, makePlayer(), 0);
    lobby = startPrivateLobby(lobby, host.id, 0);
    expect(lobby.phase).toBe("in-progress");
  });

  it("Host kann nicht mit zu wenigen Spielern starten", () => {
    const host = makePlayer();
    const lobby = createPrivateLobby(host, 0);
    expect(() => startPrivateLobby(lobby, host.id, 0)).toThrow(LobbyError);
  });

  it("Nicht-Host kann nicht starten", () => {
    const host = makePlayer();
    let lobby = createPrivateLobby(host, 0);
    const guest = makePlayer();
    lobby = addPlayer(lobby, guest, 0);
    expect(() => startPrivateLobby(lobby, guest.id, 0)).toThrow(LobbyError);
  });

  it("erlaubt bis zu 8 Spieler", () => {
    const host = makePlayer();
    let lobby = createPrivateLobby(host, 0);
    for (let i = 0; i < 7; i += 1) {
      lobby = addPlayer(lobby, makePlayer(), 0);
    }
    expect(lobby.players).toHaveLength(8);
    expect(() => addPlayer(lobby, makePlayer(), 0)).toThrow(LobbyError);
  });
});

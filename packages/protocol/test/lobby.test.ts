import { describe, expect, it } from "vitest";
import {
  LobbyError,
  PRIVATE_MAX_PLAYERS,
  addPlayer,
  createCarouselLobby,
  createPrivateLobby,
  kickPlayer,
  removePlayer,
  setAudioMode,
  setMatchMode,
  setMaxPlayers,
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

describe("lobby - carousel (Kläffkarussell)", () => {
  it("kommt bereits fertig gepaart und sofort in-progress, ohne Countdown", () => {
    const lobby = createCarouselLobby(makePlayer(), makePlayer(), 0);
    expect(lobby.mode).toBe("carousel");
    expect(lobby.phase).toBe("in-progress");
    expect(lobby.countdownEndsAt).toBeNull();
    expect(lobby.players).toHaveLength(2);
  });

  it("hat keinen Host und immer Audiomodus 'synth' (nie echte Stimme)", () => {
    const lobby = createCarouselLobby(makePlayer(), makePlayer(), 0);
    expect(lobby.hostId).toBeNull();
    expect(lobby.audioMode).toBe("synth");
    expect(lobby.players.every((p) => !p.isHost)).toBe(true);
  });

  it("hat keinen Einladungscode", () => {
    const lobby = createCarouselLobby(makePlayer(), makePlayer(), 0);
    expect(lobby.code).toBeNull();
  });
});

describe("lobby - private", () => {
  it("der erste Spieler wird automatisch Host, Standard ist echter Ton", () => {
    const host = makePlayer();
    const lobby = createPrivateLobby(host, 0);
    expect(lobby.hostId).toBe(host.id);
    expect(lobby.players[0]?.isHost).toBe(true);
    expect(lobby.code).toHaveLength(6);
    expect(lobby.audioMode).toBe("real");
    expect(lobby.matchMode).toBeNull();
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

  it("bei genau 2 Spielern startet automatisch der Duell-Modus, ohne dass der Host waehlen muss", () => {
    const host = makePlayer();
    let lobby = createPrivateLobby(host, 0);
    lobby = addPlayer(lobby, makePlayer(), 0);
    lobby = startPrivateLobby(lobby, host.id, 0);
    expect(lobby.phase).toBe("in-progress");
    expect(lobby.matchMode).toBe("duell");
  });

  it("ab 3 Spielern verlangt der Start einen vorher gewaehlten Modus", () => {
    const host = makePlayer();
    let lobby = createPrivateLobby(host, 0);
    lobby = addPlayer(lobby, makePlayer(), 0);
    lobby = addPlayer(lobby, makePlayer(), 0);
    expect(() => startPrivateLobby(lobby, host.id, 0)).toThrow(LobbyError);

    lobby = setMatchMode(lobby, host.id, "rudel", 0);
    lobby = startPrivateLobby(lobby, host.id, 0);
    expect(lobby.phase).toBe("in-progress");
    expect(lobby.matchMode).toBe("rudel");
  });

  it("nur der Host darf den Modus setzen", () => {
    const host = makePlayer();
    let lobby = createPrivateLobby(host, 0);
    const guest = makePlayer();
    lobby = addPlayer(lobby, guest, 0);
    expect(() => setMatchMode(lobby, guest.id, "bracket", 0)).toThrow(LobbyError);
  });

  it("Host kann 'Echter Ton' abschalten", () => {
    const host = makePlayer();
    let lobby = createPrivateLobby(host, 0);
    lobby = setAudioMode(lobby, host.id, "synth", 0);
    expect(lobby.audioMode).toBe("synth");
  });

  it("Host kann die Spielerzahl-Obergrenze zwischen 2 und 8 einstellen", () => {
    const host = makePlayer();
    let lobby = createPrivateLobby(host, 0);
    lobby = setMaxPlayers(lobby, host.id, 4, 0);
    expect(lobby.maxPlayers).toBe(4);
    expect(() => setMaxPlayers(lobby, host.id, 1, 0)).toThrow(LobbyError);
    expect(() => setMaxPlayers(lobby, host.id, 9, 0)).toThrow(LobbyError);
  });

  it("Spielerzahl-Obergrenze kann nicht unter die aktuelle Spielerzahl gesetzt werden", () => {
    const host = makePlayer();
    let lobby = createPrivateLobby(host, 0);
    lobby = addPlayer(lobby, makePlayer(), 0);
    lobby = addPlayer(lobby, makePlayer(), 0);
    expect(() => setMaxPlayers(lobby, host.id, 2, 0)).toThrow(LobbyError);
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
    expect(lobby.players).toHaveLength(PRIVATE_MAX_PLAYERS);
    expect(() => addPlayer(lobby, makePlayer(), 0)).toThrow(LobbyError);
  });

  it("wirft ALREADY_JOINED bei doppeltem Join derselben Spieler-ID", () => {
    let lobby = createPrivateLobby(makePlayer(), 0);
    const guest = makePlayer();
    lobby = addPlayer(lobby, guest, 0);
    expect(() => addPlayer(lobby, guest, 0)).toThrow(LobbyError);
  });
});

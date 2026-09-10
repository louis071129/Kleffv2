import { describe, expect, it } from "vitest";
import { BOT_DIFFICULTIES, createBotPlayer, isBotPlayer, randomBotDifficulty } from "../src/bot.js";
import { AvatarSeedSchema, PlayerSchema } from "../src/schema.js";
import { addPlayer, createPrivateLobby, kickPlayer } from "../src/lobby.js";
import type { Player } from "../src/types.js";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

describe("createBotPlayer", () => {
  it.each(BOT_DIFFICULTIES)("%s: Name beginnt mit dem Stufennamen (nie wie ein normaler Spieler-Nickname)", (difficulty) => {
    const bot = createBotPlayer(difficulty, 0, mulberry32(1));
    const expectedPrefix = difficulty === "alptraum-dogge" ? "Alptraum-Dogge" : difficulty === "klaeffer" ? "Kläffer" : "Welpe";
    expect(bot.nickname.startsWith(expectedPrefix)).toBe(true);
  });

  it("setzt botDifficulty exakt auf die uebergebene Stufe", () => {
    const bot = createBotPlayer("alptraum-dogge", 0, mulberry32(2));
    expect(bot.botDifficulty).toBe("alptraum-dogge");
  });

  it("deviceUuid ist eindeutig als synthetisch erkennbar (Praefix 'bot:'), kollidiert nie mit einer echten UUID", () => {
    const bot = createBotPlayer("welpe", 0, mulberry32(3));
    expect(bot.deviceUuid.startsWith("bot:welpe:")).toBe(true);
  });

  it("ist immer verbunden (connected: true) und nie Host", () => {
    const bot = createBotPlayer("klaeffer", 0, mulberry32(4));
    expect(bot.connected).toBe(true);
    expect(bot.isHost).toBe(false);
  });

  it("Avatar-Seed erfuellt das bestehende AvatarSeedSchema unveraendert (keine neue Avatar-Pipeline)", () => {
    for (let i = 0; i < 50; i += 1) {
      const bot = createBotPlayer("welpe", 0, mulberry32(100 + i));
      expect(() => AvatarSeedSchema.parse(bot.avatar)).not.toThrow();
    }
  });

  it("Avatar-Seed nutzt einen kleineren, konstanten Wertebereich als echte Spieler (kein Accessoire, eigene Optik)", () => {
    for (let i = 0; i < 50; i += 1) {
      const bot = createBotPlayer("welpe", 0, mulberry32(200 + i));
      expect(bot.avatar.accessory).toBe(0);
      expect(bot.avatar.headShape).toBeLessThanOrEqual(1);
      expect(bot.avatar.ears).toBeLessThanOrEqual(1);
    }
  });

  it("die komplette Player-Struktur erfuellt das bestehende, unveraenderte PlayerSchema (Wire-Format)", () => {
    const bot = createBotPlayer("klaeffer", 0, mulberry32(5));
    // deviceUuid ist wie bei echten Spielern nicht Teil des Wire-Snapshots -
    // nur die Felder pruefen, die auch echte Spieler ueber LOBBY_STATE senden.
    const { deviceUuid: _deviceUuid, ...wireShape } = bot;
    expect(() => PlayerSchema.parse(wireShape)).not.toThrow();
  });

  it("gleicher rand-Ablauf erzeugt reproduzierbare Bots (Determinismus)", () => {
    const a = createBotPlayer("welpe", 0, mulberry32(42));
    const b = createBotPlayer("welpe", 0, mulberry32(42));
    expect(a.nickname).toBe(b.nickname);
    expect(a.avatar).toEqual(b.avatar);
  });

  it("randomBotDifficulty liefert immer eine der drei gueltigen Stufen", () => {
    for (let i = 0; i < 50; i += 1) {
      const difficulty = randomBotDifficulty(mulberry32(300 + i));
      expect(BOT_DIFFICULTIES).toContain(difficulty);
    }
  });

  it("isBotPlayer unterscheidet Bots von echten Spielern", () => {
    const bot = createBotPlayer("welpe", 0, mulberry32(6));
    const human = makePlayer();
    expect(isBotPlayer(bot)).toBe(true);
    expect(isBotPlayer(human)).toBe(false);
  });
});

describe("Bot als Lobby-Spieler (bestehende Lobby-Funktionen bleiben unveraendert nutzbar)", () => {
  it("addPlayer/kickPlayer funktionieren mit einem Bot genauso wie mit einem echten Spieler", () => {
    const host = makePlayer();
    let lobby = createPrivateLobby(host, 0);
    const bot = createBotPlayer("klaeffer", 0, mulberry32(7));
    lobby = addPlayer(lobby, bot, 0);
    expect(lobby.players).toHaveLength(2);
    expect(lobby.players.find((p) => p.id === bot.id)?.botDifficulty).toBe("klaeffer");

    lobby = kickPlayer(lobby, host.id, bot.id, 0);
    expect(lobby.players).toHaveLength(1);
    expect(lobby.players.find((p) => p.id === bot.id)).toBeUndefined();
  });
});

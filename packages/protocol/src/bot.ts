import type { BotDifficulty } from "@klaeff/scoring";
import type { AvatarSeed, Player, PlayerId } from "./types.js";

export type { BotDifficulty };

/**
 * Feste deutsche Namensliste pro Schwierigkeitsstufe - jeder Name beginnt
 * bewusst mit dem Stufennamen, damit ein Bot niemals wie ein normaler
 * Spieler-Nickname wirkt (siehe Auftrag, Regel 10: Bots muessen immer
 * eindeutig erkennbar sein).
 */
const BOT_NAMES: Record<BotDifficulty, readonly string[]> = {
  welpe: ["Welpe Keks", "Welpe Bello", "Welpe Fiffi", "Welpe Waldi", "Welpe Nelly", "Welpe Struppi"],
  klaeffer: ["Kläffer Rudi", "Kläffer Hasso", "Kläffer Fritzi", "Kläffer Balu", "Kläffer Gustl", "Kläffer Molly"],
  "alptraum-dogge": [
    "Alptraum-Dogge Bruno",
    "Alptraum-Dogge Rex",
    "Alptraum-Dogge Thor",
    "Alptraum-Dogge Zorro",
    "Alptraum-Dogge Kaiser",
    "Alptraum-Dogge Ares",
  ],
};

export const BOT_DIFFICULTIES: readonly BotDifficulty[] = ["welpe", "klaeffer", "alptraum-dogge"];

function nextId(prefix: string, rand: () => number): string {
  return `${prefix}_${Math.floor(rand() * 1e12).toString(36)}`;
}

function pick<T>(items: readonly T[], rand: () => number): T {
  const index = Math.min(items.length - 1, Math.floor(rand() * items.length));
  return items[index]!;
}

/**
 * Avatar-Seed fuer Bots aus einem separaten, kleineren Wertebereich als bei
 * echten Spielern (siehe Auftrag) - Bots sehen sich untereinander aehnlicher
 * und dadurch als eigene, wiedererkennbare "Bot-Optik". Kein neues
 * Accessoire (accessory bleibt 0): das BOT-Abzeichen (siehe BotBadge.tsx)
 * ist der eindeutige Erkennungsweg, nicht ein Avatar-Merkmal, das ein echter
 * Spieler theoretisch auch zufaellig wuerfeln koennte.
 */
function createBotAvatarSeed(rand: () => number): AvatarSeed {
  return {
    headShape: Math.floor(rand() * 2),
    ears: Math.floor(rand() * 2),
    furColor: pick([1, 3], rand),
    furPattern: 0,
    eyes: pick([1, 3], rand),
    snout: 0,
    collarColor: 7,
    collarCharm: 0,
    accessory: 0,
    idleSeed: Math.floor(rand() * 1_000_000),
  };
}

/**
 * Erzeugt einen vollstaendigen Bot-"Spieler" fuer einen Lobby-Slot - laeuft
 * durch dieselben Datenstrukturen wie ein echter Spieler (Player), nur mit
 * gesetztem botDifficulty. deviceUuid ist bewusst klar als synthetisch
 * erkennbar (Praefix "bot:"), kann nie mit einer echten Geraete-UUID
 * kollidieren.
 */
export function createBotPlayer(difficulty: BotDifficulty, now: number, rand: () => number = Math.random): Player {
  const id = nextId("bot", rand) as PlayerId;
  return {
    id,
    deviceUuid: `bot:${difficulty}:${nextId("", rand)}`,
    nickname: pick(BOT_NAMES[difficulty], rand),
    avatar: createBotAvatarSeed(rand),
    connected: true,
    isHost: false,
    joinedAt: now,
    botDifficulty: difficulty,
  };
}

export function isBotPlayer(player: Pick<Player, "botDifficulty">): boolean {
  return player.botDifficulty !== undefined && player.botDifficulty !== null;
}

export function randomBotDifficulty(rand: () => number = Math.random): BotDifficulty {
  return pick(BOT_DIFFICULTIES, rand);
}

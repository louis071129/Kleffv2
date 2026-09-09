/**
 * Nickname-Filter: Blockliste (deutsch/englisch) mit Leetspeak-Normalisierung.
 * Bei Treffer wird ein generierter Zufallsname im Stil "Klaeffender Keks 42"
 * vergeben statt den Nickname abzulehnen (kein Retry-Loop fuer den Spieler noetig).
 *
 * Ehrlich dokumentiert (siehe README.md): diese Liste ist NICHT erschoepfend.
 * Sie deckt gaengige Beleidigungen, Slurs, sexuelle Begriffe und NS-Bezuege in
 * deutscher und englischer Sprache ab, kann aber umgangen werden (neue
 * Wortkombinationen, Umschreibungen, andere Sprachen). Sie ist eine
 * Reibungsbremse, kein vollstaendiger Schutz.
 */

const BLOCKLIST: readonly string[] = [
  // Deutsch - Beleidigungen / Vulgaer
  "arschloch",
  "wichser",
  "hurensohn",
  "fotze",
  "schlampe",
  "missgeburt",
  "spast",
  "spasti",
  "mongo",
  "behindert",
  "fick",
  "ficken",
  "scheisse",
  "scheiss",
  // Deutsch - NS-Bezuege
  "hitler",
  "nazi",
  "sieg heil",
  "88",
  "1488",
  "adolf",
  "auschwitz",
  "holocaust",
  // Deutsch - sexuell
  "nutte",
  "pimmel",
  "penis",
  "vagina",
  "porno",
  // Englisch - Beleidigungen / Slurs
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "whore",
  "slut",
  "bitch",
  "cunt",
  "rape",
  "rapist",
  // Englisch - vulgaer
  "fuck",
  "shit",
  "asshole",
  "dick",
  "pussy",
  "cock",
  // Englisch - NS-Bezuege
  "nazi",
  "hitler",
];

const LEETSPEAK_MAP: Readonly<Record<string, string>> = {
  "3": "e",
  "1": "i",
  "0": "o",
  "@": "a",
  $: "s",
  "!": "i",
  "+": "t",
};

export function normalizeForFilterCheck(input: string): string {
  const lower = input.toLowerCase();
  let normalized = "";
  for (const char of lower) {
    normalized += LEETSPEAK_MAP[char] ?? char;
  }
  return normalized.replace(/[^a-z0-9\säöüß]/gu, "");
}

export function isNicknameBlocked(nickname: string): boolean {
  const normalized = normalizeForFilterCheck(nickname);
  const compact = normalized.replace(/\s+/gu, "");
  return BLOCKLIST.some((word) => compact.includes(word.replace(/\s+/gu, "")));
}

const FALLBACK_ADJECTIVES: readonly string[] = [
  "Klaeffender",
  "Knurriger",
  "Verspielter",
  "Duesterer",
  "Flauschiger",
  "Mutiger",
  "Verschlafener",
  "Neugieriger",
  "Wilder",
  "Bruellender",
];

const FALLBACK_NOUNS: readonly string[] = [
  "Keks",
  "Knochen",
  "Kojote",
  "Waldschrat",
  "Terrier",
  "Dackel",
  "Wolf",
  "Husky",
  "Mops",
  "Schaeferhund",
];

/** Deterministische PRNG (mulberry32) fuer reproduzierbare Fallback-Namen in Tests. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateFallbackNickname(seed: number): string {
  const rand = mulberry32(seed);
  const adjective = FALLBACK_ADJECTIVES[Math.floor(rand() * FALLBACK_ADJECTIVES.length)] ?? "Klaeffender";
  const noun = FALLBACK_NOUNS[Math.floor(rand() * FALLBACK_NOUNS.length)] ?? "Keks";
  const number = Math.floor(rand() * 100);
  return `${adjective} ${noun} ${number}`;
}

/**
 * Prueft und saeubert einen Nickname. `seed` steuert den deterministischen
 * Fallback-Namen (z.B. aus der Spieler-ID abgeleitet), damit derselbe
 * gesperrte Nickname immer denselben Fallback bekommt.
 */
export function sanitizeNickname(nickname: string, seed: number): { nickname: string; wasBlocked: boolean } {
  const trimmed = nickname.trim();
  if (trimmed.length < 2 || trimmed.length > 20 || isNicknameBlocked(trimmed)) {
    return { nickname: generateFallbackNickname(seed), wasBlocked: true };
  }
  return { nickname: trimmed, wasBlocked: false };
}

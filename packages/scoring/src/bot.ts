import type { AudioFrame } from "./types.js";

/** Die drei Bot-Schwierigkeitsstufen, siehe Auftrag. */
export type BotDifficulty = "welpe" | "klaeffer" | "alptraum-dogge";

/** Frame-Intervall - identisch zu FRAME_INTERVAL_MS in score.ts (dort nicht exportiert). */
const FRAME_INTERVAL_MS = 20;

/**
 * Virtuelle Bot-Kalibrierung, gegen die die Zielbereiche unten kalibriert
 * sind - bewusst identisch zu DEFAULT_CALIBRATION in server/game-server.ts
 * (dort die Kalibrierung fuer Rundentimeouts). Bots haben kein echtes
 * Mikrofon und damit kein eigenes Kalibrierungsprofil; server/game-server.ts
 * wertet Bot-Frames mit genau dieser Kalibrierung aus, siehe dort. Aendert
 * sich DEFAULT_CALIBRATION dort, muessen die Bereiche hier neu kalibriert
 * werden (siehe BLOCKERS.md).
 */
const VIRTUAL_NOISE_FLOOR_DBFS = -50;

interface DifficultyTuning {
  /** Ziel-Peak in dBFS, [min, max] - bestimmt ueberwiegend den Loudness-Anteil. */
  readonly peakDbfsRange: readonly [number, number];
  /** Attack-Zeit in ms bis zum Peak, siehe Auftrag fuer die Stufen-Vorgaben. */
  readonly attackMsRange: readonly [number, number];
  /** Ziel-Crest (Peak minus aktiver RMS-Mittelwert) in dB, [min, max]. */
  readonly crestDbRange: readonly [number, number];
  /** Spektraler Schwerpunkt in Hz, [min, max] - naeher an 1400Hz = besserer Bell-Charakter. */
  readonly centroidHzRange: readonly [number, number];
  /** Spektrale Flachheit 0..1, [min, max] - 0.15..0.6 ist der optimale Bereich. */
  readonly flatnessRange: readonly [number, number];
  /** Abklingzeit nach dem Peak in ms. */
  readonly decayMsRange: readonly [number, number];
}

/**
 * Empirisch gegen die echte, unveraenderte scoreBark-Funktion kalibriert
 * (siehe packages/scoring/test/bot.test.ts) - Zielwerte sind Mittelwerte
 * ueber viele Stichproben, keine Einzelrunden-Garantie. Die Bereiche kodieren
 * sowohl die geforderten Mittelwerte als auch die geforderte Streuung
 * (Welpe hoch, Kläffer mittel, Alptraum-Dogge gering).
 */
const TUNING: Record<BotDifficulty, DifficultyTuning> = {
  welpe: {
    peakDbfsRange: [-38, -14],
    attackMsRange: [150, 350],
    crestDbRange: [2, 14],
    centroidHzRange: [500, 2400],
    flatnessRange: [0.05, 0.9],
    decayMsRange: [120, 320],
  },
  klaeffer: {
    peakDbfsRange: [-30, -18],
    attackMsRange: [60, 150],
    crestDbRange: [3, 7],
    centroidHzRange: [700, 2200],
    flatnessRange: [0.08, 0.75],
    decayMsRange: [150, 280],
  },
  "alptraum-dogge": {
    peakDbfsRange: [-17, -10],
    attackMsRange: [30, 70],
    crestDbRange: [3, 7],
    centroidHzRange: [1250, 1550],
    flatnessRange: [0.18, 0.55],
    decayMsRange: [180, 260],
  },
};

/** Deterministische PRNG (mulberry32) - gleiches Verfahren wie scripts/gen-fixtures.ts, damit Seeds reproduzierbar sind. */
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

/** Simpler deterministischer String-Hash (FNV-1a) - macht aus einem beliebigen String-Seed einen Zahlen-Seed fuer mulberry32. */
function hashStringToSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

function randInRange(rand: () => number, range: readonly [number, number]): number {
  return lerp(range[0], range[1], rand());
}

/**
 * Erzeugt eine plausible, deterministische AudioFrame-Sequenz fuer einen
 * Bot-Bell, passend zur gewaehlten Schwierigkeit. Laeuft durch dieselbe,
 * unveraenderte scoreBark-Funktion wie ein echter Spieler (siehe score.ts) -
 * kein zweiter Scoring-Pfad. Gleicher Seed erzeugt immer dieselben Frames.
 */
export function generateSyntheticBarkFrames(params: { readonly seed: string; readonly difficulty: BotDifficulty }): AudioFrame[] {
  const rand = mulberry32(hashStringToSeed(params.seed));
  const tuning = TUNING[params.difficulty];

  const peakDbfs = randInRange(rand, tuning.peakDbfsRange);
  const attackMs = randInRange(rand, tuning.attackMsRange);
  const crestDb = randInRange(rand, tuning.crestDbRange);
  const centroidHz = randInRange(rand, tuning.centroidHzRange);
  const flatness = randInRange(rand, tuning.flatnessRange);
  const decayMs = randInRange(rand, tuning.decayMsRange);

  // Vor-Stille: ein paar Frames deutlich unter der Aktiv-Schwelle, wie beim
  // echten Bellfenster vor dem eigentlichen Bell.
  const preSilenceMs = randInRange(rand, [80, 220]);
  // Attack-Rampe: startet EXAKT bei (peakDbfs - 20dB), damit die von
  // scoreBark gemessene Attack-Zeit (Zeit vom Ueberschreiten dieser Schwelle
  // bis zum Peak) exakt attackMs entspricht - siehe score.ts attackThreshold.
  const rampStartDbfs = peakDbfs - 20;
  const rampFrameCount = Math.max(1, Math.round(attackMs / FRAME_INTERVAL_MS));
  // Kurzes Plateau nahe am Peak, dann exponentieller Abfall.
  const plateauFrameCount = 2;
  const decayFrameCount = Math.max(1, Math.round(decayMs / FRAME_INTERVAL_MS));
  const postSilenceMs = 100;

  const frames: AudioFrame[] = [];
  let t = 0;

  const pushFrame = (peak: number, active: boolean): void => {
    const rms = active ? peak - crestDb : peak - 6;
    // Charakter (Centroid/Flatness) nur bei aktiven Frames relevant - bei
    // Stille trotzdem plausible, neutrale Werte statt 0.
    const frameCentroid = active ? centroidHz + (rand() - 0.5) * 60 : 1400;
    const frameFlatness = active ? clamp01(flatness + (rand() - 0.5) * 0.05) : 0.3;
    frames.push({
      t,
      peakDbfs: peak,
      rmsDbfs: rms,
      centroidHz: Math.max(0, frameCentroid),
      flatness: frameFlatness,
      clipped: false,
    });
    t += FRAME_INTERVAL_MS;
  };

  // Vor-Stille (inaktiv).
  for (let i = 0; i < Math.round(preSilenceMs / FRAME_INTERVAL_MS); i += 1) {
    pushFrame(VIRTUAL_NOISE_FLOOR_DBFS + (rand() - 0.5) * 4, false);
  }

  // Attack-Rampe von (peak-20dB) bis peak - erster Frame ist exakt die
  // Schwelle (crossFrame), letzter Frame der Rampe ist der Peak-Frame.
  for (let i = 0; i < rampFrameCount; i += 1) {
    const fraction = rampFrameCount === 1 ? 1 : i / (rampFrameCount - 1);
    pushFrame(lerp(rampStartDbfs, peakDbfs, fraction), true);
  }

  // Kurzes Plateau am Peak.
  for (let i = 0; i < plateauFrameCount; i += 1) {
    pushFrame(peakDbfs, true);
  }

  // Exponentieller Abfall zurueck Richtung Rauschboden.
  for (let i = 0; i < decayFrameCount; i += 1) {
    const fraction = (i + 1) / decayFrameCount;
    const decayed = peakDbfs - fraction * fraction * (peakDbfs - VIRTUAL_NOISE_FLOOR_DBFS);
    pushFrame(decayed, decayed > VIRTUAL_NOISE_FLOOR_DBFS + 10);
  }

  // Nach-Stille (inaktiv).
  for (let i = 0; i < Math.round(postSilenceMs / FRAME_INTERVAL_MS); i += 1) {
    pushFrame(VIRTUAL_NOISE_FLOOR_DBFS + (rand() - 0.5) * 4, false);
  }

  return frames;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

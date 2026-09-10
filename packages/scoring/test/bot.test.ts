import { describe, expect, it } from "vitest";
import { generateSyntheticBarkFrames, type BotDifficulty } from "../src/bot.js";
import { scoreBark } from "../src/score.js";
import type { AudioFrame, CalibrationProfile } from "../src/types.js";

/**
 * Virtuelle Bot-Kalibrierung, identisch zu DEFAULT_CALIBRATION in
 * server/game-server.ts - dort werten Bot-Frames tatsaechlich damit aus,
 * siehe bot.ts fuer die Begruendung.
 */
const VIRTUAL_BOT_CAL: CalibrationProfile = {
  noiseFloorDbfs: -50,
  refVoiceDbfs: -30,
  maxObservedDbfs: -3,
  headroomDb: 47,
  agcActive: false,
  calibratedAt: 0,
};

const SAMPLE_SIZE = 200;

/** Erwartete Mittelwert-Toleranzbaender, siehe Auftrag: Welpe ~45, Kläffer ~65, Alptraum-Dogge ~82. */
const EXPECTED_MEAN: Record<BotDifficulty, { readonly target: number; readonly tolerance: number }> = {
  welpe: { target: 45, tolerance: 10 },
  klaeffer: { target: 65, tolerance: 10 },
  "alptraum-dogge": { target: 82, tolerance: 10 },
};

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values: readonly number[]): number {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

function sampleScores(difficulty: BotDifficulty, count: number): number[] {
  const scores: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const frames: AudioFrame[] = generateSyntheticBarkFrames({ seed: `${difficulty}-sample-${i}`, difficulty });
    scores.push(scoreBark(frames, VIRTUAL_BOT_CAL).total);
  }
  return scores;
}

describe("generateSyntheticBarkFrames - laeuft durch die unveraenderte scoreBark-Funktion", () => {
  (["welpe", "klaeffer", "alptraum-dogge"] as const).forEach((difficulty) => {
    it(`${difficulty}: Mittelwert ueber ${SAMPLE_SIZE} Stichproben liegt im erwarteten Toleranzband`, () => {
      const scores = sampleScores(difficulty, SAMPLE_SIZE);
      const m = mean(scores);
      const { target, tolerance } = EXPECTED_MEAN[difficulty];
      expect(m).toBeGreaterThanOrEqual(target - tolerance);
      expect(m).toBeLessThanOrEqual(target + tolerance);
    });

    it(`${difficulty}: keine Stichprobe erzeugt NaN, Infinity oder einen negativen Score`, () => {
      const scores = sampleScores(difficulty, SAMPLE_SIZE);
      for (const score of scores) {
        expect(Number.isFinite(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
      }
    });

    it(`${difficulty}: gleicher Seed erzeugt identische Frames`, () => {
      const a = generateSyntheticBarkFrames({ seed: "reproduzierbar-42", difficulty });
      const b = generateSyntheticBarkFrames({ seed: "reproduzierbar-42", difficulty });
      expect(a).toEqual(b);
    });

    it(`${difficulty}: unterschiedliche Seeds erzeugen sichtbar unterschiedliche Frames`, () => {
      const a = generateSyntheticBarkFrames({ seed: "seed-a", difficulty });
      const b = generateSyntheticBarkFrames({ seed: "seed-b", difficulty });
      expect(a).not.toEqual(b);
    });
  });

  it("Streuung sinkt von Welpe ueber Kläffer zu Alptraum-Dogge (hoch -> mittel -> gering)", () => {
    const welpe = stdev(sampleScores("welpe", SAMPLE_SIZE));
    const klaeffer = stdev(sampleScores("klaeffer", SAMPLE_SIZE));
    const alptraumDogge = stdev(sampleScores("alptraum-dogge", SAMPLE_SIZE));
    expect(welpe).toBeGreaterThan(klaeffer);
    expect(klaeffer).toBeGreaterThan(alptraumDogge);
  });

  it("bricht nie das Anti-Cheat-System (Bot-Frames sind server-generiert, keine Flags noetig)", () => {
    for (const difficulty of ["welpe", "klaeffer", "alptraum-dogge"] as const) {
      for (let i = 0; i < 30; i += 1) {
        const frames = generateSyntheticBarkFrames({ seed: `${difficulty}-flags-${i}`, difficulty });
        const score = scoreBark(frames, VIRTUAL_BOT_CAL);
        expect(score.flags).toEqual([]);
      }
    }
  });

  it("liefert nie ein leeres Frame-Array", () => {
    for (const difficulty of ["welpe", "klaeffer", "alptraum-dogge"] as const) {
      const frames = generateSyntheticBarkFrames({ seed: `${difficulty}-nonempty`, difficulty });
      expect(frames.length).toBeGreaterThan(0);
    }
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeWav } from "../src/wav.js";
import { extractFrames, createStreamingFrameExtractor } from "../src/dsp.js";
import { scoreBark } from "../src/score.js";
import type { AudioFrame, CalibrationProfile } from "../src/types.js";

const FIXTURES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "fixtures",
  "audio",
);

function loadFrames(name: string): AudioFrame[] {
  const buffer = readFileSync(path.join(FIXTURES_DIR, `${name}.wav`));
  const wav = decodeWav(buffer);
  return extractFrames(wav.samples, wav.sampleRate);
}

/** Typische kalibrierte Standard-Kalibrierung: Kalibrierungs-Bell erreichte -3 dBFS. */
const STANDARD_CAL: CalibrationProfile = {
  noiseFloorDbfs: -52,
  refVoiceDbfs: -30,
  maxObservedDbfs: -3,
  headroomDb: 49,
  agcActive: false,
  calibratedAt: 0,
};

/** Persoenliche Kalibrierung eines leiseren Geraets/Spielers: Kalibrierungs-Bell erreichte nur -22 dBFS. */
const QUIET_PERSONAL_CAL: CalibrationProfile = {
  noiseFloorDbfs: -58,
  refVoiceDbfs: -33,
  maxObservedDbfs: -22,
  headroomDb: 36,
  agcActive: false,
  calibratedAt: 0,
};

describe("extractFrames vs. createStreamingFrameExtractor", () => {
  it("liefern fuer dieselbe Datei framegleiche Ergebnisse (Offline- und Streaming-Pfad)", () => {
    const buffer = readFileSync(path.join(FIXTURES_DIR, "bark-loud.wav"));
    const wav = decodeWav(buffer);

    const batch = extractFrames(wav.samples, wav.sampleRate);

    const streamer = createStreamingFrameExtractor(wav.sampleRate);
    const streamed: AudioFrame[] = [];
    const BLOCK_SIZE = 128; // wie im echten AudioWorklet
    for (let i = 0; i < wav.samples.length; i += BLOCK_SIZE) {
      const block = wav.samples.slice(i, Math.min(i + BLOCK_SIZE, wav.samples.length));
      streamed.push(...streamer.pushBlock(block));
    }

    expect(streamed.length).toBe(batch.length);
    for (let i = 0; i < batch.length; i += 1) {
      expect(streamed[i]).toEqual(batch[i]);
    }
  });
});

describe("scoreBark - Kernkomponenten", () => {
  it("bewertet bark-loud hoch (> 78)", () => {
    const score = scoreBark(loadFrames("bark-loud"), STANDARD_CAL);
    expect(score.total).toBeGreaterThan(78);
  });

  it("bewertet bark-quiet mit passender (eigener) Kalibrierung hoch (> 60)", () => {
    const score = scoreBark(loadFrames("bark-quiet"), QUIET_PERSONAL_CAL);
    expect(score.total).toBeGreaterThan(60);
  });

  it("FAIRNESS: leises Bellen mit eigener Kalibrierung schlaegt lautes Schreien mit lauter Kalibrierung", () => {
    const quietBarkOwnCal = scoreBark(loadFrames("bark-quiet"), QUIET_PERSONAL_CAL);
    const screamLoudCal = scoreBark(loadFrames("scream"), STANDARD_CAL);
    expect(quietBarkOwnCal.total).toBeGreaterThan(screamLoudCal.total);
  });

  it("bewertet scream niedrig (< 55) - Attack und Bell-Charakter fehlen", () => {
    const score = scoreBark(loadFrames("scream"), STANDARD_CAL);
    expect(score.total).toBeLessThan(55);
  });

  it("bewertet whine niedrig (< 35) - kein Attack, kein Punch, lange Dauer", () => {
    const score = scoreBark(loadFrames("whine"), STANDARD_CAL);
    expect(score.total).toBeLessThan(35);
  });

  it("bewertet silence nahezu null (< 5)", () => {
    const score = scoreBark(loadFrames("silence"), STANDARD_CAL);
    expect(score.total).toBeLessThan(5);
  });

  it("markiert clipped mit MIC_OVERLOAD", () => {
    const score = scoreBark(loadFrames("clipped"), STANDARD_CAL);
    expect(score.flags).toContain("MIC_OVERLOAD");
    expect(score.breakdown.loudness).toBeLessThanOrEqual(42);
  });

  it("erkennt REPLAY_SUSPECT bei identischen Frames zweier Runden", () => {
    const frames = loadFrames("bark-loud");
    const previousEnvelope = frames.map((f) => f.rmsDbfs);
    const score = scoreBark(frames, STANDARD_CAL, { previousRoundEnvelopes: [previousEnvelope] });
    expect(score.flags).toContain("REPLAY_SUSPECT");
    expect(score.total).toBeLessThanOrEqual(60);
  });

  it("setzt kein REPLAY_SUSPECT bei unterschiedlichen Runden", () => {
    const barkFrames = loadFrames("bark-loud");
    const screamEnvelope = loadFrames("scream").map((f) => f.rmsDbfs);
    const score = scoreBark(barkFrames, STANDARD_CAL, { previousRoundEnvelopes: [screamEnvelope] });
    expect(score.flags).not.toContain("REPLAY_SUSPECT");
  });

  it("markiert CALIBRATION_MISMATCH wenn der Peak deutlich ueber dem kalibrierten Maximum liegt", () => {
    const mismatchedCal: CalibrationProfile = { ...STANDARD_CAL, maxObservedDbfs: -40, headroomDb: 12 };
    const score = scoreBark(loadFrames("bark-loud"), mismatchedCal);
    expect(score.flags).toContain("CALIBRATION_MISMATCH");
  });

  it("ist deterministisch: gleiche Eingabe liefert bit-identischen Score", () => {
    const frames = loadFrames("bark-loud");
    const a = scoreBark(frames, STANDARD_CAL);
    const b = scoreBark(frames, STANDARD_CAL);
    expect(a).toEqual(b);
  });

  it("AGC-Modus veraendert die Rangfolge zwischen bark-loud und scream nicht", () => {
    const agcCal: CalibrationProfile = { ...STANDARD_CAL, agcActive: true };
    const barkNormal = scoreBark(loadFrames("bark-loud"), STANDARD_CAL);
    const screamNormal = scoreBark(loadFrames("scream"), STANDARD_CAL);
    const barkAgc = scoreBark(loadFrames("bark-loud"), agcCal);
    const screamAgc = scoreBark(loadFrames("scream"), agcCal);

    expect(barkNormal.total).toBeGreaterThan(screamNormal.total);
    expect(barkAgc.total).toBeGreaterThan(screamAgc.total);
  });

  it("leeres Frame-Array ergibt Score 0 ohne Fehler", () => {
    const score = scoreBark([], STANDARD_CAL);
    expect(score.total).toBe(0);
    expect(score.flags).toEqual([]);
  });
});

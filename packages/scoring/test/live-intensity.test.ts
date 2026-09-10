import { describe, expect, it } from "vitest";
import { computeLiveIntensity } from "../src/live-intensity.js";
import type { AudioFrame, CalibrationProfile } from "../src/types.js";

const CAL: CalibrationProfile = {
  noiseFloorDbfs: -50,
  refVoiceDbfs: -30,
  maxObservedDbfs: -3,
  headroomDb: 47,
  agcActive: false,
  calibratedAt: 0,
};

function makeFrames(peakDbfs: number, count = 8, clipped = false): AudioFrame[] {
  const frames: AudioFrame[] = [];
  for (let i = 0; i < count; i += 1) {
    frames.push({ t: i * 20, peakDbfs, rmsDbfs: peakDbfs - 8, centroidHz: 1400, flatness: 0.3, clipped });
  }
  return frames;
}

describe("computeLiveIntensity", () => {
  it("leeres Frame-Array liefert 0 ohne Fehler", () => {
    expect(computeLiveIntensity([], CAL)).toEqual({ intensity: 0, flags: [] });
  });

  it("Stille (unter der Aktiv-Schwelle) liefert 0", () => {
    const result = computeLiveIntensity(makeFrames(-55), CAL);
    expect(result.intensity).toBe(0);
    expect(result.flags).toEqual([]);
  });

  it("lauter Tick liefert hohe Intensitaet", () => {
    const result = computeLiveIntensity(makeFrames(-5), CAL);
    expect(result.intensity).toBeGreaterThan(80);
    expect(result.flags).toEqual([]);
  });

  it("Intensitaet steigt monoton mit der Lautstaerke", () => {
    const quiet = computeLiveIntensity(makeFrames(-40), CAL).intensity;
    const medium = computeLiveIntensity(makeFrames(-25), CAL).intensity;
    const loud = computeLiveIntensity(makeFrames(-5), CAL).intensity;
    expect(quiet).toBeLessThan(medium);
    expect(medium).toBeLessThan(loud);
  });

  it("gleicher Peak, mehr Frames im Tick -> keine Bestrafung fuer Durchhalten (kein Howl-Penalty)", () => {
    const short = computeLiveIntensity(makeFrames(-5, 3), CAL).intensity;
    const long = computeLiveIntensity(makeFrames(-5, 30), CAL).intensity;
    expect(long).toBe(short);
  });

  it("MIC_OVERLOAD bei ueberwiegend geclippten Frames, deckelt die Intensitaet", () => {
    const result = computeLiveIntensity(makeFrames(-1, 8, true), CAL);
    expect(result.flags).toContain("MIC_OVERLOAD");
    expect(result.intensity).toBeLessThanOrEqual(55);
  });

  it("vereinzeltes Clipping loest MIC_OVERLOAD nicht aus", () => {
    const frames = makeFrames(-5, 8, false);
    frames[0] = { ...frames[0]!, clipped: true };
    const result = computeLiveIntensity(frames, CAL);
    expect(result.flags).not.toContain("MIC_OVERLOAD");
  });

  it("CALIBRATION_MISMATCH wenn der Peak deutlich ueber dem kalibrierten Maximum liegt", () => {
    const result = computeLiveIntensity(makeFrames(10), CAL);
    expect(result.flags).toContain("CALIBRATION_MISMATCH");
  });

  it("liefert nie NaN oder Infinity, auch bei extremen Eingaben", () => {
    const extremes = [-1000, -1, 0, 1000];
    for (const peak of extremes) {
      const result = computeLiveIntensity(makeFrames(peak), CAL);
      expect(Number.isFinite(result.intensity)).toBe(true);
      expect(result.intensity).toBeGreaterThanOrEqual(0);
      expect(result.intensity).toBeLessThanOrEqual(100);
    }
  });

  it("ist deterministisch (reine Funktion)", () => {
    const frames = makeFrames(-12, 10);
    const a = computeLiveIntensity(frames, CAL);
    const b = computeLiveIntensity(frames, CAL);
    expect(a).toEqual(b);
  });

  it("Intensitaet ist immer im Bereich 0..100", () => {
    for (const peak of [-80, -50, -30, -10, -3, 0, 10]) {
      const { intensity } = computeLiveIntensity(makeFrames(peak), CAL);
      expect(intensity).toBeGreaterThanOrEqual(0);
      expect(intensity).toBeLessThanOrEqual(100);
    }
  });
});

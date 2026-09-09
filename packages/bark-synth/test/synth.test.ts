import { describe, expect, it } from "vitest";
import type { AudioFrame } from "@klaeff/scoring";
import {
  computeAttackSharpness,
  computeEnvelopeParams,
  computeFrameParams,
  mapCentroidToPitchHz,
  mapLevelToGain,
  MAX_PITCH_HZ,
  MIN_PITCH_HZ,
} from "../src/index.js";

function frame(overrides: Partial<AudioFrame> = {}): AudioFrame {
  return {
    t: 0,
    peakDbfs: -40,
    rmsDbfs: -45,
    centroidHz: 1400,
    flatness: 0.3,
    clipped: false,
    ...overrides,
  };
}

describe("mapCentroidToPitchHz", () => {
  it("bleibt fuer normale Sprachwerte im 200-900Hz-Zielbereich", () => {
    const pitch = mapCentroidToPitchHz(1400);
    expect(pitch).toBeGreaterThanOrEqual(MIN_PITCH_HZ);
    expect(pitch).toBeLessThanOrEqual(MAX_PITCH_HZ);
  });

  it("bleibt bei extrem hohen centroidHz-Werten innerhalb des Zielbereichs", () => {
    expect(mapCentroidToPitchHz(50_000)).toBe(MAX_PITCH_HZ);
    expect(mapCentroidToPitchHz(Number.POSITIVE_INFINITY)).toBe(MAX_PITCH_HZ);
  });

  it("bleibt bei sehr niedrigen/negativen centroidHz-Werten innerhalb des Zielbereichs", () => {
    expect(mapCentroidToPitchHz(0)).toBe(MIN_PITCH_HZ);
    expect(mapCentroidToPitchHz(-500)).toBe(MIN_PITCH_HZ);
  });

  it("liefert bei NaN einen gueltigen Wert statt NaN", () => {
    const pitch = mapCentroidToPitchHz(Number.NaN);
    expect(Number.isFinite(pitch)).toBe(true);
    expect(pitch).toBeGreaterThanOrEqual(MIN_PITCH_HZ);
    expect(pitch).toBeLessThanOrEqual(MAX_PITCH_HZ);
  });

  it("ist monoton steigend (hoehere Stimme -> hoehere Synth-Tonhoehe)", () => {
    expect(mapCentroidToPitchHz(2000)).toBeGreaterThan(mapCentroidToPitchHz(500));
  });

  it("ist deterministisch", () => {
    expect(mapCentroidToPitchHz(1234)).toBe(mapCentroidToPitchHz(1234));
  });
});

describe("mapLevelToGain", () => {
  it("liefert nahe 0 bei Stille (tief unter dem Rauschboden)", () => {
    expect(mapLevelToGain(-70, -75)).toBeLessThan(0.05);
  });

  it("liefert nahe 1 bei sehr lautem Signal", () => {
    expect(mapLevelToGain(-2, -5)).toBeGreaterThan(0.9);
  });

  it("bleibt immer in [0,1], auch bei NaN/Infinity", () => {
    expect(mapLevelToGain(Number.NaN, Number.NaN)).toBe(0);
    expect(mapLevelToGain(Number.POSITIVE_INFINITY, -50)).toBeLessThanOrEqual(1);
    expect(mapLevelToGain(Number.NEGATIVE_INFINITY, -50)).toBeGreaterThanOrEqual(0);
  });
});

describe("computeAttackSharpness", () => {
  it("liefert 0 bei leerem Fenster", () => {
    expect(computeAttackSharpness([])).toBe(0);
  });

  it("liefert 0 bei komplett stillem Fenster (kein Anstieg)", () => {
    const silence = Array.from({ length: 10 }, (_, i) => frame({ t: i * 20, peakDbfs: -60, rmsDbfs: -65 }));
    expect(computeAttackSharpness(silence)).toBe(0);
  });

  it("liefert einen hohen Wert bei sehr hartem, schnellem Anschlag", () => {
    const sharp = [
      frame({ t: 0, peakDbfs: -60 }),
      frame({ t: 20, peakDbfs: -55 }),
      frame({ t: 40, peakDbfs: -10 }), // < 60ms von -60 auf Peak
    ];
    expect(computeAttackSharpness(sharp)).toBeGreaterThan(0.9);
  });

  it("liefert einen niedrigen Wert bei langsamem Anschleichen", () => {
    // Sehr sanfte Rampe: die letzten 20dB vor dem Peak ziehen sich ueber
    // 800ms hin (>> die 400ms-Nullschwelle), also praktisch kein "Anschlag".
    const soft = Array.from({ length: 60 }, (_, i) => frame({ t: i * 20, peakDbfs: -60 + i * 0.5 }));
    expect(computeAttackSharpness(soft)).toBeLessThan(0.1);
  });

  it("ist deterministisch fuer identische Eingabe", () => {
    const frames = [frame({ t: 0, peakDbfs: -60 }), frame({ t: 20, peakDbfs: -10 })];
    expect(computeAttackSharpness(frames)).toBe(computeAttackSharpness(frames));
  });
});

describe("computeFrameParams", () => {
  it("liefert nie NaN/Infinity, auch bei einem Extremwert-Frame", () => {
    const extreme = frame({
      centroidHz: Number.NaN,
      peakDbfs: Number.NaN,
      rmsDbfs: Number.NEGATIVE_INFINITY,
      flatness: Number.NaN,
    });
    const params = computeFrameParams(extreme);
    expect(Number.isFinite(params.pitchHz)).toBe(true);
    expect(Number.isFinite(params.gain)).toBe(true);
    expect(Number.isFinite(params.noiseMix)).toBe(true);
    expect(params.pitchHz).toBeGreaterThanOrEqual(MIN_PITCH_HZ);
    expect(params.pitchHz).toBeLessThanOrEqual(MAX_PITCH_HZ);
    expect(params.gain).toBeGreaterThanOrEqual(0);
    expect(params.gain).toBeLessThanOrEqual(1);
    expect(params.noiseMix).toBeGreaterThanOrEqual(0);
    expect(params.noiseMix).toBeLessThanOrEqual(1);
  });

  it("ist deterministisch", () => {
    const f = frame();
    expect(computeFrameParams(f)).toEqual(computeFrameParams(f));
  });
});

describe("computeEnvelopeParams", () => {
  it("wirft nie und liefert bei Stille-Input benigne Defaults", () => {
    expect(() => computeEnvelopeParams([])).not.toThrow();
    const envelope = computeEnvelopeParams([frame({ peakDbfs: -60, rmsDbfs: -65 })]);
    expect(Number.isFinite(envelope.attackSharpness)).toBe(true);
    expect(envelope.attackSharpness).toBeGreaterThanOrEqual(0);
    expect(envelope.attackSharpness).toBeLessThanOrEqual(1);
  });
});

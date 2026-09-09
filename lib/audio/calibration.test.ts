import { describe, expect, it } from "vitest";
import {
  MIN_HEADROOM_DB,
  buildCalibrationProfile,
  computeMaxObservedDbfs,
  computeNoiseFloorDbfs,
  computeRefVoiceDbfs,
} from "./calibration";
import type { AudioFrame } from "@klaeff/scoring";

function frame(peakDbfs: number, rmsDbfs = peakDbfs - 6): AudioFrame {
  return { t: 0, peakDbfs, rmsDbfs, centroidHz: 1000, flatness: 0.3, clipped: false };
}

describe("calibration", () => {
  it("noiseFloorDbfs ist der Median der RMS-Werte", () => {
    const frames = [frame(-60, -60), frame(-58, -58), frame(-62, -62)];
    expect(computeNoiseFloorDbfs(frames)).toBe(-60);
  });

  it("refVoiceDbfs ist das 75. Perzentil der Peak-Werte", () => {
    const frames = [-40, -35, -30, -25].map((p) => frame(p));
    const result = computeRefVoiceDbfs(frames);
    expect(result).toBeGreaterThan(-32);
    expect(result).toBeLessThanOrEqual(-25);
  });

  it("maxObservedDbfs ist der Peak des Test-Bells", () => {
    const frames = [frame(-20), frame(-5), frame(-15)];
    expect(computeMaxObservedDbfs(frames)).toBe(-5);
  });

  it("lehnt zu leise Kalibrierung ab (headroom < 12dB)", () => {
    const silence = Array.from({ length: 10 }, () => frame(-50, -50));
    const voice = Array.from({ length: 10 }, () => frame(-42));
    const testBark = Array.from({ length: 5 }, () => frame(-45));
    const outcome = buildCalibrationProfile(silence, voice, testBark, false, 0);
    expect(outcome.accepted).toBe(false);
    expect(outcome.rejectionReason).toBe("TOO_QUIET");
    expect(outcome.profile.headroomDb).toBeLessThan(MIN_HEADROOM_DB);
  });

  it("akzeptiert eine normale Kalibrierung", () => {
    const silence = Array.from({ length: 10 }, () => frame(-55, -55));
    const voice = Array.from({ length: 10 }, () => frame(-30));
    const testBark = Array.from({ length: 5 }, () => frame(-5));
    const outcome = buildCalibrationProfile(silence, voice, testBark, false, 123);
    expect(outcome.accepted).toBe(true);
    expect(outcome.rejectionReason).toBeNull();
    expect(outcome.profile.calibratedAt).toBe(123);
    expect(outcome.profile.headroomDb).toBeGreaterThanOrEqual(MIN_HEADROOM_DB);
  });

  it("warnt bei lautem Raum, laesst aber durch", () => {
    const silence = Array.from({ length: 10 }, () => frame(-30, -30));
    const voice = Array.from({ length: 10 }, () => frame(-20));
    const testBark = Array.from({ length: 5 }, () => frame(0));
    const outcome = buildCalibrationProfile(silence, voice, testBark, false, 0);
    expect(outcome.noisyRoomWarning).toBe(true);
    expect(outcome.accepted).toBe(true);
  });

  it("uebernimmt das agcActive-Flag ins Profil", () => {
    const silence = Array.from({ length: 10 }, () => frame(-55, -55));
    const voice = Array.from({ length: 10 }, () => frame(-30));
    const testBark = Array.from({ length: 5 }, () => frame(-5));
    const outcome = buildCalibrationProfile(silence, voice, testBark, true, 0);
    expect(outcome.profile.agcActive).toBe(true);
  });
});

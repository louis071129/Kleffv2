import type { AudioFrame, CalibrationProfile } from "@klaeff/scoring";

export const MIN_HEADROOM_DB = 12;
export const NOISY_ROOM_WARNING_THRESHOLD_DBFS = -35;

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return -100;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? -100;
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    return -100;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const lower = sorted[lowerIndex] ?? sorted[0] ?? -100;
  const upper = sorted[upperIndex] ?? lower;
  const fraction = rank - lowerIndex;
  return lower + (upper - lower) * fraction;
}

export function computeNoiseFloorDbfs(silenceFrames: readonly AudioFrame[]): number {
  return median(silenceFrames.map((f) => f.rmsDbfs));
}

export function computeRefVoiceDbfs(voiceFrames: readonly AudioFrame[]): number {
  return percentile(
    voiceFrames.map((f) => f.peakDbfs),
    75,
  );
}

export function computeMaxObservedDbfs(testBarkFrames: readonly AudioFrame[]): number {
  if (testBarkFrames.length === 0) {
    return -100;
  }
  return Math.max(...testBarkFrames.map((f) => f.peakDbfs));
}

export type CalibrationRejectionReason = "TOO_QUIET";

export interface CalibrationOutcome {
  readonly accepted: boolean;
  readonly rejectionReason: CalibrationRejectionReason | null;
  readonly noisyRoomWarning: boolean;
  readonly profile: CalibrationProfile;
}

/**
 * Wertet die drei Kalibrierungsschritte zu einem Profil aus. headroomDb < 12
 * -> ablehnen ("Mikro hoert fast nichts"), noiseFloorDbfs > -35 -> warnen
 * aber durchlassen.
 */
export function buildCalibrationProfile(
  silenceFrames: readonly AudioFrame[],
  voiceFrames: readonly AudioFrame[],
  testBarkFrames: readonly AudioFrame[],
  agcActive: boolean,
  now: number,
): CalibrationOutcome {
  const noiseFloorDbfs = computeNoiseFloorDbfs(silenceFrames);
  const refVoiceDbfs = computeRefVoiceDbfs(voiceFrames);
  const maxObservedDbfs = computeMaxObservedDbfs(testBarkFrames);
  const headroomDb = maxObservedDbfs - noiseFloorDbfs;

  const profile: CalibrationProfile = {
    noiseFloorDbfs,
    refVoiceDbfs,
    maxObservedDbfs,
    headroomDb,
    agcActive,
    calibratedAt: now,
  };

  return {
    accepted: headroomDb >= MIN_HEADROOM_DB,
    rejectionReason: headroomDb < MIN_HEADROOM_DB ? "TOO_QUIET" : null,
    noisyRoomWarning: noiseFloorDbfs > NOISY_ROOM_WARNING_THRESHOLD_DBFS,
    profile,
  };
}

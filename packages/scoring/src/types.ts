/** Ein einzelner Analyse-Frame aus dem AudioWorklet, alle 20 ms (50 Hz). */
export interface AudioFrame {
  /** Millisekunden seit Fensterstart. */
  readonly t: number;
  readonly peakDbfs: number;
  readonly rmsDbfs: number;
  /** Spektraler Schwerpunkt in Hz (FFT 1024, Hann-Fenster). */
  readonly centroidHz: number;
  /** Spektrale Flachheit, 0..1. */
  readonly flatness: number;
  readonly clipped: boolean;
}

/** Pro-Geraet-Kalibrierungsprofil, persistiert in localStorage. */
export interface CalibrationProfile {
  readonly noiseFloorDbfs: number;
  readonly refVoiceDbfs: number;
  readonly maxObservedDbfs: number;
  readonly headroomDb: number;
  readonly agcActive: boolean;
  readonly calibratedAt: number;
}

export type AntiCheatFlag = "MIC_OVERLOAD" | "REPLAY_SUSPECT" | "CALIBRATION_MISMATCH";

export interface BarkScoreBreakdown {
  readonly loudness: number;
  readonly attack: number;
  readonly crest: number;
  readonly character: number;
}

export interface BarkScore {
  readonly total: number;
  readonly breakdown: BarkScoreBreakdown;
  readonly flags: readonly AntiCheatFlag[];
  readonly peakDbfs: number;
  readonly peakTimeMs: number;
  readonly activeDurationMs: number;
}

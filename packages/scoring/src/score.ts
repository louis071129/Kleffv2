import type { AntiCheatFlag, AudioFrame, BarkScore, CalibrationProfile } from "./types.js";

/** Frame-Intervall des AudioWorklet: 50 Hz = alle 20 ms ein Frame. */
const FRAME_INTERVAL_MS = 20;
/** Frames gelten als "aktiv" ab noiseFloor + diesem Margin. */
const ACTIVE_RMS_MARGIN_DB = 10;

const LOUDNESS_MAX = 50;
const LOUDNESS_MAX_AGC = 35;
const ATTACK_MAX = 20;
const ATTACK_MAX_AGC = 27.5;
const CREST_MAX = 15;
const CREST_MAX_AGC = 22.5;
const CHARACTER_MAX = 15;

const ATTACK_FULL_MS = 60;
const ATTACK_ZERO_MS = 400;
const CREST_ZERO_DB = 4;
const CREST_FULL_DB = 14;

const CENTROID_TARGET_HZ = 1400;
const CENTROID_SIGMA_HZ = 1200;
const FLATNESS_OPTIMUM_LOW = 0.15;
const FLATNESS_OPTIMUM_HIGH = 0.6;

const SHORT_DURATION_THRESHOLD_MS = 120;
const SHORT_DURATION_PENALTY = 0.6;
const HOWL_DURATION_THRESHOLD_MS = 2200;
const HOWL_PENALTY = 0.85;

const MIC_OVERLOAD_CONSECUTIVE_CLIPPED = 10;
const MIC_OVERLOAD_LOUDNESS_CAP = 42;
const REPLAY_SUSPECT_CORRELATION_THRESHOLD = 0.97;
const REPLAY_SUSPECT_SCORE_CAP = 60;
const CALIBRATION_MISMATCH_MARGIN_DB = 9;

export interface ScoreBarkOptions {
  /**
   * RMS-Huellkurven frueherer Runden desselben Spielers, fuer Replay-Erkennung.
   * Jede Huellkurve ist eine Liste von rmsDbfs-Werten in Frame-Reihenfolge.
   */
  readonly previousRoundEnvelopes?: readonly (readonly number[])[];
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function gaussianCentroidScore(centroidHz: number): number {
  const z = (centroidHz - CENTROID_TARGET_HZ) / CENTROID_SIGMA_HZ;
  return Math.exp(-0.5 * z * z);
}

function flatnessScore(flatness: number): number {
  if (flatness >= FLATNESS_OPTIMUM_LOW && flatness <= FLATNESS_OPTIMUM_HIGH) {
    return 1;
  }
  if (flatness < FLATNESS_OPTIMUM_LOW) {
    return clamp01(flatness / FLATNESS_OPTIMUM_LOW);
  }
  return clamp01((1 - flatness) / (1 - FLATNESS_OPTIMUM_HIGH));
}

function longestRun(values: readonly boolean[]): number {
  let longest = 0;
  let current = 0;
  for (const value of values) {
    current = value ? current + 1 : 0;
    if (current > longest) {
      longest = current;
    }
  }
  return longest;
}

function pearsonCorrelation(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) {
    return 0;
  }
  const as = a.slice(0, n);
  const bs = b.slice(0, n);
  const meanA = mean(as);
  const meanB = mean(bs);
  let numerator = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = (as[i] ?? 0) - meanA;
    const db = (bs[i] ?? 0) - meanB;
    numerator += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  const denominator = Math.sqrt(denomA * denomB);
  if (denominator === 0) {
    return 0;
  }
  return numerator / denominator;
}

function emptyScore(cal: CalibrationProfile): BarkScore {
  return {
    total: 0,
    breakdown: { loudness: 0, attack: 0, crest: 0, character: 0 },
    flags: [],
    peakDbfs: cal.noiseFloorDbfs,
    peakTimeMs: 0,
    activeDurationMs: 0,
  };
}

/**
 * Bewertet ein 3-Sekunden-Bellfenster serverseitig, deterministisch und
 * ohne Browser-APIs. Siehe README.md Abschnitt "Fairness" fuer die
 * Begruendung der einzelnen Komponenten.
 */
export function scoreBark(
  frames: readonly AudioFrame[],
  cal: CalibrationProfile,
  options: ScoreBarkOptions = {},
): BarkScore {
  if (frames.length === 0) {
    return emptyScore(cal);
  }

  const flags = new Set<AntiCheatFlag>();

  let peakIndex = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const frame = frames[i];
    const current = frames[peakIndex];
    if (frame && current && frame.peakDbfs > current.peakDbfs) {
      peakIndex = i;
    }
  }
  const peakFrame = frames[peakIndex];
  if (!peakFrame) {
    return emptyScore(cal);
  }
  const peakDbfs = peakFrame.peakDbfs;

  const loudnessMax = cal.agcActive ? LOUDNESS_MAX_AGC : LOUDNESS_MAX;
  const attackMax = cal.agcActive ? ATTACK_MAX_AGC : ATTACK_MAX;
  const crestMax = cal.agcActive ? CREST_MAX_AGC : CREST_MAX;

  // --- 1. Lautstaerke ---
  const loudnessRaw = (peakDbfs - cal.noiseFloorDbfs - 6) / (cal.headroomDb - 6);
  let loudness = clamp01(loudnessRaw) * loudnessMax;

  // --- Aktive Frames ---
  // Attack, Crest und Charakter sind nur sinnvoll, wenn ueberhaupt ein
  // Ereignis ueber dem Rauschboden liegt. Reines Rauschen/Stille hat keinen
  // "Anschlag" und keinen "Punch" - ohne diese Absicherung wuerde die
  // Attack-Formel bei Rauschen zufaellig volle Punktzahl vergeben, weil alle
  // Frames zufaellig nahe beieinander liegen.
  const activeThreshold = cal.noiseFloorDbfs + ACTIVE_RMS_MARGIN_DB;
  const activeFlags = frames.map((f) => f.rmsDbfs > activeThreshold);
  const activeFrames = frames.filter((f) => f.rmsDbfs > activeThreshold);
  const hasActiveSignal = activeFrames.length > 0;

  // --- 2. Attack ---
  let attack = 0;
  if (hasActiveSignal) {
    const attackThreshold = peakDbfs - 20;
    let crossIndex = peakIndex;
    for (let i = 0; i <= peakIndex; i += 1) {
      const frame = frames[i];
      if (frame && frame.peakDbfs >= attackThreshold) {
        crossIndex = i;
        break;
      }
    }
    const crossFrame = frames[crossIndex];
    const attackMs = crossFrame ? Math.max(0, peakFrame.t - crossFrame.t) : 0;
    const attackFraction = clamp01((ATTACK_ZERO_MS - attackMs) / (ATTACK_ZERO_MS - ATTACK_FULL_MS));
    attack = attackFraction * attackMax;
  }

  // --- 3. Crest / Punch ---
  let crest = 0;
  if (hasActiveSignal) {
    const activeRmsMean = mean(activeFrames.map((f) => f.rmsDbfs));
    const crestDb = peakDbfs - activeRmsMean;
    const crestFraction = clamp01((crestDb - CREST_ZERO_DB) / (CREST_FULL_DB - CREST_ZERO_DB));
    crest = crestFraction * crestMax;
  }

  // --- 4. Bell-Charakter ---
  let character = 0;
  if (activeFrames.length > 0) {
    const combinedScores = activeFrames.map(
      (f) => (gaussianCentroidScore(f.centroidHz) + flatnessScore(f.flatness)) / 2,
    );
    character = mean(combinedScores) * CHARACTER_MAX;
  }

  // --- Dauer-Korrektur ---
  const activeDurationMs = activeFrames.length * FRAME_INTERVAL_MS;
  const longestActiveRunMs = longestRun(activeFlags) * FRAME_INTERVAL_MS;

  let total = loudness + attack + crest + character;

  if (activeDurationMs < SHORT_DURATION_THRESHOLD_MS) {
    total *= SHORT_DURATION_PENALTY;
  }
  if (longestActiveRunMs > HOWL_DURATION_THRESHOLD_MS) {
    total *= HOWL_PENALTY;
  }

  // --- Anti-Cheat: MIC_OVERLOAD ---
  if (longestRun(frames.map((f) => f.clipped)) > MIC_OVERLOAD_CONSECUTIVE_CLIPPED) {
    flags.add("MIC_OVERLOAD");
    if (loudness > MIC_OVERLOAD_LOUDNESS_CAP) {
      total = total - loudness + MIC_OVERLOAD_LOUDNESS_CAP;
      loudness = MIC_OVERLOAD_LOUDNESS_CAP;
    }
  }

  // --- Anti-Cheat: REPLAY_SUSPECT ---
  if (options.previousRoundEnvelopes && options.previousRoundEnvelopes.length > 0) {
    const currentEnvelope = frames.map((f) => f.rmsDbfs);
    const suspect = options.previousRoundEnvelopes.some(
      (prev) => pearsonCorrelation(currentEnvelope, prev) > REPLAY_SUSPECT_CORRELATION_THRESHOLD,
    );
    if (suspect) {
      flags.add("REPLAY_SUSPECT");
      total = Math.min(total, REPLAY_SUSPECT_SCORE_CAP);
    }
  }

  // --- Anti-Cheat: CALIBRATION_MISMATCH ---
  if (peakDbfs > cal.maxObservedDbfs + CALIBRATION_MISMATCH_MARGIN_DB) {
    flags.add("CALIBRATION_MISMATCH");
  }

  return {
    total: round2(total),
    breakdown: {
      loudness: round2(loudness),
      attack: round2(attack),
      crest: round2(crest),
      character: round2(character),
    },
    flags: [...flags],
    peakDbfs: round2(peakDbfs),
    peakTimeMs: peakFrame.t,
    activeDurationMs,
  };
}

/**
 * Vergleicht zwei BarkScores fuer die Rundenwertung.
 * Tiebreak-Reihenfolge: Gesamtscore, dann Bell-Charakter, dann Attack, dann frueherer Peak.
 * Gibt > 0 zurueck wenn `a` gewinnt, < 0 wenn `b` gewinnt, 0 bei exaktem Gleichstand.
 */
export function compareBarkScores(a: BarkScore, b: BarkScore): number {
  if (a.total !== b.total) {
    return a.total - b.total;
  }
  if (a.breakdown.character !== b.breakdown.character) {
    return a.breakdown.character - b.breakdown.character;
  }
  if (a.breakdown.attack !== b.breakdown.attack) {
    return a.breakdown.attack - b.breakdown.attack;
  }
  // Fruehrerer Peak gewinnt -> kleinere peakTimeMs ist besser.
  return b.peakTimeMs - a.peakTimeMs;
}

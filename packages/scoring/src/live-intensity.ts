import type { AntiCheatFlag, AudioFrame, CalibrationProfile } from "./types.js";

/** Frames gelten als "aktiv" ab noiseFloor + diesem Margin - gleiches Konzept wie in score.ts. */
const ACTIVE_RMS_MARGIN_DB = 10;
/** Gleicher Lautstaerke-Nullpunkt-Versatz wie in score.ts, fuer eine vertraute Skalierung. */
const LOUDNESS_FLOOR_DB = 6;
/** Anteil geclippter Frames in einem Tick, ab dem MIC_OVERLOAD greift. */
const CLIP_RATIO_THRESHOLD = 0.6;
/** Intensitaets-Deckel bei MIC_OVERLOAD - verhindert, dass absichtliches Clipping die hoechste Intensitaet liefert. */
const MIC_OVERLOAD_INTENSITY_CAP = 55;
const CALIBRATION_MISMATCH_MARGIN_DB = 9;

export interface LiveIntensityResult {
  /** 0..100, wie laut gerade (in diesem Tick) gebellt wird, relativ zur eigenen Kalibrierung. */
  readonly intensity: number;
  readonly flags: readonly AntiCheatFlag[];
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Bewertet ein kurzes Tick-Fenster (die seit dem letzten Tick eingegangenen
 * Frames eines Spielers) fuer den durchgehenden Live-Tauzieh-Mechanismus:
 * "lauter und laenger durchhalten gewinnt" (siehe Auftrag). Bewusst NUR
 * Lautstaerke - anders als scoreBark() gibt es hier keine Belohnung fuer
 * kurze, perkussive Barks gegenueber langem Durchhalten: durchhalten IST
 * hier das Ziel, nicht ein Manko. Server ruft dies alle TICK_MS pro Spieler
 * auf und summiert das Ergebnis zur laufenden Gesamtpunktzahl - "laenger"
 * ergibt sich automatisch aus der Aufsummierung ueber die Zeit, ohne eigene
 * Dauer-Logik hier.
 */
export function computeLiveIntensity(frames: readonly AudioFrame[], calibration: CalibrationProfile): LiveIntensityResult {
  if (frames.length === 0) {
    return { intensity: 0, flags: [] };
  }

  const flags = new Set<AntiCheatFlag>();

  const activeThreshold = calibration.noiseFloorDbfs + ACTIVE_RMS_MARGIN_DB;
  const activeFrames = frames.filter((f) => f.rmsDbfs > activeThreshold);
  if (activeFrames.length === 0) {
    return { intensity: 0, flags: [] };
  }

  const peakDbfs = Math.max(...activeFrames.map((f) => f.peakDbfs));
  const raw = (peakDbfs - calibration.noiseFloorDbfs - LOUDNESS_FLOOR_DB) / (calibration.headroomDb - LOUDNESS_FLOOR_DB);
  let intensity = clamp01(raw) * 100;

  const clippedRatio = frames.filter((f) => f.clipped).length / frames.length;
  if (clippedRatio >= CLIP_RATIO_THRESHOLD) {
    flags.add("MIC_OVERLOAD");
    intensity = Math.min(intensity, MIC_OVERLOAD_INTENSITY_CAP);
  }

  if (peakDbfs > calibration.maxObservedDbfs + CALIBRATION_MISMATCH_MARGIN_DB) {
    flags.add("CALIBRATION_MISMATCH");
  }

  return { intensity: round2(intensity), flags: [...flags] };
}

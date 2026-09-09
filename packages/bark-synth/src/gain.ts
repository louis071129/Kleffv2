const DEFAULT_FLOOR_DBFS = -60;
const DEFAULT_CEILING_DBFS = -3;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

/**
 * Bildet Pegel (peak/rms dBFS) linear auf eine 0..1-Lautstaerke fuer den
 * Synth ab. Ohne Kalibrierungsprofil (z.B. beim Gegner, der sein eigenes
 * Profil nicht teilt) wird mit grosszuegigen Default-Grenzen gearbeitet -
 * das Ziel ist ein plausibel mitschwingender Sound, keine exakte Wertung
 * (die macht ausschliesslich der Server aus den Feature-Frames, siehe
 * scoreBark). NaN/Infinity/negative Eingaben liefern 0, nie NaN.
 */
export function mapLevelToGain(
  peakDbfs: number,
  rmsDbfs: number,
  floorDbfs: number = DEFAULT_FLOOR_DBFS,
  ceilingDbfs: number = DEFAULT_CEILING_DBFS,
): number {
  const safePeak = Number.isFinite(peakDbfs) ? peakDbfs : floorDbfs;
  const safeRms = Number.isFinite(rmsDbfs) ? rmsDbfs : floorDbfs;
  const level = Math.max(safePeak, safeRms);
  const range = Math.max(1e-6, ceilingDbfs - floorDbfs);
  return clamp01((level - floorDbfs) / range);
}

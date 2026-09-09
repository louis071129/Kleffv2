export const MIN_PITCH_HZ = 200;
export const MAX_PITCH_HZ = 900;

/** Typischer Bereich fuer den spektralen Schwerpunkt einer Sprechstimme. */
const CENTROID_REF_LOW_HZ = 300;
const CENTROID_REF_HIGH_HZ = 4000;

/**
 * Bildet den spektralen Schwerpunkt der Stimme (centroidHz) komprimiert
 * (logarithmisch) auf den Hunde-Tonhoehenbereich 200-900Hz ab. Komprimiert
 * statt linear, damit auch hohe Stimmen nicht kreischend klingen - siehe
 * Auftrag. Clamp am Ein- und Ausgang: liefert bei jedem endlichen ODER
 * nicht-endlichen Input (NaN, Infinity, negativ) immer einen gueltigen Wert
 * im Zielbereich, nie NaN.
 */
export function mapCentroidToPitchHz(centroidHz: number): number {
  const safeInput = Number.isNaN(centroidHz) ? CENTROID_REF_LOW_HZ : Math.max(0, centroidHz);
  const clamped = Math.min(CENTROID_REF_HIGH_HZ, Math.max(CENTROID_REF_LOW_HZ, safeInput));
  const t = Math.log(clamped / CENTROID_REF_LOW_HZ) / Math.log(CENTROID_REF_HIGH_HZ / CENTROID_REF_LOW_HZ);
  const pitch = MIN_PITCH_HZ + t * (MAX_PITCH_HZ - MIN_PITCH_HZ);
  if (!Number.isFinite(pitch)) {
    return MIN_PITCH_HZ;
  }
  return Math.min(MAX_PITCH_HZ, Math.max(MIN_PITCH_HZ, pitch));
}

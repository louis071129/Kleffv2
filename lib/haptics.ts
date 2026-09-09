"use client";

/** Haptik ueber navigator.vibrate. Scheitert still (iOS Safari hat es z.B. gar nicht). */
export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Komfort-Feature, kein kritischer Pfad.
  }
}

export const HAPTIC_ROUND_START = 20;
export const HAPTIC_ROUND_RESULT = [15, 40, 15];
export const HAPTIC_WIN = [20, 60, 20, 60, 40];
export const HAPTIC_TAP = 8;

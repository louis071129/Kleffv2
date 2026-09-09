import type { AudioFrame } from "@klaeff/scoring";

const ATTACK_FULL_MS = 60;
const ATTACK_ZERO_MS = 400;
const ATTACK_DB_DROP = 20;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

/**
 * Misst, wie hart die Stimme im Fenster eingesetzt hat (Zeit von peak-20dB
 * bis zum Peak, wie in der Scoring-Attack-Komponente), und bildet das auf
 * 0..1 ab: 1 = sehr harter/schneller Anschlag, 0 = sehr weiches Anschleichen.
 * Steuert die Attack-Schaerfe des Synth-Envelopes - ein hart einsetzendes
 * Bellen klingt so auch synthetisch hart, siehe Auftrag. Leeres Fenster
 * oder reine Stille (kein Pegel-Anstieg) liefert 0, nie NaN.
 */
export function computeAttackSharpness(frames: readonly AudioFrame[]): number {
  if (frames.length === 0) {
    return 0;
  }

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
    return 0;
  }
  // Der Peak ist der allererste Frame: es gibt keinen vorherigen, leiseren
  // Frame, an dem sich ein "Anstieg" ablesen liesse (z.B. komplett stilles
  // oder konstantes Fenster). Ohne messbaren Anstieg gibt es keinen
  // Anschlag zu bewerten - 0, nicht faelschlich "sofortiger Anschlag".
  if (peakIndex === 0) {
    return 0;
  }

  const threshold = peakFrame.peakDbfs - ATTACK_DB_DROP;
  let crossIndex = peakIndex;
  for (let i = 0; i <= peakIndex; i += 1) {
    const frame = frames[i];
    if (frame && frame.peakDbfs >= threshold) {
      crossIndex = i;
      break;
    }
  }
  const crossFrame = frames[crossIndex];
  const attackMs = crossFrame ? Math.max(0, peakFrame.t - crossFrame.t) : 0;

  return clamp01((ATTACK_ZERO_MS - attackMs) / (ATTACK_ZERO_MS - ATTACK_FULL_MS));
}

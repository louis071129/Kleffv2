import type { AudioFrame } from "@klaeff/scoring";
import { mapCentroidToPitchHz } from "./pitch.js";
import { mapLevelToGain } from "./gain.js";
import { computeAttackSharpness } from "./attack.js";
import type { BarkSynthEnvelope, BarkSynthFrameParams } from "./types.js";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

/**
 * Live-Parameter fuer EINEN Frame, geeignet fuer 20ms-Streaming (siehe
 * lib/audio/bark-synth-voice.ts fuer die tatsaechliche Web-Audio-Wiedergabe
 * beim Empfaenger). `flatness` steuert den Rauschanteil: ein flaches
 * (rauschartiges) Signal bekommt mehr Rauschburst, ein tonales weniger.
 */
export function computeFrameParams(frame: AudioFrame): BarkSynthFrameParams {
  return {
    pitchHz: mapCentroidToPitchHz(frame.centroidHz),
    gain: mapLevelToGain(frame.peakDbfs, frame.rmsDbfs),
    noiseMix: clamp01(frame.flatness),
  };
}

/**
 * Envelope-Parameter fuer ein komplettes Fenster (Attack-Schaerfe aus dem
 * gesamten Frame-Verlauf). Leeres Fenster liefert benigne Defaults, wirft
 * nie.
 */
export function computeEnvelopeParams(frames: readonly AudioFrame[]): BarkSynthEnvelope {
  return { attackSharpness: computeAttackSharpness(frames) };
}

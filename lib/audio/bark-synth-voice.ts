"use client";

import type { AudioFrame } from "@klaeff/scoring";
import { computeFrameParams } from "@klaeff/bark-synth";

const RAMP_SECONDS = 0.03; // < 30ms Lag, siehe Auftrag
const SILENCE_RAMP_SECONDS = 0.08;
const NOISE_BUFFER_SECONDS = 0.5;

function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * NOISE_BUFFER_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Rendert den Bark-Synth beim Empfaenger live aus den Feature-Frames des
 * Gegners (BARK_FRAME_BROADCAST) - siehe packages/bark-synth fuer die reine
 * Mapping-Mathematik. Traegerschicht: Bandpass-gefilterter Rauschburst
 * (Attack) plus zwei gedaempfte Oszillatoren (Wuff-Koerper), wie im Auftrag
 * beschrieben. Spielt NIE die eigene Stimme, nur die des Gegners.
 */
export class BarkSynthVoice {
  private audioContext: AudioContext | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private bodyGain: GainNode | null = null;
  private noiseGain: GainNode | null = null;
  private masterGain: GainNode | null = null;

  start(): void {
    if (this.audioContext) {
      return;
    }
    const AudioContextCtor = window.AudioContext;
    const ctx = new AudioContextCtor();
    this.audioContext = ctx;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.masterGain = master;

    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.8;
    bodyGain.connect(master);
    this.bodyGain = bodyGain;

    const oscA = ctx.createOscillator();
    oscA.type = "sawtooth";
    oscA.frequency.value = 400;
    oscA.connect(bodyGain);
    oscA.start();
    this.oscA = oscA;

    const oscBGain = ctx.createGain();
    oscBGain.gain.value = 0.4;
    oscBGain.connect(bodyGain);
    const oscB = ctx.createOscillator();
    oscB.type = "sine";
    oscB.frequency.value = 600;
    oscB.connect(oscBGain);
    oscB.start();
    this.oscB = oscB;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noiseGain.connect(master);
    this.noiseGain = noiseGain;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 1500;
    bandpass.Q.value = 0.7;
    bandpass.connect(noiseGain);

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = createNoiseBuffer(ctx);
    noiseSource.loop = true;
    noiseSource.connect(bandpass);
    noiseSource.start();
    this.noiseSource = noiseSource;

    void ctx.resume();
  }

  /** `attackSharpness` kommt vom Aufrufer (ueber die bisherigen Frames der Runde berechnet, siehe MatchScreen). */
  updateFrame(frame: AudioFrame, attackSharpness: number): void {
    const ctx = this.audioContext;
    if (!ctx || !this.oscA || !this.oscB || !this.masterGain || !this.noiseGain) {
      return;
    }
    const params = computeFrameParams(frame);
    const now = ctx.currentTime;
    this.oscA.frequency.setTargetAtTime(params.pitchHz, now, RAMP_SECONDS);
    this.oscB.frequency.setTargetAtTime(params.pitchHz * 1.5, now, RAMP_SECONDS);
    this.masterGain.gain.setTargetAtTime(params.gain, now, RAMP_SECONDS);
    // Attack-Schaerfe macht den Rauschburst-Anteil hoerbar haerter: ein hart
    // einsetzendes Bellen klingt auch synthetisch hart, siehe Auftrag.
    const noiseTarget = params.noiseMix * (0.3 + attackSharpness * 0.7) * params.gain;
    this.noiseGain.gain.setTargetAtTime(noiseTarget, now, RAMP_SECONDS);
  }

  /** Sanft stumm schalten zwischen Runden, ohne die Knoten neu aufzubauen. */
  silence(): void {
    const ctx = this.audioContext;
    if (!ctx || !this.masterGain || !this.noiseGain) {
      return;
    }
    this.masterGain.gain.setTargetAtTime(0, ctx.currentTime, SILENCE_RAMP_SECONDS);
    this.noiseGain.gain.setTargetAtTime(0, ctx.currentTime, SILENCE_RAMP_SECONDS);
  }

  stop(): void {
    this.oscA?.stop();
    this.oscB?.stop();
    this.noiseSource?.stop();
    void this.audioContext?.close();
    this.audioContext = null;
    this.oscA = null;
    this.oscB = null;
    this.noiseSource = null;
    this.bodyGain = null;
    this.noiseGain = null;
    this.masterGain = null;
  }
}

let singleton: BarkSynthVoice | null = null;

export function getBarkSynthVoice(): BarkSynthVoice {
  if (!singleton) {
    singleton = new BarkSynthVoice();
  }
  return singleton;
}

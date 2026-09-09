/**
 * Erzeugt deterministische synthetische Audio-Fixtures fuer Tests und E2E,
 * weil in dieser Umgebung kein echtes Mikrofon zur Verfuegung steht.
 * 16-Bit Mono, 48 kHz, nach fixtures/audio/*.wav.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeWav } from "../packages/scoring/src/wav.js";

const SAMPLE_RATE = 48_000;
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "audio");

/** Deterministische PRNG (mulberry32), damit Fixtures reproduzierbar sind. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function whiteNoise(numSamples: number, seed: number): Float64Array {
  const rand = mulberry32(seed);
  const out = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i += 1) {
    out[i] = rand() * 2 - 1;
  }
  return out;
}

function pinkNoise(numSamples: number, seed: number): Float64Array {
  const white = whiteNoise(numSamples, seed);
  const out = new Float64Array(numSamples);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < numSamples; i += 1) {
    const w = white[i] ?? 0;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
  }
  return out;
}

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function highpassBiquad(freq: number, q: number, sampleRate: number): Biquad {
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cosw0 = Math.cos(w0);
  const a0 = 1 + alpha;
  return {
    b0: (1 + cosw0) / 2 / a0,
    b1: -(1 + cosw0) / a0,
    b2: (1 + cosw0) / 2 / a0,
    a1: (-2 * cosw0) / a0,
    a2: (1 - alpha) / a0,
  };
}

function lowpassBiquad(freq: number, q: number, sampleRate: number): Biquad {
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cosw0 = Math.cos(w0);
  const a0 = 1 + alpha;
  return {
    b0: (1 - cosw0) / 2 / a0,
    b1: (1 - cosw0) / a0,
    b2: (1 - cosw0) / 2 / a0,
    a1: (-2 * cosw0) / a0,
    a2: (1 - alpha) / a0,
  };
}

function applyBiquad(samples: Float64Array, coef: Biquad): Float64Array {
  const out = new Float64Array(samples.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const x0 = samples[i] ?? 0;
    const y0 = coef.b0 * x0 + coef.b1 * x1 + coef.b2 * x2 - coef.a1 * y1 - coef.a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

function bandpass(samples: Float64Array, lowHz: number, highHz: number, sampleRate: number): Float64Array {
  const hp = applyBiquad(samples, highpassBiquad(lowHz, 0.707, sampleRate));
  return applyBiquad(hp, lowpassBiquad(highHz, 0.707, sampleRate));
}

function peakLinearOf(samples: Float64Array): number {
  let peak = 0;
  for (const s of samples) {
    peak = Math.max(peak, Math.abs(s));
  }
  return peak;
}

function dbfsToLinear(dbfs: number): number {
  return 10 ** (dbfs / 20);
}

function normalizeToPeakDbfs(samples: Float64Array, targetDbfs: number): Float64Array {
  const peak = peakLinearOf(samples);
  if (peak === 0) {
    return samples;
  }
  const targetLinear = dbfsToLinear(targetDbfs);
  const gain = targetLinear / peak;
  const out = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    out[i] = (samples[i] ?? 0) * gain;
  }
  return out;
}

/** Linearer Attack, exponentieller Decay, angewandt als Amplitudenhuelle. */
function applyAttackDecayEnvelope(
  samples: Float64Array,
  sampleRate: number,
  attackMs: number,
  decayTimeConstantMs: number,
): Float64Array {
  const attackSamples = Math.round((attackMs / 1000) * sampleRate);
  const decayTau = (decayTimeConstantMs / 1000) * sampleRate;
  const out = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    let env: number;
    if (i < attackSamples) {
      env = attackSamples > 0 ? i / attackSamples : 1;
    } else {
      env = Math.exp(-(i - attackSamples) / decayTau);
    }
    out[i] = (samples[i] ?? 0) * env;
  }
  return out;
}

function place(canvas: Float64Array, segment: Float64Array, startSample: number): void {
  for (let i = 0; i < segment.length; i += 1) {
    const idx = startSample + i;
    if (idx >= 0 && idx < canvas.length) {
      canvas[idx] = (canvas[idx] ?? 0) + (segment[i] ?? 0);
    }
  }
}

function ditherFloor(numSamples: number, seed: number, targetDbfs: number): Float64Array {
  const noise = whiteNoise(numSamples, seed);
  return normalizeToPeakDbfs(noise, targetDbfs + 6); // Peak etwas ueber RMS-Ziel
}

function makeBark(opts: {
  seed: number;
  peakDbfs: number;
  attackMs: number;
  decayMs: number;
  totalSeconds: number;
  startMs: number;
  extraBarkAtMs?: number;
}): Float64Array {
  const totalSamples = Math.round(opts.totalSeconds * SAMPLE_RATE);
  const canvas = ditherFloor(totalSamples, opts.seed + 999, -58);

  const burstDurationMs = opts.attackMs + opts.decayMs * 4;
  const burstSamples = Math.round((burstDurationMs / 1000) * SAMPLE_RATE);
  const rawBurst = whiteNoise(burstSamples, opts.seed);
  const filtered = bandpass(rawBurst, 600, 3500, SAMPLE_RATE);
  const enveloped = applyAttackDecayEnvelope(filtered, SAMPLE_RATE, opts.attackMs, opts.decayMs);
  const burst = normalizeToPeakDbfs(enveloped, opts.peakDbfs);

  place(canvas, burst, Math.round((opts.startMs / 1000) * SAMPLE_RATE));

  if (opts.extraBarkAtMs !== undefined) {
    const raw2 = whiteNoise(burstSamples, opts.seed + 1);
    const filtered2 = bandpass(raw2, 600, 3500, SAMPLE_RATE);
    const enveloped2 = applyAttackDecayEnvelope(filtered2, SAMPLE_RATE, opts.attackMs, opts.decayMs);
    const burst2 = normalizeToPeakDbfs(enveloped2, opts.peakDbfs);
    place(canvas, burst2, Math.round((opts.extraBarkAtMs / 1000) * SAMPLE_RATE));
  }

  return canvas;
}

function makeScream(opts: { seed: number; peakDbfs: number; totalSeconds: number }): Float64Array {
  const totalSamples = Math.round(opts.totalSeconds * SAMPLE_RATE);
  const canvas = ditherFloor(totalSamples, opts.seed + 999, -58);

  const activeSeconds = 1.8;
  const attackMs = 500;
  const activeSamples = Math.round(activeSeconds * SAMPLE_RATE);
  const tone = new Float64Array(activeSamples);
  const fundamental = 400;
  for (let i = 0; i < activeSamples; i += 1) {
    const tSec = i / SAMPLE_RATE;
    let v = 0;
    v += Math.sin(2 * Math.PI * fundamental * tSec);
    v += 0.5 * Math.sin(2 * Math.PI * fundamental * 2 * tSec);
    v += 0.25 * Math.sin(2 * Math.PI * fundamental * 3 * tSec);
    tone[i] = v;
  }
  const attackSamples = Math.round((attackMs / 1000) * SAMPLE_RATE);
  for (let i = 0; i < activeSamples; i += 1) {
    const env = i < attackSamples ? i / attackSamples : 1;
    tone[i] = (tone[i] ?? 0) * env;
  }
  const normalized = normalizeToPeakDbfs(tone, opts.peakDbfs);
  place(canvas, normalized, Math.round(0.3 * SAMPLE_RATE));
  return canvas;
}

function makeWhine(opts: { seed: number; peakDbfs: number; totalSeconds: number }): Float64Array {
  const totalSamples = Math.round(opts.totalSeconds * SAMPLE_RATE);
  const canvas = ditherFloor(totalSamples, opts.seed + 999, -58);

  const activeSeconds = 2.5;
  const activeSamples = Math.round(activeSeconds * SAMPLE_RATE);
  const sweep = new Float64Array(activeSamples);
  const fStart = 300;
  const fEnd = 900;
  let phase = 0;
  for (let i = 0; i < activeSamples; i += 1) {
    const progress = i / activeSamples;
    const freq = fStart + (fEnd - fStart) * progress;
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    sweep[i] = Math.sin(phase);
  }
  const fadeSamples = Math.round(0.05 * SAMPLE_RATE);
  for (let i = 0; i < activeSamples; i += 1) {
    let env = 1;
    if (i < fadeSamples) env = i / fadeSamples;
    if (i > activeSamples - fadeSamples) env = Math.min(env, (activeSamples - i) / fadeSamples);
    sweep[i] = (sweep[i] ?? 0) * env;
  }
  const normalized = normalizeToPeakDbfs(sweep, opts.peakDbfs);
  place(canvas, normalized, Math.round(0.25 * SAMPLE_RATE));
  return canvas;
}

function makeClipped(opts: { seed: number; totalSeconds: number }): Float64Array {
  const totalSamples = Math.round(opts.totalSeconds * SAMPLE_RATE);
  const canvas = ditherFloor(totalSamples, opts.seed + 999, -58);

  const burstSeconds = 0.4;
  const burstSamples = Math.round(burstSeconds * SAMPLE_RATE);
  const raw = whiteNoise(burstSamples, opts.seed);
  const filtered = bandpass(raw, 600, 3500, SAMPLE_RATE);
  // Extrem uebersteuern (weit ueber Vollausschlag), dann hart clippen.
  const overdriven = new Float64Array(burstSamples);
  for (let i = 0; i < burstSamples; i += 1) {
    overdriven[i] = (filtered[i] ?? 0) * 40;
  }
  const clipped = new Float64Array(burstSamples);
  for (let i = 0; i < burstSamples; i += 1) {
    clipped[i] = Math.max(-1, Math.min(1, overdriven[i] ?? 0));
  }
  place(canvas, clipped, Math.round(0.3 * SAMPLE_RATE));
  return canvas;
}

interface FixtureDef {
  name: string;
  build: () => Float64Array;
}

const fixtures: FixtureDef[] = [
  {
    name: "bark-loud",
    build: () =>
      makeBark({ seed: 1, peakDbfs: -3, attackMs: 15, decayMs: 250, totalSeconds: 3, startMs: 300 }),
  },
  {
    name: "bark-quiet",
    build: () =>
      makeBark({ seed: 2, peakDbfs: -22, attackMs: 15, decayMs: 250, totalSeconds: 3, startMs: 300 }),
  },
  {
    name: "bark-double",
    build: () =>
      makeBark({
        seed: 3,
        peakDbfs: -6,
        attackMs: 15,
        decayMs: 220,
        totalSeconds: 3,
        startMs: 250,
        extraBarkAtMs: 1500,
      }),
  },
  {
    name: "scream",
    build: () => makeScream({ seed: 4, peakDbfs: -13, totalSeconds: 3 }),
  },
  {
    name: "whine",
    build: () => makeWhine({ seed: 5, peakDbfs: -24, totalSeconds: 3 }),
  },
  {
    name: "silence",
    build: () => ditherFloor(Math.round(3 * SAMPLE_RATE), 6, -60),
  },
  {
    name: "room-noise",
    build: () => normalizeToPeakDbfs(pinkNoise(Math.round(3 * SAMPLE_RATE), 7), -45),
  },
  {
    name: "clipped",
    build: () => makeClipped({ seed: 8, totalSeconds: 3 }),
  },
];

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const fixture of fixtures) {
    const samples = fixture.build();
    const wav = encodeWav(samples, SAMPLE_RATE);
    const outPath = path.join(OUT_DIR, `${fixture.name}.wav`);
    writeFileSync(outPath, wav);
    console.info(`Fixture geschrieben: ${outPath} (${(samples.length / SAMPLE_RATE).toFixed(2)}s)`);
  }
}

main();

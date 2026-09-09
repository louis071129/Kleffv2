/**
 * Browserfreie DSP-Kernfunktionen. Wird sowohl vom Node-WAV-Extractor
 * (Tests, Fixtures) als auch inhaltlich 1:1 vom AudioWorklet im Client
 * verwendet, damit beide Pfade fuer dieselbe Datei framegleich sind.
 */
import type { AudioFrame } from "./types.js";

export const SAMPLE_RATE = 48_000;
export const FRAME_HOP_SAMPLES = 960; // 48000 / 50 Hz = 20 ms
export const FFT_SIZE = 1024;
export const CLIP_THRESHOLD = 0.999;

function hannWindow(size: number): Float64Array {
  const window = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return window;
}

const HANN_1024 = hannWindow(FFT_SIZE);

/** Minimale iterative Radix-2 FFT, reell -> komplexe Magnitude. */
function fftMagnitudes(samples: Float64Array): Float64Array {
  const n = samples.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(samples);

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tmpRe = re[i] ?? 0;
      re[i] = re[j] ?? 0;
      re[j] = tmpRe;
      const tmpIm = im[i] ?? 0;
      im[i] = im[j] ?? 0;
      im[j] = tmpIm;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const uRe = re[i + k] ?? 0;
        const uIm = im[i + k] ?? 0;
        const vRe0 = re[i + k + len / 2] ?? 0;
        const vIm0 = im[i + k + len / 2] ?? 0;
        const vRe = vRe0 * curRe - vIm0 * curIm;
        const vIm = vRe0 * curIm + vIm0 * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        const nextIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
        curIm = nextIm;
      }
    }
  }

  const mags = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i += 1) {
    mags[i] = Math.hypot(re[i] ?? 0, im[i] ?? 0);
  }
  return mags;
}

function dbfs(linear: number): number {
  if (linear <= 0) {
    return -100;
  }
  return 20 * Math.log10(linear);
}

/**
 * Analysiert ein 1024-Sample-Fenster (endend an `endSampleIndex`, exklusiv)
 * aus einem Mono-Sample-Puffer (-1..1) und liefert Peak/RMS/Centroid/Flatness.
 */
export function analyzeWindow(
  samples: Float64Array,
  endSampleIndex: number,
  sampleRate: number,
): { peakDbfs: number; rmsDbfs: number; centroidHz: number; flatness: number; clipped: boolean } {
  // Kausales Fenster: die 1024 Samples die an endSampleIndex enden. Fehlende
  // Historie (z.B. bei den ersten Frames einer Aufnahme) wird mit Stille
  // aufgefuellt - exakt wie ein leerer Ringpuffer es im AudioWorklet auch
  // taete. Es wird NIE in die Zukunft geschaut (wichtig fuer Streaming-Gleichheit).
  const start = endSampleIndex - FFT_SIZE;
  const windowed = new Float64Array(FFT_SIZE);
  let peak = 0;
  let sumSquares = 0;
  let clipped = false;

  for (let i = 0; i < FFT_SIZE; i += 1) {
    const sampleIndex = start + i;
    const inRange = sampleIndex >= 0 && sampleIndex < samples.length;
    const sample = inRange ? (samples[sampleIndex] ?? 0) : 0;
    const abs = Math.abs(sample);
    peak = Math.max(peak, abs);
    sumSquares += sample * sample;
    if (abs >= CLIP_THRESHOLD) {
      clipped = true;
    }
    windowed[i] = sample * (HANN_1024[i] ?? 0);
  }

  const rms = Math.sqrt(sumSquares / FFT_SIZE);
  const mags = fftMagnitudes(windowed);

  let weightedSum = 0;
  let magSum = 0;
  let logSum = 0;
  let magCount = 0;
  for (let bin = 1; bin < mags.length; bin += 1) {
    const mag = mags[bin] ?? 0;
    const freq = (bin * sampleRate) / FFT_SIZE;
    weightedSum += freq * mag;
    magSum += mag;
    if (mag > 1e-9) {
      logSum += Math.log(mag);
      magCount += 1;
    }
  }

  const centroidHz = magSum > 0 ? weightedSum / magSum : 0;
  const geometricMean = magCount > 0 ? Math.exp(logSum / magCount) : 0;
  const arithmeticMean = magCount > 0 ? magSum / magCount : 0;
  const flatness = arithmeticMean > 0 ? geometricMean / arithmeticMean : 0;

  return {
    peakDbfs: dbfs(peak),
    rmsDbfs: dbfs(rms),
    centroidHz,
    flatness: Math.min(1, Math.max(0, flatness)),
    clipped,
  };
}

/**
 * Zerlegt einen kompletten Mono-Sample-Puffer in 50-Hz-Frames, exakt wie
 * das AudioWorklet es fuer 128-Sample-Bloecke aggregiert auf 960-Sample-Hops.
 */
export function extractFrames(samples: Float64Array, sampleRate: number = SAMPLE_RATE): AudioFrame[] {
  const frames: AudioFrame[] = [];
  const hopMs = (FRAME_HOP_SAMPLES / sampleRate) * 1000;
  const hopCount = Math.ceil(samples.length / FRAME_HOP_SAMPLES);
  for (let frameIndex = 0; frameIndex < hopCount; frameIndex += 1) {
    const end = (frameIndex + 1) * FRAME_HOP_SAMPLES;
    const analysis = analyzeWindow(samples, end, sampleRate);
    frames.push({
      t: Math.round(frameIndex * hopMs),
      peakDbfs: analysis.peakDbfs,
      rmsDbfs: analysis.rmsDbfs,
      centroidHz: analysis.centroidHz,
      flatness: analysis.flatness,
      clipped: analysis.clipped,
    });
  }
  return frames;
}

/** Ergebnis eines einzelnen `pushBlock`-Aufrufs: 0 bis n fertige Frames. */
export interface StreamingFrameExtractor {
  /** Verarbeitet einen neuen Block (z.B. 128 Samples aus dem AudioWorklet). */
  pushBlock(block: Float64Array): AudioFrame[];
}

/**
 * Streaming-Variante von {@link extractFrames}: verarbeitet Bloecke beliebiger
 * Groesse (im AudioWorklet: 128 Samples) und liefert Frames sobald genug neue
 * Samples fuer den naechsten 20-ms-Hop vorliegen. Nutzt denselben kausalen
 * Ringpuffer-Aufbau, den `analyzeWindow` fuer die Offline-Variante mit
 * Nullen simuliert - beide Wege liefern fuer dieselbe Sample-Folge exakt
 * dieselben Frames.
 */
export function createStreamingFrameExtractor(sampleRate: number = SAMPLE_RATE): StreamingFrameExtractor {
  const ring = new Float64Array(FFT_SIZE);
  let ringFilled = 0;
  let writeIndex = 0;
  let samplesSinceLastFrame = 0;
  let frameIndex = 0;
  const hopMs = (FRAME_HOP_SAMPLES / sampleRate) * 1000;

  function snapshot(): Float64Array {
    const out = new Float64Array(FFT_SIZE);
    const missing = FFT_SIZE - ringFilled;
    for (let i = 0; i < ringFilled; i += 1) {
      const ringPos = (writeIndex - ringFilled + i + FFT_SIZE * 2) % FFT_SIZE;
      out[missing + i] = ring[ringPos] ?? 0;
    }
    return out;
  }

  return {
    pushBlock(block: Float64Array): AudioFrame[] {
      const emitted: AudioFrame[] = [];
      for (let i = 0; i < block.length; i += 1) {
        ring[writeIndex] = block[i] ?? 0;
        writeIndex = (writeIndex + 1) % FFT_SIZE;
        ringFilled = Math.min(FFT_SIZE, ringFilled + 1);
        samplesSinceLastFrame += 1;

        if (samplesSinceLastFrame >= FRAME_HOP_SAMPLES) {
          samplesSinceLastFrame = 0;
          const window = snapshot();
          const analysis = analyzeWindow(window, FFT_SIZE, sampleRate);
          emitted.push({
            t: Math.round(frameIndex * hopMs),
            peakDbfs: analysis.peakDbfs,
            rmsDbfs: analysis.rmsDbfs,
            centroidHz: analysis.centroidHz,
            flatness: analysis.flatness,
            clipped: analysis.clipped,
          });
          frameIndex += 1;
        }
      }
      return emitted;
    },
  };
}

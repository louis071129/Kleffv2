/**
 * KLAEFF AudioWorkletProcessor.
 *
 * Spiegelt bewusst 1:1 die Mathematik aus packages/scoring/src/dsp.ts
 * (analyzeWindow / createStreamingFrameExtractor). AudioWorklets koennen in
 * allen Ziel-Browsern (v.a. Safari/iOS) keine ES-Module-Imports von
 * ausserhalb zuverlaessig laden, deshalb ist die DSP-Mathematik hier von
 * Hand dupliziert statt importiert. Das Frame-Gleichheits-Bewiesen wird in
 * packages/scoring getestet (Offline- vs. Streaming-Extraktion); diese Datei
 * wird durch Playwright-E2E-Tests mit echten (simulierten) Audiodateien
 * gegengeprueft, nicht durch Vitest (kein AudioWorklet-Global in Node).
 *
 * 128-Sample-Bloecke werden zu 20-ms-Frames (960 Samples bei 48 kHz)
 * aggregiert und per postMessage an den Haupt-Thread geschickt.
 */

const FFT_SIZE = 1024;
const CLIP_THRESHOLD = 0.999;

function hannWindow(size) {
  const window = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return window;
}

const HANN_1024 = hannWindow(FFT_SIZE);

function fftMagnitudes(samples) {
  const n = samples.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(samples);

  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tmpRe = re[i];
      re[i] = re[j];
      re[j] = tmpRe;
      const tmpIm = im[i];
      im[i] = im[j];
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
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe0 = re[i + k + len / 2];
        const vIm0 = im[i + k + len / 2];
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
    mags[i] = Math.hypot(re[i], im[i]);
  }
  return mags;
}

function dbfs(linear) {
  if (linear <= 0) return -100;
  return 20 * Math.log10(linear);
}

function analyzeWindow(windowSamples, sr) {
  const windowed = new Float64Array(FFT_SIZE);
  let peak = 0;
  let sumSquares = 0;
  let clipped = false;

  for (let i = 0; i < FFT_SIZE; i += 1) {
    const sample = windowSamples[i];
    const abs = Math.abs(sample);
    peak = Math.max(peak, abs);
    sumSquares += sample * sample;
    if (abs >= CLIP_THRESHOLD) clipped = true;
    windowed[i] = sample * HANN_1024[i];
  }

  const rms = Math.sqrt(sumSquares / FFT_SIZE);
  const mags = fftMagnitudes(windowed);

  let weightedSum = 0;
  let magSum = 0;
  let logSum = 0;
  let magCount = 0;
  for (let bin = 1; bin < mags.length; bin += 1) {
    const mag = mags[bin];
    const freq = (bin * sr) / FFT_SIZE;
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

class BarkProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameHopSamples = Math.round(sampleRate / 50);
    this.ring = new Float64Array(FFT_SIZE);
    this.ringFilled = 0;
    this.writeIndex = 0;
    this.samplesSinceLastFrame = 0;
    this.frameIndex = 0;
    this.startTime = currentTime;
    this.active = true;

    this.port.onmessage = (event) => {
      if (event.data && event.data.type === "STOP") {
        this.active = false;
      }
      if (event.data && event.data.type === "RESET_CLOCK") {
        this.frameIndex = 0;
        this.startTime = currentTime;
      }
    };
  }

  snapshot() {
    const out = new Float64Array(FFT_SIZE);
    const missing = FFT_SIZE - this.ringFilled;
    for (let i = 0; i < this.ringFilled; i += 1) {
      const ringPos = (this.writeIndex - this.ringFilled + i + FFT_SIZE * 2) % FFT_SIZE;
      out[missing + i] = this.ring[ringPos];
    }
    return out;
  }

  process(inputs) {
    if (!this.active) {
      return false;
    }
    const input = inputs[0];
    const channel = input && input[0];
    if (!channel) {
      return true;
    }

    for (let i = 0; i < channel.length; i += 1) {
      this.ring[this.writeIndex] = channel[i];
      this.writeIndex = (this.writeIndex + 1) % FFT_SIZE;
      this.ringFilled = Math.min(FFT_SIZE, this.ringFilled + 1);
      this.samplesSinceLastFrame += 1;

      if (this.samplesSinceLastFrame >= this.frameHopSamples) {
        this.samplesSinceLastFrame = 0;
        const win = this.snapshot();
        const analysis = analyzeWindow(win, sampleRate);
        const hopMs = (this.frameHopSamples / sampleRate) * 1000;
        this.port.postMessage({
          type: "FRAME",
          frame: {
            t: Math.round(this.frameIndex * hopMs),
            peakDbfs: analysis.peakDbfs,
            rmsDbfs: analysis.rmsDbfs,
            centroidHz: analysis.centroidHz,
            flatness: analysis.flatness,
            clipped: analysis.clipped,
          },
        });
        this.frameIndex += 1;
      }
    }

    return true;
  }
}

registerProcessor("bark-processor", BarkProcessor);

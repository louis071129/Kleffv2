/** Minimaler 16-Bit-Mono-PCM-WAV Reader/Writer, keine Abhaengigkeiten. */

export interface WavData {
  readonly sampleRate: number;
  /** Samples normalisiert auf -1..1. */
  readonly samples: Float64Array;
}

export function encodeWav(samples: Float64Array, sampleRate: number): Buffer {
  const numSamples = samples.length;
  const blockAlign = 2; // 16-bit mono
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    const intSample = Math.round(clamped * 32767);
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  return buffer;
}

export function decodeWav(buffer: Buffer): WavData {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Keine gueltige WAV-Datei");
  }

  let offset = 12;
  let sampleRate = 48_000;
  let dataOffset = -1;
  let dataSize = 0;
  let bitsPerSample = 16;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === "fmt ") {
      sampleRate = buffer.readUInt32LE(chunkStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
    } else if (chunkId === "data") {
      dataOffset = chunkStart;
      dataSize = chunkSize;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0) {
    throw new Error("WAV-Datei ohne data-Chunk");
  }
  if (bitsPerSample !== 16) {
    throw new Error(`Nur 16-Bit-WAV wird unterstuetzt, gefunden: ${bitsPerSample}-Bit`);
  }

  const numSamples = Math.floor(dataSize / 2);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i += 1) {
    samples[i] = buffer.readInt16LE(dataOffset + i * 2) / 32768;
  }

  return { sampleRate, samples };
}

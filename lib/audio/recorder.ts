"use client";

/**
 * "Echter Ton" in privaten Lobbys: durchgehende komprimierte Aufnahme in
 * kurzen Chunks fuer die gesamte Matchdauer (kein Knopf, kein einzelnes
 * Fenster mehr - siehe Auftrag). Faellt still auf `null`/no-op zurueck, wenn
 * der Browser den Codec nicht unterstuetzt (z.B. manche Safari-Versionen) -
 * der Aufrufer schaltet dann auf den Bark-Synth um, siehe lib/audio/session.ts.
 */
export const PREFERRED_AUDIO_MIME_TYPE = "audio/webm;codecs=opus";
const AUDIO_BITRATE = 24_000;

export function isAudioRecordingSupported(): boolean {
  return typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(PREFERRED_AUDIO_MIME_TYPE);
}

export interface RecordedAudio {
  readonly mimeType: string;
  readonly blob: Blob;
}

export interface ContinuousRecording {
  stop(): void;
}

/**
 * Startet eine durchgehende Aufnahme, die alle `timesliceMs` einen Chunk
 * liefert (MediaRecorder.start(timesliceMs) - native Browser-Unterstuetzung,
 * keine eigene Chunking-Logik noetig). Laeuft bis stop() aufgerufen wird
 * (Matchende). Gibt null zurueck, wenn der Browser den Codec nicht
 * unterstuetzt - Aufrufer faellt dann still auf reinen Synth zurueck.
 */
export function startContinuousRecording(
  stream: MediaStream,
  timesliceMs: number,
  onChunk: (chunk: RecordedAudio) => void,
): ContinuousRecording | null {
  if (!isAudioRecordingSupported()) {
    return null;
  }
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: PREFERRED_AUDIO_MIME_TYPE, audioBitsPerSecond: AUDIO_BITRATE });
  } catch {
    return null;
  }
  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0) {
      onChunk({ mimeType: PREFERRED_AUDIO_MIME_TYPE, blob: event.data });
    }
  };
  recorder.start(timesliceMs);
  return {
    stop: () => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    },
  };
}

/** Base64 ohne den "data:...;base64,"-Praefix, fuer AUDIO_BLOB_SUBMIT. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unerwartetes FileReader-Ergebnis."));
        return;
      }
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader-Fehler."));
    reader.readAsDataURL(blob);
  });
}

/** Base64 zurueck zu rohen Bytes, fuer die kontinuierliche Wiedergabe (LiveAudioPlayer) und Fallback-Blobs. */
export function base64ToBytes(dataBase64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Base64 zurueck zu einem abspielbaren Blob (Fallback, falls MediaSource/der Codec fuer Streaming nicht unterstuetzt wird). */
export function base64ToBlob(dataBase64: string, mimeType: string): Blob {
  return new Blob([base64ToBytes(dataBase64)], { type: mimeType });
}

/**
 * Spielt einen durchgehenden Chunk-Strom (von AUDIO_BLOB_BROADCAST) luecken-
 * los ab, indem jeder Chunk direkt an einen MediaSource-SourceBuffer
 * angehaengt wird (MediaRecorder-Timeslice-Chunks sind genau dafuer gedacht:
 * der erste Chunk traegt die Container-Kopfdaten, alle weiteren sind
 * anhaengbare Cluster). Faellt still auf Stumm zurueck, wenn MediaSource oder
 * der Codec nicht unterstuetzt wird (z.B. Safari) - kein kritischer Pfad,
 * das Scoring laeuft unabhaengig ueber die Feature-Frames.
 */
export class LiveAudioPlayer {
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private readonly queue: Uint8Array<ArrayBuffer>[] = [];

  start(mimeType: string): void {
    if (typeof MediaSource === "undefined" || !MediaSource.isTypeSupported(mimeType)) {
      return;
    }
    const mediaSource = new MediaSource();
    this.mediaSource = mediaSource;
    this.objectUrl = URL.createObjectURL(mediaSource);
    this.audio = new Audio(this.objectUrl);
    mediaSource.addEventListener(
      "sourceopen",
      () => {
        if (this.mediaSource !== mediaSource) {
          return; // stop() wurde bereits vor dem sourceopen-Event aufgerufen
        }
        const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        sourceBuffer.addEventListener("updateend", () => this.pump());
        this.sourceBuffer = sourceBuffer;
        this.pump();
      },
      { once: true },
    );
    void this.audio.play().catch(() => {
      // Autoplay kann blockiert sein - kein kritischer Pfad.
    });
  }

  pushChunk(bytes: Uint8Array<ArrayBuffer>): void {
    this.queue.push(bytes);
    this.pump();
  }

  private pump(): void {
    const sourceBuffer = this.sourceBuffer;
    if (!sourceBuffer || sourceBuffer.updating || this.queue.length === 0) {
      return;
    }
    const next = this.queue.shift();
    if (next) {
      try {
        sourceBuffer.appendBuffer(next);
      } catch {
        // Buffer-Ueberlauf o.ae. - naechster Chunk versucht es beim naechsten Push erneut.
      }
    }
  }

  stop(): void {
    this.audio?.pause();
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.audio = null;
    this.objectUrl = null;
    this.queue.length = 0;
  }
}

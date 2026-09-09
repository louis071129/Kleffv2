"use client";

/**
 * "Echter Ton" in privaten Lobbys: komprimierte Aufnahme des 3s-Bellfensters.
 * Ziel-Bitrate niedrig (das Fenster ist kurz), siehe Auftrag. Faellt still
 * auf `null` zurueck, wenn der Browser den Codec nicht unterstuetzt (z.B.
 * manche Safari-Versionen) - der Aufrufer schaltet dann auf den Bark-Synth
 * um, siehe lib/audio/session.ts.
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

export function recordWindow(stream: MediaStream, durationMs: number): Promise<RecordedAudio | null> {
  if (!isAudioRecordingSupported()) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: PREFERRED_AUDIO_MIME_TYPE, audioBitsPerSecond: AUDIO_BITRATE });
    } catch {
      resolve(null);
      return;
    }
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      resolve({ mimeType: PREFERRED_AUDIO_MIME_TYPE, blob: new Blob(chunks, { type: PREFERRED_AUDIO_MIME_TYPE }) });
    };
    recorder.onerror = () => resolve(null);
    recorder.start();
    setTimeout(() => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    }, durationMs);
  });
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

/** Base64 zurueck zu einem abspielbaren Blob, fuer AUDIO_BLOB_BROADCAST beim Empfaenger. */
export function base64ToBlob(dataBase64: string, mimeType: string): Blob {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

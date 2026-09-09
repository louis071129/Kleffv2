"use client";

import type { AudioFrame } from "@klaeff/scoring";

export interface MicPermissionResult {
  readonly stream: MediaStream;
  readonly track: MediaStreamTrack;
  /** true wenn der Browser AutoGainControl trotz Anfrage nicht abgeschaltet hat (v.a. iOS Safari). */
  readonly agcActive: boolean;
}

/**
 * Fragt das Mikrofon mit den fuer faires Scoring noetigen Constraints an.
 * MUSS aus einem User-Geste-Handler aufgerufen werden (Button-Klick), sonst
 * verweigern Browser den Zugriff auf AudioContext/getUserMedia.
 */
export async function requestMicrophone(): Promise<MicPermissionResult> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      autoGainControl: false,
      echoCancellation: false,
      noiseSuppression: false,
      channelCount: 1,
    },
  });

  const track = stream.getAudioTracks()[0];
  if (!track) {
    throw new Error("Kein Audio-Track im Mikrofon-Stream gefunden.");
  }

  const settings = track.getSettings();
  // Safari auf iOS ignoriert autoGainControl:false regelmaessig - wir pruefen
  // die tatsaechlich uebernommenen Settings statt der Anfrage zu vertrauen.
  const agcActive = settings.autoGainControl === true;

  return { stream, track, agcActive };
}

export interface AudioPipeline {
  readonly audioContext: AudioContext;
  readonly agcActive: boolean;
  /** Letzter empfangener Frame, fuer den kontinuierlichen Pegel-Broadcast. */
  getLatestFrame(): AudioFrame | null;
  /** Abonniert jeden neuen Frame (50 Hz), z.B. fuer Kalibrierung oder Pegelanzeige. */
  onFrame(callback: (frame: AudioFrame) => void): () => void;
  /** Sammelt Frames fuer `durationMs` und loest dann auf - fuer das 3s-Bellfenster. */
  captureWindow(durationMs: number): Promise<AudioFrame[]>;
  stop(): void;
}

let workletModuleLoaded: Promise<void> | null = null;

async function ensureWorkletLoaded(audioContext: AudioContext): Promise<void> {
  if (!workletModuleLoaded) {
    workletModuleLoaded = audioContext.audioWorklet.addModule("/worklets/bark-processor.js");
  }
  await workletModuleLoaded;
}

export async function createAudioPipeline(mic: MicPermissionResult): Promise<AudioPipeline> {
  const audioContext = new AudioContext();
  await ensureWorkletLoaded(audioContext);

  const source = audioContext.createMediaStreamSource(mic.stream);
  const workletNode = new AudioWorkletNode(audioContext, "bark-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
  });
  // Bewusst NICHT an audioContext.destination angeschlossen: der Ton wird
  // nie wiedergegeben oder gestreamt, nur analysiert (siehe README.md).
  source.connect(workletNode);

  let latestFrame: AudioFrame | null = null;
  const subscribers = new Set<(frame: AudioFrame) => void>();

  workletNode.port.onmessage = (event: MessageEvent<{ type: string; frame?: AudioFrame }>) => {
    if (event.data.type === "FRAME" && event.data.frame) {
      latestFrame = event.data.frame;
      for (const cb of subscribers) {
        cb(event.data.frame);
      }
    }
  };

  return {
    audioContext,
    agcActive: mic.agcActive,
    getLatestFrame: () => latestFrame,
    onFrame: (callback) => {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    captureWindow: (durationMs: number) =>
      new Promise<AudioFrame[]>((resolve) => {
        const frames: AudioFrame[] = [];
        const unsubscribe = ((): (() => void) => {
          const cb = (frame: AudioFrame): void => {
            frames.push(frame);
          };
          subscribers.add(cb);
          return () => subscribers.delete(cb);
        })();
        setTimeout(() => {
          unsubscribe();
          resolve(frames);
        }, durationMs);
      }),
    stop: () => {
      workletNode.port.postMessage({ type: "STOP" });
      workletNode.disconnect();
      source.disconnect();
      for (const track of mic.stream.getTracks()) {
        track.stop();
      }
      void audioContext.close();
    },
  };
}

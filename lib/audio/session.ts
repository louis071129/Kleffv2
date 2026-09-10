"use client";

import { getKlaeffClient } from "../ws-client";
import { createAudioPipeline, requestMicrophone, type AudioPipeline } from "./capture";
import { buildCalibrationProfile, type CalibrationOutcome } from "./calibration";
import { blobToBase64, startContinuousRecording, type ContinuousRecording } from "./recorder";
import { loadCalibration, saveCalibration } from "../storage";
import type { CalibrationProfile } from "@klaeff/scoring";

const LEVEL_BROADCAST_INTERVAL_MS = 100; // 10 Hz
/** Chunk-Laenge fuer "Echter Ton" waehrend eines laufenden Live-Matches, siehe startLiveBarking. */
const AUDIO_CHUNK_MS = 300;

function dbfsToLevel(dbfs: number, cal: CalibrationProfile | null): number {
  const floor = cal?.noiseFloorDbfs ?? -60;
  const ceiling = cal ? cal.noiseFloorDbfs + cal.headroomDb : 0;
  const raw = (dbfs - floor) / Math.max(1, ceiling - floor);
  return Math.round(Math.min(1, Math.max(0, raw)) * 100);
}

/**
 * Zentrale Audio-Sitzung: EIN Mikro-Zugriff, EINE Pipeline fuer die ganze
 * Sitzung (Lobby + Match). Wird fuer den kontinuierlichen Pegel-Broadcast
 * (Praesenz, 10 Hz, siehe README) UND fuer die 3s-Bellfenster verwendet.
 */
export class AudioSession {
  private pipeline: AudioPipeline | null = null;
  private levelInterval: ReturnType<typeof setInterval> | null = null;
  private calibration: CalibrationProfile | null = loadCalibration();
  private liveBarkUnsubscribe: (() => void) | null = null;
  private continuousRecording: ContinuousRecording | null = null;
  private audioChunkSeq = 0;
  /** Verkettet die Base64-Kodierung der Aufnahme-Chunks, damit AUDIO_BLOB_SUBMIT immer in Aufnahmereihenfolge rausgeht (FileReader-Callbacks koennen sonst ausser der Reihe feuern). */
  private audioSendChain: Promise<void> = Promise.resolve();

  getCalibration(): CalibrationProfile | null {
    return this.calibration;
  }

  isActive(): boolean {
    return this.pipeline !== null;
  }

  getAgcActive(): boolean {
    return this.pipeline?.agcActive ?? false;
  }

  async start(): Promise<void> {
    if (this.pipeline) return;
    const mic = await requestMicrophone();
    this.pipeline = await createAudioPipeline(mic);
    this.levelInterval = setInterval(() => {
      const frame = this.pipeline?.getLatestFrame();
      if (frame) {
        const level = dbfsToLevel(frame.peakDbfs, this.calibration);
        getKlaeffClient().send({ type: "LEVEL_UPDATE", level });
      }
    }, LEVEL_BROADCAST_INTERVAL_MS);
  }

  stop(): void {
    if (this.levelInterval) {
      clearInterval(this.levelInterval);
      this.levelInterval = null;
    }
    this.pipeline?.stop();
    this.pipeline = null;
  }

  getLatestLevel(): number {
    const frame = this.pipeline?.getLatestFrame();
    return frame ? dbfsToLevel(frame.peakDbfs, this.calibration) : 0;
  }

  async runCalibration(): Promise<CalibrationOutcome> {
    if (!this.pipeline) {
      throw new Error("Audio-Pipeline nicht gestartet.");
    }
    const silenceFrames = await this.pipeline.captureWindow(3000);
    const voiceFrames = await this.pipeline.captureWindow(3000);
    const testBarkFrames = await this.pipeline.captureWindow(3000);
    const outcome = buildCalibrationProfile(
      silenceFrames,
      voiceFrames,
      testBarkFrames,
      this.pipeline.agcActive,
      Date.now(),
    );
    if (outcome.accepted) {
      this.calibration = outcome.profile;
      saveCalibration(outcome.profile);
      getKlaeffClient().send({ type: "CALIBRATION_SUBMIT", profile: outcome.profile });
    }
    return outcome;
  }

  /**
   * Startet das durchgehende Bellen fuer die gesamte Matchdauer (kein Knopf,
   * kein Abwechseln mehr - siehe Auftrag): streamt ab sofort ununterbrochen
   * die Feature-Frames (BARK_FRAME), aus denen der Server per Tick die Live-
   * Wertung berechnet. `recordAudio=true` nimmt zusaetzlich in kurzen Chunks
   * echten Ton auf (private Lobby mit "Echter Ton") - faellt still auf
   * reinen Synth zurueck, wenn der Browser MediaRecorder/Opus nicht
   * unterstuetzt (siehe lib/audio/recorder.ts). Idempotent: ein zweiter
   * Aufruf ohne vorheriges stopLiveBarking() ist ein no-op.
   */
  startLiveBarking(recordAudio: boolean): void {
    if (!this.pipeline) {
      throw new Error("Audio-Pipeline nicht gestartet.");
    }
    if (this.liveBarkUnsubscribe) {
      return;
    }
    this.liveBarkUnsubscribe = this.pipeline.onFrame((frame) => {
      getKlaeffClient().send({ type: "BARK_FRAME", frame });
    });
    if (recordAudio) {
      this.audioChunkSeq = 0;
      this.audioSendChain = Promise.resolve();
      this.continuousRecording = startContinuousRecording(this.pipeline.stream, AUDIO_CHUNK_MS, (chunk) => {
        const chunkSeq = this.audioChunkSeq;
        this.audioChunkSeq += 1;
        this.audioSendChain = this.audioSendChain
          .then(() => blobToBase64(chunk.blob))
          .then((dataBase64) => {
            getKlaeffClient().send({ type: "AUDIO_BLOB_SUBMIT", chunkSeq, mimeType: chunk.mimeType, dataBase64 });
          });
      });
    }
  }

  stopLiveBarking(): void {
    this.liveBarkUnsubscribe?.();
    this.liveBarkUnsubscribe = null;
    this.continuousRecording?.stop();
    this.continuousRecording = null;
  }
}

let singleton: AudioSession | null = null;

export function getAudioSession(): AudioSession {
  if (!singleton) {
    singleton = new AudioSession();
  }
  return singleton;
}

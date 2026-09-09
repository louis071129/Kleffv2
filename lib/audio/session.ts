"use client";

import { getKlaeffClient } from "../ws-client";
import { createAudioPipeline, requestMicrophone, type AudioPipeline } from "./capture";
import { buildCalibrationProfile, type CalibrationOutcome } from "./calibration";
import { blobToBase64, recordWindow } from "./recorder";
import { loadCalibration, saveCalibration } from "../storage";
import type { CalibrationProfile } from "@klaeff/scoring";

const LEVEL_BROADCAST_INTERVAL_MS = 100; // 10 Hz

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
   * Faengt ein Bellfenster ein und sendet es fuers Scoring. Streamt dabei
   * IMMER die Feature-Frames live mit (BARK_FRAME) - der Server relayt sie
   * nur weiter, wenn der Empfaenger tatsaechlich einen Bark-Synth rendert
   * (Kläffkarussell oder private Lobby ohne "Echter Ton"), harmlos sonst.
   * `recordAudio=true` nimmt zusaetzlich echten Ton auf (private Lobby mit
   * "Echter Ton") - faellt still auf reinen Synth zurueck, wenn der Browser
   * MediaRecorder/Opus nicht unterstuetzt (siehe lib/audio/recorder.ts).
   */
  async captureBarkWindow(windowMs: number, roundIndex: number, recordAudio: boolean): Promise<void> {
    if (!this.pipeline) {
      throw new Error("Audio-Pipeline nicht gestartet.");
    }
    const unsubscribeLive = this.pipeline.onFrame((frame) => {
      getKlaeffClient().send({ type: "BARK_FRAME", frame });
    });
    const recordingPromise = recordAudio ? recordWindow(this.pipeline.stream, windowMs) : Promise.resolve(null);
    const frames = await this.pipeline.captureWindow(windowMs);
    unsubscribeLive();
    getKlaeffClient().send({ type: "BARK_SUBMIT", frames });

    const recording = await recordingPromise;
    if (recording) {
      const dataBase64 = await blobToBase64(recording.blob);
      getKlaeffClient().send({ type: "AUDIO_BLOB_SUBMIT", roundIndex, mimeType: recording.mimeType, dataBase64 });
    }
  }
}

let singleton: AudioSession | null = null;

export function getAudioSession(): AudioSession {
  if (!singleton) {
    singleton = new AudioSession();
  }
  return singleton;
}

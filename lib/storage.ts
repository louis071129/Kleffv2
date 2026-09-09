"use client";

import type { AvatarSeed } from "@klaeff/protocol";
import type { CalibrationProfile } from "@klaeff/scoring";

const KEYS = {
  deviceUuid: "klaeff:device-uuid",
  calibration: "klaeff:calibration",
  nickname: "klaeff:nickname",
  avatar: "klaeff:avatar",
} as const;

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage kann in privaten Tabs/mit deaktiviertem Storage fehlschlagen - dann
    // faellt das Spiel auf In-Memory-Defaults fuer diese Sitzung zurueck.
  }
}

export function getOrCreateDeviceUuid(): string {
  const existing = safeGet(KEYS.deviceUuid);
  if (existing) {
    return existing;
  }
  const fresh = crypto.randomUUID();
  safeSet(KEYS.deviceUuid, fresh);
  return fresh;
}

export function loadCalibration(): CalibrationProfile | null {
  const raw = safeGet(KEYS.calibration);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CalibrationProfile;
  } catch {
    return null;
  }
}

export function saveCalibration(profile: CalibrationProfile): void {
  safeSet(KEYS.calibration, JSON.stringify(profile));
}

export function loadNickname(): string | null {
  return safeGet(KEYS.nickname);
}

export function saveNickname(nickname: string): void {
  safeSet(KEYS.nickname, nickname);
}

export const DEFAULT_AVATAR: AvatarSeed = {
  headShape: 0,
  ears: 0,
  furColor: 0,
  furPattern: 0,
  eyes: 0,
  snout: 0,
  collarColor: 0,
  collarCharm: 0,
  accessory: 0,
  idleSeed: 1,
};

export function loadAvatar(): AvatarSeed {
  const raw = safeGet(KEYS.avatar);
  if (!raw) return DEFAULT_AVATAR;
  try {
    return { ...DEFAULT_AVATAR, ...(JSON.parse(raw) as Partial<AvatarSeed>) };
  } catch {
    return DEFAULT_AVATAR;
  }
}

export function saveAvatar(avatar: AvatarSeed): void {
  safeSet(KEYS.avatar, JSON.stringify(avatar));
}

export function randomAvatarSeed(): AvatarSeed {
  return {
    headShape: Math.floor(Math.random() * 5),
    ears: Math.floor(Math.random() * 6),
    furColor: Math.floor(Math.random() * 4),
    furPattern: Math.floor(Math.random() * 4),
    eyes: Math.floor(Math.random() * 6),
    snout: Math.floor(Math.random() * 4),
    collarColor: Math.floor(Math.random() * 8),
    collarCharm: Math.floor(Math.random() * 5),
    accessory: Math.floor(Math.random() * 11),
    idleSeed: Math.floor(Math.random() * 1_000_000),
  };
}

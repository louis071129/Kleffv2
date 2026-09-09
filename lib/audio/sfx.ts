"use client";

/**
 * Synthetisierte Soundeffekte ueber WebAudio - keine Asset-Downloads. Nutzt
 * einen eigenen, kurzlebigen AudioContext pro Sound statt der Mikro-Pipeline
 * (die bleibt strikt getrennt: Aufnahme vs. Wiedergabe).
 */

type ToneStep = { freq: number; at: number; duration: number; type?: OscillatorType; gain?: number };

function playTones(steps: ToneStep[]): void {
  try {
    const AudioContextCtor = window.AudioContext;
    const ctx = new AudioContextCtor();
    const now = ctx.currentTime;
    let latestEnd = 0;

    for (const step of steps) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = step.type ?? "sine";
      osc.frequency.value = step.freq;
      const start = now + step.at;
      const end = start + step.duration;
      const peak = step.gain ?? 0.15;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
      latestEnd = Math.max(latestEnd, end + 0.05);
    }

    setTimeout(() => void ctx.close(), latestEnd * 1000 + 100);
  } catch {
    // Sound ist Show, kein kritischer Pfad.
  }
}

export function sfxCountdownTick(): void {
  playTones([{ freq: 880, at: 0, duration: 0.08, type: "square", gain: 0.1 }]);
}

export function sfxRoundStart(): void {
  playTones([
    { freq: 440, at: 0, duration: 0.1, type: "triangle" },
    { freq: 660, at: 0.1, duration: 0.15, type: "triangle" },
  ]);
}

export function sfxRoundResult(): void {
  playTones([
    { freq: 520, at: 0, duration: 0.12, type: "sine" },
    { freq: 780, at: 0.1, duration: 0.2, type: "sine" },
  ]);
}

export function sfxWin(): void {
  playTones([
    { freq: 523, at: 0, duration: 0.15, type: "square", gain: 0.12 },
    { freq: 659, at: 0.12, duration: 0.15, type: "square", gain: 0.12 },
    { freq: 784, at: 0.24, duration: 0.3, type: "square", gain: 0.14 },
  ]);
}

export function sfxTap(): void {
  playTones([{ freq: 300, at: 0, duration: 0.04, type: "square", gain: 0.06 }]);
}

export function sfxEmote(): void {
  playTones([{ freq: 700, at: 0, duration: 0.06, type: "sine", gain: 0.08 }]);
}

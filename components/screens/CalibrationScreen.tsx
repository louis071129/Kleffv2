"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../Button";
import { Card } from "../Card";
import { getAudioSession } from "../../lib/audio/session";
import type { CalibrationOutcome } from "../../lib/audio/calibration";

export interface CalibrationScreenProps {
  readonly agcActive: boolean;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

type Step = "soundcheck" | "silence" | "voice" | "testbark" | "result";

function playTestTone(): void {
  try {
    const AudioContextCtor = window.AudioContext;
    const ctx = new AudioContextCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
    osc.onended = () => void ctx.close();
  } catch {
    // Testton ist ein Komfort-Feature, kein kritischer Pfad.
  }
}

export function CalibrationScreen({ agcActive, onDone, onCancel }: CalibrationScreenProps): React.ReactElement {
  const [step, setStep] = useState<Step>("soundcheck");
  const [outcome, setOutcome] = useState<CalibrationOutcome | null>(null);
  const [silentSwitchHint, setSilentSwitchHint] = useState(false);
  const runningRef = useRef(false);

  useEffect(() => {
    if (step !== "silence" || runningRef.current) return;
    runningRef.current = true;
    const session = getAudioSession();
    const timers = [
      setTimeout(() => setStep("voice"), 3000),
      setTimeout(() => setStep("testbark"), 6000),
    ];
    void session.runCalibration().then((result) => {
      setOutcome(result);
      setStep("result");
    });
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [step]);

  function retry(): void {
    runningRef.current = false;
    setOutcome(null);
    setStep("silence");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-5 py-10 text-center">
      {agcActive && (
        <div className="w-full rounded-lg border-2 border-[var(--violet)] bg-[var(--violet)]/10 p-2 text-xs">
          Dein Browser regelt die Lautstärke automatisch nach. Wertung läuft im Ausgleichsmodus.
        </div>
      )}

      {step === "soundcheck" && (
        <Card shadowColor="var(--violet)">
          <h2 className="font-display text-2xl">Ton-Check</h2>
          <p className="mt-2 text-sm">
            Kurzer Test, ob dein Ton nicht stummgeschaltet ist (wichtig auf dem iPhone/iPad).
          </p>
          <Button type="button" variant="secondary" className="mt-4 w-full" onClick={playTestTone}>
            🔊 Ton abspielen
          </Button>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="lime" className="flex-1" onClick={() => setStep("silence")}>
              Ja, gehört
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setSilentSwitchHint(true);
                setStep("silence");
              }}
            >
              Nichts gehört
            </Button>
          </div>
          {silentSwitchHint && (
            <p className="mt-3 text-xs text-[var(--muted)]">
              Falls dein iPhone/iPad einen Stumm-Schalter hat: bitte umlegen. Das Mikro
              funktioniert trotzdem, du solltest KLÄFF aber hören können.
            </p>
          )}
        </Card>
      )}

      {(step === "silence" || step === "voice" || step === "testbark") && (
        <Card shadowColor="var(--bark)">
          <h2 className="font-display text-2xl">Kalibrierung</h2>
          <ol className="mt-3 space-y-2 text-left text-sm">
            <li className={step === "silence" ? "font-semibold text-[var(--bark)]" : "opacity-50"}>
              1. Sei drei Sekunden still {step === "silence" ? "← jetzt" : ""}
            </li>
            <li className={step === "voice" ? "font-semibold text-[var(--bark)]" : "opacity-50"}>
              2. Sprich drei Sekunden normal {step === "voice" ? "← jetzt" : ""}
            </li>
            <li className={step === "testbark" ? "font-semibold text-[var(--bark)]" : "opacity-50"}>
              3. Ein Test-Bell, so laut wie im Ernstfall {step === "testbark" ? "← jetzt" : ""}
            </li>
          </ol>
        </Card>
      )}

      {step === "result" && outcome && (
        <Card shadowColor={outcome.accepted ? "var(--lime)" : "var(--pink)"}>
          {outcome.accepted ? (
            <>
              <h2 className="font-display text-2xl text-[var(--lime)]">Kalibriert!</h2>
              {outcome.noisyRoomWarning && (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Dein Raum ist recht laut - das Spiel funktioniert trotzdem, aber ein
                  ruhigerer Ort gibt fairere Ergebnisse.
                </p>
              )}
              <Button type="button" variant="lime" className="mt-4 w-full" onClick={onDone}>
                Weiter
              </Button>
            </>
          ) : (
            <>
              <h2 className="font-display text-2xl text-[var(--pink)]">Zu leise</h2>
              <p className="mt-2 text-sm">
                Dein Mikro hört fast nichts. Geh näher ran und probier&apos;s nochmal.
              </p>
              <Button type="button" variant="pink" className="mt-4 w-full" onClick={retry}>
                Nochmal versuchen
              </Button>
            </>
          )}
        </Card>
      )}

      <Button type="button" variant="secondary" className="w-full" onClick={onCancel}>
        Abbrechen
      </Button>
    </main>
  );
}

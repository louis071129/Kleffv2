"use client";

import { useState } from "react";
import { Button } from "../Button";
import { Card } from "../Card";
import { getAudioSession } from "../../lib/audio/session";

export interface MicPermissionScreenProps {
  readonly onGranted: (agcActive: boolean) => void;
  readonly onCancel: () => void;
}

export function MicPermissionScreen({ onGranted, onCancel }: MicPermissionScreenProps): React.ReactElement {
  const [status, setStatus] = useState<"idle" | "requesting" | "denied">("idle");

  async function handleGrant(): Promise<void> {
    setStatus("requesting");
    try {
      const session = getAudioSession();
      await session.start();
      onGranted(session.getAgcActive());
    } catch {
      setStatus("denied");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-5 py-10 text-center">
      <Card shadowColor="var(--bark)">
        <h2 className="font-display text-2xl">Mikro freigeben</h2>
        <p className="mt-2 text-sm">
          KLÄFF braucht dein Mikrofon, um deinen Bell zu bewerten. Gewertet wird{" "}
          <strong>immer</strong> nur anhand von Zahlen, die beschreiben wie laut und wie
          &bdquo;bellig&ldquo; dein Signal ist - nie anhand von Ton selbst. Im Kläffkarussell
          hört niemand deine echte Stimme, nur einen computergenerierten Bell-Sound. In
          privaten Lobbys läuft standardmäßig echter Ton (vom Host abschaltbar).
        </p>
        {status === "denied" && (
          <p className="mt-3 rounded-lg border-2 border-[var(--pink)] bg-[var(--pink)]/10 p-3 text-sm">
            Zugriff verweigert oder fehlgeschlagen. Bitte in den Browser-Einstellungen das
            Mikrofon für diese Seite erlauben und nochmal versuchen.
          </p>
        )}
        <Button
          type="button"
          variant="lime"
          className="mt-4 w-full text-lg"
          onClick={handleGrant}
          disabled={status === "requesting"}
        >
          {status === "requesting" ? "Warte auf Freigabe..." : "🎙️ Mikro freigeben"}
        </Button>
        <Button type="button" variant="secondary" className="mt-2 w-full" onClick={onCancel}>
          Zurück
        </Button>
      </Card>
    </main>
  );
}

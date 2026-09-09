"use client";

import { useState } from "react";
import { LegalPage } from "../../components/LegalPage";
import { LegalFooter } from "../../components/LegalFooter";
import { clearAllLocalData } from "../../lib/storage";

export default function CookieEinstellungenPage(): React.ReactElement {
  const [status, setStatus] = useState<"idle" | "clearing" | "done" | "error">("idle");

  async function handleClearAll(): Promise<void> {
    setStatus("clearing");
    try {
      clearAllLocalData();
      // Das Gate-Cookie ist httpOnly, dafuer der eigene DELETE-Endpunkt.
      await fetch("/api/gate", { method: "DELETE" });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <LegalPage title="Cookie-Einstellungen">
      <section>
        <h2>Was bei dir gespeichert wird</h2>
        <p>
          KLÄFF verwendet ausschließlich technisch notwendige Speicherung –
          kein Tracking, keine Werbung, keine Analyse-Dienste. Eine
          Einwilligung ist dafür gesetzlich nicht erforderlich (§ 25 Abs. 2
          Nr. 2 TDDDG), deshalb gibt es hier keine Schalter zum Ein-/Ausschalten,
          nur Transparenz und eine Lösch-Möglichkeit. Details stehen in der{" "}
          <a href="/datenschutz">Datenschutzerklärung</a>.
        </p>
        <table>
          <thead>
            <tr>
              <th>Was</th>
              <th>Wo</th>
              <th>Wofür</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>klaeff_gate</code>-Cookie
              </td>
              <td>Browser-Cookie (httpOnly)</td>
              <td>Merkt sich, dass das Zugangs-Passwort eingegeben wurde</td>
            </tr>
            <tr>
              <td>Geräte-Kennung</td>
              <td>Local Storage</td>
              <td>Reconnect + faire Melde-Funktion</td>
            </tr>
            <tr>
              <td>Kalibrierungsprofil</td>
              <td>Local Storage</td>
              <td>Faires Scoring für dein Mikrofon</td>
            </tr>
            <tr>
              <td>Spitzname, Avatar</td>
              <td>Local Storage</td>
              <td>Deine Anzeige im Spiel</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Alles löschen</h2>
        <p>
          Der folgende Button löscht alle oben genannten lokalen Daten sowie
          das Gate-Cookie auf diesem Gerät. Danach musst du dich beim nächsten
          Besuch erneut mit dem Zugangs-Passwort anmelden und Spitzname,
          Avatar sowie die Mikrofon-Kalibrierung neu einrichten.
        </p>
        <button
          type="button"
          className="klaeff-btn klaeff-btn--pink w-full sm:w-auto"
          disabled={status === "clearing"}
          onClick={() => void handleClearAll()}
        >
          {status === "clearing" ? "Lösche..." : "Alle lokalen Daten löschen"}
        </button>
        {status === "done" && (
          <p className="text-sm">
            Erledigt. Du kannst diese Seite jetzt schließen oder neu laden.
          </p>
        )}
        {status === "error" && (
          <p className="text-sm text-[var(--pink)]">
            Das lokale Löschen hat geklappt, das Zurücksetzen des Gate-Cookies
            auf dem Server ist fehlgeschlagen. Du kannst das Cookie auch
            manuell über die Browser-Einstellungen löschen.
          </p>
        )}
      </section>
      <LegalFooter />
    </LegalPage>
  );
}

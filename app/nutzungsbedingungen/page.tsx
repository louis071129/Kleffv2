import type { Metadata } from "next";
import { LegalPage } from "../../components/LegalPage";
import { LegalFooter } from "../../components/LegalFooter";

export const metadata: Metadata = { title: "Nutzungsbedingungen – KLÄFF" };

export default function NutzungsbedingungenPage(): React.ReactElement {
  return (
    <LegalPage title="Nutzungsbedingungen">
      <p className="rounded-lg border-2 border-dashed border-[var(--bark)] bg-[var(--bark)]/10 p-3 text-xs">
        <strong>Hinweis für den Betreiber:</strong> [PLATZHALTER] markiert Stellen,
        an denen deine echten Kontaktdaten (siehe Impressum) oder eine
        bewusste Entscheidung deinerseits fehlen (z. B. Mindestalter). Auch
        dies ist keine Rechtsberatung.
      </p>

      <section>
        <h2>1. Geltungsbereich</h2>
        <p>
          Diese Nutzungsbedingungen gelten für die Nutzung von KLÄFF, einem
          browserbasierten Mehrspieler-Party-Spiel. Mit dem Aufruf und der
          Nutzung von KLÄFF erklärst du dich mit diesen Bedingungen
          einverstanden. Für die Verarbeitung personenbezogener Daten gilt
          zusätzlich unsere <a href="/datenschutz">Datenschutzerklärung</a>.
        </p>
      </section>

      <section>
        <h2>2. Beta-Status, keine Verfügbarkeitsgarantie</h2>
        <p>
          KLÄFF befindet sich in einer frühen Test-/Beta-Phase und ist derzeit
          bewusst nicht öffentlich zugänglich, sondern nur über ein
          gemeinsames Zugangs-Passwort erreichbar (siehe der
          „Bald verfügbar“-Screen). Es besteht kein Anspruch auf ständige
          Verfügbarkeit, Fehlerfreiheit oder den Fortbestand des Dienstes. Wir
          können Funktionen jederzeit ändern, einschränken oder den Dienst
          insgesamt einstellen.
        </p>
      </section>

      <section>
        <h2>3. Kein Nutzerkonto</h2>
        <p>
          KLÄFF benötigt keine Registrierung. Spitzname, Avatar und ein
          zufälliges Kalibrierungsprofil werden ausschließlich lokal in
          deinem Browser gespeichert (siehe{" "}
          <a href="/datenschutz">Datenschutzerklärung</a>). Es gibt keinen
          Passwort-Schutz für einzelne Spielprofile – jede:r mit Zugang zu
          deinem Browser kann unter deinem lokal gespeicherten Namen spielen.
        </p>
      </section>

      <section>
        <h2>4. Zulässige Nutzung und Verhalten</h2>
        <p>Bei der Nutzung von KLÄFF gilt insbesondere:</p>
        <ul>
          <li>
            Spitznamen dürfen nicht beleidigend, diskriminierend, sexuell
            explizit oder auf andere Weise rechtswidrig sein. Ein
            automatischer Filter ersetzt erkannte Verstöße durch einen
            zufällig generierten Ersatznamen – dieser Filter ist nicht
            vollständig und ersetzt keine eigene Sorgfalt.
          </li>
          <li>
            Es findet kein Freitext-Chat statt (nur ein festes Emote-Rad ohne
            Text) – das reduziert, ersetzt aber nicht vollständig, das Risiko
            unangemessener Kommunikation.
          </li>
          <li>
            Technische Manipulation (z. B. Wiedereinspielen aufgezeichneten
            Audios, automatisierte Skripte anstelle echten Bellens,
            Ausnutzen von Programmfehlern) ist nicht gestattet. Auffällige
            Muster können automatisch markiert werden.
          </li>
          <li>
            Andere Spieler:innen dürfen über die Melde-Funktion im Spiel
            gemeldet werden, wenn sie gegen diese Bedingungen verstoßen.
            Missbräuchliches, mutwillig falsches Melden ist selbst ein
            Verstoß gegen diese Bedingungen.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Folgen von Verstößen</h2>
        <p>
          Wird ein Gerät innerhalb von 24 Stunden aus mindestens drei
          unterschiedlichen Lobbys gemeldet, wird es für die Dauer dieses
          Zeitfensters automatisch von der <strong>öffentlichen
          Schnellsuche</strong> ausgeschlossen. Private Lobbys per Einladungscode
          sind davon nicht betroffen, da hier alle Teilnehmenden sich bereits
          kennen bzw. bewusst eingeladen wurden. Bei schwerwiegenden oder
          wiederholten Verstößen behalten wir uns weitere Maßnahmen vor, z. B.
          einen dauerhaften Ausschluss einzelner Geräte oder IP-Bereiche.
        </p>
      </section>

      <section>
        <h2>6. Mikrofonnutzung</h2>
        <p>
          KLÄFF benötigt zum Spielen Zugriff auf dein Mikrofon. Gewertet wird
          immer ausschließlich anhand von lokal aus dem Mikrofonsignal
          berechneten Lautstärke- und Klangkennwerten, nie anhand von Ton
          selbst (Details in der <a href="/datenschutz">Datenschutzerklärung</a>).
          Ob darüber hinaus auch echter Ton übertragen wird, hängt vom Modus
          ab: im <strong>Kläffkarussell</strong> nie – dort hört dein Gegner
          nur einen computergenerierten Bell-Sound. In einer{" "}
          <strong>privaten Lobby</strong> läuft standardmäßig echter Ton
          (vom Host abschaltbar) – wer beitritt, sollte das wissen. Du
          erteilst den Mikrofonzugriff über den Berechtigungsdialog deines
          Browsers; ohne diese Freigabe kann KLÄFF nicht gespielt werden.
        </p>
      </section>

      <section>
        <h2>7. Altersempfehlung</h2>
        <p>
          KLÄFF enthält keine Inhalte, die speziell für Erwachsene bestimmt
          sind, richtet sich aber auch nicht gezielt an Kinder. Wir empfehlen
          eine Nutzung ab [PLATZHALTER: z. B. 12 oder 16 Jahren, je nach
          gewünschter Zielgruppe]. Nutzer:innen unter 16 Jahren benötigen die
          Zustimmung eines Erziehungsberechtigten (vgl. Art. 8 DSGVO).
        </p>
      </section>

      <section>
        <h2>8. Geistiges Eigentum</h2>
        <p>
          Design, Avatare, Sound-Effekte und der Code von KLÄFF sind
          urheberrechtlich geschützt. Eine Nutzung außerhalb des bestimmungs­
          gemäßen Spielens (z. B. Kopieren, Weiterverbreiten, kommerzielle
          Nutzung) bedarf unserer vorherigen Zustimmung.
        </p>
      </section>

      <section>
        <h2>9. Haftungsausschluss</h2>
        <p>
          KLÄFF wird unentgeltlich und ohne Gewähr zur Verfügung gestellt. Wir
          haften nicht für Schäden, die durch die Nutzung von KLÄFF entstehen,
          außer bei Vorsatz oder grober Fahrlässigkeit sowie in Fällen der
          Verletzung von Leben, Körper oder Gesundheit. Für die Funktion
          deines eigenen Geräts, Mikrofons und deiner Internetverbindung sind
          wir nicht verantwortlich.
        </p>
      </section>

      <section>
        <h2>10. Änderungen dieser Bedingungen</h2>
        <p>
          Wir können diese Nutzungsbedingungen bei Bedarf anpassen,
          insbesondere wenn sich der Funktionsumfang von KLÄFF ändert. Die
          jeweils aktuelle Fassung ist immer auf dieser Seite abrufbar.
        </p>
      </section>

      <section>
        <h2>11. Anwendbares Recht</h2>
        <p>
          Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts, soweit
          gesetzlich zulässig und keine zwingenden verbraucherschützenden
          Bestimmungen deines gewöhnlichen Aufenthaltsortes entgegenstehen.
        </p>
      </section>

      <section>
        <h2>12. Kontakt</h2>
        <p>
          Fragen zu diesen Nutzungsbedingungen richtest du an die im{" "}
          <a href="/impressum">Impressum</a> genannten Kontaktdaten.
        </p>
      </section>
      <LegalFooter />
    </LegalPage>
  );
}

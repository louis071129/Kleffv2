import type { Metadata } from "next";
import { LegalPage } from "../../components/LegalPage";
import { LegalFooter } from "../../components/LegalFooter";

export const metadata: Metadata = { title: "Datenschutzerklärung – KLÄFF" };

export default function DatenschutzPage(): React.ReactElement {
  return (
    <LegalPage title="Datenschutzerklärung">
      <p className="rounded-lg border-2 border-dashed border-[var(--bark)] bg-[var(--bark)]/10 p-3 text-xs">
        <strong>Hinweis für den Betreiber:</strong> Dieser Text ist so formuliert,
        dass er die tatsächliche Datenverarbeitung von KLÄFF korrekt
        beschreibt (Stand: Code zum Zeitpunkt der Erstellung). Mit{" "}
        <code>[PLATZHALTER]</code> markierte Stellen benötigen deine echten
        Kontaktdaten bzw. eine kurze Prüfung (z. B. aktueller Stand des
        Auftragsverarbeitungsvertrags mit dem Hosting-Anbieter). Das ist keine
        Rechtsberatung – bei kommerzieller Nutzung oder Unsicherheit lohnt
        sich eine kurze Prüfung durch eine Anwältin/einen Anwalt.
      </p>

      <section>
        <h2>1. Verantwortlicher</h2>
        <p>
          Verantwortlich für die Datenverarbeitung auf dieser Website im Sinne
          der DSGVO ist die im <a href="/impressum">Impressum</a> genannte
          Person: [PLATZHALTER: Name, Anschrift, E-Mail – siehe Impressum].
          Ein Datenschutzbeauftragter ist nach Art. 37 DSGVO / § 38 BDSG für
          ein Projekt dieser Größe in der Regel nicht verpflichtend zu
          bestellen.
        </p>
      </section>

      <section>
        <h2>2. Kurzüberblick</h2>
        <ul>
          <li>Kein Nutzerkonto, keine Registrierung, keine E-Mail-Abfrage.</li>
          <li>Keine Analyse-/Tracking-Tools, keine Werbung, keine Social-Media-Plugins.</li>
          <li>
            Schriftarten werden selbst gehostet und beim Seitenaufruf{" "}
            <strong>nicht</strong> von Google-Servern nachgeladen.
          </li>
          <li>
            Im <strong>Kläffkarussell</strong> (Zufalls-Matchmaking mit
            Fremden) verlässt dein Mikrofonsignal dein Gerät nie als Ton –
            nur lokal berechnete Lautstärke-/Klangwerte, aus denen andere
            einen computergenerierten Bell-Sound hören.
          </li>
          <li>
            In <strong>privaten Lobbys</strong> (nur mit Leuten, die du
            einlädst) läuft standardmäßig echter, unveränderter Ton – vom
            Lobby-Host jederzeit auf den Bell-Sound umschaltbar. Details in
            Abschnitt 6.
          </li>
          <li>Keine Datenbank: alle Spieldaten liegen nur im Arbeitsspeicher des Servers.</li>
        </ul>
      </section>

      <section>
        <h2>3. Hosting und Server-Logfiles</h2>
        <p>
          Diese Anwendung läuft bei einem externen Hosting-Anbieter
          (Render Services, Inc.), Serverstandort Region Frankfurt (EU). Die
          Muttergesellschaft des Anbieters hat ihren Sitz in den USA, sodass
          eine Datenübermittlung in ein Drittland (z. B. für Abrechnung oder
          Support) nicht vollständig ausgeschlossen werden kann. Wir setzen
          hierfür auf die vom Anbieter bereitgestellten Garantien
          (Standardvertragsklauseln bzw. vergleichbare Mechanismen nach Art.
          44 ff. DSGVO). [PLATZHALTER: aktuellen Stand des
          Auftragsverarbeitungsvertrags/Datenschutz-Addendums des
          Hosting-Anbieters vor dem öffentlichen Start prüfen und hier
          verlinken.]
        </p>
        <p>
          Beim Aufruf der Website verarbeitet der Hosting-Anbieter technisch
          zwangsläufig sogenannte Zugriffsdaten (u. a. IP-Adresse, Datum und
          Uhrzeit, aufgerufene Adresse, User-Agent des Browsers) in
          Server-Logfiles, um den Betrieb, die Sicherheit und die
          Stabilität des Dienstes zu gewährleisten. Rechtsgrundlage ist Art. 6
          Abs. 1 lit. f DSGVO (berechtigtes Interesse am sicheren und
          störungsfreien Betrieb). Diese Logs werden nach unserem Kenntnisstand
          nur kurzzeitig zur Fehleranalyse vorgehalten und nicht mit anderen
          Datenquellen zusammengeführt.
        </p>
      </section>

      <section>
        <h2>4. Cookies</h2>
        <p>
          Wir setzen genau ein Cookie ein:
        </p>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Zweck</th>
              <th>Laufzeit</th>
              <th>Rechtsgrundlage</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>klaeff_gate</code>
              </td>
              <td>
                Merkt sich, dass das Zugangs-Passwort korrekt eingegeben wurde
                (temporärer Zugriffsschutz, solange KLÄFF nicht öffentlich
                ist). Kein Tracking, keine Wiedererkennung über
                Website-Grenzen hinweg.
              </td>
              <td>90 Tage</td>
              <td>
                § 25 Abs. 2 Nr. 2 TDDDG (technisch notwendig, um den
                ausdrücklich gewünschten Dienst bereitzustellen) i. V. m. Art.
                6 Abs. 1 lit. f DSGVO
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          Es werden <strong>keine</strong> Analyse-, Marketing- oder
          Drittanbieter-Cookies gesetzt. Da nur technisch notwendige Cookies
          verwendet werden, ist nach § 25 Abs. 2 Nr. 2 TDDDG keine Einwilligung
          per Cookie-Banner erforderlich – wir informieren trotzdem transparent
          darüber. Details und eine Löschmöglichkeit findest du unter{" "}
          <a href="/cookie-einstellungen">Cookie-Einstellungen</a>.
        </p>
      </section>

      <section>
        <h2>5. Lokal auf deinem Gerät gespeicherte Daten (Local Storage)</h2>
        <p>
          Zusätzlich zum Cookie speichert dein Browser folgende Daten
          ausschließlich lokal auf deinem Gerät (kein automatischer Versand an
          uns, bis du aktiv ein Spiel startest):
        </p>
        <ul>
          <li>
            <strong>Geräte-Kennung</strong>: eine zufällig erzeugte ID ohne
            Bezug zu deinem Namen oder deiner E-Mail-Adresse. Sie ermöglicht
            eine Verbindung nach Netzwerkabbruch wiederherzustellen und ist
            Grundlage für die Melde-/Anti-Cheat-Funktion (siehe Abschnitt 7).
          </li>
          <li>
            <strong>Kalibrierungsprofil</strong>: rein technische Referenzwerte
            deines Mikrofons (Rauschpegel, Referenzlautstärke) für ein faires
            Scoring. Keine Audiodaten, keine Aufnahme.
          </li>
          <li>
            <strong>Spitzname und Avatar-Einstellungen</strong>: von dir frei
            wählbare Anzeige-Daten.
          </li>
        </ul>
        <p>
          Rechtsgrundlage ist ebenfalls § 25 Abs. 2 Nr. 2 TDDDG bzw. Art. 6
          Abs. 1 lit. b/f DSGVO (technisch notwendig zur Bereitstellung des
          Spiels). Du kannst diese Daten jederzeit selbst über die Seite{" "}
          <a href="/cookie-einstellungen">Cookie-Einstellungen</a> löschen oder
          über die Browser-Einstellungen entfernen.
        </p>
      </section>

      <section>
        <h2>6. Datenverarbeitung während einer Spielrunde</h2>
        <p>
          Sobald du eine Lobby erstellst, beitrittst oder im Kläffkarussell
          nach einem Gegner suchst, baut dein Browser eine
          WebSocket-Verbindung zu unserem Server auf. Dabei werden
          übertragen: dein Spitzname, deine Avatar-Konfiguration und deine
          Geräte-Kennung (siehe Abschnitt 5).
        </p>
        <p>
          Während der 3-sekündigen Bell-Runde überträgt dein Browser
          <strong> immer</strong>, unabhängig vom Modus, bis zu 200 kleine
          Messwert-Pakete live in Echtzeit: einen Zeitstempel sowie aus dem
          Mikrofonsignal <strong>lokal in deinem Browser</strong> berechnete
          Kennzahlen (Lautstärke-Spitzenwert und -Effektivwert in dBFS,
          spektraler Schwerpunkt, spektrale Flachheit). Zweck ist die
          serverseitige, manipulationssichere Berechnung deines Bell-Scores
          (Art. 6 Abs. 1 lit. b DSGVO, Durchführung des von dir gestarteten
          Spiels, bzw. lit. f, berechtigtes Interesse an fairem Scoring) und –
          nur wenn relevant – die Live-Wiedergabe des computergenerierten
          Bell-Sounds beim Gegner (dazu gleich mehr). Diese Messwerte sind
          <strong> keine Tonaufnahme</strong> und lassen sich nicht in Sprache
          zurückverwandeln.
        </p>
        <p>
          Was <strong>zusätzlich</strong> passiert, hängt vom Modus ab:
        </p>
        <ul>
          <li>
            <strong>Kläffkarussell</strong> (Zufalls-Matchmaking mit Fremden):
            Es wird zu keinem Zeitpunkt Ton, eine Tonaufnahme oder eine
            Wellenform übertragen, gespeichert oder weitergegeben – dein
            Mikrofonsignal verlässt dein Gerät nie als hörbarer Ton. Der
            Gegner hört stattdessen einen aus den obigen Messwerten lokal in
            seinem Browser synthetisierten Bell-Sound. Das ist eine
            Sicherheitsgrenze dieses Modus, siehe auch{" "}
            <a href="/nutzungsbedingungen">Nutzungsbedingungen</a>.
          </li>
          <li>
            <strong>Private Lobby</strong> (nur mit Leuten, die du
            einlädst): Hier läuft <strong>standardmäßig echter Ton</strong>.
            Dein Browser nimmt das 3-Sekunden-Bellfenster komprimiert auf
            (WebM/Opus, niedrige Bitrate) und schickt die Aufnahme an den
            Server, der sie unverändert an alle anderen Mitglieder{" "}
            <strong>derselben Lobby</strong> weiterleitet – zur Wiedergabe,
            nicht zur Wertung (die läuft ausschließlich über die Messwerte
            oben). Der Server speichert die Aufnahme zu keinem Zeitpunkt,
            auch nicht kurzzeitig: er reicht sie beim Empfang direkt weiter
            und behält keine Kopie. Der Host kann „Echter Ton“ in den
            Lobby-Einstellungen jederzeit für alle abschalten – dann läuft
            auch dort der Bell-Sound wie im Kläffkarussell. Unterstützt dein
            Browser die nötige Aufnahmefunktion nicht (z. B. manche
            Safari-Versionen), wird für dich automatisch nur das Scoring
            übertragen, ohne dass andere deine Stimme hören.
          </li>
        </ul>
        <p>
          Diese Daten werden ausschließlich im Arbeitsspeicher des Servers für
          die Dauer der Verbindung bzw. des laufenden Matches verarbeitet. Es
          gibt keine Datenbank und keine dauerhafte Speicherung – die Daten
          sind spätestens mit Ende der Verbindung bzw. bei einem
          Server-Neustart unwiederbringlich gelöscht.
        </p>
      </section>

      <section>
        <h2>7. Melde-Funktion und Anti-Cheat</h2>
        <p>
          Über die Melde-Funktion im Spiel kannst du andere Spieler:innen
          melden. Eine Meldung wird zusammen mit der Geräte-Kennung (Abschnitt
          5) des gemeldeten Geräts, dem Zeitpunkt und der Lobby für eine
          begrenzte Zeit im Arbeitsspeicher des Servers vorgehalten. Bei
          mehreren Meldungen wird das betroffene Gerät zeitweise vom
          <strong> Kläffkarussell</strong> ausgeschlossen; private Lobbys sind
          davon nicht betroffen. Zweck ist ein faires, belästigungsfreies
          Spielumfeld (Art. 6 Abs. 1 lit. f DSGVO). Auch diese Daten werden
          nicht dauerhaft/in einer Datenbank gespeichert.
        </p>
      </section>

      <section>
        <h2>8. Schriftarten</h2>
        <p>
          Wir verwenden die Schriftarten „Bricolage Grotesque“ und „Inter“
          über <code>next/font</code>. Die Schriftdateien werden beim
          Erstellen der Website heruntergeladen und zusammen mit unserer
          eigenen Website ausgeliefert (Self-Hosting). Beim Aufruf der Seite
          findet <strong>keine</strong> Verbindung zu Google-Servern statt und
          es wird keine IP-Adresse an Google übermittelt.
        </p>
      </section>

      <section>
        <h2>9. Keine Analyse- und Tracking-Tools</h2>
        <p>
          Wir setzen keine Webanalyse-Dienste (z. B. Google Analytics), keine
          Werbenetzwerke, keine Social-Media-Plugins und kein
          Browser-Fingerprinting ein.
        </p>
      </section>

      <section>
        <h2>10. Empfänger und Weitergabe an Dritte</h2>
        <p>
          Eine Weitergabe deiner Daten zu Werbe- oder Analysezwecken findet
          nicht statt. Einziger Empfänger im Sinne der Auftragsverarbeitung
          (Art. 28 DSGVO) ist der in Abschnitt 3 genannte Hosting-Anbieter, der
          die Server bereitstellt, auf denen KLÄFF läuft.
        </p>
      </section>

      <section>
        <h2>11. Speicherdauer im Überblick</h2>
        <table>
          <thead>
            <tr>
              <th>Daten</th>
              <th>Speicherort</th>
              <th>Dauer</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Gate-Cookie</td>
              <td>dein Browser</td>
              <td>90 Tage oder bis manuell gelöscht</td>
            </tr>
            <tr>
              <td>Geräte-Kennung, Kalibrierung, Spitzname, Avatar</td>
              <td>dein Browser (Local Storage)</td>
              <td>bis manuell gelöscht</td>
            </tr>
            <tr>
              <td>Spitzname, Avatar, Geräte-Kennung während eines Spiels</td>
              <td>Arbeitsspeicher des Servers</td>
              <td>Dauer der Verbindung/des Matches</td>
            </tr>
            <tr>
              <td>Audio-Messwerte einer Bell-Runde</td>
              <td>Arbeitsspeicher des Servers</td>
              <td>nur während der Auswertung der jeweiligen Runde</td>
            </tr>
            <tr>
              <td>Echter-Ton-Aufnahme (nur private Lobby, wenn aktiv)</td>
              <td>Arbeitsspeicher des Servers</td>
              <td>
                keine – wird beim Empfang direkt weitergereicht, nie
                gespeichert
              </td>
            </tr>
            <tr>
              <td>Meldungen (Anti-Cheat)</td>
              <td>Arbeitsspeicher des Servers</td>
              <td>zeitlich begrenzt, spätestens bis zum nächsten Server-Neustart</td>
            </tr>
            <tr>
              <td>Server-Zugriffslogs</td>
              <td>Hosting-Anbieter</td>
              <td>kurzzeitig, siehe Abschnitt 3</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>12. Deine Rechte</h2>
        <p>Du hast jederzeit das Recht auf:</p>
        <ul>
          <li>Auskunft über die zu dir gespeicherten Daten (Art. 15 DSGVO),</li>
          <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO),</li>
          <li>Löschung deiner Daten (Art. 17 DSGVO),</li>
          <li>Einschränkung der Verarbeitung (Art. 18 DSGVO),</li>
          <li>Datenübertragbarkeit (Art. 20 DSGVO) und</li>
          <li>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO).</li>
        </ul>
        <p>
          Da praktisch keine dauerhafte, mit dir persönlich identifizierbare
          Speicherung auf unseren Servern stattfindet, betreffen diese Rechte
          vor allem die Daten auf deinem eigenen Gerät – diese kannst du
          jederzeit selbst über die Seite{" "}
          <a href="/cookie-einstellungen">Cookie-Einstellungen</a> löschen.
          Für alle anderen Anliegen kannst du uns über die im{" "}
          <a href="/impressum">Impressum</a> genannten Kontaktdaten erreichen.
        </p>
      </section>

      <section>
        <h2>13. Beschwerderecht bei einer Aufsichtsbehörde</h2>
        <p>
          Du hast das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu
          beschweren, z. B. bei der für deinen Wohnort zuständigen Behörde oder
          bei: [PLATZHALTER: zuständige Landesdatenschutzbehörde des
          Betreibers eintragen].
        </p>
      </section>

      <section>
        <h2>14. Minderjährige</h2>
        <p>
          KLÄFF richtet sich nicht gezielt an Kinder. Personen unter 16 Jahren
          sollten KLÄFF nur mit Zustimmung eines Erziehungsberechtigten nutzen
          (vgl. Art. 8 DSGVO).
        </p>
      </section>

      <section>
        <h2>15. Datensicherheit</h2>
        <p>
          Die Verbindung zu dieser Website und die Spiel-Datenverbindung
          (WebSocket) sind verschlüsselt (HTTPS bzw. WSS). Das Zugangs-Passwort
          wird serverseitig nur zum Vergleich verwendet und nicht pro Nutzer
          gespeichert.
        </p>
      </section>

      <section>
        <h2>16. Änderungen dieser Erklärung</h2>
        <p>
          Wir passen diese Datenschutzerklärung an, sobald sich die
          Datenverarbeitung von KLÄFF ändert (z. B. neue Funktionen, anderer
          Hosting-Anbieter). Es lohnt sich, bei größeren Updates hier
          vorbeizuschauen.
        </p>
      </section>
      <LegalFooter />
    </LegalPage>
  );
}

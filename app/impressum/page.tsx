import type { Metadata } from "next";
import { LegalPage } from "../../components/LegalPage";
import { LegalFooter } from "../../components/LegalFooter";

export const metadata: Metadata = { title: "Impressum – KLÄFF" };

export default function ImpressumPage(): React.ReactElement {
  return (
    <LegalPage title="Impressum">
      <p className="rounded-lg border-2 border-dashed border-[var(--bark)] bg-[var(--bark)]/10 p-3 text-xs">
        <strong>Hinweis für den Betreiber:</strong> Die mit{" "}
        <code>[PLATZHALTER]</code> markierten Angaben sind Pflichtangaben nach § 5
        Digitale-Dienste-Gesetz (DDG, vormals § 5 TMG) und müssen durch die
        echte, ladungsfähige Anschrift der verantwortlichen Person ersetzt
        werden, bevor die Seite öffentlich zugänglich ist. Ein Postfach reicht
        nicht aus. Bei minderjährigen Betreibern muss ein
        volljähriger/gesetzlicher Vertreter eingetragen werden.
      </p>

      <section>
        <h2>Angaben gemäß § 5 DDG</h2>
        <p>
          [PLATZHALTER: Vor- und Nachname bzw. Firmenname]
          <br />
          [PLATZHALTER: Straße und Hausnummer]
          <br />
          [PLATZHALTER: Postleitzahl und Ort]
          <br />
          [PLATZHALTER: Land]
        </p>
      </section>

      <section>
        <h2>Kontakt</h2>
        <p>
          E-Mail: [PLATZHALTER: kontakt@deine-domain.de]
          <br />
          Telefon: [PLATZHALTER, sofern vorhanden – ansonsten Zeile entfernen]
        </p>
      </section>

      <section>
        <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
        <p>[PLATZHALTER: Name und Anschrift wie oben, falls abweichend]</p>
      </section>

      <section>
        <h2>Redaktionell verantwortlich</h2>
        <p>
          KLÄFF ist ein privates, nicht-kommerzielles Party-Spiel-Projekt ohne
          journalistisch-redaktionelle Inhalte. Diese Angabe entfällt daher in
          der Regel – die Zeile bleibt als Hinweis stehen, falls sich der
          Charakter des Angebots ändert.
        </p>
      </section>

      <section>
        <h2>Streitschlichtung</h2>
        <p>
          Die Europäische Kommission stellt eine Plattform zur
          Online-Streitbeilegung (OS) bereit:{" "}
          <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noreferrer">
            https://ec.europa.eu/consumers/odr/
          </a>
          . Wir sind nicht verpflichtet und nicht bereit, an
          Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
          teilzunehmen.
        </p>
      </section>

      <section>
        <h2>Haftung für Inhalte</h2>
        <p>
          Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte
          auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach
          §§ 8–10 DDG sind wir als Diensteanbieter jedoch nicht verpflichtet,
          übermittelte oder gespeicherte fremde Informationen zu überwachen
          oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit
          hinweisen. Verpflichtungen zur Entfernung oder Sperrung der Nutzung
          von Informationen nach den allgemeinen Gesetzen bleiben hiervon
          unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem
          Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei
          Bekanntwerden entsprechender Rechtsverletzungen werden wir diese
          Inhalte umgehend entfernen.
        </p>
      </section>

      <section>
        <h2>Haftung für Links</h2>
        <p>
          Unser Angebot enthält Links zu externen Websites Dritter, auf deren
          Inhalte wir keinen Einfluss haben. Deshalb können wir für diese
          fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der
          verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der
          Seiten verantwortlich.
        </p>
      </section>

      <section>
        <h2>Nutzergenerierte Inhalte im Spiel</h2>
        <p>
          Spitznamen und Avatar-Einstellungen werden von Spieler:innen selbst
          gewählt und laufen durch einen automatisierten Filter (siehe{" "}
          <a href="/nutzungsbedingungen">Nutzungsbedingungen</a>). Trotzdem
          können unangemessene Inhalte nicht zu 100 % ausgeschlossen werden.
          Über die Melde-Funktion im Spiel gemeldete Verstöße prüfen wir und
          schließen betroffene Geräte bei Bedarf zeitweise von der
          öffentlichen Schnellsuche aus.
        </p>
      </section>
      <LegalFooter />
    </LegalPage>
  );
}

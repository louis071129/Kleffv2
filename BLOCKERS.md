# KLÄFF – Blocker und erzwungene Entscheidungen

Chronologisch, neueste Einträge unten. Jeder Eintrag: was blockiert war, welche Entscheidung
getroffen wurde, warum.

## 2026-09-09 – Git-Workflow: ein Branch statt Phasen-Branches, keine PRs

Der Auftragstext will pro Phase einen Branch und PRs gegen `main`. Die Plattform-Vorgabe für
diese Session pinnt aber fest auf den Branch `claude/klaeff-multiplayer-game-ur6t7v` und verbietet
PRs ohne ausdrücklichen Wunsch. Entscheidung: Plattform-Vorgabe hat Vorrang (härtere, spezifischere
Systemregel). Alle Phasen laufen als einzelne Commits auf diesem einen Branch, nach jeder Phase
gepusht. Siehe PROGRESS.md für Details.

## 2026-09-09 – Kein RENDER_API_KEY in der Umgebung

Kein automatischer Live-Deploy möglich. Dockerfile, render.yaml, fly.toml und DEPLOY.md werden
vollständig vorbereitet, der letzte Klick ("Repo in Render verbinden") bleibt manuell für den
Besitzer. Siehe PROGRESS.md Abschnitt Phase 4.

## 2026-09-09 – Kein `gh` CLI Binary verfügbar

GitHub-Zugriff läuft stattdessen über MCP-GitHub-Tools. Da keine PRs für dieses Projekt nötig
sind (siehe Git-Workflow-Entscheidung oben), hat das keine praktische Auswirkung.

## 2026-09-09 – Scoring: Attack/Crest/Charakter nur bei aktivem Signal werten

Die wörtliche Spezifikation der Attack-Formel (Zeit von peak-20dB bis Peak) liefert bei reinem
Rauschen/Stille zufällig eine sehr kurze "Attack-Zeit", weil alle Frame-Peaks in einem
Rauschsignal zufällig nah beieinander liegen – das Silence-Fixture bekam dadurch volle
Attack-Punktzahl (20) und verletzte die Anforderung "silence < 5" (Ergebnis: 12 statt <5).
Entscheidung: Attack, Crest und Bell-Charakter werden nur berechnet, wenn es aktive Frames
gibt (RMS über Rauschboden+10dB) – ohne aktives Signal gibt es kein "Bellereignis" zu bewerten.
Das ist eine Präzisierung, keine Abkehr vom Sinn der Spezifikation. Danach: silence = 0. Siehe
PROGRESS.md Phase 1.

## 2026-09-09 – Nickname-Filter: "ss" als NS-Begriff entfernt

Die erste Version der Blockliste enthielt das blosse Kuerzel "ss" um Bezuege auf die
Waffen-SS zu erkennen. Beim Testen faellt auf: das blockt auch "Assassin", "Kiss" und jeden
anderen Namen mit "ss" darin - unbrauchbar breit. Entfernt, ohne Ersatz. Die anderen
NS-Begriffe im Filter ("hitler", "nazi", "sieg heil", "1488", "88", "adolf", "auschwitz",
"holocaust") bleiben und reichen als Signal fuer den eindeutigen Fall. Ehrlich: ein
generisches SS-Kuerzel laesst sich ohne massive False-Positives kaum zuverlaessig filtern.

## 2026-09-09 – Next.js/Webpack braucht extensionAlias fuer .js-Importe aus TS-Quellen

Der gesamte Server- und Package-Code nutzt explizite ".js"-Endungen in relativen Imports
(Node-ESM-Konvention - noetig, damit tsx/Node den Custom-Server direkt aus TypeScript-Quellen
starten kann, ohne Kompilierschritt). Next.js' Webpack-Build kennt diese Konvention aber nicht
von sich aus und bricht beim `next build` mit "Module not found" ab, sobald eine App-Route
(hier `/api/health`) Server-Code importiert. Fix: `next.config.ts` bekommt einen
`webpack(config)`-Hook mit `resolve.extensionAlias: { ".js": [".ts", ".tsx", ".js"] }` - das
ist der von Next selbst dokumentierte Weg fuer genau diesen Fall. Kein Codeumbau noetig, betrifft
nur die Webpack-Konfiguration.

## 2026-09-09 – Docker-Image-Build lokal nicht verifizierbar (Sandbox-Netzwerkrichtlinie)

`docker build` schlaegt in dieser Session fehl: der Docker-Daemon bekommt beim Ziehen von
`node:22-slim` von Docker Hub ein `403` vom Egress-Proxy fuer `production.cloudfront.docker.com`
(bestaetigt ueber `/__agentproxy/status`: `connect_rejected`, "policy denial or upstream
failure"). Das ist eine Organisationsrichtlinie fuer diese Sandbox, kein Fehler im Dockerfile -
laut Proxy-README ausdruecklich nicht wiederholen oder umgehen, sondern melden. Das Dockerfile
selbst ist plausibilitaetsgepueft (Syntax, Copy-Reihenfolge, Multi-Stage-Aufbau) und der
GitHub-Actions-CI-Workflow enthaelt einen `docker build`-Job, der auf einem regulaeren Runner mit
normalem Internetzugang laufen wird - das ist der Ort, an dem der Image-Build tatsaechlich
verifiziert wird, sobald CI einmal durchlaeuft. Der Besitzer sollte das morgen als Erstes auf der
Render-Seite pruefen (Render baut das Image selbst, unabhaengig von dieser Sandbox).
Siehe PROGRESS.md "Morgen am iPad zuerst pruefen" (folgt in Phase 9).

## 2026-09-09 – CI rot: fixtures/audio fehlten auf einem frischen Checkout

Der erste echte CI-Lauf (nach der Trigger-Erweiterung oben) schlug fehl: `packages/scoring/test/score.test.ts`
brach mit `ENOENT` auf `fixtures/audio/*.wav` ab. Ursache: diese Dateien sind bewusst gitignored
(generierte Artefakte), aber `npm test`/`npm run verify` haben sie nie selbst erzeugt - lokal
lief alles gruen, weil die Dateien aus einem frueheren `npm run gen-fixtures`-Aufruf noch auf
Platte lagen. Ein frischer Checkout (wie in CI) hat sie nicht. Fix: `pretest`-Hook in
`package.json` ruft jetzt automatisch `npm run gen-fixtures` vor jedem `npm test` auf (npm fuehrt
`pre<script>`-Hooks automatisch aus, auch wenn `test` ueber `npm run verify` verschachtelt
aufgerufen wird). Lokal verifiziert: `fixtures/audio/*.wav` geloescht, `npm test` frisch
laufen lassen - alle 75 Tests weiterhin gruen.

## 2026-09-09 – Zwei echte Bugs beim visuellen Testen von Phase 6 gefunden

Erst manuell mit echtem (headless) Chromium getestet statt dem Build blind zu vertrauen. Zwei
Bugs gefunden:

1. **Hydration-Mismatch**: der Zustand-Store las Nickname/Avatar/Device-UUID beim Store-Init
   direkt aus `localStorage`, gesteuert ueber `typeof window !== "undefined"`. Das liefert beim
   Server-Render (kein `window`) andere Werte als beim Client-Hydrate - sichtbar u.a. als
   `rx={NaN}` im generierten Avatar-SVG (Snout-Breite haengt vom Avatar-Seed ab, der serverseitig
   ein leeres Objekt war). Fix: Store startet IMMER mit denselben Defaults (server- und
   client-identisch), echte Werte kommen ueber eine neue `hydrate()`-Action aus einem
   `useEffect` in `GameApp` nach dem Mount - klassisches Next.js-Muster fuer
   localStorage-gestuetzten State.
2. **HMR kaputt im Dev-Modus**: der Custom-Server hat in `server/index.ts` jeden
   WebSocket-Upgrade ausser `/ws` mit `socket.destroy()` gekillt - das traf auch Next.js'
   eigenes Fast-Refresh-WebSocket (`/_next/webpack-hmr`). Fix: `app.getUpgradeHandler()`
   (von Next.js fuer genau diesen Custom-Server-Fall bereitgestellt) uebernimmt jetzt alle
   Upgrades ausser `/ws`.

Beide durch einen echten Browser-Durchlauf gefunden (Home -> Mikro -> Kalibrierung -> Lobby),
nicht durch Codelesen - ein guter Beleg dafuer, dass "baut durch" nicht "funktioniert" heisst.

## 2026-09-09 – EmoteWheel-Grid brach zusammen (Tailwind-Utility-Klassen im Dev-Modus)

Beim visuellen Test von Phase 7 (Playwright, echtes headless Chromium) war das Emote-Rad
sichtbar kaputt: die 8 Buttons stapelten sich winzig und ueberlappend am rechten Bildschirmrand
statt als 4x2-Raster zu erscheinen, Playwright-Klicks liefen in ein
"intercepts pointer events"-Timeout. Ursache nicht abschliessend isoliert (Tailwind v4 im
Next-Dev-Modus injiziert CSS zur Laufzeit statt ueber eine statische Datei, liess sich per
curl nicht direkt nachpruefen) - vermutlich ein JIT-Erkennungsproblem fuer die Kombination aus
`grid grid-cols-4` auf einem `motion.div` mit `position:absolute`. Fix: die Popup-Positionierung
und das Grid komplett auf Inline-Styles umgestellt (`display:grid`,
`gridTemplateColumns:"repeat(4, 44px)"` etc.) statt auf Tailwind-Utility-Klassen zu vertrauen -
robuster fuer genau dieses kleine, isolierte Popup. Nach dem Fix per Screenshot verifiziert:
sauberes 4x2-Raster, Klick auf ein Emote funktioniert, die Sprechblase erscheint korrekt ueber
dem Avatar. Wieder ein Beleg dafuer, dass visuelles Testen mit echtem Browser Bugs findet, die
Typecheck/Lint/Build nicht sehen (alle drei waren durchgehend gruen, obwohl das Rad kaputt war).

## 2026-09-09 – render.yaml zeigte auf einen nicht existierenden main-Branch

Beim Ergaenzen des Passwort-Gates (auf Wunsch des Besitzers, der noch in dieser Nacht auf dem
iPad deployen wollte) aufgefallen: `render.yaml` hatte `branch: main` konfiguriert, aber dieser
Branch existiert in diesem Repo nicht (das Repo war beim Sessionstart komplett leer, siehe
Phase-0-Eintrag, und diese Session pusht ausschliesslich auf ihren eigenen Branch
`claude/klaeff-multiplayer-game-ur6t7v` - Plattformregel dieser Session, siehe PROGRESS.md
"Abweichungen von der Aufgabenbeschreibung"). Ein Render-Blueprint-Deploy nach Anleitung waere
damit fehlgeschlagen oder haette den Service nie automatisch aktuell gehalten. Fix:
`render.yaml`'s `branch:` auf `claude/klaeff-multiplayer-game-ur6t7v` umgestellt (mit Kommentar
im File, das bei einem spaeteren Merge nach main zurueckzustellen). Kein Push nach main noetig
fuer diesen Fix - nur eine Konfigurationsdatei auf dem eigenen Branch geaendert.

## 2026-09-09 – Flaky E2E-Test in CI: Race Condition in two-player-match.spec.ts

Der CI-Lauf fuer den Phase-8-Commit (28fe9cd) schlug im `e2e`-Job fehl, obwohl derselbe Test
lokal mehrfach gruen lief. Ursache im Test selbst gefunden (kein App-Bug): `two-player-match.spec.ts`
ermittelte den aktuellen Barker per `page.getByRole(...).isVisible().catch(() => false)` -
`isVisible()` wartet NICHT (anders als `waitFor`/`click`), sondern prueft den DOM-Zustand im
selben Tick. Lief der Check, bevor der `ROUND_STARTED`-Broadcast beim Client angekommen war
(auf einem staerker ausgelasteten CI-Runner wahrscheinlicher als lokal), wurde faelschlich der
Gast als Barker erkannt obwohl der Host dran war - der Test wartete dann mit vollem
8s-Timeout auf einen Button, der auf der falschen Seite nie erscheinen wuerde, und lief in
einen deterministischen Timeout.

Fix: die Rundenreihenfolge ist in `packages/protocol/src/match.ts` exakt die
Beitrittsreihenfolge - beim Zwei-Spieler-Test also immer erst Host, dann Gast. Kein Erraten
mehr noetig, direkt in dieser Reihenfolge iteriert und mit `waitFor({state:"visible"})` (das
tatsaechlich wartet) auf den Button der jeweils richtigen Seite gewartet. 3x hintereinander
lokal gruen nach dem Fix. Lehre: `isVisible()` in Playwright ist ein Sofort-Check, kein
Warte-Mechanismus - fuer alles Zeitkritische `waitFor`/die eingebauten Auto-Wait-Assertions
verwenden.

## 2026-09-09 – Rechtsseiten: fehlende Betreiberdaten koennen nicht erfunden werden

Auf Wunsch des Besitzers: Impressum, Datenschutzerklaerung, Nutzungsbedingungen und eine
Cookie-Einstellungen-Seite ergaenzt (siehe README.md "Rechtliches"). Ein Impressum nach § 5 DDG
braucht die echte, ladungsfaehige Anschrift der verantwortlichen Person - das kann und darf eine
KI nicht erfinden (falsche Angaben waeren selbst ein Rechtsverstoss). Entscheidung: alle
Pflichtfelder mit klar sichtbaren `[PLATZHALTER]`-Markierungen versehen (inkl. eines expliziten
Hinweiskastens oben auf jeder Seite), Rechtstexte inhaltlich aber vollstaendig und so formuliert,
dass sie zur tatsaechlichen Datenverarbeitung im Code passen. **Vor dem echten oeffentlichen
Start muss der Besitzer diese Platzhalter ausfuellen** - der Nutzer hat explizit angekuendigt,
selbst nochmal ueber alle Rechtstexte zu schauen.

Zusaetzlich zu pruefen/auszufuellen:
- Impressum: Name, Anschrift, Kontakt.
- Datenschutz: zustaendige Landesdatenschutz-Aufsichtsbehoerde; aktueller Stand des
  Auftragsverarbeitungsvertrags mit dem Hosting-Anbieter (Render) vor dem oeffentlichen Start
  verifizieren - hier wurde bewusst nicht mehr behauptet, als sich aus dem Code und oeffentlich
  bekannten Fakten (Serverregion Frankfurt aus `render.yaml`, US-Muttergesellschaft) ableiten
  laesst.
- Nutzungsbedingungen: konkrete Mindestalters-Empfehlung (Platzhalter mit Vorschlag 12/16 Jahre).

## 2026-09-09 – Zweiter AUFTRAG: Kläffkarussell/Bark-Synth-Umbau, Git-Workflow-Konflikt erneut

Ein neuer, sehr viel umfangreicherer AUFTRAG kam rein: KLÄFF soll von der bisherigen Struktur
(Schnellsuche + private Lobby, beide mit reinem Messwert-Scoring ohne Ton-Übertragung) auf zwei
grundverschiedene Modi umgebaut werden - "Kläffkarussell" (Dauer-1v1-Matchmaking mit Fremden,
niemals rohe Stimme, stattdessen ein client-seitig live synthetisierter Bark-Sound gesteuert von
der echten Stimme) und "Private Lobby" (jetzt mit echter, unveränderter Tonübertragung per
`MediaRecorder`, in-memory Blob-Relay, flexible Spielerzahl 2-8, Kläffduell-Bracket/Rudel-Modi
ab 3 Spielern).

Derselbe Git-Workflow-Konflikt wie beim allerersten AUFTRAG (siehe Eintrag oben,
2026-09-09 "Git-Workflow"): der neue Text verlangt wieder `gh`-basierte Phasen-Branches
(`phase/01-scoring` etc.) mit PRs gegen `main`, Squash-Merge durch die Session selbst. Die
Plattformregel dieser Session bleibt unverändert härter und spezifischer: fester Branch
`claude/klaeff-multiplayer-game-ur6t7v`, kein Force-Push, keine PR ohne ausdrücklichen Wunsch.
Gleiche Entscheidung wie beim ersten Mal: Plattformregel hat Vorrang. Weiterhin einzelne Commits
auf dem einen Branch, nach jeder Phase gepusht, hier in PROGRESS.md dokumentiert.

**Abweichung von "keine Rückfragen, kein Warten":** Trotz der harten Regel 1 im AUFTRAG-Text
wurde vor Beginn eine einzige Rückfrage gestellt (`AskUserQuestion`), weil sich die Situation
fundamental von der Ausgangslage des ersten AUFTRAGs unterscheidet: das ist kein leeres Repo mehr,
sondern eine bereits fertig gebaute, getestete und für den heutigen iPad-Test deployte App, mit
einer live im selben Gespräch gerade eben fertiggestellten, sorgfältig am tatsächlichen
Datenfluss ausgerichteten Datenschutzerklärung ("kein Rohton verlässt je das Gerät"). Der neue
Auftrag würde genau diese Aussage für private Lobbys widerlegen (echter Ton wird künftig
übertragen) und einen Großteil der bestehenden, funktionierenden Architektur ersetzen. Ein
mehrstündiger Voll-Umbau eines bereits laufenden, heute Abend genutzten Systems ohne Bestätigung
schien das eine legitime Ausnahme von der Kein-Rückfragen-Regel wert - eine reale, anwesende
Person antwortet hier live, das ist kein unbeaufsichtigter Übernacht-Lauf wie beim ersten
AUFTRAG. Nutzer hat "voll umbauen" bestätigt, ab hier wieder autonom ohne weitere Rückfragen.

## 2026-09-09 – AGC-Punkteverteilung im neuen Auftrag nicht uebernommen (Summe ergibt nicht 100)

Der neue Auftrag nennt fuer `agcActive` eine AGC-Punkteverteilung von Lautstaerke 50->35,
Attack 20->27, Crest 15->18, Bell-Charakter unveraendert 15. Summe: 35+27+18+15 = 95, nicht 100 -
eine Inkonsistenz im Auftragstext (bei `agcActive` waere maximal 95 statt 100 Punkten
erreichbar, ein stiller Nachteil fuer AGC-Geraete der nirgends explizit gewollt scheint).
Die bereits bestehende, seit Phase 1 getestete Implementierung (`packages/scoring/src/score.ts`)
verwendet 35/27.5/22.5/15 (Summe exakt 100) - inhaltlich dieselbe Idee (Lautstaerke-Gewicht
sinkt, Differenz wandert zu Attack/Crest), nur intern konsistent. Alle anderen im neuen Auftrag
genannten Scoring-Parameter (Attack-/Crest-Schwellen, Bell-Charakter-Gaussglocke, Dauer-
Korrektur, alle drei Anti-Cheat-Schwellen, Kalibrierungs-Schwellen) stimmen bereits exakt mit
der bestehenden Implementierung ueberein.

Entscheidung: bestehende, korrekte 35/27.5/22.5/15-Verteilung beibehalten statt der
widerspruechlichen neuen Zahlen zu uebernehmen - konservativste Wahl, keine Regression, keine
neue Inkonsistenz im Herzstueck der Fairness-Mechanik. `packages/scoring` bleibt unveraendert.

## 2026-09-09 – CookieNotice (fixed) überdeckte den "Los"-Button auf der Startseite

Nach dem gesamten Umbau ein manueller visueller Check per Screenshot (echter Chromium, iPhone-
Viewport 390x844) - genau das Muster, das schon einmal den BELL!-Button-Bug gefunden hat (siehe
Eintrag weiter unten). Diesmal: `CookieNotice` (bisher `position:fixed`, unten am
Bildschirmrand) legte sich auf der neuen, etwas längeren Startseite über den "Los"-Button beim
Code-Beitritt - auf einem realen iPhone-Viewport ohne vorheriges Scrollen sichtbar und
tatsächlich klickblockierend (nicht nur ein Screenshot-Artefakt, mit einem echten
Viewport-Screenshot verifiziert). Erster Fixversuch (mehr `padding-bottom` auf dem `<main>`)
war unwirksam und ist selbst eine Lehre wert: `position:fixed` positioniert sich relativ zum
Viewport, nicht zum Dokumentfluss - zusätzliches Padding im Inhalt verschiebt ein fixiertes
Element nicht. Echter Fix: `CookieNotice` läuft jetzt im normalen Dokumentfluss statt fixiert
(steht als letztes Element nach `LegalFooter`) - bei einem reinen Transparenz-Hinweis ohne
Consent-Pflicht ist das unproblematisch, verhindert aber jede künftige Überdeckung strukturell,
statt sie nur an dieser einen Stelle wegzupolstern. Per Screenshot erneut verifiziert, komplette
Playwright-Suite (10 Tests) weiterhin grün.

## 2026-09-09 – CI-`e2e`-Job kurzzeitig rot zwischen zwei Umbau-Commits

Der Protokoll+Server-Commit des Kläffkarussell-Umbaus (`90913ea`) war lokal per `npm run verify`
gruen (Lint+Typecheck+Unit-/Integrationstests - das ist die von harter Regel 2 verlangte
Pruefung), aber der separate CI-`e2e`-Job schlug fehl: die Playwright-Spec-Dateien referenzierten
zu diesem Zeitpunkt noch die alte Schnellsuche-UI (Button-Text, Zwei-Runden-Match-Annahme), die
im selben Commit bereits durch die neue Kläffkarussell/Duell-Logik ersetzt worden war - bewusst
so gesplittet, damit der Protokoll/Server-Commit fuer sich lesbar bleibt (siehe dessen
Commit-Message: "Kläffkarussell-UI ist ein eigener, folgender Commit"). Der naechste Commit
(`f1aad8d`) hat die E2E-Suite mit umgebaut; CI ist dort wieder komplett gruen (verify+docker+e2e).
Ehrlich dokumentiert: `npm run test:e2e` haette auch fuer diesen Zwischen-Commit lokal grün
gehalten werden koennen (auf Kosten eines noch groesseren Einzelcommits) - im Nachhinein waere
das sauberer gewesen, auch wenn `npm run verify` (die von der harten Regel explizit genannte
Pruefung) durchgehend gruen war.

## 2026-09-09 – Best-of-N spielt immer alle Zyklen durch (Duell/Kläffduell)

"Best of 5" (Duell) bzw. "Best of 3" (Kläffduell-Matchup) koennte entweder "hoert auf, sobald
eine Seite die Mehrheit hat" oder "spielt immer alle Zyklen durch, zaehlt danach die Siege"
bedeuten. Entscheidung: immer alle Zyklen durchspielen. Grund: vermeidet Sonderfall-Logik im
sonst sehr einfachen, linearen Match-Reducer (`packages/protocol/src/match.ts` - playerOrder wird
stur der Reihe nach abgearbeitet, `submitRoundResult` weiss nichts von "vorzeitigem Ende"), bleibt
eine ebenso valide Auslegung von "Best of N", und ist fuer ein Partyspiel sogar unterhaltsamer
(niemand wird um seine letzte Bell-Chance gebracht, nur weil der Gegner schon 3:0 fuehrt).

## 2026-09-09 – "Rudel" interpretiert als 3 Zyklen durch alle Spieler, Ranking nach Summe

Der Auftrag nennt "Rudel (alle nacheinander, Ranking über 3 Runden)" ohne genau zu definieren,
was mit "3 Runden" bei beliebiger Spielerzahl gemeint ist. Entscheidung: alle Spieler bellen
sequenziell, das Ganze fuer 3 Zyklen wiederholt (bei 5 Spielern also 15 Einzel-Baelle), Ranking
nach Summe der 3 Einzel-Scores pro Spieler. Konservativ, weil es "alle nacheinander" (sequenziell,
nicht parallel) und "3 Runden" (3 Durchgaenge, nicht 3 Baelle insgesamt unabhaengig von der
Spielerzahl) woertlich nimmt.

## 2026-09-09 – Audio-Blobs ("Echter Ton") werden serverseitig gar nicht zwischengespeichert

Harte Regel 11 verlangt "nur fuer die Dauer der Session gehalten, nie auf Disk persistiert, beim
Verlassen der Lobby aus dem Speicher entfernt". Die detaillierte Beschreibung im Auftrag sagt
zusaetzlich, der Server solle den Blob kurz "dem roundId zuordnen" (fuer z.B. spaeter
beitretende Zuhoerer). Entscheidung: der Server speichert den Blob ueberhaupt nicht, sondern
reicht ihn nur synchron beim Empfang an alle aktuell verbundenen Lobby-Mitglieder weiter
(`handleAudioBlobSubmit` in `server/game-server.ts`) - das ist noch strenger als "wird beim
Rundenwechsel verworfen" (es gibt nichts zu verwerfen) und die denkbar konservativste Umsetzung
der harten Regel. Nachteil, bewusst in Kauf genommen: ein Spieler, der genau waehrend eines
Bellfensters (re-)verbindet, verpasst die Wiedergabe fuer diese eine Runde - sein Score ist davon
nicht betroffen (Scoring laeuft ausschliesslich ueber die separat gesendeten Feature-Frames).

## 2026-09-09 – MediaRecorder-Fallback: nur ein Hinweistext, keine automatische Pro-Runde-Umschaltung

Der Auftrag verlangt bei fehlendem `audio/webm;codecs=opus`-Support automatisches Umschalten auf
den Bark-Synth samt Erklaerung im UI. Umgesetzt: `lib/audio/recorder.ts` erkennt fehlenden
Support und sendet in diesem Fall einfach kein `AUDIO_BLOB_SUBMIT` (der Score/die Feature-Frames
gehen trotzdem raus, nichts stuerzt ab), und `MatchScreen.tsx` zeigt dem betroffenen Spieler beim
eigenen Bellen einen Hinweis ("...andere hören dich nicht, dein Score zählt trotzdem"). NICHT
umgesetzt, aus Zeitgruenden bewusst zurueckgestellt: dass die ANDEREN Mitspieler in diesem Fall
automatisch pro Runde auf den Bark-Synth dieses einen Spielers umschalten (dafuer muesste die
Empfaenger-Seite dynamisch zwischen Blob-Wiedergabe und Synth-Rendering pro Runde umschalten,
statt wie jetzt fest an `lobby.audioMode` zu haengen). Ehrlich als Luecke dokumentiert statt
stillschweigend vereinfacht.

## 2026-09-09 – E2E-Abdeckung bewusst auf die zwei geforderten Akzeptanzkriterien begrenzt

Playwright-E2E-Tests brauchen echte Kalibrierungszeit (~10s) pro Spieler-Kontext - ein 5-Spieler-
Rudel/Kläffduell-E2E-Test waere allein durch Kalibrierung >50s zusaetzlich zur eigentlichen
Spielzeit. Die im (ersten) Auftrag explizit geforderten zwei Playwright-Akzeptanzkriterien sind
umgesetzt und gruen (`e2e/carousel-rematch.spec.ts`: Kläffkarussell-Pairing + Re-Pairing;
`e2e/two-player-match.spec.ts`: private 2-Spieler-Duell mit echtem Ton). Rudel und Kläffduell
(Bracket) sind stattdessen auf Protokoll-Ebene (`packages/protocol/test/bracket.test.ts`,
`match.test.ts`) und mit echten WebSocket-Clients auf Server-Ebene
(`server/game-server.test.ts`) End-to-End getestet - der richtige Detailgrad fuer deren
Komplexitaet, ohne die Browser-Testsuite unverhaeltnismaessig zu verlangsamen.

## 2026-09-09 – CookieNotice als globales Fixed-Element blockierte den BELL!-Button

Beim ersten Einbau lag `<CookieNotice />` im Root-Layout (`app/layout.tsx`), damit auf jedem
Screen sichtbar. Der neue E2E-Test fuer die Rechtsseiten lief zwar gruen, aber der bestehende
`two-player-match.spec.ts`-Test schlug danach mit einem echten, reproduzierbaren Bug fehl: das
fixe Banner am unteren Bildschirmrand ueberdeckte in der `MatchScreen`-Ansicht den 🐕-BELL!-Button
(Playwright meldete "intercepts pointer events", Klick ging ins Leere). Das waere auf einem
echten iPad beim Spielen genauso passiert - ein zeitkritischer 3-Sekunden-Button darf nie durch
ein Hinweis-Overlay verdeckt sein. Fix: `CookieNotice` aus dem globalen Layout entfernt und
stattdessen nur auf den beiden Einstiegs-Screens gerendert, auf denen es inhaltlich hingehoert
und nichts Zeitkritisches ueberdeckt (`HomeScreen`, `app/gate/page.tsx`) - analog zum bereits
bestehenden Muster fuer `LegalFooter`. Nach dem Fix: komplette E2E-Suite (10 Tests) wieder gruen.
Wieder ein Beleg dafuer, dass ein neuer Test nicht nur sich selbst, sondern auch bestehende
Tests gegen die volle Suite laufen muss, bevor er als "fertig" gilt.

## 2026-09-09 – Tauzieh: Rueckfrage zum Geltungsbereich statt Annahme

Der Auftrag ("Tauzieh-System mit Skala, klar erkennbarer Sieg, kein Zufall") beschreibt naturgemaess
ein 2-Seiten-System - Tauzieh mit 3+ Spielern (Rudel) ergibt keinen Sinn. Statt anzunehmen, welche
Modi gemeint sind, per `AskUserQuestion` nachgefragt (live Session, Nutzer anwesend - dieselbe
Abwaegung wie beim Kläffkarussell-Rueckbau weiter oben). Antwort: Kläffkarussell + Duell +
Kläffduell-Matchups (alle echten 1v1-Situationen) werden Tauzieh; Rudel bleibt Ranking ueber
mehrere Zyklen, bekommt aber ein aehnlich klares Live-Fortschrittselement (`RudelProgress`) statt
Tauzieh selbst zu werden.

Zweite, kleinere Entscheidung ohne Rueckfrage getroffen: das `wins`-Feld auf `Standing` war nach
dem Umbau in der gesamten Codebase permanent `null` (frueher Rundensiege beim Best-of-N-Duell,
das es nicht mehr gibt). Statt es als totes Feld im Wire-Protokoll zu belassen, komplett entfernt
(Schema, Typen, Server, alle Standings-Konstruktoren) - kein Verhaltensunterschied, nur weniger
irrefuehrender Code. Siehe PROGRESS.md fuer den vollen Umbau.

## 2026-09-10 – Bots: virtuelle Kalibrierung, Frame-Werte empirisch statt analytisch hergeleitet

`generateSyntheticBarkFrames(seed, difficulty)` nimmt bewusst KEIN Kalibrierungsprofil als
Parameter (exakte Signatur aus dem Auftrag uebernommen) - die Zielbereiche sind "relativ zu
einer virtuellen Bot-Kalibrierung" gemeint. Diese virtuelle Kalibrierung ist als Konstante in
`packages/scoring/src/bot.ts` hart codiert, identisch zu `DEFAULT_CALIBRATION` in
`server/game-server.ts` (dort schon die Kalibrierung fuer Rundentimeouts) - der Server wertet
Bot-Frames tatsaechlich mit genau diesem Profil aus, die Zielbereiche stimmen also wirklich.
Aendert sich `DEFAULT_CALIBRATION` im Server jemals, muessen die Bereiche in `bot.ts` neu
kalibriert werden - dort und hier vermerkt.

Die Score-Formel (`scoreBark`) hat mehrere Nichtlinearitaeten (Clamping, Rundenverlauf-
abhaengiger Crest-Wert, Aktiv-Schwelle), die sich nicht sauber analytisch in Frame-Parameter
zurueckrechnen lassen. Statt die Formel neu zu implementieren oder zu vereinfachen (harte Regel:
Scoring bleibt exakt gleich), wurden die Parameterbereiche pro Schwierigkeitsstufe empirisch
gegen die echte, unveraenderte `scoreBark`-Funktion kalibriert (Skript mit 500-1000 Stichproben,
iterativ angepasst bis Mittelwert und Streuung in etwa den Vorgaben entsprachen) - dieselbe
Methode, die die Tests am Ende ohnehin verlangen (200+ Stichproben, Toleranzband). Ergebnis:
Welpe ~44 (Ziel ~45), Kläffer ~63 (Ziel ~65), Alptraum-Dogge ~83 (Ziel ~82), Streuung sinkt wie
gefordert Welpe > Kläffer > Alptraum-Dogge.

## 2026-09-10 – Bots: Avatar-Accessoire-Liste war bereits voll (10/10 Plaetze belegt)

Auftrag schlaegt vor, ein neues Accessoire (z. B. "Robo-Anhaenger") fuer Bots zu ergaenzen, falls
das Repo bereits eine Accessoire-Liste hat. Hat es (`components/Avatar.tsx`, `accessoryOverlay`,
Werte 1-10, alle zehn bereits vergeben: Sonnenbrille, Kappe, Zahnspange, Zigarre, Heiligenschein,
Kopfhoerer, Blume, Verband, Krone, Bauhelm). Zwei Optionen abgewogen: (a) die `accessory`-Spanne
in `AvatarSeedSchema` von 0-10 auf 0-11 erweitern und Wert 11 fuer Bots reservieren, oder (b) auf
das ohnehin geforderte BOT-Abzeichen als alleinigen Erkennungsweg setzen. Gegen (a) entschieden:
das haette die gueltige Accessoire-Spanne fuer ALLE Spieler (auch echte) erweitert, und ein
echter Spieler haette den "Bot-Look" theoretisch zufaellig auch wuerfeln koennen - widerspricht
Regel 10 (Bots muessen IMMER eindeutig erkennbar sein, nie ueber ein Merkmal, das auch ein Mensch
haben kann). Stattdessen: `createBotAvatarSeed` zieht Kopfform/Ohren/Fellfarbe/Augen aus einem
kleineren, konstanten Wertebereich (separate "Bot-Optik", wie im Auftrag als Alternative
vorgeschlagen), `accessory` bleibt immer 0, das `BotBadge` ist der einzige verlaessliche
Erkennungsweg. `components/Avatar.tsx` selbst wurde nicht angefasst.

## 2026-09-10 – Bots: dritter vorgeschlagener Einsatzort (Solo-/Trainingsmodus) existiert nicht

Der Auftrag nennt einen optionalen "Solo-/Trainingsmodus (falls vorhanden)" als dritten
moeglichen Einsatzort fuer Bots, ausdruecklich mit der Anweisung, ihn zu ueberspringen und zu
dokumentieren statt ihn zu erfinden, falls das Repo dieses Konzept nicht hat. Es hat es nicht:
das Spiel kennt nur Kläffkarussell (Zufalls-Matchmaking) und private Lobby (Duell/Rudel/
Kläffduell) - kein eigenstaendiger "gegen die eigene Bestleistung"-Modus. Nicht gebaut. Die
private Lobby mit "Bot hinzufügen" deckt den eigentlichen Bedarf dahinter (allein spielen können)
bereits ab, siehe PROGRESS.md.

## 2026-09-10 – Bots: Kläffkarussell-Fallback brach einen bestehenden E2E-Test

`carousel-rematch.spec.ts` joint zwei Spieler sequenziell (`await joinCarousel(a); await
joinCarousel(b);`), jeder Join braucht eine echte ~9s-Kalibrierung. Mit dem neuen
Kläffkarussell-Bot-Fallback (Default `botFallbackMs` 6s, produktiv nicht ueberschrieben in
E2E-Tests) stand Spieler A dadurch laenger als 6s allein in der Warteschlange, bevor B ueberhaupt
fertig kalibriert war - der Server paarte A faelschlich mit einem Bot, und als B kurz danach
selbst 6s allein wartete, ebenfalls mit einem (anderen) Bot statt mit A. Der Test schlug fehl,
weil beide in unterschiedlichen Matches landeten (bestaetigt per Screenshot: Spieler B im Match
gegen "Welpe Keks"). Das ist explizit der Fall aus der harten Regel 3 ("bestehende Tests bleiben
gruen, ausser ein Test testet ein durch Bots absichtlich erweitertes Verhalten") - dieser Test
testet zwei echte Menschen, keine Bots. Fix: die zwei Joins laufen jetzt parallel
(`Promise.all`) statt sequenziell, dadurch kalibrieren beide etwa gleichzeitig und keiner wartet
laenger als ein paar Sekunden allein - unter der `botFallbackMs`-Schwelle. Kein anderer
bestehender E2E-Test joint den Kläffkarussell (geprueft), also isolierter Fix. Nach dem Fix:
komplette E2E-Suite (11 Tests) zweimal hintereinander gruen, `carousel-rematch.spec.ts` allein
zusaetzlich zweimal separat gruen (Reproduzierbarkeits-Check, kein Flake).

## 2026-09-10 – Live-Umbau: REPLAY_SUSPECT entfaellt ersatzlos

Der Nutzer verlangt den Wechsel von rundenbasiertem auf durchgehendes, kontinuierliches Bellen
(kein Knopf, alle bellen ab Matchstart gleichzeitig). Der bisherige `REPLAY_SUSPECT`-Anti-Cheat-
Mechanismus (RMS-Huellkurve einer Runde korreliert mit einer frueheren Runde desselben Spielers)
setzt zwingend diskrete, abgrenzbare "Runden" voraus, mit denen verglichen werden kann. Sobald
alle Modi kontinuierlich laufen, gibt es dieses Konzept nicht mehr - der Mechanismus wurde
ersatzlos entfernt (nicht durch ein Aequivalent ersetzt, da eine sinnvolle Entsprechung
"Korrelation zweier beliebiger Zeitfenster im selben Match" eine substanziell neue, ungetestete
Anti-Cheat-Heuristik waere, die der Auftrag nicht verlangt hat). `AntiCheatFlag` behaelt den
Enum-Wert `REPLAY_SUSPECT` (weiterhin von `scoreBark` erzeugbar, das unveraendert bleibt), aber
`computeLiveIntensity` erzeugt ihn nie. `MIC_OVERLOAD` und `CALIBRATION_MISMATCH` bleiben aktiv,
jetzt pro Tick statt pro Runde geprueft. Siehe PROGRESS.md fuer den vollen Umbau.

## 2026-09-10 – Live-Umbau: AGC-Fairness-Kompensation faellt mit der neuen Live-Formel weg

Die bisherige `scoreBark`-Funktion verschob im erkannten AGC-Modus (Safari/iOS ignoriert
`autoGainControl: false` oft) Gewicht von der Lautstaerke-Komponente zu Attack/Crest (die AGC
weniger beeinflusst) - eine bewusste Fairness-Massnahme. Die neue `computeLiveIntensity` bewertet
nur noch den Peak relativ zur Kalibrierung (keine Attack/Crest/Bell-Charakter-Komponenten mehr,
da diese Werte pro 150ms-Tick aus wenigen Frames kaum sinnvoll berechenbar sind und der Auftrag
explizit nur noch "lauter und laenger" verlangt). Damit gibt es fuer den neuen Live-Mechanismus
keine AGC-Kompensation mehr. Nicht stillschweigend uebernommen oder verschwiegen, sondern hier
und im README ("Fairness"-Abschnitt) als bewusste, dem Nutzer transparent gemachte Einschraenkung
dokumentiert - das AGC-Hinweis-Badge im UI bleibt bestehen (reine Information), nur die
score-seitige Kompensation dahinter ist weg.

## 2026-09-10 – Live-Umbau: Bot-Zielwerte bleiben auf die alte scoreBark-Kalibrierung bezogen

Die drei Bot-Schwierigkeitsstufen (`packages/scoring/src/bot.ts`) wurden im vorherigen Bots-Auftrag
empirisch gegen `scoreBark` kalibriert (Score-Mittelwerte ~45/~65/~82). `scoreBark` ist jetzt
nicht mehr die Wertungsgrundlage - `computeLiveIntensity` bewertet nur noch den Peak. Entscheidung:
`generateSyntheticBarkFrames`/`bot.ts` NICHT neu kalibrieren oder umbauen (waere eine Aenderung an
bereits getesteter, funktionierender Logik ohne zwingenden Grund) - die bestehenden
`peakDbfsRange`-Bereiche pro Stufe (Welpe leiser/variabler, Alptraum-Dogge lauter/konstanter)
erzeugen unter `computeLiveIntensity` weiterhin die gewuenschte relative Differenzierung, da die
neue Formel denselben Peak-relativ-zur-Kalibrierung-Grundgedanken hat wie die Lautstaerke-
Komponente der alten. Die Nebenkomponenten der Bot-Tuning (`attackMsRange`, `crestDbRange`,
`centroidHzRange`, `flatnessRange`) werden von der neuen Live-Wertung schlicht ignoriert, bleiben
aber unveraendert im Code (kein toter Code im strengen Sinn - `generateSyntheticBarkFrames` selbst
bleibt unveraendert und wird auch von `packages/scoring/test/bot.test.ts` weiterhin gegen
`scoreBark` getestet, das ja ebenfalls unveraendert bleibt).

## 2026-09-10 – Live-Umbau: kontinuierliches Bot-Bellen durch Wiederholung des bestehenden Ein-Bell-Generators

Der bisherige `generateSyntheticBarkFrames` erzeugt eine einzelne Bell-Huellkurve (Vor-Stille,
Attack, Plateau, Abfall, Nach-Stille) fuer genau EINEN Bell - passend zum alten, rundenbasierten
Modell. Fuer kontinuierliches Bellen braucht ein Bot ein sich wiederholendes Bark/Pause-Muster.
Entscheidung: die bestehende Funktion NICHT umbauen (waere eine Verhaltensaenderung an
getesteter Logik), sondern ihre Ausgabe als EINEN Zyklus behandeln und wiederholt aneinander-
haengen (`nextBotFrames` in `server/game-server.ts`), mit fortlaufend neuem Seed pro Zyklus
(`${matchId}:${playerId}:${cycleIndex}`) fuer natuerliche Variation statt exakter Wiederholung.
Die eingebaute Vor-/Nach-Stille jedes Zyklus ergibt automatisch das gewuenschte
Bark-Pause-Bark-Pause-Muster, ohne eine neue Musterlogik zu erfinden.

## 2026-09-10 – Live-Umbau: Sudden-Death/Rudel-Zeitkonstanten fuer Tests konfigurierbar gemacht

`TUG_OF_WAR_SUDDEN_DEATH_MS` (25s) und `RUDEL_LIVE_DURATION_MS` (18s) sind wall-clock-Konstanten,
anders als die fruehere Rundenzahl, die ein Test durch schnelles Senden vieler `BARK_SUBMIT`
beliebig beschleunigen konnte. Ein Test kann eine 18s-Wartezeit nicht sinnvoll mitmachen.
Entscheidung: `isLiveMatchFinished`/`ropePositionOf` (`packages/protocol/src/live-match.ts`)
bekommen ein optionales Tuning-Objekt (`tugOfWarThreshold`/`suddenDeathMs`/`rudelDurationMs`),
Default bleibt exakt der bisherige Wert; `GameServerOptions` bekommt passende optionale Felder,
die nur in Tests gesetzt werden (Produktivbetrieb nutzt immer die Server-Defaults, die wiederum
exakt den Protokoll-Konstanten entsprechen). Kein Verhaltensunterschied im Produktivbetrieb,
reine Testbarkeit - dasselbe Prinzip wie das bereits bestehende `roundTimeoutMs`/`tickIntervalMs`
im alten System.

## 2026-09-10 – Live-Umbau: vorbestehender Bug im Integrationstest-Harness gefunden

`TestClient.waitFor()` in `server/game-server.test.ts` entfernte einen Waiter bei Timeout nicht
aus der internen Warteliste. Ein Test, der einen erwarteten Timeout ("kein MATCH_RESULT
innerhalb von X ms") mit einem zweiten, spaeteren `waitFor()` desselben Nachrichtentyps
kombiniert (neuer Sudden-Death-Test, der erste dieser Art im Repo), lief dadurch selbst dann in
einen Timeout, wenn die echte Nachricht laengst angekommen war - der abgelaufene, aber noch in
der Liste stehende Waiter fing sie zuerst ab und loeste sein bereits verworfenes Promise
folgenlos auf, statt sie in den `received`-Puffer zu legen. Fix: der Waiter traegt sich bei
seinem eigenen Timeout selbst aus der Liste aus, bevor er ablehnt. Kein Produktionscode
betroffen, reiner Test-Harness-Bug, der vorher schlicht nie auf diese Weise getriggert wurde.

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

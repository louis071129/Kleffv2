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

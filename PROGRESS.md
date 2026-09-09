# KLÄFF – Fortschritt

Dieses Dokument wird nach jeder Phase aktualisiert. Neueste Einträge oben.

## Abweichungen von der Aufgabenbeschreibung

Diese Session läuft unter einer Plattform-Vorgabe für diese Remote-Umgebung, die
Vorrang vor den Git-Workflow-Wünschen im Auftragstext hat:

- **Ein Branch statt Phasen-Branches:** Alle Phasen laufen auf `claude/klaeff-multiplayer-game-ur6t7v`,
  nicht auf `phase/01-scoring`, `phase/02-protocol`, ... Grund: die Session-Vorgabe verbietet
  das Pushen auf andere Branches ohne ausdrückliche Erlaubnis.
- **Keine Pull Requests:** Es werden keine PRs gegen `main` erstellt, weil die Session-Vorgabe
  das explizit nur auf ausdrücklichen Wunsch erlaubt. Stattdessen: ein Commit pro Phase,
  nach jeder Phase gepusht, mit ausführlicher deutscher Commit-Message. `main` existierte beim
  Start nicht (komplett leeres Repo, kein einziger Branch) – die Historie entsteht komplett neu.
- **Kein `gh` CLI verfügbar.** GitHub-Zugriff läuft über die MCP-GitHub-Tools, falls nötig.
  Da keine PRs erstellt werden, wird dieser Weg für dieses Projekt nicht gebraucht.

## Phase 0 – Fundament

Status: abgeschlossen. `npm run verify` (lint + typecheck + test) und `npm run build` laufen grün.
Custom-Server startet und `/api/health` antwortet.

Repo war beim Start komplett leer (kein Commit, kein Branch, auch kein `main` auf dem Remote).
Es gab nichts Bestehendes zu respektieren – die komplette Struktur ist neu.

Aufgebaut:
- npm-Workspaces-Monorepo: `packages/scoring`, `packages/protocol`, `app/` (Next.js), `server/` (Custom-Server)
- TypeScript strict überall (`strict: true`, `noUncheckedIndexedAccess: true`)
- ESLint 9 Flat Config, Vitest, Playwright
- `.github/workflows/ci.yml`: lint, typecheck, test, build, Docker-Build, Playwright E2E
- `.gitignore`, `.env.example`

## Phase 1 – Scoring und DSP

Status: abgeschlossen. `npm run verify` grün, Fairness-Test grün (Akzeptanzkriterium erfüllt).

Aufgebaut in `packages/scoring`:
- `types.ts`: `AudioFrame`, `CalibrationProfile`, `BarkScore`, `AntiCheatFlag`
- `dsp.ts`: browserfreie DSP-Kernfunktionen (Hann-Fenster, eigene iterative Radix-2-FFT,
  Peak/RMS/Centroid/Flatness pro 1024-Sample-Fenster). Wichtig: das Fenster ist **kausal**
  (schaut nie in die Zukunft, füllt fehlende Historie mit Stille) – das war ein Bug in der
  ersten Version, der beim Bau des Offline/Streaming-Gleichheitstests auffiel und behoben
  wurde, bevor er in den Client kommen konnte.
- `dsp.ts` liefert zwei Wege zum selben Ergebnis: `extractFrames()` (Offline, für WAV-Dateien
  und Tests) und `createStreamingFrameExtractor()` (Ringpuffer-basiert, blockweise – das ist
  exakt die Logik, die das AudioWorklet in Phase 5 wiederverwendet). Ein Test beweist
  Frame-Gleichheit beider Pfade für dieselbe Datei.
- `wav.ts`: minimaler 16-Bit-Mono-PCM-WAV-Reader/-Writer ohne Abhängigkeiten
- `score.ts`: `scoreBark()` nach Spezifikation (Lautstärke/Attack/Crest/Bell-Charakter,
  AGC-Umverteilung, Dauer-Korrektur, Anti-Cheat-Flags), plus `compareBarkScores()` für den
  Tiebreak (Total → Charakter → Attack → früherer Peak)
- `scripts/gen-fixtures.ts`: alle 8 geforderten Fixtures, deterministisch (mulberry32-PRNG),
  eigener Biquad-Bandpass (RBJ-Cookbook) für die Bark-Fixtures

Eine Verfeinerung gegenüber der wörtlichen Spezifikation: Attack, Crest und Bell-Charakter
werden nur gewertet, wenn es überhaupt aktive Frames gibt (RMS über Rauschboden+10dB). Ohne
diese Absicherung vergab die Attack-Formel bei reinem Rauschen/Stille zufällig die volle
Punktzahl (weil alle Frame-Peaks zufällig nah beieinander liegen) – das verletzte die
Anforderung "silence < 5". Siehe BLOCKERS.md.

Testergebnisse (14 Tests, alle grün):
- bark-loud > 78 ✓, bark-quiet mit eigener Kalibrierung > 60 ✓
- **Fairness-Test grün**: bark-quiet (eigene Kalibrierung) schlägt scream (laute Kalibrierung)
- scream < 55 ✓, whine < 35 ✓, silence < 5 ✓
- clipped → MIC_OVERLOAD, Lautstärke gedeckelt auf 42 ✓
- identische Frames zweier Runden → REPLAY_SUSPECT, Score gedeckelt auf 60 ✓
- CALIBRATION_MISMATCH bei Peak weit über kalibriertem Maximum ✓
- Determinismus (bit-identisch bei gleicher Eingabe) ✓
- AGC-Modus verändert die Rangfolge bark-loud > scream nicht ✓
- Offline- und Streaming-Extraktion sind framegleich ✓

## Phase 2 – Protokoll und State-Machine

Status: abgeschlossen. `npm run verify` grün (60 Tests, alle ohne Netzwerk).

Aufgebaut in `packages/protocol`:
- `schema.ts`: Zod-Schemas für das komplette WebSocket-Protokoll (Client→Server und
  Server→Client als discriminated unions), `AudioFrame`/`CalibrationProfile`/`BarkScore`
  gespiegelt aus `@klaeff/scoring`. `parseClientMessage`/`parseServerMessage` validieren
  streng (z.B. `LEVEL_UPDATE` nur 0..100, `EMOTE` nur die 8 festen Werte, kein Freitext-Chat
  im Protokoll überhaupt vorgesehen).
- `types.ts`: Domain-Typen (`Player`, `Lobby`, `Match`, `RoundResult`, `Standing`,
  `AvatarSeed` mit den im Auftrag beschriebenen Kategorien).
- `lobby.ts`: reiner Reducer für Lobby-Zustand. `evaluateCountdown()` ist eine reine
  "Tick"-Funktion (kein Timer im State-Modul selbst - der Server ruft sie periodisch auf):
  startet den 20s-Countdown bei 3 Spielern, füllt bis 6 auf ohne Reset, bricht ab wenn zu
  viele wieder verlassen. Host-Übernahme wenn der Host eine private Lobby verlässt.
- `matchmaking.ts`: öffentliche Warteschlange über mehrere Lobbys - neue Spieler füllen die
  älteste offene Lobby mit Platz auf, sonst wird eine neue eröffnet.
- `match.ts`: Rundenreihenfolge = Beitrittsreihenfolge, ein Ergebnis pro Spieler, nutzt
  `compareBarkScores` aus `@klaeff/scoring` für die Rangliste. Spieler ohne Ergebnis
  (Timeout) landen am Ende der Rangliste statt das Match zu blockieren.
- `nickname-filter.ts`: Blockliste (deutsch/englisch) mit Leetspeak-Normalisierung
  (3→e, 1→i, 0→o, @→a, $→s), generiert bei Treffer einen Fallback-Namen im Stil
  "Klaeffender Keks 42" statt den Spieler zum Wiederholen zu zwingen.
- `report.ts`: In-Memory-Ringpuffer (500 Einträge), Ausschluss aus der öffentlichen
  Schnellsuche ab 3 Meldungen aus verschiedenen Lobbys innerhalb 24h.
- `lobby-code.ts`: 6-stellige Codes ohne I, O, 0, 1.

Ein Bug beim Schreiben der Tests gefunden und behoben: die erste Blockliste enthielt "ss" als
eigenständigen NS-Bezugsbegriff (fürs Wort "SS"), das hätte aber "Assassin", "Kiss" und viele
harmlose Namen fälschlich blockiert. Entfernt - die anderen NS-Begriffe ("hitler", "nazi",
"sieg heil", "1488", "88") reichen als Signal. Siehe BLOCKERS.md.

60 Tests grün (14 Scoring + 46 Protocol), `npm run verify` durchgehend grün.

## Phase 3 – Server und Transport

Status: abgeschlossen. `npm run verify` und `npm run build` grün. **Akzeptanzkriterium
erfüllt: fünf echte WebSocket-Clients finden sich über die Schnellsuche und spielen ein
komplettes Match durch (echter Integrationstest, kein Mock).**

`server/game-server.ts`: die `GameServer`-Klasse hält den kompletten Match-State in-memory
(Sessions, Lobbys, Matches, Kalibrierungsprofile, Replay-Historie, Report-State) und verdrahtet
die reinen Reducer aus `@klaeff/protocol` mit echten WebSocket-Verbindungen:
- Handshake: `HELLO` (neu, mit deviceUuid/Nickname/Avatar) oder `RECONNECT` (bestehende Sitzung
  per sessionToken+playerId wieder anhängen). `HELLO` ist eine neue Protokoll-Nachricht, die in
  Phase 2 noch fehlte - das Protokoll darf sich mit den Anforderungen des Servers weiterentwickeln.
- Schnellsuche: älteste offene Lobby mit Platz wird aufgefüllt, sonst neue eröffnet.
- Server-Tick (Standard 1s, in Tests auf 30ms verkürzt) ruft `evaluateCountdown` für alle
  offenen Lobbys auf und startet Matches automatisch. `evaluateCountdown` bekam dafür einen
  optionalen `countdownMs`-Parameter (Standard weiterhin die geforderten 20s) - so können Tests
  den Countdown auf wenige hundert Millisekunden verkürzen, ohne die Produktions-Konstante
  anzufassen.
- Match-Ablauf: `ROUND_STARTED` pro Barker, `BARK_SUBMIT` wird serverseitig mit `scoreBark`
  bewertet (der Client schickt nur rohe Frames + Kalibrierung, nie einen Score - siehe
  Server-Autoritativ-Regel), `ROUND_RESULT`/`FLAG_BROADCAST` an die ganze Lobby, automatischer
  Rundenwechsel, `MATCH_RESULT` mit Rangliste am Ende.
- Rundentimeout: sendet ein Spieler keine Frames, wertet der Server nach `roundTimeoutMs`
  automatisch mit leeren Frames (Score 0) und macht weiter - blockiert das Match nie.
- Reconnect: 60s Gnadenfrist (`disconnectGraceMs`), Spieler-Slot bleibt reserviert, `RECONNECT`
  hängt eine neue WebSocket-Verbindung an dieselbe Sitzung.
- Heartbeat alle 15s (`HEARTBEAT_PING`/`HEARTBEAT_PONG`).
- `/api/health` liefert jetzt echte Werte (Uptime, Version, aktive Lobbys, Spielerzahl) aus
  einer prozessweiten Singleton-Instanz (`globalThis`-Cache, robust gegen getrennte
  Modul-Graphen zwischen Custom-Server und Next-Webpack-Bundle).

8 Integrationstests mit echten `ws`-Clients gegen einen echten `http`+`WebSocketServer`
(die reale Custom-Server-Upgrade-Route auf `/ws` wurde zusätzlich manuell durchgetestet):
Schnellsuche mit 5 Spielern komplett durchgespielt, Backfill/Countdown-Verhalten,
Disconnect+Reconnect mitten in der Runde, Host verlässt private Lobby (Host-Übernahme),
doppelter Join derselben Device-UUID, Rundentimeout ohne Frames, Nickname-Filter-Verdrahtung,
Melde-Schwelle sperrt die Schnellsuche.

Ein Build-Bug gefunden und behoben: `next build` scheiterte an den `.js`-Endungen in unseren
relativen Imports (Node-ESM-Konvention). Fix über `webpack.resolve.extensionAlias` in
`next.config.ts`. Siehe BLOCKERS.md.

## Phase 4 – Deployment

Status: abgeschlossen (vorbereitet), **kein Live-Deploy** - kein `RENDER_API_KEY` in dieser
Umgebung gesetzt. Der letzte Klick ("Repo in Render verbinden") ist manuell, dauert laut
`DEPLOY.md` unter 5 Minuten auf dem iPad.

Aufgebaut:
- `Dockerfile`: Multi-Stage (deps → builder → runner), Node 22 slim, nicht-root User
  (`klaeff`, uid/gid 1001), Runtime-Image bekommt nur Production-Dependencies
  (`npm ci --omit=dev`) plus die tatsächlich zur Laufzeit gebrauchten Quellen (`server/`,
  `packages/*/src`, `.next/`, `app/`, `public/`) - kein Test-/Lint-Tooling im Image.
  Eingebauter `HEALTHCHECK` gegen `/api/health`.
- `.dockerignore`: node_modules, .git, .next, Test-Artefakte etc. ausgeschlossen.
- `render.yaml`: Blueprint für einen Docker-Web-Service, Health-Check-Pfad `/api/health`,
  `autoDeployTrigger: commit` (deployt automatisch bei jedem Push auf `main`).
- `fly.toml`: Fallback, falls Render Probleme macht - gleiches Dockerfile, Health-Check auf
  denselben Pfad.
- `DEPLOY.md`: Schritt-für-Schritt auf Deutsch, geschrieben für Safari auf dem iPad ohne
  Terminal (GitHub-Login bei Render, Blueprint verbinden, warten, testen).
- `.github/workflows/ci.yml` hatte bereits einen `docker build`-Job (aus Phase 0); dessen
  Trigger war aber auf `push: branches: [main]` beschränkt - da diese Session nie auf `main`
  pusht (siehe Git-Workflow-Entscheidung oben), wäre CI in dieser Session nie gelaufen. Trigger
  auf alle Branches erweitert (`on: push` ohne Filter), damit CI die Arbeit tatsächlich
  mitprüft, während sie entsteht.
- `server/index.ts`/`package.json`: `PORT` kommt bereits aus `process.env.PORT` (Render-Pflicht),
  `tsx` von `devDependencies` nach `dependencies` verschoben - der Custom-Server läuft in
  Produktion direkt aus TypeScript-Quellen (kein separater Kompilierschritt für `server/`), das
  braucht `tsx` zur Laufzeit im schlanken Produktions-Image.

`docker build` konnte in dieser Sandbox nicht verifiziert werden - der Docker-Daemon bekommt
beim Ziehen von `node:22-slim` ein `403` von der Egress-Policy dieser Session (bestätigt über
den Proxy-Status-Endpunkt: Richtlinien-Ablehnung, kein Fehler im Dockerfile). Laut Anweisung
nicht wiederholt/umgangen, sondern hier dokumentiert. Verifiziert wird das Image entweder über
den `docker build`-CI-Job (regulärer Runner, normaler Internetzugang) oder direkt bei Render
selbst beim ersten Deploy. Siehe BLOCKERS.md.


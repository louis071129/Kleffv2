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

**Update (nach Phase 6):** der `docker`-CI-Job ist inzwischen tatsächlich gelaufen (GitHub
Actions hat normalen Internetzugang, anders als diese Sandbox) - **`docker build .` ist grün**.
Das Dockerfile ist damit verifiziert, nicht nur plausibilitätsgeprüft.

## Phase 5 – Audio-Client

Status: abgeschlossen (Engineering-Schicht). `npm run verify` grün. UI-Integration (Buttons,
Prompts, Wake-Lock-Aufruf am Matchstart) folgt in Phase 6/7 - diese Phase liefert die Bausteine.

- `public/worklets/bark-processor.js`: echter `AudioWorkletProcessor`, spiegelt die DSP-Mathematik
  aus `packages/scoring/src/dsp.ts` 1:1 (eigene FFT, Hann-Fenster, kausales Fenster) von Hand in
  reines JS übertragen. Grund: AudioWorklets können ES-Module-Imports von außerhalb in allen
  Zielbrowsern (v.a. Safari/iOS) nicht zuverlässig laden, ein Bundling-Schritt dafür würde die
  Build-Pipeline deutlich verkomplizieren. Das Frame-Gleichheits-Netz sitzt in `packages/scoring`
  (Offline- vs. Streaming-Extraktion sind dort bewiesen gleich) - diese Datei kann in Vitest nicht
  direkt getestet werden (kein `AudioWorkletProcessor`-Global in Node), wird aber in Phase 8 per
  Playwright mit echten (simulierten) Audiodateien gegengeprüft.
- `lib/audio/capture.ts`: `requestMicrophone()` mit den geforderten Constraints
  (`autoGainControl:false` etc.), liest danach `track.getSettings()` und vergleicht mit der
  Anfrage statt ihr zu vertrauen (**AGC-Erkennung**: Safari/iOS ignoriert die Anfrage oft).
  `createAudioPipeline()` verbindet Mikro → AudioWorklet, **absichtlich nicht** an
  `audioContext.destination` (kein Sound wird je abgespielt oder gestreamt).
- `lib/audio/calibration.ts`: reine, browserfreie Funktionen für die drei Kalibrierungsschritte
  (Median für `noiseFloorDbfs`, 75. Perzentil für `refVoiceDbfs`, Peak für `maxObservedDbfs`),
  `headroomDb < 12` → Ablehnung, `noiseFloorDbfs > -35` → Warnung. 7 Unit-Tests (echtes Vitest,
  da reine Arrays/Zahlen ohne Browser-API).
- `lib/audio/session.ts`: `AudioSession` bündelt EINE Mikro-Pipeline für die ganze Sitzung -
  liefert sowohl den kontinuierlichen 10-Hz-Pegel-Broadcast (Präsenz, auch in der Lobby) als
  auch die 3s-Fenster für Kalibrierung und den eigenen Bell-Versuch.
- `lib/ws-client.ts`: `KlaeffClient` - HELLO/RECONNECT-Handshake, typisiertes Senden über die
  Zod-Schemas, automatischer Reconnect mit Backoff, **Reconnect bei `visibilitychange`** (iOS
  friert Hintergrund-Tabs ein - beim Zurückkommen wird sofort neu verbunden, der Server hält den
  Spieler-Slot ohnehin 60s offen).
- `lib/wake-lock.ts`: `navigator.wakeLock`-Wrapper, scheitert still bei fehlender Unterstützung.
- `lib/storage.ts`: Device-UUID/Kalibrierung/Nickname/Avatar in `localStorage`, mit
  Try/Catch-Fallback falls Storage blockiert ist (privates Fenster etc.).
- `lib/store/game-store.ts`: Zustand-Store, verdrahtet `KlaeffClient`-Events mit reaktivem
  UI-State (Lobby, Match, Runden, Pegel, Emotes, Flags).

Noch offen aus der iOS-Liste (bewusst auf Phase 6/7 verschoben, weil sie UI brauchen): Silent-
Switch-Hinweis (Testton + Bestätigungsdialog, da physische Lautsprecherausgabe aus JS nicht
messbar ist - ehrlicher Ansatz statt Fake-Messung), PWA-Manifest+Icons, `100dvh` im Layout,
tatsächlicher Wake-Lock-Aufruf beim Matchstart.

## Phase 6 – Designsystem und UI

Status: abgeschlossen. `npm run verify` und `npm run build` grün. **Der komplette Weg
Startseite → Mikro freigeben → Kalibrierung (echte 3 Schritte über einen echten
AudioWorklet) → WebSocket-Handshake → Schnellsuche → Live-Lobby wurde mit einem echten
(headless) Chromium samt `--use-fake-device-for-media-stream` manuell durchgespielt und
per Screenshot verifiziert - nicht nur "sieht compiliert aus", sondern tatsächlich
end-to-end funktionsfähig.**

Aufgebaut:
- `app/globals.css`: alle Design-Tokens aus dem Auftrag als CSS-Variablen, `.klaeff-card`
  (dicke Kontur + harter Offset-Schatten, keine Verläufe/Weichzeichner) und `.klaeff-btn`
  (44px Mindesthöhe, Press-Feedback über `transform`, kein `:hover`-abhängiges Verhalten),
  `prefers-reduced-motion: reduce` global respektiert.
- `app/layout.tsx`: Bricolage Grotesque (800, Display) und Inter (400/600, UI) über
  `next/font/google` (kein manueller Asset-Download, wie gefordert), `100dvh`-taugliches
  Layout, `viewport-fit: cover` für die Safe-Area.
- `app/manifest.ts` + `app/icon.tsx` + `app/apple-icon.tsx`: PWA-Manifest und Icons komplett
  **generiert** über Next.js' eingebaute `ImageResponse`-Konvention (kein Icon-Download,
  kein Design-Tool) - erfüllt "als SVG/generiert, keine Downloads" ohne Zusatz-Tooling.
- `components/Avatar.tsx`: SVG-Avatar-Builder, alle 9 Kategorien aus dem Auftrag
  (Kopfform×5, Ohren×6, Fell×4×4-Muster, Augen×6, Schnauze×4, Halsband×8+5-Anhänger,
  Accessoire×11 inkl. "keins"), deterministisch aus dem `AvatarSeed`. Der Mund ist ein
  eigenes Element mit `mouthOpen`-Prop (0..1) - die Live-Reaktion auf den Mikro-Pegel ist
  vorbereitet, die tatsächliche Verdrahtung mit Idle-Animationen ist Phase 7.
- `components/Button.tsx`, `Card.tsx`, `ConnectionDot.tsx`, `ScoreReveal.tsx` (Framer-Motion-
  Score-Reveal: die vier Komponenten laufen nacheinander als Balken hoch, dann Punch-Scale
  auf die Gesamtzahl - wie im Auftrag beschrieben).
- Screens: `HomeScreen`, `MicPermissionScreen`, `CalibrationScreen` (inkl. Ton-Check-Schritt
  für den Silent-Switch-Hinweis auf iOS - ehrlich als Selbstauskunft umgesetzt, weil
  physische Lautsprecherausgabe aus JS nicht messbar ist), `LobbyScreen` (Code-Anzeige,
  Kick-Buttons für den Host, Countdown-Anzeige), `MatchScreen` (Bühnenmetapher: Barker groß
  mittig, Publikum im Halbkreis kleiner, Publikumsmeter als reine Show, Bell-Button startet
  das 3s-Fenster), `ResultScreen` (Podium für die Top 3, Liste für den Rest).
- `components/GameApp.tsx`: Orchestrator - lokale Vor-Verbindungs-Screens (Home/Mikro/
  Kalibrierung) vs. server-getriebener `screen`-State aus dem Store (Lobby/Match/Ergebnis).
  Überspringt Mikro+Kalibrierung automatisch, wenn in dieser Sitzung schon kalibriert wurde
  (z.B. bei "Nochmal!" nach einem Match) - sonst müsste man vor jedem Match neu kalibrieren.
- `app/j/[code]/page.tsx`: Join-Link-Route, füllt den Code vor.

Zwei echte Bugs beim visuellen Testen gefunden und behoben (siehe BLOCKERS.md):
1. Hydration-Mismatch, weil der Zustand-Store beim Erststart Nickname/Avatar/Device-UUID
   direkt aus `localStorage` las - das existiert beim Server-Render nicht, SSR- und Client-HTML
   liefen auseinander (sichtbar als `NaN`-Attribute im Avatar-SVG). Fix: Store startet immer mit
   denselben Defaults, echte Werte kommen über `hydrate()` aus einem `useEffect` nach dem Mount.
2. Der Custom-Server hat im Dev-Modus alle WebSocket-Upgrades außer `/ws` einfach gekillt -
   das hat Next.js' eigenes Fast-Refresh/HMR (`/_next/webpack-hmr`) lahmgelegt. Fix:
   `app.getUpgradeHandler()` uebernimmt jetzt alles ausser `/ws`.

Bekannte Lücken, bewusst auf Phase 7 verschoben: Idle-Animationen (Blinzeln/Schwanzwedeln),
Emote-Rad, echte Screen-Shake-Kopplung an den Live-Pegel, WebAudio-Soundeffekte, Haptik,
Wertungssprüche. Die Grundstruktur dafür (Avatar-`mouthOpen`-Prop, Publikumsmeter,
Levels-State im Store) steht bereits.

## Phase 7 – Präsenz und Juice

Status: abgeschlossen. `npm run verify` und `npm run build` grün. Emote-Rad und
Idle-Animationen wieder mit echtem (headless) Chromium visuell verifiziert - dabei einen
echten Layout-Bug gefunden und behoben (siehe BLOCKERS.md).

- `app/globals.css`: CSS-Keyframes fürs Idle-Leben (`avatar-blink`, `avatar-ear-twitch`,
  `avatar-tail-wag`, `avatar-breathe`), jede mit einer `--idle-delay`-CSS-Variable pro
  Avatar-Instanz. Läuft rein über CSS, wird also automatisch von der bereits in Phase 6
  gesetzten globalen `prefers-reduced-motion`-Regel stillgelegt - keine zusätzliche JS-Logik
  nötig.
- `components/Avatar.tsx`: bekommt jetzt einen eigenen Schwanz (das Kopf-only-Design aus
  Phase 6 hatte keinen - für "Schwanz wedelt langsam" ergänzt), Ohren/Augen/Schwanz/Atmung
  animieren unabhängig mit leicht versetzten Verzögerungen aus `idleSeed`, damit Avatare nicht
  synchron wirken. Neuer `idle`-Prop (Default an) zum Abschalten in z.B. Screenshots/Podium.
- `components/EmoteWheel.tsx` + `EmoteBubble.tsx`: die 8 festen Emotes aus dem Auftrag
  (Wau!/Knurr/Schwanzwedeln/Winseln/Applaus/Augenrollen/Herz/Schock), kein Freitext.
  In Lobby und Match erreichbar. Ausgesendete Emotes erscheinen als Sprechblase über der
  Avatarkarte des Absenders (`EmoteBubble`, 2.2s sichtbar).
- `components/screens/MatchScreen.tsx`: Screen-Shake beim eigenen Bellen ist jetzt an den
  Live-Pegel gekoppelt (Amplitude ∝ `levels[barkerId]`, gedeckelt auf 8px, ausschließlich über
  `transform`) und respektiert `prefers-reduced-motion` über Framer Motions
  `useReducedMotion()`-Hook (CSS allein reicht hier nicht, weil die Animation dynamisch aus
  JS gesteuert wird, nicht über eine CSS-Keyframe-Regel).
- `lib/audio/sfx.ts`: synthetisierte Soundeffekte über WebAudio (Countdown-Tick,
  Runden-Start, Rundenergebnis, Sieg-Fanfare, Tap, Emote) - keine Asset-Downloads, eigener
  kurzlebiger `AudioContext` pro Sound, komplett getrennt von der Mikro-Aufnahme-Pipeline.
- `lib/haptics.ts`: `navigator.vibrate`-Wrapper mit vordefinierten Mustern
  (Rundenstart/-ergebnis/Sieg/Tap), scheitert still ohne Unterstützung (iOS Safari hat es
  z.B. gar nicht).
- `lib/score-quips.ts`: deutsche Wertungssprüche in fünf Score-Bändern ("LEGENDÄR!" bis
  "War das ein Bellen?"), reine Show ohne Einfluss auf die Wertung, in `ScoreReveal`
  eingeblendet.
- `components/screens/LobbyScreen.tsx`: Melde-Button pro Spieler ergänzt (sendet
  `REPORT_PLAYER` - die Server-Logik dafür stand schon seit Phase 3).

Bewusste Vereinfachung: der "gelb bei Latenz > 200ms"-Zustand des Verbindungspunkts am
Halsband aus dem Auftrag ist nicht umgesetzt - das Protokoll hat aktuell keinen Kanal für
echte Pro-Spieler-Latenz (nur Heartbeat zur Liveness, kein Zeitstempel-Echo). Umgesetzt sind
grün (verbunden) und grau (getrennt) über das vorhandene `connected`-Feld aus `LOBBY_STATE`/
`PRESENCE_STATUS`. Eine echte Latenzmessung würde eine Protokolländerung brauchen (Ping mit
Zeitstempel, Pong-Echo) - ehrlich als Lücke dokumentiert statt eine Zahl vorzutäuschen.

## Phase 8 – E2E und Politur

Status: abgeschlossen. Alle 5 Playwright-Tests lokal grün (2,5 Min. Gesamtlaufzeit), mit
echten Fake-Audio-Dateien durch die komplette Kalibrierungs- und Match-Pipeline.

- `e2e/helpers.ts`: gemeinsame Klick-Helfer (Mikro freigeben → Ton-Check → Kalibrierung
  abwarten → weiter), damit die Tests nicht dieselbe Klicksequenz duplizieren.
- `e2e/two-player-match.spec.ts` (**Akzeptanzkriterium**): zwei Browser-Kontexte, Host
  erstellt eine private Lobby, Gast tritt per Code bei, beide spielen ihre Runde, beide sehen
  den Ergebnis-Screen mit echten (unterschiedlichen) Scores.
- `e2e/quickmatch-three-players.spec.ts` (**Akzeptanzkriterium**): drei Kontexte joinen
  nacheinander die Schnellsuche, landen nachweislich in derselben Lobby, der echte 20s-
  Public-Countdown läuft durch, alle drei sehen "Runde 1" - beweist, dass die Warteschlange
  wirklich zusammenführt statt nur Einzel-Client-Pfade zu testen.
- `e2e/ipad-screenshots.spec.ts`: Startseite + Lobby in beiden iPad-Viewport-Größen (1024×768
  und 768×1024), nach `artifacts/e2e/` geschrieben.
- `e2e/performance.spec.ts`: Performance-Rauchtest über `requestAnimationFrame`-Sampling
  während die Lobby mit mehreren animierten Avataren läuft. **Ehrlich dokumentiert im Test
  selbst**: ein geteilter/virtualisierter CI-Runner ist kein echtes Mobilgerät, das ist ein
  Regressions-Rauchtest (Schwelle >30fps als Proxy), kein belastbarer 60fps-Beweis für echte
  iPad-Hardware. In dieser Sandbox gemessen: ~40fps.

Zwei echte Bugs beim Aufsetzen der E2E-Suite gefunden und behoben:
1. `playwright.config.ts` hatte `executablePath` fest auf einen Sandbox-Pfad
   (`/opt/pw-browsers/chromium`) as Fallback verdrahtet - das hätte in GitHub Actions (wo
   Playwright seinen eigenen Browser unter einem anderen Pfad installiert) mit "executable
   doesn't exist" fehlgeschlagen. Fix: nur setzen wenn explizit über `PLAYWRIGHT_CHROMIUM_PATH`
   vorgegeben, sonst Playwrights eigene Auflösung nutzen.
2. Die echten Zeiten für Kalibrierung (3× 3s) und den öffentlichen 20s-Countdown wurden beim
   ersten Testlauf unterschätzt - der Drei-Spieler-Test brauchte mit dem globalen 60s-Timeout
   fast eine Minute *zu lange* (kam aber inhaltlich korrekt bis "Runde 1", nur der Timeout
   war zu knapp). Fix: globaler Timeout auf 90s angehoben, der Drei-Spieler-Test bekommt
   zusätzlich `testInfo.setTimeout(150_000)`.

CI-Kontext: der bereits laufende GitHub-Actions-`e2e`-Job (aus Phase 0) schlug bisher mit
"No tests found" fehl, weil es noch keine Test-Dateien gab - das ist jetzt behoben, sobald
dieser Commit läuft. Der `docker`-CI-Job lief in der Zwischenzeit bereits erfolgreich durch
(siehe Phase-4-Update oben).

## Phase 9 – Doku

Status: abgeschlossen. `README.md` vollständig ausgebaut (Architektur, Fairness-Erklärung mit
Verweis auf den Fairness-Test, Scoring im Detail, ehrlicher Anti-Cheat-Abschnitt,
Barrierefreiheit, bekannte Grenzen, Test-Übersicht). Finale Prüfung: kein `any`, kein
`@ts-ignore`, kein `TODO` im fertigen Code (per `grep` über `packages/ app/ components/ lib/
server/ scripts/ e2e/` bestätigt), keine `.env`-Datei versehentlich getrackt.

---

# Morgen am iPad zuerst prüfen

Diese Session hatte kein Mikrofon und keinen `RENDER_API_KEY` - alles unten ist mit
synthetischem Audio und automatisierten Browsern getestet, aber **nicht mit einer echten
menschlichen Stimme auf echter Hardware**. Das hier sind die fünf Dinge, die zuerst von Hand
geprüft werden sollten, jeweils mit dem erwarteten Ergebnis.

**Kein Live-Deploy vorhanden** (siehe Phase 4) - Schritt 1 unten ist deshalb der allererste,
alles andere baut darauf auf. Folge dafür [DEPLOY.md](./DEPLOY.md) (unter 5 Minuten, komplett
im Safari-Dashboard von Render, kein Terminal nötig).

1. **Deployen und `/api/health` prüfen.**
   Render-Blueprint verbinden wie in `DEPLOY.md` beschrieben, warten bis der Service "Live"
   zeigt, dann die Service-URL öffnen.
   *Erwartet:* Die KLÄFF-Startseite lädt (dunkler Hintergrund, "KLÄFF" in Limette-Grün oben).
   `<service-url>/api/health` zeigt JSON mit `"status":"ok"` und einer Versionsnummer.

2. **Mikro freigeben und mit echter Stimme kalibrieren.**
   Auf der Startseite "Schnellsuche" oder "Private Lobby erstellen" antippen, dann "Mikro
   freigeben" bestätigen (Safari fragt nach Mikrofon-Zugriff), den drei Kalibrierungsschritten
   folgen (3s still sein, 3s normal sprechen, ein Test-Bell so laut wie im Ernstfall).
   *Erwartet:* Nach dem Test-Bell erscheint "Kalibriert!" mit einem "Weiter"-Button. Kommt
   stattdessen "Zu leise", näher ans Mikro gehen und nochmal versuchen - das ist die
   Ablehnungsschwelle (12 dB Headroom) bei der Arbeit, kein Bug.

3. **Fairness mit zwei echten Geräten testen.**
   Ein Gerät kalibrieren und *leise* bellen, ein zweites Gerät separat kalibrieren und *laut
   schreien* (kein Bellen, einfach ein lang gezogener Schrei). Beide in derselben Runde
   vergleichen.
   *Erwartet:* Das saubere, knackige (leise) Bellen kann gewinnen - Lautstärke allein
   entscheidet nicht. Genau das beweist der automatisierte Fairness-Test
   (`packages/scoring/test/score.test.ts`), das hier ist die Bestätigung mit echten Stimmen
   statt synthetischem Audio.

4. **Zwei Geräte, private Lobby, komplettes Match.**
   Auf Gerät A eine private Lobby erstellen, den 6-stelligen Code (oder Link `/j/CODE`) an
   Gerät B schicken, beitreten lassen, Host tippt "Match starten", beide Runden zu Ende
   spielen.
   *Erwartet:* Beide Geräte zeigen am Ende denselben Ergebnis-Screen mit Podium. Das
   Emote-Rad (unten rechts) funktioniert auf beiden Seiten und zeigt eine Sprechblase über dem
   Avatar des Senders - kein Freitext nötig oder möglich.

5. **AGC-Hinweis auf echtem iPhone/iPad Safari.**
   Kalibrierung auf einem echten iOS-Gerät durchlaufen (nicht Simulator).
   *Erwartet:* Falls Safari die Lautstärke trotz Anfrage automatisch nachregelt (das ist auf
   iOS keine Seltenheit), erscheint oben ein Hinweis-Badge: "Dein Browser regelt die
   Lautstärke automatisch nach. Wertung läuft im Ausgleichsmodus." Kommt der Hinweis NICHT,
   heißt das nur, dass dieses konkrete Gerät die Anfrage tatsächlich respektiert hat - beides
   ist ein korrektes Ergebnis, kein Fehlerfall.

Playwright-generierte Screenshots (inkl. beider iPad-Ausrichtungen und dem Ergebnis-Screen
eines echten Zwei-Spieler-Matches mit synthetischem Audio) liegen als Build-Artefakt im
`e2e`-CI-Job auf GitHub Actions (Tab "Actions" im Repo, neuester erfolgreicher Lauf, Artefakt
"e2e-artifacts") - nicht im Repo selbst, weil sie bei jedem Lauf neu erzeugt werden.

## Nach Phase 9 – Passwort-Gate ("Bald verfügbar")

Auf Wunsch des Besitzers nachträglich ergänzt, weil er das Spiel noch heute Nacht/morgens auf
dem iPad testen will, es aber noch nicht öffentlich sein soll.

- `lib/gate.ts`: framework-freie Kernlogik (Passwortvergleich, Cookie-Name/-Wert), damit
  dieselbe Prüfung sowohl in der Next.js-Middleware (Edge-Runtime) als auch im
  Node-Custom-Server (WebSocket-Upgrade) funktioniert.
- `middleware.ts`: sperrt jede Seite ohne gültiges Gate-Cookie hinter `/gate` (per Rewrite,
  nicht Redirect - die ursprünglich angefragte URL bleibt in der Adressleiste erhalten, z.B.
  ein `/j/CODE`-Einladungslink funktioniert direkt nach dem Entsperren). `/api/health` und
  `/api/gate` sind bewusst ausgenommen, sonst hätte Render den Service für "nicht gesund"
  gehalten.
- `server/index.ts`: derselbe Cookie-Check auch beim WebSocket-Upgrade auf `/ws` - sonst wäre
  das eine Hintertür am Seiten-Gate vorbei gewesen.
- `app/gate/page.tsx` + `app/api/gate/route.ts`: "Bald verfügbar 🐕"-Screen im Designsystem,
  Passwort-Eingabe, 90-Tage-Cookie nach Erfolg.
- Passwort: `GATE_PASSWORD` (Env-Var), Default **`lars`** wenn nicht gesetzt. In `render.yaml`
  bereits als Env-Var vorbelegt.
- **Ehrlich, wie überall in diesem Projekt**: kein echtes Sicherheitssystem, ein geteiltes
  Passwort in einem Cookie ist trivial umgehbar. Reine Reibungsbremse gegen zufällige
  Besucher vor dem offiziellen Start.
- `e2e/gate.spec.ts`: zwei neue Tests (Gate zeigt sich ohne Cookie, falsches Passwort wird
  abgelehnt, "lars" lässt rein; die `/ws`-Route ist ohne Cookie ebenfalls dicht). Alle
  bestehenden E2E-Helfer (`e2e/helpers.ts`) setzen das Cookie jetzt automatisch, damit die
  Spiel-Flow-Tests nicht bei jedem Lauf erst das Gate durchklicken müssen.

**Wichtiger Fund beim Umsetzen:** `render.yaml` war auf `branch: main` konfiguriert - dieser
Branch existiert in diesem Repo aber gar nicht (siehe Phase-0-Eintrag oben, komplett leeres
Repo beim Start, diese Session pusht ausschließlich auf ihren eigenen Branch). Ohne Korrektur
hätte Render beim Blueprint-Deploy ins Leere gegriffen. Auf `claude/klaeff-multiplayer-game-ur6t7v`
umgestellt - das ist aktuell auch der einzige Branch im Repo und (weil er als erster Branch in
ein leeres Repo gepusht wurde) der GitHub-Default-Branch, Render sollte ihn beim
Blueprint-Import also automatisch anbieten. Siehe BLOCKERS.md.

Alle 7 E2E-Tests (inkl. der 2 neuen Gate-Tests) und alle 75 Unit-/Integrationstests laufen
weiterhin grün, `npm run build` ebenfalls (Middleware taucht jetzt im Build-Output auf).

## Nach Phase 9 – Rechtsseiten (Impressum, Datenschutz, Nutzungsbedingungen, Cookies)

Auf Wunsch des Besitzers, der vor dem iPad-Test-Deploy alle Rechtstexte selbst noch prüfen
wollte: vier neue Seiten plus die dazugehörige Verdrahtung.

- `app/impressum/page.tsx` – Pflichtangaben nach § 5 DDG (Nachfolgeregelung zu § 5 TMG).
  Betreiber-Pflichtfelder (Name, Anschrift, Kontakt) sind klar als `[PLATZHALTER]` markiert -
  eine KI darf und kann eine ladungsfähige Anschrift nicht erfinden. Siehe BLOCKERS.md.
- `app/datenschutz/page.tsx` – Datenschutzerklärung nach Art. 13 DSGVO, inhaltlich am
  tatsächlichen Code verifiziert (nicht generisch): Hosting/Zugriffslogs (Render, Region
  Frankfurt, US-Muttergesellschaft), das eine technisch notwendige `klaeff_gate`-Cookie,
  `localStorage`-Inhalte (Geräte-Kennung, Kalibrierungsprofil, Spitzname, Avatar), die während
  einer Bell-Runde übertragenen Messwerte (`packages/scoring/src/types.ts`: `peakDbfs`,
  `rmsDbfs`, `centroidHz`, `flatness` – ausdrücklich **kein** Rohaudio, das Mikrofonsignal
  verlässt das Gerät nie als Ton), die Melde-/Anti-Cheat-Funktion (`packages/protocol/src/report.ts`:
  3 Meldungen aus unterschiedlichen Lobbys / 24h-Fenster), selbstgehostete `next/font`-Schriften
  (kein Laufzeit-Request an Google), keine Analytics/Tracking. Speicherdauer-Tabelle macht
  explizit, dass es keine Datenbank gibt - alles liegt nur im Arbeitsspeicher des Servers.
- `app/nutzungsbedingungen/page.tsx` – Beta-Status, zulässiges Verhalten, Melde-Konsequenzen,
  kein Account, Altersempfehlung (Platzhalter), Haftungsausschluss.
- `app/cookie-einstellungen/page.tsx` – Übersicht aller lokal gespeicherten Daten plus ein
  "Alles löschen"-Button (`lib/storage.ts`: neue `clearAllLocalData()`; `app/api/gate/route.ts`:
  neuer `DELETE`-Handler fürs httpOnly-Cookie, das JS nicht selbst löschen kann).
- `components/CookieNotice.tsx` – einmaliger Transparenz-Hinweis (kein Consent-Zwang nötig, da
  ausschließlich technisch notwendige Speicherung, § 25 Abs. 2 Nr. 2 TDDDG). Bewusst nicht global
  im Root-Layout, sondern nur auf `HomeScreen`/`app/gate/page.tsx` gerendert - ein echter Bug
  wurde gefunden und behoben, siehe BLOCKERS.md (fixes Banner verdeckte sonst den BELL!-Button).
- `components/LegalFooter.tsx` – Links zu allen vier Seiten, eingebunden auf `HomeScreen` und
  dem Gate-Screen (Impressum/Datenschutz müssen laut § 5 DDG auch dort ohne Passwort erreichbar
  sein - `middleware.ts`-Matcher entsprechend erweitert).
- `e2e/legal-pages.spec.ts` – neue Tests: alle vier Seiten ohne Gate-Cookie erreichbar, Gate-Screen
  verlinkt Impressum/Datenschutz, Cookie-Hinweis erscheint einmalig und bleibt nach "Verstanden"
  dauerhaft weg.

`npm run verify` (75 Unit-/Integrationstests) und die komplette Playwright-Suite (10 Tests,
alle Projekte inkl. beider iPad-Ausrichtungen) laufen grün, `npm run build` ebenfalls (alle vier
neuen Seiten werden statisch prerendert).

**Wichtig für den Besitzer:** vor dem echten öffentlichen Start müssen die `[PLATZHALTER]`-Stellen
in Impressum, Datenschutzerklärung und Nutzungsbedingungen ausgefüllt werden (Name/Anschrift/
Kontakt, zuständige Aufsichtsbehörde, Mindestalters-Empfehlung). Diese Texte sind sorgfältig
formuliert, aber keine Rechtsberatung.

## CI-Endstand dieser Nacht

Der `e2e`-CI-Job war einmal flaky (Race Condition in einem Test selbst, nicht in der App -
siehe BLOCKERS.md, behoben und 3x hintereinander lokal grün nachgewiesen). Letzter bekannter
CI-Stand pro Job über die ganze Session:

- **`verify`** (Lint+Typecheck+Test+Build): auf jedem Push seit der Fixture-Korrektur grün.
- **`docker`** (echter `docker build .` auf einem Runner mit normalem Internetzugang): grün
  seit Phase 6 auf jedem Push - das Dockerfile ist damit tatsächlich verifiziert, nicht nur
  plausibilitätsgeprüft (siehe Phase-4-Update oben).
- **`e2e`** (Playwright, 7 Tests inkl. beider Akzeptanzkriterien): grün auf dem Phase-9-Commit
  (alle 7 Tests bestanden), ein Flaky-Fund und Fix danach (siehe BLOCKERS.md) - der
  Passwort-Gate-Commit läuft gerade durch CI, sollte mit dem Fix durchgehend grün sein.


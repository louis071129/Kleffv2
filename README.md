# KLÄFF

Multiplayer-Bell-Wettkampf im Browser. Spieler treten gegeneinander an, indem sie
nacheinander drei Sekunden ins Mikrofon bellen. Ein **server-seitiges** Scoring-System
bewertet Lautstärke, Attack, Punch und Bell-Charakter – der beste Bell gewinnt die Runde.
Öffentliches Zufalls-Matchmaking und private Lobbys per 6-stelligem Code.

## Schnellstart

```bash
npm install
npm run dev
```

Server läuft auf `http://localhost:3000` (Custom-Server: Next.js App Router **und**
WebSocket auf demselben Port, ein Zertifikat, keine CORS-Probleme).

## Scripts

- `npm run dev` – Custom-Server im Watch-Modus
- `npm run build` – Next.js Production-Build
- `npm start` – Production-Server (liest `PORT` aus der Umgebung)
- `npm run lint` / `npm run typecheck` / `npm test` – einzelne Prüfungen
- `npm run verify` – alle drei zusammen (Pflicht vor jedem Commit)
- `npm run test:e2e` – Playwright End-to-End-Tests (generiert vorher automatisch Fixtures)
- `npm run gen-fixtures` – synthetische Audio-Fixtures für Tests erzeugen

## Struktur

```
packages/scoring/   Framework-freie DSP- und Scoring-Engine (kein Browser, kein Node-spezifisches API)
packages/protocol/  Zod-Schemas fürs WebSocket-Protokoll, Lobby-/Match-Reducer, Matchmaking, Nickname-Filter
app/                 Next.js App Router: Seiten, PWA-Manifest/Icons, /api/health
components/          React-Komponenten und Screens
lib/                 Client-seitige Logik: Audio-Pipeline, WS-Client, Zustand-Store, Storage
server/              Custom Server (Next.js + ws, ein Port) und der komplette Match-State
scripts/             Fixture-Generator für synthetisches Test-Audio
fixtures/audio/      Generierte Test-Audiodateien (gitignored, wird bei Bedarf neu erzeugt)
e2e/                 Playwright-Tests
public/worklets/     Der AudioWorkletProcessor (reines JS, siehe unten warum)
```

Details zum Deployment: **[DEPLOY.md](./DEPLOY.md)**. Fortschritt durch die Bauphasen:
**[PROGRESS.md](./PROGRESS.md)**. Erzwungene Entscheidungen und gefundene Bugs, chronologisch
und ehrlich: **[BLOCKERS.md](./BLOCKERS.md)**.

## Architektur in Kürze

Ein einziger Node-Prozess (`server/index.ts`) hostet sowohl die Next.js-App als auch einen
`ws`-WebSocket-Server auf demselben Port. Die Spiellogik lebt komplett server-seitig in
`server/game-server.ts` (`GameServer`-Klasse) und hält den kompletten Zustand **in-memory**
(keine Datenbank, siehe Tech-Stack-Entscheidung) – Sessions, Lobbys, Matches,
Kalibrierungsprofile, Replay-Historie, Melde-Log.

Die eigentliche Spiellogik (Lobby-Zustandsmaschine, Matchmaking-Queue, Rundenablauf,
Nickname-Filter) ist als **reine, ungetestete-Nebenwirkungs-freie Reducer-Funktionen** in
`packages/protocol` implementiert und dort ohne jedes Netzwerk getestet. `server/game-server.ts`
verdrahtet diese reinen Funktionen nur noch mit echten WebSocket-Verbindungen, Timern und
Broadcasts. Diese Trennung ist der Grund, warum sich Lobby-Übernahme, Countdown-Verhalten,
Nickname-Filterung usw. schnell und zuverlässig unit-testen ließen, ohne einen Server
hochzufahren.

Der Client (`app/`, `components/`, `lib/`) ist eine einzige Ein-Seiten-App: `GameApp`
orchestriert lokale Vor-Verbindungs-Screens (Startseite, Mikro-Freigabe, Kalibrierung) und
den server-getriebenen Zustand aus einem Zustand-Store (`lib/store/game-store.ts`), der auf
Nachrichten vom `KlaeffClient` (`lib/ws-client.ts`) reagiert.

## Spielablauf

1. **Startseite**: Nickname/Avatar wählen, dann Schnellsuche oder private Lobby.
2. **Mikro freigeben**: expliziter Button (Browser verlangen eine User-Geste, bevor
   `AudioContext`/`getUserMedia` funktionieren).
3. **Kalibrierung**: drei Schritte à drei Sekunden (Stille, Sprechstimme, Test-Bell) – siehe
   Fairness-Erklärung unten.
4. **Lobby**: öffentliche Warteschlange (Countdown ab 3 Spielern, Auffüllen bis 6 ohne
   Reset) oder private Lobby (Code, Host startet manuell, bis zu 8 Spieler).
5. **Match**: jeder Spieler bellt einmal nacheinander drei Sekunden. Der Server wertet jede
   Runde sofort aus und broadcastet das Ergebnis an alle.
6. **Ergebnis**: Podium für die Top 3, Rangliste für den Rest, "Nochmal!" führt direkt zurück
   in Schnellsuche/Lobby ohne erneute Kalibrierung (die bleibt für die Sitzung gültig).

## Fairness – warum die Kalibrierung so kompliziert ist

Naives "wer lauter ist gewinnt" funktioniert im Browser nicht:

- Browser haben standardmäßig **AutoGainControl** an, das normalisiert genau die
  Lautstärke-Unterschiede weg, die gemessen werden sollen.
- Es gibt im Web **keinen absoluten Schalldruck**, nur relative dBFS. Ein Handy mit hohem
  Mic-Gain würde sonst immer gewinnen, unabhängig davon, wie laut tatsächlich gebellt wird.
- Reines Brüllen wäre nach zwei Runden langweilig.

Deshalb kalibriert sich jedes Gerät einmal pro Sitzung (`lib/audio/calibration.ts`, mit
Unit-Tests): `noiseFloorDbfs` (Median der Stille), `refVoiceDbfs` (75. Perzentil der
Sprechstimme, informativ), `maxObservedDbfs` (Peak des Test-Bells) → `headroomDb`. Ist der
Headroom kleiner als 12 dB, wird die Kalibrierung abgelehnt ("Mikro hört fast nichts").

Der eigentliche Score (`packages/scoring/src/score.ts`, `scoreBark()`) normalisiert die
Lautstärke-Komponente relativ zu diesem persönlichen Headroom, nicht zu einem absoluten Wert.
**Der wichtigste Test im Repo** (`packages/scoring/test/score.test.ts`, "FAIRNESS") beweist
das: ein leises Bellen mit passender (leiser) Kalibrierung schlägt ein lautes Schreien mit
lauter Kalibrierung – die Lautstärke allein entscheidet nicht, Attack/Punch/Bell-Charakter
tun es mit.

**Safari auf iOS ignoriert `autoGainControl: false` regelmäßig.** Wird das erkannt
(`track.getSettings()` nach der Anfrage geprüft, nicht die Anfrage selbst vertraut), stützt
sich die Lautstärke-Wertung stärker auf Attack und Crest (die AGC weniger beeinflusst), und
im UI erscheint ein Hinweis-Badge ("Dein Browser regelt die Lautstärke automatisch nach.
Wertung läuft im Ausgleichsmodus."). Ein Unit-Test beweist, dass der AGC-Modus die Rangfolge
zwischen einem lauten Bellen und einem Schreien nicht umkehrt.

### Der Score im Detail

`scoreBark(frames, calibration)` bewertet vier Komponenten (100 Punkte insgesamt, im
AGC-Modus 35/27.5/22.5/15 statt 50/20/15/15):

1. **Lautstärke** – Peak relativ zur Kalibrierung.
2. **Attack** – wie schnell die Lautstärke vom Ansatz zum Peak steigt (≤60 ms = voll, ≥400 ms
   = null).
3. **Crest/Punch** – Differenz zwischen Peak und mittlerem Pegel der aktiven Phase.
4. **Bell-Charakter** – spektraler Schwerpunkt nahe 1400 Hz (Gauß-Glocke) und spektrale
   Flachheit im mittleren Bereich (weder reiner Ton noch reines Rauschen).

Dauer-Korrekturen: sehr kurze aktive Phasen (<120 ms) werden abgewertet (Faktor 0.6), sehr
lange durchgehende Aktivität (>2200 ms, "Heulen") ebenfalls (Faktor 0.85). Alle Formeln,
Konstanten und die Begründung dahinter stehen im Detail in `packages/scoring/src/score.ts`.

Der Client misst Audio (unvermeidbar – nur er hat Mikrofonzugriff), aber **nur der Server
berechnet den Score**. Der Client schickt niemals eine Zahl wie "ich habe 87 Punkte", sondern
ausschließlich die rohen Feature-Frames (Peak/RMS/Centroid/Flatness/Clipped, 50 Hz) plus das
Kalibrierungsprofil.

## Anti-Cheat – ehrlich begrenzt

Es gibt keine Illusion von echter Cheat-Sicherheit in einem Browser-Audiospiel ohne Konten:

- **`MIC_OVERLOAD`**: mehr als 10 aufeinanderfolgende übersteuerte Frames → Lautstärke auf
  42 Punkte gedeckelt.
- **`REPLAY_SUSPECT`**: die RMS-Hüllkurve korreliert (Pearson) über 0.97 mit einer früheren
  Runde desselben Spielers → Score auf 60 gedeckelt.
- **`CALIBRATION_MISMATCH`**: Peak liegt mehr als 9 dB über dem kalibrierten Maximum → Flag,
  Neukalibrierung wird nahegelegt.

Alle drei sind **Flags, keine Bans**, und werden dem ganzen Raum als deutsches Label gezeigt.
**Wer einen Lautsprecher ans Mikro hält, kann trotzdem cheaten.** Das lässt sich mit reiner
Client-Audio-Analyse nicht verhindern – es wird hier nicht vorgegaukelt, dass es das könnte.

Die **Melde-Funktion** ist eine Reibungsbremse, kein Sicherheitssystem: ab 3 Meldungen aus
verschiedenen Lobbys innerhalb 24h wird die Device-UUID für die öffentliche Schnellsuche
gesperrt (private Lobbys bleiben erlaubt). Diese UUID liegt in `localStorage` und ist damit
**trivial umgehbar** (Inkognito-Fenster, Storage löschen, anderer Browser). Das Melde-Log ist
ein In-Memory-Ringpuffer (500 Einträge) ohne Persistenz über einen Server-Neustart hinaus.

## Matchmaking und Lobbys

- **Schnellsuche**: ein Klick auf der Startseite. Neue Spieler landen in der ältesten offenen
  Lobby mit freiem Platz, sonst wird eine neue eröffnet. Lobby startet automatisch nach einem
  20s-Countdown ab 3 Spielern; Nachfüllen bis 6 Spieler resettet den Countdown nicht.
- **Private Lobby**: 6-stelliger Code (Großbuchstaben ohne `I`, `O`, `0`, `1`), Beitritt per
  Code oder Link `/j/ABCDEF`. Bis zu 8 Spieler, Host startet manuell, Host-Übernahme wenn der
  Host geht, Kick-Button für den Host.
- **Kein Freitext-Chat.** Nur ein Emote-Rad mit 8 festen Reaktionen, live über der Avatarkarte
  angezeigt.
- **Nickname-Filter** (deutsch/englisch, Leetspeak-normalisiert) ersetzt gesperrte Namen durch
  einen generierten Fallback im Stil "Klaeffender Keks 42" – **nicht erschöpfend**, umgehbar
  durch neue Wortkombinationen oder andere Sprachen.
- **Kein Sprach-Streaming.** Es wird nie Audio übertragen, nur 150 Feature-Frames pro Runde
  und ein Pegelwert 0–100 (gedrosselt auf 10 Hz) für die Live-Reaktion der Avatare.

## Barrierefreiheit – ehrlich

Kontrast ≥4.5:1, Score-Ergebnisse immer auch als Text (nie nur Farbe/Balken), sichtbare
Fokus-Ringe, `prefers-reduced-motion` wird respektiert (Screen-Shake/Punch-Animationen aus,
Übergänge praktisch instant, das Spiel bleibt voll spielbar). Touch-Ziele mindestens 44px.

**Was sich nicht wegdesignen lässt:** ein Spiel, das Lautstärke bewertet, ist für gehörlose
Spieler nur eingeschränkt zugänglich – sie können mitspielen (das Bellen selbst braucht kein
Gehör), aber die Wertung anderer Spieler akustisch mitzuverfolgen funktioniert nicht. Das ist
eine grundsätzliche Einschränkung des Spielkonzepts, keine Design-Lücke.

## Tech-Stack

TypeScript strict überall (`strict: true`, `noUncheckedIndexedAccess: true`, kein `any`, kein
`@ts-ignore`), Next.js 15 App Router, React 19, Tailwind v4, Zod für jede WebSocket-Nachricht
(ein gemeinsames Schema-Modul für Client und Server), Zustand fürs Client-State, Framer Motion
für Animationen, Vitest für Unit-/Integrationstests, Playwright für E2E. Keine Datenbank –
aller Zustand ist in-memory und flüchtig (30 Min. Idle-GC für Lobbys), Kalibrierung/Avatar/
Nickname/Device-UUID liegen in `localStorage`.

Der `AudioWorkletProcessor` (`public/worklets/bark-processor.js`) ist bewusst reines JavaScript
statt eines Imports aus `packages/scoring`: AudioWorklets können ES-Module-Imports von
außerhalb in allen Zielbrowsern (vor allem Safari/iOS) nicht zuverlässig laden. Die
DSP-Mathematik ist von Hand 1:1 übertragen; die eigentliche Korrektheit der Mathematik ist in
`packages/scoring` bewiesen (Offline- vs. Streaming-Extraktion sind dort test-verifiziert
framegleich).

## Tests

- **`packages/scoring`**: 14 Unit-Tests, inklusive des Fairness-Tests und Anti-Cheat-Flags.
  Fixtures werden deterministisch synthetisiert (`scripts/gen-fixtures.ts`, mulberry32-PRNG),
  kein echtes Mikrofon nötig.
- **`packages/protocol`**: 46 Unit-Tests für Lobby-Reducer, Matchmaking, Match-Ablauf,
  Nickname-Filter, Report-Schwelle, Lobby-Codes, Zod-Schemas – alles ohne Netzwerk.
- **`server`**: 8 Integrationstests mit echten `ws`-Clients gegen einen echten
  `http`+`WebSocketServer` (Schnellsuche mit 5 Spielern, Backfill/Countdown, Disconnect+
  Reconnect, Host-Übernahme, doppelter Join derselben UUID, Rundentimeout, Nickname-Filter,
  Melde-Schwelle).
- **`e2e`**: Playwright mit `--use-fake-device-for-media-stream` und einer echten (synthetisch
  erzeugten) WAV-Datei als Mikro-Input – kompletter Zwei-Spieler-Match-Durchlauf, Drei-Spieler-
  Schnellsuche, iPad-Screenshots in beiden Ausrichtungen, ein Performance-Rauchtest.

`npm run verify` fasst Lint+Typecheck+Test zusammen und läuft vor jedem Commit.

## Passwort-Gate ("Bald verfügbar")

Solange das Spiel nicht öffentlich sein soll, sperrt `middleware.ts` alle Seiten (und
`server/index.ts` zusätzlich die `/ws`-Route, damit es keine Hintertür gibt) hinter einem
gemeinsamen Passwort (`GATE_PASSWORD`, Default `lars`). `/api/health` bleibt bewusst
ungesperrt, sonst würde Render den Service für "nicht gesund" halten. Wie das Passwort auf
`localStorage`-Ebene liegen andere Sicherheitsmechanismen in diesem Projekt ist das **kein
echtes Sicherheitssystem** – ein Cookie mit einem geteilten Passwort ist trivial umgehbar,
sobald jemand es kennt. Es ist eine Reibungsbremse gegen zufällige Besucher, keine
Zugriffskontrolle.

## Bekannte Grenzen

- Kein echtes Anti-Cheat gegen "Lautsprecher ans Mikro halten" (siehe oben).
- Kein Pro-Spieler-Latenzkanal im Protokoll – der Verbindungspunkt zeigt grün/grau, nicht
  gelb bei hoher Latenz (das würde ein Ping-Echo mit Zeitstempel im Protokoll brauchen).
- Der Performance-Test misst auf einem geteilten CI-Runner, nicht auf echter Mobil-Hardware –
  er ist ein Regressions-Rauchtest, kein belastbarer 60fps-Beweis für ein echtes iPad.
- Reconnect stellt die Verbindung wieder her, synchronisiert aber nicht rückwirkend alle
  während der Trennung verpassten Broadcasts (z.B. zwischenzeitliche Rundenergebnisse) –
  der Spieler sieht ab dem nächsten Broadcast wieder den korrekten Live-Zustand.
- Kein Live-Deploy in dieser Session (kein `RENDER_API_KEY` in der Build-Umgebung) – siehe
  [DEPLOY.md](./DEPLOY.md) für den manuellen letzten Schritt.

Für die vollständige, chronologische Liste aller erzwungenen Entscheidungen und beim
Bauen gefundenen Bugs (mit Begründung) siehe **[BLOCKERS.md](./BLOCKERS.md)**.

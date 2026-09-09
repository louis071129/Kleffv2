# KLÄFF

Multiplayer-Bell-Wettkampf im Browser. Spieler treten gegeneinander an, indem sie drei
Sekunden ins Mikrofon bellen. Ein **server-seitiges** Scoring-System bewertet Lautstärke,
Attack, Punch und Bell-Charakter – der beste Bell gewinnt die Runde. Zwei grundverschiedene
Wege, das zu tun:

- **Kläffkarussell** – Zufalls-Matchmaking mit Fremden, sofortiges 1v1, automatisches
  Re-Pairing nach jeder Begegnung. Übertragen wird nie die echte Stimme, sondern ein
  live client-seitig synthetisierter Bark-Sound, gesteuert von der echten Stimme
  (`packages/bark-synth`).
- **Private Lobby** – Code-basiert, nur mit eingeladenen Leuten. Hier läuft standardmäßig
  echter, unveränderter Ton. Flexible Spielerzahl (2–8), vom Host konfigurierbar: Duell
  (2 Spieler, Best-of-5), Kläffduell (K.-o.-Bracket) oder Rudel (Ranking über 3 Runden).

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
packages/scoring/    Framework-freie DSP- und Scoring-Engine (kein Browser, kein Node-spezifisches API)
packages/bark-synth/ Framework-freie Mapping-Mathematik fürs Bark-Synth (Tonhöhe/Lautstärke/Attack)
packages/protocol/   Zod-Schemas fürs WebSocket-Protokoll, Lobby-/Match-/Bracket-Reducer, Karussell-Queue, Nickname-Filter
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

1. **Startseite**: Nickname/Avatar wählen, dann Kläffkarussell oder private Lobby.
2. **Mikro freigeben**: expliziter Button (Browser verlangen eine User-Geste, bevor
   `AudioContext`/`getUserMedia` funktionieren).
3. **Kalibrierung**: drei Schritte à drei Sekunden (Stille, Sprechstimme, Test-Bell) – siehe
   Fairness-Erklärung unten. Bleibt für die Sitzung gültig, kein erneuter Vollablauf beim
   nächsten Match.
4. **Kläffkarussell**: sofortiges 1v1 mit dem am längsten wartenden Gegner, kein Countdown.
   *Oder* **Private Lobby**: 6-stelliger Code, Host konfiguriert Spielerzahl (2–8), Modus
   und "Echter Ton", startet manuell.
5. **Match**: abwechselnd/nacheinander wird gebellt (Kläffkarussell: 1 Runde pro Spieler;
   Duell: Best-of-5; Rudel: 3 Runden pro Spieler; Kläffduell: Best-of-3 pro K.-o.-Matchup).
   Der Server wertet jede Runde sofort aus und broadcastet das Ergebnis an alle.
6. **Ergebnis**: Podium/Rangliste. Im Kläffkarussell "Nächster Gegner" (neue Begegnung) oder
   "Kläffkarussell verlassen"; in privaten Lobbys "Nochmal!" zurück in die Lobby – jeweils
   ohne erneute Kalibrierung.

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
verschiedenen Lobbys innerhalb 24h wird die Device-UUID für das Kläffkarussell gesperrt
(private Lobbys bleiben erlaubt). Diese UUID liegt in `localStorage` und ist damit
**trivial umgehbar** (Inkognito-Fenster, Storage löschen, anderer Browser). Das Melde-Log ist
ein In-Memory-Ringpuffer (500 Einträge) ohne Persistenz über einen Server-Neustart hinaus.

## Matchmaking und Lobbys

- **Kläffkarussell**: ein Klick auf der Startseite reiht in eine reine Warteschlange ein
  (`packages/protocol/src/carousel.ts`). Sobald zwei Spieler warten, werden die zwei am
  längsten Wartenden sofort gepaart – kein Countdown, keine Mindestspielerzahl über 2 hinaus.
  Jede Begegnung ist eine einzelne Mini-Begegnung (jeder bellt einmal); danach führt ein
  erneuter Klick auf "Nächster Gegner" zu einer neuen Paarung. Nie echter Ton: der Gegner hört
  einen client-seitig aus den Feature-Frames synthetisierten Bark-Sound
  (`packages/bark-synth`, `lib/audio/bark-synth-voice.ts`), live gestreamt während des
  Bellfensters.
- **Private Lobby**: 6-stelliger Code (Großbuchstaben ohne `I`, `O`, `0`, `1`), Beitritt per
  Code oder Link `/j/ABCDEF`. Host konfiguriert Spielerzahl-Limit (2–8), Kick-Button,
  Host-Übernahme wenn der Host geht. Standardmäßig läuft **echter Ton** (komprimierte
  Aufnahme pro Bellfenster, `MediaRecorder`/Opus, `lib/audio/recorder.ts`) – der Host kann das
  jederzeit auf den Bark-Synth umschalten. Modus:
  - **Duell** (automatisch bei genau 2 Spielern): Best-of-5, abwechselnd, Rundensieger zählt.
  - **Rudel** (Host wählt, ab 3 Spielern): alle nacheinander, das für 3 Zyklen, Ranking nach
    Score-Summe.
  - **Kläffduell** (Host wählt, ab 3 Spielern): echtes K.-o.-Bracket
    (`packages/protocol/src/bracket.ts`, zufällige Paarung, Freilos bei ungerader Zahl),
    Best-of-3 pro Matchup, Matchups laufen sequenziell (alle sehen zu).
- **Kein Freitext-Chat.** Nur ein Emote-Rad mit 8 festen Reaktionen, live über der Avatarkarte
  angezeigt.
- **Nickname-Filter** (deutsch/englisch, Leetspeak-normalisiert) ersetzt gesperrte Namen durch
  einen generierten Fallback im Stil "Klaeffender Keks 42" – **nicht erschöpfend**, umgehbar
  durch neue Wortkombinationen oder andere Sprachen.
- **Scoring läuft immer über Feature-Frames**, egal ob echter Ton läuft oder nicht: 150
  Frames pro Bellfenster (live gestreamt, 50 Hz) plus ein Pegelwert 0–100 (gedrosselt auf
  10 Hz) für die Live-Reaktion der Avatare. Echter Ton ist zusätzlich, nie ein Ersatz fürs
  Scoring.

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
- **`packages/bark-synth`**: 17 Unit-Tests für die Mapping-Mathematik (Tonhöhe bleibt im
  200–900Hz-Zielbereich auch bei Extremwerten, Determinismus, keine NaN/Infinity bei Stille).
- **`packages/protocol`**: Unit-Tests für Lobby-Reducer, Kläffkarussell-Warteschlange,
  Match-/Duell-/Rudel-Standings, Kläffduell-Bracket (Pairing, Freilose, K.-o.-Progression),
  Nickname-Filter, Report-Schwelle, Lobby-Codes, Zod-Schemas – alles ohne Netzwerk.
- **`server`**: 18 Integrationstests mit echten `ws`-Clients gegen einen echten
  `http`+`WebSocketServer` (Kläffkarussell-Pairing bei 2/4/6 Wartenden, Re-Pairing, aktives
  Verlassen, Live-Frame-Relay, Melde-Schwelle; private Lobby: Duell/Rudel/Kläffduell komplett
  durchgespielt, Echter-Ton-Relay inkl. Abschalten, Host-Übernahme, Disconnect/Reconnect,
  doppelter Join derselben UUID, Rundentimeout, Nickname-Filter).
- **`e2e`**: Playwright mit `--use-fake-device-for-media-stream` und einer echten (synthetisch
  erzeugten) WAV-Datei als Mikro-Input – kompletter Kläffkarussell-Durchlauf inkl. Re-Pairing,
  privates Best-of-5-Duell mit echtem Ton, iPad-Screenshots in beiden Ausrichtungen, ein
  Performance-Rauchtest. Rudel/Kläffduell bewusst nur auf Protokoll-/Server-Ebene getestet,
  nicht per Browser-E2E (siehe BLOCKERS.md).

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

## Rechtliches

Vier eigene Seiten, außerhalb des Passwort-Gates erreichbar (siehe `middleware.ts` – ein
Impressum darf laut § 5 DDG nicht hinter einer Zugriffssperre verschwinden):

- **`/impressum`** – Pflichtangaben nach § 5 DDG. Enthält `[PLATZHALTER]`-Markierungen für Name,
  Anschrift und Kontakt der verantwortlichen Person – **muss** vor dem echten öffentlichen Start
  ausgefüllt werden, siehe BLOCKERS.md.
- **`/datenschutz`** – Datenschutzerklärung nach Art. 13 DSGVO, beschreibt die tatsächliche
  Datenverarbeitung (Hosting/Logfiles, das eine technisch notwendige Gate-Cookie, `localStorage`
  für Geräte-Kennung/Kalibrierung/Spitzname/Avatar, die pro Bell-Runde übertragenen – ausdrücklich
  **keine Rohaudio-**, nur abgeleiteten – Messwerte, die Melde-Funktion, selbstgehostete
  Schriftarten). Auch hier ein paar `[PLATZHALTER]` (Kontaktdaten, zuständige Aufsichtsbehörde).
- **`/nutzungsbedingungen`** – Beta-Status, zulässiges Verhalten, Melde-Konsequenzen,
  Altersempfehlung, Haftungsausschluss.
- **`/cookie-einstellungen`** – Übersicht aller lokal gespeicherten Daten plus ein
  Selbstbedienungs-Button, der `localStorage` und das Gate-Cookie vollständig löscht.

Da KLÄFF ausschließlich technisch notwendige Cookies/`localStorage` verwendet (kein Tracking,
keine Werbung, keine Analyse-Tools), ist nach § 25 Abs. 2 Nr. 2 TDDDG kein
Einwilligungs-Consent-Banner mit Ablehnen-Option nötig. `components/CookieNotice.tsx` zeigt
trotzdem einen einmaligen Transparenz-Hinweis – bewusst nur auf dem Start- und dem
Gate-Screen, **nicht** global über alle Screens gerendert, weil ein fixes Banner sonst den
zeitkritischen BELL!-Button während eines Matches verdecken kann (siehe BLOCKERS.md).

Diese Texte sind sorgfältig an den tatsächlichen Code angelehnt, aber **keine Rechtsberatung** –
der Besitzer wollte sie selbst noch mal durchsehen, siehe Auftrag.

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

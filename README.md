# KLÄFF

Multiplayer-Bell-Wettkampf im Browser. Kein Knopf, kein Abwechseln: sobald ein Match beginnt,
bellen alle Beteiligten gleichzeitig und durchgehend ins Mikrofon – wer **lauter und länger
durchhält**, gewinnt, live sichtbar auf einer Tauzieh-Skala bzw. einer Rudel-Rangliste. Ein
**server-seitiges** Wertungssystem berechnet dafür alle 150ms aus den echten Feature-Frames
jedes Spielers eine Lautstärke-Intensität und summiert sie über die Matchdauer auf
(`computeLiveIntensity`, `packages/scoring/src/live-intensity.ts`). Zwei grundverschiedene
Wege, das zu tun:

- **Kläffkarussell** – Zufalls-Matchmaking mit Fremden, sofortiges 1v1, automatisches
  Re-Pairing nach jeder Begegnung. Übertragen wird nie die echte Stimme, sondern ein
  live client-seitig synthetisierter Bark-Sound, gesteuert von der echten Stimme
  (`packages/bark-synth`).
- **Private Lobby** – Code-basiert, nur mit eingeladenen Leuten. Hier läuft standardmäßig
  echter, unveränderter Ton. Flexible Spielerzahl (2–8), vom Host konfigurierbar: Duell
  (2 Spieler), Kläffduell (K.-o.-Bracket) oder Rudel (3+ Spieler gleichzeitig).

Jede echte 1v1-Situation (Kläffkarussell-Begegnung, Duell, jedes Kläffduell-Matchup) ist ein
**Tauzieh**: eine Skala von -100 (Gegner führt voll) bis +100 (ich führe voll). Jeder Tick
addiert die aktuelle Lautstärke-Intensität jedes Spielers zu dessen laufender Gesamtpunktzahl,
das Seil ist die Differenz der beiden – "länger durchhalten" ergibt sich allein aus dieser
Zeit-Integration, ohne eigene Dauer-Logik. Das Match endet sofort und sichtbar, sobald eine
Seite ±100 erreicht (`packages/protocol/src/live-match.ts`). Kein fester Rundenzähler, kein
Unentschieden, nie ein zufälliges Ergebnis – bei echtem Gleichstand entscheidet nach
`TUG_OF_WAR_SUDDEN_DEATH_MS` (25s) deterministisch, wer gerade vorne liegt (steht das Seil
exakt bei 0, wird auch nach dieser Zeit nicht zufällig entschieden). Rudel ist kein
2-Seiten-System (3+ Spieler gleichzeitig): jeder akkumuliert unabhängig über eine feste
Matchdauer (`RUDEL_LIVE_DURATION_MS`, 18s), Rangliste nach Gesamtpunktzahl, live als
Fortschrittselement sichtbar (`components/RudelProgress.tsx`).

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
5. **Match**: kein Knopf, kein Abwechseln – alle bellen ab Matchstart gleichzeitig und
   durchgehend. Kläffkarussell, Duell und jedes Kläffduell-Matchup sind Tauzieh (endet sofort
   bei ±100 auf der Seil-Skala); Rudel läuft eine feste Matchdauer, Ranking nach
   Gesamtpunktzahl. Der Server wertet alle 150ms neu aus und broadcastet den Stand live an
   alle.
6. **Ergebnis**: Tauzieh-Matches zeigen sofort SIEG!/NIEDERLAGE, Rudel ein Podium/Rangliste.
   Im Kläffkarussell "Nächster Gegner" (neue Begegnung) oder "Kläffkarussell verlassen"; in
   privaten Lobbys "Nochmal!" zurück in die Lobby – jeweils ohne erneute Kalibrierung.

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

Die Live-Intensität (`computeLiveIntensity`, siehe "Die Live-Wertung im Detail" unten)
normalisiert die Lautstärke ebenfalls relativ zu diesem persönlichen Headroom, nicht zu einem
absoluten Wert – ein Handy mit lauter Kalibrierung gewinnt nicht automatisch gegen eines mit
leiser. Die frühere, rundenbasierte `scoreBark()`-Funktion (`packages/scoring/src/score.ts`)
bewertete zusätzlich Attack/Crest/Bell-Charakter, damit ein leises, präzises Bellen ein lautes,
ungeformtes Schreien schlagen konnte – **der wichtigste Test im Repo**
(`packages/scoring/test/score.test.ts`, "FAIRNESS") beweist das weiterhin für `scoreBark()`
selbst, ist aber für die aktuelle Live-Wertung der Matches nicht mehr die Wertungsgrundlage
(siehe unten).

**Safari auf iOS ignoriert `autoGainControl: false` regelmäßig.** Wird das erkannt
(`track.getSettings()` nach der Anfrage geprüft, nicht die Anfrage selbst vertraut), erscheint
im UI weiterhin ein Hinweis-Badge ("Dein Browser regelt die Lautstärke automatisch nach.
Wertung läuft im Ausgleichsmodus."). Die Live-Intensität selbst hat dafür **keine** eigene
Kompensation mehr (anders als das frühere `scoreBark`, das im AGC-Modus Gewicht von Lautstärke
zu Attack/Crest verschob) – eine bewusst dokumentierte Einschränkung des neuen, rein
lautstärkebasierten Mechanismus, siehe BLOCKERS.md.

### Die Live-Wertung im Detail

`computeLiveIntensity(frames, calibration)` (`packages/scoring/src/live-intensity.ts`) läuft
alle 150ms pro Spieler über dessen seit dem letzten Tick eingegangene Feature-Frames: nur
Frames über der Aktiv-Schwelle (Rauschboden + 10dB RMS) zählen, der lauteste Peak darunter wird
relativ zur persönlichen Kalibrierung auf 0–100 normiert. Bewusst **keine** Anti-Heul-Abwertung
(anders als die frühere rundenbasierte Wertung) – das Ziel ist jetzt ausdrücklich, langes
Durchhalten zu belohnen, nicht zu bestrafen. Das Ergebnis wird jeden Tick zur laufenden
Gesamtpunktzahl addiert (`applyLiveTick`, `packages/protocol/src/live-match.ts`); "länger
durchhalten" fällt allein aus dieser Zeit-Integration heraus.

Die frühere, rundenbasierte `scoreBark(frames, calibration)`-Funktion (Lautstärke/Attack/
Crest/Bell-Charakter, 100 Punkte, `packages/scoring/src/score.ts`) bewertet weiterhin ein
einzelnes 3-Sekunden-Bellfenster und ist vollständig samt Tests erhalten – sie ist aber **nicht
mehr die Wertungsgrundlage laufender Matches**, seit alle Modi kontinuierlich statt
rundenbasiert laufen. Sie bleibt als in sich stimmige, getestete Domänen-Logik im Repo (z.B.
für ein mögliches künftiges Kalibrierungs-Feedback), siehe BLOCKERS.md.

Der Client misst Audio (unvermeidbar – nur er hat Mikrofonzugriff), aber **nur der Server
berechnet die Wertung**. Der Client schickt niemals eine Zahl wie "ich habe 87 Punkte", sondern
ausschließlich die rohen Feature-Frames (Peak/RMS/Centroid/Flatness/Clipped, 50 Hz), durchgehend
für die gesamte Matchdauer gestreamt, plus das Kalibrierungsprofil einmal zu Sitzungsbeginn.

## Anti-Cheat – ehrlich begrenzt

Es gibt keine Illusion von echter Cheat-Sicherheit in einem Browser-Audiospiel ohne Konten:

- **`MIC_OVERLOAD`**: mindestens 60% der Frames eines Ticks sind übersteuert → Intensität für
  diesen Tick auf 55 Punkte gedeckelt.
- **`CALIBRATION_MISMATCH`**: Peak liegt mehr als 9 dB über dem kalibrierten Maximum → Flag,
  Neukalibrierung wird nahegelegt.

Beide sind **Flags, keine Bans**, und werden dem ganzen Raum als deutsches Label gezeigt.
**`REPLAY_SUSPECT`** (Korrelation der RMS-Hüllkurve mit einer früheren Runde) gab es im
rundenbasierten System, entfällt aber mit dem Wechsel auf durchgehendes Bellen – es gibt keine
diskreten "Runden" mehr, mit denen man vergleichen könnte (siehe BLOCKERS.md).
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
  Wartet jemand länger als `botFallbackMs` (Default 6s) ohne menschlichen Gegner, wird
  automatisch mit einem Bot zufälliger Schwierigkeit gepaart (siehe "Bots" unten). Jede
  Begegnung ist ein einzelnes durchgehendes Tauzieh-Match (kein Knopf, kein Abwechseln);
  danach führt ein erneuter Klick auf "Nächster Gegner" zu einer neuen Paarung. Nie echter Ton:
  der Gegner hört einen client-seitig aus den Feature-Frames synthetisierten Bark-Sound
  (`packages/bark-synth`, `lib/audio/bark-synth-voice.ts`), live gestreamt für die gesamte
  Matchdauer.
- **Private Lobby**: 6-stelliger Code (Großbuchstaben ohne `I`, `O`, `0`, `1`), Beitritt per
  Code oder Link `/j/ABCDEF`. Host konfiguriert Spielerzahl-Limit (2–8), Kick-Button, kann Bots
  in freie Slots einfügen (siehe "Bots" unten), Host-Übernahme wenn der Host geht.
  Standardmäßig läuft **echter Ton** (durchgehende komprimierte Aufnahme in kurzen Chunks,
  `MediaRecorder`/Opus, `lib/audio/recorder.ts`) – der Host kann das jederzeit auf den
  Bark-Synth umschalten. Modus:
  - **Duell** (automatisch bei genau 2 Spielern): Tauzieh, beide bellen durchgehend
    gleichzeitig, endet sofort bei ±100 auf der Seil-Skala.
  - **Rudel** (Host wählt, ab 3 Spielern): alle bellen gleichzeitig und durchgehend über eine
    feste Matchdauer, Ranking nach Gesamtpunktzahl.
  - **Kläffduell** (Host wählt, ab 3 Spielern): echtes K.-o.-Bracket
    (`packages/protocol/src/bracket.ts`, zufällige Paarung, Freilos bei ungerader Zahl), jedes
    Matchup ein durchgehendes Tauzieh, Matchups laufen sequenziell (alle sehen zu).
- **Kein Freitext-Chat.** Nur ein Emote-Rad mit 8 festen Reaktionen, live über der Avatarkarte
  angezeigt.
- **Nickname-Filter** (deutsch/englisch, Leetspeak-normalisiert) ersetzt gesperrte Namen durch
  einen generierten Fallback im Stil "Klaeffender Keks 42" – **nicht erschöpfend**, umgehbar
  durch neue Wortkombinationen oder andere Sprachen.
- **Wertung läuft immer über Feature-Frames**, egal ob echter Ton läuft oder nicht: durchgehend
  gestreamt für die gesamte Matchdauer (50 Hz) plus ein Pegelwert 0–100 (gedrosselt auf 10 Hz)
  für die Live-Reaktion der Avatare. Echter Ton ist zusätzlich, nie ein Ersatz für die Wertung.

## Bots

Kein simuliertes Mikrofon: der Server synthetisiert pro Bot einen kontinuierlichen Bark/Pause-
Strom (`generateSyntheticBarkFrames` in `packages/scoring/src/bot.ts`, als wiederholter Zyklus
mit fortlaufend neuem Seed aneinandergehängt, siehe `nextBotFrames` in `server/game-server.ts`)
und lässt ihn durch dieselbe, unveränderte `computeLiveIntensity`-Funktion wie einen echten
Spieler laufen – eine Quelle der Wahrheit für die Wertung, kein zweiter Pfad. Drei
Schwierigkeitsstufen (Welpe/Kläffer/Alptraum-Dogge), deren relative Lautstärke-Zielbereiche
(`peakDbfsRange` in `packages/scoring/src/bot.ts`) ursprünglich gegen die frühere, rundenbasierte
`scoreBark`-Funktion kalibriert wurden – für die aktuelle, rein peak-basierte Live-Wertung ergibt
sich die gewünschte Differenzierung (Welpe leiser/variabler, Alptraum-Dogge lauter/konstanter)
weiterhin allein aus diesen Peak-Bereichen. Ein Bot ist immer als solcher erkennbar: eigene
deutsche Namensliste ("Welpe Keks", "Kläffer Rudi", "Alptraum-Dogge Bruno", ...), ein
kleinerer/konstanter Avatar-Seed-Bereich, und überall ein sichtbares `BotBadge` (Avatarkarte,
Bühne, Ergebnis-Screen) – nie wie ein Mensch dargestellt. Zwei Einsatzorte: automatischer
Kläffkarussell-Fallback nach `botFallbackMs` (Default 6s) ohne menschlichen Gegner, und "Bot
hinzufügen" als Host-Aktion in der privaten Lobby (jederzeit entfernbar über das bestehende
Kick). Ein Bot bellt ab Matchstart von selbst durchgehend, genau wie ein Mensch – kein
Abwarten, bis er "an der Reihe" ist, das Konzept einer Reihenfolge gibt es nicht mehr.

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

- **`packages/scoring`**: 14 Unit-Tests für `scoreBark` (Fairness-Test, Anti-Cheat-Flags),
  15 Tests für den Bot-Frame-Generator, 11 Tests für die Live-Intensität (`computeLiveIntensity`:
  Stille/Extremwerte, keine NaN/Infinity, immer 0–100, Determinismus, `MIC_OVERLOAD`-Deckelung,
  `CALIBRATION_MISMATCH`-Flag, bewusst **keine** Anti-Heul-Abwertung). Fixtures werden
  deterministisch synthetisiert (`scripts/gen-fixtures.ts`, mulberry32-PRNG), kein echtes
  Mikrofon nötig.
- **`packages/bark-synth`**: 17 Unit-Tests für die Mapping-Mathematik (Tonhöhe bleibt im
  200–900Hz-Zielbereich auch bei Extremwerten, Determinismus, keine NaN/Infinity bei Stille).
- **`packages/protocol`**: Unit-Tests für Lobby-Reducer, Kläffkarussell-Warteschlange,
  Live-Match-Kernmechanik (`live-match.ts`: neutraler Start, Tick-Akkumulation, Seil-Schwelle,
  deterministischer Sudden-Death-Tiebreak – auch bei exaktem Patt nie zufällig, Rudel-Rangliste
  nach fester Matchdauer), Kläffduell-Bracket (Pairing, Freilose, K.-o.-Progression),
  Nickname-Filter, Report-Schwelle, Lobby-Codes, Zod-Schemas, Bot-Spieler (Namenspräfix pro
  Stufe, Avatar-Seed erfüllt weiterhin `AvatarSeedSchema`, Zusammenspiel mit
  `addPlayer`/`kickPlayer`) – alles ohne Netzwerk.
- **`server`**: 21 Integrationstests mit echten `ws`-Clients gegen einen echten
  `http`+`WebSocketServer` (Kläffkarussell-Pairing bei 2/4/6 Wartenden, Re-Pairing, aktives
  Verlassen, Live-Frame-Relay, Melde-Schwelle, Bot-Fallback nach Timeout mit kontinuierlich
  bellendem Bot; private Lobby: Duell/Rudel/Kläffduell komplett durchgespielt – alle Modi über
  durchgehend gestreamte `BARK_FRAME`s mit deterministisch stark unterschiedlicher Lautstärke
  bis zur Tauzieh-Schwelle bzw. bis zum Ablauf der Rudel-Matchdauer gespielt, kein fester
  Rundenzähler –, Sudden-Death entscheidet nie zufällig bei exaktem Patt, Bot per "Bot
  hinzufügen" komplett durchgespielt und wieder entfernt, Echter-Ton-Chunk-Relay inkl.
  Abschalten, Host-Übernahme, Disconnect mitten im Match + Reconnect mit Weiterbellen,
  doppelter Join derselben UUID, Nickname-Filter).
- **`e2e`**: Playwright mit `--use-fake-device-for-media-stream` und einer echten (synthetisch
  erzeugten) WAV-Datei als durchgehender Mikro-Input – kompletter Kläffkarussell-Durchlauf inkl.
  Re-Pairing, privates Tauzieh-Duell mit echtem Ton, allein gegen einen Bot spielen
  (`solo-vs-bot.spec.ts`), iPad-Screenshots in beiden Ausrichtungen, ein Performance-Rauchtest.
  Kein Knopf mehr zu klicken – `waitForMatchResult` (`e2e/helpers.ts`) wartet nur noch, bis
  SIEG!/NIEDERLAGE erscheint, während die Fake-Audio-Datei ohnehin die ganze Zeit Pegel liefert;
  alle E2E-Kontexte teilen dieselbe Datei, ein 1v1 zwischen zwei echten Browsern wird also
  praktisch immer über den deterministischen Sudden-Death-Fallback entschieden. Rudel/Kläffduell
  bewusst nur auf Protokoll-/Server-Ebene getestet, nicht per Browser-E2E (siehe BLOCKERS.md).

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
Gate-Screen, **nicht** global über alle Screens gerendert, weil ein fixes Banner sonst die
Tauzieh-Skala/Avatare während eines laufenden Matches verdecken kann (siehe BLOCKERS.md).

Diese Texte sind sorgfältig an den tatsächlichen Code angelehnt, aber **keine Rechtsberatung** –
der Besitzer wollte sie selbst noch mal durchsehen, siehe Auftrag.

## Bekannte Grenzen

- Kein echtes Anti-Cheat gegen "Lautsprecher ans Mikro halten" (siehe oben).
- Kein Pro-Spieler-Latenzkanal im Protokoll – der Verbindungspunkt zeigt grün/grau, nicht
  gelb bei hoher Latenz (das würde ein Ping-Echo mit Zeitstempel im Protokoll brauchen).
- Der Performance-Test misst auf einem geteilten CI-Runner, nicht auf echter Mobil-Hardware –
  er ist ein Regressions-Rauchtest, kein belastbarer 60fps-Beweis für ein echtes iPad.
- Reconnect stellt die Verbindung wieder her, synchronisiert aber nicht rückwirkend alle
  während der Trennung verpassten `LIVE_MATCH_UPDATE`-Ticks – der Spieler sieht ab dem
  nächsten Tick wieder den korrekten Live-Zustand (Seilposition/Rangliste).
- Die AGC-Fairness-Kompensation (Attack/Crest-Gewichtung im AGC-Modus) gibt es seit dem Wechsel
  auf die rein peak-basierte Live-Intensität nicht mehr – siehe "Fairness" oben und BLOCKERS.md.
- Kein Live-Deploy in dieser Session (kein `RENDER_API_KEY` in der Build-Umgebung) – siehe
  [DEPLOY.md](./DEPLOY.md) für den manuellen letzten Schritt.

Für die vollständige, chronologische Liste aller erzwungenen Entscheidungen und beim
Bauen gefundenen Bugs (mit Begründung) siehe **[BLOCKERS.md](./BLOCKERS.md)**.

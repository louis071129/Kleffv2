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


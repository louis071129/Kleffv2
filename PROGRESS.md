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


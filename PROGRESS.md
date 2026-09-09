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


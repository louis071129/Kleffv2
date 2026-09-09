# KLÄFF

Multiplayer-Bell-Wettkampf im Browser. Spieler treten gegeneinander an, indem sie
nacheinander drei Sekunden ins Mikrofon bellen. Ein server-seitiges Scoring-System
bewertet Lautstärke, Attack, Punch und Bell-Charakter – der beste Bell gewinnt die Runde.

> Dieses README wird in Phase 9 vollständig ausgebaut (Architektur, Fairness-Erklärung,
> Anti-Cheat, Barrierefreiheit, bekannte Grenzen). Dies ist das Gerüst aus Phase 0.

## Schnellstart

```bash
npm install
npm run dev
```

Server läuft auf `http://localhost:3000` (Next.js App Router + WebSocket auf demselben Port).

## Scripts

- `npm run dev` – Custom-Server im Watch-Modus
- `npm run build` – Next.js Production-Build
- `npm start` – Production-Server
- `npm run lint` / `npm run typecheck` / `npm test` – einzelne Prüfungen
- `npm run verify` – alle drei zusammen (Pflicht vor jedem Commit)
- `npm run test:e2e` – Playwright End-to-End-Tests
- `npm run gen-fixtures` – synthetische Audio-Fixtures für Tests erzeugen

## Struktur

```
packages/scoring/   Framework-freie DSP- und Scoring-Engine
packages/protocol/  Zod-Schemas, Lobby-/Match-Reducer, Matchmaking
app/                 Next.js App Router UI
server/              Custom Server (Next.js + WebSocket, ein Port)
scripts/             Fixture-Generator
fixtures/audio/      Generierte Test-Audiodateien (nicht committed)
e2e/                 Playwright-Tests
```

Details zu Deployment: [DEPLOY.md](./DEPLOY.md). Fortschritt: [PROGRESS.md](./PROGRESS.md).
Blocker und Entscheidungen: [BLOCKERS.md](./BLOCKERS.md).

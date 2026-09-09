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

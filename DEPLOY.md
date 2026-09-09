# KLÄFF auf dem iPad deployen

Das hier ist für dich, wenn du nur ein iPad hast und keinen Computer. Alles läuft über
Safari im Render-Dashboard, dauert unter 5 Minuten und du musst kein Terminal anfassen.

Render wurde gewählt, weil das Dashboard komplett im Browser bedienbar ist (Tippen reicht)
und weil es echte, dauerhafte WebSocket-Verbindungen unterstützt - das braucht KLÄFF für
Lobbys und Matches. Vercel & Co. scheiden aus: die halten keine WebSockets offen.

## Schritt 1 – Render-Konto (einmalig)

1. Öffne in Safari **render.com**.
2. Tippe rechts oben auf **Get Started** und melde dich mit deinem GitHub-Account an
   (Button "Sign in with GitHub"). Damit bekommt Render Lesezugriff auf deine Repos.
3. Bestätige die GitHub-Berechtigung, wenn Safari dich zu GitHub weiterleitet.

## Schritt 2 – Repo verbinden

1. Im Render-Dashboard: **New +** (oben rechts) → **Blueprint**.
2. Render sucht automatisch nach Repos mit einer `render.yaml`-Datei. Wähle **Kleffv2**
   aus der Liste. Falls es nicht auftaucht: **Configure account** antippen und dem
   GitHub-App-Zugriff auch für dieses Repo erlauben, dann zurück zu Render.
3. Render zeigt eine Vorschau: einen Web-Service namens **klaeff**, gebaut aus dem
   mitgelieferten `Dockerfile`. Das ist schon alles vorkonfiguriert - Region, Health-Check,
   Umgebungsvariablen stehen bereits in `render.yaml`.
4. Tippe auf **Apply** (oder **Create New Resources**, je nach Render-Version).

## Schritt 3 – Warten

Render baut jetzt das Docker-Image und startet den Service. Das dauert beim ersten Mal
ca. 3-5 Minuten (Next.js-Build). Der Fortschritt läuft live im Log-Fenster mit, das
öffnet sich automatisch. Fertig ist es, wenn oben **Live** in Grün steht.

## Schritt 4 – Testen

1. Tippe auf die URL oben im Service-Dashboard (etwas wie `https://klaeff.onrender.com`).
2. Safari öffnet die KLÄFF-Startseite. Wenn du stattdessen JSON mit `"status":"ok"` siehst,
   warst du auf `/api/health` gelandet - das ist der Health-Check-Endpunkt und ein gutes
   Zeichen, dass der Server läuft. Geh zurück zur Basis-URL ohne `/api/health`.

Von da an deployt Render **automatisch** bei jedem Push auf `main` neu (steht so in
`render.yaml`, `autoDeployTrigger: commit`) - du musst danach nichts mehr manuell anstoßen.

## Free-Plan-Hinweis

Auf dem kostenlosen Render-Plan schläft der Service nach ein paar Minuten Inaktivität ein
und der nächste Aufruf dauert dann ~30-60 Sekunden zum Aufwachen. Für einen Party-Test-Abend
unter Freunden meistens kein Problem - falls doch, in den Service-Settings auf einen
bezahlten Plan wechseln (kein Codeänderung nötig).

## Falls Render zickt: Fly.io als Fallback

Im Repo liegt zusätzlich eine `fly.toml`. Fly hat kein reines Web-Dashboard-Deployment ohne
Terminal - falls Render also mal ausfällt oder Probleme macht und du doch an einen Rechner
kommst:

```bash
brew install flyctl   # oder: curl -L https://fly.io/install.sh | sh
fly auth login
fly deploy
```

Das baut aus demselben `Dockerfile` und liest Health-Checks/Port aus `fly.toml`.

## Falls dieses Deployment automatisiert werden sollte

Wenn ein `RENDER_API_KEY` als Umgebungsvariable in der Build-Umgebung liegt, kann der Service
auch direkt per Render-API angelegt werden, ohne die Schritte oben von Hand zu machen. Das war
in dieser Session nicht der Fall (siehe `PROGRESS.md`/`BLOCKERS.md`) - deshalb bleiben die
Schritte oben der Weg zum ersten Deploy.

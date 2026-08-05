# Project Maze – Deployment & Betrieb

Produktionsfertiger Aufbau für Client und Server: zwei Container, ein Netz,
ein öffentlicher Port.

```text
Browser ──443/TLS──▶ nginx (client)  ──/ws──▶  Node (server)  :2567
                     ├─ /            statisches Vite-Bundle
                     ├─ /ws          WebSocket-Upgrade
                     └─ /health      Uptime-Check
                                     /metrics bleibt im internen Netz
```

Der Spielserver hält den kompletten Zustand im Arbeitsspeicher und ist
absichtlich ein einzelner autoritativer Prozess: **eine Arena = eine Instanz.**
Mehr Last bedeutet mehr Instanzen hinter getrennten Hostnamen, keine Repliken
hinter einem Loadbalancer.

## Schnellstart

```bash
cp .env.example .env      # Werte anpassen (mindestens MAZE_WS_URL, ALLOWED_ORIGIN)
docker compose up -d --build
```

- Client: `http://localhost:8080`
- Health: `http://localhost:8080/health`
- Telemetrie: `docker compose exec server node -e "fetch('http://127.0.0.1:2567/metrics').then(r=>r.text()).then(console.log)"`

Stoppen: `docker compose down`. Images einzeln bauen:

```bash
docker build -f apps/server/Dockerfile -t project-maze-server .
docker build -f apps/client/Dockerfile --build-arg VITE_WS_URL=wss://maze.example.com/ws -t project-maze-client .
```

## ENV-Referenz

### Spielserver (Laufzeit, `apps/server`)

| Variable | Standard | Bereich | Bedeutung |
| --- | --- | --- | --- |
| `PORT` | `2567` | 1–65535 | TCP-Port für HTTP und WebSocket. Werte außerhalb des Bereichs werden geklemmt. |
| `BOT_COUNT` | `8` | 0–18 | Bots in der Arena. `0` für reine PvP-Server. |
| `ALLOWED_ORIGIN` | `*` | Liste | Kommagetrennte Browser-Origins. **In Produktion setzen** – `*` erlaubt jede Herkunft. Gilt für CORS *und* den WebSocket-Handshake. |
| `ENABLE_DEV_TOOLS` | `false` | `true`/`false` | F2-Debug-Werkzeuge (Builds setzen, God-Mode, Dummies). **Muss in Produktion `false` bleiben.** |
| `TELEMETRY_ENABLED` | `true` | `true`/`false` | Anonyme Balance-Telemetrie inklusive `/metrics`. Bei `false` wird die Schicht gar nicht erst angehängt und `/metrics` antwortet mit 404. |
| `METRICS_TOKEN` | – | Freitext | Ist die Variable gesetzt, verlangt `/metrics` den Header `Authorization: Bearer <token>` (zeitkonstanter Vergleich). Leer lassen ist nur akzeptabel, solange der Serverport das interne Netz nicht verlässt. |
| `SHUTDOWN_DRAIN_MS` | `0` | 0–30000 | Vorlauf beim Herunterfahren, in dem `/health` bereits `503` meldet, der Listener aber noch offen ist. Railway nimmt die Instanz schon beim Signal aus dem Verkehr und braucht das nicht; hinter einem eigenen Loadbalancer sind 500–2000 ms sinnvoll. |
| `SNAPSHOT_DELTAS` | `false` | `true`/`false` | Lässt unveränderte Snapshot-Felder (Name, Klasse, Upgrades, Wände, Bestenliste, Killfeed, Formstatik) weg – rund 40 % weniger Bytes je Snapshot. **Setzt einen Client voraus, der den letzten Stand puffert.** Das Runden der Zahlen ist davon unabhängig und immer aktiv. |
| `NODE_ENV` | – | `production` | Von Compose gesetzt; schaltet Express in den Produktionsmodus. |

Ungültige Zahlenwerte fallen auf den Standard zurück, statt den Start zu
verweigern – ein Tippfehler in `BOT_COUNT` legt keinen Server lahm.

### Client (Build-Zeit, `apps/client`)

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `VITE_WS_URL` | leer | Absolute WebSocket-Adresse, die **fest in das Bundle gebacken** wird. Leer lassen heißt: der Client verbindet sich auf `ws(s)://<aktueller-hostname>:2567`. Eine Änderung erfordert einen neuen Build, kein Neustart. |

### Client (Laufzeit, nginx)

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `MAZE_SERVER_UPSTREAM` | `server:2567` | Ziel von `/ws` und `/health`. Wird beim Containerstart in die nginx-Konfiguration eingesetzt. |

### Compose-Ebene (`.env`)

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `MAZE_HTTP_PORT` | `8080` | Host-Port für den Client. |
| `MAZE_WS_URL` | `ws://localhost:8080/ws` | Wird als Build-Argument `VITE_WS_URL` durchgereicht. |
| `MAZE_TAG` | `local` | Tag beider Images. |

## Zwei Betriebsarten

**Ein Origin (Standard, empfohlen).** nginx terminiert TLS, liefert den Client
und reicht `/ws` weiter. Der Serverport wird nicht veröffentlicht, `/metrics`
ist von außen nicht erreichbar.

```dotenv
MAZE_WS_URL=wss://maze.example.com/ws
ALLOWED_ORIGIN=https://maze.example.com
```

**Getrennte Hosts.** Client und Server liegen auf verschiedenen Domains. Dann
im Compose-File beim Service `server` einen Port veröffentlichen
(`ports: ["2567:2567"]`), TLS davorschalten und zwingend `METRICS_TOKEN`
setzen – sonst liegt die Telemetrie öffentlich.

```dotenv
MAZE_WS_URL=wss://arena.example.com
ALLOWED_ORIGIN=https://maze.example.com
METRICS_TOKEN=<zufälliger Wert, z. B. openssl rand -hex 32>
```

## Reverse Proxy vor dem Stack

Wer TLS außerhalb von Compose terminiert (Traefik, Caddy, nginx auf dem Host),
braucht für `/ws` nur die üblichen Upgrade-Header:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 600s;
```

Ohne verlängertes `proxy_read_timeout` trennt der Proxy stille Verbindungen,
bevor der 30-Sekunden-Heartbeat des Servers greift.

## Telemetrie

Details zu den erhobenen Kennzahlen stehen in
[`TELEMETRY.md`](./TELEMETRY.md). Für den Betrieb wichtig:

- `/metrics` liefert Prometheus-Text, `/metrics?format=json` den aggregierten
  Bericht (zusätzlich `?subject=human|bot|all`).
- Es werden ausschließlich Aggregate je Klasse, Modul und Frame exportiert –
  keine Namen, IDs oder Adressen.
- Alle Zähler leben im Prozessspeicher und starten bei jedem Deploy bei null.
  Für Verläufe über Deploys hinweg gehört ein Prometheus davor.

Beispiel-Scrape-Konfiguration:

```yaml
scrape_configs:
  - job_name: project-maze
    metrics_path: /metrics
    static_configs:
      - targets: ['server:2567']
    # nur nötig, wenn METRICS_TOKEN gesetzt ist:
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/maze-token
```

## Lasttest

`scripts/loadtest.mjs` simuliert echte Clients gegen eine laufende Arena:
join, Eingaben mit der Tickrate, gelegentlich Upgrades und Klassenwahl.

```bash
npm run loadtest                                     # 20 Clients, 30 s, localhost
npm run loadtest -- --clients 40 --duration 60       # Arena bis ans Limit
npm run loadtest -- --url wss://maze.example.com --clients 40 --json
```

| Option | Standard | Bedeutung |
| --- | --- | --- |
| `--url` | `ws://localhost:2567` | Zielserver |
| `--clients` | `20` | parallele Verbindungen |
| `--duration` | `30` | Messfenster in Sekunden |
| `--rate` | `40` | Eingaben pro Sekunde je Client |
| `--ramp` | `2` | Sekunden, über die die Joins verteilt werden |
| `--json` | – | nur JSON ausgeben (für CI und Auswertung) |

Der Bericht zeigt Join-Erfolg, Durchsatz und vier Latenzreihen: **Snapshot**
(uhrversatzkorrigiertes Alter beim Eintreffen, per Ping/Pong-Offset berechnet),
**Abstand** (Lücke zwischen zwei Snapshots, Soll ~33 ms bei 30 Hz), **RTT** und
**Join**. Der Exit-Code ist 1, sobald Clients unerwartet scheitern – eine volle
Arena (`maxPlayers`) wird als Ergebnis ausgewiesen und gilt nicht als Fehler.

Während des Laufs `/metrics` beobachten: `maze_tick_budget_ratio` zeigt, ob die
Simulation noch Luft hat, `maze_tick_interval_seconds` deckt Sättigung
außerhalb der Simulation auf. Details in [`TELEMETRY.md`](./TELEMETRY.md).

Den Lasttest nie gegen eine produktive Arena mit echten Spielern fahren – er
belegt reale Plätze.

## Redeploy und Graceful Shutdown

Railway (und jede Plattform mit rollierendem Deploy) schickt beim Neustart
`SIGTERM`. Der Server fährt daraufhin geordnet herunter:

1. `/health` antwortet mit `503` und `draining: true`. Standardmäßig schließt
   der Listener unmittelbar danach – ein externer Checker sieht dann nur noch
   „connection refused", was für Railway genau richtig ist. Wer einen eigenen
   Loadbalancer davor hat, gibt ihm über `SHUTDOWN_DRAIN_MS` ein Zeitfenster,
   in dem die 503 tatsächlich abgeholt werden kann.
2. Tick-, Snapshot- und Heartbeat-Timer werden gestoppt.
3. Der Listener wird geschlossen, offene HTTP-Keep-Alives werden gelöst.
4. Jede WebSocket-Verbindung bekommt einen sauberen Close-Frame mit Code
   **1001 („going away")**. Der Browser feuert sein `close`-Event sofort und
   startet den Reconnect, statt in einen Timeout zu laufen.
5. Wer den Handshake ignoriert, wird nach 1,5 Sekunden hart getrennt;
   spätestens nach 8 Sekunden ist der Prozess in jedem Fall unten.

Ein zweites Signal bricht sofort ab. Zustände sind bewusst flüchtig – nach dem
Reconnect starten Spieler in einer frischen Arena.

## Betrieb

- **Health:** `GET /health` liefert Spielerzahl, Entity-Zähler und ob die
  Debug-Werkzeuge aktiv sind. Beide Container haben einen `HEALTHCHECK`.
- **Neustart:** Ein Neustart leert die Arena – Spielstände sind bewusst
  flüchtig. Deploys deshalb in Randzeiten legen.
- **Ressourcen:** Ein Server mit 8 Bots und ~20 Spielern läuft in unter 512 MB
  RAM und ausgelastet unter einem CPU-Kern. Die Simulation ist single-threaded;
  mehr Kerne helfen nur mit mehr Instanzen.
- **Härtung:** Der Servercontainer läuft als `node` (nicht root), mit
  `read_only`-Dateisystem, `no-new-privileges` und ohne veröffentlichten Port.
- **Logs:** `docker compose logs -f server`.

## CI

`.github/workflows/ci.yml` prüft bei jedem Push auf `main` und bei jedem Pull
Request:

1. `npm ci` mit npm-Cache über `package-lock.json`
2. `npm run check` (Typecheck, Tests, Build)
3. `npm run balance` – der Balance-Report wird als Artefakt
   `balance-report-<run>` hochgeladen und 30 Tage aufbewahrt
4. Ein zweiter Job baut beide Container-Images (mit GitHub-Actions-Cache) und
   validiert `docker-compose.yml`

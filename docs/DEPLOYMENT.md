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
| `TELEMETRY_ENABLED` | `true` | `true`/`false` | Anonyme Balance-Telemetrie inklusive `/metrics` **und** der Client-Perf-Berichte auf `POST /client-metrics` (FPS, Hänger, Geräteklasse, Renderpfad – siehe [`TELEMETRY.md`](./TELEMETRY.md#client-perf-telemetrie)). Bei `false` wird die Schicht gar nicht erst angehängt und beide Routen antworten mit 404. |
| `METRICS_TOKEN` | – | Freitext | Ist die Variable gesetzt, verlangt `/metrics` den Header `Authorization: Bearer <token>` (zeitkonstanter Vergleich). Leer lassen ist nur akzeptabel, solange der Serverport das interne Netz nicht verlässt. |
| `SITE_PASSWORD` | `123456789` | Freitext | Passwort für das Tor vor der **ganzen** Seite (Spiel, `/admin`, `/metrics`, `/leaderboard`, `/map`, WebSocket). Frei bleibt nur `/health`. Der Standard steht im Klartext im öffentlichen Repository und schützt deshalb gegen niemanden, der hinsieht – er sorgt nur dafür, dass das Tor auch ohne gesetzte Variable zu ist. **In Produktion auf etwas Zufälliges setzen.** Kontrolle: `/health` → `gate.defaultPassword` muss `false` sein. Siehe [`FREEZE.md`](./FREEZE.md). |
| `SITE_GATE_ENABLED` | `true` | `true`/`false` | Schaltet das Tor ab. Nur `false`, `0` und `off` wirken – ein Tippfehler lässt die Seite geschlossen. Bei `false` ist die Seite wieder vollständig öffentlich. |
| `SITE_GATE_MAX_AGE_DAYS` | `30` | 1–365 | Wie lange ein Browser nach der Eingabe hereingelassen wird. Das Cookie trägt sein Ablaufdatum selbst und ist HMAC-signiert; der Server führt keine Sitzungsliste. |
| `SITE_GATE_SECRET` | – | Geheimnis | Optional, geht zusätzlich in die Cookie-Signatur ein. Ein neuer Wert wirft alle eingeloggten Browser hinaus, ohne das Passwort zu ändern. Ein Passwortwechsel tut das ohnehin schon. |
| `SUPABASE_URL` | – | URL | Projekt-URL der Supabase-Instanz. Nur zusammen mit dem Service-Role-Key wirksam. |
| `SUPABASE_SERVICE_ROLE_KEY` | – | Geheimnis | Geheimer Supabase-Schlüssel. Schaltet zusammen mit `SUPABASE_URL` Run-Persistenz und `/leaderboard` frei. Fehlt eine der beiden Variablen, verhält sich der Server exakt wie ohne Persistenz. **Niemals in den Client.** Siehe [`SUPABASE.md`](./SUPABASE.md). |
| `PERSISTENCE_FLUSH_MS` | `5000` | 500–120000 | Abstand, in dem gepufferte Runs geschrieben werden. |
| `LEADERBOARD_CACHE_MS` | `30000` | 1000–600000 | Cache-Fenster von `GET /leaderboard`. |
| `AUTH_ENABLED` | `false` | `true`/`false` | Schaltet die Prüfung von Supabase-Zugriffstokens frei (Google-Login). Braucht zusätzlich `SUPABASE_URL`; fehlt eine der beiden, ist der Login-Pfad komplett inaktiv und der Server verhält sich exakt wie ohne. Gäste spielen immer. Siehe [`SUPABASE.md`](./SUPABASE.md#teil-2--google-login-einrichten-sprint-b). |
| `SUPABASE_JWT_SECRET` | – | Geheimnis | **Nur für ältere Supabase-Projekte mit HS256-Signatur.** Neuere Projekte prüfen über die JWKS des Projekts und brauchen die Variable nicht. `/health` zeigt unter `auth.mode`, welcher Weg aktiv ist. **Niemals in den Client.** |
| `RATE_LIMITS_ENABLED` | `true` | `true`/`false` | Rate-Limits und Missbrauchsschutz. Nur `false`, `0` und `off` schalten ab; bei `false` verhält sich der Server exakt wie ohne das Modul. |
| `RATE_LIMIT_CONNECTIONS_PER_IP` | `5` | 1–200 | Gleichzeitige WebSocket-Verbindungen je IP. **Hinter Carrier-NAT (Mobilfunk) teilen sich viele Fremde eine IPv4** – das ist die wahrscheinlichste Fehlauslösung. Steigt `abuse.rejectedConnections` in `/health` ohne erkennbaren Angriff, hier erhöhen. |
| `RATE_LIMIT_JOINS_PER_MINUTE` | `20` | 1–1000 | Beitritte je IP und Minute. |
| `RATE_LIMIT_HTTP_PER_MINUTE` | `60` | 1–10000 | Anfragen je IP und Minute auf `/leaderboard` und `/profile`. `/health` bleibt ungebremst. |
| `TRUST_PROXY_HOPS` | `1` | 0–8 | Zahl der eigenen Proxys vor dem Server (Railway: 1). Bestimmt, welcher Eintrag aus `x-forwarded-for` als echte Client-IP gilt. `0` ignoriert den Header. |
| `SHUTDOWN_DRAIN_MS` | `0` | 0–30000 | Vorlauf beim Herunterfahren, in dem `/health` bereits `503` meldet, der Listener aber noch offen ist. Railway nimmt die Instanz schon beim Signal aus dem Verkehr und braucht das nicht; hinter einem eigenen Loadbalancer sind 500–2000 ms sinnvoll. |
| `SNAPSHOT_DELTAS` | `false` | `true`/`false` | Lässt unveränderte Snapshot-Felder (Name, Klasse, Upgrades, Wände, Bestenliste, Killfeed, Formstatik) weg – rund 40 % weniger Bytes je Snapshot. **Braucht einen Client, der den letzten Stand puffert – der ist ausgeliefert** (`snapshot-hydrator.ts`, im Browser gegengeprüft) und in Railway ist der Schalter an. Das Runden der Zahlen ist davon unabhängig und immer aktiv. |
| `ARENA_DIRECTOR_ENABLED` | `true` | `true`/`false` | Dynamische Bot-Population: Zielgröße richtet sich nach der Zahl der Menschen (1 → 8 Bots, je weiterem −1, Minimum 3), höchstens eine Änderung alle 5 s. Bots verschwinden nur tot oder weit außer Sicht. Bei `false` bleibt die Population starr bei `BOT_COUNT` – dem Verhalten vor dem Direktor. |
| `SHORT_NET_IDS` | `false` | `true`/`false` | Ersetzt Entitäts-UUIDs im Snapshot durch fortlaufende Zahlen. Gemessen mit 40 Clients: zusätzlich rund 16 % weniger Bytes gegenüber `SNAPSHOT_DELTAS` allein. **Setzt einen Client voraus, der Zahlen als Entitäts-ID akzeptiert – und der seine eigene ID aus `snapshot.selfId` nimmt, nicht aus der `welcome`-Nachricht** (die trägt weiterhin die UUID; siehe unten). |
| `SPECTATOR_ENABLED` | `false` | `true`/`false` | Toter Spieler sieht bis zum Respawn live seinem Killer zu: Der Snapshot wird aus dessen Perspektive gebaut, `selfId` bleibt die eigene. **Braucht einen Client, der die Kamera auf `spectatorTargetId` zentriert – der ist ausgeliefert** (`spectator.ts`), in Railway ist der Schalter an. Fehlt er, steht die Kamera auf der Leiche und der Bildschirm bleibt leer. |
| `SIGNATURE_RAPID_ENABLED` | `false` | `true`/`false` | Signature „Momentum" der Rapid-Familie: schnelleres Nachladen, je länger die Klasse in Bewegung bleibt. Reine Serverwirkung, kein Client nötig. Nur der exakte Wert `true` schaltet ein. In `/health` unter `features.signatureRapid` ablesbar – **vor jeder Beurteilung dort prüfen, ob der Schalter überhaupt greift.** |
| `SIGNATURE_IMPACT_ENABLED` | `false` | `true`/`false` | Signature „Wucht" der Impact-Familie: Anlauf in Fahrt erhoeht den Koerperschaden auf bis zu das 2,5-Fache und wird beim Aufprall verbraucht. Ein Kontakttick nimmt nie mehr als 8 % des Maximallebens des Opfers, ein voller Anlauf verkuerzt die Zeit bis zum Tod um hoechstens ein Viertel. Reine Serverwirkung, kein Client nötig. Nur der exakte Wert `true` schaltet ein. In `/health` unter `features.signatureImpact` ablesbar. |
| `SPECTATOR_ENABLED` | `false` | `true`/`false` | Toter Spieler sieht bis zum Respawn live seinem Killer zu: Der Snapshot wird aus dessen Perspektive gebaut, `selfId` bleibt die eigene. **Setzt einen Client voraus, der die Kamera auf `spectatorTargetId` zentriert** – sonst steht die Kamera auf der Leiche und der Bildschirm bleibt leer. |
| `SIGNATURE_RAPID_ENABLED` | `true` | `true`/`false` | Signature „Momentum" der Rapid-Familie: schnelleres Nachladen, je länger die Klasse in Bewegung bleibt. Reine Serverwirkung, kein Client nötig. Nur der exakte Wert `true` schaltet ein. In `/health` unter `features.signatureRapid` ablesbar – **vor jeder Beurteilung dort prüfen, ob der Schalter überhaupt greift.** |
| `SIGNATURE_IMPACT_ENABLED` | `true` | `true`/`false` | Signature „Wucht" der Impact-Familie: Anlauf in Fahrt erhoeht den Koerperschaden auf bis zu das 2,5-Fache und wird beim Aufprall verbraucht. Ein Kontakttick nimmt nie mehr als 8 % des Maximallebens des Opfers, ein voller Anlauf verkuerzt die Zeit bis zum Tod um hoechstens ein Viertel. Reine Serverwirkung, kein Client nötig. Nur der exakte Wert `true` schaltet ein. In `/health` unter `features.signatureImpact` ablesbar. |
| `ACHIEVEMENTS_ENABLED` | `true` | `true`/`false` | Serverseitige Achievement-Engine, seit 12.08. Opt-out wie die Bandbreiten-Schalter (Befund 29). Rein beobachtend, Fortschritt nur im Arbeitsspeicher und nur je Verbindung. Auf `false` wird die Schicht nicht angehängt und der Server verhält sich exakt wie vorher. |
| `SIGNATURE_PRECISION_ENABLED` | `true` | `true`/`false` | Klassen 3.0, Signature der PRECISION-Familie (**Ladeschuss**): Halten lädt den Schuss auf, Loslassen feuert, ein Sofortklick trägt nur 45 % Schaden. Bei voller Ladung löst der Schuss selbst aus – ohne das würde der Dauerfeuer-Schalter des Clients nie auslösen. **Der Schaden steigt nie über den heutigen Wert**: Ein voll ausgebauter Lancer trägt 127,9 Schaden gegen 148 Leben des dünnsten Gegners seiner Stufe, jeder Ladefaktor über 1,16× wäre ein Ein-Schuss-Tod. Der volle Ausschlag kauft Größe (×1,4) und Durchschlag (×1,5) und kostet dafür Kadenz; das DPS-Optimum liegt bei 58 % Ladung. |
| `SIGNATURE_CONTROL_ENABLED` | `true` | `true`/`false` | Klassen 3.0, Signature der CONTROL-Familie (**Einheiten-Budget**): Der Zeitgeber, der verlorene Drohnen ersetzt, wird durch ein Nachschub-Konto abgelöst. **Volles Budget = eine komplette Flotte**, die Nachfüllrate entspricht im Mittel genau dem heutigen Wiederaufbau (`droneCount × droneRespawn`). Was sich ändert, ist die Verteilung: Wer eine Weile nichts verliert, stellt eine ausgelöschte Flotte sofort wieder hin; wer zweimal kurz hintereinander verliert, steht ohne Nachschub da. Deployables aus dem Masterplan (Mini-Turm, Verlangsamungsfeld) sind noch **nicht** enthalten – sie brauchen zusätzliche Entitäten im Snapshot. |
| `DASH_TRAVEL_ENABLED` | `true` | `true`/`false` | **Der Dash faehrt, statt zu springen.** Dieselbe Strecke (189 px), aber ueber die 180 ms seiner Wirkdauer verteilt statt in einem einzigen Tick - bei 30 Snapshots/s sind das fuenf bis sechs Bilder, in denen der Tank unterwegs ist. Ohne den Schalter erreicht den Client nur eine Positionsaenderung zwischen zwei Snapshots, und genau so sieht es aus (der Dash eines Gegners wie ein Teleport-Bug). Nebeneffekt: Die Fahrt endet an Waenden, statt den Endpunkt zu nehmen. **Gehoert zusammen mit der Spur im Client eingeschaltet**, nicht davor. |
| `FAMILY_UPGRADES_ENABLED` | `true` | `true`/`false` | Klassen 3.0/KL4, **Familien-Upgrades**: Die Slots `signatureRate` und `signaturePower` (Tasten 9 und 0) werden kaufbar. **Keine reine Ergänzung:** Mit dem Schalter wandert die Signature-Stärke aus dem Festwert in die Punkte-Ökonomie – wer nichts investiert, hat eine schwächere Signature als ohne den Schalter (Rapid 0,08 statt 0,25 Nachladeabschlag, Impact ×1,5 statt ×2,5), wer voll investiert eine stärkere. Kaufbar sind die Slots nur für Familien, deren Signature wirklich läuft: ohne `SIGNATURE_RAPID_ENABLED` bzw. `SIGNATURE_IMPACT_ENABLED` bleiben sie gesperrt, ohne Familie (Core) ebenfalls. Welche Familien offen sind, meldet `/health` unter `features.familyUpgradeBranches`. |
| `PROJECTILE_SPEED_V2` | `true` | `true`/`false` | **Projektiltempo 2.0.** Drei Regeln: Grundtempo ×0,70 für alle Zweige (Precision verliert die Sonderbehandlung), ein mit dem Level fallender Deckel (2,6× → 1,8× des schnellsten Spielertempos) und ein Boden, unter den keine Kugel fällt – Impact-Klassen liegen schon heute darunter und bleiben unverändert. Das Tempo-Upgrade steigt um 2,5 % je Punkt statt um 4 % und rechnet **nach** dem Deckel. Die Reichweite jeder Klasse bleibt exakt konstant. Precision verliert am meisten (Lancer −50 %), die Rapid-Linie −15 %. Bots gleichen ihren Vorhalt gegen die längere Flugzeit aus. Ohne den Schalter fliegen die Kugeln exakt wie bisher. |
| `REPULSE_TRAVEL_ENABLED` | `false` | `true`/`false` | **Der Rückstoß des Repulse wird getragen, statt sofort wegintegriert zu werden.** Ohne den Schalter legt ein Getroffener gemessene **44 px** zurück und steht nach 200 ms wieder – ein Tankdurchmesser, bei 195 px Wirkradius und 12 s Abklingzeit, und weniger, als er in derselben Zeit zu Fuß geht: Der Stoß wird als Geschwindigkeit gesetzt, und die Bewegungsintegration zieht sie im nächsten Tick auf die Eingabe zurück. Mit dem Schalter ist es dieselbe Stoßstärke über die 260 ms Wirkdauer – rund 107 px auf 100 px Abstand, in acht Snapshots sichtbar. Der Getroffene behält dabei die Kontrolle (der Stoß addiert sich zur eigenen Bewegung), und die Strecke endet an Wänden. Standardmäßig **aus**: eine Verdopplung der Wirkung ist eine Balance-Entscheidung. Nur der exakte Wert `true` schaltet ein, ablesbar in `/health` unter `features.repulseTravel`. |
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

## Auslieferung des Clients: vorkomprimiert

`npm run build` legt am Ende neben jede Textdatei in `apps/client/dist` eine
`.br`- und eine `.gz`-Fassung (`scripts/precompress.mjs`). Der Server liefert
sie aus, wenn der Browser sie akzeptiert.

| | über die Leitung |
| --- | --- |
| ohne Kompression | **926 KB** |
| gzip | 261 KB |
| brotli | **218 KB** (−76 %) |

**Warum beim Build und nicht zur Laufzeit.** Die naheliegende Lösung wäre die
`compression`-Middleware. Sie ist hier die falsche: Dieser Prozess ist ein
Spielserver mit 40 Hz Tick, und der Tick-Abstand liegt schon heute über dem
25-ms-Soll. Ein 630-KB-Bundle zur Laufzeit zu gzippen kostet 15 bis 25 ms CPU –
einen ganzen Tick, jedes Mal, wenn jemand die Seite lädt. Ein Ruckler für alle
in der Arena, ausgelöst durch einen einzigen Seitenaufruf. Vorkomprimiert
kostet die Auslieferung nichts und komprimiert obendrein stärker.

**Fehlt der Build-Schritt, passiert nichts Schlimmes:** Ohne `.br`/`.gz` geht
das Original raus wie vorher. Die Seite wird langsamer, nie kaputt.

**Der Compose-Pfad ist davon unberührt** – dort liefert nginx aus und
komprimiert selbst (`gzip on` in `apps/client/nginx.conf`). Die vorkomprimierten
Dateien betreffen den Single-Service-Betrieb, also Railway.

Prüfen lässt es sich mit einem Kopf-Abruf:

```bash
curl -sI -H 'Accept-Encoding: br' https://www.mazers.de/assets/<datei>.js \
  | grep -i 'content-encoding\|content-length'
```

Steht dort kein `Content-Encoding`, lief der Build ohne `precompress`.

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

**Was ein Schalter kostet**, beantwortet ein einzelner Lauf nicht – dafür wird
dieselbe Last je Schalterstellung gefahren und mehrfach wiederholt. Rezept,
Fallstricke (Rate-Limits auf einem Host, Tick-Fenster sofort abgreifen) und die
Referenzwerte vom 2026-08-06 stehen in
[`TELEMETRY.md`](./TELEMETRY.md#lastprobe-matrix-reproduzierbar-fahren).

### Die eigene ID mit `SHORT_NET_IDS`

Die `welcome`-Nachricht trägt die **UUID** des Spielers; sobald
`SHORT_NET_IDS=true` gesetzt ist, tragen die Snapshots dagegen fortlaufende
Zahlen – auch in `snapshot.selfId`. Ein Client, der sich die ID aus dem Welcome
merkt und im Snapshot danach sucht, findet sich **nie** wieder: kein Level, kein
Upgrade, keine Klassenwahl, kein Respawn nach dem Tod. Nichts davon meldet
einen Fehler, das Spiel wirkt nur seltsam leblos.

Der ausgelieferte Client macht es richtig (`snapshot-hydrator.ts` wandelt eine
numerische `selfId` in einen String, `renderer.ts` und `ui.ts` lesen sie aus dem
Snapshot). Für jedes weitere Werkzeug gilt: **eigene ID immer aus dem
Snapshot**. Der Lasttest tat das bis zum 06.08. nicht und maß deshalb eine
geschönte Last – die Geschichte steht in
[`TELEMETRY.md`](./TELEMETRY.md#warum-der-lasttest-die-schalter-mitspielen-muss).

## Rate-Limits und Missbrauchsschutz

Das Spiel ist öffentlich erreichbar. Drei Ebenen sind begrenzt, alle hinter
`RATE_LIMITS_ENABLED` (Standard: an):

| Ebene | Grenze | Reaktion |
| --- | --- | --- |
| Verbindungen je IP | 5 gleichzeitig | Close mit Code `1013` („try again later") |
| Beitritte je IP | 20 pro Minute | Fehlermeldung an den Client, Verbindung bleibt |
| Nachrichten je Verbindung | Budget je Art, `input` 50/s | erst Drosseln (Nachricht fällt weg), bei anhaltendem Missbrauch Close `1008` |
| Flut je Verbindung | 250 Nachrichten/s | sofortiges Close `1008` |
| `/leaderboard`, `/profile` je IP | 60 pro Minute (Burst 15) | `429` mit `Retry-After` |

**Client-IP hinter dem Proxy.** `x-forwarded-for` ist eine Liste, an die jeder
Proxy anhängt. Schickt ein Angreifer den Header selbst mit, stehen seine
erfundenen Werte **links**. Vertrauenswürdig ist deshalb nur der Eintrag, den
der eigene Proxy angehängt hat – bei Railway (`TRUST_PROXY_HOPS=1`) der
rechteste. Den linken zu nehmen wäre der klassische Fehler: Dann sucht sich
jeder Angreifer seinen eigenen Limit-Topf aus.

**Gemessen wird mit Token-Buckets, nicht mit festen Sekundenfenstern.** Ein
ehrlicher Client sendet mit 40 Hz; feste Fenster hätten an der Grenze schon
normales Ruckeln bestraft. Nachgemessen mit 12 Clients über 25 Sekunden und
11 856 Eingaben: **null Drosselungen.**

**Was im Blick bleiben sollte:** `abuse.rejectedConnections` in `/health`.
Steigt der Wert ohne erkennbaren Angriff, sitzen vermutlich mehrere echte
Spieler hinter einem Carrier-NAT (Mobilfunk) – dann
`RATE_LIMIT_CONNECTIONS_PER_IP` erhöhen. Das ist die wahrscheinlichste
Fehlauslösung im Betrieb.

Der `abuse`-Block in `/health`:

```json
"abuse": {
  "enabled": true, "trackedIps": 12, "openConnections": 8,
  "rejectedConnections": 0, "rejectedJoins": 0, "throttledMessages": 0,
  "disconnectedSockets": 0, "rejectedRequests": 0
}
```

Alle Zähler leben im Prozessspeicher und starten bei jedem Deploy bei null.
Beobachtete IPs werden nach zehn Minuten ohne Verbindung vergessen; mehr als
20 000 gleichzeitig hält der Server nie vor, damit IP-Rotation kein Speicherleck
wird.

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

### Deploy-Wache

Ein dritter Job, `deploy-watch`, läuft **nur nach einem Push auf `main`**. Er
pollt `/health` und prüft, ob der gepushte Stand live ankommt
(`scripts/deploy-watch.mjs`). Der Job hängt an keinem anderen: Wird er rot,
heißt das **nicht**, dass der Code kaputt ist, sondern dass der Stand nicht
angekommen ist – zwei sehr verschiedene Dinge.

Das Ziel lässt sich über die Repository-Variable `HEALTH_URL` umstellen; ohne
sie gilt `https://www.mazers.de/health`.

**Die Wache unterscheidet drei Fälle**, und diese Unterscheidung ist ihr
eigentlicher Zweck:

| Befund | Ergebnis | Bedeutung |
| --- | --- | --- |
| `commit` stimmt | **grün** | Der Stand ist live. |
| `commit` stimmt nicht, aber der Prozess ist frisch hochgekommen | **grün mit Warnung** | Der Deploy **ist** angekommen – die Commit-Anzeige lügt. |
| `commit` stimmt nicht und der Prozess läuft unverändert seit Stunden | **rot** | Jetzt ist es wirklich ein Deploy-Stopp. |

„Frisch hochgekommen" wird an drei Signalen erkannt, in dieser Reihenfolge der
Verlässlichkeit: Die Laufzeit ist zwischen zwei Abgriffen **zurückgesprungen**
(dann gab es sicher einen Neustart), die **`deploymentId` hat gewechselt**, oder
`uptimeSeconds` liegt unter der Schwelle aus `FRESH_UPTIME_SECONDS`
(Standard 900 s) – dann kann der Prozess nicht schon vor dem Push gelaufen sein.

**Warum der mittlere Fall grün bleibt und nicht rot:** Ist
`RAILWAY_GIT_COMMIT_SHA` von Hand als Service-Variable gesetzt, überschreibt sie
den echten Wert, und `commit` steht für immer still. Eine Wache, die deswegen
dauerhaft rot steht, wird nach drei Tagen ignoriert – und meldet dann auch den
echten Stillstand nicht mehr. Sie meldet den Fall stattdessen als
GitHub-Warnung, sichtbar, ohne den Job zu blockieren.

Zwei Fälle sind immer rot: Der Timeout mit altem Stand **und** ein `/health`,
das gar keinen Commit meldet (`unbekannt`). Ohne diese Angabe kann die Wache
nichts beweisen, und eine Wache, die im Zweifel grün meldet, ist schlimmer als
keine.

**Warum es den Job gibt.** Am 06.08. wurde aus einem `/health`-Abruf ein
Deploy-Stillstand über zwölf Commits diagnostiziert – **den es nicht gab.**
Railway hatte durchgehend normal deployt; Sam hat es an der Deploy-Historie
gegengeprüft. Die Anzeige hatte gleich mehrere kaputte Freshness-Signale:
`/health` kam ohne `Cache-Control` und wurde aus dem Browser-Cache beantwortet,
`build` ist ein Festwert und sieht nur wie eine Build-Kennung aus, und `commit`
allein genügt nicht.

Die Lehre ist nicht „der Deploy steht", sondern: **Ein Testprotokoll, dessen
Frische man nicht prüfen kann, erzeugt Diagnosen aus dem Nichts.** Deshalb
prüft die Wache heute nicht nur den Commit, sondern auch, ob sich der Prozess
überhaupt bewegt hat.

Meldet sie einen echten Stillstand, ist der Fehler nicht im Repository zu
suchen, sondern in Railway:

1. **Watch-Paths** – ein Muster, das auf nichts passt, überspringt jeden Deploy
   stillschweigend („No changes to watched files"). Leer heißt „alles
   beobachten" und ist der richtige Zustand.
2. **Auto-Deploy aus** oder GitHub-Repo abgehängt – dann steht in der
   Deployments-Liste zum Zeitpunkt des Pushes gar kein Eintrag.
3. **Fehlgeschlagener Build** – dann steht dort ein roter Eintrag, und das
   Build-Log sagt, warum. Railway behält in dem Fall den alten Stand.

### Wenn `/health` und der Augenschein sich widersprechen

`commit` kommt aus `RAILWAY_GIT_COMMIT_SHA`. Ist diese Variable irgendwo von
Hand als Service-Variable gesetzt, überschreibt sie den echten Wert und `/health`
meldet dauerhaft denselben Commit – auch nach erfolgreichen Deploys. Umgekehrt
kann ein Deploy laufen, ohne dass sich am Server etwas ändert.

**Zuerst aber: Kommt die Antwort überhaupt frisch?** `/health` setzt seit dem
06.08. `Cache-Control: no-store`, weil genau daran schon einmal ein
Deploy-Stillstand diagnostiziert wurde, den es nicht gab – ein Browser-Tab
zeigte nach dem Neuladen den alten Rumpf. Bei einem Abruf aus dem Browser im
Zweifel hart neu laden oder `curl` nehmen.

Drei Felder helfen beim Auseinanderhalten:

- **`uptimeSeconds`** ist die Laufzeit des Prozesses und kommt ohne jede
  Railway-Variable aus. Steht dort ein Wert von Tagen, hat es seit Tagen keinen
  Deploy gegeben – ganz gleich, was `commit` behauptet. Steht dort ein kleiner
  Wert, während `commit` alt aussieht, ist die Git-Variable das Problem und
  nicht der Deploy.
- **`deploymentId`** wechselt bei jedem echten Deploy. Ändert sie sich, während
  `commit` stehenbleibt, ist `RAILWAY_GIT_COMMIT_SHA` fest verdrahtet.
- **`build`** ist ein **fester Text im Quelltext** und keine Build-Information.
  Er ändert sich nur, wenn ihn jemand von Hand ändert, und taugt deshalb nicht
  als Beleg dafür, welcher Stand läuft.

Genau diese drei wertet auch die Deploy-Wache aus – wer von Hand nachsieht,
prüft dasselbe in derselben Reihenfolge.

# Project Maze – Go-Live-Anleitung

Reihenfolge: **1. Game-Server live → 2. spielen/testen → 3. später Supabase** für
Persistenz (Leaderboard, Telemetrie, optional Accounts). Der Game-State selbst
läuft immer in-memory – eine Datenbank ist zum Livegehen **nicht** nötig.

## Architektur des Deployments

Der Server unterstützt **Single-Service-Deploy**: Er liefert den gebauten Client
selbst aus (gleiche Origin für Seite und WebSocket → kein CORS, kein zweites
Hosting). Ein einziger Node-Prozess ist alles, was live gehen muss.

Wichtig: Der Host muss **dauerhafte WebSocket-Verbindungen** unterstützen.
Serverless (Vercel Functions, Netlify Functions, Cloudflare Workers ohne
Durable Objects) funktioniert NICHT für den Game-Server.

## Build & Start (überall gleich)

```bash
npm ci
npm run build          # shared → server → client
npm start              # startet apps/server/dist/index.js
```

Der Server findet `apps/client/dist` automatisch und liefert ihn aus.

### Environment-Variablen

| Variable | Default | Bedeutung |
|----------|---------|-----------|
| `PORT` | `2567` | HTTP+WebSocket-Port (Hoster setzen PORT meist selbst) |
| `BOT_COUNT` | `8` | Bots beim Start (0–18) |
| `ALLOWED_ORIGIN` | `*` | Kommagetrennte erlaubte Origins; bei Single-Service auf die eigene Domain setzen, z. B. `https://maze.example.com` |
| `ENABLE_DEV_TOOLS` | aus | NIEMALS in Produktion auf `true` (Balance-Lab/Debug) |
| `SNAPSHOT_DELTAS` | aus | Lässt unveränderte Snapshot-Felder weg (~40 % weniger Bytes); braucht einen puffernden Client |
| `ARENA_DIRECTOR_ENABLED` | an | Dynamische Bot-Population nach Spielerzahl; `false` friert sie auf `BOT_COUNT` ein |
| `SHORT_NET_IDS` | aus | Kurze numerische Entitäts-IDs statt UUIDs im Snapshot; braucht einen passenden Client |
| `ACHIEVEMENTS_ENABLED` | aus | Achievement-Engine im Server (beobachtend, In-Memory, noch ohne Client-Anzeige) |
| `RATE_LIMITS_ENABLED` | an | Rate-Limits je IP und Verbindung; `false` schaltet sie ab |
| `RATE_LIMIT_CONNECTIONS_PER_IP` | `5` | Gleichzeitige Verbindungen je IP – hinter Mobilfunk-NAT ggf. erhöhen |
| `RATE_LIMIT_JOINS_PER_MINUTE` | `20` | Beitritte je IP und Minute |
| `RATE_LIMIT_HTTP_PER_MINUTE` | `60` | `/leaderboard` und `/profile` je IP und Minute |
| `TRUST_PROXY_HOPS` | `1` | Proxys vor dem Server (Railway: 1); bestimmt die vertrauenswürdige Client-IP |
| `CLIENT_DIST` | auto | Pfad zum Client-Build; leerer String deaktiviert das Ausliefern (getrenntes Client-Hosting) |
| `VITE_WS_URL` | – | Nur bei getrenntem Client-Hosting: beim **Client-Build** setzen, z. B. `wss://maze-server.example.com` |

## Option A (empfohlen): Railway oder Fly.io

**Railway:** Repo verbinden → als Build Command `npm ci && npm run build`,
Start Command `npm start`. `ALLOWED_ORIGIN` auf die Railway-Domain setzen.
WebSockets funktionieren out of the box, TLS/wss macht Railway automatisch.

**Fly.io (Region fra für DE):**
```bash
fly launch --no-deploy   # erkennt Node; internal_port auf 2567 stellen
fly deploy
```

## Option B: Hetzner VPS (gehärtet, ~4,50 €/Monat)

Voraussetzungen: Hetzner-Cloud-Server (CX22, Ubuntu 24.04, **mit SSH-Key
erstellt**) und eine Domain mit A-Record auf die Server-IP.

```bash
# per SSH als root auf dem Server:
curl -fsSL https://raw.githubusercontent.com/samulba/project-maze/main/scripts/deploy/hetzner-setup.sh -o setup.sh
MAZE_DOMAIN=deine-domain.de bash setup.sh
```

Das Skript ist idempotent und übernimmt die komplette Härtung:

- Firewall (ufw): nur SSH/80/443 offen, Game-Prozess nur via Caddy erreichbar
  (bindet auf 127.0.0.1)
- SSH: Passwort-Login aus (sobald ein Key hinterlegt ist), fail2ban aktiv
- automatische Sicherheitsupdates inkl. nächtlichem Auto-Reboot bei Bedarf
- App läuft als unprivilegierter User `maze` in einer systemd-Sandbox
  (ProtectSystem=strict, NoNewPrivileges, Memory-Limit) mit Auto-Restart
- Caddy besorgt und erneuert TLS-Zertifikate automatisch (wss inklusive)

Bei privatem Repo bricht das Skript einmal ab und zeigt einen Deploy-Key an –
diesen in GitHub unter *Settings → Deploy keys* (read-only) eintragen und das
Skript erneut ausführen.

**Updates einspielen** (nach jedem Merge):
```bash
bash /opt/project-maze/app/scripts/deploy/deploy.sh
```

**Optionales Auto-Deploy bei jedem Push auf `main`** – GitHub-Action, die per
SSH `deploy.sh` ausführt (Secrets `DEPLOY_HOST` und `DEPLOY_SSH_KEY` im Repo
hinterlegen):
```yaml
# .github/workflows/deploy.yml
name: Deploy
on: { push: { branches: [main] } }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: root
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: bash /opt/project-maze/app/scripts/deploy/deploy.sh
```

## Option C: Getrenntes Hosting (Client-CDN + Game-Server)

Client-Build mit `VITE_WS_URL=wss://<server-domain>` erzeugen und `dist/` auf
Cloudflare Pages/Netlify legen; Server wie oben deployen, `CLIENT_DIST=""`
setzen und `ALLOWED_ORIGIN` auf die Client-Domain.

## Smoke-Test nach dem Deploy

1. `https://<domain>/health` → `{ ok: true, ... }`
2. Seite öffnen, Namen eingeben, joinen – Verbindung muss „MAZE ALPHA“ zeigen.
3. Zweites Gerät/Browserfenster: beide sehen sich in der Arena.

## Phase 2 (nach dem Go-Live): Supabase

Persistenz liegt als eigenes Tuning-Modul (`apps/server/src/persistence.ts`)
neben der Simulation und blockiert den Tick-Loop nie – alle Writes laufen
gepuffert und asynchron.

1. **Globales Leaderboard – umgesetzt:** Jeder Tod eines echten Spielers legt
   einen Run (Name, Score, Level, Klasse, Kills, beste Streak, Dauer) in einen
   Puffer; ein eigener Timer schreibt ihn per Service-Role-Key nach Supabase.
   Der Client liest über die Server-Route `GET /leaderboard` (Top 50, 30 s
   gecacht), nie direkt von Supabase.
   Einrichtung Schritt für Schritt: [`SUPABASE.md`](./SUPABASE.md).
2. **Telemetrie-Sink – offen:** das Telemetrie-Modul könnte seine Aggregate
   (Pickraten, K/D je Klasse, Lebensdauer) periodisch mitschreiben, statt sie
   nur im Speicher zu halten.
3. **Accounts/Achievements – Etappe 3:** Supabase Auth mit Google-Login.
   Achtung: ändert das „kein Account“-Versprechen im UI.

Regeln: Keys nur als Server-ENV (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`),
niemals im Client-Bundle; alle Schreibzugriffe vom Server, nie vom Client.
Ohne die beiden Variablen verhält sich der Server exakt wie ohne Persistenz –
das ist kein Sonderfall, sondern der getestete Normalzustand.

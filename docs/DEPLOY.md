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

Erst wenn das Spiel live läuft, kommt Persistenz dazu – als eigenes
Tuning-Modul, ohne den Tick-Loop zu blockieren (nur asynchrone Writes):

1. **Telemetrie-Sink:** das Telemetrie-Modul (Chat 04) schreibt aggregierte
   Kennzahlen (Pickraten, K/D je Klasse, Lebensdauer) periodisch in eine
   Supabase-Tabelle statt nur in den Speicher.
2. **Globales Leaderboard:** Top-Runs (Name, Score, Klasse, Datum) per
   Service-Role-Key vom Server aus persistieren; Client liest über eine
   kleine Server-Route (`/leaderboard`), nicht direkt von Supabase.
3. **Optional Accounts/Skins:** Supabase Auth – erst sinnvoll, wenn es etwas
   zu speichern gibt. Achtung: ändert das „kein Account“-Versprechen im UI.

Regeln: Keys nur als Server-ENV (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`),
niemals im Client-Bundle; alle Schreibzugriffe vom Server, nie vom Client.

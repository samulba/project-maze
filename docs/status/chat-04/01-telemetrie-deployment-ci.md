# 01 – Telemetrie, Container-Deployment, CI-Härtung

| | |
| --- | --- |
| **Branch** | `claude/maze-telemetry-deployment-ci-dfb335` |
| **Commit** | `a8c7b25` |
| **Basis** | `claude/app-analysis-masterplan-lxao21` (`1f7e911`) |
| **Tests** | `npm run check` grün – 14 Dateien, 73 Tests (10 neu) |
| **Status** | gemerged |

## Was gebaut wurde

**Telemetrie (`apps/server/src/telemetry.ts`)** – eigene Tuning-Schicht nach dem
Muster `tuneX(game)`, als **äußerste** Schicht angehängt. Verändert keine Regel,
sie beobachtet nur.

- **Pickraten**: jeder erfolgreiche `chooseClass`-Aufruf, plus Erst-Ausrüstung
  und jeder Wechsel von Modul/Frame
- **Lebensdauer**: Spawn → Tod, zugeordnet zur Klasse im Todesmoment
- **Kills/Deaths**: je Klasse, Core Module und Frame, für Angreifer und Opfer
  mit dem Zustand *vor* dem Tod
- Alles mit `subject`-Label (`human`/`bot`), damit Bot-Zahlen die
  Spielerauswertung nicht überdecken

Modul und Frame sind nur über die Snapshot-API sichtbar. Die Schicht liest sie
kostenlos aus laufenden Snapshots **und** per Round-Robin (ein Spieler /
250 ms), damit auch Bot-Duelle in leerer Arena vollständig zugeordnet bleiben.
Spieler-IDs bleiben im Arbeitsspeicher und werden beim Verlassen gelöscht.

`/metrics` liefert Prometheus-Text, `?format=json` den Bericht mit fertigen
Pickraten, `?subject=human` filtert. `TELEMETRY_ENABLED=false` → 404 und die
Schicht wird gar nicht angehängt; `METRICS_TOKEN` → Bearer-Pflicht mit
zeitkonstantem Vergleich.

**Deployment** – Server-Dockerfile (Build → Prod-Deps → Runtime, `USER node`,
Healthcheck), Client-Dockerfile (Vite-Bundle hinter nginx mit `/ws`-Upgrade und
`/health`; `/metrics` bewusst **nicht** durchgereicht), `docker-compose.yml` mit
internem Netz, Healthcheck-Abhängigkeit, `read_only`/`no-new-privileges` und nur
einem öffentlichen Port. Dazu `.env.example`, `.dockerignore`,
`docs/DEPLOYMENT.md` und `docs/TELEMETRY.md`.

**CI** – `npm ci` mit npm-Cache über `package-lock.json`, Läufe auch für Pull
Requests, Concurrency-Gruppe, `permissions: contents: read`, Balance-Report als
Artefakt (30 Tage). Zweiter Job baut beide Images mit GHA-Cache und validiert
den Compose-Stack.

## Verifiziert

Docker-Daemon war in der Session nicht verfügbar, die Images sind also
ungebaut. Ersatzweise geprüft, was wirklich schiefgehen kann:

- Prod-Deps-Befehl real ausgeführt: 73 Pakete, 11 MB, keine devDeps,
  Workspace-Symlinks korrekt
- Exaktes Dateiset der Runtime-Stage zusammengesetzt und den Server **daraus
  gestartet** – `/health` und `/metrics` liefern echte Daten (Picks, Kills,
  Deaths, Lebensdauer, Token-Gate 401/200, Disabled-Modus 404)
- `VITE_WS_URL` landet nachweislich im Bundle, `docker compose config`
  validiert

Ungeprüft bleiben die Basis-Images und die nginx-Konfiguration – der CI-Job
`deployment` deckt genau diese Lücke beim ersten Lauf ab.

## Bewusste Abweichungen

- Statt der Template-Automatik des nginx-Images setzt ein eigenes
  Entrypoint-Skript den Upstream mit explizitem `envsubst`-Argument ein, damit
  nginx-Variablen wie `$uri` garantiert unangetastet bleiben.

## Von 01 gebraucht

Nichts.

## Für Sam

- `METRICS_TOKEN` setzen, sobald der Serverport außerhalb des internen Netzes
  erreichbar ist

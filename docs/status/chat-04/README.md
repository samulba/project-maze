# Chat 04 – Infra/Betrieb: Statusberichte

Dieser Ordner ist der Übergabepunkt von **Chat 04** (Telemetrie, Persistenz,
Deployment, CI, Lasttests, Sicherheit) an **Chat 01 (Zentrale)**.

Chat 04 legt hier nach jedem fertigen Paket einen Bericht ab und pflegt die
Tabelle unten. Damit muss nichts mehr aus dem Chatfenster kopiert werden – die
Zentrale liest direkt aus `main`.

## Wie das gelesen wird

- **Ein Bericht = ein Paket.** Dateien sind fortlaufend nummeriert, die
  Sortierung nach Dateiname ist also die zeitliche Reihenfolge.
- **Der neueste Bericht steht unten in der Tabelle ganz oben.**
- Jeder Bericht hat denselben Kopf (Branch, Basis-Commit, Testergebnis) und
  dieselben Abschnitte: *Was gebaut wurde*, *Verifiziert*, *Bewusste
  Abweichungen*, *Von 01 gebraucht*, *Für Sam*.
- **Status-Werte:** `offen` (gepusht, wartet auf Review/Merge) ·
  `gemerged` (in `main`) · `verworfen`.

Die Berichte werden nach dem Merge **nicht** gelöscht – sie sind das Protokoll,
warum etwas so gebaut ist, wie es gebaut ist.

## Berichte

| # | Paket | Branch | Commit | Tests | Status |
| --- | --- | --- | --- | --- | --- |
| [06](./06-rate-limits.md) | Rate-Limits & Missbrauchsschutz | `claude/maze-rate-limits-abuse-dfb335` | `ea2e4ec` | 389 ✔ | **offen** |
| [05](./05-achievements-persistenz-profil.md) | Achievement-Persistenz + `/profile` | `claude/maze-achievements-persistence-profile-dfb335` | `77fee92` | 309 ✔ | gemerged |
| [04](./04-google-login-server.md) | Google-Login Server-Seite | `claude/maze-auth-google-server-dfb335` | `fc5d107` | 255 ✔ | gemerged |
| [03](./03-supabase-persistenz.md) | Supabase-Persistenz + Leaderboard | `claude/maze-supabase-persistence-dfb335` | `56443bf` | 209 ✔ | gemerged |
| [02](./02-lasttest-tickhealth-shutdown.md) | Lasttest, Tick-Gesundheit, Shutdown | `claude/maze-loadtest-tickhealth-shutdown-dfb335` | `fe41cae` | 108 ✔ | gemerged |
| [01](./01-telemetrie-deployment-ci.md) | Telemetrie, Deployment, CI | `claude/maze-telemetry-deployment-ci-dfb335` | `a8c7b25` | 73 ✔ | gemerged |

## Offene Punkte für die Zentrale

- **Paket 06 (Rate-Limits) wartet auf Review und Merge.**

## Offene Punkte für Sam (Betrieb)

Gesammelt aus allen Berichten – erledigte Punkte werden gestrichen, nicht
gelöscht.

- [ ] Nach dem Merge von Paket 06: `mazers.de/health` → `abuse`-Block prüfen.
      Steigt `rejectedConnections` ohne Angriff, sitzen echte Spieler hinter
      einem Mobilfunk-NAT → `RATE_LIMIT_CONNECTIONS_PER_IP` erhöhen
- [ ] `TRUST_PROXY_HOPS=1` passt für Railway; bei einem zusätzlichen Proxy
      davor auf `2` setzen, sonst landet die Proxy-IP im Limit-Topf

> Migrationen liegen seit `a7a213a` unter `supabase/migrations/` mit der
> Ablage-Konvention von 01: noch offene direkt im Ordner, eingespielte in
> `applied/`. Stand: `0001`–`0003` eingespielt.

## ENV-Variablen aus Chat 04

Vollständige Referenz mit Bereichen und Erklärungen:
[`docs/DEPLOYMENT.md`](../../DEPLOYMENT.md). Kurzform, alle mit sicherem
Standard – ohne sie verhält sich der Server wie vorher:

| Variable | Standard | Paket |
| --- | --- | --- |
| `TELEMETRY_ENABLED`, `METRICS_TOKEN` | an / leer | 01 |
| `SHUTDOWN_DRAIN_MS` | `0` | 02 |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | leer | 03 |
| `PERSISTENCE_FLUSH_MS`, `LEADERBOARD_CACHE_MS` | `5000` / `30000` | 03 |
| `AUTH_ENABLED`, `SUPABASE_JWT_SECRET` | aus / leer | 04 |
| `RATE_LIMITS_ENABLED` | **an** | 06 |
| `RATE_LIMIT_CONNECTIONS_PER_IP` | `5` | 06 |
| `RATE_LIMIT_JOINS_PER_MINUTE` | `20` | 06 |
| `RATE_LIMIT_HTTP_PER_MINUTE` | `60` | 06 |
| `TRUST_PROXY_HOPS` | `1` | 06 |

## Was Chat 04 gebaut hat (Landkarte)

| Datei | Zweck |
| --- | --- |
| `apps/server/src/telemetry.ts` | Pickraten, Lebensdauer, K/D, Tick-Gesundheit, `/metrics` |
| `apps/server/src/persistence.ts` | Supabase: Runs, Profile, Achievements, `/leaderboard`, `/profile` |
| `apps/server/src/auth.ts` | Supabase-JWT-Prüfung ohne Netzwerk-Roundtrip je Join |
| `apps/server/src/shutdown.ts` | SIGTERM, Close-Code 1001, `beforeClose`-Hook |
| `apps/server/src/rate-limits.ts` | Limits je IP und Verbindung, `abuse`-Zähler |
| `scripts/loadtest.mjs` | N simulierte Clients, Join-Erfolg, Snapshot-Latenz |
| `supabase/migrations/*` | `runs`, `profiles`, `achievements`, `profile_stats` |
| `docs/TELEMETRY.md`, `docs/SUPABASE.md`, `docs/DEPLOYMENT.md` | Betriebsdoku |

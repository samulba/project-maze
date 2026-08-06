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
| [16](./16-ladezeit-vorkomprimiert.md) | Client vorkomprimiert ausliefern – 926 KB → 218 KB über die Leitung | `claude/chat-04-infra-betrieb-ihx0xz` | `PLATZ16` | 745 ✔ | **offen** |
| [15](./15-r5-perf-kette-und-auswertung.md) | R5: Perf-Kette end-to-end belegt, `npm run perf:live`, `client` im JSON-Export | `claude/chat-04-infra-betrieb-ihx0xz` | `77aff36` | 731 ✔ | **offen** |
| [14](./14-startlevel-fuer-familienbilanzen.md) | `--start-level` im Lasttest – Zulieferung für 02s Familienbilanzen | `claude/chat-04-infra-betrieb-ihx0xz` | `d67ea43` | 713 ✔ | **offen** |
| [13](./13-deploy-wache-projektiltempo.md) | Deploy-Wache mit drei Fällen, Projektiltempo gepaart gemessen | `claude/chat-04-infra-betrieb-ihx0xz` | `b8fd1a1` | 707 ✔ | **offen** |
| [12](./12-momentum-gepaart-gemessen.md) | `--seed` im Lasttest + gepaarter A/B: was Momentum wirklich tut | `claude/chat-04-infra-betrieb-ihx0xz` | `ff9ece7` | 575 ✔ | **offen** |
| [11](./11-deploy-stopp-tier-balance.md) | Deploy-Stopp diagnostiziert + Deploy-Wache, `tier` im Perf-Report, Balance verdichtet | `claude/chat-04-infra-betrieb-ihx0xz` | `3e8b83d` | 570 ✔ | **offen** |
| [10](./10-lastprobe-balance-baseline.md) | Lastprobe-Matrix + Balance-Baseline, Lasttest-Fix | `claude/maze-lastprobe-baseline-dfb335` | `8261c82` | 507 ✔ | gemerged |
| [09](./09-balance-live-auswertung.md) | Balance-Live-Auswertung (`npm run balance:live`) | `claude/maze-balance-live-dfb335` | `263fd5c` | 487 ✔ | gemerged |
| [08](./08-client-perf-telemetrie.md) | Client-Perf-Telemetrie (Server-Seite) + Spec für 03 | `claude/maze-client-perf-telemetry-dfb335` | `69ade20` | 443 ✔ | gemerged |
| [07](./07-profil-backend.md) | Profil-Backend: `POST /profile`, Lieblingsklasse | `claude/maze-profile-backend-dfb335` | `b986baf` | 429 ✔ | gemerged |
| [06](./06-rate-limits.md) | Rate-Limits & Missbrauchsschutz | `claude/maze-rate-limits-abuse-dfb335` | `ea2e4ec` | 389 ✔ | gemerged |
| [05](./05-achievements-persistenz-profil.md) | Achievement-Persistenz + `/profile` | `claude/maze-achievements-persistence-profile-dfb335` | `77fee92` | 309 ✔ | gemerged |
| [04](./04-google-login-server.md) | Google-Login Server-Seite | `claude/maze-auth-google-server-dfb335` | `fc5d107` | 255 ✔ | gemerged |
| [03](./03-supabase-persistenz.md) | Supabase-Persistenz + Leaderboard | `claude/maze-supabase-persistence-dfb335` | `56443bf` | 209 ✔ | gemerged |
| [02](./02-lasttest-tickhealth-shutdown.md) | Lasttest, Tick-Gesundheit, Shutdown | `claude/maze-loadtest-tickhealth-shutdown-dfb335` | `fe41cae` | 108 ✔ | gemerged |
| [01](./01-telemetrie-deployment-ci.md) | Telemetrie, Deployment, CI | `claude/maze-telemetry-deployment-ci-dfb335` | `a8c7b25` | 73 ✔ | gemerged |

## Offene Punkte für die Zentrale

- **Der Live-Deploy hing zwölf Commits zurück.** Diagnose, Entlastung der
  beiden Hauptverdächtigen und zwei Fragen an Sam stehen in Bericht 11. Neu:
  ein CI-Job `deploy-watch`, der einen stillen Deploy-Stopp künftig beim
  ersten Push meldet. **Solange der Deploy steht, wird dieser Job auf `main`
  rot sein – das ist die Meldung, nicht ein Fehler im Code.**
- **Für alle, die Werkzeuge gegen den Server bauen:** Die eigene Spieler-ID
  **immer aus `snapshot.selfId`** lesen, nie aus der `welcome`-Nachricht – die
  trägt weiterhin die UUID, während `SHORT_NET_IDS` die Snapshots durchnummeriert.
  Der ausgelieferte Client ist bereits korrekt (geprüft).
- **Für 02:** Der Projektiltempo-Dämpfer kostet anderthalb Prozentpunkte
  Tickbudget (0,023 ms je Projektil × rund 18 zusätzliche Projektile) – kein
  Kapazitätsproblem. Details in Bericht 10.
- **Für KL5 – die alte Ablesung „Rapid verdoppelt K/D" ist zurückgezogen.**
  Drei Läufe je Konfiguration (Bericht 11) zeigen: Der Unterschied zwischen zwei
  *identisch* konfigurierten Läufen ist so groß wie der behauptete Effekt
  (Control schwankt zwischen K/D 0,43 und 1,23). Schwerer wiegt: Der Aufbau
  „alle Schalter an vs. alle aus" misst die **Serverlast** mit – der
  Tick-Abstand der beiden Konfigurationen überlappt nicht (35,3–36,1 ms gegen
  32,9–33,5 ms), weil das Bündel auch `ACHIEVEMENTS_ENABLED` und
  `SNAPSHOT_DELTAS` umlegt. Signature-Wirkung und Server-Mehrarbeit sind darin
  nicht mehr trennbar. **Für KL5 nur den zu messenden Schalter umlegen** und den
  Tick-Abstand beider Seiten vergleichen, bevor eine K/D-Zahl abgelesen wird.
  Neue Abzüge: `docs/balance/2026-08-06-verdichtung/` (6 Läufe). Die alten
  bleiben als Vorher-Stand liegen. Der Vergleich läuft weiterhin im Modus
  `VERGLEICH`, nicht `ZEITFENSTER` – das ist richtig so.
- **Was Momentum wirklich tut (Bericht 12, nachgereicht).** Mit sauberem Aufbau
  – nur `SIGNATURE_RAPID_ENABLED` wandert, Läufe über `--seed` gepaart,
  Lastkontrolle bestanden – ist **belegt**: Momentum verlängert Rapids
  Lebensdauer um 12–17 %. **Unbelegt bleibt jede Aussage über Rapids K/D**
  (Differenzen −0,03 / +0,63 / +0,92). Für 02 heißt das: Wer die Signature nach
  ihrem K/D-Effekt auslegt, legt sie nach einer Zahl aus, die wir nicht haben.
- **Sichtbar statt messbar (Bericht 16):** `express.static` komprimierte nicht –
  über die Leitung gingen **926 KB statt 218 KB**, obwohl jeder Browser
  `Accept-Encoding: br` mitschickt. Der Compose-Pfad war in Ordnung (nginx
  komprimiert), der Single-Service-Betrieb auf Railway nicht. Behoben durch
  Vorkompression beim Build – bewusst **nicht** per `compression`-Middleware:
  Ein 630-KB-Bundle zur Laufzeit zu gzippen kostet einen ganzen 25-ms-Tick,
  also einen Ruckler für alle in der Arena pro Seitenaufruf.
- **R5 beantwortet, soweit es geht (Bericht 15):** Die Perf-Kette **trägt** –
  end-to-end im echten Browser belegt, zwei Berichte im 60-s-Takt, keiner
  verworfen. Der Verdacht „der Client sendet nicht" trifft nicht zu, es ist
  **kein Befund für 03**. Was wie ein Defekt aussah, sind 120 s Vorlauf bis zum
  ersten Bericht plus Zähler, die jeder Deploy auf null setzt.
  **Die Messlatte bleibt `UNBEANTWORTET`** – es liegen schlicht noch keine
  Berichte von einem Altgerät vor. Entscheidung für 03: Aufwärmphase kürzen
  und/oder beim Verlassen der Seite senden (`keepalive` ist schon gesetzt);
  sonst bleibt die Ausbeute dauerhaft winzig.
- **Neu im Werkzeug: `npm run perf:live`** – wertet die Client-Perf-Berichte
  gegen die MASTERPLAN-Messlatte aus, getrennt nach Geräteklasse, Renderpfad
  und Qualitätsstufe. Drei Ausgänge; **`UNBEANTWORTET` ist kein Bestehen**.
- **Neu im Werkzeug: `npm run loadtest -- --start-level <n>`** (Bericht 14, auf
  02s Bitte). Hebt die Clients auf ein Level, auf dem die Familienklassen
  offenstehen – 70 statt 8 Klassenwahlen im selben 60-s-Fenster. Braucht
  `ENABLE_DEV_TOOLS=true` am Server; **vor der Auswertung `startLevel.reached`
  prüfen**, sonst ist der Abzug wertlos. Für Kapazitätsmessungen gehört die
  Option aus.
- **Neu im Werkzeug: `npm run loadtest -- --seed <n>`.** Feste Klassen- und
  Upgradewahl der simulierten Clients, damit zwei Läufe paarweise vergleichbar
  sind. Macht den Lauf *nicht* reproduzierbar – Netzwerk-Timing und Server-Zufall
  bleiben unberührt.
- **Paket 08 ist vollständig erledigt** – Server *und* Client sind gemerged,
  der Client sendet Perf-Berichte. Der Punkt „wartet auf Review" war veraltet.
- **Für 03, letzter Schritt beim Perf-Report:** Der Server nimmt seit Bericht 11
  das Feld `tier` (`high` · `mid` · `low`) neben `quality` entgegen. Im Client
  fehlt dafür genau eine Zeile in `perf-metrics.ts` (Quelle:
  `renderer.qualityTier`). Mit *und* ohne Feld gültig – nichts geht kaputt,
  wenn 03 später nachzieht.
- Aus Paket 07, weiterhin für 03: `GET /profile/:userId` liefert
  `stats.favoriteClass` / `favoriteClassRuns` / `favoriteClassSeconds`, und
  `POST /profile` ändert den Anzeigenamen (Token im `Authorization`-Header,
  Antwort `202` darf optimistisch übernommen werden).

## Offene Punkte für Sam (Betrieb)

Gesammelt aus allen Berichten – erledigte Punkte werden gestrichen, nicht
gelöscht.

- [x] Migration `0004_profile_favorite_class.sql` eingespielt (Paket 07,
      bestätigt 2026-08-05)
- [ ] Nach dem Merge von Paket 06: `mazers.de/health` → `abuse`-Block prüfen.
      Steigt `rejectedConnections` ohne Angriff, sitzen echte Spieler hinter
      einem Mobilfunk-NAT → `RATE_LIMIT_CONNECTIONS_PER_IP` erhöhen
- [ ] `TRUST_PROXY_HOPS=1` passt für Railway; bei einem zusätzlichen Proxy
      davor auf `2` setzen, sonst landet die Proxy-IP im Limit-Topf

> Migrationen liegen seit `a7a213a` unter `supabase/migrations/` mit der
> Ablage-Konvention von 01: noch offene direkt im Ordner, eingespielte in
> `applied/`. Stand: `0001`–`0004` eingespielt.

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
| `SIGNATURE_RAPID_ENABLED`, `SIGNATURE_IMPACT_ENABLED` | aus | 11 (nachdokumentiert) |

## Was Chat 04 gebaut hat (Landkarte)

| Datei | Zweck |
| --- | --- |
| `apps/server/src/telemetry.ts` | Pickraten, Lebensdauer, K/D, Tick-Gesundheit, `/metrics` |
| `apps/server/src/persistence.ts` | Supabase: Runs, Profile, Achievements, `/leaderboard`, `/profile` |
| `apps/server/src/auth.ts` | Supabase-JWT-Prüfung ohne Netzwerk-Roundtrip je Join |
| `apps/server/src/shutdown.ts` | SIGTERM, Close-Code 1001, `beforeClose`-Hook |
| `apps/server/src/rate-limits.ts` | Limits je IP und Verbindung, `abuse`-Zähler |
| `apps/server/src/client-metrics.ts` | anonyme FPS-/Geräteberichte, `POST /client-metrics` |
| `scripts/loadtest.mjs` | N simulierte Clients, Join-Erfolg, Snapshot-Latenz |
| `scripts/deploy-watch.mjs` | prüft nach dem Push, ob der Stand live ankommt |
| `scripts/balance-live.mjs` | Live-Balance aus `/metrics`: Tabellen, Watchlist, Zeitvergleich |
| `docs/balance/*.json` | eingefrorene Vorher-Stände für Balance-Runden |
| `supabase/migrations/*` | `runs`, `profiles`, `achievements`, `profile_stats` |
| `docs/TELEMETRY.md`, `docs/SUPABASE.md`, `docs/DEPLOYMENT.md` | Betriebsdoku |

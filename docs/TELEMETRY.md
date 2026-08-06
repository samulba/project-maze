# Project Maze – Anonyme Server-Telemetrie

Der Balance-Masterplan führt „reale Online-Telemetrie" und „datenbasierte
Feinbalance" unter *Bewusst noch offen*. Dieses Modul schließt die erste Hälfte:
Der Server misst im laufenden Betrieb, was der Balance-Report nur rechnerisch
schätzen kann – welche Klassen, Module und Frames tatsächlich gewählt werden,
wie lange man damit überlebt und wie sich das in Kills und Deaths niederschlägt.

## Einordnung

`apps/server/src/telemetry.ts` ist eine eigene Tuning-Schicht nach dem Muster
`tuneX(game)` und wird in `apps/server/src/index.ts` als **äußerste** Schicht
angehängt:

```ts
const game = tuneTelemetry(tuneDebugRules(tuneArenaSystems(/* … */)));
```

Die Schicht verändert keine einzige Spielregel. Sie beobachtet ausschließlich –
Klassenwahl, Loadout-Wechsel, Lebensdauer und Kills/Deaths – und lässt jeden
Aufruf unverändert an die darunterliegende Schicht durch. Sie sitzt außen,
damit sie das *Ergebnis* aller Balance-Schichten misst, nicht deren Zwischenstand.

## Was gemessen wird

| Kennzahl | Erhebung |
| --- | --- |
| **Pickrate Klasse** | Jeder erfolgreiche `chooseClass`-Aufruf. Der Start als `core` und die Rückstufung beim Respawn zählen nicht – nur bewusste Entscheidungen im Klassenbaum. |
| **Pickrate Modul / Frame** | Erste beobachtete Ausrüstung eines Tanks plus jeder spätere Wechsel. |
| **Lebensdauer** | Zeit von der Wiedergeburt bis zum Tod, zugeordnet zur Klasse *im Moment des Todes*. Erfasst werden nur abgeschlossene Leben; wer die Arena lebend verlässt, fällt heraus, statt die Durchschnitte zu verfälschen. |
| **Kills / Deaths** | Je Klasse, Core Module und passivem Frame – für Angreifer und Opfer getrennt, mit dem Zustand *vor* dem Tod. |

Jede Kennzahl trägt ein `subject`-Label (`human` oder `bot`), damit
Bot-Statistiken die Auswertung echter Spieler nicht überdecken. Für
Balance-Fragen ist fast immer `subject="human"` gemeint.

### Loadout-Ledger

Modul und Frame eines Tanks sind nur über die Snapshot-API sichtbar. Die
Telemetrie liest sie auf zwei Wegen:

1. **Kostenlos** aus jedem Snapshot, der ohnehin an einen Client geht.
2. **Round-Robin** – alle 250 ms erhebt die Schicht genau einen Spieler über
   dieselbe öffentliche API. Dadurch bleiben auch Bot-gegen-Bot-Duelle in einer
   leeren Arena vollständig zugeordnet.

Die dabei verwendeten Spieler-IDs stehen ausschließlich im Arbeitsspeicher, um
Wechsel zu erkennen. Sie werden nie exportiert und beim Verlassen der Arena
sofort gelöscht.

## Anonymität

Exportiert werden nur Aggregate über die festen Bezeichner der Klassen, Module
und Frames. Nicht erhoben und nicht exportiert werden:

- Spielernamen, Spieler-IDs, IP-Adressen, User-Agents
- Zeitpunkte oder Verläufe einzelner Personen
- irgendetwas, das eine einzelne Sitzung wiedererkennbar macht

Ein Regressionstest (`telemetry.test.ts`) prüft, dass weder der JSON-Bericht
noch die Prometheus-Ausgabe einen Spielernamen oder eine Spieler-ID enthält.

## `/metrics`

| Aufruf | Ergebnis |
| --- | --- |
| `GET /metrics` | Prometheus-Textformat, alle Subjekte |
| `GET /metrics?format=json` | aggregierter JSON-Bericht inklusive fertig berechneter Pickraten |
| `GET /metrics?format=json&subject=human` | derselbe Bericht, nur echte Spieler |

Ist `METRICS_TOKEN` gesetzt, verlangt der Endpoint
`Authorization: Bearer <token>` und antwortet sonst mit `401`. Bei
`TELEMETRY_ENABLED=false` antwortet er mit `404`, und die Schicht wird gar nicht
erst angehängt.

### Metriken

```text
maze_build_info{mode,version,telemetry}      Gauge   statische Serverkennung
maze_uptime_seconds                          Gauge   Laufzeit der Erfassung
maze_players{subject}                        Gauge   aktuelle Tanks
maze_entities{kind}                          Gauge   Projektile, Drohnen, Formen …

maze_class_picks_total{class,subject}        Counter Pickrate Klassenbaum
maze_module_picks_total{module,subject}      Counter Pickrate Core Modules
maze_frame_picks_total{frame,subject}        Counter Pickrate passive Frames

maze_class_kills_total{class,subject}        Counter Kills je Klasse
maze_class_deaths_total{class,subject}       Counter Deaths je Klasse
maze_module_kills_total{module,subject}      Counter Kills je Modul
maze_module_deaths_total{module,subject}     Counter Deaths je Modul
maze_frame_kills_total{frame,subject}        Counter Kills je Frame
maze_frame_deaths_total{frame,subject}       Counter Deaths je Frame

maze_lives_total{class,subject}              Counter abgeschlossene Leben
maze_life_seconds_total{class,subject}       Counter summierte Lebensdauer
maze_life_seconds_max{class,subject}         Gauge   längstes Leben
maze_module_lives_total{module,subject}      Counter abgeschlossene Leben je Modul
maze_module_life_seconds_total{module,…}     Counter summierte Lebensdauer je Modul
maze_module_life_seconds_max{module,…}       Gauge   längstes Leben je Modul
maze_frame_lives_total{frame,subject}        Counter abgeschlossene Leben je Frame
maze_frame_life_seconds_total{frame,…}       Counter summierte Lebensdauer je Frame
maze_frame_life_seconds_max{frame,…}         Gauge   längstes Leben je Frame

maze_tick_duration_seconds{quantile}         Gauge   p50/p95 der Simulation (60-s-Fenster)
maze_tick_duration_seconds_max               Gauge   langsamster Tick im Fenster
maze_tick_interval_seconds{quantile}         Gauge   p95 des Abstands zweier Ticks
maze_tick_interval_seconds_max               Gauge   größter Tick-Abstand im Fenster
maze_tick_budget_seconds                     Gauge   Zeitbudget eines Ticks (1/Tickrate)
maze_tick_budget_ratio                       Gauge   p95 Dauer / Budget
maze_tick_busy_ratio                         Gauge   mittlere Auslastung des Budgets
maze_tick_window_samples                     Gauge   Messwerte im Fenster
maze_ticks_total                             Counter simulierte Ticks
maze_tick_overruns_total                     Counter Ticks über Budget
```

Serien ohne Messwert werden weggelassen – frisch gestartete Server liefern eine
kurze Antwort statt 29 × 2 Nullzeilen.

Modul und Frame erben die Lebensdauer vom Loadout **im Moment des Todes** –
genauso, wie es die Deaths schon immer tun. Wer mitten im Leben das Modul
wechselt, schreibt die ganze Lebensspanne dem zuletzt getragenen zu.

### JSON-Bericht

`?format=json` liefert dieselben Zahlen als fertigen Bericht. Jeder Eintrag
unter `classes`, `modules` und `frames` trägt neben `picks`, `pickRate`,
`kills`, `deaths` und `killsPerDeath` auch:

| Feld | Bedeutung |
| --- | --- |
| `lives` | abgeschlossene Leben |
| `lifetimeSeconds` | **exakte** Summe aller Lebensspannen – die Basis jeder Aggregation |
| `averageLifetimeSeconds` | mittlere Lebensdauer |
| `longestLifetimeSeconds` | längstes Leben |
| `killsPerMinute` | Kills je gelebter Minute |

Klasseneinträge tragen zusätzlich `tier` und `branch` (`core`, `rapid`,
`precision`, `control`, `impact`). Damit kann eine Auswertung nach Familien
gruppieren, ohne den Klassenkatalog zu kennen – wichtig, wenn sie gegen eine
Instanz läuft, deren Stand von der eigenen Arbeitskopie abweicht.

`telemetryVersion` zählt die Struktur des Berichts mit: **v3** ist der erste
Stand mit `branch`, `lifetimeSeconds`, `killsPerMinute` und den Lebensdauern je
Modul und Frame.

## Balance-Runde fahren in 5 Minuten

`npm run balance` rechnet die Klassen auf dem Papier durch. `npm run balance:live`
holt daneben, was in der echten Arena passiert ist – dieselben Klassen, aber mit
Pickrate, K/D, mittlerer Lebensdauer und Kills/Minute aus dem laufenden Betrieb,
zusätzlich je Familie und je Core Module / Frame.

### Minute 1 – Abzug holen

```bash
npm run balance:live -- --url https://mazers.de
```

Ist `/metrics` mit einem Token geschützt, kommt es aus `METRICS_TOKEN` (ENV) oder
`--token <token>`; die URL selbst geht auch über `METRICS_URL`. Ohne Schema wird
`https` angenommen, nur lokale Adressen bleiben `http` – ein Token soll nicht
versehentlich im Klartext rausgehen. Das Skript braucht nichts weiter: keinen
gebauten Workspace, keine Datenbank, keinen Klassenkatalog. Familie, Tier und
Beschriftungen kommen aus dem Export, deshalb stimmt die Auswertung auch gegen
eine Instanz, die einen anderen Stand fährt als die eigene Arbeitskopie.

Voreingestellt ist `subject=human` – Bots sollen die Balance-Sicht nicht
verwässern. `--subject all` oder `--subject bot` zeigt die andere Seite.

### Minute 2 – Watchlist lesen

Unter jeder Tabelle steht die **Watchlist**: alles, was mehr als das 1,5-fache
oder weniger als das 0,67-fache seines Vergleichsmedians erreicht.

```text
WATCHLIST

  ▼ Standard Frame   Kills/min        0.50  gegen      1.75  ×0.29  (Gruppen-Median)
  ▲ Precision        K/D              2.20  gegen      0.67  ×3.30  (Gruppen-Median)
  ▲ Dash             Pickrate       61.5 %  gegen    23.1 %  ×2.67  (Gruppen-Median)
```

Drei Dinge sind dabei absichtlich so gebaut:

- **Klassen vergleichen sich mit ihrer Familie**, nicht mit dem ganzen Feld –
  ein Impact-Tank soll nicht daran gemessen werden, dass Rapid mehr Kills macht.
  `--peer tier` schaltet auf den Vergleich innerhalb derselben Stufe um; das ist
  die ehrlichere Frage, wenn ein Tier-3-Endpfad auffällig aussieht, weil in
  seiner Familie auch die schwächeren Vorstufen im Median hängen.
- **Dünne Stichproben werden mit `·` markiert statt bewertet.** Wer die
  Mindest-Stichprobe (`--min-samples`, Default 5) nicht erreicht, geht weder in
  den Median ein noch auf die Watchlist. Ebenso braucht eine Vergleichsgruppe
  mindestens drei taugliche Zeilen, sonst ist ihr Median Zufall und kein Maß.
- **Jede Kennzahl hat ihre eigene Stichprobe**: Pickrate zählt Picks, K/D zählt
  Deaths, Lebensdauer und Kills/Minute zählen abgeschlossene Leben.

Grenzen verstellbar über `--outlier-high` / `--outlier-low`, sortieren über
`--sort pickRate|killsPerDeath|averageLifetimeSeconds|killsPerMinute|picks|kills|deaths|lives|id`
und `--asc`.

### Minute 3 – Abzug sichern

**Vor** jeder Balance-Änderung einen Abzug wegschreiben:

```bash
npm run balance:live -- --url https://mazers.de --json > docs/balance/2026-08-05-vorher.json
```

Das ist dasselbe JSON, das `--baseline` später erwartet. Es enthält die
Rohzähler, nicht nur die fertigen Quoten – nur so lässt sich hinterher ein
sauberes Zeitfenster rechnen.

### Minute 4 – ändern und laufen lassen

Änderung deployen, die Arena ein paar Stunden laufen lassen. Wichtig: die
Zähler leben im Prozessspeicher und starten bei jedem Deploy bei null. Der
Abzug aus Minute 3 muss also **vor** dem Deploy entstehen, wenn er eine echte
Vorher-Sicht sein soll.

### Minute 5 – Zeitvergleich

```bash
npm run balance:live -- --url https://mazers.de --baseline docs/balance/2026-08-05-vorher.json
```

Sind die Zähler seit dem Abzug nur gewachsen, rechnet das Skript das **reine
Zeitfenster** (`aktuell − Baseline`) und zeigt genau, was *seit* der Änderung
passiert ist – nicht den verwaschenen Gesamtdurchschnitt:

```text
ZEITFENSTER seit 2026-08-05T20:52:07.357Z  (3 h 10 min)

  GRÖSSTE BEWEGUNGEN (Pickrate)

  Klasse           Pickrate         Δ    K/D       Δ  ⌀ Leben        Δ  K/min       Δ
  ───────────────────────────────────────────────────────────────────────────────────
  Rapid              12.5 %  −30.4 pp   0.00   −1.00   40.5 s  +40.5 s   0.00   +0.00
  Controller         25.0 %  +10.7 pp   1.00   +0.00  106.1 s +106.1 s   0.57   +0.57
```

Ist ein Zähler unterwegs kleiner geworden – oder die Laufzeit gesunken –, wurde
der Server zwischendurch neu gestartet. Dann ist kein Fenster rekonstruierbar,
und das Skript sagt das ausdrücklich, statt zwei unvergleichbare Stände
nebeneinanderzustellen:

```text
VERGLEICH mit 2026-08-05T18:00:00.000Z

  ! Die Zähler sind seit dem Abzug nicht durchgehend gewachsen – der Server
    wurde zwischendurch neu gestartet.
```

Zeilen, die sich im Fenster nicht bewegt haben, werden ausgeblendet (`--all`
zeigt alle), und `--top` steuert die Länge der Bewegungsliste.

### Was am Ende in die Balance-Runde geht

Die Watchlist ist der Vorschlag, nicht das Urteil. Ein `▲` heißt „das fällt
statistisch aus der Familie", nicht „das ist zu stark": Eine hohe Pickrate kann
auch heißen, dass die Klasse früh im Baum liegt, und eine hohe Lebensdauer, dass
niemand sie angreift. Der Abgleich mit `npm run balance` – der rechnerischen
Sicht auf dieselben Klassen – trennt beides: Ein Fund, den beide Seiten zeigen,
ist ein Balance-Problem; einer, den nur die Live-Zahlen zeigen, ist meistens
eine Frage der Spielweise.

## Tick-Gesundheit – die Kapazitätskennzahl

Die Simulation läuft mit 40 Hz, ein Tick hat also **25 ms Budget**. Die
Telemetrie misst jeden `game.step` mit `performance.now()` und hält die Werte
in einem gleitenden 60-Sekunden-Fenster. Daran – und nicht an der CPU-Auslastung
des Containers – liest man ab, wie viele Spieler eine Instanz trägt.

Zwei Kennzahlen, die zusammengehören:

- **`maze_tick_duration_seconds`** – wie lange die Simulation selbst braucht.
  Skaliert mit Spielern, Projektilen und Drohnen. `maze_tick_budget_ratio`
  (p95 ÷ Budget) fasst das in eine Zahl: **unter 1.0 bleibt der Tick im
  Zeitplan**, ab 1.0 rutscht die Arena in Zeitlupe.
- **`maze_tick_interval_seconds`** – der tatsächliche Abstand zwischen zwei
  Ticks. Soll ebenfalls 25 ms. Läuft dieser Wert davon, während die *Dauer*
  klein bleibt, ist nicht die Simulation das Problem, sondern etwas anderes im
  selben Prozess – in der Praxis fast immer der Snapshot-Versand
  (`JSON.stringify` je Client und Snapshot) oder die Garbage Collection.

Gemessen wird bewusst nur die Simulation, nicht die Telemetrie-Buchhaltung
darunter: sonst würde die Loadout-Erhebung alle 250 ms das p95 verzerren.

Referenzmessung auf einem Entwicklungsrechner (8 Bots, Lasttest-Clients auf
derselben Maschine, daher pessimistisch):

| Spieler | p50 Dauer | p95 Dauer | budgetRatio | p95 Abstand | Stand |
| --- | --- | --- | --- | --- | --- |
| 25 | 1,3 ms | 2,7 ms | 0,11 | 26 ms | 2026-08-05 |
| 40 (Arena voll) | 1,9 ms | 4,7 ms | 0,19 | 34 ms | 2026-08-05 |
| 40 (Arena voll) | 1,8 ms | 2,6 ms | 0,10 | 27 ms | 2026-08-06, 4 Kerne |

Die Lehre daraus gilt unverändert: Die Simulation ist bei voller Arena nicht
das Problem – nach der Messung vom 06. August ist sie zu einem Zehntel
ausgelastet. Die Grenze setzt der Snapshot-Versand, sichtbar daran, dass der
Tick-*Abstand* über dem 25-ms-Soll liegt. Der Abstand ist gegenüber August
deutlich näher ans Soll gerückt (27 statt 34 ms), sitzt aber weiterhin über der
Simulationsdauer. Wer mehr Spieler pro Instanz will, optimiert also zuerst den
Snapshot-Pfad, nicht die Physik.

Die beiden Zeilen vom 05. und 06. August stammen von **verschiedenen
Maschinen** – die CPU-Zahlen sind deshalb nicht direkt vergleichbar. Was sich
vergleichen lässt, ist die Bandbreite (Bytes sind maschinenunabhängig), und die
stimmt zwischen beiden Messungen auf unter ein Prozent überein. Der vollständige
Vergleich steht unten unter [Lastprobe-Matrix](#lastprobe-matrix-reproduzierbar-fahren).

Passende Alarme:

```promql
maze_tick_budget_ratio > 0.8                       # Simulation läuft voll
maze_tick_interval_seconds{quantile="0.95"} > 0.04 # Prozess kommt nicht hinterher
rate(maze_tick_overruns_total[5m]) > 1
```

Gegenprobe mit echter Last: `npm run loadtest -- --url <ws-url> --clients 40`
(siehe [`DEPLOYMENT.md`](./DEPLOYMENT.md#lasttest)).

## Lastprobe-Matrix reproduzierbar fahren

Ein einzelner Lastlauf beantwortet nichts. „Tick p95 = 2,4 ms" ist ohne einen
zweiten Lauf daneben keine Aussage – erst der Vergleich zeigt, was ein Schalter
kostet. Deshalb wird die Kapazität als **Matrix** gemessen: dieselbe Last, ein
Durchgang je Schalterstellung, mehrfach wiederholt.

### Aufbau

Ein frischer Server je Durchgang, danach 40 Clients über 60 Sekunden:

```bash
npm run build -w @project-maze/shared && npm run build -w @project-maze/server

PORT=2610 BOT_COUNT=8 TELEMETRY_ENABLED=true ENABLE_DEV_TOOLS=false \
RATE_LIMITS_ENABLED=true RATE_LIMIT_CONNECTIONS_PER_IP=200 RATE_LIMIT_JOINS_PER_MINUTE=400 \
SNAPSHOT_DELTAS=true SHORT_NET_IDS=true ACHIEVEMENTS_ENABLED=true \
SPECTATOR_ENABLED=true SIGNATURE_RAPID_ENABLED=true \
node apps/server/dist/index.js &

sleep 12                                    # Vorlauf: Bots kämpfen, Projektile pendeln sich ein
node scripts/loadtest.mjs --url ws://127.0.0.1:2610 --clients 40 --duration 60 --json > lauf.json
curl -s 'http://127.0.0.1:2610/metrics?format=json&subject=all' > metriken.json   # SOFORT danach
curl -s http://127.0.0.1:2610/health > health.json
kill %1
```

Vier Dinge daran sind nicht optional:

1. **`RATE_LIMIT_CONNECTIONS_PER_IP` hochsetzen.** 40 Clients auf einem Host
   teilen sich `127.0.0.1`. Mit dem Produktionswert 5 misst der Lauf den
   Rate-Limiter, nicht die Arena. Die *Nachrichten*budgets (Input 50/s) bleiben
   unangetastet – die sollen ja mitgemessen werden.
2. **`/metrics` sofort nach dem Lauf ziehen.** Das Tick-Fenster ist 60 Sekunden
   lang und wandert weiter; eine Minute später steht dort die Leerlaufphase.
3. **Vorlauf abwarten.** Direkt nach dem Start ist die Arena leer und die
   Projektilzahl niedrig – die ersten Sekunden würden den Schnitt beschönigen.
4. **`/health` mitschreiben, nicht nur am Ende lesen.** Die Zahl der Projektile
   und Drohnen schwankt stark; ein Endstand allein sagt nichts. Ein Abgriff pro
   Sekunde reicht.

### Was „volle Arena" heißt

`GAME.maxPlayers = 40` begrenzt die **Menschen**; die Bots des Arena-Direktors
kommen obendrauf. Bei 40 Clients joinen alle 40, der Direktor fährt die
Bot-Population auf ihr Minimum herunter, und in der Arena stehen rund **44
Tanks**. „Arena voll" heißt also 44 simulierte Einheiten, nicht 40.

### Rauschen

Die simulierten Clients wählen Klassen und Upgrades zufällig. Landen sie auf
Drohnenklassen, laufen zweistellig mehr Entitäten mit – zwischen zwei sonst
identischen Läufen schwankte die mittlere Drohnenzahl um mehr als das Doppelte
(4,4 bis 12,4). Ein einzelner Lauf je Konfiguration ist deshalb wertlos.

**Drei Runden fahren, im Wechsel A–B–C–D, A–B–C–D, A–B–C–D**, und Median plus
Spannweite berichten. Blockweise (dreimal A, dann dreimal B) wäre falsch: driftet
die Maschine, verschiebt sie ganze Konfigurationen gegeneinander.

### Referenzwerte 2026-08-06

Median aus drei Runden, 40 Clients, 60 s, 4-Kern-Maschine, Lasttest-Clients auf
derselben Maschine (daher pessimistisch). In Klammern die Spannweite über die
drei Runden.

| Lauf | Schalter | p50 | p95 | budgetRatio | Abstand p95 | KB/s je Client | Projektile ⌀ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **A** Referenz | keiner | 1,80 ms | 2,57 ms (2,26–2,77) | 0,103 | 26,7 ms | 230,8 (223,5–239,6) | 71 |
| **B** Bandbreite | `SNAPSHOT_DELTAS`, `SHORT_NET_IDS` | 1,81 ms | 2,66 ms (2,55–2,71) | 0,106 | 28,1 ms | 123,6 (121,5–127,2) | 65 |
| **C** Signature | `SIGNATURE_RAPID_ENABLED` | 2,10 ms | 2,93 ms (2,75–3,27) | 0,117 | 26,0 ms | 237,6 (228,8–240,0) | 74 |
| **D** Alle an | alle fünf | 1,97 ms | 2,83 ms (2,60–3,07) | 0,113 | 26,8 ms | 129,1 (126,6–133,9) | 70 |

In allen zwölf Läufen: 40 von 40 Joins, keine Abbrüche, **keine einzige
gedrosselte Nachricht**, Snapshot-Latenz p95 = 1 ms, Snapshot-Rate 30,5–30,6/s
je Client, rund 44 Tanks in der Arena.

Drei Ablesungen:

- **Die Bandbreiten-Schalter halten, was die Messung vom August versprach.**
  231 → 124 KB/s je Client (**−46 %**); die frühere Messung nannte −45 %. Mit
  allen fünf Schaltern sind es 129 KB/s (−44 %) – der Aufschlag gegenüber B geht
  auf Achievements und Spectator, die den Snapshot wieder etwas größer machen.
- **„Alle Schalter an" kostet rund ein Zehntel mehr Tickzeit.** D liegt beim p95
  bei 2,83 ms gegen 2,57 ms bei A. Das sind 11 % des 25-ms-Budgets statt 10 % –
  die Arena trägt die volle Ausstattung mit großem Abstand.
- **Die Signature „Momentum" ist der teuerste einzelne Schalter, aber knapp an
  der Nachweisgrenze.** C liegt in allen drei Runden über A (p95 2,93 gegen
  2,57 ms, Auslastung 0,085 gegen 0,076), die Spannweiten berühren sich nur am
  Rand (A bis 2,77, C ab 2,75). Ein Aufschlag von rund 0,3 ms – gut ein
  Prozentpunkt Budget – ist plausibel, mit drei Runden aber **nicht bewiesen**.
  Er passt zur Wirkung: mehr Feuerrate heißt mehr Projektile (74 gegen 71).

> **Was der Lastlauf hier nicht misst:** Momentum wirkt nur für die
> Rapid-Familie bei vollem Ausschlag. In 60 Sekunden erreichen die simulierten
> Clients diesen Zustand selten – die echte Wirkung gehört im Betrieb gemessen,
> nicht im Lastlauf. Die Zahl oben ist eine Obergrenze für die *Serverlast*,
> keine Aussage über die Spielwirkung.

### Kosten des Projektiltempo-Dämpfers

Der Dämpfer verlängert die Projektil-Lebenszeit im selben Maß, in dem er das
Tempo senkt (`projectileLife = base.projectileLife / speedScale`): Faktor 1,33
für alle Familien außer Precision, dort 1,11. Mehr gleichzeitig fliegende
Projektile heißen mehr Paare in `resolveProjectileCollisions` – die Frage von 02
war, was das kostet.

Abschalten lässt er sich nicht (kein Flag), aber die zwölf Läufe liefern die
Antwort über die Steigung: Tick-Mittel gegen mittlere Projektilzahl, kleinste
Quadrate, **0,023 ms je Projektil** (r = 0,70).

| | Projektile ⌀ | Tick-Mittel | Anteil am 25-ms-Budget |
| --- | --- | --- | --- |
| gemessen (mit Dämpfer) | 70,5 | – | – |
| rechnerisch ohne Dämpfer | 52,9 | −0,40 ms | −1,6 %-Punkte |

**Der Dämpfer kostet rund anderthalb Prozentpunkte Tickbudget** – bei einer
Auslastung von 8 % im Mittel und 10–12 % im p95. Das ist messbar und
unkritisch. Zur Einordnung: Bei 0,023 ms je Projektil wäre das Tickbudget erst
bei über tausend gleichzeitigen Projektilen erschöpft; beobachtet wurden im
Spitzenwert 114.

Die Steigung gilt nur im gemessenen Bereich (60–80 Projektile im Mittel) und
mischt zwangsläufig den Einfluss der Drohnen mit ein, die mit den Projektilen
zusammen schwanken – das drückt sich in r = 0,70 aus. Wer eine saubere Zahl
will, braucht ein temporäres Flag am Dämpfer und einen A/B-Lauf; für die
Kapazitätsfrage reicht diese Schranke.

### Warum der Lasttest die Schalter mitspielen muss

Die erste Runde dieser Matrix lieferte für B und D deutlich *bessere* Werte als
für A und C – bis der Blick auf `classChoicesSent` das erklärte: **null**
Klassenwahlen und **null** Upgrades in allen sechs Läufen mit
`SHORT_NET_IDS=true`, gegen 15–21 und rund 430 ohne.

Die Ursache liegt nicht im Server, sondern in der Übertragungsebene und einem
Lasttest, der sie ignorierte:

- **`SHORT_NET_IDS` nummeriert alle Entitäts-IDs durch – auch `snapshot.selfId`.
  Die `welcome`-Nachricht trägt weiterhin die UUID.** Wer seine eigene ID aus
  dem Welcome behält und im Snapshot danach sucht, findet sich nie wieder:
  keine Level, keine Upgrades, keine Klassenwahl, kein Respawn nach dem Tod.
- **`SNAPSHOT_DELTAS` lässt Name, Klasse, Bot-Flag und Upgrades weg, solange sie
  unverändert sind.** Fehlende Felder heißen „unverändert", nicht „leer".

Der ausgelieferte Client macht beides richtig (`snapshot-hydrator.ts` puffert
die Statik, `renderer.ts` und `ui.ts` lesen `snapshot.selfId`) – der Lasttest
tat es nicht und maß deshalb eine geschönte Last: Level-1-Tanks ohne Upgrades,
die nach dem ersten Tod liegen blieben. Seit `readSelf()` in
`scripts/loadtest.mjs` liest er seine ID aus dem Snapshot und behält fehlende
Felder. **Die Zahlen oben stammen aus der Wiederholung nach dieser Korrektur.**

Die Lehre für jede weitere Messung: Ein Lasttest, der einen Schalter nicht
mitspielt, meldet keinen Fehler – er meldet zu gute Zahlen. Bei jeder neuen
Matrix gehört `classChoicesSent`/`upgradesSent` deshalb mit auf den
Prüfstand; stehen sie bei null, misst der Lauf etwas anderes als gedacht.

## Client-Perf-Telemetrie

Leitplanke Nr. 1 des Masterplans heißt „läuft auf alten PCs". Damit das
messbar wird, schickt der Client höchstens **einmal pro Minute** einen winzigen
anonymen Bericht an `POST /client-metrics`; der Server aggregiert ihn über ein
gleitendes **15-Minuten-Fenster** und exportiert das Ergebnis über `/metrics`.

```json
{ "fpsP50": 60, "fpsP95": 45, "frameHangs": 2, "dpr": 2,
  "viewportW": 1920, "viewportH": 1080,
  "deviceClass": "high", "quality": "webgl", "tier": "mid" }
```

Antwort `204` ohne Inhalt · `400` bei ungültigem Bericht (ohne Begründung –
ein offener Endpunkt ist kein Schema-Orakel) · `404` bei
`TELEMETRY_ENABLED=false` · `429` bei zu vielen Berichten je IP.

**`fpsP95` ist der langsame Rand**, nicht der schnelle: die Bildrate bei der
95-Perzentil-*Framedauer*. Der Wert ist also kleiner als `fpsP50`. Weil sich
nicht erzwingen lässt, wie herum ein Client zählt, nimmt der Server schlicht
den kleineren der beiden Werte als Rand und zählt vertauschte Berichte in
`maze_client_reports_inverted_total` – ein stiller Client-Fehler bleibt so
sichtbar, ohne dass Daten verloren gehen.

**Drei Label-Achsen mit festem Vokabular**, mehr entsteht nie:

| Label | Werte |
| --- | --- |
| `deviceClass` | `low`, `mid`, `high`, `unknown` |
| `quality` | `webgl`, `webgl-kompat`, `webgpu`, `unknown` |
| `tier` | `high`, `mid`, `low`, `unknown` |

`quality` ist der Renderpfad, der im Client tatsächlich hochgekommen ist –
genau die Labels aus `renderer.ts`. **`webgl-kompat` ist der Software-Pfad und
damit exakt der „alte PC"**, um den es geht.

`tier` ist die Qualitätsstufe aus der Automatik des Clients (R4) und eine
**eigene Achse neben `quality`**, kein kombiniertes Label `webgl-mid`. So lässt
sich über Stufen hinweg aggregieren, ohne Labels zerlegen zu müssen – die Frage
„wie schnell läuft WebGL insgesamt" bleibt eine Summe über `tier`.

Das Feld ist **optional**: Clients vor R4 kennen es nicht, und ihre Berichte
bleiben gültig – sie landen unter `tier="unknown"`. Ein Wert außerhalb des
Vokabulars führt **nicht** zu einer `400`, sondern wird auf `unknown`
zurückgebogen und in `maze_client_tier_coerced_total` gezählt. Das ist Absicht:
Eine `400` fällt im Spiel niemandem auf, und ein dauerhaft abgewiesener Client
liefert stillschweigend gar keine Perf-Daten mehr. Ein erfundener Wert kostet
so nur sich selbst statt den ganzen Bericht – und das Zurechtbiegen bleibt am
Zähler sichtbar.

Die drei Achsen sind bei 4 × 4 × 4 = **64 Kombinationen** hart gedeckelt, und
exportiert werden nur die, die im Fenster tatsächlich belegt sind. Die 64 ist
die Obergrenze, nicht der Normalfall: Ein manipulierter Client kann keine neuen
Labelwerte erfinden, weil jeder Wert unmittelbar vor der Ausgabe noch einmal
gegen seine Whitelist gehalten wird.

### Metriken

```text
maze_client_fps_p50{deviceClass,quality,tier}           Gauge   Bildrate bei mittlerer Framedauer
maze_client_fps_p95{deviceClass,quality,tier}           Gauge   Bildrate am langsamen Rand
maze_client_fps_worst{deviceClass,quality,tier}         Gauge   schlechtester Randwert im Fenster
maze_client_frame_hangs{deviceClass,quality,tier}       Gauge   Frames über 100 ms je Bericht (Median)
maze_client_low_fps_ratio{deviceClass,quality,tier}     Gauge   Anteil der Berichte unter 30 fps am Rand
maze_client_dpr{deviceClass,quality,tier}               Gauge   Pixelverhältnis (Median)
maze_client_megapixels{deviceClass,quality,tier}        Gauge   Sichtfläche (Median)
maze_client_bucket_samples{deviceClass,quality,tier}    Gauge   Berichte je Kombination im Fenster
maze_client_window_samples                              Gauge   Berichte im Fenster insgesamt
maze_client_reports_total{deviceClass,quality,tier}     Counter angenommene Berichte
maze_client_frame_hangs_total{deviceClass,quality,tier} Counter summierte Hänger
maze_client_reports_rejected_total{reason}              Counter verworfene Berichte
maze_client_reports_inverted_total                      Counter Berichte mit vertauschten Perzentilen
maze_client_tier_coerced_total                          Counter Berichte mit unbekannter Qualitätsstufe
```

Die eine Zahl, auf die es ankommt:

```promql
maze_client_low_fps_ratio{quality="webgl-kompat"}
```

Mit der Stufe daneben wird daraus die eigentlich interessante Frage – ruckelt es
noch, **obwohl** die Automatik schon heruntergeschaltet hat?

```promql
maze_client_low_fps_ratio{quality="webgl-kompat",tier="low"}
```

Steigt sie, ruckelt es auf den schwachen Geräten – unabhängig davon, wie flüssig
es auf dem Entwicklungsrechner aussieht.

### Grenzen

- **Die Quelle ist nicht vertrauenswürdig.** Die Route ist offen und ohne
  Token; strikte Validierung, Rate-Limit und ein begrenztes Fenster halten den
  Schaden klein, aber wer die Zahlen bewusst verfälschen will, kann das. Für
  „wie viele Leute rendern in Software" taugen sie, für Abrechnung oder
  Balance-Entscheidungen nicht.
- Es werden **keine IDs, keine IP-Adressen und keine Einzelberichte**
  gespeichert – nur die Aggregation im Arbeitsspeicher, die bei jedem Deploy
  bei null startet.
- `p50` und `p95` sind Mediane **über die gemeldeten Perzentile**, nicht über
  einzelne Frames. Der Server sieht nie einen einzelnen Frame.

## Auswertung

Pickrate echter Spieler je Klasse:

```promql
sum by (class) (rate(maze_class_picks_total{subject="human"}[6h]))
  / ignoring(class) group_left sum(rate(maze_class_picks_total{subject="human"}[6h]))
```

Durchschnittliche Lebensdauer je Klasse:

```promql
rate(maze_life_seconds_total{subject="human"}[6h])
  / rate(maze_lives_total{subject="human"}[6h])
```

Kill/Death-Verhältnis je Frame:

```promql
rate(maze_frame_kills_total[6h]) / rate(maze_frame_deaths_total[6h])
```

Zusammen mit `npm run balance` – der rechnerischen Sicht auf dieselben Klassen –
lässt sich prüfen, ob die theoretischen Korridore im echten Spiel halten. Eine
Klasse mit sauberen Report-Werten, aber halbierter Lebensdauer und einstelliger
Pickrate ist ein Balance-Fund, den kein Testlauf liefert.

Wer kein Prometheus davorstehen hat, bekommt dieselbe Auswertung fertig
gerechnet über `npm run balance:live` – siehe
[Balance-Runde fahren in 5 Minuten](#balance-runde-fahren-in-5-minuten).

## Grenzen

- Alle Zähler leben im Prozessspeicher und starten bei jedem Deploy bei null.
  Für Verläufe gehört ein Prometheus davor.
- Ein Server ist eine Arena. Mehrere Instanzen werden über das
  `instance`-Label des Scrapers unterschieden, nicht vom Server selbst.
- Leben, die durch Verlassen der Arena enden, zählen nicht als Lebensdauer.
  Bei sehr kurzen Sitzungen ist der Mittelwert daher leicht optimistisch.

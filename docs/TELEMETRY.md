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

| Spieler | p50 Dauer | p95 Dauer | budgetRatio | p95 Abstand |
| --- | --- | --- | --- | --- |
| 25 | 1,3 ms | 2,7 ms | 0,11 | 26 ms |
| 40 (Arena voll) | 1,9 ms | 4,7 ms | 0,19 | 34 ms |

Die Lehre daraus: Die Simulation ist bei voller Arena erst zu einem Fünftel
ausgelastet – die Grenze setzt der Snapshot-Versand, sichtbar am Abstand von
34 ms statt 25 ms. Wer mehr Spieler pro Instanz will, optimiert also zuerst
den Snapshot-Pfad, nicht die Physik.

Passende Alarme:

```promql
maze_tick_budget_ratio > 0.8                       # Simulation läuft voll
maze_tick_interval_seconds{quantile="0.95"} > 0.04 # Prozess kommt nicht hinterher
rate(maze_tick_overruns_total[5m]) > 1
```

Gegenprobe mit echter Last: `npm run loadtest -- --url <ws-url> --clients 40`
(siehe [`DEPLOYMENT.md`](./DEPLOYMENT.md#lasttest)).

## Client-Perf-Telemetrie

Leitplanke Nr. 1 des Masterplans heißt „läuft auf alten PCs". Damit das
messbar wird, schickt der Client höchstens **einmal pro Minute** einen winzigen
anonymen Bericht an `POST /client-metrics`; der Server aggregiert ihn über ein
gleitendes **15-Minuten-Fenster** und exportiert das Ergebnis über `/metrics`.

```json
{ "fpsP50": 60, "fpsP95": 45, "frameHangs": 2, "dpr": 2,
  "viewportW": 1920, "viewportH": 1080,
  "deviceClass": "high", "quality": "webgl" }
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

**Zwei Label-Achsen mit festem Vokabular**, mehr entsteht nie:

| Label | Werte |
| --- | --- |
| `deviceClass` | `low`, `mid`, `high`, `unknown` |
| `quality` | `webgl`, `webgl-kompat`, `webgpu`, `unknown` |

`quality` ist der Renderpfad, der im Client tatsächlich hochgekommen ist –
genau die Labels aus `renderer.ts`. **`webgl-kompat` ist der Software-Pfad und
damit exakt der „alte PC"**, um den es geht.

### Metriken

```text
maze_client_fps_p50{deviceClass,quality}           Gauge   Bildrate bei mittlerer Framedauer
maze_client_fps_p95{deviceClass,quality}           Gauge   Bildrate am langsamen Rand
maze_client_fps_worst{deviceClass,quality}         Gauge   schlechtester Randwert im Fenster
maze_client_frame_hangs{deviceClass,quality}       Gauge   Frames über 100 ms je Bericht (Median)
maze_client_low_fps_ratio{deviceClass,quality}     Gauge   Anteil der Berichte unter 30 fps am Rand
maze_client_dpr{deviceClass,quality}               Gauge   Pixelverhältnis (Median)
maze_client_megapixels{deviceClass,quality}        Gauge   Sichtfläche (Median)
maze_client_bucket_samples{deviceClass,quality}    Gauge   Berichte je Kombination im Fenster
maze_client_window_samples                         Gauge   Berichte im Fenster insgesamt
maze_client_reports_total{deviceClass,quality}     Counter angenommene Berichte
maze_client_frame_hangs_total{deviceClass,quality} Counter summierte Hänger
maze_client_reports_rejected_total{reason}         Counter verworfene Berichte
maze_client_reports_inverted_total                 Counter Berichte mit vertauschten Perzentilen
```

Die eine Zahl, auf die es ankommt:

```promql
maze_client_low_fps_ratio{quality="webgl-kompat"}
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

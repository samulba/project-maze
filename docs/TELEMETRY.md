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

## Grenzen

- Alle Zähler leben im Prozessspeicher und starten bei jedem Deploy bei null.
  Für Verläufe gehört ein Prometheus davor.
- Ein Server ist eine Arena. Mehrere Instanzen werden über das
  `instance`-Label des Scrapers unterschieden, nicht vom Server selbst.
- Leben, die durch Verlassen der Arena enden, zählen nicht als Lebensdauer.
  Bei sehr kurzen Sitzungen ist der Mittelwert daher leicht optimistisch.

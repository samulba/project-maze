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
```

Serien ohne Messwert werden weggelassen – frisch gestartete Server liefern eine
kurze Antwort statt 29 × 2 Nullzeilen.

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

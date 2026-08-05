# Eingefrorene Balance-Abzüge

Hier liegen Abzüge von `scripts/balance-live.mjs --json` – die Vorher-Stände,
gegen die spätere Balance-Runden gemessen werden.

Ein Abzug enthält ausschließlich Aggregatzahlen über die festen Bezeichner der
Klassen, Module und Frames: Picks, Kills, Deaths, abgeschlossene Leben und
Lebenszeit, jeweils summiert. Keine Namen, keine IDs, keine Adressen, keine
Zeitpunkte einzelner Personen – es ist derselbe anonyme Export, den `/metrics`
öffentlich liefert (siehe [`../TELEMETRY.md`](../TELEMETRY.md#anonymität)).

## Bestand

| Datei | Woher | Konfiguration | Umfang |
| --- | --- | --- | --- |
| `2026-08-06-baseline.json` | lokaler Lastlauf, 40 Clients, 10 min | **alle Schalter an**, inkl. `SIGNATURE_RAPID_ENABLED` | 268 Klassenwahlen, 494 Leben, 452 Kills |
| `2026-08-06-referenz.json` | derselbe Lastlauf-Aufbau | **alle Schalter aus** – Produktionsstand am 2026-08-06 | 256 Klassenwahlen, 477 Leben, 437 Kills |

Beide Läufe folgen dem Rezept aus
[`../TELEMETRY.md`](../TELEMETRY.md#lastprobe-matrix-reproduzierbar-fahren).
Der Unterschied zwischen den beiden Dateien ist genau das, was die Signature
„Momentum" bewegt hat – deshalb steht der Referenzlauf mit hier und nicht nur
der Baseline-Lauf.

### Was die beiden Dateien schon zeigen

Auf Familienebene, gegeneinander gehalten:

| Familie | Leben | K/D | ⌀ Leben | Kills/min |
| --- | --- | --- | --- | --- |
| Core | 242 → 245 | 0,57 → 0,59 | 25,6 → 25,0 s | 1,34 → 1,42 |
| **Rapid** | 66 → 69 | **0,76 → 1,90** | 57,1 → 60,2 s | **0,80 → 1,89** |
| Precision | 67 → 62 | 1,60 → 1,84 | 60,1 → 53,6 s | 1,59 → 2,06 |
| Control | 53 → 58 | 1,60 → 0,38 | 70,0 → 62,2 s | 1,37 → 0,37 |
| Impact | 49 → 60 | 1,16 → 0,67 | 91,6 → 76,2 s | 0,76 → 0,52 |

Rapid – und nur Rapid – ist genau die Familie, auf die Momentum wirkt, und sie
verdoppelt K/D und Kills pro Minute. Die Richtung stimmt also.

**Trotzdem ist das noch keine Messung.** Ein Lauf je Konfiguration, 49 bis 69
abgeschlossene Leben je Familie außerhalb von Core, und die simulierten Clients
spielen zufällig. Dass Control und Impact gleichzeitig einbrechen, kann Folge
eines stärkeren Rapid sein – oder schlicht Streuung. Für eine belastbare Aussage
gehören mehrere Läufe je Konfiguration dazu, so wie bei der Lastprobe-Matrix.

## Wie damit gemessen wird

```bash
# Neue Signature lokal zünden, denselben Lastlauf fahren, Abzug ziehen …
npm run balance:live -- --url localhost:2610 --subject all --json > /tmp/nachher.json

# … und gegen den eingefrorenen Stand halten:
npm run balance:live -- --url localhost:2610 --subject all \
  --baseline docs/balance/2026-08-06-baseline.json
```

**Der Bericht landet dabei im Modus `VERGLEICH`, nicht `ZEITFENSTER` – das ist
richtig so.** Zwei getrennte Lastläufe sind zwei getrennte Prozesse; ihre Zähler
bauen nicht aufeinander auf, ein Zeitfenster `nachher − vorher` wäre Unsinn. Das
Skript erkennt das daran, dass Zähler kleiner geworden sind, und stellt die
beiden Gesamtstände nebeneinander. Der Hinweis im Kopf ist kein Fehler.

`--baseline` mit dem echten Zeitfenster (`ZEITFENSTER`) funktioniert nur
innerhalb **einer** laufenden Instanz: Abzug ziehen, weiterlaufen lassen,
zweiten Abzug ziehen. Für eine Produktionsmessung ist das der richtige Weg – ein
eingecheckter Lastlauf-Abzug ist dafür ausdrücklich **nicht** geeignet, weil er
von einer anderen Instanz stammt.

## Was ein Abzug nicht kann

- **Bots sind keine Menschen.** Diese Abzüge sind mit `--subject all` gezogen,
  weil im Lastlauf niemand echtes mitspielt. Für eine Produktionsrunde gilt
  weiterhin `--subject human`.
- **Ein Lastlauf spielt nicht gut.** Die simulierten Clients wählen Klassen und
  Upgrades zufällig; Pickraten aus einem Lastlauf sagen etwas über die
  Belastung des Servers, nichts über den Geschmack echter Spieler. Aussagekraft
  haben hier vor allem die *Überlebens*- und *Kampf*-Kennzahlen (K/D,
  Lebensdauer, Kills/Minute) unter vergleichbarer Last.
- **Stichprobengrößen prüfen.** Zeilen mit `·` in der Auswertung haben zu wenig
  Daten für eine Bewertung. Bei zehn Minuten Lastlauf betrifft das die meisten
  Tier-3-Klassen – die erreicht in der Zeit fast niemand. Auf **Familien**ebene
  reichen die Zahlen, auf Klassenebene nur für die ersten beiden Stufen.
- **Der Lasttest muss die Schalter mitspielen.** Ein Client, der seine eigene ID
  aus der `welcome`-Nachricht behält, findet sich mit `SHORT_NET_IDS` nie im
  Snapshot wieder und bleibt Level 1 – der Abzug sieht dann harmlos aus und ist
  wertlos. Vor jedem Abzug prüfen: `classChoicesSent` und `upgradesSent` im
  Lasttest-Bericht dürfen nicht null sein. Hintergrund in
  [`../TELEMETRY.md`](../TELEMETRY.md#warum-der-lasttest-die-schalter-mitspielen-muss).

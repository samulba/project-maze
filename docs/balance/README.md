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
| `2026-08-06-verdichtung/alle-an-r1..r3.json` | lokaler Lastlauf, 40 Clients, 3 × 10 min | **alle Schalter an**, inkl. beider Signatures | je Lauf 184–208 Klassenwahlen |
| `2026-08-06-verdichtung/alle-aus-r1..r3.json` | derselbe Aufbau, alternierend gefahren | **alle Schalter aus** | je Lauf 221–254 Klassenwahlen |
| `2026-08-06-momentum-gepaart/momentum-{an,aus}-r1..r3.json` | gepaart, `--seed` 1001/1002/1003 | **nur `SIGNATURE_RAPID_ENABLED` wandert**, alles andere konstant | je Lauf 178–207 Klassenwahlen |
| `2026-08-06-projektiltempo/tempo-{v2,alt}-r1..r3.json` | gepaart, `--seed` 2001/2002/2003 | **nur `PROJECTILE_SPEED_V2` wandert**, alle übrigen Schalter auf Default an | je Lauf 219–251 Klassenwahlen |

Zum Projektiltempo-Satz gehört eine Warnung: **Er enthält keinen nachweisbaren
Effekt** (3 von 20 Kombinationen konsistent, bei Zufall wären 5 zu erwarten) –
weil die Bots ihren Vorhalt gegen die Flugzeit ausgleichen und die
Lasttest-Clients gar nicht vorhalten. Der Schalter *wirkt* mechanisch klar
(1,40× so viele Projektile gleichzeitig in der Luft), nur eben nicht auf die
Kampfstatistik eines Lastlaufs. Begründung in
[`../status/chat-04/13-deploy-wache-projektiltempo.md`](../status/chat-04/13-deploy-wache-projektiltempo.md).

Die letzte Zeile ist der **einzige Satz Abzüge, dessen Aufbau die Lastkontrolle
besteht** – siehe unten. Für Signature-Aussagen ist nur er zu gebrauchen.

Alle Läufe folgen dem Rezept aus
[`../TELEMETRY.md`](../TELEMETRY.md#lastprobe-matrix-reproduzierbar-fahren).

Der Unterschied zwischen einer An- und einer Aus-Datei ist **nicht** allein die
Signature: Das Bündel legt auch `ACHIEVEMENTS_ENABLED`, `SPECTATOR_ENABLED`,
`SNAPSHOT_DELTAS` und `SHORT_NET_IDS` um. Was davon in den Zahlen steckt, ist
weiter unten auseinandergenommen – **bitte vor dem Ablesen lesen.**

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

> **Diese Ablesung ist zurückgezogen.** Sie stammt aus einem Aufbau, der die
> Serverlast mitmisst; die saubere Nachmessung findet den K/D-Effekt nicht
> wieder. Was stattdessen belegt ist, steht zwei Abschnitte weiter unten.

**Trotzdem ist das noch keine Messung.** Ein Lauf je Konfiguration, 49 bis 69
abgeschlossene Leben je Familie außerhalb von Core, und die simulierten Clients
spielen zufällig. Dass Control und Impact gleichzeitig einbrechen, kann Folge
eines stärkeren Rapid sein – oder schlicht Streuung. Für eine belastbare Aussage
gehören mehrere Läufe je Konfiguration dazu, so wie bei der Lastprobe-Matrix.

### Nachgemessen 2026-08-06: Die Tabelle oben trägt nicht

Der Vorbehalt hat sich bestätigt. Drei Läufe je Konfiguration
(`2026-08-06-verdichtung/`) zeigen: **Es ist Streuung.** Control schwankt bei
*unveränderter* Konfiguration zwischen K/D 0,43 und 1,23 – der Unterschied
zwischen zwei identischen Läufen ist so groß wie der oben abgelesene „Effekt".

Dazu ein zweiter, schwerwiegenderer Befund: **Der Aufbau „alle an vs. alle aus"
misst die Serverlast mit.** Der Tick-Abstand p95 liegt in der An-Konfiguration
bei 35,3–36,1 ms, in der Aus-Konfiguration bei 32,9–33,5 ms – die Bereiche
überlappen nicht. Ursache sind die *anderen* Schalter im Bündel
(`ACHIEVEMENTS_ENABLED`, `SNAPSHOT_DELTAS`, …), die Arbeit pro Tick kosten. Ein
um 9 % langsamer tickender Server verlängert **jedes** Leben und senkt **jede**
Kill-Rate – auch bei Core, auf das keine Signature wirkt.

Signature-Wirkung und Server-Mehrarbeit sind in diesen Zahlen deshalb nicht
mehr zu trennen. **Die Familientabelle oben ist als Signature-Aussage nicht
belastbar** – sie bleibt als Vorher-Stand für KL5 liegen, aber der Satz „Rapid
verdoppelt K/D" ist damit nicht belegt.

Für die nächste Runde: **nur den zu messenden Schalter umlegen**, alles andere
konstant halten, und den Tick-Abstand beider Konfigurationen vergleichen, bevor
die erste K/D-Zahl angesehen wird. Überlappen die Bereiche nicht, ist der
Vergleich ungültig. Vollständige Auswertung in
[`../status/chat-04/11-deploy-stopp-tier-balance.md`](../status/chat-04/11-deploy-stopp-tier-balance.md).

### Nachgemessen mit sauberem Aufbau: was Momentum wirklich tut

`2026-08-06-momentum-gepaart/` wiederholt die Frage mit genau **einer**
wandernden Variable und gepaarten Läufen (`--seed`, beide Seiten einer Runde
identisch). Die Lastkontrolle ist bestanden: Der Tick-Abstand überlappt
(35,70–35,87 ms gegen 35,64–36,68 ms).

**Belegt:** Momentum verlängert Rapids Lebensdauer um **12 bis 17 %**
(+9,5 / +13,0 / +10,4 s über drei Runden – gleichgerichtet *und* eng
beieinander).

**Unbelegt:** jede Aussage über Rapids **K/D**. Die drei Differenzen lauten
−0,03 / +0,63 / +0,92; Runde 1 zeigt sogar nach unten.

**Plausibel, aber nur in der Richtung belastbar:** Precision verliert (K/D und
Kills/min in allen drei Runden niedriger, Größe schwankt um Faktor 5).

Vorsicht bei Einzelzeilen: Von zwanzig geprüften Kombinationen sind neun in
allen drei Runden gleichgerichtet – bei reinem Zufall wären fünf zu erwarten.
Details und Gegenargumente in
[`../status/chat-04/12-momentum-gepaart-gemessen.md`](../status/chat-04/12-momentum-gepaart-gemessen.md).

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

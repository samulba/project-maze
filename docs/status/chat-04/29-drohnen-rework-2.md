# 29 – Drohnen-Rework 2: Tempo, Wandtod, zwei Smoothness-Fixes

| | |
| --- | --- |
| **Auftrag** | Sam, 13.08. (zweite und dritte Rückmeldung): „Drohnen bewegen sich noch zu schnell", „Alles was gegen Wände geht sollte kaputtgehen (Drohnen etc.)", „Rechtsklick und Auto-Modus gehen noch wesentlich smoother" |
| **Backlog** | D4, D5, D6 in Sams Liste (`/admin`, Bereich Drohnen) |
| **Vorher** | [Bericht 28](28-spieltest-checkliste-2.md) – die Checkliste, aus der diese Rückmeldung kam |

## Die kurze Fassung

| | vorher | jetzt |
| --- | ---: | ---: |
| Tempo-Verhältnis Drohne : Besitzer | 1,38–2,20× (Schnitt 1,79×) | **1,00–1,58× (Schnitt 1,25×)** |
| Zeit bis Höchsttempo (linear) | 0,28–0,33 s | **0,37–0,44 s** |
| Rechtsklick-Ziel | wandernd, nie erreicht | **fest, wird angelaufen und gehalten** |
| Zielwechsel an der Suchradius-Grenze | Sprung auf Orbit (~82 px), jeden Tick | **gehalten, 5 px Spannweite** |
| Wandtod | gab es nicht | **Kopf-auf-Treffer zerstört die Drohne** |

## 1. Tempo – Sam: „Drohnen bewegen sich noch zu schnell"

Gemessen (`messung-drohnen-bewegung.mjs`) fuhr jede Drohne schneller als ihr
eigener Besitzer – zwischen dem 1,38-fachen (sentinel) und dem 2,20-fachen
(aviary). Ein Dämpfer von **0,72** auf das Tempo drückt das auf 1,00–1,58×.
Das ist kein runder Wert: Es ist der Punkt, an dem die langsamste Klasse
(sentinel) gerade noch mit dem eigenen Besitzer mithält. Niedriger, und
Wächter-Drohnen fielen beim Fahren hinter den eigenen Tank zurück.

Die Beschleunigung sinkt **stärker** (0,55). `moveVectorToward` rampt linear,
die Zeit bis zum vollen Tempo ist also exakt Tempo/Beschleunigung – vorher
0,28–0,33 s, jetzt 0,37–0,44 s. Das ist der eigentliche Hebel gegen
„ruckartig": nicht das Tempo selbst, sondern wie abrupt es erreicht wird.

Beide Dämpfer liegen auf der Rohtabelle, nicht in den einzelnen
Klassenwerten – die historisch begründete relative Abstufung zwischen den
zehn Archetypen bleibt unter einer gleichmäßigen Skalierung erhalten.

## 2. Wandtod – Sam: „Alles was gegen Wände geht sollte kaputtgehen (Drohnen etc.)"

Nicht jede Wandberührung ist ein Absturz. Beim normalen Navigieren streift
`moveCircle` ständig Wände – eine Achse blockiert, die andere trägt weiter.
Das ist Gleiten, kein Aufprall. Gemessen im echten Labyrinth:

```
Kopf-auf-Wand (Restgeschwindigkeit < 30 % des Anlaufs):  0,21 % aller Fälle
Streifschuss beim Navigieren (30–85 % Restgeschwindigkeit): 4,08 % aller Fälle
```

Ein Streifschuss ist **zwanzigmal häufiger** als ein echter Kopftreffer. Nur
Letzterer darf töten – sonst zerlegt sich die Flotte an jeder Kurve des neuen,
engeren Labyrinths von selbst. Die Regel: Eine Drohne stirbt, wenn sie mit
mindestens der halben Archetyp-Höchstgeschwindigkeit anläuft **und** die
Kollision mehr als 70 % davon auffrisst. Beide Schwellen sind relativ zum
eigenen Archetyp-Tempo, nicht absolut – sie wandern mit, falls das Tempo
später noch einmal nachjustiert wird.

Zwei Tests sichern das gegeneinander ab: Eine Drohne, die frontal auf eine
lange, gerade Wand zufliegt, verliert garantiert Bestand; dieselbe Flotte im
offenen Feld verliert über denselben Zeitraum **keine einzige**.

## 3. Zwei Smoothness-Fixes

### Rechtsklick

Der vorige Fix (Stufe 1) hatte den alten Spiegel-Bug behoben, aber einen
neuen eingeführt: Das Fluchtziel wurde **jeden Tick neu** aus der aktuellen
Position der Drohne berechnet – 260 px vor ihr, in ihre eigene
Fluchtrichtung. Das ist eine Möhre am Stock, keine Ankunft: Die Drohne
beschleunigt auf Höchsttempo und bleibt dort, bis die Leine (650 px) greift,
statt sanft abzubremsen und stehenzubleiben.

Jetzt ist das Ziel **fest**: Besitzer + Richtung „weg vom Zeiger" ×
260 px – aber pro Drohne um einen Fächerwinkel (150° Gesamtöffnung) gedreht,
damit die Flotte nicht wieder auf einem einzigen Punkt zusammenläuft (der
Fehler, den der vorige Fix schon einmal beheben sollte). Die bestehende
Regressionsprobe dagegen („nicht hinter dem Tank") bleibt grün.

### Auto-Modus (Zielgedächtnis)

Ohne Gedächtnis wertet die automatische Zielsuche jeden Tick neu die
kürzeste Distanz aus. Ein Gegner, der genau um die Suchradius-Grenze pendelt,
lässt das Ziel bei jedem „außerhalb"-Tick fallen – die Flotte fällt zurück
auf den Orbit (≈82 px vom Besitzer) und lunge dann wieder hinaus, jeden
zweiten Tick.

Gegenprobe (Gedächtnis testweise abgeschaltet, dann wiederhergestellt):

```
ohne Gedächtnis:  84 px Spannweite (Flotte↔Besitzer) über 60 Ticks
mit Gedächtnis:     5 px Spannweite
```

Ein gehaltenes Ziel bleibt jetzt gültig, solange es innerhalb von 120 % des
Suchradius liegt und Sichtlinie besteht – das verhindert das Flackern direkt
an der Grenze, ohne den Radius selbst zu verändern.

## Geprüft

`npm run check` grün: 82 Dateien, 1131 Tests (+4 neu: Frontalaufprall,
Streifschuss-Gegenprobe, Suchradius-Pendel, Tempo-Obergrenze). Die
DPS-Zahlen aus Stufe 1 (`messung-drohnen.mjs`) bleiben im selben Bereich –
die langsamere Anlaufzeit ändert nichts an der eingespielten Kampfrate,
sobald die Flotte angekommen ist.

Eine bekannte, von diesem Paket unabhängige Flake wurde unterwegs entdeckt:
`arena-systems.test.ts > Ort des Arena-Events` und
`map-reachability.test.ts > legt jeden Spawn ins begehbare Gebiet` fallen
gelegentlich im Sammellauf, beide einzeln zuverlässig grün. Gegenprobe mit
zurückgestellten Drohnen-Änderungen bestätigt: Das Flackern existierte schon
vorher – nicht Teil dieses Pakets, aber notiert für die nächste
Aufräumrunde.

## 4. Bot-Rechtsklick – Sam: „Die Bots benutzen bei Drohnen kein Rechtsklick"

Der Befund stimmte, aber nicht ganz aus dem vermuteten Grund: Die Bots
lösten `secondary` durchaus aus – bei jedem Gegner unter 230 px, unabhängig
davon, ob der Bot gerade angriff oder floh. Das drückte die eigene Flotte
also auch dann vom Gegner weg, wenn Kontaktschaden am meisten gebracht
hätte, und traf selten genau die Situation, in der ein Mensch selbst zum
Rechtsklick greifen würde.

Jetzt hängt der Klick an derselben Fluchterkennung, die auch die Bewegung
umkehrt: Ein Bot, der wegläuft (Leben unter seinem Fluchtwert, oder deutlich
unterlegen), schiebt seine Drohnen als Schutzschild zwischen sich und den
Verfolger. `aim` zeigt zu diesem Zeitpunkt schon auf den Gegner, „weg vom
Zeiger" trifft also die richtige Richtung. Im Angriff bleibt der Klick aus –
dort erledigt die automatische Zielsuche (Stufe 1) den Kontakt von selbst.

Gemessen im vollen Server-Stack (24 Bots, 90 s, `messung-bot-rechtsklick.mjs`):

```
Rechtsklick bei niedrigem Leben (< 50 %): 17,4 % der Ticks
Rechtsklick bei gesunder Flotte:           0,0 % der Ticks
```

Zwei Tests sichern die Regel ab (Gegenprobe mit der alten Bedingung
bestätigt: Der zweite Test – „kein Rechtsklick im Angriff" – schlägt ohne
den Fix fehl).

## Geprüft (gesamt)

`npm run check` grün: 82 Dateien, 1133 Tests (+6 seit Bericht 28: vier aus
Abschnitt 1–3, zwei aus Abschnitt 4).

## 5. Factory-Minions – Sam: „Factory ist noch keine Factory, sondern einfach Mini-Drohnen"

Vorher hatten `factory` und `carrier` nur einen größeren Körper – dasselbe
Kontaktverhalten wie jede andere der zehn Drohnenklassen, nur mit mehr Leben
und mehr Kontaktschaden. In Diep.io trägt ein Factory-Minion ein eigenes
Geschütz; das war der fehlende Teil.

Beide Klassen bekommen jetzt eine `minionWaffe` (Schaden, Nachladezeit,
Geschosstempo, Lebensdauer, Geschossradius) – **zusätzlich** zum Kontakt,
nicht statt ihm. Die übrigen acht Archetypen bleiben unverändert reine
Kontaktkämpfer, ihre Klassenbeschreibung verspricht kein Geschütz.

Drei Regeln, jede mit einem eigenen Test abgesichert:

* Es feuert nur auf ein echtes Angriffsziel (Rechtsklick zählt nicht – eine
  fliehende Drohne schießt nicht zurück).
* Die Waffe hat eine eigene, kurze Reichweite (Tempo × Lebensdauer: 299 px
  bei factory, 318 px bei carrier) – deutlich unter dem Suchradius (540 /
  580), damit ein Minion erst kurz vor dem eigentlichen Kontakt zu schießen
  beginnt und nicht quer durchs halbe Suchfeld feuert.
* Sichtlinie wird von der DROHNE aus geprüft, nicht vom Besitzer – die
  Formation kann eine Drohne an eine Stelle verschieben, an der eine Wand im
  Weg steht, obwohl der Besitzer selbst freie Sicht hat.

Die Geschosse laufen im selben Projektil-System wie jeder Spielerschuss
(Kollision, Wandaufprall, Lebensdauer) – kein Parallelsystem, keine
Sonderbehandlung bei Schadenszuweisung oder Killfeed.

Gemessen (`messung-drohnen-minions.mjs`, Gegenprobe mit testweise
abgeschalteter Waffe):

```
                80px    150px    250px    350px    450px
factory   97,4→131,1  92,5→122,5  84,4→114,4  84,4→110,6   65→91,3 dps
carrier    108→147,4   108→147,4   108→147,4    96→135,4  96→129,8 dps
```

Ein durchgängiges Plus von 25 bis 35 DPS über den ganzen gemessenen
Abstandsbereich – nicht nur "bei Reichweite", weil die Flotte ohnehin fast
immer bis zum Kontakt durchläuft, sondern als echter Bonus obendrauf.

## Geprüft (gesamt, inkl. Factory-Minions)

`npm run check` grün: 82 Dateien, 1137 Tests (+4 seit oben: ein
Feuer-Nachweis, Reichweiten-Grenze, Sichtlinien-Grenze, Kontaktklassen
unberührt). Gegenprobe (Waffe testweise abgeschaltet) bestätigt: Der erste
der vier Tests schlägt ohne die Waffe fehl, die anderen drei sichern die
Grenzen ab, die es sonst zu leicht zu überschreiten gäbe.

Die bekannte, unabhängige Flake aus Abschnitt „Geprüft" trat in einem
weiteren vollen Sammellauf diesmal in `arena-royale.test.ts` statt
`arena-systems.test.ts` auf (dieselbe Ursache: eine driftende Form trifft
zufällig einen ruhenden Testspieler, abhängig von der Zufallszahlenfolge
über den ganzen Sammellauf) – isoliert zuverlässig grün, per Gegenprobe mit
zurückgestelltem Drohnen-Paket bestätigt als vom Paket unabhängig.

## Sams Liste (Drohnen) – Stand

Alle Punkte aus dem Drohnen-Rework 2 (D4–D8) sind jetzt erledigt.

Als Nächstes: die übrigen offenen Punkte aus dem Spieltest vom 13.08.
(Minimap, UI-Feinschliff, Bot-Bewegung, Waffenoptik) – siehe `/admin`,
Bereich-Übersicht.

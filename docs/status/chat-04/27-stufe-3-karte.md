# 27 – Stufe 3: die Karte ist jetzt ein Labyrinth

| | |
| --- | --- |
| **Auftrag** | Sam, 13.08.: „die Map ist noch zu wenig Maze […] dickere Wände, mehr Wände" und „zwei Mainspots" |
| **Plan** | [Bericht 26](26-plan-rework.md), Stufe 3 |
| **Vorher** | [Bericht 25](25-sams-spieltest-feedback.md) – Sams Worte |

## Die kurze Fassung

| | vorher | jetzt |
| --- | ---: | ---: |
| Begehbare Fläche | 90,3 % | **72,3 %** |
| Wanddeckung | 4,53 % | **21,8 %** |
| Wände | 89 | **150** |
| Wanddicke | 54 px | **160 px** |
| Blicke weiter als eine halbe Bildbreite | 46,4 % | **20,9 %** |
| Sichtweite im Median | 760 px | **400 px** |
| Erreichbare Gebiete | 1 (ungemessen) | **1 (geprüft, jeden Testlauf)** |
| Hauptplätze | – | **2 × 800 × 800 px, je vier Tore** |

Ein Panzer ist 44 px dick. Eine Wand war vorher 54 px – man stand nicht
dahinter, man stand daneben. Jetzt ist sie 160 px, und der Gang zwischen zwei
Wänden misst 320 px, also gut sieben Panzerbreiten.

## Was ich zuerst gebaut habe, und warum

Der Plan schrieb vor: **Erreichbarkeitsprobe vor jedem Generator-Umbau.** Der
Grund steht in Bericht 26 – dickere Wände können eine Ecke zumauern, und
nichts würde rot. Also zuerst das Messwerkzeug (`map-reachability.ts`): Es
flutet die begehbare Fläche und zählt, in wie viele getrennte Gebiete sie
zerfällt.

Sieben von zwölf Tests der Probe prüfen **die Probe selbst**, an Fällen mit von
Hand bekannter Antwort – eine Erreichbarkeitsprobe, die nie „getrennt" sagt,
würde jeden Umbau durchwinken.

Dabei ist gleich etwas aufgefallen, das es vorher schon gab: **Formen können in
Nischen liegen, in die kein Panzer passt** (eine Form braucht 25 px Platz, ein
Panzer 22 px Radius plus Sicherheit). Das ist kein Fehler – man kann sie
beschießen. Der Test prüft deshalb die Frage, auf die es ankommt: Berührt der
Bereich, in dem die Form liegt, irgendwo Panzerboden? Eine zugemauerte Kammer
fiele damit auf.

## Die drei Zahlen sind gemessen, nicht geraten

Mein erster Anlauf stand bei Bahn 800, Wanddicke 140, Verflechtung 0,32 – und
war **nachweislich schlechter als die alte Karte**: 36 Wände, und die
Sichtweiten wurden *länger* statt kürzer (57,5 % weite Blicke statt 46,4 %).

Deshalb der Umweg über `messung-karten-raster.mjs`, das 51 Kandidaten
nebeneinander vermisst. Das Ergebnis war eindeutig und hätte sich nicht erraten
lassen:

> **Die Bahn bestimmt das Labyrinthgefühl fast allein, die Wanddicke kaum.**

```
bahn 800  →  39–55 % weite Blicke      alte Karte: 46,4 %
bahn 600  →  21–39 %
bahn 480  →  15–28 %      ← gewählt
bahn 400  →   8–20 %
```

Bei Bahn 800 ist die Zelle schlicht zu groß, um Gänge zu bilden – egal wie dick
die Wand ist. Bahn 400 wäre noch dichter, kostet aber Weite (54 % begehbar) und
verdreifacht die Wandzahl.

**Verflechtung** (wie viele Wände nach dem Labyrinth wieder aufgehen) hat genau
eine Aufgabe – Sackgassen beseitigen –, also ist sie daran gemessen worden:

```
0,00  →  27 Sackgassen (12,5 %), 15,0 % weite Blicke
0,20  →  14 Sackgassen ( 6,5 %), 20,7 %      ← gewählt
0,45  →   5 Sackgassen ( 2,3 %), 36,5 %
```

Der Tausch ist fast linear, es gibt also keinen „richtigen" Punkt, nur eine
Entscheidung. 0,20 halbiert die Sackgassen und kostet drei Punkte
Labyrinthgefühl – in einem Spiel, in dem eine Sackgasse den Tod bedeutet, der
bessere Tausch.

## Wie das Labyrinth entsteht

1. **Spannbaum** per randomisierter Tiefensuche – danach ist jede Zelle von
   jeder erreichbar. Die Erreichbarkeit ist damit eine Eigenschaft des
   Generators, nicht eine Hoffnung, die der Test nachträglich prüft.
2. **Verflechten** – ein Fünftel der übrigen Wände geht auf, das gibt Schleifen
   statt Sackgassen.
3. **Hauptplätze aussparen** – innen alles auf, am Rand je Himmelsrichtung ein
   Tor.
4. **Zusammenhang reparieren** – Schritt 3 schließt Grenzen wieder, und die
   können die einzige Verbindung einer Zelle gewesen sein. Union-Find über die
   Zellen, dann öffnen, bis alles ein Gebiet ist.

Die Wandachsen liegen auf Vielfachen von 480. Das ist ein Vielfaches des feinen
Bodenrasters des Clients (80 px), aber **nicht** des betonten (400 px) – der
Preis dafür, dass die Bahn nach der Messung gewählt wurde und nicht nach dem
Hintergrundbild. Die Karte (9000 × 6000) geht in keinem gitterfreundlichen Maß
glatt auf; 9000 enthält nur 2³, für ein Vielfaches von 400 bräuchte es 2⁴. Der
Rest bleibt bewusst an der rechten und unteren Kante liegen: ein etwas weiterer
Umlauf am Rand.

## Die zwei Mainspots

West- und Ostplatz, je 800 × 800 px offen, auf halber Höhe, mit **je einem Tor
in jede Himmelsrichtung** – eine Kreuzung, keine Festung und keine Falle. Ihre
Randmauern sind die einzigen Wände, die das Fracture-Event nicht aufbrechen
darf; die Plätze behalten ihre Form.

**Ein Drittel aller Formen erscheint dort.** Ohne das wäre ein Hauptplatz nur
ein Loch im Labyrinth – so ist er der Ort, an dem man sich trifft, weil man
dort etwas holen kann.

Die Plätze liegen 360 px unsymmetrisch (Westplatz 1920 px vom linken Rand,
Ostplatz 2280 px vom rechten). Das ist der Rest, der am Kartenrand liegen
bleibt – 4 % der Kartenbreite.

## Was mitgezogen ist

**Die Bots halten es aus.** Das war das größte Risiko: Es gibt keine
Bot-Wegfindung, und Bots nehmen sich nur Ziele, die sie *sehen*. Gemessen gegen
FFA (die einzige verfügbare Karte ohne Wände), 16 Bots, 90 Sekunden:

| | offen (FFA) | Labyrinth |
| --- | ---: | ---: |
| Tempo | 221 px/s | 209 px/s (95 %) |
| Anteil Ticks mit Ziel | 100 % | 98 % |
| Stehende Ticks | 0,6 % | 1,8 % |
| Punkte | 1371 | 1024 (75 %) |

Sie fahren fast gleich weit und finden fast immer ein Ziel – weil Formen
überall sind und `moveCircle` an Wänden entlangschiebt statt zu blockieren. Die
75 % Punkte sind kein Defekt: Farmen dauert im Labyrinth länger. **Wegfindung
ist damit kein Notfall.**

**Rechenzeit**: 3,12 ms je Tick bei 24 Bots gegen 2,81 ms ohne Wände – 12,5 %
des 25-ms-Budgets. Die 150 Wände werden linear durchsucht; bei diesem Preis
lohnt kein Index.

**Bandbreite**: 10 Wände je Sichtfenster im Schnitt, höchstens 18.

**Die Reichweite regelt jetzt die Karte.** Bericht 26 hatte gewarnt, dass die
Reichweiten- und die Kartenentscheidung dieselbe Zahl anfassen. Genau so ist
es: Die realisierte Sichtlinie liegt im Median bei 400 px und im p90 bei
1200 px. Der Deckel aus Stufe 2 (1400 px) greift damit fast nie mehr – **die
Wände tun die Arbeit.** Der Deckel bleibt als Obergrenze stehen, ist aber
faktisch entschärft.

## Das eigentliche Aufräumen: `messfeld.ts`

Bericht 26 hatte 17 Testdateien mit hartcodierten Weltkoordinaten als Risiko
genannt. Es waren am Ende **16 Dateien**, und sie sind das Interessanteste an
dieser Stufe – weil sie beim Umbau mit Meldungen wie *„erwartet 0, war 40,6"*
gebrochen sind, also so, als wäre ein Perk kaputt, obwohl nur eine Wand im Weg
stand. Das ist die teuerste Sorte Fehlschlag: Sie zeigt auf die falsche Stelle.

Der Punkt `{ 2800, 2200 }` stand in **elf** Dateien. Er hat den Umbau zufällig
überlebt – mit 200 px Luft. Beim nächsten Mal nicht mehr.

`messfeld.ts` beantwortet das grundsätzlich: **Ein Messpunkt ist keine
Konstante, sondern eine Eigenschaft der Karte** – also wird er gesucht statt
geschrieben. Der Aufrufer sagt, wie viel Platz er in welche Richtung braucht:

```ts
const TRAEGER = messpunkt({ links: 440, rechts: 190, oben: 40, unten: 440 });
```

Das ist zugleich Dokumentation: Man sieht, was die Messung wirklich braucht.

Ein Test ist dabei ehrlicher geworden statt nur grün: Der Drohnen-Test stellte
einen Gegner 1400 px entfernt auf, um zu prüfen, dass die Flotte zu Hause
bleibt. Im Labyrinth gibt es keine freie Fläche dieser Größe mehr – der Test
wäre grün geworden, **weil eine Wand die Sicht nimmt**, statt weil der
Suchradius endet. Jetzt sucht er die Richtung, in der die Sicht wirklich
reicht.

## Was ich NICHT gebaut habe

**Es gibt keinen Weg, einen Hauptplatz zu finden.** Die Minikarte ist ein
Nahradar (rund 1,2 Bildschirme um die Kamera), keine Weltkarte. Die Plätze
existieren als Geometrie und lohnen sich, wenn man dort ist – aber von der
anderen Kartenseite findet man sie nur durch Laufen.

Das wäre eine eigene Entscheidung, und ich wollte sie nicht nebenbei treffen.
Drei Möglichkeiten, in aufsteigendem Aufwand: die Plätze aufs Nahradar zeichnen
(billig, hilft nur in der Nähe), ein Richtungspfeil am Bildrand, oder eine
echte Weltkarte auf Tastendruck. **Sag, welche.**

## Geprüft

`npm run check` grün: 81 Dateien, 1115 Tests (+16). Proben: `wire`, `maze`,
`ffa`, `royale`, eine ganze Royale-Runde und `duo` grün. Die
Fortschrittsschleife fiel im Sammellauf und war einzeln in 43 s grün – dasselbe
Muster, das [Bericht 21](21-bericht-19-nachgemessen.md) schon festgehalten hat
(„im Suite-Lauf einmal an der Container-Last gescheitert, einzeln
reproduzierbar grün"). `proben.mjs` warnt im eigenen Kopfkommentar davor.

## Offen für dich

* **Sichtweite**: Der Median liegt jetzt bei 400 px. Ist das zu eng? Es ist die
  Zahl, die „mehr Maze" ausmacht, und die, die sich am ehesten zu weit
  angefühlt haben könnte.
* **Hauptplätze finden** – siehe oben.
* **Sackgassen**: 14 Stück (6,5 % der Zellen) bleiben. Weniger geht, kostet
  aber Labyrinth.

Danach kommt **Stufe 4 – die Klassen**, der größte Brocken: Salve statt Fächer,
dann Pro-Lauf-Profile, dann die fehlenden Archetypen.

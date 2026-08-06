# 19 – Die Tanks sollen verschieden aussehen, und die Wahl soll sitzen

**Branch:** `claude/chat-03-client-ux-mazers-yu57ca` · **Basis:** `origin/main` @ `4b28dd2` · **Status: OFFEN – wartet auf Merge und auf Sams Ja zur Formsprache**

Der Kurswechsel ist angekommen: sichtbar vor messbar. Reihenfolge wie
beauftragt – erst die Geometrie teilen, dann einmal wirklich spielen, dann die
Formsprache.

## 1 – Eine Quelle für Rumpf und Vorschau

Die Rumpfgeometrie stand als `switch` privat in `renderer.ts`, die Wahlkarten
zeichneten ersatzweise **jeden Rumpf als Kreis**. Ein Fortress war auf der
Karte eine Scheibe und im Spiel ein Kasten. Jetzt liegt sie als Daten in
`class-hull.ts`; Spiel und Karte lesen dieselbe Liste, Pixi und SVG sind nur
noch zwei Übersetzungen davon. Die Vorschau kann nicht mehr hübscher lügen als
das Original.

Damit war der eigentliche Befund zum ersten Mal zählbar – `umrissDubletten()`:

| | |
|---|---|
| Klassen | 29 |
| **verschiedene Umrisse** | **17** |
| Klassen in einer Dublette | **19** |

```
core = drone = twin = warden = guardian     ein Kreis mit r=22
rapid = sniper = hunter = flanker           ein Kreis mit r=21
rammer = octo · railgun = arbalest · storm = overseer · gatling = hive · phantom = deadeye
```

**Eine Korrektur an der Auftragslage:** Die sieben Impact-Klassen sind *nicht*
identisch – im Spiel ist Panzerung die am besten unterschiedene Familie
(Achteck, Kasten, Pfeil, Keil). Identisch aussahen sie auf den **Wahlkarten**,
weil dort jeder Rumpf ein Kreis war. Dieselbe Ursache, ein anderer Ort. Wer
dagegen wirklich gleich aussieht, sind Core, Controller, Twin, Warden und
Guardian – fünf Klassen, ein Kreis, quer über drei Familien.

## 3 – Einmal wirklich spielen

Der Prüfstand meldete 75/75, und Sam sagt trotzdem, die Wahl sitzt nicht. Also
echter Server, echte Bots, echter Aufstieg: Start auf Level 9, dann farmen, bis
die Wahl **im Gefecht** aufgeht. Vier Befunde, die eine Matrix nicht findet.

**Die Karten überlappten sich.** Jede Karte lag 43 px auf ihrer Nachbarin, die
vierte ragte 35 px über ihr eigenes Panel hinaus. Ursache: `min-width: 220px`
an der veredelten Karte gegen `1fr`-Spuren von 190 px. Der Prüfstand misst
Panels gegeneinander, **nicht Geschwister innerhalb eines Panels** – 01 hat
recht behalten: „dann prüft er das Falsche oder nicht genug".

**Auf 720p fehlten Beschreibung und alle vier Balken.** Man wählte zwischen
vier Tanks und sah je einen Namen. Das ist **meine** Regel aus Paket 16, und
sie war damals richtig – ohne sie fiel eine von vier Karten unter den Sichtrand.
Inzwischen tragen die Karten ein Bild, und die Rechnung sieht anders aus.

**Auf 1920×1080 schnitt der Deckel die unterste Zeile jeder Karte ab.** Eine
Karte ist dort 294 px hoch, das Panel deckelt bei 320 – auch das mein Deckel
aus Paket 16, gedacht gegen eine zweite Kartenreihe. Weggeschnitten wurde
ausgerechnet die letzte Vergleichszeile. Sechs Fenstergrößen betroffen; der
Befund kam mit den neuen Karten herein, nach meinem letzten vollen Durchlauf.

**Und der Rest ist kein Fehler, sondern die Lage:** Die Wahl geht 41 px unter
dem eigenen Tank auf, belegt 17 % des Bildes, nimmt 25 % der Arena die Klicks –
und **bleibt stehen, bis man wählt**. Im ehrlichen Lauf war ich 19 Sekunden
später tot, mit offener Wahl. Wer auf Level 10 kommt, entscheidet unter
Beschuss und verliert dabei genau die Fläche, auf der er ausweichen müsste.

### Was ich daraufhin geändert habe

| | vorher | nachher |
|---|---|---|
| Überlappung der Karten | 43 px | **keine** |
| Balken auf 1280×720 | unsichtbar | **sichtbar** |
| Karte auf 1920×1080 | 294 px, unten abgeschnitten | **218 px, vollständig** |
| tote Fläche bei 1920×1080 | 15,6 % | **13,9 %** |
| tote Fläche bei 1280×720 | 17,3 % | **13,3 %** |

Die Karte stellt ihren Kopf quer – Bild links, Familie und Name rechts daneben,
Balken darunter über die ganze Breite. Gestapelt braucht derselbe Inhalt 294 px,
quer rund 200. Damit passt eine Reihe unter den Deckel, auf jeder Größe, und die
Karte sieht überall gleich aus statt in zwei Fassungen.

Eine Regel fragt jetzt die **Spurbreite** ab statt die Fenstergröße
(`@container`). Bei 1280×600 mit offenem Upgrade-Panel bleiben der Wahl 520 px –
vier Karten à 120 px, und der Name brach in „Co ntr oll er". Dasselbe Fenster
ohne Upgrade-Punkte hat Platz genug; ein Fenstermaß kann das nicht
unterscheiden.

**Zwei Fehler waren dabei meine eigenen, frisch gemacht:** Ein
`grid-column: 1 / -1` traf nicht nur die Karte, sondern jedes `span` darin – die
Balkenbeschriftungen legten sich über beide Spalten und schoben die Balken in
die nächste Zeile. Und die rechte Spur der Wahl war mit 210 px schmaler als die
Bestenliste selbst (278 px); auf flachen Fenstern fällt das nie auf, weil die
Wahl dort gar nicht so weit nach oben reicht.

## 2 – Die Formsprache: erst ein System, dann 29 Formen

**Drei Regeln statt 29 Einfällen:**

1. **Die Familie steckt im Grundkörper.** *Dauerfeuer* ist **der Pfeil**,
   *Präzision* **die Spindel**, *Kontrolle* **der Träger** mit Buchten im Rand,
   *Panzerung* **der Amboss** mit breiter Front. Core bleibt der schlichte
   Kreis – er ist das einzige Fahrzeug, das noch nichts ist.
2. **Die Stufe steckt in dem, was dazukommt.** Ring 1 nackt, Ring 2 mit
   Flankenplatten, Ring 3 mit Auslegern, dazu je 8 % Größe. Ein später Tank
   *sieht* später aus – der Baum wird lesbar, bevor das Rad ihn zeigt.
3. **Jede Klasse hat ein Merkmal, das nur sie hat**, beschreibbar ohne Zahlen.
   Das ist der einzige Teil, der nicht ableitbar ist.

Regel 1 und 2 sind **gerechnet und gelten für alle 29**. Die Buchten des
Trägers kommen aus der Drohnenzahl der Klasse: Man sieht einem Controller an,
wie viele Drohnen er führt, auch wenn gerade keine fliegt – und eine neue
Kontrollklasse bekommt ihre Form geschenkt.

Regel 3 steht für **acht Klassen**: je eine frühe und eine späte pro Familie,
wie beauftragt. Die übrigen 21 tragen bis zur Freigabe nur Familie und Stufe.
**Das Ganze hängt an einem Schalter, der aus ist** (`?silhouetten=1`); im Spiel
ändert sich heute nichts.

| Klasse | das Besondere |
|---|---|
| Rapid | ein durchgehender Grat vom Heck bis in die Spitze – der schlichteste Pfeil im Feld |
| Storm | zwei weit nach hinten gezogene Flügel; kein anderer Pfeil ist hinten breiter als vorn |
| Sniper | ein einzelnes Leitblech auf dem Rücken |
| Deadeye | die Spindel ist vorn gegabelt – zwei Zinken, zwischen denen das Ziel steht |
| Controller | vier offene Buchten im Rand, eine je Drohne |
| Hive | ein zweiter, kleinerer Träger sitzt im Träger |
| Impact | eine schmale, hochkant stehende Rammplatte über die ganze Front |
| Fortress | vier Ecktürme – als einziger Tank eine Silhouette mit Zinnen |

Der Blindtest steht heute bei **19 verschiedenen Umrissen** (vorher 17). Der
Sprung kommt erst mit den restlichen 21 Merkmalen; bis dahin sehen sich
Geschwister derselben Familie und Stufe weiterhin ähnlich. Das ist so gewollt
und nicht übersehen.

**Eine erste Fassung habe ich verworfen.** Die Stufenteile waren dünne Dreiecke
neben dem Rumpf; im Blindtest las sich das als zufällige Stacheln und nicht als
Panzerung. Jetzt überlappen alle Anbauteile den Körper – was angebaut ist, muss
auch angebaut aussehen.

## Tests

`npm run check` grün: **58 Dateien, 791 Tests** (28 neu). Der Prüfstand steht
wieder auf **75/75** – die sechs Befunde von oben sind darin enthalten, dazu
zwei weitere, die erst dabei aufgefallen sind: Meine Regel aus Paket 16 hat auf
Touch die Kartenreihe von `mobile.css` überschrieben und vier Karten in 380 px
gequetscht, statt sie wischen zu lassen; und auf dem kleinsten Gerät der Matrix
(667×375 quer) musste das Bild noch einmal zurücktreten, damit alle vier Karten
ins Panel passen.

Neu festgehalten: dass Vorschau und Spiel dieselbe Geometrie benutzen; dass der
Fortress ein Kasten bleibt; dass **kein** Merkmalstext eine Zahl enthält; dass
der Schalter aus ist. Und die Dublettenliste steht als Zusicherung auf dem
*heutigen* Stand statt auf null – ein Test, der jetzt schon Perfektion
behauptet, wäre eine Behauptung und kein Beleg.

## Geänderte Dateien

**Neu:** `class-hull.ts(+test)`, `class-silhouette.ts(+test)`
**Geändert:** `renderer.ts`, `class-preview.ts`, `class-choice.css`, `hud-layout.css`, `main.ts`

`packages/shared`, `apps/server` und `package.json` unangetastet.

## Von 01 gebraucht

1. **Merge** – Teil 1 und 3 sind fertig und sichtbar.
2. **Die Vorlage an Sam:** acht Silhouetten, links heute, rechts neu, dazu der
   Blindtest über alle 29. Geht als Bild in den Chat.
3. **Ohne sein Ja baue ich die restlichen 21 Merkmale nicht.** Mit seinem Ja
   sind es Daten, kein Entwurf – das System steht.
4. **Eine Frage, die aus dem Spielen kommt und nicht in mein Revier fällt:**
   Beim Tod fällt man hart zurück (Level 9 → 4 → 3 → 1 in vier Runden). Bis
   Level 10 zu kommen hat mich 150 Sekunden Sterben gekostet. Wenn die
   Klassenwahl der große Moment sein soll, erreicht ihn kaum jemand.
5. **Unverändert offen:** Sichtfeld-Standard, Vorhersage-Standard, `tier` bei 04,
   und die Frage aus Paket 18, ob das Rad auf Level 10 einmal von selbst aufgeht.

## Abweichungen und Grenzen

1. **Acht Beispiele statt sechs.** „Je Familie eine frühe und eine späte" sind
   vier mal zwei; sechs hätte eine Familie halbiert.
2. **Die Wahl hält das Spiel weiterhin nicht an, und sie geht weiterhin unter
   dem eigenen Tank auf.** Beides ist unverändert – ich habe die Karte
   repariert, nicht den Zeitpunkt. Ob die Wahl pausieren, einen Countdown
   bekommen oder woanders stehen soll, ist eine Design-Entscheidung für Sam,
   keine Reparatur.
3. **Die neuen Silhouetten sind nur als SVG geprüft, nicht im Spiel.** Der
   Renderer liest dieselben Daten, aber gesehen habe ich sie in Spielgröße und
   Bewegung noch nicht. Das gehört in den Schritt nach der Freigabe.
4. **Der Prüfstand kennt die Karten immer noch nicht einzeln.** Er misst Panels;
   die Überlappung der Karten habe ich von Hand gemessen. Das gehört in den
   Prüfstand, sonst fällt derselbe Fehler wieder durch – ich habe es diesmal
   nicht mehr eingebaut.
5. **Nur Chromium**, wie gehabt: `:has()` und jetzt auch `@container` tragen
   HUD-Logik und sind auf Sams Gerät ungeprüft.

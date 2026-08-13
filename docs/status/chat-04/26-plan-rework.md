# 26 – Stufenplan zum Rework (Drohnen, Klassen, Karte, Projektile, Rückstoß)

| | |
| --- | --- |
| **Auftrag** | Sam, 13.08.: „Plan das einmal gescheit durch und fix alles Step by Step schön gründlich" |
| **Rohmaterial** | [Bericht 25](25-sams-spieltest-feedback.md) – Sams Worte |
| **Grundlage** | Bestandsaufnahme über acht Subsysteme, jeder Befund von einem zweiten Agenten am Code gegengeprüft (16 Agenten) |
| **Erledigt** | **Der Strich-Bug ist gefixt** (Commit `de63139`) – siehe Stufe 0 |

## Was die Bestandsaufnahme geändert hat

Drei Dinge, die den Plan anders schneiden, als Sams Reihenfolge vermuten lässt:

1. **Sams Auto-Fire-Diagnose ist richtig, die Ursache eine andere.** Die
   Drohnen tun im E-Modus etwas – sie fliegen zum Cursor. Aber: Steht die Maus
   still, ist `aim` exakt `{0,0}`, und die Flotte klebt **auf dem eigenen
   Körper** (gemessen: 0,0 px Abstand). Das ist Sams „sie schweben einfach um
   dich und dann passiert nix". Und weiter: **Es gibt im ganzen Server keine
   Zeile, in der eine Drohne selbst ein Ziel sucht.** Schaden entsteht nur,
   wenn eine Drohne zufällig etwas berührt. Gemessen: Gegner 200 px entfernt,
   kein Kommando, 8 Sekunden → **0 Schaden**.
2. **Der Server kennt die Cursorposition gar nicht.** `aim` ist auf 650 px
   gedeckelt (`GAME.maxAimDistance`) – Richtung exakt, Entfernung darüber
   ununterscheidbar. Ein Gegner bei 800 px ist mit dem Cursor auf ihm **nicht
   erreichbar**. Jede Diep.io-nahe Drohnensteuerung hängt daran; das ist der
   Blocker, der vor allem anderen fällt.
3. **Die Karte kann Sams Wunsch nicht durch Parameter erfüllen.** Es gibt
   keinen Labyrinth-Algorithmus: `world.ts` streut 89 Einzelbalken, die zu 71
   Gruppen zerfallen, 55 davon Einzelwände. „Es muss wirklich ein Maze werden"
   heißt: Generator neu, nicht Zahlen drehen. Dazu fehlt jede
   **Erreichbarkeitsprüfung** – dickere Wände können eine Tasche zumauern, und
   nichts würde rot.

Dazu eine Warnung, die im Plan steht, weil sie sonst untergeht: **Die
Reichweiten-Entscheidung und die Karten-Entscheidung greifen in dieselbe
Zahl.** Mehr Wände senken die realisierte Schussreichweite gratis (im
Labyrinth liegt die freie Sichtlinie im Median bei 750–774 px, also unter der
Sichtgrenze); die offenen Hauptplätze heben sie wieder. Eine Deckelzahl vor
der Kartenentscheidung festzulegen heißt, sie zweimal festzulegen.

## Stufe 0 – erledigt: der Strich-Bug (`de63139`)

`arc()` ohne `moveTo`: Pixi hängt den Bogen an den letzten Pfadpunkt, und der
stand nach `stroke()` auf (0,0). Gefixt, und das Zeichnen liegt jetzt als
getestete reine Funktion in `drone-draw.ts` – die Regel „jeder Pfad beginnt
bei seiner eigenen Drohne" fängt den nächsten nackten Bogen automatisch.
Mitgenommen: Der Blickwinkel benutzte `||`, und `atan2(0, v)` ist 0 – eine
nach rechts fliegende Drohne zeigte in die falsche Richtung.

## Stufe 1 – Drohnen, die etwas tun (Sams Punkt 1)

Reihenfolge ist hier Pflicht, nicht Geschmack: Jeder Schritt ist Voraussetzung
des nächsten.

1. **Sichtbarkeit vor Reichweite.** Der Snapshot-Cull (`ENTITY_CULL_HALF`,
   848 × 498 px) ist **kleiner als die Drohnenreichweite** (650 px in jede
   Richtung): Ab 500 px senkrecht sieht der Spieler seine **eigenen** Drohnen
   nicht mehr. Eigene Drohnen von der Beschneidung ausnehmen – sonst wird
   jeder Reichweiten-Fortschritt unsichtbar.
2. **Zielsuche** (der eigentliche Kern von Sams Auto-Fire-Satz): Findet die
   Drohne im Umkreis des Besitzers ein gültiges Ziel, fliegt sie es an.
   Größter Einzelsprung des ganzen Pakets – im Labor von 0 auf 39–170 DPS.
   Suchradius je Archetyp ist der Balanceregler.
3. **Cursor-Führung im Leerlauf:** ohne gedrückte Taste um den Cursorpunkt
   kreisen statt um den Tank. Das ist die eine Zeile, die das Diep.io-Gefühl
   herstellt. Achtung: Der Orbit ist heute die **einzige** Nahverteidigung.
4. **Rechtsklick auf echtes Abstoßen** umstellen (radial vom Cursor weg statt
   Punktspiegelung hinter den Tank). Nebenwirkung, die mitmuss: `secondary`
   beendet heute den Spawnschutz und bricht eine laufende Reparatur ab.
5. **Cursor-Weltposition** über ein optionales `cursor`-Feld – **erst nachdem**
   ein Fähigkeitsbit in `welcome` existiert. Das Eingabe-Schema ist `.strict()`:
   Ein neues Feld gegen einen alten Server löscht **die gesamte Eingabe**, und
   der Tank steht nach 2 Sekunden still. Ausrollreihenfolge ist hier kein
   Detail, sondern der Unterschied zwischen Feature und Totalausfall.

**Nicht in Stufe 1:** Factory-Minions mit eigenem Rohr. Das ist eine
Wire-Erweiterung plus Schusstakt je Drohne und gehört auf gesicherten Boden –
Stufe 4.

## Stufe 2 – Projektile und Rückstoß (Sams Punkte 4 und 5)

Beides zusammen, weil beide am Feuergefühl hängen und dieselben Tests brechen.

* **Erst messen, dann deckeln.** Die Leitzahl des Vorberichts („51 von 55
  Klassen schießen weiter als der Bildrand") gilt für freies Feld – Sam spielt
  Maze. Vorher braucht es zwei Zahlen: realisierte Reichweite im Labyrinth,
  und wie viel Zeit ein Verteidiger zum Ausweichen hat.
* **Zwei Lecks unabhängig davon reparieren:** Der Stabilizer-Rahmen gibt seit
  jeher **10 % Extrareichweite**, weil das Tempo multipliziert, die Lebenszeit
  aber nicht geteilt wird. Und der Bot-Feuerdeckel hat einen additiven
  `+60`-Term, der bei kurzen Reichweiten überschießt.
* **Rückstoß als getragener Stoß, nicht als Impuls.** Nachgemessen: Bei der
  Impuls-Variante entwaffnet sich SIEGE durch eigenes Feuern (Stellung fällt in
  4 s von 100 auf 56), und drei weitere Schwellen kippen mit (Repair-Limit 40,
  Perk-Stillstand 12, Rammschaden von blitz/comet). Der getragene Stoß lässt
  `velocity` unberührt – gemessen bleibt die Stellung bei **100,0**.
  Sams „aber nicht zu stark" wird als **Deckel** geführt: Weg proportional zur
  Nachladezeit, rund 25 px/s, damit die Summe pro Sekunde konstant bleibt.
* **43 von 65 Klassen haben heute gar keinen Rückstoß-Eintrag** – darunter
  sechs der zwölf schnellsten. Wer nur die vorhandenen 22 Werte hochzieht,
  lässt genau Sams Zielgruppe bei null.

## Stufe 3 – die Karte (Sams Punkt 3)

* **Erreichbarkeitsprobe zuerst**, vor jedem Generator-Umbau: Flutfüllung über
  `isFree`, Zahl der Komponenten. Heute: eine Komponente, 121 954 Zellen –
  aber niemand misst es, und dickere Wände können das kippen.
* **Wanddicke bekommt einen Namen** (heute dreimal das Literal 54) und steigt
  auf 120–160.
* **Echter Labyrinth-Generator** statt gestreuter Balken. Zwei Zahlen sind
  vorher zu entscheiden: das Rastermaß muss zum Bodenraster des Clients passen
  (fest 80/400 px – 400 oder 800 gehen auf, 500 und 600 laufen quer), und es
  darf nicht unter ~450 px fallen, sonst sieht man im 1600 × 900-Fenster nur
  noch Wand.
* **Zwei Hauptplätze** als benannte Geometrie, aus der der Generator aussparen
  darf, plus ortsgewichteter Formen-Spawn.
* **Was mitzieht:** 17 Testdateien hängen an hartcodierten Weltkoordinaten,
  vier davon 65 px von derselben Wand entfernt – die brechen schon beim bloßen
  Verdicken. Dazu `world.test.ts` (Deckungskorridor 3,8–5,2 %, in GOAL.md als
  erfülltes Ziel geführt), das Fracture-Event, die Royale-Zone und die
  Bot-Wegfindung, die es nicht gibt.

## Stufe 4 – Klassen (Sams Punkt 2)

Der größte Brocken, bewusst zuletzt: Er braucht die Karte und die
Projektilwerte als festen Boden.

* **Die Begründung muss stimmen**, sonst wird doppelt gebaut: Es ist nicht so,
  dass 56 von 65 Klassen keine Mechanik hätten – **64 von 65 tragen eine
  Familien-Signature**. Das Problem ist, dass alle acht demselben Bauplan
  folgen (Balken füllt sich, Balken wirkt) und ohne Punkte in `signaturePower`
  bei sechs von acht Familien nur **rund ein Drittel** der beschriebenen
  Wirkung haben. Und: **Keine einzige Apex-Klasse hat eine Sondermechanik** –
  was ein Spieler nach einer Stunde erreicht, ist die nackte Feuerschleife.
* **Erster Eingriff, weil er Sams Beispiel wörtlich trifft:** Salve statt
  Fächer (`burstCount`/`burstDelay`). „Der eine schießt drei nach vorne, der
  andere zwei" wird damit zu „der eine schießt drei auf einmal, der andere
  drei nacheinander" – zwei Spielgefühle aus denselben Zahlen.
* **Danach Pro-Lauf-Profile:** `barrelAngles` → `barrels[{angle, damageScale,
  speedScale}]`. Das ist der Schritt, der Spreadshot von Penta trennt.
* **Dann die fehlenden Archetypen:** rohrloser Smasher (comet hat schon eine
  Rammkurve), stehendes Projektil (Trapper), Factory-Minions.

## Reihenfolge und warum

```
0. Strich-Bug ................ erledigt
1. Drohnen ................... Sams Punkt 1, sichtbarster Gewinn
2. Projektile + Rückstoß ..... Feuergefühl, unabhängig von der Karte baubar
3. Karte ..................... braucht eigene Messwerkzeuge zuerst
4. Klassen ................... braucht 2 und 3 als Boden
```

Nach **jeder** Stufe eine spielbare Version und deine Rückmeldung – nicht erst
am Ende. Die Bestandsaufnahme hat an vier Stellen gezeigt, dass die
Vorannahme falsch war (Auto-Fire, Cursor-Reichweite, Kartengenerator,
Rückstoß-Modell); dieselbe Vorsicht gilt für die Wirkung.

## Was ich von dir brauche – erst wenn Stufe 1 steht

* **Rechtsklick:** Diep.io stößt Drohnen vom **Cursor** weg. README und
  Masterplan dieses Projekts sagen dasselbe – der Code spiegelt sie hinter den
  Tank. Ich baue die Diep.io-Variante, sag Bescheid, wenn du es anders willst.
* **Projektil-Anfangstempo:** Der Diep.io-Referenzweg wäre, Kugeln schnell
  starten und abbremsen zu lassen. Du sagst „von Anfang an zu schnell" – das
  ist das Gegenteil. Ich lege dir die Zahlen vor, statt zu raten.

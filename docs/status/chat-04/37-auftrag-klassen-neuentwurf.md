# CLAUDE CODE – Mazers: finaler Implementierungsauftrag für alle 67 Panzerklassen

**Status:** vom Auftraggeber visuell freigegebene Richtung  
**Priorität:** Dieser Abschnitt ist verbindlich und überschreibt alle widersprechenden visuellen Angaben in Anhang A.  
**Umfang:** Alle 67 Klassen bleiben erhalten. Nichts zusammenlegen, streichen oder umbenennen. Teil E im Anhang ist nur eine spätere Produktüberlegung und für diesen Auftrag ausdrücklich **nicht umzusetzen**.

## 0. Ziel

Implementiere den vollständigen Klassenneuentwurf im bestehenden Mazers-Projekt. Mechanik, Schussrichtungen, Nachladen, Schaden, Kugeltempo, Elternbaum und Drohnenflotten stammen aus Anhang A und bleiben erhalten. Neu umzusetzen ist vor allem eine klare, hochwertige und konsistente visuelle Grammatik:

1. Jede der neun Hauptfamilien besitzt eine sofort erkennbare Base.
2. Alle Unterklassen erben die Base ihrer Familie.
3. Mehrere eng beieinanderliegende Frontrohre erscheinen als **ein gemeinsames Waffenmodul** und nicht als einzelne Drähte aus dem Rumpf.
4. Getrennte Rundumrohre wie bei `octo` bleiben einzeln, sind aber ungefähr so kräftig wie eine normale Standardkanone.
5. CONTROL orientiert sich klar am visuellen Prinzip von diep.io: runder Rumpf, sehr kurze trapezförmige Spawner, Dreiecks-/Spezialdrohnen. Keine langen Launcher.
6. Es gibt vor keiner Kanone einen runden Punkt, Ring oder aufgeklebten Connector.
7. Die visuelle Änderung darf keine Balance-, Treffer- oder Spawnlogik verändern.

## 1. Vorgehen im Repository

Arbeite nicht blind anhand von Dateinamen. Führe zuerst eine kurze Codebasis-Analyse durch und finde:

- die zentrale Klassendefinition bzw. den Klassenbaum,
- den Client-Renderer für Rumpf, Rohre, Zier-Rohre und Drohnen,
- die Projektil-Spawnlogik,
- die serverautoritative Klassen-/Schusslogik,
- existierende Tests, Debug-Seiten oder Screenshot-Galerien.

Danach:

1. Nenne kurz die tatsächlich betroffenen Dateien.
2. Implementiere die Geometrie als kleine, testbare Renderer-Hilfsfunktionen.
3. Halte **logische Emitter** und **visuelle Waffengeometrie** getrennt.
4. Übernimm alle 67 Klassen aus Anhang A.
5. Baue eine lokale Debug-Galerie/Screenshot-Ansicht mit allen 67 Klassen, identischer Zielrichtung und identischem Zoom.
6. Führe vorhandene Tests, Typecheck, Lint und Build aus.
7. Berichte am Ende konkret, was geändert wurde und was nicht getestet werden konnte.

Keine ungefragte Neustrukturierung des gesamten Spiels. Keine Änderungen an unrelated Features. Keine Platzhaltergrafiken.

## 2. Harte technische Trennung: Emitter versus Waffenmodul

Die Einträge in `Rohre` bleiben die Wahrheit für das Spiel:

- Winkel des Projektils,
- seitlicher Spawnversatz,
- Nachlade-/Salvenlogik,
- damageScale,
- Kugeltempo,
- Rückstoß,
- Projektilanzahl.

Die Darstellung darf mehrere Emitter optisch zu einem Modul zusammenfassen. Das Modul verändert **niemals** die Zahl oder Position der tatsächlichen Projektilspawns.

Empfohlenes internes Schema:

```ts
type LogicalEmitter = {
  angle: number;
  versatz: number;
  laenge: number;
  breite: number;
  muendungsbreite: number;
  damageScale?: number;
};

type VisualWeaponGroup =
  | { kind: "single"; emitters: LogicalEmitter[] }
  | { kind: "cluster"; emitters: LogicalEmitter[] };
```

## 3. Verbindliche Familien-Bases

Alle Maße sind lokale Rendererkoordinaten um den Tankmittelpunkt. Zielrichtung ist +X. Die Kollision bleibt grundsätzlich der bestehende Kreis mit Radius 22 px. Die Familienformen sind **visuell**; ändere Hitboxen nicht. Die einzige Ausnahme bleibt die bereits vorhandene Sonderbehandlung des `smasher`, falls dessen Körpertrefferlogik aktuell bereits anders funktioniert.

Die Base wird nach Rohren/Zier-Rohren gezeichnet und verdeckt damit deren Wurzel.

### CORE

```text
circle(cx=0, cy=0, r=22)
```

### RAPID

Weiche, stromlinienförmige Base. Kein zufälliges Polygon.

```text
Path:
M 23 0
Q 18 19 1 22
Q -16 21 -25 10
Q -29 0 -25 -10
Q -16 -21 1 -22
Q 18 -19 23 0
Z
Transform: scale(0.80)
```

Zwei sehr zurückhaltende Linien dürfen die schnelle Familie markieren:

```text
M -10 -12 Q 0 -17 10 -11
M -10  12 Q 0  17 10  11
Transform: scale(0.80)
```

### PRECISION

Gerichtete, flache Präzisions-Base:

```text
M 28 0
L 9 21
L -13 17
L -25 0
L -13 -17
L 9 -21
Z
Transform: scale(0.82)
```

Eine dezente Mittelachse:

```text
M -8 0 H 14
Transform: scale(0.82)
```

### CONTROL

```text
circle(cx=0, cy=0, r=22)
```

CONTROL unterscheidet sich – wie bei diep.io – nicht durch einen Raumschiff-Rumpf, sondern ausschließlich durch Zahl, Winkel und Form der kurzen Spawner sowie durch die Drohnen.

### IMPACT

Schwere Rounded-Square-Base. Keine D-Form, kein Zahnrad, kein Keil, keine Zacken – außer beim Sonderfall `smasher`.

```text
M -14 -27
H 14
Q 27 -27 27 -14
V 14
Q 27 27 14 27
H -14
Q -27 27 -27 14
V -14
Q -27 -27 -14 -27
Z
Transform: scale(0.86)
```

### SPECTER

Ruhige flache Linsenform ohne Einschnitt:

```text
M 28 0
Q 9 18 -12 16
Q -25 10 -28 0
Q -25 -10 -12 -16
Q 9 -18 28 0
Z
Transform: scale(0.84, 1.18)
```

### TEMPEST

```text
circle(cx=0, cy=0, r=22)
```

Vier dezente Reaktorbögen:

```text
M -6 -18 Q 0 -21 6 -18
Rotationen: 0°, 90°, 180°, 270°
```

Kein Zahnrad, keine einzelnen Kugeln.

### SIEGE

Klare Festungs-Base:

```text
M 16 -25
L 25 -16
V 16
L 16 25
H -16
L -25 16
V -16
L -16 -25
Z
Transform: scale(0.92)
```

### AEGIS

Runder Kern plus echter vorgelagerter Schutzbogen:

```text
Kern: circle(cx=-2, cy=0, r=19.5)

Schutzbogen:
M 8 -25
Q 31 0 8 25
L 2 17
Q 17 0 2 -17
Z
Transform: scale(0.90)
```

Der Schutzbogen ist Teil der Base, kein Kanonen-Connector.

### SMASHER-Sonderform

Zwölf alternierende Radien um den Mittelpunkt:

```ts
for (let i = 0; i < 12; i++) {
  const angle = i * Math.PI / 6;
  const radius = i % 2 === 0 ? 25 : 19;
}
```

## 4. Verbindliche Rohrproportionen

Diese Werte betreffen ausschließlich die Darstellung. Projektilspawn und Trefferlogik bleiben unverändert.

```ts
const ROOT_DISTANCE = 13.5;

function visualLength(baseLength: number, emitter: LogicalEmitter) {
  return clamp(baseLength * emitter.laenge * 0.72, 11, 58);
}
```

Standardbreite:

```ts
rootWidth   = 11 * emitter.breite;
muzzleWidth = 11 * emitter.muendungsbreite;
```

Alle Rohre werden **vor** der Base gezeichnet. Dadurch verschwinden ihre inneren Enden unter dem Rumpf. Es darf keinen zusätzlichen Kreis, Punkt, Ring oder Kragen am Übergang geben.

## 5. Gemeinsames Waffenmodul für zwei oder mehr Frontrohre

Das ist die wichtigste visuelle Regel des gesamten Auftrags.

### Gruppierung

Sortiere die feuernden Emitter kreisförmig nach Winkel. Benachbarte Emitter gehören zu derselben Gruppe, wenn ihre Winkeldifferenz höchstens 28° beträgt. Die erste und letzte Gruppe müssen über den 0°/360°-Übergang ebenfalls zusammengeführt werden.

```ts
function normalizedDifference(angle: number, reference: number) {
  return ((angle - reference + 540) % 360) - 180;
}
```

- Gruppe mit einem Emitter: normales Einzelrohr.
- Gruppe mit mindestens zwei Emittern: gemeinsames geschlossenes Waffenmodul.
- Zier-Rohre werden nicht als zusätzliche feuernde Mündungen gezählt.
- `flanker` bleibt vorne und hinten getrennt.
- `octo` bleibt in acht Richtungen getrennt.
- `twin`, `repeater`, `vanguard`, `storm`, `gatling`, `hailstorm`, `vortex`, `arbalest`, `deadeye`, `scorch`, `inferno`, `cataclysm`, `bombard`, `howitzer`, `ragnarok`, `reflector`, `retributor` und `sanctum` erhalten gemeinsame Frontmodule.

### Geometrie des Moduls

1. Berechne die mittlere Richtung über den Vektormittelwert aller Gruppenwinkel.
2. Berechne für jeden Emitter seine Rohrlänge.
3. Das gemeinsame Gehäuse endet zwölf Pixel vor der kürzesten Mündung:

```ts
shortestEnd = min(ROOT_DISTANCE + visualLength(emitter));
splitDistance = max(ROOT_DISTANCE + 8, shortestEnd - 12);
```

4. Bestimme an `ROOT_DISTANCE` und `splitDistance` jeweils die äußere Hüllbreite aller Emitter inklusive `versatz`, Rohrwinkel und interpolierter Breite.
5. Zeichne daraus **ein einziges** geschlossenes Trapez/Polygon als Gehäuse.
6. Zeichne anschließend pro Emitter nur noch den kurzen Mündungsabschnitt von `splitDistance - 0.7` bis zur individuellen Mündung.
7. Die kurzen Mündungsabschnitte besitzen:
   - dieselbe Füllfarbe wie das Gehäuse,
   - Außenkanten und eine Mündungskante,
   - **keine hintere Abschlusskante**.
8. Dadurch bleiben zwischen Gehäuse und Mündungen keine sichtbaren Segmentnähte.
9. Das Gehäuse und alle Mündungen liegen unter der Base. Die Base verdeckt die Wurzel.

### Verbotene Darstellung

- Kein langes Einzelrohr pro Emitter bis in den Tankkörper.
- Keine „Drähte aus einer Kugel“.
- Kein Minirohr-Bündel ohne gemeinsames Gehäuse.
- Keine Punkte an den Mündungen.
- Keine Kugeln oder kreisförmigen Connectoren vor dem Rumpf.
- Keine sichtbaren Querlinien an der Stelle, an der sich das Gehäuse in Mündungen teilt.

## 6. Dicke getrennte Rundumrohre

Getrennte Richtungsrohre werden bewusst viel breiter als ihre alten Rohdaten gerendert. Das ist nur ein visueller Faktor und verändert keine Projektilgröße.

Der Faktor wird nur auf **alleinstehende feuernde Rohre** angewandt, nicht auf Mündungen eines gemeinsamen Frontmoduls und nicht auf Zier-Rohre:

```ts
function radialVisualBoost(tank: TankClass) {
  if (tank.Rohre.length >= 6) return 2.10;
  if (tank.Rohre.length >= 2) return 1.40;
  return 1.00;
}

rootWidth   = 11 * emitter.breite * radialVisualBoost(tank);
muzzleWidth = 11 * emitter.muendungsbreite * radialVisualBoost(tank);
```

Damit gilt:

- `octo`: acht kräftige, ungefähr standardbreite Rohre – keine dünnen Stäbchen.
- `flanker`: ein kräftiges Front- und ein kräftiges Heckrohr.
- Bei einem echten Einzelrohr bleibt Faktor 1.00.
- Bei einem gemeinsamen Mehrrohrmodul bleibt die jeweilige Gruppenberechnung maßgeblich.

## 7. CONTROL – verbindliche kurze Diep.io-Spawner

Alle CONTROL-Klassen verwenden den runden Rumpf r22. Die Spawner liegen hinter dem Rumpf und sind nur etwa 4–8 px außerhalb des Kreisrandes sichtbar. Sie sind kurze Trapeze, keine Kanonenrohre.

Diese Tabelle überschreibt sämtliche CONTROL-`Zier-Rohre` in Anhang A. Nachladen, Schaden, Flottengröße und Verhalten aus Anhang A bleiben erhalten.

```json
{
  "drone": {
    "launchers": [
      {"angle":0,"versatz":0,"laenge":0.72,"breite":0.86,"muendungsbreite":1.22},
      {"angle":180,"versatz":0,"laenge":0.72,"breite":0.86,"muendungsbreite":1.22}
    ],
    "droneShape":"triangle",
    "fleet":4
  },
  "warden": {
    "launchers": [
      {"angle":-35,"versatz":0,"laenge":0.70,"breite":0.76,"muendungsbreite":1.10},
      {"angle":35,"versatz":0,"laenge":0.70,"breite":0.76,"muendungsbreite":1.10}
    ],
    "droneShape":"diamond",
    "fleet":6
  },
  "factory": {
    "launchers": [
      {"angle":0,"versatz":0,"laenge":0.82,"breite":1.28,"muendungsbreite":1.55}
    ],
    "droneShape":"square",
    "fleet":5
  },
  "guardian": {
    "launchers": [
      {"angle":45,"versatz":0,"laenge":0.62,"breite":0.82,"muendungsbreite":1.12},
      {"angle":135,"versatz":0,"laenge":0.62,"breite":0.82,"muendungsbreite":1.12},
      {"angle":225,"versatz":0,"laenge":0.62,"breite":0.82,"muendungsbreite":1.12},
      {"angle":315,"versatz":0,"laenge":0.62,"breite":0.82,"muendungsbreite":1.12}
    ],
    "droneShape":"shield-kite",
    "fleet":5
  },
  "sentinel": {
    "launchers": [
      {"angle":0,"versatz":0,"laenge":0.72,"breite":1.08,"muendungsbreite":1.34},
      {"angle":120,"versatz":0,"laenge":0.72,"breite":1.08,"muendungsbreite":1.34},
      {"angle":240,"versatz":0,"laenge":0.72,"breite":1.08,"muendungsbreite":1.34}
    ],
    "droneShape":"hexagon",
    "fleet":3
  },
  "overseer": {
    "launchers": [
      {"angle":0,"versatz":0,"laenge":0.64,"breite":0.74,"muendungsbreite":1.08},
      {"angle":90,"versatz":0,"laenge":0.64,"breite":0.74,"muendungsbreite":1.08},
      {"angle":180,"versatz":0,"laenge":0.64,"breite":0.74,"muendungsbreite":1.08},
      {"angle":270,"versatz":0,"laenge":0.64,"breite":0.74,"muendungsbreite":1.08}
    ],
    "droneShape":"small-triangle",
    "fleet":8
  },
  "carrier": {
    "launchers": [
      {"angle":-65,"versatz":0,"laenge":0.74,"breite":1.15,"muendungsbreite":1.40},
      {"angle":65,"versatz":0,"laenge":0.74,"breite":1.15,"muendungsbreite":1.40}
    ],
    "droneShape":"rectangle",
    "fleet":6
  },
  "hive": {
    "launchers": [
      {"angle":0,"versatz":0,"laenge":0.58,"breite":0.58,"muendungsbreite":0.92},
      {"angle":72,"versatz":0,"laenge":0.58,"breite":0.58,"muendungsbreite":0.92},
      {"angle":144,"versatz":0,"laenge":0.58,"breite":0.58,"muendungsbreite":0.92},
      {"angle":216,"versatz":0,"laenge":0.58,"breite":0.58,"muendungsbreite":0.92},
      {"angle":288,"versatz":0,"laenge":0.58,"breite":0.58,"muendungsbreite":0.92}
    ],
    "droneShape":"micro-diamond",
    "fleet":10
  },
  "aviary": {
    "launchers": [
      {"angle":-40,"versatz":0,"laenge":0.64,"breite":0.66,"muendungsbreite":1.02},
      {"angle":0,"versatz":0,"laenge":0.64,"breite":0.66,"muendungsbreite":1.02},
      {"angle":40,"versatz":0,"laenge":0.64,"breite":0.66,"muendungsbreite":1.02}
    ],
    "droneShape":"chevron",
    "fleet":9
  },
  "sovereign": {
    "launchers": [
      {"angle":0,"versatz":0,"laenge":0.72,"breite":0.88,"muendungsbreite":1.20},
      {"angle":60,"versatz":0,"laenge":0.64,"breite":0.88,"muendungsbreite":1.20},
      {"angle":120,"versatz":0,"laenge":0.64,"breite":0.88,"muendungsbreite":1.20},
      {"angle":180,"versatz":0,"laenge":0.72,"breite":0.88,"muendungsbreite":1.20},
      {"angle":240,"versatz":0,"laenge":0.64,"breite":0.88,"muendungsbreite":1.20},
      {"angle":300,"versatz":0,"laenge":0.64,"breite":0.88,"muendungsbreite":1.20}
    ],
    "droneShape":"royal-kite",
    "fleet":7
  }
}
```

Wichtig: Die Launcher sind optische Spawner und feuern keine Kugeln. Die tatsächliche Drohnenproduktion bleibt serverautoritativ.

## 8. Zeichenreihenfolge

Verbindliche Reihenfolge im Client-Renderer:

```text
1. optionale Ziel-/Debuglinien
2. Zier-Rohre und CONTROL-Spawner
3. einzelne feuernde Rohre
4. gemeinsame Waffenmodule und deren kurze Mündungen
5. Familien-Base
6. dezente Familienmarkierungen / AEGIS-Schutzbogen
7. Drohnen
8. Effekte wie Mündungsblitz, Schildladung, Hitze oder Tarnung
```

Die Base muss Rohrwurzeln zuverlässig überdecken. Keine sichtbare Naht darf wie ein aufgeklebter Punkt wirken.

## 9. Daten-Priorität

Bei Konflikten gilt diese Reihenfolge:

1. Dieser finale Implementierungsauftrag.
2. Bestehende aktuelle Produktionswerte im Repository, sofern sie nicht ausdrücklich hier überschrieben werden.
3. Anhang A.
4. Alte experimentelle Renderer oder verworfene Designs.

Insbesondere:

- Alle `Rumpfform`-Angaben in Anhang A werden durch Abschnitt 3 dieses Auftrags ersetzt.
- Alle CONTROL-`Zier-Rohre` in Anhang A werden durch Abschnitt 7 ersetzt.
- Rohrwinkel, Rohrzahl, `versatz`, `damageScale`, Nachladen, Schaden, Kugeltempo und Feuerverhalten aus Anhang A bleiben bindend.
- Die visuellen Faktoren `0.72`, `2.10` und `1.40` ändern niemals serverseitige Projektilwerte.

## 10. Abnahmekriterien

Der Auftrag ist erst fertig, wenn alle Punkte erfüllt sind:

- [ ] Alle 67 Klassen existieren weiterhin und sind im Klassenbaum erreichbar.
- [ ] Eine Debug-/Screenshot-Galerie zeigt alle 67 Klassen bei gleicher Skalierung und Zielrichtung.
- [ ] Jede Familie verwendet exakt ihre Base aus Abschnitt 3.
- [ ] Unterklassen erben die Base ihrer Familie.
- [ ] Ab zwei eng gruppierten Frontemittern gibt es ein gemeinsames geschlossenes Waffenmodul.
- [ ] Aus dem Rumpf kommen keine langen einzelnen „Drähte“.
- [ ] Am Übergang zwischen Base und Kanone existiert kein Kreis, Ring oder Punkt.
- [ ] Zwischen Gehäuse und kurzen Mündungen existieren keine sichtbaren Quer-/Segmentnähte.
- [ ] `octo` besitzt acht kräftige Rohre mit Faktor 2.10 und keine dünnen Stäbchen.
- [ ] `flanker` verwendet für seine getrennten Rohre Faktor 1.40.
- [ ] CONTROL besitzt runde Bases und nur kurze Diep.io-artige Spawner.
- [ ] CONTROL-Spawner stehen sichtbar höchstens etwa 4–8 px über den Kreisrand hinaus.
- [ ] Alle zehn CONTROL-Unterklassen haben eine eigene klar lesbare Launcher-Anordnung.
- [ ] Kein Projektilwinkel, Spawnversatz, damageScale, Nachladen, Schaden oder Kugeltempo wurde durch die Optik verändert.
- [ ] Client und Server bleiben deterministisch bzw. autoritativ wie bisher.
- [ ] Bestehende Tests, Typecheck, Lint und Build laufen durch.
- [ ] Der Abschlussbericht nennt die geänderten Dateien und verbleibende offene Punkte.

## 11. Was du ausdrücklich nicht tun sollst

- Nicht wieder zu 67 willkürlichen Sonderkörpern zurückkehren.
- Keine detailreiche Sci-Fi-Concept-Art.
- Keine 3D-Perspektive.
- Keine Panzerketten.
- Keine Mini-Punkte an Gatling-/Storm-Mündungen.
- Keine Kugeln als Kanonenanschluss.
- Keine eigenmächtigen Balanceänderungen.
- Keine Klassen entfernen, obwohl Anhang A langfristige Kürzungsvorschläge enthält.
- Keine alten Screenshots oder verworfenen Experimente als Vorgabe behandeln.

---

## Anhang A – vollständiger Klassen- und Mechanikentwurf der 67 Panzer

**Status:** umsetzungsreifer Erstentwurf 1.0  
**Grundlage:** 40-Hz-Server, Tankradius 22 px, 320-px-Gänge, tödliche Wände  
**Wichtig:** Alle neu eingeführten Bewegungs-, Größen-, Streuungs-, Rückstoß- und Timingwerte sind bewusst als **Schätzwerte für den ersten spielbaren Build** markiert. Die bestehenden Werte für Nachladen, Schaden und Kugeltempo bleiben unverändert.

## Vorab: aufgelöste Widersprüche und technische Annahmen

1. **Bedeutung der Spalte „Schaden“:** Dieser Entwurf interpretiert sie als Schaden **pro Projektil bzw. Drohnenkontakt**. Darum beträgt die Summe der `damageScale`-Werte einer Klasse immer ihre Zahl feuernder Rohre. Falls der aktuelle Code „Schaden“ stattdessen als Gesamtschaden einer Salve versteht, müssen alle `damageScale`-Summen auf `1.00` normalisiert werden.
2. **Stakkato-Klassen:** `repeater`, `scorch`, `inferno` und `retributor` benötigen neben der Rohrgeometrie feste Zeitversätze je Rohr. Diese stehen im Feuerverhalten. Ohne einen solchen Salven-Scheduler widersprechen ihre Beschreibungen dem Bestand.
3. **Storm:** Der bisherige Text verlangt verschiedene Geschwindigkeiten pro Rohr, obwohl nur ein Klassenwert für Kugeltempo existiert. Neuer bindender Text: **„Vier Läufe fächern auf – die Mitte bohrt, außen schließt der Fächer.“** Nur der Schaden wird pro Rohr verteilt; das Kugeltempo bleibt 860.
4. **Hailstorm:** „Deckung gibt es nicht“ ist im Labyrinth falsch. Neuer Text: **„Sieben Läufe verriegeln einen ganzen Gang mit einem einzigen Hagelschlag.“**
5. **Vortex:** „Momentum ohne Ende“ beschreibt keine Mechanik. Neuer Text: **„Fünf eng getaktete Läufe schieben eine wandernde Schrotwand durch den Gang.“**
6. **Mortar/Trebuchet:** „Einschlag“ wird hier als großes, stark rückstoßendes Projektil verstanden, nicht als Explosion oder Flächenschaden. Für echten Flächenschaden wäre eine neue Mechanik nötig.
7. **Specter, Tempest, Siege und Aegis:** Tarnung, Hitze, Eingraben und Schildladung sind im Bestand nicht numerisch definiert. Teil C legt dafür vollständige Erstwerte fest.
8. **Drohnen und Wände:** Drohnen erhalten keine automatische Wegfindung um Wände. Sie bremsen vor einer erkannten Wand, sterben aber bei Kontakt. So bleibt die Labyrinth-Navigation eine echte Fähigkeit und keine verdeckte Autopilot-Funktion.

## Teil A – Designprinzipien

Die Silhouette folgt keiner Sammlung aus 67 beliebigen Sonderformen, sondern einer **Familiengrammatik**. Core ist der neutrale Kreis mit einem ausgewogenen Rohr. Rapid erkennt man an vielen schmalen, vorwiegend frontgerichteten Läufen; Precision an langen, stark zulaufenden Rohren und Stabilisatoren; Control an deutlich geöffneten, nicht feuernden Launchern; Impact an polygonalen, schweren Rümpfen und sehr kurzen Läufen; Specter an dünnen „Stachel“-Rohren mit nach hinten gekehrten Tarnflossen; Tempest an geöffneten Mündungen und sichtbaren Heckentlüftungen; Siege an breiten Kanonen und Abstützungen; Aegis an achteckigen Rümpfen und kurzen Panzerplatten.

Die Stufe wird innerhalb jeder Familie nicht durch eine neue Designsprache, sondern durch **kontrollierte Verdichtung** sichtbar: Level 5 besitzt das Grundmotiv, Level 15 führt eine klare Abzweigung ein, Level 28 überzeichnet genau diese Abzweigung, Level 42 kombiniert das Grundmotiv zu einer Apex-Silhouette. Ein höheres Level bedeutet daher mehr Rhythmus, stärkere Längenstaffelung oder zusätzliche Stützen – nicht automatisch mehr Rohre. Das macht den Klassenbaum lesbar und verhindert, dass der Spieler 67 willkürliche Icons auswendig lernen muss.

## Teil B – alle 67 Klassen

### Datenschema

- Jeder feuernde Lauf enthält alle fünf Rendererwerte plus `damageScale`. `damageScale: 1.00` ist der unveränderte Standard.
- Die Summe von `damageScale` entspricht bei jeder schießenden Klasse exakt der vorhandenen Rohrzahl.
- Zier-Rohre enthalten ausschließlich die fünf Rendererwerte und feuern nie.
- `Rumpfform` beschreibt eine Draufsicht; „regelmäßig“ bedeutet gleich lange Kanten und Mittelpunkt im Tankzentrum.

```json
[
  {"id":"core","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":1.00,"breite":1.00,"muendungsbreite":0.82,"damageScale":1.00}],"Zier-Rohre":[],"Feuerverhalten":"Ein gerader Schuss alle 300 ms; kein Salvenversatz und 0,8° Streuung.","Anders_als_Geschwister":"Neutrale Rohrproportionen, neutraler Rückstoß und weder Flächenabdeckung noch Burst."},

  {"id":"rapid","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":0.94,"breite":0.82,"muendungsbreite":0.76,"damageScale":1.00}],"Zier-Rohre":[],"Feuerverhalten":"Ein schmaler Projektilstrom alle 190 ms mit 1,8° Streuung.","Anders_als_Geschwister":"Der sauberste Dauerfeuerstrahl der Familie; keine Salve und kein Seitenschutz."},
  {"id":"twin","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":-0.58,"laenge":1.00,"breite":0.78,"muendungsbreite":0.72,"damageScale":1.00},{"angle":0,"versatz":0.58,"laenge":1.00,"breite":0.78,"muendungsbreite":0.72,"damageScale":1.00}],"Zier-Rohre":[],"Feuerverhalten":"Die parallelen Läufe wechseln sich alle 125 ms ab; jeder Lauf lädt 250 ms.","Anders_als_Geschwister":"Zwei getrennte Trefferlinien verbreitern den Druck ohne einen Fächer zu bilden."},
  {"id":"repeater","Rumpfform":"Kreis r22","Rohre":[{"angle":-2,"versatz":-0.78,"laenge":0.90,"breite":0.66,"muendungsbreite":0.60,"damageScale":1.00},{"angle":0,"versatz":0,"laenge":1.06,"breite":0.66,"muendungsbreite":0.60,"damageScale":1.00},{"angle":2,"versatz":0.78,"laenge":0.90,"breite":0.66,"muendungsbreite":0.60,"damageScale":1.00}],"Zier-Rohre":[],"Feuerverhalten":"Dreiersalve bei 0/70/140 ms, danach beginnt die 340-ms-Zykluszeit erneut.","Anders_als_Geschwister":"Spürbarer Mini-Burst mit Pause statt eines gleichmäßigen Stroms."},
  {"id":"flanker","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":1.00,"breite":0.82,"muendungsbreite":0.74,"damageScale":1.00},{"angle":180,"versatz":0,"laenge":0.86,"breite":0.78,"muendungsbreite":0.70,"damageScale":1.00}],"Zier-Rohre":[],"Feuerverhalten":"Front- und Hecklauf feuern gleichzeitig alle 240 ms.","Anders_als_Geschwister":"Halber Vorwärts-DPS, dafür permanente Rückendeckung und symmetrischer Rückstoß."},
  {"id":"vanguard","Rumpfform":"Kreis r22","Rohre":[{"angle":-12,"versatz":0,"laenge":0.84,"breite":0.62,"muendungsbreite":0.56,"damageScale":1.00},{"angle":-4,"versatz":-0.30,"laenge":1.00,"breite":0.62,"muendungsbreite":0.56,"damageScale":1.00},{"angle":4,"versatz":0.30,"laenge":1.00,"breite":0.62,"muendungsbreite":0.56,"damageScale":1.00},{"angle":12,"versatz":0,"laenge":0.84,"breite":0.62,"muendungsbreite":0.56,"damageScale":1.00}],"Zier-Rohre":[],"Feuerverhalten":"Vier Geschosse verlassen die Läufe gleichzeitig alle 330 ms in einem 24°-Fächer.","Anders_als_Geschwister":"Eine einzelne breite Nadelsalve statt kontinuierlicher Einzelspuren."},
  {"id":"storm","Rumpfform":"Kreis r22","Rohre":[{"angle":-18,"versatz":0,"laenge":0.86,"breite":0.60,"muendungsbreite":0.54,"damageScale":0.75},{"angle":-6,"versatz":-0.28,"laenge":1.04,"breite":0.66,"muendungsbreite":0.58,"damageScale":1.25},{"angle":6,"versatz":0.28,"laenge":1.04,"breite":0.66,"muendungsbreite":0.58,"damageScale":1.25},{"angle":18,"versatz":0,"laenge":0.86,"breite":0.60,"muendungsbreite":0.54,"damageScale":0.75}],"Zier-Rohre":[],"Feuerverhalten":"Viererschuss gleichzeitig alle 260 ms; die beiden Innenläufe verursachen je 1,25×, die Außenläufe je 0,75× Schaden.","Anders_als_Geschwister":"Der Fächer markiert außen, bestraft aber präzises Zentrieren deutlich stärker."},
  {"id":"gatling","Rumpfform":"Kreis r22","Rohre":[{"angle":-7,"versatz":0,"laenge":0.84,"breite":0.48,"muendungsbreite":0.44,"damageScale":1.00},{"angle":-4,"versatz":-0.28,"laenge":0.94,"breite":0.48,"muendungsbreite":0.44,"damageScale":1.00},{"angle":-1,"versatz":-0.55,"laenge":1.04,"breite":0.48,"muendungsbreite":0.44,"damageScale":1.00},{"angle":1,"versatz":0.55,"laenge":1.04,"breite":0.48,"muendungsbreite":0.44,"damageScale":1.00},{"angle":4,"versatz":0.28,"laenge":0.94,"breite":0.48,"muendungsbreite":0.44,"damageScale":1.00},{"angle":7,"versatz":0,"laenge":0.84,"breite":0.48,"muendungsbreite":0.44,"damageScale":1.00}],"Zier-Rohre":[],"Feuerverhalten":"Sechs Läufe rotieren in 46,7-ms-Abständen; jeder Lauf wiederholt nach 280 ms.","Anders_als_Geschwister":"Nahezu lückenloses Sperrfeuer mit kleinem 14°-Kegel und geringem Einzeltreffergewicht."},
  {"id":"octo","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":1.00,"breite":0.60,"muendungsbreite":0.54,"damageScale":1.00},{"angle":45,"versatz":0,"laenge":0.88,"breite":0.60,"muendungsbreite":0.54,"damageScale":1.00},{"angle":90,"versatz":0,"laenge":0.82,"breite":0.60,"muendungsbreite":0.54,"damageScale":1.00},{"angle":135,"versatz":0,"laenge":0.88,"breite":0.60,"muendungsbreite":0.54,"damageScale":1.00},{"angle":180,"versatz":0,"laenge":1.00,"breite":0.60,"muendungsbreite":0.54,"damageScale":1.00},{"angle":225,"versatz":0,"laenge":0.88,"breite":0.60,"muendungsbreite":0.54,"damageScale":1.00},{"angle":270,"versatz":0,"laenge":0.82,"breite":0.60,"muendungsbreite":0.54,"damageScale":1.00},{"angle":315,"versatz":0,"laenge":0.88,"breite":0.60,"muendungsbreite":0.54,"damageScale":1.00}],"Zier-Rohre":[],"Feuerverhalten":"Alle acht Richtungen feuern gleichzeitig alle 300 ms.","Anders_als_Geschwister":"Nur 12,5 % des Salvenschadens zeigt exakt nach vorn, dafür existiert kein blinder Winkel."},
  {"id":"hailstorm","Rumpfform":"Kreis r22","Rohre":[{"angle":-24,"versatz":0,"laenge":0.78,"breite":0.50,"muendungsbreite":0.46,"damageScale":1.00},{"angle":-16,"versatz":0,"laenge":0.86,"breite":0.50,"muendungsbreite":0.46,"damageScale":1.00},{"angle":-8,"versatz":0,"laenge":0.94,"breite":0.50,"muendungsbreite":0.46,"damageScale":1.00},{"angle":0,"versatz":0,"laenge":1.04,"breite":0.54,"muendungsbreite":0.48,"damageScale":1.00},{"angle":8,"versatz":0,"laenge":0.94,"breite":0.50,"muendungsbreite":0.46,"damageScale":1.00},{"angle":16,"versatz":0,"laenge":0.86,"breite":0.50,"muendungsbreite":0.46,"damageScale":1.00},{"angle":24,"versatz":0,"laenge":0.78,"breite":0.50,"muendungsbreite":0.46,"damageScale":1.00}],"Zier-Rohre":[],"Feuerverhalten":"Sieben Geschosse bilden gleichzeitig alle 360 ms einen 48°-Gangriegel.","Anders_als_Geschwister":"Die breiteste einzelne Frontsalve der Familie mit klarer Verwundbarkeitslücke zwischen den Salven."},
  {"id":"vortex","Rumpfform":"Kreis r22","Rohre":[{"angle":-26,"versatz":0,"laenge":0.76,"breite":0.64,"muendungsbreite":0.58,"damageScale":1.00},{"angle":-13,"versatz":0,"laenge":0.90,"breite":0.66,"muendungsbreite":0.60,"damageScale":1.00},{"angle":0,"versatz":0,"laenge":1.08,"breite":0.70,"muendungsbreite":0.62,"damageScale":1.00},{"angle":13,"versatz":0,"laenge":0.90,"breite":0.66,"muendungsbreite":0.60,"damageScale":1.00},{"angle":26,"versatz":0,"laenge":0.76,"breite":0.64,"muendungsbreite":0.58,"damageScale":1.00}],"Zier-Rohre":[],"Feuerverhalten":"Die fünf Läufe feuern von links nach rechts in 27-ms-Schritten und kehren beim nächsten 270-ms-Zyklus die Reihenfolge um.","Anders_als_Geschwister":"Eine seitlich wandernde Druckfront zwingt Gegner zum Rhythmuslesen statt nur zum Ausweichen einer Salve."},

  {"id":"sniper","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":1.00,"breite":0.62,"muendungsbreite":0.52,"damageScale":1.00}],"Zier-Rohre":[],"Feuerverhalten":"Ein präziser Schuss alle 680 ms mit 0,20° Streuung.","Anders_als_Geschwister":"Unverzierter Einstieg in die Familie; höchste Lesbarkeit und mittlerer Precision-Burst."},
  {"id":"railgun","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":1.12,"breite":0.50,"muendungsbreite":0.42,"damageScale":1.00}],"Zier-Rohre":[{"angle":180,"versatz":0,"laenge":0.42,"breite":0.85,"muendungsbreite":1.05}],"Feuerverhalten":"Ein nadeldünner Schuss alle 1000 ms mit 0,08° Streuung und starkem Rückstoß.","Anders_als_Geschwister":"Langer Vorderstachel plus breiter Heckisolator vermitteln die geradlinige Hochenergieachse."},
  {"id":"hunter","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":0.92,"breite":0.68,"muendungsbreite":0.56,"damageScale":1.00}],"Zier-Rohre":[{"angle":145,"versatz":0,"laenge":0.34,"breite":0.34,"muendungsbreite":0.24},{"angle":215,"versatz":0,"laenge":0.34,"breite":0.34,"muendungsbreite":0.24}],"Feuerverhalten":"Ein Schuss alle 500 ms mit 0,35° Streuung und reduziertem Rückstoß.","Anders_als_Geschwister":"Kurzes Rohr und zwei rückwärts gepfeilte Flossen signalisieren Bewegung statt Standfeuer."},
  {"id":"arbalest","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":-0.46,"laenge":1.00,"breite":0.52,"muendungsbreite":0.44,"damageScale":1.00},{"angle":0,"versatz":0.46,"laenge":1.00,"breite":0.52,"muendungsbreite":0.44,"damageScale":1.00}],"Zier-Rohre":[],"Feuerverhalten":"Beide Präzisionsläufe feuern gleichzeitig alle 750 ms ohne Winkelstreuung zwischen den Spuren.","Anders_als_Geschwister":"Zwei parallele Trefferachsen bestrafen seitliches Ausweichen, ohne einen Streukegel zu erzeugen."},
  {"id":"ballista","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":1.08,"breite":0.86,"muendungsbreite":0.36,"damageScale":1.00}],"Zier-Rohre":[{"angle":0,"versatz":-0.82,"laenge":0.78,"breite":0.22,"muendungsbreite":0.18},{"angle":0,"versatz":0.82,"laenge":0.78,"breite":0.22,"muendungsbreite":0.18}],"Feuerverhalten":"Ein stark durchschlagender Bolzen alle 880 ms mit 0,12° Streuung.","Anders_als_Geschwister":"Das extrem zulaufende Mittelrohr zwischen zwei Schienen wirkt wie ein geführter Bolzenwerfer."},
  {"id":"lancer","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":1.18,"breite":0.42,"muendungsbreite":0.30,"damageScale":1.00}],"Zier-Rohre":[{"angle":180,"versatz":0,"laenge":0.62,"breite":0.68,"muendungsbreite":0.92}],"Feuerverhalten":"Ein extremer Einzelschuss alle 1300 ms mit 0,04° Streuung und 150-ms-Mündungsblitz-Warnung.","Anders_als_Geschwister":"Längste Nadel und großer Heckgegenkörper machen Vorbereitung und Rückstoß schon an der Form sichtbar."},
  {"id":"phantom","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":1.02,"breite":0.45,"muendungsbreite":0.38,"damageScale":1.00}],"Zier-Rohre":[{"angle":155,"versatz":0,"laenge":0.48,"breite":0.28,"muendungsbreite":0.18},{"angle":205,"versatz":0,"laenge":0.48,"breite":0.28,"muendungsbreite":0.18}],"Feuerverhalten":"Ein schneller Präzisionsschuss alle 620 ms mit 0,10° Streuung und kleinem Rückstoß.","Anders_als_Geschwister":"Die lange schmale Spitze mit stark gepfeilten Heckflossen liest sich als mobiler Hochgeschwindigkeitssniper."},
  {"id":"deadeye","Rumpfform":"Kreis r22","Rohre":[{"angle":-1.5,"versatz":-0.42,"laenge":1.06,"breite":0.48,"muendungsbreite":0.40,"damageScale":1.00},{"angle":1.5,"versatz":0.42,"laenge":1.06,"breite":0.48,"muendungsbreite":0.40,"damageScale":1.00}],"Zier-Rohre":[{"angle":180,"versatz":0,"laenge":0.30,"breite":0.46,"muendungsbreite":0.62}],"Feuerverhalten":"Beide Läufe schießen gleichzeitig alle 800 ms; der bestehende Verwundetenbonus wird erst nach der normalen Trefferberechnung angewandt.","Anders_als_Geschwister":"Minimal auseinanderlaufende Doppelläufe decken eine Fluchtlinie ab, bleiben aber deutlich präziser als Rapid-Fächer."},
  {"id":"siegebreaker","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":1.15,"breite":1.05,"muendungsbreite":0.44,"damageScale":1.00}],"Zier-Rohre":[{"angle":90,"versatz":0,"laenge":0.28,"breite":0.46,"muendungsbreite":0.72},{"angle":270,"versatz":0,"laenge":0.28,"breite":0.46,"muendungsbreite":0.72}],"Feuerverhalten":"Ein schwerer Bolzen alle 1180 ms mit 0,08° Streuung und 28 % stärkerem Rückstoß als der Sniper.","Anders_als_Geschwister":"Massiver Trichterlauf und seitliche Abstützungen betonen Durchschlag statt reine Geschwindigkeit."},
  {"id":"eclipse","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":1.12,"breite":0.90,"muendungsbreite":0.26,"damageScale":1.00}],"Zier-Rohre":[{"angle":150,"versatz":0,"laenge":0.38,"breite":0.30,"muendungsbreite":0.18},{"angle":180,"versatz":0,"laenge":0.48,"breite":0.70,"muendungsbreite":0.92},{"angle":210,"versatz":0,"laenge":0.38,"breite":0.30,"muendungsbreite":0.18}],"Feuerverhalten":"Ein Apex-Schuss alle 1150 ms mit 0,03° Streuung, 120-ms-Warnblitz und dem stärksten Precision-Rückstoß.","Anders_als_Geschwister":"Eine breite dunkle Wurzel kollabiert optisch zur dünnsten Mündung; drei Heckelemente geben eine einmalige Pfeilsilhouette."},

  {"id":"drone","Rumpfform":"Kreis r22","Rohre":[],"Zier-Rohre":[{"angle":0,"versatz":0,"laenge":1.00,"breite":0.72,"muendungsbreite":1.35}],"Feuerverhalten":"Der Frontlauncher ersetzt fehlende Drohnen nacheinander alle 720 ms; Linksklick zieht und Rechtsklick stößt die Flotte ab.","Anders_als_Geschwister":"Ein einzelner neutraler Launcher und vier Allzweckdrohnen bilden die leicht lesbare Basisklasse."},
  {"id":"warden","Rumpfform":"Kreis r22","Rohre":[],"Zier-Rohre":[{"angle":-35,"versatz":0,"laenge":0.92,"breite":0.66,"muendungsbreite":1.18},{"angle":35,"versatz":0,"laenge":0.92,"breite":0.66,"muendungsbreite":1.18}],"Feuerverhalten":"Bei fehlender Flotte entsteht alle 620 ms genau eine Drohne; die beiden Launcher wechseln sich dabei ab, ohne Klick fängt der Ring nahe Geschosse ab.","Anders_als_Geschwister":"Geteilter Fronttrichter und dichter Schutzring priorisieren Verteidigung statt Reichweite."},
  {"id":"factory","Rumpfform":"Kreis r22","Rohre":[],"Zier-Rohre":[{"angle":0,"versatz":0,"laenge":1.15,"breite":1.25,"muendungsbreite":1.75}],"Feuerverhalten":"Ein breiter Fertigungsschacht ersetzt eine der fünf schweren Drohnen alle 800 ms.","Anders_als_Geschwister":"Wenige quadratische Einheiten und der größte einzelne Launcher lesen sich als Produktionsmaschine."},
  {"id":"guardian","Rumpfform":"Kreis r22","Rohre":[],"Zier-Rohre":[{"angle":45,"versatz":0,"laenge":0.72,"breite":0.58,"muendungsbreite":1.02},{"angle":135,"versatz":0,"laenge":0.72,"breite":0.58,"muendungsbreite":1.02},{"angle":225,"versatz":0,"laenge":0.72,"breite":0.58,"muendungsbreite":1.02},{"angle":315,"versatz":0,"laenge":0.72,"breite":0.58,"muendungsbreite":1.02}],"Feuerverhalten":"Bei fehlender Flotte entsteht alle 700 ms genau eine Schilddrohne aus der nächsten diagonalen Bucht; ohne Klick hält sie einen engen Orbit.","Anders_als_Geschwister":"Die X-Silhouette und kurze Reichweite der Flotte machen den persönlichen Schutz sichtbar."},
  {"id":"sentinel","Rumpfform":"Kreis r22","Rohre":[],"Zier-Rohre":[{"angle":0,"versatz":0,"laenge":0.92,"breite":0.95,"muendungsbreite":1.45},{"angle":120,"versatz":0,"laenge":0.78,"breite":0.90,"muendungsbreite":1.34},{"angle":240,"versatz":0,"laenge":0.78,"breite":0.90,"muendungsbreite":1.34}],"Feuerverhalten":"Bei fehlender Flotte ersetzt alle 900 ms genau die nächste Bucht in Drehrichtung eine schwere Wächterdrohne.","Anders_als_Geschwister":"Nur drei sehr große sechseckige Drohnen erzeugen Einzelkörperkontrolle statt Schwarmfläche."},
  {"id":"overseer","Rumpfform":"Kreis r22","Rohre":[],"Zier-Rohre":[{"angle":0,"versatz":0,"laenge":0.82,"breite":0.60,"muendungsbreite":1.10},{"angle":90,"versatz":0,"laenge":0.82,"breite":0.60,"muendungsbreite":1.10},{"angle":180,"versatz":0,"laenge":0.82,"breite":0.60,"muendungsbreite":1.10},{"angle":270,"versatz":0,"laenge":0.82,"breite":0.60,"muendungsbreite":1.10}],"Feuerverhalten":"Bei fehlender Flotte entsteht alle 580 ms genau eine leichte Drohne; die vier Kardinalbuchten werden reihum verwendet.","Anders_als_Geschwister":"Große Reichweite, vierachsige Launcherform und acht leicht trennbare Einheiten belohnen Mikromanagement."},
  {"id":"carrier","Rumpfform":"Kreis r22","Rohre":[],"Zier-Rohre":[{"angle":-65,"versatz":0,"laenge":1.08,"breite":1.05,"muendungsbreite":1.52},{"angle":65,"versatz":0,"laenge":1.08,"breite":1.05,"muendungsbreite":1.52}],"Feuerverhalten":"Bei fehlender Flotte entsteht alle 850 ms genau eine schwere Drohne; die beiden Seitenhangars wechseln sich ab.","Anders_als_Geschwister":"Breite Seitensilhouette und langsame Rechteckdrohnen erzeugen eine vorrückende Front statt eines Rings."},
  {"id":"hive","Rumpfform":"Kreis r22","Rohre":[],"Zier-Rohre":[{"angle":0,"versatz":0,"laenge":0.66,"breite":0.44,"muendungsbreite":0.94},{"angle":72,"versatz":0,"laenge":0.66,"breite":0.44,"muendungsbreite":0.94},{"angle":144,"versatz":0,"laenge":0.66,"breite":0.44,"muendungsbreite":0.94},{"angle":216,"versatz":0,"laenge":0.66,"breite":0.44,"muendungsbreite":0.94},{"angle":288,"versatz":0,"laenge":0.66,"breite":0.44,"muendungsbreite":0.94}],"Feuerverhalten":"Bei fehlender Flotte entsteht alle 550 ms genau eine Mikro-Drohne; die fünf Minibuchten werden reihum verwendet.","Anders_als_Geschwister":"Die kleinste Einheitengröße und höchste Nachschubrate verwandeln einzelne Verluste in Verbrauchsmaterial."},
  {"id":"aviary","Rumpfform":"Kreis r22","Rohre":[],"Zier-Rohre":[{"angle":-40,"versatz":0,"laenge":1.02,"breite":0.42,"muendungsbreite":0.92},{"angle":0,"versatz":0,"laenge":1.14,"breite":0.42,"muendungsbreite":0.96},{"angle":40,"versatz":0,"laenge":1.02,"breite":0.42,"muendungsbreite":0.92}],"Feuerverhalten":"Bei fehlender Flotte entsteht alle 560 ms genau eine Chevrondrohne; die drei schlanken Nester werden reihum verwendet.","Anders_als_Geschwister":"Die Flotte startet als vorwärts gerichteter Keil und tauscht Haltbarkeit gegen die höchste Angriffsgeschwindigkeit."},
  {"id":"sovereign","Rumpfform":"Kreis r22","Rohre":[],"Zier-Rohre":[{"angle":0,"versatz":0,"laenge":1.06,"breite":0.76,"muendungsbreite":1.32},{"angle":60,"versatz":0,"laenge":0.78,"breite":0.62,"muendungsbreite":1.10},{"angle":120,"versatz":0,"laenge":0.78,"breite":0.62,"muendungsbreite":1.10},{"angle":180,"versatz":0,"laenge":0.92,"breite":0.70,"muendungsbreite":1.24},{"angle":240,"versatz":0,"laenge":0.78,"breite":0.62,"muendungsbreite":1.10},{"angle":300,"versatz":0,"laenge":0.78,"breite":0.62,"muendungsbreite":1.10}],"Feuerverhalten":"Bei fehlender Flotte entsteht alle 600 ms genau ein Wächter; die sechs Buchten werden reihum verwendet.","Anders_als_Geschwister":"Der vollständige Sechsstern und die adaptive Siebenerformation verbinden Schutzring und Angriffskeil als Apex."},

  {"id":"rammer","Rumpfform":"Regelmäßiges Sechseck r23, Spitze bei 0°","Rohre":[{"angle":0,"versatz":0,"laenge":0.82,"breite":0.80,"muendungsbreite":0.68,"damageScale":1.00}],"Zier-Rohre":[],"Feuerverhalten":"Ein kurzer Nahbereichsschuss alle 450 ms mit erhöhtem Bewegungsrückstoß nach hinten.","Anders_als_Geschwister":"Leichtester polygonaler Rumpf und unverbaute Front halten den Fokus auf aktives Rammen."},
  {"id":"crusher","Rumpfform":"Regelmäßiges Achteck r24, Kante bei 0°","Rohre":[{"angle":0,"versatz":0,"laenge":0.74,"breite":0.86,"muendungsbreite":0.72,"damageScale":1.00}],"Zier-Rohre":[{"angle":150,"versatz":0,"laenge":0.30,"breite":0.52,"muendungsbreite":0.82},{"angle":210,"versatz":0,"laenge":0.30,"breite":0.52,"muendungsbreite":0.82}],"Feuerverhalten":"Ein stumpfer Schuss alle 500 ms; die beiden Zierdüsen markieren den hohen Vorwärtsimpuls.","Anders_als_Geschwister":"Breiter Rumpf und Doppelheck wirken schwerer als der Rammer, ohne zur statischen Festung zu werden."},
  {"id":"bulwark","Rumpfform":"Regelmäßiges Zwölfeck r24, Kante bei 0°","Rohre":[{"angle":0,"versatz":0,"laenge":0.82,"breite":1.12,"muendungsbreite":0.92,"damageScale":1.00}],"Zier-Rohre":[{"angle":90,"versatz":0,"laenge":0.34,"breite":1.20,"muendungsbreite":1.38},{"angle":270,"versatz":0,"laenge":0.34,"breite":1.20,"muendungsbreite":1.38}],"Feuerverhalten":"Ein schweres Projektil alle 650 ms mit geringem Eigenrückstoß.","Anders_als_Geschwister":"Zwei breite Seitenplatten zeigen Haltbarkeit und Quersperre statt Geschwindigkeit."},
  {"id":"blitz","Rumpfform":"Regelmäßiges Sechseck r22, Kante bei 0°","Rohre":[{"angle":0,"versatz":0,"laenge":0.86,"breite":0.66,"muendungsbreite":0.54,"damageScale":1.00}],"Zier-Rohre":[{"angle":180,"versatz":0,"laenge":0.44,"breite":0.58,"muendungsbreite":1.10}],"Feuerverhalten":"Ein leichter Schuss alle 500 ms; die vorhandene Tempokopplung berechnet Körperschaden aus der Geschwindigkeit vor dem Kontakt.","Anders_als_Geschwister":"Schmale Spitze und einzelne große Heckdüse lesen sich als Beschleuniger, nicht als Panzerung."},
  {"id":"rampart","Rumpfform":"Regelmäßiges Achteck r25, Spitze bei 0°","Rohre":[{"angle":0,"versatz":0,"laenge":0.76,"breite":1.18,"muendungsbreite":0.98,"damageScale":1.00}],"Zier-Rohre":[{"angle":-28,"versatz":0,"laenge":0.38,"breite":0.82,"muendungsbreite":1.02},{"angle":28,"versatz":0,"laenge":0.38,"breite":0.82,"muendungsbreite":1.02}],"Feuerverhalten":"Ein schwerer Schuss alle 700 ms; zwei Frontplatten rahmen den Rammpunkt ein.","Anders_als_Geschwister":"Langsame Keilfront konzentriert Schutz nach vorn und lässt das Heck bewusst offen."},
  {"id":"juggernaut","Rumpfform":"Regelmäßiges Zwölfeck r26, Spitze bei 0°","Rohre":[{"angle":0,"versatz":0,"laenge":0.68,"breite":0.72,"muendungsbreite":0.62,"damageScale":1.00}],"Zier-Rohre":[{"angle":90,"versatz":0,"laenge":0.38,"breite":1.06,"muendungsbreite":1.26},{"angle":180,"versatz":0,"laenge":0.32,"breite":1.06,"muendungsbreite":1.26},{"angle":270,"versatz":0,"laenge":0.38,"breite":1.06,"muendungsbreite":1.26}],"Feuerverhalten":"Ein sehr kurzer Schuss alle 620 ms; Projektilrückstoß ist auf 45 % des Rammer-Werts reduziert.","Anders_als_Geschwister":"Drei Panzerplatten und der größte Crusher-Rumpf vermitteln Trägheit und Flankenschutz."},
  {"id":"fortress","Rumpfform":"Regelmäßiges Achteck r26, Kante bei 0°","Rohre":[{"angle":0,"versatz":0,"laenge":0.70,"breite":1.42,"muendungsbreite":1.12,"damageScale":1.00}],"Zier-Rohre":[{"angle":90,"versatz":0,"laenge":0.46,"breite":1.35,"muendungsbreite":1.55},{"angle":180,"versatz":0,"laenge":0.46,"breite":1.35,"muendungsbreite":1.55},{"angle":270,"versatz":0,"laenge":0.46,"breite":1.35,"muendungsbreite":1.55}],"Feuerverhalten":"Ein breites Projektil alle 750 ms; der Schuss bewegt den Tank nur minimal.","Anders_als_Geschwister":"Kanonenblock und drei gleich breite Stützen bilden ein eindeutiges stationäres T."},
  {"id":"comet","Rumpfform":"Regelmäßiges Sechseck r21, Spitze bei 0°","Rohre":[{"angle":0,"versatz":0,"laenge":0.76,"breite":0.54,"muendungsbreite":0.44,"damageScale":1.00}],"Zier-Rohre":[{"angle":165,"versatz":0,"laenge":0.48,"breite":0.42,"muendungsbreite":0.90},{"angle":195,"versatz":0,"laenge":0.48,"breite":0.42,"muendungsbreite":0.90}],"Feuerverhalten":"Ein kleiner Schuss alle 550 ms; Doppelheckdüsen visualisieren den höchsten Bewegungsmultiplikator.","Anders_als_Geschwister":"Kleinster Impact-Rumpf, lange Doppeldüse und dünne Nase maximieren das Gefühl eines Geschosses auf Beinen."},
  {"id":"smasher","Rumpfform":"Sechs gleichmäßig verteilte Außenstacheln; Kerndurchmesser 40 px, Spitzenradius 30 px, erster Stachel bei 0°","Rohre":[],"Zier-Rohre":[],"Feuerverhalten":"Kein Projektil; Schaden entsteht ausschließlich bei Rumpfkontakt.","Anders_als_Geschwister":"Einzige vollständig rohrlose und stachelige Silhouette im gesamten Baum."},
  {"id":"behemoth","Rumpfform":"Regelmäßiges Zehneck r26, Kante bei 0°","Rohre":[{"angle":0,"versatz":0,"laenge":0.72,"breite":1.48,"muendungsbreite":1.18,"damageScale":1.00}],"Zier-Rohre":[{"angle":-42,"versatz":0,"laenge":0.42,"breite":1.08,"muendungsbreite":1.30},{"angle":42,"versatz":0,"laenge":0.42,"breite":1.08,"muendungsbreite":1.30}],"Feuerverhalten":"Ein massives Projektil alle 820 ms; der Rückstoß bremst Vorwärtsfahrt kurz statt den Tank zurückzuwerfen.","Anders_als_Geschwister":"Zehneck und zwei schräge Schulterplatten erzeugen die breiteste reine Front des Impact-Zweigs."},
  {"id":"leviathan","Rumpfform":"Regelmäßiges Zwölfeck r27, Kante bei 0°","Rohre":[{"angle":0,"versatz":0,"laenge":0.68,"breite":1.58,"muendungsbreite":1.28,"damageScale":1.00}],"Zier-Rohre":[{"angle":70,"versatz":0,"laenge":0.40,"breite":1.16,"muendungsbreite":1.38},{"angle":110,"versatz":0,"laenge":0.34,"breite":1.10,"muendungsbreite":1.30},{"angle":250,"versatz":0,"laenge":0.34,"breite":1.10,"muendungsbreite":1.30},{"angle":290,"versatz":0,"laenge":0.40,"breite":1.16,"muendungsbreite":1.38}],"Feuerverhalten":"Ein Apex-Projektil alle 800 ms; vier Seitenplatten halten die Silhouette auch beim Rückzug massiv.","Anders_als_Geschwister":"Größter Rumpf, größter Rohrblock und vier gestaffelte Platten machen ihn zur sichtbaren Stahlwand."},

  {"id":"specter","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":1.00,"breite":0.72,"muendungsbreite":0.54,"damageScale":1.00}],"Zier-Rohre":[{"angle":180,"versatz":0,"laenge":0.28,"breite":0.26,"muendungsbreite":0.16}],"Feuerverhalten":"Ein Schuss alle 550 ms; Feuern setzt die Tarnung sofort auf 0 % Sichtreduktion zurück.","Anders_als_Geschwister":"Ein einzelner dünner Heckstachel ist das unverwechselbare Tarnfamilien-Motiv."},
  {"id":"wraith","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":0.90,"breite":0.64,"muendungsbreite":0.46,"damageScale":1.00}],"Zier-Rohre":[{"angle":150,"versatz":0,"laenge":0.38,"breite":0.28,"muendungsbreite":0.16},{"angle":210,"versatz":0,"laenge":0.38,"breite":0.28,"muendungsbreite":0.16}],"Feuerverhalten":"Ein Schuss alle 420 ms; Enttarnung und erneute Tarnung laufen schneller als beim Specter.","Anders_als_Geschwister":"Kurze Frontnadel und zwei gespreizte Heckflossen stehen für schnelles Auftauchen und Verschwinden."},
  {"id":"shade","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":1.08,"breite":0.92,"muendungsbreite":0.58,"damageScale":1.00}],"Zier-Rohre":[{"angle":180,"versatz":0,"laenge":0.46,"breite":0.68,"muendungsbreite":0.34}],"Feuerverhalten":"Ein schwerer Tarnschuss alle 780 ms; volle Sichtbarkeit hält nach dem Schuss länger an.","Anders_als_Geschwister":"Breiter langer Vorderkeil und einzelner schwerer Heckkeil vermitteln Burst statt Mobilität."},
  {"id":"mirage","Rumpfform":"Kreis r22","Rohre":[{"angle":-3,"versatz":-0.42,"laenge":1.00,"breite":0.56,"muendungsbreite":0.40,"damageScale":1.00},{"angle":3,"versatz":0.42,"laenge":1.00,"breite":0.56,"muendungsbreite":0.40,"damageScale":1.00}],"Zier-Rohre":[{"angle":180,"versatz":0,"laenge":0.34,"breite":0.26,"muendungsbreite":0.14}],"Feuerverhalten":"Zwei leicht auseinanderlaufende Stiche feuern gleichzeitig alle 500 ms und brechen die Tarnung gemeinsam.","Anders_als_Geschwister":"Nur diese Tarnklasse besitzt ein symmetrisches Nadelpaar und erzeugt zwei mögliche Ausweichlinien."},
  {"id":"revenant","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":0.78,"breite":0.78,"muendungsbreite":0.60,"damageScale":1.00}],"Zier-Rohre":[{"angle":160,"versatz":0,"laenge":0.42,"breite":0.34,"muendungsbreite":0.72},{"angle":180,"versatz":0,"laenge":0.52,"breite":0.42,"muendungsbreite":0.86},{"angle":200,"versatz":0,"laenge":0.42,"breite":0.34,"muendungsbreite":0.72}],"Feuerverhalten":"Ein kurzer Schuss alle 600 ms; Rammkontakt bricht Tarnung 120 ms vor der Schadensprüfung sichtbar auf.","Anders_als_Geschwister":"Drei Heckdüsen und die kürzeste Front markieren den einzigen Tarn-Rammer."},
  {"id":"eidolon","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":1.12,"breite":0.82,"muendungsbreite":0.44,"damageScale":1.00}],"Zier-Rohre":[{"angle":130,"versatz":0,"laenge":0.46,"breite":0.30,"muendungsbreite":0.16},{"angle":180,"versatz":0,"laenge":0.40,"breite":0.56,"muendungsbreite":0.26},{"angle":230,"versatz":0,"laenge":0.46,"breite":0.30,"muendungsbreite":0.16}],"Feuerverhalten":"Ein Apex-Tarnschuss alle 600 ms; vollständige Unsichtbarkeit endet 100 ms vor Projektilerzeugung als lesbare Warnung.","Anders_als_Geschwister":"Langer Frontstachel und dreizackiges Heck kombinieren Burst, Präzision und die klarste Apex-Warnsilhouette."},

  {"id":"tempest","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":1.00,"breite":0.78,"muendungsbreite":1.06,"damageScale":1.00}],"Zier-Rohre":[{"angle":165,"versatz":0,"laenge":0.28,"breite":0.36,"muendungsbreite":0.74},{"angle":195,"versatz":0,"laenge":0.28,"breite":0.36,"muendungsbreite":0.74}],"Feuerverhalten":"Ein Schuss alle 340 ms erhöht Hitze; Schaden skaliert mit dem Stand vor dem Schuss.","Anders_als_Geschwister":"Geöffnete Mündung plus zwei kleine Heckventile bilden das Grundmotiv des Reaktorzweigs."},
  {"id":"scorch","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":-0.50,"laenge":1.00,"breite":0.66,"muendungsbreite":0.92,"damageScale":1.00},{"angle":0,"versatz":0.50,"laenge":0.86,"breite":0.66,"muendungsbreite":0.92,"damageScale":1.00}],"Zier-Rohre":[{"angle":170,"versatz":-0.28,"laenge":0.34,"breite":0.34,"muendungsbreite":0.78},{"angle":190,"versatz":0.28,"laenge":0.34,"breite":0.34,"muendungsbreite":0.78}],"Feuerverhalten":"Rohr A feuert bei 0 ms, Rohr B bei 65 ms; der Doppelzyklus beginnt alle 260 ms und erzeugt pro Schuss Hitze.","Anders_als_Geschwister":"Ungleich lange Parallelrohre erzeugen einen erkennbaren Doppelpuls statt einen Fächer."},
  {"id":"surge","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":1.05,"breite":1.15,"muendungsbreite":1.35,"damageScale":1.00}],"Zier-Rohre":[{"angle":90,"versatz":0,"laenge":0.34,"breite":0.62,"muendungsbreite":1.02},{"angle":270,"versatz":0,"laenge":0.34,"breite":0.62,"muendungsbreite":1.02}],"Feuerverhalten":"Ein schwerer Puls alle 520 ms erzeugt doppelte Standardhitze und hohen Einzelrückstoß.","Anders_als_Geschwister":"Breiter Pulstrichter und seitliche Kühler machen den Hitzehammer statt Schnellfeuer sichtbar."},
  {"id":"inferno","Rumpfform":"Kreis r22","Rohre":[{"angle":-6,"versatz":-0.45,"laenge":0.90,"breite":0.56,"muendungsbreite":0.82,"damageScale":1.00},{"angle":0,"versatz":0,"laenge":1.04,"breite":0.60,"muendungsbreite":0.88,"damageScale":1.00},{"angle":6,"versatz":0.45,"laenge":0.90,"breite":0.56,"muendungsbreite":0.82,"damageScale":1.00}],"Zier-Rohre":[{"angle":155,"versatz":0,"laenge":0.30,"breite":0.30,"muendungsbreite":0.72},{"angle":180,"versatz":0,"laenge":0.36,"breite":0.34,"muendungsbreite":0.82},{"angle":205,"versatz":0,"laenge":0.30,"breite":0.30,"muendungsbreite":0.72}],"Feuerverhalten":"Dreiersalve bei 0/48/96 ms; der Zyklus startet alle 290 ms und jeder Teiltreffer heizt separat.","Anders_als_Geschwister":"Drei Kehlen und drei Ventile erzeugen den dichtesten Hitzeaufbau, aber auch die früheste Abschaltung."},
  {"id":"overload","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":1.10,"breite":1.48,"muendungsbreite":1.72,"damageScale":1.00}],"Zier-Rohre":[{"angle":180,"versatz":0,"laenge":0.58,"breite":0.92,"muendungsbreite":1.52}],"Feuerverhalten":"Ein riesiger Puls alle 600 ms erzeugt 34 Hitzeeinheiten und wird bei hoher Hitze sichtbar größer.","Anders_als_Geschwister":"Größte geöffnete Mündung und ein einzelner massiver Auslass geben jedem Schuss Gewicht und Risiko."},
  {"id":"cataclysm","Rumpfform":"Kreis r22","Rohre":[{"angle":-8,"versatz":-0.44,"laenge":1.04,"breite":0.92,"muendungsbreite":1.26,"damageScale":1.00},{"angle":8,"versatz":0.44,"laenge":1.04,"breite":0.92,"muendungsbreite":1.26,"damageScale":1.00}],"Zier-Rohre":[{"angle":150,"versatz":0,"laenge":0.36,"breite":0.34,"muendungsbreite":0.80},{"angle":170,"versatz":0,"laenge":0.42,"breite":0.38,"muendungsbreite":0.90},{"angle":190,"versatz":0,"laenge":0.42,"breite":0.38,"muendungsbreite":0.90},{"angle":210,"versatz":0,"laenge":0.36,"breite":0.34,"muendungsbreite":0.80}],"Feuerverhalten":"Beide Läufe feuern gleichzeitig alle 400 ms, erzeugen gemeinsam 30 Hitzeeinheiten und bilden einen engen 16°-Doppelpuls.","Anders_als_Geschwister":"Zwei Reaktorschlünde und vier Heckauslässe machen die Apex-Überhitzung sofort erkennbar."},

  {"id":"siege","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":1.00,"breite":1.20,"muendungsbreite":1.00,"damageScale":1.00}],"Zier-Rohre":[{"angle":180,"versatz":0,"laenge":0.44,"breite":0.82,"muendungsbreite":1.12}],"Feuerverhalten":"Ein schwerer Schuss alle 620 ms; Stillstand lädt den Stellungsbonus nach Teil C.","Anders_als_Geschwister":"Ein Kanonenblock und eine einzelne Heckstütze sind die neutrale Siege-Grundsilhouette."},
  {"id":"trapper","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":0.90,"breite":0.95,"muendungsbreite":1.45,"damageScale":1.00}],"Zier-Rohre":[{"angle":-18,"versatz":-0.48,"laenge":0.64,"breite":0.32,"muendungsbreite":0.22},{"angle":18,"versatz":0.48,"laenge":0.64,"breite":0.32,"muendungsbreite":0.22}],"Feuerverhalten":"Alle 1100 ms wird eine Falle geschossen, die am Endpunkt stoppt und nach der bestehenden Lebensdauer verschwindet.","Anders_als_Geschwister":"Geöffneter Mittelschacht zwischen zwei Führungshaken liest sich als Platzieren statt Durchschießen."},
  {"id":"bombard","Rumpfform":"Kreis r22","Rohre":[{"angle":-3,"versatz":-0.60,"laenge":1.00,"breite":1.05,"muendungsbreite":0.90,"damageScale":1.00},{"angle":3,"versatz":0.60,"laenge":1.00,"breite":1.05,"muendungsbreite":0.90,"damageScale":1.00}],"Zier-Rohre":[{"angle":180,"versatz":0,"laenge":0.50,"breite":1.00,"muendungsbreite":1.30}],"Feuerverhalten":"Beide schweren Rohre feuern gleichzeitig alle 720 ms in einem engen 6°-Keil.","Anders_als_Geschwister":"Breite Doppelkanone schlägt eine ganze Gangmitte, ohne die Präzision eines Arbalest zu imitieren."},
  {"id":"mortar","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":0.82,"breite":1.50,"muendungsbreite":1.70,"damageScale":1.00}],"Zier-Rohre":[{"angle":90,"versatz":0,"laenge":0.38,"breite":0.80,"muendungsbreite":1.12},{"angle":270,"versatz":0,"laenge":0.38,"breite":0.80,"muendungsbreite":1.12}],"Feuerverhalten":"Ein großes langsames Projektil alle 950 ms mit starkem Rückstoß und ohne Flächenschaden.","Anders_als_Geschwister":"Kurzer offener Mörsermund und Seitenstützen unterscheiden den Brockenwerfer vom langen Präzisionsrohr."},
  {"id":"howitzer","Rumpfform":"Kreis r22","Rohre":[{"angle":-10,"versatz":0,"laenge":0.90,"breite":0.94,"muendungsbreite":0.80,"damageScale":1.00},{"angle":0,"versatz":0,"laenge":1.06,"breite":1.02,"muendungsbreite":0.86,"damageScale":1.00},{"angle":10,"versatz":0,"laenge":0.90,"breite":0.94,"muendungsbreite":0.80,"damageScale":1.00}],"Zier-Rohre":[{"angle":160,"versatz":0,"laenge":0.42,"breite":0.72,"muendungsbreite":1.02},{"angle":200,"versatz":0,"laenge":0.42,"breite":0.72,"muendungsbreite":1.02}],"Feuerverhalten":"Drei schwere Geschosse feuern gleichzeitig alle 780 ms und decken einen 20°-Korridor.","Anders_als_Geschwister":"Dreifachkanone plus gespreizte Heckstützen bilden eine klare Schneisenwaffe statt Dauerfeuer."},
  {"id":"trebuchet","Rumpfform":"Kreis r22","Rohre":[{"angle":0,"versatz":0,"laenge":1.15,"breite":1.65,"muendungsbreite":1.25,"damageScale":1.00}],"Zier-Rohre":[{"angle":180,"versatz":0,"laenge":0.70,"breite":1.20,"muendungsbreite":1.60}],"Feuerverhalten":"Ein maximaler Brocken alle 1250 ms; 180 ms vor Erzeugung zieht sich das Rohr als Warnanimation um 8 % zurück.","Anders_als_Geschwister":"Längste schwere Kanone und größtes Gegengewicht geben dem Einzelschuss eine mechanische Vorbereitung."},
  {"id":"ragnarok","Rumpfform":"Kreis r22","Rohre":[{"angle":-6,"versatz":-0.55,"laenge":1.06,"breite":1.25,"muendungsbreite":1.04,"damageScale":1.00},{"angle":6,"versatz":0.55,"laenge":1.06,"breite":1.25,"muendungsbreite":1.04,"damageScale":1.00}],"Zier-Rohre":[{"angle":145,"versatz":0,"laenge":0.46,"breite":0.82,"muendungsbreite":1.12},{"angle":180,"versatz":0,"laenge":0.58,"breite":1.02,"muendungsbreite":1.38},{"angle":215,"versatz":0,"laenge":0.46,"breite":0.82,"muendungsbreite":1.12}],"Feuerverhalten":"Beide Apex-Kanonen feuern gleichzeitig alle 850 ms; im vollen Stellungsbonus sinkt die Streuung auf 0,25°.","Anders_als_Geschwister":"Doppelkanone und dreifüßige Heckabstützung zeigen die vollständig eingegrabene Apex-Batterie."},

  {"id":"aegis","Rumpfform":"Regelmäßiges Achteck r23, Kante bei 0°","Rohre":[{"angle":0,"versatz":0,"laenge":0.92,"breite":0.92,"muendungsbreite":0.78,"damageScale":1.00}],"Zier-Rohre":[{"angle":90,"versatz":0,"laenge":0.30,"breite":1.18,"muendungsbreite":1.38},{"angle":270,"versatz":0,"laenge":0.30,"breite":1.18,"muendungsbreite":1.38}],"Feuerverhalten":"Ein Schuss alle 440 ms; erlittener Schaden füllt die Schildladung für Rechtsklick-Entladung.","Anders_als_Geschwister":"Achteck und zwei Seitenplatten bilden das sofort lesbare Schildfamilien-Motiv."},
  {"id":"bulwarker","Rumpfform":"Regelmäßiges Achteck r24, Spitze bei 0°","Rohre":[{"angle":0,"versatz":0,"laenge":0.86,"breite":1.02,"muendungsbreite":0.84,"damageScale":1.00}],"Zier-Rohre":[{"angle":70,"versatz":0,"laenge":0.34,"breite":1.22,"muendungsbreite":1.48},{"angle":180,"versatz":0,"laenge":0.30,"breite":1.16,"muendungsbreite":1.40},{"angle":290,"versatz":0,"laenge":0.34,"breite":1.22,"muendungsbreite":1.48}],"Feuerverhalten":"Ein Schuss alle 500 ms; größere Schildkapazität wird langsamer, aber effizienter entladen.","Anders_als_Geschwister":"Drei schwere Platten lassen Frontangriffe zu und decken gleichzeitig den Rückzug."},
  {"id":"reflector","Rumpfform":"Regelmäßiges Achteck r23, Spitze bei 22,5°","Rohre":[{"angle":-5,"versatz":-0.45,"laenge":0.92,"breite":0.72,"muendungsbreite":0.62,"damageScale":1.00},{"angle":5,"versatz":0.45,"laenge":0.92,"breite":0.72,"muendungsbreite":0.62,"damageScale":1.00}],"Zier-Rohre":[{"angle":90,"versatz":0,"laenge":0.36,"breite":1.08,"muendungsbreite":1.46},{"angle":270,"versatz":0,"laenge":0.36,"breite":1.08,"muendungsbreite":1.46}],"Feuerverhalten":"Zwei Läufe feuern gleichzeitig alle 460 ms; absorbierte Projektilenergie verstärkt nur die Rechtsklick-Entladung, nicht die normalen Kugeln.","Anders_als_Geschwister":"Gespiegelte Doppelläufe und zwei aufgeweitete Reflexplatten zeigen Gegenfeuer statt bloßer Haltbarkeit."},
  {"id":"paladin","Rumpfform":"Regelmäßiges Achteck r25, Kante bei 0°","Rohre":[{"angle":0,"versatz":0,"laenge":0.88,"breite":1.12,"muendungsbreite":0.92,"damageScale":1.00}],"Zier-Rohre":[{"angle":60,"versatz":0,"laenge":0.36,"breite":1.12,"muendungsbreite":1.38},{"angle":120,"versatz":0,"laenge":0.36,"breite":1.12,"muendungsbreite":1.38},{"angle":240,"versatz":0,"laenge":0.36,"breite":1.12,"muendungsbreite":1.38},{"angle":300,"versatz":0,"laenge":0.36,"breite":1.12,"muendungsbreite":1.38}],"Feuerverhalten":"Ein Schuss alle 550 ms; Schildladung gewährt bei hoher Füllung den bestehenden offensiven Bonus.","Anders_als_Geschwister":"Vier diagonale Platten lassen eine kreuzförmige Angriffsgasse frei und lesen sich als offensiver Schildträger."},
  {"id":"retributor","Rumpfform":"Regelmäßiges Achteck r23, Kante bei 22,5°","Rohre":[{"angle":-8,"versatz":-0.48,"laenge":0.86,"breite":0.64,"muendungsbreite":0.54,"damageScale":1.00},{"angle":0,"versatz":0,"laenge":1.00,"breite":0.68,"muendungsbreite":0.58,"damageScale":1.00},{"angle":8,"versatz":0.48,"laenge":0.86,"breite":0.64,"muendungsbreite":0.54,"damageScale":1.00}],"Zier-Rohre":[{"angle":90,"versatz":0,"laenge":0.34,"breite":1.00,"muendungsbreite":1.30},{"angle":180,"versatz":0,"laenge":0.30,"breite":1.00,"muendungsbreite":1.30},{"angle":270,"versatz":0,"laenge":0.34,"breite":1.00,"muendungsbreite":1.30}],"Feuerverhalten":"Dreiersalve bei 0/55/110 ms; der Zyklus startet alle 480 ms und verbraucht keine Schildladung für Standardschüsse.","Anders_als_Geschwister":"Drei gestaffelte Rohre spiegeln die drei Heck-/Seitenplatten und machen Rückzahlung als Rhythmus sichtbar."},
  {"id":"sanctum","Rumpfform":"Regelmäßiges Achteck r25, Spitze bei 0°","Rohre":[{"angle":-3,"versatz":-0.52,"laenge":0.96,"breite":0.86,"muendungsbreite":0.72,"damageScale":1.00},{"angle":3,"versatz":0.52,"laenge":0.96,"breite":0.86,"muendungsbreite":0.72,"damageScale":1.00}],"Zier-Rohre":[{"angle":60,"versatz":0,"laenge":0.38,"breite":1.16,"muendungsbreite":1.44},{"angle":120,"versatz":0,"laenge":0.38,"breite":1.16,"muendungsbreite":1.44},{"angle":180,"versatz":0,"laenge":0.42,"breite":1.20,"muendungsbreite":1.50},{"angle":240,"versatz":0,"laenge":0.38,"breite":1.16,"muendungsbreite":1.44},{"angle":300,"versatz":0,"laenge":0.38,"breite":1.16,"muendungsbreite":1.44}],"Feuerverhalten":"Beide Läufe feuern gleichzeitig alle 520 ms; volle Schildladung löst auf Rechtsklick die stärkste, aber klar telegraphierte Entladung aus.","Anders_als_Geschwister":"Fast geschlossener Fünfplattenkranz mit schmalem Doppelkanal ist die eindeutige defensive Apex-Silhouette."}
]
```

## Teil C – das Spielgefühl der neun Familien

Alle Werte dieses Abschnitts sind **Schätzwerte für Build 1**. Sie verändern nicht die vorgegebenen Klassenwerte für Nachladen, Schaden oder Kugeltempo, sondern ergänzen fehlende Stellschrauben. `Basis` bedeutet: Projektilradius 6 px, Rückstoßimpuls 55 px/s pro gleichzeitig ausgelöstem Rohr, Streuung 0,8°, keine Sonderladung.

| Familie | Konkrete Stellschrauben | Gewünschtes messbares Gefühl |
|---|---|---|
| Core | Projektilradius 6 px; Rückstoß 55 px/s; Streuung 0,8°; Lauf feuert exakt zum Klicktick. | Referenzklasse ohne Rhythmus-, Flächen- oder Bewegungsbonus; alle anderen Familien werden gegen diese Werte verglichen. |
| Rapid | Projektilradius 4,2–5,2 px abhängig von Rohrbreite; Rückstoß 18 px/s je Teilprojektil, auf maximal 72 px/s pro Tick gekappt; Grundstreuung 1,8° bei Einrohr, 0,6° Zusatzjitter je Fächerrohr; Salvenzeiten stehen in Teil B. | Kontinuierlicher Raumdruck: Zwischen zwei sichtbaren Projektilen derselben Klasse liegen bei Twin 125 ms, Gatling 46,7 ms und Vortex 27 ms innerhalb seiner Welle. |
| Precision | Projektilradius 4,5 px, Ballista/Siegebreaker 6,5 px; Streuung je Klasse 0,03–0,35° wie Teil B; Rückstoß 90 px/s Sniper, 115 Railgun, 145 Lancer, 108 Phantom, 132 Siegebreaker, 150 Eclipse; Rückstoß klingt mit 7,5 s⁻¹ exponentiell ab. | Jeder Fehlschuss erzeugt eine klar messbare Öffnung von 500–1300 ms; hohe Geschwindigkeit wird durch kleine Trefferfläche und starken Eigenversatz bezahlt. |
| Control | Gemeinsame Steuerung siehe Teil D; Drohnenkontakt nutzt unveränderten Klassenschaden; Drohnen besitzen keinen Schuss; Ersatz erfolgt nur, wenn Flotte unter Sollgröße liegt. | Schaden ist räumlich vom Tank getrennt. Der Spieler verwaltet Position, Wandrisiko und Wiederaufbau statt Projektiltiming. |
| Impact | Rumpfgeschwindigkeit: Rammer 1,06×, Crusher 0,92×, Bulwark 0,86×, Blitz 1,14×, Rampart 0,82×, Juggernaut 0,76×, Fortress 0,70×, Comet 1,24×, Smasher 1,10×, Behemoth 0,72×, Leviathan 0,68× der normalen Klassenbasis; Projektilradius 5,5–9 px; Vorwärtsrückstoß aus Schüssen wird auf 45–80 % der Basis reduziert. | Der Tankkörper ist die Hauptwaffe; sichtbare Masse und Beschleunigung bestimmen Risiko. Die kurzen Projektile öffnen den Anfahrtsweg, ersetzen aber keinen Fernkampf. |
| Specter | Tarnbeginn nach letztem Schuss/erlittenem Schaden: Specter 1,4 s, Wraith 0,9 s, Shade 1,8 s, Mirage 1,1 s, Revenant 1,2 s, Eidolon 1,0 s; Alpha fällt danach linear in 0,8/0,55/1,0/0,65/0,75/0,50 s auf 12/18/8/15/10/0 %; Bewegung über 70 % Maximaltempo begrenzt Tarnung auf 35 % Alpha; Warnzeiten aus Teil B gelten vor Schuss/Kontakt. | Tarnung schafft Positionierung, aber keinen unsichtbaren Soforttreffer: Gegner erhalten je nach Klasse 100–120 ms klare Vorwarnung bei den härtesten Aktionen. |
| Tempest | Hitze 0–100; passive Kühlung beginnt 350 ms nach letztem Schuss mit 24 Einheiten/s; Schüsse erzeugen Tempest 13, Scorch 10 je Teil, Surge 26, Inferno 9 je Teil, Overload 34, Cataclysm 30 gesamt; Schadensmultiplikator `1 + 0,0035 × Hitze_vor_Schuss` (max. 1,35×); ab 85 Hitze +1,8° Streuung; bei 100 Hitze 900-ms-Abschaltung; Projektilradius wächst ab 60 Hitze linear um maximal 18 %. | Dauerfeuer baut sichtbar Leistung und Kontrollverlust auf. Der optimale Spieler hält 60–84 Hitze, statt die Taste permanent zu halten. |
| Siege | Stellungswert 0–100; wächst nur unter 25 px/s Bewegung mit 40/s, fällt sonst mit 85/s; pro 25 Punkte: +6 % Projektilgröße, +7 % Durchschlag, −0,15° Streuung, aber −5 % Bewegungstempo; kein Schadensbonus; Rückstoß 110–180 px/s je Salve und wird bei vollem Stellungswert um 45 % reduziert. Traps zählen maximal 8 gleichzeitig pro Trapper. | Stillstand wandelt Mobilität in Spurkontrolle und stabile schwere Schüsse um; bereits 63 px Positionswechsel leeren eine voll ausgebaute Stellung in etwa 1,18 s. |
| Aegis | Schildladung 0–100; eingehender Schaden lädt vor Lebensabzug um `min(25, Schaden × 0,65)`; Verfall startet nach 3 s mit 8/s; Rechtsklick verbraucht alles ab 20 Ladung und erzeugt einen 110°-Kegel mit 120 px Grundreichweite + 2,2 px je Ladung, Rückstoßkraft auf Gegner 180 + 3,2×Ladung px/s und Schaden `0,12 × verbrauchte Ladung`; Abklingzeit 1,4 s; Bulwarker Kapazität 130 bei 0,80× Entladungsreichweite, Reflector erhält 1,15× Ladung aus Projektilen, Paladin ab 70 Ladung +8 % Tempo, Retributor 1,10× Entladungsschaden, Sanctum 150 Kapazität und 1,35× Abklingzeit. | Der Gegner entscheidet mit, wie gefährlich die Zweitfunktion wird. Die Entladung ist Raumgewinn, nicht zusätzlicher dauerhafter Front-DPS. |

## Teil D – Drohnenklassen gesondert

### Gemeinsame Drohnensteuerung

Diese Werte sind **Schätzwerte für Build 1** und ersetzen keine der vorgegebenen Flottengrößen, Schäden oder Ersatzzeiten.

- **Ohne Maustaste:** Jede Drohne hält einen phasenversetzten Schutzorbit. Der Sollwinkel ist `2π × Slotindex / Flottengröße`; die Orbitrichtung ist für gerade Spieler-ID im Uhrzeigersinn, für ungerade gegen den Uhrzeigersinn. Dadurch drehen nicht alle Spielerflotten gleich, innerhalb einer Flotte bleiben die Slots aber stabil.
- **Linksklick:** Formationszentrum ist die Mausposition, auf die jeweilige Leinenlänge begrenzt. Slots liegen senkrecht zur Tank-Maus-Achse; Abstand ist `2,4 × Drohnenradius`. Kein Umkreisen des Mauspunktes: Bei Ankunft bremsen die Drohnen kritisch gedämpft auf höchstens 18 px/s Restgeschwindigkeit.
- **Rechtsklick:** Jede Drohne erhält als Sollpunkt `Tankposition − norm(Maus−Tank) × Leinenlänge`; die Formation wird auf eine 110°-Abwehrfront verteilt. Das ist echtes Abstoßen von der Mausrichtung, kein Rückruf.
- **Bremsen:** Zielgeschwindigkeit ist `min(vMax, 5,0 × Distanz_zum_Slot)`; Beschleunigung wird auf den Klassenwert begrenzt. Dadurch beginnt bei Standarddrohnen unter 108 px Distanz sichtbar das Abbremsen.
- **Leine:** Überschreitet eine Drohne die harte Leine um 24 px, ignoriert sie Eingaben und kehrt mit 1,15× `vMax` direkt zum Tank zurück. Bei mehr als Leine + 120 px wird sie zerstört, damit Desync oder Teleport keine unendlichen Drohnen erzeugt.
- **Wände:** Vorwärts-Raycast über `max(48 px, Geschwindigkeit × 0,16 s)`. Bei Treffer wird 70 % der Lenkbeschleunigung entlang der Wandtangente gelegt; Kollisionskontakt bleibt tödlich. Es gibt kein A*-Pathfinding.
- **Server:** Ziel- und Slotberechnung bei 40 Hz. Der Client darf Drohnen nur interpolieren, nicht vorhersagen; Treffer und Wandtod bleiben serverautoritativ.

| Klasse | Launcher-Silhouette | Drohnenbild und Flotte | Bewegung | Verhalten, das die Klasse wirklich trennt |
|---|---|---|---|---|
| drone | 1 Fronttrichter, 0°, 1,00× lang, 0,72→1,35 breit | 4 gleichseitige Dreiecke, Umkreisradius 9 px, Haltbarkeit 1,00× | `vMax` 540 px/s, Beschleunigung 1600 px/s², Leine 560 px, Orbit 72 px bei 1,35 rad/s | Neutrale Linie bei Linksklick; keine Zielpriorität und keine automatische Interzeption. |
| warden | 2 Trichter bei ±35°, je 0,92×, 0,66→1,18 | 6 Rauten, Radius 9 px, Haltbarkeit 1,10× | 500 px/s, 1450 px/s², Leine 500 px, Orbit 78 px bei 1,55 rad/s | Ohne Klick verschiebt sich der nächste Slot bis zu 26 px auf ein anfliegendes feindliches Projektil; maximal zwei Drohnen dürfen denselben Korridor blocken. |
| factory | 1 Industrieschacht bei 0°, 1,15×, 1,25→1,75 | 5 Quadrate, Halbkante 10 px, Haltbarkeit 1,45× | 400 px/s, 900 px/s², Leine 500 px, Orbit 82 px bei 0,85 rad/s | Linksklick bildet eine 2–1–2-Staffel in Bewegungsrichtung; hohe Masse, langsamer Richtungswechsel, kein Interzeptionsbias. |
| guardian | 4 kurze Diagonaltrichter bei 45/135/225/315° | 5 schildförmige Drachen, Radius 11 px, Haltbarkeit 1,35× | 460 px/s, 1250 px/s², Leine 420 px, Orbit 60 px bei 1,70 rad/s | Ohne Klick verlassen Drohnen den 60-px-Ring nie weiter als 34 px; Linksklick erlaubt nur 420 px Reichweite und bleibt klar defensiv. |
| sentinel | 3 große Trichter bei 0/120/240° | 3 regelmäßige Sechsecke, Radius 14 px, Haltbarkeit 1,90× | 380 px/s, 750 px/s², Leine 470 px, Orbit 92 px bei 0,65 rad/s | Jede Drohne hält einen eigenen 120°-Sektor; Linksklick ordnet sie als Dreieck mit 42 px Kantenlänge um die Maus an. |
| overseer | 4 Kardinaltrichter bei 0/90/180/270° | 8 kleine Dreiecke, Radius 8 px, Haltbarkeit 0,85× | 590 px/s, 1900 px/s², Leine 680 px, Orbit 88 px bei 1,45 rad/s | Linksklick bildet einen 112 px breiten Bogen um die Maus; höchste Standardreichweite und präzisestes manuelles Umschließen. |
| carrier | 2 Seitenhangars bei ±65° | 6 Rechtecke 20×14 px, Haltbarkeit 1,60× | 390 px/s, 850 px/s², Leine 560 px, Orbit 96 px bei 0,72 rad/s | Linksklick baut eine 3×2-Wand mit 28 px Abstand auf; Formationsnormal zeigt zum Tank und schiebt als geschlossene Front. |
| hive | 5 Minibuchten in 72°-Schritten | 10 Rauten, Radius 6 px, Haltbarkeit 0,55× | 650 px/s, 2300 px/s², Leine 610 px, Orbit 84 px bei 2,10 rad/s | Slots erhalten pro Tick ±6 px deterministischen Phasenjitter; der Schwarm bedeckt Fläche, einzelne Einheiten sind entbehrlich. |
| aviary | 3 schlanke Nester bei −40/0/40° | 9 Chevrons aus vier Eckpunkten, Länge 14 px, Breite 9 px, Haltbarkeit 0,65× | 700 px/s, 2600 px/s², Leine 720 px, Orbit 94 px bei 1,90 rad/s | Linksklick bildet einen 70°-Keil mit Spitze an der Maus; Drohnen richten ihre Chevrons entlang der aktuellen Geschwindigkeit aus. |
| sovereign | 6 Trichter in 60°-Schritten, Front- und Hecktrichter länger | 7 Drachen mit kurzer hinterer Spitze, Radius 10 px, Haltbarkeit 1,20× | 560 px/s, 1700 px/s², Leine 650 px, Orbit 86 px bei 1,60 rad/s | Wechselt weich über 180 ms zwischen Siebener-Ring, Linksklick-Keil und Rechtsklick-Abwehrbogen; keine Teleportation der Slots. |

### Abweichung vom diep.io-Vorbild

Die Flotte folgt bewusst **keinem weit ausschwingenden Orbit um den Mauspunkt**. In offenen Arenen wirkt Überschwingen lebendig; in 320-px-Gängen erzeugt es hingegen zufällige Wandtode. Mazers nutzt deshalb kritisch gedämpfte Ankunft, stabile Slots und nur einen engen Schutzorbit am Besitzer. Die tödliche Wand bleibt trotzdem relevant, weil die Tangentenhilfe lediglich lenkt und keine Route um Ecken findet.

## Teil E – was ich für den Launch weglassen würde

**Ja: 67 Klassen sind für den jetzigen visuellen und mechanischen Wortschatz zu viele.** Der obige Entwurf macht alle 67 im Blindtest unterscheidbar, aber „unterscheidbar“ ist nicht dasselbe wie „für neue Spieler erinnerbar“. Besonders problematisch sind mehrere Einrohr-Zweige, die sich hauptsächlich über unsichtbare Zahlen unterscheiden. Für einen ersten öffentlichen Build empfehle ich **53 Klassen** und die folgenden 14 Streichungen bzw. Zusammenlegungen:

| Entfernen | Zusammenlegen mit / Ziel | Grund |
|---|---|---|
| hailstorm | vanguard als dessen finale breite Salvenform ausbauen | Hailstorm und Vortex besetzen beide den breiten Frontfächer; Vortex hat den stärkeren Rhythmus-Hook. |
| ballista | railgun | Beides sind einzelne stark durchschlagende Präzisionsbolzen; die Führungsschienen können als Railgun-Level-28-Optik dienen. |
| siegebreaker | lancer | Noch ein langsamer schwerer Einzelschuss ist spielerisch kein eigener Zweig. |
| guardian | warden | Beide sind defensive Nahorbit-Flotten; Warden kann die Schildform und Interzeption übernehmen. |
| carrier | factory | Beide sind langsame schwere Rechteck-/Quadratdrohnen; Factory kann auf Level 28 direkt die 3×2-Wand erhalten. |
| aviary | hive | Beide sind schnelle fragile Schwärme; die Keilformation kann als Rechts-/Linksklick-Modus des Hive dienen. |
| crusher | rammer | „Etwas schwerer und haltbarer“ trägt ohne weitere aktive Mechanik keine eigene Klasse. |
| rampart | bulwark | Langsamer, haltbarer, schweres Projektil: dieselbe Rolle trotz anderer Familienbeschreibung. |
| juggernaut | fortress | Beide sind maximale Haltbarkeit mit kurzer Reichweite; Fortress hat die klarere Silhouette und Stellung. |
| behemoth | leviathan | Zwei sehr langsame Stahlwände direkt vor derselben Apex-Rolle sind redundant. |
| scorch | inferno | Der Doppelpuls ist ein guter Level-15-Vorläufer, muss aber nicht nach Level 28 als eigener auswählbarer Endzustand bestehen; Inferno übernimmt die Linie. |
| bombard | howitzer | Zwei bzw. drei breite schwere Rohre unterscheiden sich nur quantitativ; Howitzer ist die prägnantere Schneisenwaffe. |
| bulwarker | paladin | Reiner Schildtank ohne aktive Entscheidung überschneidet sich mit Impact; Paladin behält den offensiven Ladungs-Hook. |
| revenant | blitz/comet außerhalb Specter | Unsichtbares Rammen ist schwer fair zu telegraphieren und dupliziert die komplette Impact-Spielweise. |

### Blindtest der vollständigen 67er-Liste

- Keine zwei Klassen besitzen dieselbe Kombination aus **Rumpfkontur, Zahl sichtbarer Rohre, Rohrwinkeln, Längenstaffelung und Zier-Rohren**.
- Ähnliche Grundformen bleiben absichtlich familienintern: Twin/Arbalest/Reflector/Sanctum sind alles Doppelläufer, unterscheiden sich aber klar durch Rohrlänge, Winkel, Rumpf und Panzerplatten.
- Einrohr-Klassen werden über eine konsistente Sekundärsilhouette getrennt: Precision nutzt Stabilisatoren, Specter Tarnflossen, Tempest Auslässe, Siege Stützen, Aegis Platten und Impact polygonale Masse.
- Bei einer Darstellung unter etwa **34 px Gesamtdurchmesser** verschwinden feine Längenunterschiede. Für Minimap-Icons sollte daher nicht die Live-Silhouette verkleinert, sondern pro Familie ein eigenes 16–24-px-Glyph verwendet werden.

## Umsetzungsreihenfolge

1. Renderer-Daten aus Teil B übernehmen und einen automatischen Screenshotbogen mit identischer Zielrichtung erzeugen.
2. Salven-Scheduler für die im Vorwort genannten Stakkato-Klassen implementieren.
3. Familienmechaniken aus Teil C zunächst ohne Upgrades gegeneinander testen.
4. Drohnensteuerung aus Teil D in einem einzelnen 320-px-Testgang mit zwei 90°-Kurven testen.
5. Erst danach Nachladen-, Schaden-, Tempo- und Durchschlagsupgrades aktivieren; sonst lassen sich Klassenidentität und Upgradeeffekt nicht getrennt bewerten.


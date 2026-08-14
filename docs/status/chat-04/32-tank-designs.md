# 32 – Tank-Designs komplett überarbeitet

| | |
| --- | --- |
| **Auftrag** | Sam, 14.08.: „TANK DESIGNS an sich finde ich schauen leider alle noch echt kake aus. ÜBERARBEITE DIE ALLE KOMPLETT" |
| **Branch** | `main` (Sams stehende Anweisung: „push immer direkt auf MAIN") |
| **Tests** | `npm run check` grün – 93 Dateien, 1266 Tests |
| **Layout** | `ui-layout-check.mjs`: 23/23 Wahl-Fälle, 20/20 Tod-Fälle, 8/8 Geräte |
| **Werkzeug** | `node scripts/tank-sheet.mjs` – Kontaktbogen aller 67 Klassen |

## Was wirklich das Problem war

Nicht die Formen allein. Der Kontaktbogen vorher zeigt drei Ursachen, und zwei
davon betreffen **alle 67 Klassen gleichzeitig**:

1. **Der Umriss war weiß bei 38 % Deckkraft.** Auf einem farbigen Körper ergibt
   das keinen Rand, sondern einen Schleier: Die Form franst aus, statt zu
   schneiden. Diep.io setzt eine **dunkle** Kante, und genau daher kommt dort
   der Eindruck fester Körper.
2. **Das Rohr trug die Familienfarbe** (`currentColor 55 %` im SVG, im Spiel die
   Spielerfarbe als Umriss). Körper und Rohr verschmolzen zu einem Klumpen. In
   Diep.io ist das Rohr **grau** und gehört sichtbar nicht zum Körper – erst
   dadurch liest man, wo der Panzer aufhört und die Waffe anfängt.
3. **Die Vorschau drehte um −30° und rahmte auf einen festen 96er-Ausschnitt.**
   Seit die Rohre bis zur wirklichen Mündung reichen (Punkt 6b vom selben Tag),
   ragte ein Lancer aus der Kachel, während ein Smasher darin verloren ging –
   und schief hängend sah jeder Tank aus, als wäre er umgefallen.

Erst danach kommen die Formen selbst.

## Die vier Eingriffe

### 1. Kontrast: dunkle Kante, neutrales Rohr

Die Kante wird aus der Füllfarbe **gemischt**, nicht fest gesetzt: Sie folgt der
Familien- bzw. Spielerfarbe und bleibt trotzdem immer die dunkelste Fläche im
Bild. Dieselbe Rechnung auf beiden Seiten – `color-mix()` im SVG
(`class-choice.css`), `mischen()` im Renderer. Wenn die Wahlkarte anders
aussieht als das Spiel, ist das ab jetzt ein Fehler und kein Stilmittel.

| Rolle | vorher | jetzt |
| --- | --- | --- |
| Rumpf | Umriss weiß 38 % | Umriss `Farbe 30 % + #080a11` |
| Panzerplatte | Füllung mit Alpha 0,82 | eigene, dunklere Fläche + Kante |
| Akzent | Weiß 22 % ohne Rand | helle Fläche MIT Kante |
| Rohr | Familienfarbe | neutrales Metall + dunkle Kante |

### 2. Rahmung: nach rechts, um die echte Silhouette

Der Ausschnitt wird jetzt aus dem berechnet, was wirklich gezeichnet wird –
Rumpf, Rohre und (bei Control) die Drohnenpunkte. Quadratisch, damit ein langer
Tank nicht größer wirkt als ein runder. Keine Drehung mehr: Jeder Tank schaut
nach rechts, wie in Diep.io.

### 3. Fächer gestaffelt

Sechs gleich lange Rohre aus einem Punkt sehen aus wie ein Besen. In Diep.io ist
der Spreadshot gestaffelt – mittig lang, außen kurz. `laengenfaktor` in
`shared/barrels.ts` verkürzt Randläufe um bis zu 30 %.

Wichtig: **Die Kugel folgt mit.** `projektilStart` nimmt jetzt den Lauf-Index
entgegen, der Schuss entsteht also an der Mündung DIESES Laufs. Ohne das wäre
Punkt 6b („die Kugel steht vorm Rohr") für Fächerklassen sofort wieder kaputt
gewesen.

Nur der echte Fächer aus `barrelSpread` wird gestaffelt. Klassen mit gesetzten
Winkeln – Octo, Flanker, Heckläufe – behalten volle Länge: Dort ist jede
Richtung eine Entscheidung, keine Streuung.

### 4. Alle 67 Silhouetten neu

Jede Familie hat jetzt ein Merkmal, das nur sie trägt, und jede Stufe wächst
sichtbar darin:

| Familie | Merkmal | Was die Stufe zeigt |
| --- | --- | --- |
| CORE | glatter Kreis | – |
| RAPID | **Heckfinnen** | Finnen länger, Seitenpods dazu |
| PRECISION | gestreckter Rumpf | länger und schmaler nach vorn |
| CONTROL | **Hof** (Ring) | mehr Ringe, mehr Ecken, Platten |
| IMPACT | **Frontramme** | Platte dicker |
| SPECTER | Diamant | vorn spitzer, hinten kürzer |
| TEMPEST | **Reaktorkerne** | mehr und größere Kerne |
| SIEGE | **Stützfüße** | Füße länger, Kasten breiter |
| AEGIS | **Frontbogen** | Bogen weiter, Ringe dazu |

Drei Fehler, die dabei aufgefallen sind:

* **Sentinel und Aviary zeigten nach hinten** (`polygonPoints(3, r, Math.PI)`) –
  zwei Panzer, die rückwärts fahren. Beide zeigen jetzt nach vorn.
* **Acht der zehn RAPID-Klassen hatten keine Finnen** und waren damit nackte
  Kreise, untereinander nicht zu unterscheiden.
* **SIEGE war sechsmal derselbe Kasten mit einem Punkt.** Die Stützfüße gab es
  gar nicht; im ersten Anlauf saßen sie innerhalb des Rumpfes und waren ein
  Stummel. Jetzt setzen sie am hinteren Rand an und ragen heraus.

## Warum es dafür ein Skript gibt

`scripts/tank-sheet.mjs` zeichnet alle 67 Klassen nebeneinander, in
Familienfarbe, mit Namen. Die Silhouetten stehen in `appearance.ts`, die Rohre
in `barrels.ts`, die Farben in `class-choice.css` – drei Dateien, deren
Zusammenspiel man nur **sieht**. Vorher gab es dafür kein Werkzeug, und genau
deshalb konnten Rohre und Rümpfe monatelang auseinanderlaufen, ohne dass es
jemandem auffiel (siehe [Bericht 31](31-feedback-14-08-abgearbeitet.md),
Punkt 6c).

Wer eine Form ändert, sieht in einem Bild, ob sie sich noch von ihren Nachbarn
unterscheidet – der Blindtest aus dem MASTERPLAN, nur als Bild.

## Was offen bleibt

* **Die Rohrbreite** (`barrel-geometry.ts`) ist unangetastet. Sie stammt aus
  Sams C2/C3-Runde und war nicht Teil dieses Auftrags.
* **Die Farben der Familien** sind unverändert. Wenn Sam sie anders will, ist
  das eine eigene Runde – sie hängen an Rad, Wahlkarte, Death-Portrait und
  Signature-Balken gleichzeitig.
* **Ob es jetzt gut aussieht, entscheidet Sam.** Der Kontaktbogen liegt unter
  `.probe/tanks-nachher.png`; das Skript baut ihn jederzeit neu.

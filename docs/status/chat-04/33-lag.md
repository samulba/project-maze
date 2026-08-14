# 33 – „ULTRA LAGGY": erst gemessen, dann gefixt

| | |
| --- | --- |
| **Auftrag** | Sam, 14.08.: „ok das game ist jetzt ULTRA LAGGY das müssen wir schnell fixen!" |
| **Branch** | `main` (Sams stehende Anweisung: „push immer direkt auf MAIN") |
| **Tests** | `npm run check` grün – 93 Dateien, 1273 Tests (vorher 1266) |
| **Werkzeug** | `node scripts/frame-probe.mjs` – Bildzeiten im echten Browser |

## Die unbequeme erste Antwort: es lag nicht am Paket vom 14.08.

Bevor irgendetwas geändert wurde, ist HEAD gegen die Basis `2c90ca2` gemessen
worden – abwechselnd, **immer nur ein Server gleichzeitig**, in zwei Runden:

| Messung | HEAD (vorher) | Basis `2c90ca2` |
| --- | --- | --- |
| Tickdauer p50 | 5,66 ms | 5,34 ms |
| Tickdauer p95 | 10,4 ms | 9,8 ms |
| Bilder je Sekunde im Browser | 3,1 / 2,7 | 3,0 / 2,7 |
| JS-Zeit des Clients (15 s) | 802 ms | 698 ms |
| Snapshot-Bandbreite | 40–72 kB/s | 48–50 kB/s |

Also: **kein messbarer Rückschritt durch die Tank-Designs, die Kadenz, die
Drohnen oder das Ausblenden.** Die einzige Abweichung außerhalb des Rauschens
war die JS-Zeit des Clients (+15 %) – und die sind 5 % der Bildzeit, die
restlichen 94 % zeichnet die Grafik.

Eine Zwischenmessung sagte kurzzeitig etwas anderes (Tick p50 16,8 ms gegen
5,6 ms, 2236 Überschreitungen). Sie war falsch, und zwar aus einem lehrreichen
Grund: Es liefen **zwei Server gleichzeitig** auf derselben Maschine, dazu ein
Chromium mit Software-Rendering. Wer zwei Fassungen nebeneinander misst, misst
das Gedränge. Seitdem läuft jeder A/B-Vergleich über ein Skript, das immer nur
eine Fassung startet.

## Was wirklich langsam war – und schon lange

Das CPU-Profil des laufenden Servers zeigt zwei Posten, die zusammen den
größten Teil der Simulation ausmachen. Beide sind **älter als Sams Feedback**;
sichtbar wurden sie erst, als die Arena voller wurde.

### 1. `isFree` lief über alle 232 Wände – und baute dafür jedes Mal eine Liste

`isFree` ist die meistgerufene Funktion des Servers: zweimal je
Bewegungsschritt, und bewegt wird jede Form (562), jede Drohne (bis 160) und
jeder Panzer, vierzigmal in der Sekunde. Dahinter stand
`activeWalls.filter(...)` – ein voller Durchlauf mit einer frischen Liste als
Ergebnis, obwohl die Antwort fast immer „keine Wand" lautet.

Jetzt liegen die Wände in einem Raster mit 480 px Kante (der Bahn der Karte).
Eine Anfrage sieht ein bis vier Zellen an und legt **kein** Array mehr an.
`hasLineOfSight` – der zweitgrößte Posten – fragt dasselbe Raster.

Die Wände ändern sich nur beim Moduswechsel und wenn ein Arena-Ereignis eine
Wand ausschaltet. Genau dort wird das Raster neu gebaut, sonst nie.

### 2. Drohnen suchten ihre Berührung linear in 562 Formen

Der lineare Durchlauf war seit jeher da. Zum Problem wurde er durch Sams
Punkt 7: Seit Drohnen feste Körper sind, muss die Berührung in **jedem** Tick
aufgelöst werden statt nur, wenn der Rempler nachgeladen hat. In einer Arena
mit 160 Drohnen war `stepDrones` damit **30 % der Tickzeit** – fast vollständig
in dieser einen `.find()`-Zeile.

Dieselbe Frage stellen Projektile, gegen Formen und (seit Punkt 7) gegen
Drohnen, in jedem Teilschritt. Alle vier Stellen fragen jetzt ein gemeinsames
`Koerperraster`.

### 3. Bots schossen 562 Sichtstrahlen, um einen zu behalten

`.filter(hasLineOfSight).sort(nachEntfernung)[0]` – ein Strahl auf jede Form,
um am Ende die nächste sichtbare zu nehmen. Achtzehn Bots, alle 195–538 ms neu.
Jetzt wird erst sortiert und dann der erste sichtbare genommen: dasselbe
Ergebnis, im Regelfall eine Handvoll Strahlen statt aller.

## Gemessen, nachher

| | vorher | nachher |
| --- | ---: | ---: |
| Tick p50, normale Arena (18 Bots) | 4,2–5,3 ms | **2,3–2,4 ms** |
| Tick p95, normale Arena | 9,0–9,6 ms | **4,8–4,9 ms** |
| Budget-Auslastung | 0,21 | **0,107** |
| Tick p50, 160 Drohnen | 3,79 ms | **0,98 ms** |

Die Zahlen für die normale Arena stehen gegen die **Basis** `2c90ca2` – die
Simulation ist also nicht nur wieder da, wo sie war, sondern doppelt so schnell.
Im Drohnenfall, den das Paket vom 14.08. selbst schwerer gemacht hat (Drohnen
sterben seltener, weil sie aus Formen herausgeschoben werden statt in ihnen zu
verrecken: 87 → 160 gleichzeitig), ist es das Dreieinhalbfache.

## Warum ein Raster, das sich selbst auffrischt

Der erste Anlauf ließ `step()` die Raster aufbauen. Das fiel prompt über genau
die Falle, vor der der Kopf von `simulation-hardening.ts` warnt: Wer
`stepDrones` oder `stepProjectiles` **direkt** ruft – die Tests tun das, und
jede ersetzende Schicht könnte es –, bekam ein leeres Raster und damit lautlos
keine Treffer mehr. Sechs Tests fielen sofort um; ohne sie wäre es ein stiller
Regelbruch geworden.

Das Raster hängt jetzt an der Tick-Nummer und baut sich selbst neu, sobald sie
weiterzählt. Ein Zwischenspeicher, den der Aufrufer pflegen muss, ist kein
Zwischenspeicher, sondern eine Verabredung.

## Was neu geprüft wird

* **`Koerperraster`** (`physics.test.ts`, 5 Fälle): Antwortet über ein dichtes
  Punktgitter genau wie ein linearer Durchlauf; übersieht keine große Form in
  der Nachbarzelle; baut sich je Stand genau einmal.
* **Wandraster** (`map-reachability.test.ts`, 2 Fälle): `isFree` liefert an über
  15 000 Punkten und drei Radien exakt dieselbe Antwort wie die Rechnung über
  alle Wände – und eine ausgeschaltete Wand verschwindet auch aus dem Raster.

Beide prüfen **Gleichheit, nicht Tempo**. Eine Abkürzung ist nur so viel wert
wie der Beweis, dass sie dasselbe Ergebnis liefert.

## Was offen bleibt

* **Ob es für Sam jetzt flüssig ist, entscheidet Sam.** Diese Umgebung
  rasterisiert in Software und schafft nur 3 Bilder je Sekunde – für einen
  A/B-Vergleich taugt sie, für ein Urteil über die absolute Bildrate nicht.
* **Falls es weiter ruckelt, liegt es nicht an der Simulation.** Dann sind die
  nächsten Verdächtigen in dieser Reihenfolge: die 200-ms-Halteschwelle der
  Halbautomatik (`fire-cadence.ts`) – sie ist eine **absichtliche** Verzögerung
  des zweiten Schusses und kann sich wie Trägheit anfühlen –, der Tempo-Deckel
  von 430 px/s (`TEMPO_DECKEL`), der mehr Klassen betrifft als nur die
  schnellsten, und `querySelectorAll` im HUD, mit 2,2 % der Client-JS-Zeit der
  größte Einzelposten dort (in beiden Fassungen gleich, also alt).
* **`moveCircle` für 562 Formen** bleibt der größte verbleibende Posten. Formen
  driften mit 10–16 px/s; sie jeden Tick durch die volle Wandauflösung zu
  schicken, ist mehr, als die Bewegung verlangt. Eigene Runde.

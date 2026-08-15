# 35 – Performance auf 1A: gemessen, nicht geraten

| | |
| --- | --- |
| **Auftrag** | Sam, 15.08.: „lass jetzt die komplette PERFORMANCE dieses GAMES zu einer 1A machen, soll überall extrem smooth laufen ohne Probleme etc! auf allen Geräten!" |
| **Branch** | `main` |
| **Tests** | `npm run check` grün – 94 Dateien, 1284 Tests |
| **Werkzeuge** | `scripts/frame-probe.mjs` (jetzt mit `STUFE=`), `scripts/perf-live.mjs` |

## Die Reihenfolge: erst messen, wo die Zeit hingeht

Vier Profile, jedes an einem eigenen Engpass:

| Was | Wie gemessen | Befund |
| --- | --- | --- |
| Server, leer | `/metrics` | Tick p50 1,4 ms von 25 ms Budget |
| Server, 30 Clients | CPU-Profil des Prozesses | **76 % Leerlauf**; der Rest ist Serialisierung (`send` 2,3 %, `writev` 3,2 %) |
| Client-JS | CDP-Profil bei kleinem Fenster | 1220 ms je 20 s – davon **364 ms in einem einzigen Aufruf** |
| Füllrate | Bildzeiten je Qualitätsstufe | `low` war praktisch so teuer wie `mid` |

Der Server war nach [Bericht 33](33-lag.md) schon erledigt und ist es geblieben.
Alles Weitere spielt sich im Client ab – und dort **nicht** im Rechnen.

## 1. Der größte JS-Posten: eine Suche, die nie etwas Neues findet

`ui.ts` fragte bei **jedem** Snapshot, also zwanzigmal je Sekunde, in einer
Schleife über alle Aufwertungs-Slots:

```ts
const pips = this.root.querySelectorAll<HTMLElement>(`[data-pips="${id}"] i`);
pips.forEach((pip, index) => pip.classList.toggle('filled', index < currentLevel));
```

Das sind zehn Suchen über das ganze Dokument je Snapshot – **200 in der
Sekunde** – für Elemente, die seit dem Aufbau des HUD an derselben Stelle
hängen. Dazu rund 1600 `classList.toggle` je Sekunde, von denen fast alle
nichts tun, weil der Füllstand schon stimmt.

Im Profil war `querySelectorAll` damit **30 % der gesamten JavaScript-Zeit des
Clients** – der mit Abstand größte Einzelposten, größer als alles, was mit dem
eigentlichen Spiel zu tun hat.

Jetzt werden Punkte und Beschriftungen einmal beim Aufbau eingesammelt, und der
Füllstand wird nur angefasst, wenn sich die Stufe geändert hat.

## 2. Die unterste Qualitätsstufe war keine

Das Profil sagt klar, wo der Rest liegt: Das JavaScript kostet nach dem Eingriff
**852 ms je 20 Sekunden – 43 ms in der Sekunde, also drei Prozent** eines
60-Hz-Budgets. Kein einzelner Posten liegt über 0,3 %. Was schwache Geräte
umbringt, ist nicht das Rechnen, sondern die **Fläche**.

Und ausgerechnet dagegen tat `low` fast nichts:

* `resolutionCap` stand auf **1** – volle Schirmauflösung. Der als „teuerster
  Hebel" dokumentierte Regler war auf der untersten Stufe nicht angezogen.
* `pixelRatio()` klemmte zusätzlich mit `Math.max(1, …)` nach unten ab: Ein Wert
  unter 1 wäre gar nicht durchgekommen.
* Jede Kugel zeichnete vier Flächen übereinander – Schweif, Streulicht, Körper,
  Glanz –, jede verglimmende zwei. Bei achtzig Kugeln im Bild über dreihundert
  gefüllte Flächen je Bild, von denen genau eine je Kugel die Information trägt.

| | vorher | jetzt |
| --- | --- | --- |
| `low.resolutionCap` | 1 | **0,75** (44 % weniger Fläche) |
| Boden in `pixelRatio()` | 1 | 0,5 |
| Schmuck an Kugeln auf `low` | voll | **nur der Körper** |

Gemessen auf dieser Maschine – sie rasterisiert in Software und ist damit ein
brauchbares Modell für ein füllratenschwaches Gerät:

| Stufe | Lauf 1 | Lauf 2 |
| --- | ---: | ---: |
| high | 2,7 fps | 3,1 fps |
| mid | 3,4 fps | 3,4 fps |
| **low** | **6,9 fps** | **7,6 fps** |

Der Vergleich ist ehrlicher, als er aussieht: `devicePixelRatio` ist hier 1, das
alte `low` rechnete also exakt wie das heutige `mid`. **Die unterste Stufe hat
sich verdoppelt.**

## 3. Die Automatik reagierte zu spät

Zwei Regeln, beide zulasten schwacher Geräte:

* Das erste Urteil kam nach **zehn Sekunden**. Wer mit 12 fps startet, spielt
  die ganze Eingewöhnung im Ruckeln, bevor überhaupt jemand hinsieht. Das erste
  Fenster ist jetzt **drei Sekunden** lang, danach übernimmt das lange – dort
  ist Ruhe wichtiger als Tempo.
* Es ging **ein Schritt je Fenster** nach unten. Ein Gerät mit 12 fps startet
  auf „mittel" und brauchte zwei Fenster bis unten. Unterhalb von 20 fps
  (`NOT_FPS`) geht es jetzt sofort ganz nach unten.

Der Schutz gegen Pendeln bleibt: Zwischen 20 und 30 fps gilt weiter der einzelne
Schritt, und wer bei 20 fps liegt, kommt oben unter keinen Umständen mit.

## 4. Neun Kilobyte Müll, zwanzigmal je Sekunde

Der Renderer zeichnet die Wände nur neu, wenn sie sich geändert haben – die
Frage stellte er aber bei jedem Snapshot, und zwar so:

```ts
snapshot.walls.map(wall => `${wall.id}:${wall.x}:${wall.y}:${wall.width}:${wall.height}`).join('|')
```

Für 230 Wände rund neun Kilobyte, zwanzigmal je Sekunde – **180 kB je Sekunde**
für eine Antwort, die fast immer „nein" lautet. Jetzt eine Streuzahl (FNV-1a)
über dieselben Felder, ohne Zwischenspeicher. `wall-signature.test.ts` prüft,
dass sie jede Änderung bemerkt, die zählt: verschwundene Wand (der
Fracture-Fall), neue Wand, jede verschobene Kante, Umbenennung, Reihenfolge.

## Was unterm Strich steht

| | vorher | jetzt |
| --- | ---: | ---: |
| Client-JS je 20 s | 1220 ms | **852 ms** (−30 %) |
| größter JS-Posten | 364 ms (30 %) | 53 ms (0,3 %) |
| unterste Stufe, füllratengebunden | ~3,4 fps | **7,6 fps** |
| erstes Qualitätsurteil | nach 10 s | nach **3 s** |
| Tick p50 (Bericht 33) | 4,2–5,3 ms | 2,3 ms |
| Müll je Sekunde (Wandkennung) | 180 kB | 0 |

Das JS-Profil ist danach **flach** – kein Posten über 0,3 %. Das ist das
Zeichen, dass hier nichts Billiges mehr liegt.

## Was offen bleibt und ehrlich gesagt gehört

* **Ob es auf Sams Gerät reicht, ist damit nicht bewiesen.** Diese Umgebung
  rasterisiert in Software; sie taugt für A/B-Vergleiche und für die Frage, was
  Fläche kostet, nicht für ein Urteil über absolute Bildraten.
* **Die Antwort darauf liegt schon bereit**: Der Client meldet Bildrate,
  Geräteklasse, Renderpfad und Qualitätsstufe an `POST /client-metrics`.
  `node scripts/perf-live.mjs --url <host>` stellt sie nebeneinander. Nach dem
  nächsten Spiel steht dort, welche Stufe Sams Gerät wählt und was es damit
  schafft. **Ohne diese Zahlen ist jeder weitere Eingriff geraten.**
* **Der nächste Hebel, falls es nicht reicht**, ist nicht mehr klein: Die
  Zeichenflächen für Kugeln, Drohnen und Effekte werden in jedem Bild komplett
  neu aufgebaut (`clear()` und alles wieder hinein). Das in wiederverwendete
  Sprites umzubauen ist der große Schritt – und einer, den man erst gehen
  sollte, wenn eine Messung ihn verlangt.
* **Ein 404 in der Konsole** beim Start (eine nicht gefundene Datei) ist
  aufgefallen und nicht verfolgt – er kostet keine Bildrate, gehört aber
  aufgeräumt.

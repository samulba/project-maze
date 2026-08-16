# 36 – Rohr-Vokabular und Drohnen nach Vorbild

| | |
| --- | --- |
| **Auftrag** | Sam, 16.08.: „Klassen sind noch immer richtig Arsch vom Design her und auch von der Abwechslung her und auch wie die schießen" + „Drohnen zu spielen fühlt sich noch immer komplett kacke an – analysier das System von Diep.io und Arras.io und übernimm es genauso" |
| **Grundlage** | Sams Diep.io-Klassenbaum (Bild) und seine Recherche vom 16.08. (DiepInDepth, Diep-Wiki, arras.io-Quellcode) |
| **Tests** | `npm run check` grün – 94 Dateien, 1287 Tests |

## Teil 1: Die Rohre – eine fehlende Zahl

`Lauf` kannte Winkel und Länge. Nicht aber **`versatz`**, den seitlichen
Abstand von der Mittellinie. Damit strahlen mehrere Rohre zwangsläufig aus
einem Punkt – und ein Diep.io-Twin, zwei **parallele** Rohre nebeneinander, ist
weder zeichenbar noch schießbar.

Der Befund dahinter war deutlicher als erwartet:

| | Klassen |
| --- | ---: |
| genau ein Rohr | 46 |
| Fächer aus `barrelCount`/`barrelSpread` | 18 |
| echte Lauf-Profile | 3 |

Gleichzeitig trugen die Rümpfe 160 Panzerplatten, 48 Akzente, 19 Aussparungen
und 8 Kronen. **Die ganze Abwechslung steckte im Rumpf – dort, wo Diep.io
schlicht einen Kreis zeichnet.** Wir hatten es exakt andersherum.

### Das Vokabular

| Feld | Wirkung | Vorbild |
| --- | --- | --- |
| `angle` | Richtung | Triple Shot, Octo |
| `versatz` | seitlich, in Rohrbreiten | **Twin, Doppel-Twin, Vanguard** |
| `laenge` | Faktor auf `barrelLength` | Penta (mittig lang, außen kurz) |
| `breite` / `muendungsbreite` | Wurzel und Mündung getrennt | Destroyer (fett), Sniper (dünn), **Machine Gun und Launcher (Trapez)** |

Dazu `launchers`: Rohre, die gezeichnet, aber **nie gefeuert** werden. Alle zehn
Drohnenklassen standen auf `barrelCount: 0` und zeichneten damit buchstäblich
kein Rohr – während in Diep.io ausgerechnet sie die auffälligsten Teile tragen.

Ergebnis: **66 unterschiedliche Rohr-Silhouetten bei 67 Klassen.** Ohne Profil
bleiben nur Core (der schlichte Starter) und Smasher (bewusst rohrlos).

Die Rohrbreite ist dafür aus dem Client nach `shared` gezogen (Sams C2/C3-Regeln
unverändert, Tests mitgezogen): Eine Breite, die nur der Client kennt, kann kein
Profil skalieren und keine Kugel versetzen. Der Server feuert jetzt aus dem
versetzten Rohr – zwei parallele Rohre liefern zwei parallele Ströme.

### Drei Fehler, die die Tests gefangen haben

* **`forwardBarrelCount` las nur `barrelAngles`.** Als die Profile sie
  ablösten, hielt die Balance-Rechnung Octos acht Rundum-Läufe für acht
  Frontläufe: 173 statt 92 DPS. Eine Klasse wäre still 88 % über ihren
  Rollenkorridor gerutscht.
* **Vanguard hatte ich zum Quad-Tank gemacht**, obwohl sein eigener Text „vier
  kurze Läufe im engen Fächer – eine Wand aus Nadeln" sagt. Der Klassentext ist
  die Vorgabe, nicht das Vorbild. Jetzt vier parallele Rohre.
* **Gatling hatte ich zum Teleskop-Stapel gemacht** – alle Winkel 0. Damit war
  die Hitze-Mechanik (der Fächer zieht sich unter Dauerfeuer zusammen) still
  eine Attrappe. Jetzt ein Fächer, und die Hitze skaliert auch die Profilwinkel.

## Teil 2: Die Drohnen – fünf erfundene Regeln ersetzt

Sams Recherche hat mich in zwei Punkten korrigiert, und beide waren in unserem
Code als Regel verdrahtet.

### Die Umkehrung: Auto-Fire ist nicht Auto-Aim

> „Mit aktiviertem Auto-Fire folgen die steuerbaren Drohnen permanent dem
> Cursor und wechseln deshalb nicht in ihre normale Idle-AI."

**Das dreht Sams Regel vom 14.08. um.** Damals: „nur angreifen, wenn du im
E-Auto-Modus bist und man nix klickt". Tatsächlich verhalten sich beide Spiele
andersherum – Klick UND Auto-Feuer sind dieselbe manuelle Steuerung, und die
eigene Zielsuche greift nur, wenn **gar nichts** gedrückt ist.

| Eingabe | vorher (14.08.) | jetzt (nach Recherche) |
| --- | --- | --- |
| Linksklick | zum Zeiger | zum Zeiger |
| Auto-Feuer (E) | **sucht selbst ein Ziel** | **zum Zeiger** |
| nichts | Orbit, greift nichts an | **sucht selbst ein Ziel** |
| Rechtsklick | radial vom Besitzer weg | **vom Cursor weg, je Drohne** |

### Was noch erfunden war

| Unsere Fassung | Recherche |
| --- | --- |
| Formationsring: jede Drohne ein eigener, kreisender Platz | „Alle Drohnen erhalten denselben Zielpunkt. Ihre Verteilung entsteht durch **Eigenkollisionen** – nicht durch feste Winkel oder Phasen." |
| Ankunftsbremse (`abstand / 0,18 s`) | „Die Drohnen haben **keinen** normalen Arrival/Stop-Controller." |
| Schub zeigt direkt aufs Ziel | „Darstellung **und Schubbeschleunigung** folgen der **geglätteten** Steuerungsrichtung zum Ziel." |
| Ausrichtung = Flugrichtung | `FACING_TYPE: "smoothToTarget"` |
| Abstoßen radial vom Besitzer | `repelGoal = 2 × Drohnenposition − Cursor` |

Der Formationsring hat den Schwarm **falsch geordnet**: sauber verteilt, wo er
unordentlich sein soll. Genau das ist „fühlt sich komisch an" – eine Flotte, die
wie ein Zahnrad läuft statt wie ein Schwarm.

### Die Physik

Diep zieht 10 % Geschwindigkeit je Tick ab, die Grenzgeschwindigkeit ist das
Zehnfache der Beschleunigung. In stetiger Form: `exp(−Rate · dt)` mit
`Rate = −ln(0,9) · Tickrate` ≈ 4,21/s. Der Schub liegt auf einer **Steuerrichtung
je Drohne**, die sich mit begrenzter Rate zum Ziel dreht – daraus entstehen
Überschießen und Umkreisen von selbst, statt aus einer Formel, die einen Kreis
vorschreibt.

Der Bahnradius ist damit eine Folge (Tempo ÷ Drehrate), keine Vorgabe. Die
Drehrate ist gemessen, nicht geraten:

```
Drehrate  5  →  Orbit 64 px, Tempo 272 px/s   (fliegt im Labyrinth in Wände)
Drehrate 11  →  Orbit 26 px, Tempo 207 px/s   ← gewählt
Drehrate 18  →  Orbit 19 px, Tempo 184 px/s
```

### Zwei Fehler auf dem Weg

* **Der Schwarm stand still.** `schiebeAuseinander` löscht die Geschwindigkeit,
  die ins Hindernis zeigt – für Wände richtig, für Drohnen untereinander fatal:
  Eine Flotte auf denselben Punkt keilt sich ein, jede bekommt ihre
  Einwärtsbewegung gestrichen, gemessen **Tempo 0** direkt neben dem Zeiger. Das
  neue `schwarmAbstand` korrigiert nur den Ort.
* **Die Ruhe-Drosselung hätte die Flotte abgehängt.** Der enge Orbit sweept mit
  vollem Schub in die Wände (gemessen: Flotte nach 60 Ticks leer), also fliegt
  der Ruhezustand gedrosselt. Ein fester Deckel hätte aber geheißen: Wer ohne
  Kommando losfährt, lässt seine Drohnen stehen. Jetzt ist die Drosselung eine
  Untergrenze am Besitzertempo.

### Gemessen, auf freiem Feld

| | vorher | jetzt |
| --- | --- | --- |
| am Zeiger, Abstand | fester Ring | **23–28 px** |
| am Zeiger, Tempo | ~66 px/s (Ringtempo) | **205–239 px/s** |
| am Zeiger, Streuung | konstant (Ring) | **22–32 px, wechselnd** |
| in Ruhe, Abstand | 82 px (fester Ring) | 95–101 px |

## Zwei bewusste Abweichungen vom Vorbild

Beide haben denselben Grund: **Diep.io hat keine tödlichen Wände, wir schon.**

1. **Die Leine bleibt** (Zeigerreichweite). Die Recherche sagt, es gibt keine –
   aber ein gehaltener Rechtsklick schöbe die Flotte sonst außer Sicht, von wo
   sie nicht zurückkommt. Für Klick und Zielsuche bindet sie nie.
2. **Der Ruhezustand fliegt gedrosselt** (mindestens Besitzertempo × 1,25).

## Was offen bleibt

* **Die Rümpfe.** Der Kontaktbogen zeigt jetzt sehr deutlich, dass sie das
  nächste Problem sind: Sechsecke, Rauten, Pfeile, gestrichelte Ringe – während
  in Sams Bild **jeder** Körper derselbe Kreis ist. Das ist der nächste Schritt
  und überwiegend Löschen.
* **Launcher als Spawnpunkt.** Sie werden gezeichnet, aber Drohnen entstehen
  weiter am Rumpf. In Diep.io kommen sie aus dem Launcher.
* **Nachschubzeiten** aus der Recherche (Overseer 1,5–0,8 s je Volley von zwei
  Drohnen) sind noch nicht gegen unsere `droneRespawn`-Werte gehalten.

# 14 – Sams Rand-Befund gemessen · Sichtfeld-Modus · Zuschauen sichtbar

**Branch:** `claude/chat-03-client-ux-mazers-yu57ca` · **Basis:** `origin/main` @ `c9aeb2b` · **Status: OFFEN – wartet auf Merge**

Zwei von drei Befunden. **Befund 2 (Startscreen als Navigation) habe ich
geschnitten** – Begründung unten unter „Schnitt".

## Befund 1 – Die Ränder: es ist kein Bug

**Dein Verdacht war eine Reihenfolge zwischen `fullscreenchange` und dem
Neuberechnen. Den kann ich ausschließen.** Ich habe die ganze Kette gemessen –
Fenster, `visualViewport`, Canvas-CSS-Box, Canvas-Puffer, das gemeldete
Sichtfeld (`--view-x`) – und dazu die **tatsächliche Kante im Bild**: Ein
Screenshot wird im Browser dekodiert, und die Balken werden über die Spalten
gesucht, die von oben bis unten einfarbig sind. Farbvergleiche taugen dafür
nicht mehr, seit der Grundlook wieder dunkel ist – der Balken und der
Arenaboden liegen zu dicht beieinander. Über die Varianz geht es.

24 Übergänge: sieben Fenstergrößen, jede dreimal – Fenster, Vollbild rein,
Vollbild raus. Gemessen wurde bewusst **kurz nach dem Umschalten** (120 ms),
also vor dem zweiten `syncSize` bei 350 ms; sonst sieht man den
Zwischenzustand nie.

| Fenster | erwartet | gemeldet | gemessen L/R | HUD-Kante |
|---|---|---|---|---|
| 1920×1080 | 0 | 0 | 0 / 0 | 18 |
| 2560×1080 | 320 | 320 | 320 / 320 | 338 |
| 3440×1440 | 440 | 440 | 440 / 440 | 458 |
| 2560×1440 | 0 | 0 | 0 / 0 | 18 |
| 1280×1024 | 0 (152 oben) | 0 / 152 | 0 / 0 | 18 / 170 |
| 1920×1200 | 0 (60 oben) | 0 / 60 | 0 / 0 | 18 |

**In allen 24 Schritten stimmt das Sichtfeld mit der Rechnung überein** – im
Vollbild wie außerhalb, beim Hinein- wie beim Herauswechseln. Die
Viewport-Härtung aus R1 hält.

**Auch dein Punkt 1 stimmt nicht mehr:** Das HUD hängt am Spielfeld, nicht am
Fenster. `style.css` setzt seit dem Startscreen-Umbau
`--edge-x: calc(var(--view-x) + var(--gap))` unter `min-width: 901px`, und die
Messung bestätigt es: bei `--view-x: 320` steht die Spielerkarte bei 338, die
Bestenliste 338 vom rechten Rand, bei 440 entsprechend bei 458. Kein Panel
schwebt im Balken.

Damit bleibt genau eine Ursache: **das feste 16:9 auf einem 21:9-Schirm.**
2560×1080 sind 320 px links und rechts – ein Viertel der Fläche. Das ist keine
Fehlfunktion, das ist die Regel aus dem MASTERPLAN. Sams „das ist nicht
responsive" trifft genau das.

### Was ich für richtig halte: flächengleich statt formgleich

Die Fairness-Begründung ist gut und soll bleiben – wer breiter sieht, sieht
Gegner früher. Aber sie verlangt nicht, dass der Ausschnitt **die gleiche Form**
hat, nur dass er **gleich viel Arena** zeigt.

Also: nicht das Seitenverhältnis festhalten, sondern die **Fläche**. Ein breiter
Schirm sieht weiter zur Seite und dafür weniger nach oben und unten; das
Produkt bleibt 1600 × 900 = 1,44 Mio. Einheiten².

| Schirm | Sicht bisher | Sicht flächengleich | Balken |
|---|---|---|---|
| 16:9 | 1600 × 900 | **1600 × 900** (identisch) | keine |
| 21:9 (2560×1080) | 1600 × 900 | 1848 × 779 (+15 % / −13 %) | **keine** |
| 4:3 (1280×1024) | 1600 × 900 | 1342 × 1073 (−16 % / +19 %) | **keine** |
| 32:9 | 1600 × 900 | geklemmt bei 2,4 | schmal, bleibt |

**Auf 16:9 ändert sich nichts** – nicht ungefähr, sondern auf sechs
Nachkommastellen; ein Test hält das fest. Wer heute spielt, merkt vom
Umschalten nichts, und die Balance verschiebt sich nicht durch die Hintertür.

**Die Klemmung bei 2,4 ist keine Geschmacksfrage, sondern gerechnet.** Der
Server schneidet Wände bei `visibleWorldWidth · 0,62` = 992 Einheiten ab und
Entitäten bei `viewRadius` = 1100. Ein Client, der weiter sieht, bekommt Wände,
die am Bildrand aus dem Nichts auftauchen. Bei Seitenverhältnis 2,4 liegt die
halbe Sichtbreite bei 949 – 43 Einheiten Luft. `viewportLimits()` rechnet das
aus, und vier Tests prüfen es gegen die Server-Konstanten: **Wenn 02 an den
Cull-Werten dreht, fällt es hier auf und nicht im Spiel.** Die gängigen
Ultrawides (2560×1080 = 2,370 · 3440×1440 = 2,389) liegen darunter.

**Standard bleibt „Fest 16:9".** Eine Änderung der Sichtweite ist eine
Balance-Frage, also Regel 3: Sie steht als Auswahl „SICHTFELD" im Startscreen
neben der Grafikstufe, und Sam entscheidet nach dem Ansehen. Umschalten wirkt
sofort, auch mitten im Spiel.

### Zwei Aufräumarbeiten, die dabei anfielen

- **Die Rechnung lag zweimal im Code.** `gameplay-effects.ts` hatte eine eigene
  Kopie der Viewport-Formel, um Weltpunkte auf den Bildschirm zu rechnen (Zonen,
  Guardian-Ringe, Barriere-Balken). Zwei Kopien derselben Geometrie sind genau
  die Art Fehler, die sich später als „die Zone sitzt nicht auf dem Kreis"
  zeigt. Beide gehen jetzt durch `viewport.ts`.
- **Die Geometrie war nur über Screenshots prüfbar.** Sie liegt jetzt als
  Funktion über zwei Zahlen in `viewport.ts` – 22 Tests, darunter die
  Pixelwerte aus der Browser-Messung oben als Regressionsnetz („kein Bug ohne
  Test", auch wenn es hier kein Bug war).

### Nachgewiesen

Beide Modi im Browser, je vier Fenstergrößen:

| Modus | 2560×1080 | 1920×1080 | 3440×1440 | 1280×1024 |
|---|---|---|---|---|
| Fest 16:9 | 320 px Balken | keine | 440 px | 152 px oben |
| Bildschirmfüllend | **keine** | keine | **keine** | **keine** |

## Befund 3 – Zuschauen ist wieder zu sehen

Der Death-Screen legt sich als ganzflächige Ebene mit Abdunklung
(`rgba(2,3,7,.54)`) und Weichzeichner (`blur(7px)`) über die Arena. Beim
Zuschauen ist das genau die Fläche, die man sehen soll.

Der Konflikt entsteht nur in dieser einen Lage, also wird er auch nur dort
gelöst: **Solange zugeschaut wird, verliert der Death-Screen Abdunklung und
Weichzeichner, und die Karte zieht sich in die untere linke Ecke zusammen** –
dorthin, wo beim Toten ohnehin nichts steht, weil das Upgrade-Panel dann aus
ist. Die sechs Statistik-Kacheln weichen einer Zeile mit denselben Zahlen, das
Loadout bleibt wählbar (es gilt ab dem Respawn), verliert aber seine
Erklärzeile. Die Fläche gibt Klicks an die Arena weiter, die Karte selbst nicht.

**Ohne Zuschauen ändert sich nichts** – der Death-Screen bleibt der bisherige.

Ich habe bewusst **nicht** „Zuschauen ist ein bewusster Schritt aus dem
Death-Screen heraus" gebaut: Der Zuschauer-Blick kommt vom Server
(`SPECTATOR_ENABLED`), der Spieler hat ihn nicht gewählt – ein Knopf dafür
würde eine Entscheidung verlangen, die woanders schon gefallen ist. Und keinen
Zeitablauf, weil „nach ein paar Sekunden" willkürlich ist, wenn gar nicht
zugeschaut wird.

### Nachgewiesen

1600×900, Zuschauer-Zustand untergeschoben (der lokale Server läuft ohne
`SPECTATOR_ENABLED`):

| | Karte deckt | Abdunklung | Weichzeichner | Respawn | Zum Startscreen |
|---|---|---|---|---|---|
| normal | 22,0 % des Bildschirms | `rgba(2,3,7,.54)` | `blur(7px)` | sichtbar, aktiv | sichtbar |
| beim Zuschauen | **6,6 %** | **keine** | **keiner** | sichtbar, aktiv | sichtbar |

Die Karte sitzt bei 18 px vom linken Rand und 18 px über der Unterkante, das
Band „DU SIEHST NYX ZU" steht oben, die Arena ist frei.

## Schnitt: Befund 2 ist nicht drin

Der Startscreen als Navigation ist ein eigenes Paket, kein Anhängsel. Er
verlangt eine Seitenstruktur (Start · Profil · Achievements · Bestenliste ·
Einstellungen), das Umziehen von vier gewachsenen Panels, einen Rückweg von
jeder Unterseite und die Auflage, dass der Weg ins Spiel nicht länger wird.
Halb gebaut wäre er schlechter als gar nicht gebaut – dann stünde ein Teil auf
Unterseiten und der Rest weiter auf der Startseite.

Ich habe stattdessen den Bug-Befund vollständig gemessen (dein „fang bei der
Reproduktion an") und den Zuschauer-Konflikt gelöst. **Ein Hinweis für das
Paket:** Meine neue SICHTFELD-Zeile macht den Einstellungsblock eine Zeile
länger. Das ist Absicht und kein Widerspruch – die Einstellungen sind genau
das, was in Befund 2 auf eine eigene Unterseite zieht.

## Geänderte Dateien

**Neu:** `viewport.ts(+test)`, `spectator.test.ts`
**Geändert:** `renderer.ts`, `gameplay-effects.ts`, `quality-panel.ts`, `ui.ts`,
`main.ts`, `spectator.css`

`packages/shared` und `apps/server` unangetastet.

## Tests

`npm run check` grün: 49 Dateien, 666 Tests (27 neu), Build in Ordnung.

## Von 01 gebraucht

1. **Merge.**
2. **Entscheidung Sam: Sichtfeld.** „Bildschirmfüllend" steht zur Wahl, Standard
   bleibt „Fest 16:9". Screenshots beider Modi bei 2560×1080 gehen in den Chat.
   Wenn Sam es will, ist das Umlegen des Standards eine Zeile in `viewport.ts`.
3. **An 02, zur Kenntnis:** Die Sichtfeld-Grenze hängt an `wallsInView`
   (`visibleWorldWidth · 0,62`) und `GAME.viewRadius`. Vier Tests in
   `viewport.test.ts` halten den Abstand fest. Wer an den Cull-Werten dreht,
   sieht dort, ob der Client noch dahinter bleibt.
4. **Unverändert offen für 04:** `tier` im Perf-Bericht – `client-metrics.ts`
   prüft weiter nur `quality`, der Client sendet das Feld deshalb nicht.

## Abweichungen und Grenzen

1. **Ich widerspreche der Diagnose im Auftrag.** Weder die Vollbild-Reihenfolge
   noch die HUD-Verankerung sind defekt; beides ist gemessen. Die Ränder sind
   das feste 16:9. Wenn diese Messung falsch ist, dann an einer Stelle, die ich
   nicht getroffen habe – dann brauche ich von Sam die Fenstergröße und ob er im
   Browser-Vollbild (F11) oder im Fullscreen-API-Modus war.
2. **Kein echtes F11 und kein echter Monitorwechsel.** Playwright kann die Taste
   nicht an den Browser-Chrome schicken; geprüft ist der API-Weg plus 21
   Fenstergrößen-Wechsel. F11 endet im selben `resize`-Pfad.
3. **Die Zoomstufe ist in dieser Messung nicht enthalten.** Sie hängt an
   `devicePixelRatio` und war Gegenstand von Paket 12 (Medienabfrage plus
   Sekundenvergleich); an der Viewport-Rechnung ändert sie nichts, weil die auf
   `app.screen` in CSS-Pixeln arbeitet.
4. **Der Zuschauer-Zustand ist untergeschoben, nicht echt.** Der lokale Server
   läuft ohne `SPECTATOR_ENABLED`; die Probe setzt `spectatorTargetId` auf der
   Leitung. Was der Client daraus macht, ist damit belegt – dass der Server das
   Feld richtig setzt, ist 02s Seite und anderswo geprüft.
5. **Der neue Sichtfeld-Modus ist nicht auf Handy und Tablet beurteilt.** Dort
   greift `mobile.css` mit eigenen Rändern, und die Formate liegen im
   Hochformat unter Seitenverhältnis 1 – dann klemmt die Rechnung und es bleibt
   bei Balken, wie bisher. Geprüft ist das nur rechnerisch, nicht am Gerät.
6. **Befund 2 fehlt vollständig** – siehe „Schnitt".

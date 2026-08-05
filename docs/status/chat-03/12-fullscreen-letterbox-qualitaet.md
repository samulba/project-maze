# 12 – R1/R2/R4: Vollbild, Letterbox-Rand, Qualitätsstufen

**Branch:** `claude/project-maze-fullscreen-quality-o2q3n4` · **Basis:** `origin/main` @ `d8568b6` · **Status: OFFEN – wartet auf Merge**

Damit ist Handlungsfeld 1 aus dem MASTERPLAN auf der Client-Seite durch
(R3 Mobile war das vorletzte Stück).

## R1 – Vollbild und Dichtewechsel

**Vollbild-Knopf** im Startscreen unter „Sound & Loadout" (Fullscreen-API).
F11 macht der Browser selbst; der Renderer horcht auf beide Wege. Kann der
Browser die API nicht, bleibt der Knopf aus, statt ins Leere zu führen.

**Der eigentliche Fund: die Renderauflösung blieb auf dem Wert vom Start.**
Ein Zoom- oder Monitorwechsel ändert nur `devicePixelRatio`, nicht die
Fenstergröße – es gibt also kein `resize`, an dem man das merken könnte. Nach
einem Wechsel auf einen HiDPI-Monitor sah alles matschig aus, umgekehrt hat das
Spiel unnötig Leistung verbrannt. Jetzt horcht eine Medienabfrage auf die
aktuelle Dichte (`(resolution: Xdppx)`, nach jedem Treffer neu gestellt), plus
ein Zahlenvergleich einmal pro Sekunde als Netz für Browser, in denen sie nicht
feuert.

Dazu ein zweiter, stiller Fehler: Die Auflösung gehört als **drittes Argument
in `resize`**. Sie nur am Renderer zu setzen ändert die Zeichenfläche nicht mit
– die Werte sahen richtig aus, das Bild blieb falsch.

### Nachgewiesen

| Fenster | Renderauflösung | Sichtfeld-Versatz | HUD |
|---|---|---|---|
| 1920×1080 @1× | 1 | 0, 0 | 250 px / 14 px |
| 1920×1080 @2× | 1,5 (Deckel „mittel") | 0, 0 | 250 px / 14 px |
| 2560×1080 @1× | 1 | 320, 0 | 330 px / 18 px |
| 1280×960 @1,5× | 1,5 | 0, 120 | 250 px / 14 px |
| 3840×2160 @1× | 1 | 0, 0 | 330 px / 18 px |

Canvas deckt in allen Fällen exakt den Bildschirm.

**Wechsel im laufenden Spiel** (1600×900 → 1024×768 → 2560×1080): Canvas und
Sichtfeld ziehen jedes Mal korrekt nach, keine Überlappungen.

**Dichtewechsel im laufenden Spiel** (eigener Kontext, damit Playwright nicht
seine eigene Metrik-Überschreibung zurückdreht):

| Gerätedichte | Renderauflösung |
|---|---|
| 1× (Start) | 1 |
| 2× | **1,5** |
| 3× | **1,5** (der Deckel der Stufe hält) |
| zurück auf 1× | **1** |

**Vollbild:** Klick → `document.fullscreenElement` gesetzt, Knopf beschriftet
sich auf „VOLLBILD BEENDEN"; zweiter Klick → wieder raus.

## R2 – Letterbox und HUD-Skalierung

**Weicher Abschluss statt harter Kante:** sieben Rechtecke mit je 8,5 %
Deckkraft, alle **vollständig innerhalb** des Sichtfelds (`alignment: 0`) und
zusätzlich von der Maske beschnitten. Bewusst kein Rahmenstrich – genau der
hatte in Paket 07 die „komischen Striche" erzeugt, weil sein Strich zur Hälfte
außerhalb der Maske lag.

Gemessen bei 1280×1024, Zeilen-Median quer über das Bild:

```
Balken      148:16  149:16  150:16  151:16
Kante       152:24.8 … 162:24.8      ← weicher Abschluss, ~11 px
Spielfeld   163:25.8 … 178:25.8
```

Der Balken ist gleichmäßig, es gibt keinen hellen Ausreißer an der Kante, und
der Rand des Sichtfelds wird ruhig dunkler statt abgeschnitten.

**HUD-Skalierung** über `clamp()`. Die vw-Faktoren sind so gewählt, dass der
Wert bei **genau 1920 px dem bisherigen Pixelwert entspricht**: Unter 1920
ändert sich nichts (der geprüfte 1080p-Look bleibt), darüber wächst das HUD
mit. Auf 2560 und 3840 misst die Statusleiste 330 px statt 250 und der
Spielername 18 px statt 14.

## R4 – Qualitätsstufen

Drei Stufen an vier Stellschrauben:

| | Partikel | Obergrenze | Leuchten | Kantenglättung | Auflösungs-Deckel |
|---|---|---|---|---|---|
| hoch | 100 % | 360 | ja | ja | 2× |
| mittel | 60 % | 200 | ja | ja | 1,5× |
| niedrig | 25 % | 80 | **nein** | **nein** | 1× |

- Auswahl im Startscreen unter „Sound & Loadout", gespeichert im
  `localStorage`. Kantenglättung und Auflösung greifen beim Start – deshalb
  liest `main.ts` die Stufe, **bevor** der Renderer hochfährt.
- **Automatik** startet auf „mittel" und stuft nach jedem 10-Sekunden-Fenster
  höchstens einen Schritt. Der Abstand zwischen den Schwellen (unter 30 fps
  runter, über 55 fps hoch) verhindert Pendeln; ein Test prüft genau das.
- Gemessen wird der **Median** der Framedauern, nicht der Mittelwert: Ein
  einzelner Nachlade-Ruckler soll die Einstufung nicht kippen.
- Wer selbst wählt, wird nicht mehr überstimmt. Eine Automatik, die eine
  getroffene Entscheidung überschreibt, ist ein Fehler und kein Komfort.
- Mindestens ein Partikel pro Treffer bleibt auch auf „niedrig" – ein Treffer
  ganz ohne Rückmeldung wäre schlimmer als ein sparsamer.

### Nachgewiesen

Auf einem 2×-Gerät, Stufe aus dem `localStorage`:

| Stufe | Auswahlfeld | Renderauflösung |
|---|---|---|
| hoch | `high` | **2** |
| mittel | `mid` | **1,5** |
| niedrig | `low` | **1** |

Auswahl wechseln speichert sofort (`project-maze-quality = low`).

## Vorschlag an 04: `quality` im Perf-Bericht

**Ich habe das Wire-Format nicht angefasst.** Der Server lehnt unbekannte
`quality`-Werte mit `400` ab, und ein Client, der dauerhaft abgelehnt wird,
fällt im Spiel nicht auf. Der Bericht schickt weiter genau den Renderpfad.

Für die Stufe schlage ich ein **eigenes Feld** vor statt kombinierter Labels:

```json
{ "quality": "webgl", "tier": "mid" }
```

Begründung: Kombinierte Labels (`webgl-mid`) würden die Kardinalität von 4 auf
12 heben und den bestehenden `/metrics`-Export (4×4) sprengen. Ein zweites
Feld mit drei Werten lässt sich dagegen als eigene Achse exportieren oder
zunächst ganz ignorieren – und die Frage „läuft es auf alten PCs?" beantwortet
erst die Kombination aus Renderpfad **und** Stufe: `webgl-kompat` auf „niedrig"
ist etwas anderes als `webgl` auf „niedrig".

Sobald `tier` serverseitig erlaubt ist, sind es im Client zwei Zeilen.

## Geänderte Dateien

**Neu:** `quality.ts(+test)`, `quality-panel.ts`
**Geändert:** `renderer.ts`, `particles.ts`, `ui.ts`, `main.ts`, `style.css`,
`start.css`, `controls.css`

## Tests

`npm run check` grün: 43 Dateien, 558 Tests (12 neu), Build in Ordnung.

## Von 01 gebraucht

Merge. Kein Flag, keine ENV-Variable. Für 04: der Vorschlag oben.

## Abweichungen und Grenzen

- **Kein echtes F11.** Playwright kann die Taste nicht an den Browser-Chrome
  schicken; geprüft ist der API-Weg. F11 endet im selben `resize`-Pfad, den
  die Fensterwechsel oben abdecken.
- **Kein echter Monitorwechsel.** Die Dichteänderung ist per CDP gestellt.
  Playwrights eigene Metrik-Überschreibung kollidiert dabei mit einer zweiten –
  deshalb läuft dieser Test in einem eigenen Kontext ohne `setViewportSize`.
  Das ist eine Eigenart des Testwerkzeugs, kein Verhalten des Clients.
- **Die Automatik ist nur im Unit-Test belegt.** Im Testbrowser (Software-GL,
  3–4 fps) würde sie sofort auf „niedrig" stufen – richtig, aber als Nachweis
  wertlos. Die Schwellen und das Nicht-Pendeln sind deterministisch getestet.
- **Partikelmenge und Leuchten sind nicht pixelweise nachgewiesen**, nur die
  Auflösung. Sie hängen an denselben Werten aus `QUALITY_TIERS`, die der Test
  prüft.

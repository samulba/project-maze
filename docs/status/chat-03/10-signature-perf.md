# 10 – Signature-Anzeige (Klassen 3.0) + Perf-Telemetrie-Sender

**Branch:** `claude/project-maze-signature-perf-o2q3n4` · **Basis:** `origin/main` @ `2551d34` · **Status: OFFEN – wartet auf Merge**

## Teil 1 – Signature-Anzeige

**Der Balken sitzt am Tank, das Wort im HUD.** Zwei Orte, aber kein doppelter
Balken – und beides zusammen beantwortet die zwei Fragen, die auseinanderfallen:

- *Wie voll ist es gerade?* → eine 2 px dünne Linie direkt unter dem
  Lebensbalken des eigenen Tanks. Dorthin schaut man im Gefecht ohnehin; 02s
  Warnung („ohne Anzeige liest sich die schwankende Feuerrate als Netzproblem")
  zielt genau auf diesen Moment.
- *Was ist das überhaupt?* → eine Zeile im Spieler-Panel: `MOMENTUM   72 %`.
  Namen gehören dorthin, wo Namen stehen.

**Generisch gebaut.** `signature.ts` ist die einzige Stelle mit der Zuordnung
Familie → Wort (`rapid` MOMENTUM, `precision` LADUNG, `control` EINHEITEN,
`impact` WUCHT). Ein Test läuft über `CLASS_DEFINITIONS` und schlägt fehl,
sobald eine fünfte Familie dazukommt – dann muss auch ihr Wort dazu.

**Drei Regeln, die im Zweifel greifen:**

1. Kein `signature` im Snapshot → keine Anzeige, weder Balken noch Zeile.
   (Flag serverseitig aus = optisch gar nichts.)
2. `0` ist ein **Wert**, kein Fehlen. Momentum ganz unten wird als leerer
   Balken gezeigt, nicht versteckt.
3. Kein Familienwort (Startklasse `core`) → auch kein Balken. Ein namenloser
   Füllstand am Tank wäre ein Rätsel statt einer Information.

**Auf dem Handy trägt der Balken allein** – in einer 44 px hohen Statusleiste
ist für ein Wort kein Platz, und die Leiste darf laut R3-Spezifikation nicht
wachsen.

### Nachgewiesen

Der Wert wurde in die eingehenden Snapshots gelegt (Server-Flag ist aus):

| Fall | Zeile im HUD | Wort | Wert |
|---|---|---|---|
| kein Feld im Snapshot | versteckt | – | – |
| `core` mit Wert 55 | versteckt | – | – |
| `twin` (rapid) mit Wert 72 | sichtbar | MOMENTUM | 72 % |
| `twin` mit Wert 0 | **sichtbar** | MOMENTUM | 0 % |

Dazu ein Screenshot mit dem Balken am Tank bei 72 %.

## Teil 2 – Perf-Sender

Nach der Spezifikation in `docs/status/chat-04/08-client-perf-telemetrie.md`.

- Framedauern aus `requestAnimationFrame`, **kein** gemittelter FPS-Zähler –
  ein Mittelwert versteckt genau die Ruckler, um die es geht.
- Ein Bericht pro Minute, frühestens 60 s nach dem Betreten der Arena.
- Das Fenster verfällt, sobald der Tab im Hintergrund war (dort drosselt der
  Browser auf ~1 Hz; das ergäbe erfundene 1-fps-Berichte).
- Unter 30 Stichproben wird nichts gemeldet – jede Perzentil-Aussage wäre
  geraten.
- Alle acht Felder sind auf die Server-Grenzen geklemmt. Ein Bericht, den der
  Server mit 400 ablehnt, wäre eine still verlorene Messung.
- `fpsP95` ist **per Konstruktion** der langsame Rand: Er wird aus dem
  95. Perzentil der Frame*dauer* gerechnet und zusätzlich auf `min(P50, P95)`
  gedeckelt.
- `quality` ist der Grafikweg aus `renderer.ts`. Die drei Labels sind jetzt als
  `RenderQuality` typisiert – ein Tippfehler fällt beim Kompilieren auf statt
  erst in der Server-Statistik.

### Nachgewiesen (echter Round-Trip gegen den laufenden Server)

Ein Browser, 135 Sekunden in der Arena:

```
abgesetzte POSTs: 1
  http://localhost:2567/client-metrics keepalive=true
  {"fpsP50":4,"fpsP95":4,"frameHangs":235,"dpr":1,"viewportW":1280,
   "viewportH":720,"deviceClass":"mid","quality":"webgl"}
Antwortcode: 204
```

Und die Gegenprobe, die 04 verlangt hat:

| Zähler in `/metrics` | vorher | nachher |
|---|---|---|
| `maze_client_reports_total` | 0 | **1** |
| `maze_client_reports_rejected_total` | 0 | **0** |
| `maze_client_reports_inverted_total` | – | **0** |

Genau ein Bericht nach genau einem Fenster, angenommen, kein Schema-Fehler,
nicht vertauscht.

Die 4 fps sind echt: Der Testbrowser rendert per Software-GL. Dass darin jeder
Frame als Ruckler zählt (235 Hangs), ist richtiges Verhalten, kein Messfehler.

## Geänderte Dateien

**Neu:** `signature.ts(+test)`, `perf-metrics.ts(+test)`
**Geändert:** `renderer.ts`, `ui.ts`, `main.ts`, `style.css`, `mobile.css`

## Tests

`npm run check` grün: 40 Dateien, 517 Tests (17 neu), Build in Ordnung.

## Von 01 gebraucht

1. Merge.
2. Danach kann 02 das Momentum-Flag serverseitig zünden – die Anzeige steht.
3. Nach dem Ausrollen lohnt der Blick auf
   `maze_client_low_fps_ratio{quality="webgl-kompat"}`; das ist die Zahl hinter
   „läuft auf alten PCs".

## Abweichungen und Grenzen

- **Zwei Anzeigeorte statt einem.** Der Auftrag ließ die Wahl („am Tank oder an
  der Statusleiste"). Ein Balken allein am Tank hätte keine Beschriftung
  gehabt, eine Zeile allein im HUD läge im Gefecht außerhalb des Blicks. Der
  Kompromiss ist ein Balken plus eine Textzeile – kein zweiter Balken.
- **Ein Bericht, nicht mehrere, verifiziert.** Für zwei Berichte hätte der Lauf
  über drei Minuten gebraucht; die Wiederholung hängt an derselben Zeile
  (`naechsterBericht = jetzt + interval`) wie der erste.
- **`document.hidden` konnte ich nur im Unit-Test prüfen**, nicht im echten
  Tab-Wechsel: Playwright kann eine Seite nicht so in den Hintergrund schicken,
  dass Chromium wirklich drosselt.

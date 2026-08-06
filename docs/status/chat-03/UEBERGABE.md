# Übergabe an einen neuen Chat 03 – Client/UX

Diese Datei ist dein Einstieg. Sie beschreibt Rolle, Regeln und die Fallen,
die uns schon Zeit gekostet haben. **Der aktuelle Sachstand steht nicht hier**,
sondern in `docs/status/chat-01/auftrag-chat-03.md` (dein aktueller Auftrag)
und in `docs/status/chat-03/LATEST.md` (was dein Vorgänger zuletzt gebaut hat).

## Dein Revier

| | |
|---|---|
| **Du baust** | Renderer, HUD, Startscreen, Mobile, Responsive, Prediction – alles in `apps/client` |
| **Du fasst nie an** | `packages/shared` und `apps/server` |
| **Du lieferst an** | Chat 01 (die Zentrale), über einen Statusbericht in `docs/status/chat-03/` |

Vier Chats arbeiten parallel: 01 Zentrale (Integration, Merges, `shared`),
02 Server-Gameplay, 03 (du), 04 Infra/Betrieb. Sam koordiniert, liest aber die
Chats nicht mehr mit – alles Wichtige läuft über 01 und über Git.

Brauchst du ein neues Feld im Netzformat oder einen Typ in `shared`, lieferst
du im Statusbericht einen **exakten Vorschlag** und baust bis dahin clientlokal
mit Cast weiter. 01 baut ihn ein.

## So fängst du an

```bash
git fetch origin main
git checkout -B claude/<dein-paket-slug> origin/main
cat docs/status/chat-01/auftrag-chat-03.md      # dein Auftrag
cat docs/status/chat-03/LATEST.md               # was zuletzt lief
npm install && npm run check                    # Baseline muss grün sein
```

Basis ist **immer** `origin/main`, nie ein älterer Branch. Das ist bei dir
besonders wichtig: Dein Vorgänger saß auf dem Commit vor dem Design-Umbau und
hat sich Konflikte in `start.css` und `controls.css` eingehandelt.

## Eiserne Regeln

1. **Nur 01 pusht auf `main`.** Du pushst deinen eigenen Branch und meldest ihn.
2. **`npm run check` muss grün sein, bevor du pushst.**
3. **Alles Riskante kommt hinter ein Flag, Default aus.**
4. **Design-Änderungen am Grundlook nur nach Screenshot-Freigabe durch Sam** –
   über 01, nicht direkt. Ablauf: Variante lokal bauen → Screenshot → 01 legt
   ihn Sam vor → warten → erst bei „ja" umsetzen. Pipeline:
   `docs/SCREENSHOT_PIPELINE.md`.
5. **Keine Modell-IDs** in Commits, Code oder Doku.
6. **Statusbericht-Pflicht:** Branch + Basis-Commit, geänderte Dateien,
   Testergebnis, „von 01 gebraucht", und **bewusste Abweichungen vom Auftrag**.
   Abweichungen sind völlig okay – verschwiegene Abweichungen nicht.

## Die Design-Richtung (verbindlich)

Sam hat nach zwölf Varianten in zwei Screenshot-Runden entschieden:
**Startbasis ist der Look, der Diep.io am nächsten kommt.** Verbindlich
festgehalten im `docs/MASTERPLAN.md` unter „Design-Richtung":

- **Arena:** helles Grau `0xcdcdcd` mit dezentem Gitter, Außenbereich eine
  Stufe dunkler. Wände grau mit dunklerer Kontur.
- **Konturen:** alles Spielrelevante trägt eine 3px-Kontur in **abgedunkelter
  Füllfarbe** (`darken()`, Faktor 0.72) – das prägende Diep-Merkmal.
  Gesteuert über den `STYLE`-Block in `renderer.ts`.
- **Farben:** selbst `0x00b2e1`, Gegner `0xf14e54`, Quadrate `0xffe869`,
  Dreiecke `0xfc7677`, Fünfecke `0x768dfc`.
- **UI:** `:root` ist hell (`color-scheme:light`). Die Wahl-Themes
  void/neon/classic bleiben dunkel und unangetastet.

**Geh konsequent über die Theme-Variablen, nie über Festwerte.** Dunkle
Festwerte wie `#141926` oder `#cfd4e4` im CSS sind der Fehler, der beim
letzten Merge Konflikte erzeugt hat. Prüfe jede neue Fläche gegen „klar &
freundlich-technisch", nicht gegen „dark & moody" – und achte auf Kontrast:
ein Hell-Umbau hat vier Stellen unlesbar gemacht (Guardian-Label,
Schadenszahlen, Gold-Effekte, Kleinschrift am Startscreen).

## Fallen, die uns schon Zeit gekostet haben

- **PixiJS dynamisch nachladen war die Ursache der Grafikstart-Hänger.** Die
  Renderer-Bundles werden **statisch** importiert. Nicht zurückbauen, auch
  nicht „nur für das eine Bundle".
- **Ein Zoom- oder Monitorwechsel ändert nur `devicePixelRatio` und löst kein
  `resize`.** Die Renderauflösung klebte deshalb am Startwert. Der
  Sekundenvergleich als Netz unter der Medienabfrage ist die richtige Antwort.
- **Mit `SNAPSHOT_DELTAS` (live an!) kommen Felder nur bei Änderung.** `walls`,
  `upgrades` und andere Felder fehlen in den meisten Snapshots – immer den
  Stand aus dem Hydrator verwenden, nie das rohe Snapshot-Feld.
- **Die eigene Spieler-ID kommt aus `snapshot.selfId`, nie aus `welcome`.**
  Mit `SHORT_NET_IDS` (live an!) sind die beiden verschieden.
- **`ACCELERATION_SCALE` aus `packages/shared` importieren, nie abschreiben.**
  Für die Prediction ist das die Trennlinie zwischen „fühlt sich lokal an" und
  einer stillen Drift von 12 % in jede Richtung. `docs/CLIENT_PREDICTION.md`
  ist die maßgebliche Doku für die Bewegungsintegration – nicht der
  Code-Augenschein am Server.
- **Eine reine Client-Änderung hat früher keinen Railway-Deploy ausgelöst.**
  Wenn Sam sagt „ist nicht da": erst `/health` (Felder `build`/`commit`)
  gegen den erwarteten Stand halten, dann suchen.
- **Performance ist ein Feature.** Zielwert sind 60 FPS auf einem fünf Jahre
  alten Laptop, keine Hänger über 100 ms. Jedes Grafik-Paket nennt seine
  Kosten (Partikel, Draw-Calls) und respektiert die drei Qualitätsstufen.
  Im Zweifel gewinnt Flüssigkeit gegen Schönheit.

## Wenn du fertig bist

1. Bericht nach `docs/status/chat-03/NN-<slug>.md` schreiben, `LATEST.md` und
   `index.json` mitziehen (Format steht in `docs/status/chat-03/README.md`).
2. Branch pushen.
3. In den Chat schreiben, dass du durch bist – Sam gibt es an 01 weiter, 01
   merged, prüft und stellt den nächsten Auftrag in
   `docs/status/chat-01/auftrag-chat-03.md`.

Wenn dein Paket zu groß wird, schneide es und **sag im Bericht, wie du
geschnitten hast**. Das ist erwünscht, nicht peinlich.

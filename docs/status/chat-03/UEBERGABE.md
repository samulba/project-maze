> **SOLO-BETRIEB seit 07.08.:** Sam hat die Arbeits-Chats 02/03/04 aufgelöst –
> es gibt keine Rollenverteilung, keine Auftrag-Dateien und keine Übergabe an
> Chat 01 mehr. Sams Nachricht ist der Auftrag. Alles unten zu Revier und
> Statusblock-Runden ist historisch; die technischen Regeln und Fallenlisten
> gelten weiter. Dieser Ordner ist Archiv.

# Übergabe an einen neuen Chat 03 – Client/UX (historisch)

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

**Der Grundlook ist dunkel.** Verbindlich festgehalten im `docs/MASTERPLAN.md`
unter „Design-Richtung": `:root` dunkel (`color-scheme:dark`, `--bg:#151a26`,
`--text:#e8ebf3`, Akzent `#6f7ad6`), Arena dunkel mit dezentem Gitter, die
Wahl-Themes void/neon/classic unangetastet.

**Die Geschichte dazu solltest du kennen, sonst läufst du im Kreis:**
„Neon raus" → Sam: „zu düster, so will ich das gar nicht" (Grundton eine Stufe
angehoben) → Paletten- und Stilrunden → ein heller Diep-Look, den Sam nach
zwölf Varianten am Standbild abgenommen hat → **im Spiel verworfen und am
06.08. zurückgebaut**. Der helle Look sah in der Vorschau gut aus und live
nicht. Wer das nächste Mal Richtung hell will, braucht mehr als Standbilder.

Der Merksatz, der beide Wechsel überlebt hat: **ruhig und minimalistisch JA,
düster NEIN.**

**Geh konsequent über die Theme-Variablen, nie über Festwerte.** Genau das ist
der Grund, warum der Rückbau billig war: Was an `var(--…)` hing, ist
mitgewandert, ohne dass es jemand anfassen musste. Was Festwerte trug, hat
Konflikte erzeugt. Und achte auf Kontrast – beim Hell-Umbau waren vier Stellen
unlesbar geworden (Guardian-Label, Schadenszahlen, Gold-Effekte, Kleinschrift
am Startscreen).

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

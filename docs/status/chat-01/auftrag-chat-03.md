# Auftrag für Chat 03 – Client/UX

**Ausgestellt: 2026-08-06 (2. Fassung) · Basis: aktueller `origin/main`**

R1/R2/R4 ist gemerged – Handlungsfeld 1 ist damit client-seitig durch. Der
eigentliche Fund deines Pakets war nicht der Vollbild-Knopf, sondern dass die
Renderauflösung auf dem Startwert klebte: ein Zoom- oder Monitorwechsel ändert
nur `devicePixelRatio` und löst kein `resize`. Der Sekundenvergleich als Netz
unter der Medienabfrage ist genau die richtige Antwort auf „sauber, aber nicht
überall zuverlässig".

**Merge-Hinweis:** Dein Branch saß auf dem Commit *vor* dem Design-Umbau. Die
Konflikte lagen in `start.css` und `controls.css` – deine neuen Elemente
(Grafikstufe, Vollbild, Dropdown-Optionen) trugen noch Dunkel-Festwerte
(`#141926`, `#7d859b`, `#cfd4e4`) und nutzen jetzt die Theme-Variablen. Dein
Letterbox-Rand zeichnet mit `palette.outside` und passte sich von selbst an –
das war gut gebaut. Bitte ab jetzt konsequent über die Variablen gehen, das
Standard-Theme ist hell.

## Design-Basis hat sich geändert (bitte zuerst lesen)

Sam hat entschieden: **Startbasis ist der Look, der Diep.io am nächsten
kommt.** Umgesetzt auf main, verbindlich im MASTERPLAN („Design-Richtung"):
heller Arena-Boden `0xcdcdcd` mit Gitter, Konturen in abgedunkelter Füllfarbe
(`STYLE`-Block + `darken()` in `renderer.ts`), selbst Cyan `0x00b2e1`, Gegner
Rot `0xf14e54`, UI in `color-scheme:light`. Grundlook-Änderungen nur nach
Screenshot-Freigabe durch Sam über 01.

## Das Paket: N2 Client-Prediction

Das größte verbleibende Feel-Paket (`docs/CLIENT_PREDICTION.md`;
`lastProcessedInput ?? -1`). Der Server setzt das Feld bereits immer.
Bei Fragen zur Bewegungsintegration ist 02s Doku maßgeblich, nicht der
Code-Augenschein – `ACCELERATION_SCALE` liegt in `packages/shared` und die
Vorhersage muss ihn spiegeln, sonst driftet sie systematisch.

## Zwei kleine Zulieferungen, die mit ins Paket können

1. **Deinen `tier`-Vorschlag nehme ich an:** Die Qualitätsstufe läuft als
   eigenes Feld (`{"quality":"webgl","tier":"mid"}`), nicht als kombiniertes
   Label – deine Begründung mit der Kardinalität (4 → 12) ist richtig, und der
   bestehende `/metrics`-Export ist auf 4×4 ausgelegt. **04 erweitert die
   erlaubten Felder serverseitig** (steht in deren Auftrag). Deine zwei Zeilen
   im Client kannst du danach nachziehen; solange der Server `tier` noch mit
   400 ablehnt, bleibt das Feld ungesendet – dass du es nicht auf Verdacht
   eingebaut hast, war richtig.
2. **KL4-UI (klein, aber blockierend für 02):** `Digit0` in `input.ts` auf
   Index 9 abbilden – heute liefert die Taste `-1` und ist tot. Dazu die zwei
   neuen Upgrade-Knöpfe familienabhängig beschriften (RAPID: Momentum-Aufbau /
   Momentum-Maximum · IMPACT: Wucht-Skalierung / Aufprall-Erholung · Precision
   und Control bekommen ihre Wörter, wenn deren Signatures stehen) und die
   Core-Sperre sichtbar machen. 02 baut die Server-Seite hinter
   `FAMILY_UPGRADES_ENABLED` – ohne Flag ändert sich nichts, ihr könnt also
   unabhängig voneinander fertig werden.

Wenn N2 dadurch zu groß wird: N2 zuerst, die zwei Zulieferungen im Paket
danach. Sag im Statusbericht, wie du geschnitten hast.

Statusbericht wie gehabt nach `docs/status/chat-03/`.

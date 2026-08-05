# 02 – Event-Erlebnis: Zonenfarben, Guardian, Overcharge

**Branch:** `claude/project-maze-event-experience-o2q3n4` · **Basis:** `72ad7b9` · **Status: in main**

## Was drin ist

- **Event-Zone je Art gefärbt** (`arena-event-style.ts`, getestet): coreSurge
  gold, overcharge elektrisch-blau, hunterSignal rot-gold. Die Farbtabelle ist
  eine reine Funktion, damit sie ohne Grafik prüfbar bleibt.
- **Guardian-Auftritt:** Namensschild „⚔ GUARDIAN" statt Spielername, kurzer
  Spawn-Effekt aus Ring und Partikeln.
- **Overcharge fühlbar:** Funken an Projektilen innerhalb der Zone während der
  aktiven Phase, mit einer Obergrenze pro Sekunde statt pro Geschoss – sonst
  hängt die Funkenmenge an der Zahl der Kugeln im Bild.
- **Killcam-Kulisse:** Wände wandern pro Frame in den Ringpuffer statt nur als
  letzter Stand. Vorher konnten in der Aufzeichnung Wände stehen, die zum
  gezeigten Zeitpunkt längst aufgebrochen waren.

## Nachgewiesen

Arena-Events treten selten und spät auf (hunterSignal erst nach rund 6,5
Minuten). Statt zu warten, wurden Snapshots im Browser über den WebSocket
untergeschoben – damit sind alle drei Event-Arten, der Guardian und die
Funkenphase in Sekunden reproduzierbar und als Screenshot belegt.

## Geänderte Dateien

`arena-event-style.ts(+test)`, `gameplay-effects.ts`, `renderer.ts`, `ui.ts`,
`killcam.ts`/`killcam-view.ts(+test)`

## Von 01 gebraucht

Nichts – reiner Client.

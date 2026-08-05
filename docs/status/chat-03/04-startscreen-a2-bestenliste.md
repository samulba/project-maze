# 04 – Startscreen-Redesign (A2) + Bestenliste (A4)

**Branch:** `claude/project-maze-startscreen-a2-o2q3n4` · **Basis:** `main` @ `2e81500` · **Status: in main**

## Was drin ist

Der alte Screen war ein Formular: gleich gewichtete Kästen, austauschbare Typo.
Jetzt eine Bühne statt einer Karte – Rahmen, Hintergrund und Schatten der Karte
sind weg, damit nur noch zwei Dinge zählen: **Name und ARENA BETRETEN.**

- Logo als Anker mit Halo, Wortmarke im Markenviolett `#6B3FF5`
- Sound und Loadout hinter einem Aufklapper, standardmäßig zu
- **Lebendiger Hintergrund** (`start-backdrop.ts`, getestet): driftende Formen
  und ein Raster, ruhig, nichts blinkt; stoppt, sobald der Screen verschwindet
- **Bestenliste (A4)** aus `GET /leaderboard`, nur sichtbar, wenn der Server
  sie liefert – auf breiten Schirmen neben der Bühne, sonst darunter
- Theme-Auswahl bleibt wie vereinbart draußen: es gibt nur `DEFAULT_THEME`

## Nachgewiesen

- 390 px Breite **ohne Scrollen** (gemessen: `scrollHeight === clientHeight`)
- Ohne Bestenliste bleibt die Bühne mittig statt links zu kleben
  (`:not(:has(.start-board:not([hidden])))`) – im Browser gefunden, nicht gedacht
- Der Drehen-Hinweis schien vorher hinter der Startkarte durch und ist jetzt
  auf den Spielbildschirm beschränkt

## Geänderte Dateien

`start.css`, `start-backdrop.ts(+test)`, `start-leaderboard.ts(+test)`,
`ui.ts`, `main.ts`, `style.css`, `boot.css`

## Von 01 gebraucht

Nichts – reiner Client.

## Offener Befund (nicht von mir verursacht)

Der **produktiv gebaute** Client blieb lokal auf Port 2567 bei „Grafik wird
geladen …" stehen. Durch Stashen und Neubauen von `main` geprüft: Das Verhalten
war schon vorher da. Der Dev-Server ist nicht betroffen.

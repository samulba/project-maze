# 04 – Achievement-Engine (Sprint B)

**Branch:** `claude/achievements-engine-sprint-b` · **Basis:** `origin/main` @ `2e81500` · **Status: in main**

## Was drin ist

`apps/server/src/achievements.ts` als Tuning-Schicht, Katalog als
Datenstruktur mit `condition` als reinem Prädikat über `{player, progress}`.
Sieben Achievements: erste 5er-Serie, Guardian-Kill, Level 45, drei
Klassenfamilien, Overcharge-Kill in der Zone, Fracture-Kill durch eine offene
Wand, 10.000 Punkte.

Geprüft wird nach jedem Tick **und** direkt nach jedem Abschuss – sonst ginge
die 5er-Serie verloren, wenn der Angreifer im selben Tick stirbt (`killPlayer`
setzt `streak = 0`).

Ohne `ACHIEVEMENTS_ENABLED` wird die Schicht gar nicht angehängt. Zwei Tests
belegen das, einer davon vergleicht Klassenwahl und Abschussfolgen mit und ohne
Engine auf Gleichheit.

Für den Fracture-Kill kam `segmentCrossesWalls` in `world.ts` dazu:
`hasLineOfSight` ignoriert deaktivierte Segmente, für „ging der Schuss durch die
Bresche?" braucht man aber genau die.

## Wichtige Abweichung: „3 Klassenfamilien in einem Leben" ist unmöglich

Der Klassenbaum wurde durchgerechnet: Von `core` aus wählt man eine Familie,
danach führt jeder Pfad nur noch innerhalb dieser Familie weiter
(`isValidClassChoice` verlangt `parent === current`). **Maximal erreichbar sind
zwei `branch`-Werte pro Leben.** Umgesetzt daher als *drei Familien pro
Verbindung* (Rapid/Precision/Control/Impact, `core` zählt nicht mit) – erreichbar
und deckungsgleich mit der Katalog-Idee „jede Familie gespielt" aus dem Teamplan.

## Dateien

`apps/server/src/achievements.ts` (neu), `achievements.test.ts` (neu),
`world.ts`, `index.ts`, `.env.example`, `docs/DEPLOY.md`,
`docs/DEPLOYMENT.md`, `README.md`

## Tests

18 neu / 252 gesamt grün. Zwei Mutationsproben: `recordKill` lahmgelegt → genau
die drei Event-Tests fallen; Bot-Filter entfernt → genau der Bot-Test fällt.

## Von 01 gebraucht

Erledigt: `ACHIEVEMENT_IDS`, `AchievementInfo`, `ACHIEVEMENT_CATALOG` und
`freshAchievements` in `GameplayWorldExtension`; Drain verdrahtet über
`attachAchievementSnapshots`.

## Weitere Abweichungen

- „Mehrfachvergabe pro Leben ausgeschlossen" gelesen als **einmal pro
  Verbindung** (strenger, verhindert Farmen durch Sterben).
- Overcharge-Kill wertet die **Position des Opfers** als Kill-Ort.
- `score10k` liest den laufenden `score`, der beim Tod halbiert wird.

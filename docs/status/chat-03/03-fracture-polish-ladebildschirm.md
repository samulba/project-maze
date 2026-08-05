# 03 – Wandbruch-Effekt, arenaweite Events, Ladebildschirm

**Branch:** `claude/project-maze-fracture-polish-o2q3n4` · **Basis:** `main` @ `050b51f` · **Status: in main**

## Was drin ist

- **Bruch-Effekt für aufgebrochene Wände:** Der Umriss dehnt sich beim Öffnen
  nach außen, beim Schließen zieht er sich auf die Wand zusammen.
- **Arenaweiter Hinweis für ortlose Events** – Events ohne Zone hatten bis
  dahin keine sichtbare Entsprechung.
- **Onboarding-Schritt für Arena-Events**, einsortiert *nach* den Grundlagen:
  Wer in Minute eins noch die Steuerung lernt, braucht keine Event-Erklärung.
- **Inszenierter Ladebildschirm** statt einer Textzeile, solange PixiJS seine
  Renderer-Chunks nachlädt. Ein Fortschrittsbalken wäre gelogen – es gibt
  keinen Fortschritt zu melden.

## Der schwierige Teil

Der Client sieht nicht, *warum* eine Wand aus dem Snapshot verschwindet: Bruch
und Sichtfeld-Culling sehen identisch aus. Auslöser ist deshalb nur eine Wand,
die **vollständig innerhalb** des Cull-Rechtecks minus Sicherheitsrand
(`WALL_CULL_MARGIN = 140`) lag – und gar nichts, wenn der Spieler seit dem
letzten Snapshot mehr als 400 Einheiten gesprungen ist (Respawn).

## Nachgewiesen

Wandbruch im Browser ausgelöst und gefilmt: Öffnen, Schließen, sowie ein
Gegenversuch – normales Laufen über die Arena erzeugt **keine** falschen
Bruch-Effekte, obwohl dabei laufend Wände aus dem Sichtfeld fallen.

## Geänderte Dateien

`renderer.ts`, `gameplay-effects.ts`, `onboarding.ts`/`onboarding-view.ts(+test)`,
`boot.css`, `main.ts`, `ui.ts`

## Von 01 gebraucht

Nichts – reiner Client.

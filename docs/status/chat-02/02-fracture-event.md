# 02 – Arena-Event: Fracture

**Branch:** `claude/arena-events-overcharge-hunter-s4sipx` · **Basis:** `origin/main` @ `5803ce7` · **Status: in main**

## Was drin ist

Während der aktiven Phase brechen 2–4 zufällige generierte Wandsegmente auf:
passierbar, blocken keine Projektile und keine Sichtlinien, nicht mehr im
Snapshot. Bots profitieren über dieselben Prüfungen wie Spieler. Die festen
`l*`-Wände brechen nie auf – das Grundlayout bleibt wiedererkennbar, und der
Schutz sitzt in `setWallDisabled` selbst.

`world.ts` bekam dafür ein minimales Set deaktivierter Wand-IDs. Gefiltert wird
an genau zwei Stellen – `nearbyWalls` und `wallsInView` –, wodurch `isFree`,
`moveCircle`, `hasLineOfSight` und die Projektilprüfung automatisch nachziehen.
Statt pro Aufruf gegen das Set zu prüfen (heißer Pfad!) hält ein
zwischengespeichertes `activeWalls`-Array den Normalfall kostenfrei.

**Die Reaktivierung wartet auf freie Fläche.** Eine Wand kehrt erst zurück, wenn
kein Spieler, keine Drohne und keine Form mehr darin steht; sonst bleibt sie
offen und wird jeden Tick erneut geprüft. Bewusst *kein* Zwangsschließen mit
Verdrängung – das Repo hat die Regel „Spieler werden niemals teleportiert", und
reines Verzögern löst das eigentliche Problem (niemand wird eingemauert)
vollständig.

## Dateien

`apps/server/src/world.ts` (+`segmentCrossesWalls` kam später dazu),
`world.test.ts`, `arena-events.ts`, `arena-events.test.ts`, `arena-systems.ts`,
`arena-systems.test.ts`, `docs/BALANCE_MASTERPLAN.md`, `README.md`

## Tests

11 neu / 94 gesamt grün. Zwei Mutationsproben: mit ausgehebeltem `wallOccupied`
fallen beide Verzögerungstests – sie können also nicht aus dem falschen Grund
grün sein.

## Von 01 gebraucht

Erledigt: `'fracture'` in `ArenaEventKind`, Banner-Copy, Zonenkreis
clientseitig über ein `zoned`-Flag gelöst.

## Offener Punkt

Ein Spieler kann eine Lücke dauerhaft offenhalten, indem er sich hineinstellt –
kostet ihn Stillstand und bringt ihm nichts außer der Lücke. Falls das je stört:
Kompromiss wäre, nur Formen zwangszuversetzen und Spieler/Drohnen weiter zu
verzögern.

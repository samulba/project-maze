# 05 – Delta-Hydrator + Achievement-Popups

**Branch:** `claude/project-maze-hydrator-achievements-o2q3n4` · **Basis:** `main` @ `017d7eb` · **Status: in main**

## Was drin ist

**Hydrator** (`snapshot-hydrator.ts`) an der Socket-Grenze in `main.ts`, direkt
hinter `JSON.parse` und vor allem anderen: Ab der nächsten Zeile sieht niemand
im Client mehr einen unvollständigen Snapshot. Vier Caches – Spieler-Statics,
Shape-Statics, Wände, Bestenliste/Killfeed. Bei Reconnect werden sie geleert.
Volle Snapshots (`SNAPSHOT_DELTAS=false`) gehen unverändert durch.

**Achievement-Popups**: dezente Notiz in der linken Spalte unter dem Killfeed,
mit Warteschlange, falls mehrere gleichzeitig freigeschaltet werden. Bewusst
nicht in der Bildmitte – eine Freischaltung ist eine Notiz, keine Unterbrechung.

## Zwei Entwurfsentscheidungen

- **Platzhalter statt `undefined`** für fehlende Statics: `CLASS_DEFINITIONS[undefined]`
  lässt den Renderer abstürzen. Stattdessen ein neutraler Ersatz plus Zähler
  `missingStatics`, damit ein Protokollbruch sichtbar wird statt zu knallen.
- **Der Cache wird nie aufgeräumt.** Clientseitiges Verdrängen wäre still
  tödlich: Der Server geht davon aus, dass der Client die Statics kennt, und
  schickt sie nicht erneut.

## Nachgewiesen

Gegen einen laufenden Server, beide Schalterstellungen:

| | `SNAPSHOT_DELTAS=true` | `=false` |
|---|---|---|
| Spieler ohne Statics angekommen | 735 / 740 | 0 |
| Shapes ohne Statics angekommen | 1766 / 1778 | 0 |
| Snapshots ohne Wände | 400 / 401 | 0 |
| Platzhalter im HUD | **0** | **0** |

Bewusst **keine** Byte-Ersparnis angegeben: Die beiden Läufe hatten sehr
unterschiedliche Weltzustände (4,4 gegen 19,5 Shapes pro Snapshot), ein
Vergleich wäre eine Zahl ohne Aussage.

## Geänderte Dateien

`snapshot-hydrator.ts(+test)`, `achievements.ts(+test)`, `achievement-popups.ts`,
`achievements.css`, `main.ts`

## Von 01 gebraucht

Nichts – reiner Client.

## Korrektur einer früheren Aussage

„Reconnect verifiziert" aus einem Vorgängerpaket war **falsch**: Playwrights
`setOffline` trennt eine bestehende localhost-Verbindung nicht. Richtig geprüft
wird stattdessen, indem der Socket aus der Seite heraus geschlossen wird.

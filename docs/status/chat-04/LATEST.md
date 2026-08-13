# Stand 13.08. – Rework nach Sams Spieltest, Stufe 3 von 4

| | |
| --- | --- |
| **Auftrag** | Sam, 13.08.: „Plan das einmal gescheit durch und fix alles Step by Step schön gründlich, damit die nächste Testversion wesentlich besser wird." |
| **Branch** | `claude/validate-bericht-19-findings-85aiaz` (Sitzungs-Vorgabe; `main` wird auf Sams stehende Anweisung mitgezogen) |
| **Basis** | `d471107` |
| **Tests** | `npm run check` grün – 81 Dateien, 1115 Tests |

## Wo der Rework steht

| Stufe | Sams Punkt | Stand |
| --- | --- | --- |
| 0 – Strich-Bug | Drohnen zogen eine Linie zur Weltecke | ✅ `de63139` |
| 1 – Drohnen | „das macht ja gar keinen Sinn, dass sie einfach um dich schweben und dann nix passiert" | ✅ `b6ef43b` |
| 2 – Projektile + Rückstoß | „gehen noch immer zu weit", „es fehlt der Rückstoß" | ✅ `cb75f35` |
| **3 – Karte** | „zu wenig Maze, dickere Wände, mehr Wände", „zwei Mainspots" | ✅ `d471107` → [Bericht 27](27-stufe-3-karte.md) |
| 4 – Klassen | „alle Klassen fühlen sich gleich an" | offen – der größte Brocken |

Der Plan mit Begründung der Reihenfolge steht in
[Bericht 26](26-plan-rework.md), Sams Worte im Original in
[Bericht 25](25-sams-spieltest-feedback.md).

## Stufe 3 in Zahlen

| | vorher | jetzt |
| --- | ---: | ---: |
| Begehbare Fläche | 90,3 % | 72,3 % |
| Wanddeckung | 4,53 % | 21,8 % |
| Wände / Dicke | 89 / 54 px | 150 / 160 px |
| Blicke weiter als eine halbe Bildbreite | 46,4 % | 20,9 % |
| Erreichbare Gebiete | 1 (ungemessen) | 1 (jeden Testlauf geprüft) |
| Hauptplätze | – | 2 × 800 × 800 px, je vier Tore |

Die drei Maße sind **gemessen, nicht geraten**: Der erste Anlauf (Bahn 800) war
nachweislich schlechter als die alte Karte, und erst der Kandidatenvergleich
über 51 Varianten hat gezeigt, warum – die Bahn bestimmt das Labyrinthgefühl
fast allein, die Wanddicke kaum. Details in [Bericht 27](27-stufe-3-karte.md).

## Was Sam entscheiden muss, bevor es weitergeht

1. **Wie findet man einen Hauptplatz?** Die Minikarte ist ein Nahradar, keine
   Weltkarte. Die Plätze existieren und lohnen sich – aber von der anderen
   Kartenseite findet man sie nur durch Laufen. Drei Wege, aufsteigend im
   Aufwand: aufs Nahradar zeichnen · Richtungspfeil am Bildrand · Weltkarte auf
   Tastendruck.
2. **Ist die Sichtweite jetzt zu eng?** Median 400 px statt 760. Das ist die
   Zahl, die „mehr Maze" ausmacht – und die, die sich zu weit gedreht anfühlen
   könnte.
3. **Projektil-Anfangstempo** (offen seit Stufe 2): Diep.io lässt Kugeln
   schnell starten und abbremsen; Sam sagt „von Anfang an zu schnell", also das
   Gegenteil. Die Zahlen liegen vor, die Entscheidung nicht.
4. **Drohnen-Auto-Angriff**: sovereign macht ohne Kommando 165 DPS. Zu stark?

## Offene Altlasten aus früheren Sitzungen

* **Migration `0005_sessions.sql`** ist eingespielt und nach `applied/`
  verschoben. Nach dem nächsten Deploy in `/health` unter `sessions` prüfen,
  dass die Schicht wirklich schreibt.
* **CI-Fehlmeldungen sind weg** (`75e8730` und Vorlauf): `deploy-watch` wartete
  auf einen Deploy, den Railway bei reinen Doku-Commits gar nicht startet, und
  verbrannte je Push 17,5 Minuten Actions-Zeit. Der Lauf des Fix-Commits selbst
  war nach 10 Sekunden grün.

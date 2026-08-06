# 16 – UI-Fehlersuche: sieben Befunde, alle repariert

**Branch:** `claude/chat-03-client-ux-mazers-yu57ca` · **Basis:** `origin/main` @ `7ecbc90` · **Status: OFFEN – wartet auf Merge**

Sam hat ein Beispiel genannt („beim aussuchen der klasse"). Gefunden habe ich
sieben Fehler, alle in derselben Ecke: **Panels, die einzeln geprüft wurden und
zusammen nicht funktionieren.** Dein Verdacht war richtig.

Das schärfste Ergebnis vorweg, weil es kein Schönheitsfehler ist:

> **Mit offener Klassenwahl nahmen 35 % der Bildfläche keine Klicks mehr an –
> zusammen mit dem Upgrade-Panel 48 %.** Im normalen Spiel sind es 1,4 %.
> Wer auf Level 10 in die untere Bildhälfte zielt, hat nicht mehr gefeuert.

## Die Liste, nach Schwere

| # | Befund | Wo | Reproduktion |
|---|---|---|---|
| **F1** | Klassenwahl schluckt Klicks: 35 % der Fläche (mit Punkten 48 %) statt 1,4 % | überall | Level 10 erreichen, in die untere Bildmitte zielen, feuern |
| **F2** | Eine von vier Klassen liegt außerhalb – auch auf 1920×1080 | ab Level 10 | Level 10, vier Wahlmöglichkeiten zählen: es sind drei zu sehen |
| **F3** | Klassenwahl deckt Upgrade-Panel, Spielerkarte und Bestenliste | < 1100 px breit oder < 700 px hoch | Fenster auf 900×640, Level 10 mit Punkten |
| **F4** | Klassenwahl liegt **unter** Onboarding, Event-Banner und Bounty-Banner (z-index 8 gegen 26–32) | überall | Level 10 während eines Arena-Events |
| **F5** | Upgrade-Panel wächst mit den Familien-Slots über den Bildrand; die letzten Werte sind unerreichbar | 10 Reihen, flache Fenster | Level 24 mit 6 Punkten auf 1280×600 |
| **F6** | Upgrade-Panel schiebt sich über den Killfeed | ab 10 Reihen | dieselbe Lage |
| **F7** | Death-Karte ragt über den Bildrand und deckt die Statuspille | 1280×720 und flacher | sterben |

Alle sieben sind repariert. Zwei davon (**F2**, **F5**) sind erst durch die
Serverfeatures aufgegangen, die du heute auf Default-an gestellt hast: Die
Familien-Slots machen aus acht Upgrade-Reihen zehn.

## Wie ich sie gefunden habe

Nicht durch Hinsehen, sondern mit einem Prüfstand: Er schiebt dem Client
Spielerzustände auf der Leitung unter (Level, Klasse, Punkte, Tod, Signature),
fährt eine Matrix aus 15 Zustands- und Fensterkombinationen ab und misst im DOM
vier Dinge – Überlappung, Verdeckung (an neun Punkten je Fläche mit
`elementFromPoint`, damit sich „teilen sich Platz" von „liegt darüber"
unterscheidet), Herausragen aus dem Bild und den Anteil der Fläche, der keine
Klicks mehr annimmt.

**Der Prüfstand liegt jetzt im Repo:** `scripts/ui-layout-check.mjs`. Er ist
kein Wegwerfskript, sondern die Antwort auf „kein Bug ohne Test" für eine
Fehlerklasse, die Unit-Tests nicht erreichen – Layout entsteht erst im Browser.
Aufruf und Voraussetzungen stehen im Kopf der Datei; `playwright-core` steht
bewusst **nicht** in `package.json`, damit niemandem eine Abhängigkeit
aufgezwungen wird.

Er hat sich sofort bezahlt gemacht: **Zwei Fehler hat erst er gefunden**, und
zwar meine eigenen. Mein Höhendeckel gegen F3 schnitt die vierte Klasse ab
(F2 fiel dabei überhaupt erst auf), und mein Abstand zum Modul-Panel setzte die
Wahlkarte auf Touch genau auf Auto- und Repel-Knopf.

## Was repariert ist

Alles liegt in einer neuen Datei, `hud-layout.css`, die als letzte eingebunden
wird – statt verstreut in `style.css` und `mobile.css`. Jeder Block trägt den
Befund, zu dem er gehört.

- **F1** – Der Container gibt Klicks weiter, nur die Karten nehmen sie an.
  Rahmen, Überschrift und Lücken sind wieder Arena. **35 % → 16 %**, mit
  Upgrade-Panel **48 % → 27 %**.
- **F2** – Die Karten stehen immer in genau einer Reihe
  (`grid-auto-flow: column`), die Wahlkarte darf dafür 820 statt 620 px breit
  werden. Vorher legte `repeat(auto-fit, minmax(150px, 1fr))` drei nebeneinander
  und die vierte darunter.
- **F3** – Die Wahl steht in einer **Spur**: links Platz für das Upgrade-Panel,
  sobald es sichtbar ist, rechts immer für Minimap und Auto-Knopf. Auf großen
  Schirmen ändert sich nichts, weil die Spur dort breiter ist als die Karte.
  Zusätzlich ein Höhendeckel mit innerem Bildlauf statt Wachsen nach oben.
- **F4** – `z-index: 30` statt 8: über dem Beiwerk, unter dem Modul-Panel, das
  eine Bedienung ist. Und das Beiwerk weicht, solange eine Wahl ansteht –
  Onboarding und Banner können zehn Sekunden warten, die Spezialisierung nicht.
- **F5/F6** – Das Upgrade-Panel ist gedeckelt und scrollt innen; der Kopf mit
  der Punktzahl bleibt stehen. Der Killfeed ist gedeckelt und weicht auf flachen
  Fenstern ganz, wie er es unter 900 px Breite schon tut.
- **F7** – Die Death-Karte scrollt innen und lässt oben Platz für die
  Statuspille.

Auf engem Raum tragen die Wahlkarten nur noch Familie, Name und Level –
Beschreibung und Balken sind die Beigabe für den Fall, dass Platz da ist. So
passen alle vier ohne Bildlauf, statt dass die Hälfte unter der Kante liegt.

## Nachgewiesen

`node scripts/ui-layout-check.mjs`, 15 Kombinationen:

| | vorher | nachher |
|---|---|---|
| Fälle ohne Befund | **5 / 15** | **15 / 15** |
| tote Fläche, Klassenwahl offen (1280×720) | 35,3 % | **7,5 %** |
| tote Fläche, Wahl + Punkte (1280×720) | 47,8 % | **17,5 %** |
| tote Fläche im normalen Spiel | 1,4 % | 1,3 % |
| sichtbare Klassenkarten auf 1920×1080 | 3 / 4 | **4 / 4** |

`npm run check` grün: 52 Dateien, 707 Tests, Build in Ordnung.

## Geänderte Dateien

**Neu:** `apps/client/src/hud-layout.css`, `scripts/ui-layout-check.mjs`
**Geändert:** `apps/client/src/main.ts` (ein Import)

`packages/shared` und `apps/server` unangetastet. `package.json` ebenfalls –
der Prüfstand wird direkt aufgerufen, damit er 04 nicht in den Build hineinredet.

## Von 01 gebraucht

1. **Merge.**
2. **Screenshots an Sam:** Vorher/Nachher für 900×640 und 1920×1080 gehen in den
   Chat. Der 900er zeigt den Zustand, den er beschrieben hat.
3. **Frage an Sam, wenn du sie stellen kannst:** Auf welcher Auflösung spielt
   er? F2 (vierte Klasse außerhalb) trifft 1920×1080 und Ultrawide, F3 nur
   kleinere Fenster. Für die nächste Runde wäre das die wertvollste Angabe.
4. **Vorschlag, bewusst nicht gebaut:** Tastenkürzel für die Klassenwahl. Die
   Ziffern 1–8 sind an die Upgrades vergeben, 9 und 0 seit KL4 auch – eine
   Doppelbelegung wäre ein neuer Fehler statt eines behobenen. Sinnvoll wären
   Q/W/E/R, das ist aber eine Bedienentscheidung und keine Reparatur.
5. **Unverändert offen:** Sichtfeld-Standard, Vorhersage-Standard, `tier` bei 04.

## Abweichungen und Grenzen

1. **Keine Unit-Tests für die Reparaturen.** Es sind Layout-Regeln; ihr Verhalten
   entsteht im Browser. Der Ersatz ist der Prüfstand, der sie über 15
   Kombinationen festhält – belastbarer als ein Unit-Test es hier sein könnte,
   aber eben nicht Teil von `npm run check`.
2. **Die verbleibende tote Fläche ist nicht null.** 7,5 % bei offener Wahl sind
   die Karten selbst, weitere 10 % das Upgrade-Panel. Beides sind Knöpfe, die
   angeklickt werden sollen. Ganz weg bekäme man es nur, indem man auf der Fläche
   trotzdem feuert – das wäre eine Eingabeänderung mit eigenen Nebenwirkungen und
   gehört in ein eigenes Paket.
3. **Der Zuschauer-Fall ist im Prüfstand nicht enthalten.** Der lokale Server
   läuft ohne `SPECTATOR_ENABLED`; geprüft ist er einzeln in Paket 14.
4. **Nur Chromium, nur Software-Rendering.** Firefox und Safari sind nicht
   abgedeckt. `:has()` – die Grundlage der Spur-Logik – ist in allen aktuellen
   Browsern vorhanden, aber ungeprüft auf Sams Gerät.
5. **Der Prüfstand kennt 15 Kombinationen, nicht alle.** Was er nicht abfährt:
   Klassenwahl während eines Arena-Events, während gehaltenem Ladeschuss, mit
   offenem Achievement-Popup. Das sind die nächsten Zeilen in `FAELLE` – die
   Erweiterung ist billig, weil die Messung schon steht.

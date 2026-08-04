# Project Maze – Local Balance Lab

Das Balance Lab ist ein lokales Entwicklungswerkzeug für schnelle Klassen-, Build- und Kampftests. Es wird mit `npm run dev` aktiviert und ist auf dem normalen Produktionsstart `npm start` deaktiviert.

## Öffnen

1. Spiel lokal starten und Arena betreten.
2. `F2` drücken oder unten rechts `BALANCE LAB` anklicken.
3. Mit `Escape` oder dem X schließen.

## Build laden

- Eine der 21 Klassen auswählen.
- Level 10, 24, 38 oder 45 wählen.
- Build-Preset wählen:
  - Balanced
  - Offense
  - Defense
  - Mobility
  - Blank – Punkte anschließend selbst verteilen
- `BUILD LADEN` anklicken.

Der Server setzt Klasse, Level, XP, Upgrade-Punkte, Leben, Projektile und Drohnen autoritativ neu. Finale Klassen werden automatisch über ihren legalen Klassenpfad geladen.

## Trainingswerkzeuge

- `HEILEN`: aktuelles Leben vollständig auffüllen.
- `PROJEKTILE LÖSCHEN`: alle aktiven Kugeln aus der lokalen Arena entfernen.
- `GOD MODE`: eingehenden Schaden für den eigenen Spieler blockieren.
- `BOTS PAUSIEREN`: Bot-Entscheidungen und Angriffe neutralisieren, ohne Bots zu löschen.
- `KLASSE ALS TARGET SPAWNEN`: ausgewählte Klasse als stationären Level-45-Testtank erzeugen.
- `TARGETS LÖSCHEN`: alle erzeugten Testtanks entfernen.

Zerstörte Testziele werden nach 1,2 Sekunden am selben Ort mit derselben Klasse und demselben Balanced-Build neu aufgebaut.

## Live-Kampfmessung

Das Lab zeigt:

- Schaden pro Sekunde über ein rollendes 3-Sekunden-Fenster
- Schaden des letzten Treffers
- Anzahl aktiver Testziele

Die Werte werden aus den serverautoritativ übertragenen Lebenspunkten der Testziele berechnet.

## Klassenmechaniken im aktuellen Build

### Precision

- Treffer erzeugen je nach Klasse unterschiedlich starken Knockback.
- Hunter übernimmt einen Teil der eigenen Bewegung in die Projektilgeschwindigkeit.
- Phantom erhält bei bewegten Schüssen zusätzlichen Schaden und Durchschlag.
- Lancer besitzt besonders starken Treffer- und Schussrückstoß.

### Control

- Controller: ausgeglichene Standarddrohnen.
- Warden: schnelle, leichte defensive Drohnen.
- Overseer: sehr schneller, fragiler Acht-Drohnen-Schwarm.
- Factory: weniger, größere und robustere Drohnen.
- Carrier: schwere, langsame Drohnen für Flächendruck.

### Impact

- Bulwark reduziert frontalen Schaden um 26 Prozent.
- Fortress reduziert frontalen Schaden um 38 Prozent.
- Juggernaut reduziert sämtlichen eingehenden Schaden um 8 Prozent.

## Sicherheitsgrenze

Lokale Entwicklung:

```text
npm run dev
→ apps/server/src/dev.ts
→ ENABLE_DEV_TOOLS=true
```

Produktion:

```text
npm start
→ apps/server/dist/index.js
→ Debug-Befehle deaktiviert
```

Der Client blendet das Labor zusätzlich außerhalb von Vite Development beziehungsweise `localhost` und `127.0.0.1` aus.

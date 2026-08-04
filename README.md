# Project Maze

Project Maze ist ein eigenständiges, serverautoritäres Browser-Arena-Game mit Farming, Tank-Progression, Maze-Welt, Projektil-Kollisionen und Desktop-/Mobile-Steuerung.

## Voraussetzungen

- Node.js 22 oder neuer
- npm 10 oder neuer

## Lokal starten

```bash
npm install
npm run dev
```

Danach:

- Client: `http://localhost:5173`
- Server-Health: `http://localhost:2567/health`

Für einen lokalen Multiplayer-Test mehrere Browserfenster öffnen.

## Scripts

```bash
npm run dev
npm run typecheck
npm run test
npm run build
```

## Aktueller Alpha-Stand

- feste 16:9-Sichtweite ohne Zoom-Vorteil
- eigener Spieler bleibt exakt in der Bildschirmmitte
- 6000 × 4000 große Maze-Welt
- autoritative Bewegung, Beschleunigung, Wand- und Tank-Kollisionen
- Kugeln kollidieren mit gegnerischen Kugeln
- Farmobjekte mit XP, Leben, Body-Damage und Respawns
- Level 1–45 und acht Upgrade-Werte
- dreistufiger Klassenbaum mit Rapid-, Precision-, Control- und Impact-Pfad
- Drohnensteuerung mit linker und rechter Maustaste
- unterschiedliche Bot-Profile und Spielstile
- Death-Screen und Respawn mit 50 % des vorherigen Levels
- Desktop- und Mobile-Landscape-Steuerung
- Area-of-Interest-Filter für dynamische Entitäten

## Steuerung

### Desktop

- `WASD` oder Pfeiltasten: Bewegen
- Maus: Zielen
- Linke Maustaste: Feuern / Drohnen angreifen lassen
- Rechte Maustaste: Drohnen von der Mausposition wegdrücken
- `E`: Auto-Fire
- `1–8`: Upgrade wählen

### Mobile

- linker Stick: Bewegen
- rechter Stick: Zielen und Primäraktion
- `REPEL`: Drohnen-Sekundäraktion

## Architektur

```text
apps/client       PixiJS-Rendering, Eingaben, HUD
apps/server       autoritative Simulation und WebSocket-Server
packages/shared   Netzwerktypen, Klassen- und Progressionsregeln
```

Der Client sendet ausschließlich Eingaben. Positionen, Treffer, XP, Klassenwahl, Respawns und Projektile werden serverseitig validiert und simuliert.

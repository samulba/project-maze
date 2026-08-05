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

## Aktueller Alpha-Stand (1.0)

- feste 16:9-Sichtweite ohne Zoom-Vorteil
- eigener Spieler bleibt exakt in der Bildschirmmitte
- 6000 × 4000 große Maze-Welt
- autoritative Bewegung, Beschleunigung, Wand- und Tank-Kollisionen
- Kugeln kollidieren mit gegnerischen Kugeln
- Farmobjekte mit XP, Leben, Body-Damage und Respawns
- Level 1–45 und acht Upgrade-Werte
- dreistufiger Klassenbaum mit 29 Tanks in vier Familien
  (Rapid, Precision, Control, Impact – je drei Endpfade)
- klassenspezifische Kernmechaniken: Heckläufe, Rundum-Feuer,
  Exekutionsbonus, Defensiv-Orbit, Mikro-Schwarm, Momentum-Rammen u. a.
- Core Modules (Dash, Repulse, Barrier, Repair) und passive Frames
- Elite Shapes, Bounty-System, Kill-Streaks
- drei rotierende Arena-Events: Core Surge (mehr Formen), Overcharge
  (Geschosse streifen sich statt sich auszulöschen), Hunter Signal
  (neutraler Elite-Guardian als PvE-Ziel)
- Drohnensteuerung mit linker und rechter Maustaste
- faire Bots mit Skill-Tiers, Vorhalte-Zielen, Anfängerschutz,
  Anti-Gang-up und eigener Modul-/Frame-Nutzung
- Treffer-Feedback: Hit-Flash, Schadenszahlen, Explosionen, Screen-Shake
- Minimap mit Elite-, Bounty- und Event-Markern
- Sound mit Lautstärkeregler, Streak-Jingles und Event-Signalen
- Death-Screen mit Run-Statistik und Respawn mit 50 % des vorherigen Levels
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

# Project Maze

Ein eigenständiger, moderner Browser-Arena-Prototyp mit autoritativem Server, Desktop- und Touch-Steuerung sowie einem ersten Maze-Modus.

## Enthalten

- Gastzugang ohne Account
- Shooter, Sniper und Drone als erste Archetypen
- WASD/Pfeiltasten und Maus
- Dual-Stick-Touchsteuerung
- serverseitige Bewegung, Schüsse, Treffer, XP und Respawns
- Maze-Wände und Kollisionen
- neutrale XP-Objekte
- Leaderboard

## Lokal starten

Voraussetzung: Node.js 22+

```bash
npm install
npm run dev
```

Danach:

- Client: `http://localhost:5173`
- Server/Health: `http://localhost:2567/health`

Zum Multiplayer-Test mehrere Browserfenster öffnen.

## Architektur

- `apps/client`: PixiJS-Rendering, HUD und Eingaben
- `apps/server`: autoritative Simulation und WebSocket-Verbindung
- `packages/shared`: serialisierbare gemeinsame Typen und Konstanten

Der Client sendet ausschließlich Eingaben. Positionen, Feuerrate, Treffer, XP und Respawns werden auf dem Server bestimmt.

## Nächste Schritte

1. Client Prediction und Snapshot-Interpolation
2. prozedurale Maze-Generierung
3. echte Drone-Mechanik
4. Skillpunkte und Upgrade-Auswahl
5. Deployment des dauerhaften Game-Servers

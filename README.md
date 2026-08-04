# Project Maze

Project Maze ist ein moderner, eigenständiger Browser-Arena-Prototyp mit autoritativem Server. Der Fokus liegt auf direktem Einstieg, präzisem Movement, Maze-Kämpfen, Build-Entscheidungen und einem starken Community-Loop.

## Aktueller Alpha-Stand

- sofortiger Gastbeitritt ohne Account
- responsiver PixiJS-Client für Desktop und Mobile
- autoritative WebSocket-Simulation mit 30 Ticks pro Sekunde
- drei unterschiedliche Klassen: Shooter, Sniper und Drone Controller
- echte kontrollierbare Drone-Einheiten
- Maze mit serverseitiger Wand- und Projektilkollision
- Squares, Triangles und Pentagons mit unterschiedlichen Belohnungen
- Levelsystem und sechs serverseitig geprüfte Upgrade-Werte
- Auto-Fire, Kamera-Zoom und Dual-Stick-Touchsteuerung
- sieben klar gekennzeichnete Bots für sinnvolle Solo-Tests
- Kills, Tode, Respawn-Schutz, Killfeed und Leaderboard
- Minimap und drei frei wählbare Themes
- automatische Wiederverbindung nach einem Serverabbruch
- grundlegende Validierung, Rate-Limits und Payload-Limits

## Lokal starten

Voraussetzung: Node.js 22 oder neuer.

```bash
npm install
npm run dev
```

Danach öffnen:

- Spiel: `http://localhost:5173`
- Serverstatus: `http://localhost:2567/health`

Für einen echten Multiplayer-Test können mehrere Browserfenster geöffnet werden. Die Bots sorgen dafür, dass die Arena auch bei einem einzelnen Testspieler bereits lebt.

## Steuerung

| Aktion | Desktop | Mobile |
| --- | --- | --- |
| Bewegung | WASD oder Pfeiltasten | linker Stick |
| Zielen | Maus | rechter Stick |
| Schießen | linke Maustaste | rechter Stick |
| Auto-Fire | E | Auto-Fire-Button |
| Upgrade | Tasten 1–6 oder HUD | HUD |
| Zoom | Mausrad | vorerst automatisch |

## Optionale Umgebungsvariablen

```env
PORT=2567
BOT_COUNT=7
ALLOWED_ORIGIN=*
```

Für einen extern gehosteten Server kann im Client gesetzt werden:

```env
VITE_WS_URL=wss://dein-game-server.example
```

## Architektur

```text
apps/client        PixiJS-Rendering, HUD, Kamera, Desktop- und Touch-Input
apps/server        autoritative Simulation, Bots, Kollision und WebSocket-Transport
packages/shared    gemeinsame Netzwerktypen, Spielkonstanten und Upgrade-Definitionen
```

Der Client sendet ausschließlich Eingaben und Upgrade-Wünsche. Positionen, Feuerraten, Treffer, Schaden, XP, Level, Skillpunkte und Respawns werden vom Server entschieden.

## Qualitätsbefehle

```bash
npm run typecheck
npm run build
```

## Nächste große Schritte

1. Delta-Snapshots und bessere Interpolation für geringeren Netzwerkverbrauch
2. echtes Matchmaking und mehrere isolierte Arenen
3. Party-Links und private Lobbys
4. Sounddesign, Trefferfeedback und Screen-Shake-Einstellungen
5. öffentliche Testserver und anschließend optionale Accounts

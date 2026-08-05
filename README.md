# MAZERS (Project Maze)

MAZERS (Codename Project Maze) ist ein eigenständiges, serverautoritäres Browser-Arena-Game mit Farming, Tank-Progression, Maze-Welt, Projektil-Kollisionen und Desktop-/Mobile-Steuerung.

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
npm run balance   # Balance-Report für Klassen, Module und Frames
npm run loadtest  # N simulierte Clients gegen eine laufende Arena
npm run check     # Typecheck + Tests + Build
npm start         # Produktion: ein Prozess liefert Client + Server (siehe docs/DEPLOY.md)
```

## Live gehen

Zwei Wege, beide dokumentiert:

- **Single-Service (aktuell auf Railway live):** ein Node-Prozess liefert Client
  und Server über eine Origin aus – siehe [docs/DEPLOY.md](docs/DEPLOY.md)
  (Railway, Hetzner-Skripte, ENV-Referenz, Supabase-Phase 2).
- **Container:** `cp .env.example .env && docker compose up -d --build` – nginx
  liefert den Client auf `http://localhost:8080` und reicht `/ws` an den
  Spielserver weiter; Details in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Telemetrie

Der Server erhebt anonyme Balance-Kennzahlen – Pickraten, Lebensdauer sowie
Kills/Deaths je Klasse, Core Module und Frame – und exportiert sie über
`/metrics` (Prometheus-Text, alternativ `?format=json`). Es werden keine Namen,
IDs oder Adressen gespeichert. Abschaltbar über `TELEMETRY_ENABLED=false`,
absicherbar über `METRICS_TOKEN`. Details in
[`docs/TELEMETRY.md`](docs/TELEMETRY.md).

## Globales Leaderboard (optional)

Sind `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` gesetzt, speichert der
Server jeden abgeschlossenen Run echter Spieler (Name, Score, Level, Klasse,
Kills, beste Streak, Dauer) gepuffert und asynchron in Supabase und liefert die
Top 50 über `GET /leaderboard` (30 s gecacht). Ohne die beiden Variablen
verhält sich der Server exakt wie ohne Persistenz; ein Datenbankausfall stoppt
das Spiel nie. Einrichtung für Supabase-Neulinge:
[`docs/SUPABASE.md`](docs/SUPABASE.md).

Kommt der Google-Login dazu (`AUTH_ENABLED=true`), werden Runs und
freigeschaltete Achievements zusätzlich dem Konto zugeordnet, und
`GET /profile/:userId` liefert Bestleistungen samt Achievement-Liste (ebenfalls
30 s gecacht). Beim Join lädt der Server bereits gespeicherte Achievements vor,
damit ein wiederkehrendes Konto nichts doppelt freischaltet.

## Kapazität und Stabilität

- **Tick-Gesundheit:** `/metrics` liefert p50/p95/max der Simulationsdauer über
  ein 60-Sekunden-Fenster. `maze_tick_budget_ratio` unter 1.0 heißt, der Tick
  bleibt im 25-ms-Zeitplan – das ist die Kennzahl für „wie viele Spieler trägt
  eine Instanz".
- **Lasttest:** `npm run loadtest -- --clients 40 --duration 60` simuliert echte
  Clients und berichtet Join-Erfolg, Snapshot-Latenz und Abbrüche.
- **Snapshot-Bandbreite:** Bei voller Arena ist der Versand der Flaschenhals,
  nicht die Simulation. Alle Zahlen werden auf darstellbare Genauigkeit gerundet
  (Positionen 1, Winkel 3 Nachkommastellen); mit `SNAPSHOT_DELTAS=true` fallen
  zusätzlich alle Felder weg, die sich seit dem letzten Snapshot dieses Clients
  nicht geändert haben, und mit `SHORT_NET_IDS=true` werden die Entitäts-UUIDs
  durch fortlaufende Zahlen ersetzt. Gemessen mit 40 Clients: **231,9 KB/s
  (nur Runden) → 151,3 (Deltas) → 127,4 (beides) je Client, −45 %** bei
  unveränderter Latenz.
- **Redeploy:** Bei `SIGTERM` meldet `/health` sofort `503`, dann werden alle
  WebSockets mit Code 1001 sauber geschlossen – Clients reconnecten umgehend
  statt in einen Timeout zu laufen.
- **Arena-Direktor:** Die Bot-Population richtet sich nach der Zahl der
  Menschen (1 → 11 Bots, je weiterem −2, Minimum 4) und ändert sich höchstens
  alle 5 Sekunden um einen Bot. Bots verschwinden nur tot oder weit außer
  Sichtweite, nie mitten im Kampf; neue starten leicht unter dem Median-Level
  der Menschen. Abschaltbar über `ARENA_DIRECTOR_ENABLED=false`.
- **Achievements:** `ACHIEVEMENTS_ENABLED=true` hängt eine rein beobachtende
  Engine an (sieben Achievements, Katalog in `apps/server/src/achievements.ts`).
  Der Fortschritt liegt im Arbeitsspeicher und gilt je Verbindung; Persistenz
  und Client-Anzeige sind eigene Pakete.

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
- vier rotierende Arena-Events: Core Surge (mehr Formen), Overcharge
  (Geschosse streifen sich statt sich auszulöschen), Hunter Signal
  (neutraler Elite-Guardian als PvE-Ziel), Fracture (einzelne Wandsegmente
  brechen temporär auf und öffnen neue Wege und Sichtlinien)
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

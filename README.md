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
npm run balance:live  # Live-Balance einer laufenden Instanz aus /metrics
npm run loadtest  # N simulierte Clients gegen eine laufende Arena
npm run check     # Typecheck + Tests + Build
npm run royale-probe  # Battle Royale end-to-end im echten Browser (siehe Modi)
npm run mode-probe    # liefert der Server wirklich den konfigurierten Modus?
npm run touch-probe:all  # Handy-Bedienung auf fuenf Querformaten, echter Touch
npm start         # Produktion: ein Prozess liefert Client + Server (siehe docs/DEPLOY.md)
```

## Modi

Der Modus ist eine Eigenschaft der **Arena**, nicht des Spielers: ein Prozess,
eine Arena, umgeschaltet über `ARENA_MODE` – derselbe Weg wie `BOT_COUNT`. Wer
zwei Modi gleichzeitig anbieten will, startet zwei Dienste.

| `ARENA_MODE` | Modus | Was ihn ausmacht |
|---|---|---|
| `maze` (Standard) | Maze | Wände in Bahnen: Deckung, Ecken, Sichtlinien |
| `ffa` | Free for All | Offene Arena ohne Wände – Reichweite und Tempo statt Deckung |
| `royale` | Battle Royale | Die Zone schrumpft in Stufen; wer stirbt, ist bis zur nächsten Runde raus. Lebt nur noch einer, ist die Runde entschieden, und nach kurzer Pause fängt alles von vorne an |

`npm run mode-probe` hängt sich als echter Client an einen laufenden Server und
prüft, ob der konfigurierte Modus auch auf der Leitung ankommt: Wände im Maze,
**keine** Wand in FFA, die Zone in jedem Snapshot im Royale – und dass die
`welcome`-Nachricht denselben Modus nennt wie `/health`, damit das Etikett im
Client nicht lügt.

Im Client steht der Modus im Etikett der Statuspille (`MAZERS · BATTLE ROYALE`);
im Royale nennt eine Leiste in der oberen Mitte, wie viele noch leben und was
die Zone als Nächstes tut.

Battle Royale im Zeitraffer ansehen – `ROYALE_SPEED` teilt Schonfrist,
Schrumpf- und Haltezeit, `20` bringt die erste Verengung nach zwei Sekunden:

```bash
npm run build
ARENA_MODE=royale ROYALE_SPEED=20 PORT=2599 node apps/server/dist/index.js
```

Dieselbe Zeile ist die Voraussetzung für `npm run royale-probe` (mit
`BOT_COUNT=1`, und ausdrücklich **mit** eingeschaltetem Direktor – so wie in
Produktion; die frühere Ausnahme `ARENA_DIRECTOR_ENABLED=false` hat einen
Befund gedeckt, den die Probe dadurch nie sehen konnte): Die Probe spielt eine ganze Runde
im echten Browser durch – Zone sehen, draußen bluten, ausscheiden, Sieger, neue
Runde – und prüft, was auf dem Schirm steht, nicht was der Server denkt.

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

`npm run balance:live -- --url <instanz>` macht daraus ohne Umweg über
Prometheus die Tabellen für eine Balance-Runde: Pickrate, K/D, mittlere
Lebensdauer und Kills/Minute je Klasse, Familie, Core Module und Frame, dazu
eine Watchlist aller Ausreißer gegen den Familien-Median. `--json` schreibt
einen Abzug weg, `--baseline <datei>` wertet später das reine Zeitfenster seit
diesem Abzug aus – so wird sichtbar, was eine Änderung wirklich bewegt hat.

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
  Clients und berichtet Join-Erfolg, Snapshot-Latenz und Abbrüche. Als **Matrix**
  gefahren – ein Durchgang je Schalterstellung, drei Runden im Wechsel – beziffert
  er, was ein Feature kostet; Rezept und Referenzwerte in
  [`docs/TELEMETRY.md`](docs/TELEMETRY.md#lastprobe-matrix-reproduzierbar-fahren).
  Stand 2026-08-06 mit **allen** Schaltern an (Deltas, kurze IDs, Achievements,
  Spectator, Signature „Momentum"): Tick p95 2,83 ms bei 25 ms Budget
  (budgetRatio 0,113), 129,1 KB/s je Client, 40 von 40 Joins, keine einzige
  gedrosselte Nachricht.
- **Snapshot-Bandbreite:** Bei voller Arena ist der Versand der Flaschenhals,
  nicht die Simulation. Alle Zahlen werden auf darstellbare Genauigkeit gerundet
  (Positionen 1, Winkel 3 Nachkommastellen); mit `SNAPSHOT_DELTAS=true` fallen
  zusätzlich alle Felder weg, die sich seit dem letzten Snapshot dieses Clients
  nicht geändert haben, und mit `SHORT_NET_IDS=true` werden die Entitäts-UUIDs
  durch fortlaufende Zahlen ersetzt. Gemessen mit 40 Clients: **231,9 KB/s
  (nur Runden) → 151,3 (Deltas) → 127,4 (beides) je Client, −45 %** bei
  unveränderter Latenz. Nachgemessen am 2026-08-06 auf anderer Maschine:
  230,8 → 123,6 KB/s (**−46 %**) bei unveränderter Snapshot-Rate von 30,5/s je
  Client – die Ersparnis hält.
- **Rate-Limits:** Verbindungen und Beitritte je IP, Nachrichten-Budgets je
  Verbindung (Input 50/s, alles andere deutlich weniger) und Limits auf
  `/leaderboard` und `/profile`. Bei Überschreitung wird erst gedrosselt, dann
  getrennt; die Zähler stehen im `abuse`-Block von `/health`. Abschaltbar über
  `RATE_LIMITS_ENABLED=false`.
- **Redeploy:** Bei `SIGTERM` meldet `/health` sofort `503`, dann werden alle
  WebSockets mit Code 1001 sauber geschlossen – Clients reconnecten umgehend
  statt in einen Timeout zu laufen.
- **Arena-Direktor:** Die Bot-Population richtet sich nach der Zahl der
  Menschen (1 → 8 Bots, je weiterem −1, Minimum 3) und ändert sich höchstens
  alle 5 Sekunden um einen Bot. Bots verschwinden nur tot oder weit außer
  Sichtweite, nie mitten im Kampf; neue starten leicht unter dem Median-Level
  der Menschen. Abschaltbar über `ARENA_DIRECTOR_ENABLED=false`.
- **Signature „Momentum" (RAPID, Klassen 3.0):** Mit
  `SIGNATURE_RAPID_ENABLED=true` baut die Rapid-Familie beim Feuern in Bewegung
  Momentum auf (+30/s), verliert es im Stand (−50/s) und feuert bei
  Vollausschlag 25 % schneller nach. Der Füllstand steht als `signature` (0–100)
  im Snapshot; `npm run balance` zeigt die effektive Feuerrate bei 0/50/100.
  Ohne den Schalter verhält sich der Server exakt wie vorher. Wer aus der
  Deckung feuert, spielt auf den alten Werten – Spam aus dem Stand ist der
  schlechtere Weg.
- **Signature „Wucht" (IMPACT, Klassen 3.0):** Mit
  `SIGNATURE_IMPACT_ENABLED=true` lädt die Impact-Familie allein durch Fahren
  einen Anlauf-Skalar auf (+30/s, −50/s im Stand) und rammt bei Vollausschlag
  bis zu 2,5-mal härter. Der Anlauf wird beim Aufprall verbraucht (600/s, eine
  volle Ladung hält 0,17 s Dauerkontakt) – Wucht ist ein Rammstoß, kein
  Dauerbuff. Zwei Grenzen verhindern den Ramm-Tod aus dem Nichts: Ein
  Kontakttick nimmt nie mehr als 8 % des Maximallebens, und gegen
  anfängergeschützte Spieler wirkt der Aufschlag gar nicht. Gemessen über alle
  Klassen: Ein voller Anlauf verkürzt die Zeit bis zum Tod eines frischen,
  gleichlevelig Gegners um höchstens 23 %. Ohne den Schalter verhält sich der
  Server exakt wie vorher.
- **Aggro-Pacing der Bots:** Kämpfe enden auch mal. Nach einem Abschuss lässt
  ein Bot 6 s von Menschen ab, eine erfolglose Jagd bricht er nach 8 s ohne
  eigenen Treffer ab (das Ziel bleibt ihm danach 6 s tabu), und höchstens zwei
  Bots greifen denselben Menschen gleichzeitig an – auch Vergeltung öffnet
  keinen dritten Platz. Dazu farmen mehr Bots, statt zu jagen: Farmer stellen
  40 % statt 20 % der Population und gehen sichtbare Gegner selten an.
  Gemessen mit 3 Menschen und 8 Bots über 240 s: **Zeit unter Beschuss
  −35 bis −69 %**, Ruhe nach dem Wiedereinstieg **0,4 s → 7,8 s**. Abschaltbar
  über `BOT_PACING_ENABLED=false`.
- **Zuschauen nach dem Tod:** Mit `SPECTATOR_ENABLED=true` bekommt ein
  gefallener Spieler bis zum Respawn die Snapshots aus der Perspektive seines
  Killers – live statt Aufzeichnung. Ist der Killer tot oder weg, bleibt es bei
  der eigenen Todesposition. Braucht einen Client, der die Kamera auf
  `spectatorTargetId` zentriert.
- **Client-Prediction:** Jeder Snapshot trägt `lastProcessedInput` – die
  Sequenznummer, die beim letzten Tick in die Positionen desselben Snapshots
  eingeflossen ist. Damit kann der Client die eigene Bewegung vorhersagen und
  danach abgleichen. Die serverseitige Bewegungsintegration ist in
  [`docs/CLIENT_PREDICTION.md`](docs/CLIENT_PREDICTION.md) Schritt für Schritt
  festgehalten; jede Abweichung im Nachbau wird als Ruckeln sichtbar.
- **Achievements:** eine rein beobachtende Engine (sieben Achievements, Katalog
  in `apps/server/src/achievements.ts`). Der Fortschritt liegt im
  Arbeitsspeicher und gilt je Verbindung; der Client zeigt Freischaltungen als
  Popup, die Profilkarte listet sie, und mit Supabase-Persistenz plus Konto
  werden sie dauerhaft gespeichert. Seit dem 12.08. **Opt-out**
  (`ACHIEVEMENTS_ENABLED=false` stellt den alten Zustand her) -- vorher war es
  Opt-in, und gesetzt hat es nie jemand.

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
- Familien-Signatures (Klassen 3.0): Rapid feuert schneller, solange es in
  Bewegung feuert (`SIGNATURE_RAPID_ENABLED`); Impact rammt härter mit Anlauf
  (`SIGNATURE_IMPACT_ENABLED`)
- Core Modules (Dash, Repulse, Barrier, Repair) und passive Frames
- Elite Shapes, Bounty-System, Kill-Streaks
- vier rotierende Arena-Events: Core Surge (mehr Formen), Overcharge
  (Geschosse streifen sich statt sich auszulöschen), Hunter Signal
  (neutraler Elite-Guardian als PvE-Ziel), Fracture (einzelne Wandsegmente
  brechen temporär auf und öffnen neue Wege und Sichtlinien)
- Drohnensteuerung mit linker und rechter Maustaste
- faire Bots mit Skill-Tiers, Vorhalte-Zielen, Anfängerschutz,
  Anti-Gang-up, Aggro-Pacing und eigener Modul-/Frame-Nutzung
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

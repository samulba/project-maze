# Messungen – die Gegenproben zu Bericht 21

Die Skripte hier sind die Laufzeitmessungen aus der Nachprüfung von
Bericht 19 (Ergebnisse: `docs/status/chat-04/21-bericht-19-nachgemessen.md`,
Abschnitte 5 und 7). Sie liegen im Repo, weil sie beim Umsetzen der
zugehörigen Entscheidungen die **Gegenproben** sind: Wer einen der Befunde
fixt, fährt dieselbe Messung noch einmal und vergleicht mit den Zahlen im
Bericht.

Keine Probe im Sinne von `npm run proben` – Messungen haben kein
grün/rot, sie liefern Zahlen. Sie laufen headless gegen die **gebauten**
Module (`npm run build` zuerst) mit fester Uhr (`game.step(0.025, now)`,
`now += 25`), sind also lastunempfindlich und wiederholbar.

## Gemeinsamer Unterbau

`stack.mjs` baut die Tuning-Kette exakt in der Reihenfolge von
`apps/server/src/index.ts` mit den Produktions-Env-Defaults nach
(weggelassen nur Snapshot-/Netz-/IO-Schichten; Begründung im Kopf der
Datei). Optionen: `botCount`, `mode`, `director`, `v2`
(PROJECTILE_SPEED_V2) und `rapidBots` (für die A/B-Messung zu Befund 79).
`messung-76`/`77` bauen ihre Kette aus historischen Gründen selbst auf –
inhaltlich identisch, Abweichungen im Kopfkommentar dokumentiert.

## Aufrufe

```
npm run build                                  # einmal vorher
node scripts/messungen/messung-<nr>-*.mjs      # Zahlen auf stdout
```

| Skript | Befund | Dauer | misst |
|---|---|---|---|
| `messung-63-repulse.mjs` | 63 | Sekunden | Verschiebung eines Ziels auf 100 px in beiden REPULSE_TRAVEL-Stellungen, stehend/anlaufend |
| `messung-64-prediction.ts` | 64 | ~30 s + Server | Quittungs-Latenz (Stellung AUS) und Korrekturgrößen der echten PredictionEngine (Stellung AN) über die echte Leitung – siehe unten |
| `messung-71a-stile.mjs` | 71 | ~1 min | Ziel-Haltedauern je Stil (1 Bot, FFA, 400 px) |
| `messung-71b-arena.mjs` | 71 | ~5 min | Angreiferzeit in der vollen Arena (18 Bots, wandernder Mensch) |
| `messung-72.mjs` | 72 | ~7 min | Bot-Upgrade-Pfad, Mindestlevel für maxHealth, Arena-Gegenprobe |
| `messung-72b-ohne-familienslots.mjs` | 72 | Sekunden | Gegenprobe: maxHealth-Slot ohne die Familien-Slots |
| `messung-73-tier-level.mjs` | 73 | ~5 min | Tier-/Profil-Konstanz über Level und Tode |
| `messung-74-treffer.mjs` | 74 | ~20 min | Trefferquoten rookie/veteran/elite × 200/420/880 px × V2 an/aus |
| `messung-74b-teleport.mjs` | 74 | ~10 min | Methoden-Gegenprobe: teleportiertes statt gefahrenes Ziel |
| `messung-75.mjs` | 75 | Sekunden | Bot-Bestand: Archetypen, Familienabdeckung, Determinismus |
| `messung-76-signaturen.mjs` | 76 | ~6 min | Signature-Verteilung der Bots je Familie, Feueranteil |
| `messung-77-ecke.mjs` | 77 | ~15 min | Zielaufnahme/-verlust an der Maze-Ecke, Wiederfinden (10 Seeds) |
| `messung-78-reichweite.mjs` | 78 | Sekunden | Kugelreichweite gegen Wunschabstand und Feuerdeckel |
| `messung-79.mjs` | 79 | ~25 min | Reparaturfähigkeit der Rapid-Farmer, A/B mit/ohne tuneRapidBots |

`messung-64-prediction.ts` braucht einen laufenden Server und wird gebündelt,
weil es die echten Client-Module (PredictionEngine, SnapshotHydrator) lädt:

```
npx esbuild scripts/messungen/messung-64-prediction.ts --bundle --platform=node \
  --format=esm --external:ws --outfile=/tmp/messung-64.mjs
PORT=2790 BOT_COUNT=0 RATE_LIMIT_CONNECTIONS_PER_IP=100 \
  RATE_LIMIT_JOINS_PER_MINUTE=200 node apps/server/dist/index.js &
URL=http://127.0.0.1:2790 node /tmp/messung-64.mjs
```

## Vorsicht beim Interpretieren

* Einzelläufe streuen – besonders 79 (drei Läufe je Bedingung sind schon
  eingebaut, nur die Mittel bewerten) und 71b/77 (Random-Walk-Anteile).
* 74 hat eine dokumentierte Artefakt-Falle: Ein teleportiertes Ziel hat
  `velocity = 0`, der Bot-Vorhalt läuft ins Leere, und die Tiers rücken
  scheinbar zusammen (`messung-74b`). Ziele müssen **fahren**.
* Die Messungen sind der Stand vom 12.08. – wer Bot-Verhalten ändert,
  vergleicht gegen die Zahlen in Bericht 21, nicht gegen sein Gefühl.

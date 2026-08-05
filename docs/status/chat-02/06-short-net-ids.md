# 06 – Kurze Netz-IDs

**Branch:** `claude/short-net-ids` · **Basis:** `origin/main` @ `08e4d91` · **Status: in main**

## Messreihen

**Deterministisch auf identischem Weltzustand** (Roh-Snapshots eingefroren, dann
durch vier Encoder-Instanzen geschickt; 12 Spieler, 14 Projektile, 24 Drohnen,
23 Formen):

| Variante | Bytes | Δ Basis |
|---|---|---|
| Basis (nur Runden) | 23 357 | – |
| + Deltas | 19 349 | −17,2 % |
| + kurze IDs | 19 065 | −18,4 % |
| + beides | 15 347 | −34,3 % |

Kurze IDs zusätzlich zu Deltas: **−20,7 %**.

**Ende-zu-Ende, 40 Clients:** 231,9 → 151,3 (Deltas) → **127,4 KB/s** (beides),
gesamt **−45,1 %**, Latenz in allen Läufen identisch (p95 35 ms).

## Nebenbefund

**Die Basis-Formen haben gar keine UUIDs.** `createShape('shape-0'…'shape-249')`
vergibt kurze Strings; nur Spieler, Projektile, Drohnen und Event-Formen nutzen
`crypto.randomUUID()`. Der Hebel sitzt also bei Projektilen und Drohnen – die
tragen je zwei UUIDs. Falls dort auch gespart werden soll, wäre der Ort
`world.ts`, nicht die Encoding-Schicht.

## Zwei Entscheidungen abweichend vom Auftrag

1. **Zuordnung pro Arena statt pro Verbindung.** Auch ein einzelner Client sieht
   über eine Stunde zehntausende Projektile – die Zahlen wären nur rund eine
   Stelle kürzer, bei 40× dem Speicher. Nebeneffekt: dieselbe Entität hat für
   alle Clients dieselbe Nummer, was Debugging und einen späteren
   Spectator-Modus vereinfacht.
2. **Keine Wiederverwendung freigewordener Nummern.** Der Client führt
   Interpolation *und* den Delta-Statik-Puffer über genau diese ID; eine
   recycelte Nummer ließe ein Projektil im Sprite eines anderen weiterleben.
   Stattdessen räumt ein Sweep alle 5 s auf.

## Dateien

`apps/server/src/snapshot-encoding.ts`, `snapshot-encoding.test.ts`, `index.ts`,
`.env.example`, `docs/DEPLOY.md`, `docs/DEPLOYMENT.md`, `README.md`

## Tests

10 neu / 367 gesamt grün. Vier Mutationsproben (`ownerId` nicht umgeschrieben,
`gameplay`-Schlüssel nicht umgeschrieben, Recycling eingebaut, Sweep
abgeschaltet) fallen jeweils im zuständigen Test.

## Von 01 gebraucht

Erledigt: `NetId`-Wire-Typen in shared, Client-Hydrator erweitert,
`SHORT_NET_IDS` verdrahtet.

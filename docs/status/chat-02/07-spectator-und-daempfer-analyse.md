# 07 – Spectator nach dem Tod + Analyse des Projektiltempo-Dämpfers

**Branch:** `claude/spectator-after-death` · **Basis:** `origin/main` @ `0d822fe` · **Status: in main**

## Teil 1 – Spectator

Der Trick steckt in einer Zeile: **Der Snapshot für einen Toten wird mit der ID
des Killers gebaut.** Damit greifen Sichtfenster, Culling und Wandauswahl
unverändert und automatisch richtig – es gibt keinen zweiten Culling-Pfad, der
abweichen könnte, und der Zuschauer kann prinzipbedingt nichts sehen, was der
Killer nicht sieht. Ein Test vergleicht beide Snapshots feldweise; der einzige
Unterschied ist der eigene Leichnam.

**`selfId` bleibt die eigene ID.** HUD, Death-Screen, Respawn-Knopf und
Achievements hängen daran und arbeiten unverändert. Nur die Kamera folgt einem
anderen Tank – dafür ist `spectatorTargetId` da.

Die Schicht liegt direkt um `hardenSimulation`, also ganz innen. Dadurch sehen
alle äußeren Schichten schon den korrigierten Snapshot, und die
`gameplay`-Daten des Toten sind automatisch dabei.

Fallback auf die eigene Todesposition, sobald der Killer tot ist, die Arena
verlassen hat oder es gar keinen gab. Kommt der Killer zurück, geht es weiter.

**Nebenbei:** ein liegengebliebener Merge-Konflikt-Marker in `README.md`
(`>>>>>>> origin/claude/maze-rate-limits-abuse-dfb335`) entfernt.

## Teil 2 – Der 0.8-Dämpfer

**Der Balance-Report kann dazu nichts sagen.** Er liest `CLASS_DEFINITIONS` aus
shared statt `tunedStatsFor`, und seine einzige tempo-abhängige Kennzahl
`projectileRange = speed × life` ist durch ×0.8 / ÷0.8 exakt invariant. Vor und
nach der Änderung stehen dieselben Zahlen im Report. Separat gerechnet.

| Familie | Vorhalt bei 700 U | Kugeln gleichzeitig | in unausweichbarer Zone |
|---|---|---|---|
| precision | +40 U | +0,9 | 0/7 |
| rapid | +62 U | **+4,6** | 0/7 |
| impact | +81 U | +0,5 | 0/7 |
| control | – | – | Drohnen unberührt |

Drei Befunde, zwei davon gegen die Ausgangsannahme:

1. **Precision leidet nicht am Vorhalt, sondern am Preis pro Fehlschuss.**
   Absolut ist ihr Vorhaltezuwachs der *kleinste* (+40 U). Aber sie feuert
   Einzelschüsse mit 0,5–1,3 s Nachladezeit; Rapid lädt in 0,19–0,34 s nach und
   schickt 12–45 Kugeln los. Derselbe Fehler kostet Precision 2–7× mehr.
2. **Rapid hat einen versteckten Buff bekommen.** 25 % längere Lebenszeit heißt
   25 % mehr Kugeln gleichzeitig in der Luft: Octo 36 → 45, Gatling 27,9 → 34,8,
   Storm 20,8 → 26. Genau das ist die Kugelwand-Mechanik. Mit Storms
   ×1,18-Integritätsbonus ist die Wand rund 48 % wirksamer als vorher.
3. **Control ist komplett unberührt** – Drohnen nutzen `projectileSpeed` nicht.

Zur Begründung im Code („Kugeln waren praktisch nicht dodgebar"): Auf
Kampfdistanz stimmt das nicht. Flugzeiten lagen schon vorher bei 550–850 ms,
Ausweichstrecken bei 165–256 Einheiten (Trefferfenster 44). Unausweichbar war es
nur innerhalb von 240–656 Einheiten – und dort kämpft **keine einzige Klasse**.

**Vorgeschlagene Korrekturen** (nichts davon umgesetzt – Balance ist eine
Entscheidung, keine Ableitung): Storm-Integrität 1.18 → 0.95; Dämpfer für
Precision auf 0.9; Impact unangetastet lassen; Control erst mit Telemetrie.
*01 hat daraus `projectileSpeedScaleFor` (0.9 precision / 0.75 sonst) und
`ACCELERATION_SCALE = 1.12` gemacht.*

## Dateien

`apps/server/src/spectator.ts` (neu), `spectator.test.ts` (neu), `game.ts` (nur
`playerSnapshot` exportiert), `index.ts`, `.env.example`, `docs/DEPLOY.md`,
`docs/DEPLOYMENT.md`, `README.md`

## Tests

13 neu / 412 gesamt grün. Vier Mutationsproben (selfId nicht zurückgesetzt,
Killer-Tod ignoriert, eigener Eintrag fehlt, aus Sicht des Toten gebaut) fallen
jeweils im zuständigen Test.

## Von 01 gebraucht

Erledigt: `spectatorTargetId` in `GameplayWorldExtension`, Kamera clientseitig.

**Noch offen:** Bei `SHORT_NET_IDS=true` wird `spectatorTargetId` in
`applyShortIds` **noch nicht** auf eine kurze ID umgeschrieben – dort bliebe
eine UUID stehen, während alle anderen IDs Zahlen sind. Einzeiler, zieht 02
nach, sobald der Typ als `NetId` steht.

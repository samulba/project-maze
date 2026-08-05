# Project Maze – Masterplan v2 („Alpha 1.0“)

Vollständige Analyse des Ist-Zustands (Alpha 0.9) und verbindlicher Umsetzungsplan
für den nächsten großen Qualitätssprung: mehr Klassen, besseres Spielgefühl,
bessere Grafik und fairere, klügere Bots.

---

## Teil 1 – Analyse des Ist-Zustands

### Architektur

- Monorepo: `packages/shared` (Regeln/Typen), `apps/server` (autoritative
  Simulation, 40 Ticks), `apps/client` (PixiJS, HUD, Input).
- Die Simulation besteht aus der Basisklasse `MazeGame` plus einer Kette von
  Tuning-Schichten (`hardenSimulation` → `tuneCombatScaling` → `tuneDrones` →
  `tuneClassMechanics` → `tuneDifficulty` → `tuneProgression` →
  `tuneLoadoutSystem` → `tuneArenaSystems` → `tuneDebugRules`).
  Das Muster ist ungewöhnlich, aber konsistent und gut getestet – v2 baut
  darauf auf, statt es umzubauen.

### Stärken

- Serverautorität ist sauber durchgezogen (Client sendet nur Eingaben).
- 21 Klassen in vier lesbaren Familien, Module + Frames als Sidegrades.
- Elite Shapes, Core Surge und Bounty geben der Arena wechselnde Ziele.
- Gute Testabdeckung der Regeln (51 Tests), Balance-Report-Tooling.

### Schwächen (v2-Handlungsfelder)

1. **Klassenbaum zu schmal an den Rändern:** Jede T3-Klasse hat genau ein
   Finale; drei der vier Zweige enden in nur zwei Finalpfaden. Es fehlen
   Layout-Mechaniken (Heckläufe, Rundum-Feuer, Defensive Schwärme, reine
   Geschwindigkeit).
2. **Bots sind unfair auf beide Arten:** Sie zielen ohne Vorhalten (zu schwach
   gegen bewegte Ziele), kennen keine Wände (bleiben hängen), nutzen weder
   Module noch Frames (systemisch benachteiligt) – und greifen gleichzeitig
   frische Level-1-Spieler genauso an wie Level-40-Gegner (gefühlt unfair).
3. **Grafik funktional, aber trocken:** kein Treffer-Feedback am Ziel, keine
   Todes-Explosionen, keine Projektil-Trails, statische Minimap ohne
   Elite-/Bounty-/Event-Marker, kein Kamera-Feedback.
4. **Game Feel dünn:** Schaden ist nur an der HP-Leiste ablesbar, Kills fühlen
   sich nicht besonders an, keine Streaks, Audio ist minimal (drei
   Sinus-Töne), keine Lautstärkekontrolle.
5. **Balance-Sicherung reaktiv:** Der Report zeigt Werte an, aber nichts
   erzwingt, dass Klassen einer Stufe in einem gesunden Korridor bleiben.

---

## Teil 2 – Verbindlicher Plan

Leitplanken aus dem bestehenden Masterplan bleiben in Kraft: ein
Ability-Button, keine Hotbar, alles serverautoritativ, Sidegrades statt
Powercreep, Desktop = Mobile.

### A. Klassenbaum-Erweiterung: 21 → 29 Tanks

Jeder T2-Zweig erhält einen dritten T3-Pfad mit eigenem Finale – jeweils mit
einer *neuen Mechanik*, nicht nur neuen Zahlen:

```text
Core
├── Rapid
│   ├── Twin → Storm
│   ├── Repeater → Gatling
│   └── Flanker → Octo          (NEU: Heckläufe / Rundum-Feuer)
├── Sniper
│   ├── Railgun → Lancer
│   ├── Hunter → Phantom
│   └── Arbalest → Deadeye      (NEU: Doppel-Präzision / Exekutions-Bonus)
├── Controller
│   ├── Warden → Overseer
│   ├── Factory → Carrier
│   └── Guardian → Hive         (NEU: Defensiv-Orbit / Mikro-Schwarm)
└── Impact
    ├── Crusher → Juggernaut
    ├── Bulwark → Fortress
    └── Blitz → Comet           (NEU: Momentum-Körperschaden)
```

Neue Mechaniken:

- **Flanker/Octo:** `barrelAngles` – feste Laufwinkel relativ zur Zielrichtung
  (Flanker: vorn + hinten, Octo: vier Diagonalen). Deckung nach hinten kostet
  Frontdruck.
- **Arbalest/Deadeye:** zwei parallele Präzisionsläufe; Deadeye erhält einen
  Exekutions-Bonus (+25 % Schaden auf Ziele unter 30 % Leben) – belohnt
  Timing, kein Dauer-Buff.
- **Guardian/Hive:** Guardian-Drohnen sind langsam, zäh und mit engem Orbit
  (lebender Schild); Hive führt zehn Mikro-Drohnen mit sehr schnellem
  Respawn, einzeln fast harmlos.
- **Blitz/Comet:** Körperschaden skaliert mit aktueller Geschwindigkeit
  (0,6× im Stand bis 1,35× bei Vollgas) – Rammen erfordert Anlauf, Camping
  wird schwächer.

### B. Bots v2 – klüger *und* fairer

Neues Modul `bot-brain.ts` ersetzt `updateBot` vollständig:

1. **Menschliches Zielen:** Vorhalten auf Basis von Zielgeschwindigkeit und
   Projektilgeschwindigkeit, aber mit Reaktionslatenz und Streuung je
   Skill-Tier – Bots treffen bewegte Ziele, aber nicht perfekt.
2. **Skill-Tiers:** `rookie` / `veteran` / `elite` mit abgestuften
   Reaktionszeiten, Zielabweichung, Dodge-Wahrscheinlichkeit. Die Arena
   erhält eine feste Mischung statt identischer Gegner.
3. **Wand-Intelligenz:** Kollisions-Erkennung + Ausweichrichtung, kein
   Festhängen mehr an Mauern.
4. **Projektil-Dodge:** Veteran/Elite weichen erkennbaren Geschossen
   senkrecht aus (mit Fehlerquote).
5. **Gleiche Systeme wie Spieler:** Bots rüsten Module + Frames aus und
   nutzen Dash defensiv, Repair außerhalb des Kampfes, Repulse gegen
   Schwärme – über dieselben öffentlichen Funktionen wie echte Clients.
6. **Faire Zielwahl:** Frische Spieler (Level < 8) werden ignoriert, solange
   sie nicht selbst angreifen; Bots bevorzugen Ziele nahe am eigenen Level,
   Bounty-Ziele und den letzten Angreifer; maximal zwei Bots verfolgen
   dasselbe Ziel (Anti-Gang-up).
7. **Neue Klassenpfade:** Bots spielen auch Flanker/Arbalest/Guardian/Blitz-
   Linien, damit alle Familien in der Arena vorkommen.

### C. Grafik v2

1. **Treffer-Feedback:** Weißer Hit-Flash auf Tanks und Formen, Schadenszahlen
   (gepoolte Textobjekte, weltpositioniert, nach oben driftend).
2. **Tode:** Explosions-Burst + expandierender Schockwellenring in
   Spielerfarbe; größere Explosion für Elite-Shapes.
3. **Projektile:** kurze additive Trails; Drohnen mit Mikro-Trail.
4. **Kamera:** kurzer, gedämpfter Screen-Shake bei eigenem Schaden und
   eigenen Kills (max. ~6 px, abklingend, abschaltbar über Theme-agnostische
   Konstante).
5. **Welt:** zweistufiges Grid (fein + grob), radiale Vignette am
   Weltrand, Wände mit Licht-/Schattenkante.
6. **Minimap v2:** Elite-Shapes (gold), Bounty-Ziel (goldener Punkt),
   Event-Zone (Kreis), Pentagons als schwache Punkte.
7. **Neue Hüllen:** eigene Silhouetten für alle acht neuen Klassen
   (Heckläufe sichtbar, Guardian-Schild-Ring, Comet-Tropfenform …).
8. **Low-HP-Vignette:** rote Randabdunklung unter 35 % Leben.

### D. Game Feel v2

1. **Audio v2:** Rausch-basierte Hits/Explosionen (gefilterte Noise-Bursts),
   Klassencharakter beim Schuss (Pitch/Waveform je Familie), Hit-Confirm-Tick
   bei eigenen Treffern, Kill-Jingle mit Streak-Steigerung, Event-Horn,
   Bounty-Fanfare, Low-HP-Puls. Master-Volume + Mute im Startscreen,
   persistiert in `localStorage`.
2. **Kill-Streaks:** serverseitig gezählt (`streak` im Snapshot), Killfeed
   zeigt Streak-Flammen, Toast bei 3/5/8er-Streak, Streak endet beim Tod.
3. **Score-Popups:** +XP-Zahlen am Ort zerstörter Formen/Kills.
4. **Death-Screen v2:** zusätzlich Überlebenszeit und beste Streak des Runs.
5. **Spawn-Schutz sichtbar:** pulsierender Ring mit Restsekunden.

### E. Balance-Sicherung v2

1. **Tier-Envelope-Tests:** Für jede Stufe wird ein Korridor erzwungen
   (z. B. „T4-Bullet-DPS × effektive Haltbarkeit innerhalb ±35 % des
   Medians“), damit kein neuer Tank still herausfällt.
2. **Klassenbaum-Invarianten:** eindeutige IDs, gültige Eltern, korrekte
   Unlock-Level, jede Klasse erreichbar, jede Familie ≥ 3 Finals.
3. Balance-Report deckt neue Klassen automatisch ab (iteriert über
   `PLAYER_CLASS_IDS`).

### F. Abnahme

- `npm run check` (Typecheck, Tests, Build) grün.
- Alle neuen Mechaniken serverautoritativ + regressionsgetestet.
- Kein neuer Pflicht-Input: weiterhin genau ein Ability-Button.
- README + BALANCE_MASTERPLAN aktualisiert.

---

## Teil 3 – Umsetzungsreihenfolge

1. Shared: Klassenmatrix + `barrelAngles` + Streak-Feld + Invarianten-Tests
2. Server: Feuerlogik, neue Klassenmechaniken, Drohnen-Archetypen, Streaks
3. Server: `bot-brain.ts` (Aim, Tiers, Dodge, Module, faire Zielwahl)
4. Client: Renderer v2 (Hüllen, Trails, Flash, Shake, Zahlen, Minimap)
5. Client: Audio v2 + HUD-Feedback (Streaks, Popups, Death-Screen)
6. Balance-Pass + Doku + Gesamtabnahme

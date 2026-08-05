# Project Maze – Gameplay-, Balance- und Klassen-Masterplan

## Status – Alpha 1.0

Der v2-Ausbau ist in `docs/MASTERPLAN_V2.md` beschrieben und umgesetzt.

### Spielbar umgesetzt

- 29 Tanks in vier klaren Klassenfamilien (je drei Endpfade)
- acht klassische Stat-Upgrades
- genau ein aktives Core Module pro Leben
- genau ein passiver Frame Modifier oder Standard Frame
- Elite Shapes
- drei rotierende Arena-Events: Core Surge, Overcharge, Hunter Signal
- Bounty-System und Kill-Streaks
- faire Bots mit Skill-Tiers, Anfängerschutz und Modul-Nutzung
- Treffer-Feedback (Hit-Flash, Schadenszahlen, Shake) und Audio v2
- lokale F2-Balance- und DPS-Werkzeuge
- klassenspezifische Kernmechaniken in allen vier Familien
- anonyme Server-Telemetrie: Pickraten, Lebensdauer und Kills/Deaths je Klasse,
  Modul und Frame, exportiert über `/metrics` (siehe `docs/TELEMETRY.md`)

### Bewusst noch offen

- datenbasierte Feinbalance auf Basis der erhobenen Telemetrie
- weitere Events und Module

Neue Inhalte werden erst ergänzt, wenn die aktuellen Systeme verständlich und balanciert sind.

## Leitbild

Project Maze behält die sofort verständliche Basis eines klassischen Browser-Arena-Tankspiels:

1. bewegen
2. zielen
3. schießen
4. Formen farmen
5. leveln und Stats verbessern
6. Tankklasse entwickeln
7. andere Spieler besiegen

Die zusätzlichen Systeme schaffen Outplay-Momente und wechselnde Ziele, dürfen den Kern aber niemals überdecken.

## Verbindliche Komplexitätsgrenze

Während eines normalen Lebens sieht und bedient ein Spieler höchstens:

- seine Tankklasse
- die acht Stat-Upgrades
- einen Ability-Button
- einen kleinen Frame-Hinweis

Es gibt keine mehrteilige Hotbar, kein Kampfinventar und keine fünf gleichzeitig aktiven Fähigkeiten.

### Progressive Disclosure

- Auf dem Startscreen wird ein kleines Loadout gewählt.
- Im Match wird ausschließlich eine Ability-Taste benötigt.
- Nach dem Tod kann das Loadout im Death-Screen geändert werden.
- Elite Shapes, Events und Bounties erklären sich durch Weltmarker und kurze Hinweise.
- Kein Event fügt eine Eingabe hinzu: Overcharge verändert nur eine Regel, Hunter Signal
  stellt nur ein zusätzliches Ziel in die Arena.
- Detailzahlen bleiben im optionalen F2-Balance-Lab.

## Klassenbaum

```text
Core
├── Rapid
│   ├── Twin → Storm
│   ├── Repeater → Gatling
│   └── Flanker → Octo
├── Sniper
│   ├── Railgun → Lancer
│   ├── Hunter → Phantom
│   └── Arbalest → Deadeye
├── Controller
│   ├── Warden → Overseer
│   ├── Factory → Carrier
│   └── Guardian → Hive
└── Impact
    ├── Crusher → Juggernaut
    ├── Bulwark → Fortress
    └── Blitz → Comet
```

Klassenentscheidungen erfolgen aktuell auf Level 10, 24 und 38.

## Core Modules

Jeder Spieler rüstet exakt ein aktives Modul aus. Aktivierung über `Leertaste` oder `Shift`; Mobile erhält einen einzelnen Ability-Button.

### Dash

- ungefähr 190 Einheiten Bewegungsschub
- keine Unverwundbarkeit
- Wände stoppen die Bewegung
- während und kurz nach dem Dash keine Schüsse
- Body-Damage während des aktiven Dash-Fensters auf 25 % reduziert
- Cooldown: 10 Sekunden

**Rolle:** Ausweichen und Repositionierung.

### Repulse Pulse

- Druckwelle mit ungefähr 195 Einheiten Radius
- stößt Spieler zurück
- verdrängt Drohnen stärker
- lenkt nahe gegnerische Projektile um und schwächt ihre Integrität
- verursacht keinen direkten Spielerschaden
- Cooldown: 12 Sekunden

**Rolle:** Raumkontrolle und Anti-Rush.

### Front Barrier

- kurzer Schild im Frontwinkel
- feste 70 Schildpunkte
- keine Skalierung mit Fortress-, Reinforced- oder Max-HP-Werten
- Angriffe von hinten bleiben vollständig wirksam
- währenddessen keine Schüsse
- Cooldown: 12 Sekunden

**Rolle:** Timing-basierte Verteidigung gegen Burst.

### Repair Cycle

- 0,8 Sekunden Vorbereitung
- anschließende Heilung über Zeit
- Abbruch bei Schaden, Schuss, Secondary-Input oder deutlicher Bewegung
- kann bei vollem Leben nicht ausgelöst werden
- Cooldown: 17 Sekunden

**Rolle:** Erholung außerhalb aktiver Kämpfe.

### Modulregeln

- exakt ein Modul pro Leben
- Wechsel nur vor dem Spawn, während Spawn-Schutz oder nach dem Tod
- Nutzung beendet Spawn-Schutz
- Cooldowns werden durch Tod, Klassenwechsel oder Reconnect nicht missbrauchbar zurückgesetzt
- keine universelle direkte Schadensfähigkeit in der ersten Modulserie
- Effekte und Sounds werden erst nach bestätigter Serveraktivierung gezeigt
- sämtliche Auswirkungen werden serverautoritativ berechnet

## Passive Frame Modifier

Jeder Modifier ist ein Sidegrade mit Vorteil und Preis.

### Standard Frame

Keine Veränderung. Empfohlene Basis.

### Lightweight Frame

- +6 % Bewegung und Beschleunigung
- -8 % maximales Leben
- Drohnen werden ebenfalls schneller, besitzen aber weniger Leben

### Projectile Stabilizer

- +10 % Projektiltempo
- bei Control-Tanks stattdessen +10 % Drohnenweg und Reaktion
- -8 % Feuer- beziehungsweise Drohnen-Kontaktrate

Damit bleibt der Modifier für Bullet- und Control-Klassen sinnvoll, ohne irgendwo ein kostenloser Buff zu sein.

### Reinforced Core

- +10 % maximales Leben
- -6 % Bewegung und Beschleunigung
- Drohnen erhalten ebenfalls mehr Leben, werden aber langsamer

### Modifierregeln

- genau ein Modifier oder Standard Frame
- keine stärkeren Account-Unlocks
- kein Pay-to-win
- keine harte Klassen-Schwäche darf vollständig entfernt werden
- Tankklasse und Stat-Build bleiben wichtiger als der Modifier

## Elite Shapes

Seltene goldene Farmziele erzeugen lokale Konflikte, ohne eine neue Steuerung einzuführen.

- goldene pulsierende Kontur
- 1,55-fache Größe
- vierfaches Leben
- langsamere Bewegung
- zusätzliche XP- und Score-Belohnung
- normalerweise maximal drei gleichzeitig
- während Core Surge maximal vier gleichzeitig
- Vergrößerung nur an kollisionssicheren Positionen

## Arena-Events

Die Arena rotiert fest durch drei Events: **Core Surge → Overcharge → Hunter Signal**.
Damit dominiert kein Event die Session, und jedes bleibt wiedererkennbar.

Gemeinsame Regeln:

- erstes Event ungefähr 65 Sekunden nach Serverstart
- sichtbare Vorwarnung vor jeder aktiven Phase
- markierte Zone im Zentrum, auf Karte und Minimap sichtbar
- nächstes Event frühestens ungefähr zwei Minuten nach dem Ende des vorherigen
- alle Auswirkungen sind serverautoritativ und enden mit der aktiven Phase

Spieler werden niemals teleportiert oder zur Teilnahme gezwungen.

### Core Surge

- 10 Sekunden Vorwarnung, 40 Sekunden aktive Phase, Zonenradius 620
- zusätzliche Formen innerhalb der Zone
- höhere Elite-Chance (maximal vier statt drei gleichzeitig)
- maximal 42 zusätzliche Event-Formen
- verbleibende Bonusformen werden am Ende entfernt
- nur dieses Event verändert das Formenaufkommen

**Rolle:** wechselndes Farmziel, das lokale Konflikte erzeugt.

### Overcharge

- 8 Sekunden Vorwarnung, 35 Sekunden aktive Phase, Zonenradius 560
- verändert ausschließlich das Verhalten von Projektil-Kollisionen
- Geschosse in der Zone tragen einen Überladungspuffer von 75 % ihrer maximalen Integrität
- bei einem Zusammenstoß wird zuerst dieser Puffer verbraucht: Kugeln löschen sich
  nicht mehr gegenseitig aus, sondern streifen sich
- ein gestreiftes Geschoss wird um rund 8 Grad abgelenkt und behält 94 % seines Tempos
- der Puffer wird verbraucht und nicht nachgeladen – Dauerbeschuss zerstört Geschosse weiterhin
- **kein Schadensbuff:** Geschoss- und Treffer-Schaden bleiben exakt unverändert
- außerhalb der Zone und außerhalb der aktiven Phase gilt die normale Kollisionsregel

**Rolle:** Defensive Kugelwände (Storm, Gatling, Octo) verlieren in der Zone ihre
Schutzwirkung, schwere Einzelschüsse kommen durch das Kreuzfeuer. Der Preis ist,
dass jeder gestreifte Schuss vom Ziel abweicht – Overcharge belohnt Winkel, nicht Spam.

### Hunter Signal

- 8 Sekunden Vorwarnung, 45 Sekunden aktive Phase, Zonenradius 520
- ein neutraler Elite-Guardian bewacht die Zone (Guardian-Klasse, Level 45, fester Bau)
- er gehört keinem Team, wird von niemandem gesteuert und verlässt seine Zone nicht
- er erhält nur 30 % des eingehenden Schadens (rund 3,3-faches effektives Leben)
- er verteidigt sich gegen jeden Angreifer, jagt aber keine frischen Spieler unter Level 8,
  solange diese ihn in Ruhe lassen
- er sammelt weder XP noch Score und erscheint nicht in Bestenliste oder Bounty
- sein Abschuss gibt zusätzlich 600 Bonus-XP; er respawnt nicht
- am Ende des Events verschwindet er, auch wenn er noch lebt

**Rolle:** gemeinsames PvE-Ziel, das PvP-Druck erzeugt, ohne jemanden zu zwingen.

### Spätere Event-Kandidaten

- **Fracture:** temporär veränderte Durchgänge

Fracture bleibt gesperrt, bis die drei bestehenden Events beobachtet wurden.

## Bounties

Ein dominanter Spieler wird zu einem sichtbaren Arena-Ziel.

### Aktuelle Auslösung

- mindestens Level 10
- mindestens drei Kills
- mindestens 1.500 Score
- höchste kombinierte Dominanz aus Kills und Score

### Wirkung

- goldener Ring und Marker am Tank
- kompakter HUD-Hinweis
- wachsender Bonus bis maximal 1.200
- keine Positionsanzeige außerhalb der normalen Sichtweite
- Bonus-XP und Score für den Abschluss
- dasselbe Spielerpaar kann die Belohnung nicht sofort wiederholt farmen

Der führende Spieler wird nicht künstlich geschwächt. Die Arena erhält lediglich ein attraktives Gegenziel.

## Klassenspezifische Mechaniken

Universelle Module ergänzen die Tankklasse, ersetzen sie aber nicht.

### Rapid

- **Storm:** Projektile besitzen mehr Integrität und bilden eine bessere defensive Kugelwand.
- **Gatling:** anhaltendes Feuer reduziert schrittweise die Streuung.

### Precision

- sichtbarer Treffer-Knockback
- Hunter übernimmt einen Teil der eigenen Bewegung in Projektile
- Phantom erhält bei schneller Bewegung einen kontrollierten Schussbonus
- Lancer besitzt stärkeren Schussrückstoß und langlebigere Projektile

### Control

- Warden und Overseer verwenden schnelle, leichtere Schwärme
- Factory und Carrier verwenden langsamere, robuste Heavy-Drohnen
- Frame Modifier beeinflussen Drohnenleben, Wegtempo und Kontaktfrequenz konsistent

### Impact

- Bulwark reduziert frontalen Schaden
- Fortress besitzt eine stärkere Front, bleibt aber flankierbar
- Juggernaut besitzt eine kleine allgemeine Schadensreduktion
- Dash kann den vollen Rammer-Kontaktschaden nicht transportieren

Jede finale Klasse soll langfristig genau eine zentrale, gut lesbare Mechanik besitzen.

## Balance Lab

Das lokale F2-Labor kann komplette Testkombinationen laden:

- Tankklasse
- Level
- Stat-Build
- Core Module
- Frame Modifier
- God Mode
- Bot-Pause
- serverautoritatives Testziel
- Live-DPS-Messung

Wichtige Vergleichskombinationen:

- Juggernaut + Dash
- Fortress + Barrier + Reinforced
- Overseer + Lightweight
- Carrier + Stabilizer
- Gatling gegen Storm
- Lancer frontal und seitlich gegen Fortress

## Technische Balance-Sicherung

`npm run balance` zeigt:

- DPS
- Burst
- Reichweite
- Haltbarkeit
- Mobilität
- Drohnendruck
- Body-Damage-Bedrohung
- Modul-Cooldowns und Aktivzeiten
- Frame-Vorteile und Trade-offs

Regressionstests sichern unter anderem:

- Dash ohne Unverwundbarkeit
- reduzierten Rammer-Schaden während Dash
- Barrier mit festen Schildpunkten
- Repulse ohne direkten Schaden
- Repair-Abbruch
- Modifier mit Vorteil und Preis
- Drohnen-Modifier-Konsistenz
- Elite-Shape-Limits und Belohnungen
- Core-Surge-Phasen und feste Event-Rotation
- zusätzliche Formen nur während Core Surge
- Overcharge: Geschosse überstehen den Zusammenstoß, nur in der Zone, ohne Schadensänderung
- Overcharge: Puffer wird verbraucht, Geschosse bleiben zerstörbar
- Hunter-Signal-Guardian: Schadensreduktion, Anfängerschutz, Kill-Belohnung, kein Respawn
- Hunter-Signal-Guardian: kein Score, keine Bestenlisten- und Bounty-Teilnahme
- Bounty-Auslösung und Anti-Farming
- Gatling-Spin-up
- Storm-Projektilintegrität

## Telemetrie nach dem Online-Start

Später werden anonym und serverseitig erfasst:

- Klassen-, Modul- und Modifier-Pickrate
- Kill- und Todesrate
- durchschnittliche Lebensdauer und Levelzeit
- verursachter und erhaltener Schaden
- Elite- und Event-Beteiligung
- Bounty-Dauer und Bounty-Abschlüsse

Es gibt keine automatischen Buffs oder Nerfs. Änderungen werden bewusst aus Daten und Spielgefühl abgeleitet.

## Abnahmekriterien

Ein System gilt erst als abgeschlossen, wenn:

- Typecheck, Tests und Produktionsbuild erfolgreich sind
- sämtliche Effekte serverautoritativ sind
- Desktop und Mobile dieselben Regeln verwenden
- die Mechanik ohne langen Tutorialtext verständlich ist
- keine Kombination eine Klassen-Schwäche vollständig entfernt
- der normale Spieler während eines Lebens nur einen Ability-Button benötigt
- Cooldowns und Eventzeiten eindeutig übertragen werden
- lokale Debug-Tools niemals auf dem Produktionsserver aktiv sind

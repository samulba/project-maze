# Project Maze – Gameplay-, Balance- und Klassen-Masterplan

## Aktueller Stand – Alpha 0.9

### Als spielbarer Alpha-Prototyp umgesetzt

- **Phase A – Fundament und Einfachheit:** gemeinsames Loadout-Modell, genau ein Ability-Input, kompakter HUD-Slot, serverautoritatives Netzwerk und lokale Balance-Lab-Unterstützung.
- **Phase B – Core Modules:** Dash, Repulse Pulse, Front Barrier und Repair Cycle mit Cooldowns, Abbruchregeln, Effekten und serverseitigen Anti-Exploit-Tests.
- **Phase C – Passive Frame Modifier:** Standard, Lightweight, Projectile Stabilizer und Reinforced Core sind in die zentrale Stat-Berechnung integriert.
- **Phase D – Elite Shapes:** seltene goldene Formen mit mehr Leben, größerer Belohnung, gleichzeitigem Limit und sichtbarer Weltmarkierung.
- **Phase E – Core Surge:** Warnphase, aktive Mittelzone, zusätzliche Formen, erhöhte Elite-Chance und begrenzte Event-Entities.
- **Phase F – Bounties:** Dominanzbewertung, sichtbares Ziel, wachsender Bonus und Anti-Farming-Sperre pro Spielerpaar.
- **Phase G – Klassenidentität:** teilweise umgesetzt. Precision-Knockback, unterschiedliche Drohnentypen, Impact-Panzerung und klare Silhouetten sind vorhanden. Weitere finale Klassenmechaniken folgen erst nach dem Alpha-Test.

### Bewusst nach dem ersten großen Test offen

- **Phase H – Öffentlicher Test und Telemetrie:** Pickrates, Killrates, Lebensdauer, Modulnutzung, Elite-/Event-Beteiligung und Bounty-Abschlüsse benötigen den Online-Server und eine Datenbank.
- zusätzliche Module, Modifier oder Events werden erst ergänzt, wenn die vier Grundmodule und Core Surge verständlich und balanciert sind.
- Zahlen gelten als Startwerte, nicht als endgültige Balance.

## Vision

Project Maze behält die sofort verständliche Basis eines klassischen Browser-Arena-Tankspiels:

- bewegen
- zielen
- schießen
- Formen farmen
- leveln
- Stats verbessern
- Tankklasse entwickeln
- andere Spieler besiegen

Darüber liegt eine eigene zweite Ebene aus gezielten Outplay-Momenten, riskanten Arena-Zielen und klaren Build-Entscheidungen. Diese Ebene darf das Kernspiel vertiefen, aber niemals überdecken.

## Verbindliche Komplexitätsregel

Project Maze darf tief sein, aber nicht kompliziert wirken.

Ein Spieler sieht während eines normalen Lebens höchstens:

1. seine Tankklasse,
2. die acht bekannten Stat-Upgrades,
3. genau ein aktives Core Module,
4. genau einen passiven Frame Modifier.

Es gibt keine Hotbar mit mehreren Fähigkeiten, kein Inventar während des Kampfes und keine langen Itemtexte im HUD. Elite Shapes, Arena Events und Bounties werden direkt in der Welt erklärt.

### Progressive Disclosure

- **Erste Runde:** bewegen, schießen, farmen und Level 10 erreichen.
- **Startscreen:** ein Core Module und optional ein Frame Modifier.
- **Im Match:** eine Ability-Taste mit Cooldown.
- **Nach dem Tod:** dasselbe kleine Loadout-Feld erscheint im Death-Screen.
- **Events und Bounties:** kurze Weltmarker und ein kompakter Hinweis.
- **Erweiterte Zahlen:** ausschließlich im lokalen Balance Lab und später in optionalen Detailansichten.

## Klassenbaum – 21 Tanks

```text
Core
├── Rapid
│   ├── Twin
│   │   └── Storm
│   └── Repeater
│       └── Gatling
├── Sniper
│   ├── Railgun
│   │   └── Lancer
│   └── Hunter
│       └── Phantom
├── Controller
│   ├── Warden
│   │   └── Overseer
│   └── Factory
│       └── Carrier
└── Impact
    ├── Crusher
    │   └── Juggernaut
    └── Bulwark
        └── Fortress
```

## System 1 – Core Modules

Jeder Spieler rüstet genau ein aktives Modul aus. Aktivierung über `Leertaste` oder `Shift`; Mobile verwendet einen einzelnen Ability-Button.

### Dash

- kurzer kontrollierter Bewegungsschub
- keine Unverwundbarkeit
- Wände stoppen den Dash
- während und kurz nach dem Dash keine Schüsse
- Body-Damage während des Schubs auf 25 % reduziert
- Cooldown: 10 Sekunden

Rolle: Mobilität, Ausweichen und Repositionierung.

### Repulse Pulse

- kreisförmige Druckwelle
- stößt Gegner zurück
- verdrängt Drohnen stärker
- lenkt und schwächt nahe Projektile
- verursacht keinen direkten Spielerschaden
- Cooldown: 12 Sekunden

Rolle: Raumkontrolle und Anti-Rush.

### Front Barrier

- kurzer frontal ausgerichteter Schild
- feste 70 Schildpunkte statt Skalierung mit Tank-HP
- wirkt ausschließlich im Frontwinkel
- Spieler kann währenddessen nicht schießen
- Angriffe von hinten bleiben vollständig wirksam
- Cooldown: 12 Sekunden

Rolle: Timing-basierte Verteidigung gegen Burst.

### Repair Cycle

- 0,8 Sekunden sichtbare Vorbereitungsphase
- Heilung über die verbleibende Aktivzeit
- Abbruch bei Schaden, Schuss, Secondary-Input oder deutlicher Bewegung
- Heilung: fester Grundwert plus kleiner Max-HP-Anteil
- kann bei vollem Leben nicht ausgelöst werden
- Cooldown: 17 Sekunden

Rolle: Sustain außerhalb aktiver Gefechte.

### Modul-Balance-Regeln

- exakt ein aktives Modul pro Leben
- Wechsel nur vor dem Spawn, im Spawn-Schutz oder nach dem Tod
- Modulnutzung beendet Spawn-Schutz
- Tod, Klassenwechsel und Reconnect setzen Cooldowns nicht missbrauchbar zurück
- keine universelle Schadensfähigkeit in der ersten Modul-Serie
- jede bestätigte Aktivierung besitzt Effekt und Sound
- sämtliche Auswirkungen werden serverautoritativ berechnet

## System 2 – Passive Frame Modifier

Ein optionaler Sidegrade mit echtem Trade-off. Es gibt keinen kostenlosen reinen Buff.

### Standard Frame

Keine Veränderung. Empfohlene und vorausgewählte Option.

### Lightweight Frame

- +6 % Bewegung und Beschleunigung
- -8 % maximales Leben
- beeinflusst auch Drohnenbewegung und Drohnenleben

### Projectile Stabilizer

- +10 % Projektiltempo
- -8 % Feuerrate
- bei Drohnenklassen bleibt die Feuerraten-Strafe erhalten, ohne einen versteckten Gratisvorteil zu erzeugen

### Reinforced Core

- +10 % maximales Leben
- -6 % Bewegung und Beschleunigung
- beeinflusst auch Heavy-Drohnen entsprechend

### Modifier-Regeln

- genau ein Modifier oder Standard Frame
- keine Freischaltungsvorteile und kein Pay-to-win
- Wechsel nur zusammen mit dem Core Module
- Effekte bleiben klein genug, dass die Tankklasse wichtiger ist
- Modifier dürfen keine harte Klassen-Schwäche vollständig entfernen

## System 3 – Elite Shapes

Seltene, sofort erkennbare Farmziele mit höherem Risiko und höherer Belohnung.

- goldene pulsierende Kontur
- 1,55-fache Größe
- vierfaches Leben
- verlangsamte Bewegung
- hoher Bonus auf XP und Score
- normalerweise höchstens drei gleichzeitig
- während Core Surge höchstens vier gleichzeitig
- Vergrößerung nur an kollisionssicheren Positionen

Elite Shapes schaffen lokale Konflikte und Farming-Abwechslung, ohne eine neue Steuerung oder ein Menü einzuführen.

## System 4 – Arena Events

Immer nur ein Event gleichzeitig. Der Spieler wird niemals teleportiert.

### Core Surge

- erstes Event ungefähr 65 Sekunden nach Serverstart
- 10 Sekunden sichtbare Vorwarnung
- 40 Sekunden aktive Phase
- markierte Zone in der Kartenmitte
- zusätzliche Formen in der Zone
- höhere Elite-Chance
- maximal 42 zusätzliche Event-Formen
- verbleibende Bonusformen werden nach dem Event entfernt
- nächstes Event frühestens ungefähr zwei Minuten später

### Spätere Event-Kandidaten

- **Fracture:** ausgewählte Durchgänge öffnen oder schließen sich vorübergehend.
- **Overcharge:** Projektilkollisionen erhalten ein besonderes visuelles Verhalten ohne pauschalen Schadensbuff.
- **Hunter Signal:** ein neutraler Elite-Guardian erscheint als gemeinsames Ziel.

Diese Events bleiben gesperrt, bis Core Surge im echten Match verständlich ist.

## System 5 – Bounties

Ein dominanter Spieler wird zu einem sichtbaren Arena-Ziel.

### Auslösung

Aktuelle Startschwelle:

- mindestens Level 10,
- mindestens drei Kills,
- mindestens 1.500 Score,
- höchste kombinierte Dominanz aus Kills und Score.

### Wirkung

- goldener Ring und Marker am Tank
- kompakter HUD-Hinweis
- wachsender Bonus bis maximal 1.200
- keine permanente Position außerhalb normaler Sichtweite
- Bonus-XP und Score für den Abschluss
- dasselbe Spielerpaar kann die Belohnung nicht sofort wiederholt farmen

Bounties wirken gegen Snowballing, ohne den führenden Spieler künstlich zu schwächen.

## System 6 – Klassenspezifische Mechaniken

Universelle Module ergänzen Klassen, ersetzen aber nicht deren Identität.

### Bereits umgesetzt

- Precision: Knockback, Bewegungstransfer und starke Einzelschüsse
- Control: unterschiedliche Drohnenphysik, Schwarmgrößen und Heavy-Drohnen
- Impact: Frontpanzerung, allgemeine Schadensreduktion und Nahkampfdruck
- Rapid: breite Projektilwände und konstante Raumkontrolle

### Ausbauprinzip

Jede finale Klasse erhält genau eine gut lesbare Kernmechanik. Keine Klasse bekommt mehrere versteckte Passives gleichzeitig.

- Storm: kontrollierbare breite Salven statt reiner DPS-Steigerung
- Gatling: zunehmende Präzision bei dauerhaftem Feuer
- Lancer: hoher Rückstoß und klar telegraphierter Einzelschuss
- Phantom: Bonus durch Bewegung und Winkel
- Overseer: reaktionsschneller Schwarm mit geringer Einzelhaltbarkeit
- Carrier: langsamer Heavy-Schwarm mit hoher Verluststrafe
- Juggernaut: Nahkampfdruck und allgemeine Robustheit
- Fortress: starke Front und klare Flanken-Schwäche

## System 7 – Balance Lab

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

So lassen sich insbesondere problematische Kombinationen wie `Juggernaut + Dash`, `Fortress + Barrier + Reinforced` oder `Overseer + Lightweight` direkt vergleichen.

## System 8 – Telemetrie und echte Balance

Mit Online-Server und Datenbank werden anonym und serverseitig erfasst:

- Modul- und Modifier-Pickrate
- Klassen-Pickrate
- Kill- und Todesrate
- durchschnittliche Lebensdauer und Levelzeit
- verursachter und erhaltener Schaden
- Elite-Shape-Beteiligung
- Event-Beteiligung
- Bounty-Dauer und Bounty-Abschlüsse

Es gibt keine automatischen Buffs oder Nerfs. Änderungen werden bewusst aus Daten und Spielgefühl abgeleitet.

## Abnahmekriterien

Ein System gilt erst als abgeschlossen, wenn:

- Typecheck, Tests und Produktionsbuild erfolgreich sind,
- sämtliche Effekte serverautoritativ sind,
- Desktop und Mobile dieselben Regeln verwenden,
- die Mechanik ohne langen Tutorialtext im Kampf verständlich ist,
- keine Kombination eine Klassen-Schwäche vollständig entfernt,
- der normale Spieler während eines Lebens nur einen Ability-Button benötigt,
- Cooldowns und Eventzeiten im Snapshot eindeutig sind,
- lokale Debug-Tools niemals auf dem Produktionsserver aktiv sind.

# Project Maze – Gameplay-, Balance- und Klassen-Masterplan

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
- **Nach dem Tod:** Loadout darf gewechselt werden.
- **Events und Bounties:** erscheinen erst über klare Weltmarker und kurze Hinweise.
- **Erweiterte Zahlen:** nur im lokalen Balance Lab und später in optionalen Detailansichten.

## Aktueller Stand – Alpha 0.8

- Farming und Upgrade-Skalierung wurden neu balanciert.
- 21 Tanks mit vier Branches sind vorhanden.
- Eigene Tank-Silhouetten und mehrere klassenspezifische Mechaniken sind vorhanden.
- Drohnen besitzen unterschiedliche Schwarm- und Heavy-Archetypen.
- Bots nutzen sämtliche Klassenpfade mit menschlicheren Reaktionswerten.
- Ein lokales Balance Lab erlaubt schnelle Klassen-, Build- und DPS-Tests.

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

Jeder Spieler rüstet genau ein aktives Modul aus. Aktivierung über `Leertaste` oder `Shift`; Mobile erhält einen einzelnen Ability-Button.

### Dash

- kurzer kontrollierter Bewegungsschub
- keine Unverwundbarkeit
- Wände stoppen den Dash
- während und kurz nach dem Dash keine Schüsse
- Body-Damage während des Schubs stark reduziert
- Ziel-Cooldown: 10 Sekunden

Rolle: Mobilität, Ausweichen, Repositionierung.

### Repulse Pulse

- kreisförmige Druckwelle
- stößt Gegner zurück
- verdrängt Drohnen stärker
- lenkt oder schwächt nahe Projektile
- verursacht keinen direkten Spielerschaden
- Ziel-Cooldown: 12 Sekunden

Rolle: Raumkontrolle und Anti-Rush.

### Front Barrier

- kurzer frontal ausgerichteter Schild
- feste Schildpunkte statt Skalierung mit Tank-HP
- reduziert nur Angriffe aus dem Frontwinkel
- Spieler kann währenddessen nicht schießen
- Ziel-Cooldown: 12 Sekunden

Rolle: Timing-basierte Verteidigung gegen Burst.

### Repair Cycle

- sichtbare Vorbereitungsphase
- Heilung über Zeit
- Abbruch bei Schaden, Schuss oder starker Bewegung
- Grundheilung plus kleiner Max-HP-Anteil
- Ziel-Cooldown: 17 Sekunden

Rolle: Sustain außerhalb aktiver Gefechte.

### Modul-Balance-Regeln

- exakt ein aktives Modul pro Leben
- Wechsel nur vor dem Spawn oder nach dem Tod
- Modulnutzung beendet Spawn-Schutz
- Tod, Klassenwechsel und Reconnect setzen Cooldowns nicht missbrauchbar zurück
- keine universelle Schadensfähigkeit in der ersten Modul-Serie
- jede Aktivierung ist visuell und akustisch verständlich
- sämtliche Effekte werden serverautoritativ berechnet

## System 2 – Passive Frame Modifier

Ein optionaler passiver Sidegrade mit echtem Trade-off. Es gibt keinen kostenlosen reinen Buff.

### Standard Frame

Keine Veränderung. Empfohlene und vorausgewählte Option.

### Lightweight Frame

- +6 % Bewegung
- -8 % maximales Leben

### Projectile Stabilizer

- +10 % Projektiltempo
- -8 % Feuerrate

### Reinforced Core

- +10 % maximales Leben
- -6 % Bewegung

### Modifier-Regeln

- genau ein Modifier oder Standard Frame
- keine Freischaltungsvorteile und kein Pay-to-win
- Wechsel nur zusammen mit dem Core Module
- Effekte bleiben klein genug, dass die Tankklasse wichtiger ist
- Modifier dürfen keine harte Klassen-Schwäche vollständig entfernen

## System 3 – Elite Shapes

Seltene, sofort erkennbare Farmziele mit höherem Risiko und höherer Belohnung.

### Eigenschaften

- goldene oder pulsierende Kontur
- deutlich mehr Leben
- größer und langsamer als normale Formen
- hoher XP- und Score-Wert
- begrenzte Anzahl gleichzeitig
- keine zufälligen One-Shot-Angriffe

### Ziel

Elite Shapes schaffen lokale Konflikte und Farming-Abwechslung, ohne eine neue Steuerung oder ein eigenes Menü einzuführen.

## System 4 – Arena Events

Seltene, kurze Ereignisse verändern die Prioritäten der Arena. Immer nur ein Event gleichzeitig.

### Core Surge – erstes Event

- 10 Sekunden sichtbare Vorwarnung
- 40 Sekunden aktive Phase
- markierte Zone in der Kartenmitte
- erhöhte Shape-Dichte
- höhere Chance auf Elite Shapes
- Spieler werden nicht teleportiert

### Spätere Event-Kandidaten

- **Fracture:** ausgewählte Durchgänge öffnen oder schließen sich vorübergehend.
- **Overcharge:** Projektilkollisionen erzeugen stärkere visuelle Energie, ohne pauschalen Schadensbuff.
- **Hunter Signal:** ein neutraler Elite-Guardian erscheint als gemeinsames Ziel.

Neue Events werden erst ergänzt, wenn Core Surge verständlich und balanciert ist.

## System 5 – Bounties

Ein dominanter Spieler wird zu einem sichtbaren Arena-Ziel.

### Auslösung

Eine Bounty wird nur gesetzt, wenn ein Spieler eine klare Dominanzschwelle erreicht, zum Beispiel:

- mehrere Kills ohne Tod,
- deutlicher Score-Vorsprung,
- Mindestlevel und Mindestspielzeit.

### Wirkung

- klarer Marker am Tank und auf der Minimap
- sichtbarer Bonuswert
- Bonus-XP und Score für den Spieler, der die Bounty beendet
- keine permanente Positionsanzeige außerhalb der normalen Sichtweite
- Bounty wächst kontrolliert mit weiterer Dominanz

### Ziel

Bounties wirken gegen Snowballing und erzeugen natürliche Geschichten in der Lobby, ohne den führenden Spieler künstlich zu schwächen.

## System 6 – Klassenspezifische Mechaniken

Universelle Module ergänzen Klassen, ersetzen aber nicht deren Identität.

### Bereits begonnen

- Precision: Knockback, Bewegungstransfer und starke Einzelschüsse
- Control: unterschiedliche Drohnenphysik und Schwarmgrößen
- Impact: Frontpanzerung und allgemeine Schadensreduktion
- Rapid: Projektilwände und konstante Raumkontrolle

### Ausbauprinzip

Jede finale Klasse erhält genau eine gut lesbare Kernmechanik. Keine Klasse bekommt mehrere versteckte Passives gleichzeitig.

Beispiele:

- Storm: kontrollierbare breite Salven statt reine DPS-Steigerung
- Gatling: zunehmende Präzision bei dauerhaftem Feuer
- Lancer: hoher Rückstoß und klar telegraphierter Einzelschuss
- Phantom: Bonus durch Bewegung und Winkel
- Overseer: reaktionsschneller Schwarm mit geringer Einzelhaltbarkeit
- Carrier: langsamer Heavy-Schwarm mit hoher Verluststrafe
- Juggernaut: Nahkampfdruck und allgemeine Robustheit
- Fortress: starke Front, klare Flanken-Schwäche

## System 7 – Telemetrie und echte Balance

Mit Online-Server und Datenbank werden anonym und serverseitig erfasst:

- Modul-Pickrate
- Modifier-Pickrate
- Klassen-Pickrate
- Kill- und Todesrate
- durchschnittliche Lebensdauer
- durchschnittliches Level
- verursachter und erhaltener Schaden
- Elite-Shape-Beteiligung
- Event-Beteiligung
- Bounty-Dauer und Bounty-Abschlüsse

Keine automatischen Buffs oder Nerfs. Änderungen werden bewusst aus Daten und Spielgefühl abgeleitet.

## Umsetzungsreihenfolge

### Phase A – Fundament und Einfachheit

- gemeinsame Definitionen für Module, Modifier, Events und Bounties
- serverautoritatives Loadout
- genau ein Ability-Input
- kompakter HUD-Slot mit Cooldown
- Wechsel nur vor Spawn oder nach Tod
- lokale Balance-Lab-Unterstützung

### Phase B – Vier Core Modules

- Dash
- Repulse Pulse
- Front Barrier
- Repair Cycle
- serverseitige Tests für Cooldown, Abbruch und Klassen-Kombinationen

### Phase C – Passive Frame Modifier

- Standard
- Lightweight
- Stabilizer
- Reinforced
- Integration in zentrale Stat-Berechnung
- Grenzwerttests gegen problematische Klassenkombinationen

### Phase D – Elite Shapes

- Elite-Markierung normaler Formen
- Bonusleben, Größe und Belohnung
- visuelles Telegraphing
- gleichzeitiges Limit und Respawn-Regeln

### Phase E – Core Surge

- Event-Zustandsmaschine
- Warnphase und aktive Phase
- zentrale Event-Zone
- zusätzliche Shapes und Elite-Chance
- HUD- und Weltanzeige

### Phase F – Bounties

- Dominanzbewertung
- Bounty-Markierung
- wachsender Bonus
- serverseitige Belohnung beim Abschluss
- Anti-Abuse-Regeln gegen Freunde-Farming

### Phase G – Finale Klassenidentität

- genau eine zentrale Mechanik pro finaler Klasse
- verständliche UI-Texte
- visuelle und akustische Rückmeldung
- Counter und günstige Matchups dokumentieren

### Phase H – Öffentlicher Test und Telemetrie

- Match-Metriken
- Dashboard oder Datenexport
- Balance-Pässe nach realen Sessions
- neue Events und Module nur bei nachgewiesenem Bedarf

## Abnahmekriterien

Ein System gilt erst als abgeschlossen, wenn:

- Typecheck, Tests und Produktionsbuild erfolgreich sind,
- sämtliche Effekte serverautoritativ sind,
- Desktop und Mobile dieselben Regeln verwenden,
- die Mechanik ohne Tutorialtext im Kampf verständlich ist,
- keine Kombination eine Klassen-Schwäche vollständig entfernt,
- der normale Spieler während eines Lebens nur einen Ability-Button benötigt,
- Cooldowns und Eventzeiten im Snapshot eindeutig sind,
- lokale Debug-Tools niemals auf dem Produktionsserver aktiv sind.

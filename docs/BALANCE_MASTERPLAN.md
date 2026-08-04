# Project Maze – Balance- und Klassen-Masterplan

## Aktueller Stand – Alpha 0.7

- **Phase 1 abgeschlossen:** Farming, Bot-Schwierigkeit, bestehende Tanks und Upgrade-Skalierung wurden neu balanciert.
- **Phase 2 weitgehend abgeschlossen:** reproduzierbare Balance-Metriken, Grenzwerttests und `npm run balance` sind eingebaut. Automatisierte Duell-Simulationen folgen nach dem ersten Spieltest.
- **Phase 3 abgeschlossen:** Der Klassenbaum wurde von 13 auf 21 Tanks erweitert.
- **Phase 4 abgeschlossen für In-Game-Silhouetten:** Alle 21 Tanks besitzen eigene Rumpf-, Modul- und Laufdesigns. Mini-Vorschauen in den Klassenkarten bleiben eine spätere UI-Verbesserung.
- **Phase 5 weitgehend abgeschlossen:** Leichte Schwarmdrohnen und schwere Factory-Drohnen besitzen unterschiedliche Physikwerte. Weitere Steuerungsmodi werden nach dem Spieltest bewertet.
- **Phase 6 weitgehend abgeschlossen:** Bots reagieren langsamer, zielen ungenauer und verteilen sich auf sämtliche Klassenpfade.
- **Phase 7 offen:** Aussagekräftige Pick-, Kill- und Überlebensraten benötigen echte Online-Matches und eine spätere Telemetrie-/Datenbankanbindung.

## Zielbild

Project Maze soll leicht zu lernen, aber schwer zu meistern sein. Farming muss in den ersten Sekunden verständlich und belohnend wirken. Klassen sollen keine linearen Upgrades sein, sondern unterschiedliche Spielstile mit klaren Stärken, Schwächen und visueller Identität.

## Verbindliche Balance-Ziele

- Erste Klassenwahl nach ungefähr 60–90 Sekunden normalem Farming.
- Zweite Klassenwahl nach ungefähr 4–6 Minuten.
- Finale Klassenwahl nach ungefähr 9–13 Minuten.
- Ein neuer Spieler soll Squares mit einem Core-Tank zuverlässig in 1–2 Treffern zerstören können.
- Kein Tank darf gleichzeitig höchste Reichweite, höchsten Burst, höchste Mobilität und höchste Haltbarkeit besitzen.
- Tier-Aufstiege erhöhen die Gesamtstärke moderat; sie sollen vor allem den Spielstil spezialisieren.
- Basis-DPS-Zielkorridore für Bullet-Tanks:
  - Tier 1: 48–58
  - Tier 2: 52–66
  - Tier 3: 64–82
  - Tier 4: 78–100
- Burst-Tanks dürfen unter dem DPS-Korridor liegen, wenn Projektiltempo, Reichweite und Durchschlag höher sind.
- Rammer und Drohnen werden separat über effektive Kontaktzeit, Überlebensfähigkeit und Kontrolle bewertet.
- Bots dürfen glaubwürdige Fehler machen und keine perfekten Reaktionszeiten besitzen.

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

## Rollen

### Core
Einfacher Allrounder ohne extreme Stärke oder Schwäche.

### Rapid Branch
Konstanter Druck, gute Mobilität und Projektilabwehr. Weniger Burst und geringere Projektilstärke.

### Precision Branch
Hoher Burst, Reichweite und Durchschlag. Langsamer, fragiler und bei Fehlschüssen verwundbar.

### Control Branch
Drohnen, Raumkontrolle und Skill über Positionierung. Begrenzte direkte Feuerkraft und hohe Abhängigkeit vom Drohnenschwarm.

### Impact Branch
Leben, Body-Damage und Nahkampf. Kurze Reichweite und anfällig gegen gutes Kiting.

## Visuelle Designregeln

- Jede Branch erhält eine klar erkennbare Silhouette.
- Rapid: mehrere kurze, kompakte Läufe.
- Precision: lange, schmale Läufe und reduzierte Geometrie.
- Control: Drohnen-Kern, Seitenmodule und Kontrollring.
- Impact: breiter Rumpf, verstärkte Front und kurze Läufe.
- Tier 2 verändert die Silhouette sichtbar.
- Tier 3 fügt eine zweite eindeutige Formensprache hinzu.
- Tier 4 muss auf einen Blick erkennbar sein, darf aber nicht unnötig überladen wirken.
- Eigene, gegnerische und neutrale Entities bleiben farblich eindeutig.

## Umsetzungsphasen

### Phase 1 – Schwierigkeit und bestehende 13 Tanks

- Farmobjekte leichter und weniger gefährlich machen.
- Bot-Reaktionszeiten und Genauigkeit entschärfen.
- Klassenwahl auf Level 10 / 24 / 38 verschieben.
- Bestehende 13 Tanks auf feste Power-Korridore setzen.
- Upgrade-Skalierung entschärfen, damit Max-Level-Spieler nicht exponentiell eskalieren.
- Snapshot-Konfiguration vereinheitlichen.

### Phase 2 – Balance-Messsystem

- Automatische Kennzahlen für DPS, Burst, Reichweite, Haltbarkeit und Mobilität.
- Tests gegen extreme Ausreißer.
- Simulierte Duelle und Farming-Zeitmessung.
- Balance-Report als reproduzierbares Script.

### Phase 3 – Acht neue Klassen

- Repeater
- Gatling
- Hunter
- Phantom
- Factory
- Carrier
- Bulwark
- Fortress

Jede Klasse bekommt eine eigene Rolle, Stats, Bot-Pfade und Beschreibung.

### Phase 4 – Tank-Designsystem

- Renderer nicht mehr nur über `barrelCount` zeichnen.
- Eigene Visual-Presets pro Klasse.
- Unterschiedliche Rumpfformen, Laufanordnungen, Seitenelemente und Kontrollringe.
- Klassenkarten mit Mini-Vorschau und verständlichen Stärken/Schwächen.

### Phase 5 – Drohnen-Rework

- Separate Werte für Drohnenleben, Geschwindigkeit, Beschleunigung und Kontaktschaden.
- Warden und Factory spielen sich klar unterschiedlich.
- Overseer und Carrier erhalten unterschiedliche Schwarmlogik.
- Repel, Attack und Recall werden sauber getrennt.

### Phase 6 – Bot-Balance

- Eigene Klassenpräferenzen für alle 21 Tanks.
- Fehlerprofile, Reaktionszeiten und Aim-Streuung pro Bot-Persönlichkeit.
- Keine sofortige perfekte Zielerfassung.
- Bots farmen, fliehen, kiten und wechseln Ziele glaubwürdig.

### Phase 7 – Öffentlicher Balance-Test

- Serverseitige anonyme Match-Metriken.
- Pickrate, Killrate, Todesrate, durchschnittliches Level und Lebensdauer pro Klasse.
- Keine automatischen Nerfs; Änderungen werden bewusst aus den Daten abgeleitet.

## Abnahmekriterien

Ein Build gilt erst als abgeschlossen, wenn:

- Typecheck, Tests und Produktionsbuild erfolgreich sind.
- Keine Klasse den festgelegten Power-Korridor ohne begründeten Trade-off verlässt.
- Farming bis Level 10 nicht frustrierend wirkt.
- Jede Klasse visuell innerhalb einer Sekunde erkennbar ist.
- Mindestens zwei echte Counter und zwei günstige Matchups pro finaler Klasse dokumentiert sind.
- Desktop und Mobile dieselben Spielregeln verwenden.

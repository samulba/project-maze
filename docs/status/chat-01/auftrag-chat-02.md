# Auftrag für Chat 02 – Server-Gameplay

**Ausgestellt: 2026-08-06 · Basis: aktueller `origin/main`**

Wucht ist gemerged. Deine Übersetzung des One-Shot-Deckels („ein voller Anlauf
verkürzt die Zeit bis zum Tod um höchstens ein Viertel" statt der unerfüllbaren
Wortlaut-Forderung) ist genau richtig und bleibt so. Ein Hinweis: Der
Viertel-Deckel-Test hing am Shape-Zufall (zwei getrennte Spiele = zwei
verschiedene Welten; eine Shape am Messpunkt verfälschte die
Zeit-bis-Tod-Messung) – 01 hat `internals.shapes.clear()` ins Setup gelegt,
bulwark vs railgun lag deshalb bei dir grün und im Integrationslauf bei 32 %.
Regel 8 gilt auch für indirekte Zufallsquellen wie den Weltzustand.

## KL4-Konzept: Familien-Upgrades (Vorschlagspaket, kein Code in shared)

Precision wartet planmäßig auf N2 (03 ist zwei Pakete davon entfernt). Die
Zwischenzeit gehört dem nächsten Baustein von Klassen 3.0:

**Jede Familie bekommt 2 familienspezifische Upgrade-Werte** (MASTERPLAN
Feld 5, „Upgrades 2.0"): Rapid Momentum-Aufbau/-Maximum · Precision
Ladetempo/Ladebonus · Control Budget/Einheitenstärke · Impact
Wucht-Skalierung/Charge-Abklingzeit.

Dein Paket ist der **durchgerechnete Vorschlag** (Statusbericht, kein Merge-
Branch nötig – außer du willst einen Prototyp hinter Flag zeigen):

1. **Protokoll:** Exakter Vorschlag für shared – wie erweitern wir
   `UpgradeLevels`/`UPGRADE_IDS`, ohne die 8 Basis-Werte und alte Clients zu
   brechen? (Optionale Familien-Slots? Eigenes Feld `familyUpgrades`?
   Bedenke Deltas + Hydrator-Statics: upgrades ist ein Statik-Feld.)
2. **Punkte-Ökonomie:** Woher kommen die Punkte für Familien-Upgrades –
   gleiche Punkte, eigene Punkte je Stufenaufstieg, oder Umbau der
   Levelkurve? Mit Zahlen: Was hat ein Level-45-Build vorher/nachher.
3. **Wirkung je Familie:** Für Rapid und Impact konkret an den existierenden
   Signatures (welche Konstante skaliert der Upgrade-Wert), für Precision/
   Control als Annahme auf Basis deiner KL1-Designs.
4. **Bot-Pfade:** Wie erweitern sich die `upgradePath`s der Stile?
5. **Balance-Leitplanke:** Kein Familien-Upgrade darf ein Basis-Upgrade
   strikt dominieren – wie prüfen wir das im Report?

Statusbericht wie gehabt nach `docs/status/chat-02/`.

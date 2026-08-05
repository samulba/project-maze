# Auftrag für Chat 02 – Server-Gameplay

**Ausgestellt: 2026-08-06 (2. Fassung) · Basis: aktueller `origin/main`**

Dein KL4-Konzept ist angekommen und überzeugt – vor allem, weil du die
naheliegende Variante durchgerechnet und dann verworfen hast. Ein Punkt, der
0,4× eines `reload`-Punkts wert ist, wäre ein toter Slot gewesen.

## Entscheidungen der Zentrale (verbindlich)

1. **Variante B ist angenommen.** Der heutige Signature-Festwert wandert in
   die Punkte-Ökonomie: kleiner Sockel plus Punkte, wie von dir gerechnet
   (RAPID 0,08 + 0,034/Punkt, IMPACT 0,50 + 0,19/Punkt). Ja, das ändert
   rückwirkend, wie sich Rapid und Impact **ohne** Investition anfühlen – das
   ist der Preis dafür, dass die Familien-Upgrades überhaupt eine Wirkung
   haben dürfen. Sam beurteilt Momentum und Wucht ohnehin gerade erst; wenn
   sich der Sockel zu schwach anfühlt, korrigieren wir ihn nach seinem
   Urteil, nicht vorher auf Verdacht.
2. **Die Shared-Änderung ist freigegeben.** Zwei familienneutrale IDs
   (`signatureRate`, `signaturePower`) werden an `UPGRADE_IDS` angehängt, mit
   `UpgradeLevels` und `EMPTY_UPGRADES` an den drei bekannten Stellen. Bau das
   selbst in `packages/shared` – schneller als der Umweg über 01. Bedingung:
   die 8 Basis-IDs behalten ihre Reihenfolge und ihre Indizes, damit die
   Hydrator-Statik und die Deltas nicht brechen.
3. **Die Endlosschleifen-Absicherung in `spendBotPoints` gehört ins selbe
   Paket** – nicht vorab, nicht separat. Du hast recht, dass sie kein
   Drive-by-Commit sein soll; sie ist aber Teil derselben Änderung, weil erst
   die Familiensperre den Aufhänger erzeugt.

## Das Paket: KL4 Server-Seite

1. Familiensperre in `applyUpgrade` (kein Slot ohne passende Familie kaufbar,
   Core gesperrt), Skalierung an Momentum und Wucht nach deinen Zahlen.
2. Bot-Pfade erweitern – Slots auf Position 2 und 4, sonst erreichen die Bots
   sie bei 44 Punkten nie.
3. Precision und Control bekommen ihre IDs schon jetzt, wirkungslos bis ihre
   Signatures stehen.
4. Report-Block `FAMILIEN-UPGRADES — DOMINANZPRUEFUNG` mit deinen Schwellen
   (< 0,5 tot · 0,5–1,2 ok · > 1,2 dominant).
5. Tests: One-Shot-Deckel über alle acht Stufen, kein Slot ohne Familie.

Hinter Flag (`FAMILY_UPGRADES_ENABLED`, Default aus), wie üblich.

## Zwei Zulieferungen von außen

- **03 baut die UI-Seite** (Tastenbelegung `Digit0` auf Index 9, Beschriftung
  der zwei neuen Knöpfe, Core-Sperre sichtbar) – steht in deren Auftrag. Wenn
  dein Server-Teil zuerst fertig ist, ist das kein Problem: ohne Flag ändert
  sich nichts.
- **04 aus der Lastprobe, für dich relevant:** Der Projektiltempo-Dämpfer
  kostet rund 0,023 ms je Projektil, hochgerechnet +0,40 ms – anderthalb
  Prozentpunkte Tickbudget. **Kein Kapazitätsproblem**, die Frage ist damit
  beantwortet. Wenn du die exakte Zahl willst, sag Bescheid: dann genehmige
  ich ein temporäres Flag am Dämpfer für einen A/B-Lauf. Von sich aus baut
  04 das nicht.
- **Werkzeugregel von 04:** Die eigene Spieler-ID immer aus `snapshot.selfId`
  lesen, nie aus der `welcome`-Nachricht. Mit `SHORT_NET_IDS` (live an!) sind
  die beiden verschieden – daran ist der Lasttest blind geworden.

Statusbericht wie gehabt nach `docs/status/chat-02/`.

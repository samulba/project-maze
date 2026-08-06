# Auftrag für Chat 02 – Server-Gameplay

**Ausgestellt: 2026-08-06 (2. Fassung) · Basis: aktueller `origin/main`**

> Neu im Chat? Lies zuerst `docs/status/chat-02/UEBERGABE.md` – Rolle, Regeln
> und die Fallen, die uns schon Zeit gekostet haben. Danach diese Datei.

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

## VORRANG (Sam, 06.08. live): Die Kugeln sind viel zu schnell

Wörtlich: *„die KUGELN sind noch immer VIEL VIEL VIEL zu schnell, umso stärker
man wird umso langsamer müssen auch die Kugeln werden, sonst ist das komplett
unfair – und die sind overall einfach viel zu schnell!"*

Das ist Sams Urteil aus dem Livespiel und schlägt KL4. Zwei getrennte
Forderungen, verwechsle sie nicht:

1. **Grundtempo runter, spürbar.** Der Dämpfer steht heute bei `0.75`
   (Precision `0.9`) in `projectileSpeedScaleFor`. Er hat nicht gereicht.
   `projectileLife` wird im selben Maß verlängert, die Reichweite bleibt also
   konstant – das Muster hältst du bei.
2. **Umkehr der Skalierung: Wer stärker wird, verschießt langsamere Kugeln.**
   Heute ist es genau andersherum – `projectileSpeed` als Upgrade rechnet
   `(1 + upgrades.projectileSpeed * 0.04)`, also schneller mit jedem Punkt.
   Sams Begründung ist Fairness: Gegen einen hochgelevelten Gegner ist eine
   schnelle Kugel nicht mehr ausweichbar.

**Das ist ein Eingriff ins Fundament, deshalb will ich vor dem Code deinen
Kopf:** Ein Upgrade, das den eigenen Wert *verschlechtert*, ist ein toter Slot –
dasselbe Argument, mit dem du die naheliegende KL4-Variante verworfen hast.
Denkbare Auflösungen, deine Wahl und deine Zahlen:

- `projectileSpeed` wird zu „Reichweite/Präzision" umgedeutet und das Tempo
  koppelt an Level statt an das Upgrade,
- oder das Upgrade fällt weg und der Slot wird neu belegt,
- oder Tempo skaliert mit Level nach unten und das Upgrade bremst diesen
  Abfall, statt ihn umzukehren.

Liefer mir **erst eine kurze Analyse mit Zahlen** (wie heute, wie nach deinem
Vorschlag, was das für Ausweichbarkeit und Trefferquote bedeutet), dann den
Code. Hinter Flag, Default aus, wie üblich. Wenn du eine Messung dafür baust:
Formen vorher wegräumen, sie wachsen während des Laufs nach.

KL4 (unten) bleibt danach dran, nicht gestrichen.

## Danach: KL4 Server-Seite

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

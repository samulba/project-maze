# Auftrag für Chat 02 – Server-Gameplay

**Ausgestellt: 2026-08-06 (3. Fassung) · Basis: aktueller `origin/main`**

> Neu im Chat? Lies zuerst `docs/status/chat-02/UEBERGABE.md` – Rolle, Regeln
> und die Fallen, die uns schon Zeit gekostet haben. Danach diese Datei.

KL4 ist gemerged (588 Tests grün auf `main`). Zwei Dinge daraus haben mich
überzeugt: dass die Familiensperre **auch ohne Flag** hängt – die Slots wären
sonst allein durch die Shared-Erweiterung kaufbar gewesen, gefunden von deinem
eigenen Test –, und `FAMILY_UPGRADE_BRANCHES`, das die Slots nur für Familien
öffnet, deren Signature wirklich läuft. Ein Punktegrab wäre schlimmer gewesen
als ein fehlendes Feature. Auch die Korrektur am Konzept (Impact-Festwert bei
6 Punkten, nicht bei 5) ist notiert.

**Deine Betriebswarnung ist angekommen und weitergegeben:**
`FAMILY_UPGRADES_ENABLED=true` bleibt aus, bis 03 die `Digit0`-Zuordnung
geliefert hat. Sam weiß es.

## Das Paket: Projektiltempo (Sams Vorrang, den du noch nicht gesehen hast)

Diese Anweisung lag noch nicht in Git, als du angefangen hast – kein Versäumnis
von dir. Sie ist jetzt das Wichtigste, was du bauen kannst. Sam, wörtlich, nach
einer Livepartie:

> *„Die KUGELN sind noch immer VIEL VIEL VIEL zu schnell, umso stärker man wird
> umso langsamer müssen auch die Kugeln werden, sonst ist das komplett unfair –
> und die sind overall einfach viel zu schnell!"*

Zwei getrennte Forderungen, verwechsle sie nicht:

**1. Grundtempo runter, spürbar.** Der Dämpfer steht bei `0.75` (Precision
`0.9`) in `projectileSpeedScaleFor`. Er hat nicht gereicht. `projectileLife`
wird im selben Maß verlängert, die Reichweite bleibt also konstant – das Muster
hältst du bei.

**2. Umkehr der Skalierung: Wer stärker wird, verschießt langsamere Kugeln.**
Heute ist es genau andersherum – `projectileSpeed` rechnet
`(1 + upgrades.projectileSpeed * 0.04)`, also schneller mit jedem Punkt. Sams
Begründung ist Fairness: Gegen einen hochgelevelten Gegner ist eine schnelle
Kugel nicht mehr ausweichbar.

**Ich will vor dem Code deinen Kopf.** Ein Upgrade, das den eigenen Wert
verschlechtert, ist ein toter Slot – dasselbe Argument, mit dem du die
naheliegende KL4-Variante verworfen hast. Denkbare Auflösungen, deine Wahl und
deine Zahlen:

- `projectileSpeed` wird zu „Reichweite/Präzision" umgedeutet, das Tempo
  koppelt an Level statt an das Upgrade,
- oder der Slot fällt weg und wird neu belegt,
- oder das Tempo fällt mit dem Level und das Upgrade **bremst diesen Abfall**,
  statt ihn umzukehren.

Liefer **erst eine kurze Analyse mit Zahlen** – wie heute, wie nach deinem
Vorschlag, was das für Ausweichbarkeit und Trefferquote bedeutet –, dann den
Code. Hinter Flag, Default aus.

Zwei Dinge, die du dabei im Blick behältst:

- **Precision zahlt pro Fehlschuss eine ganze Ladephase.** Das war deine eigene
  Begründung für den milderen Dämpfer dort. Eine Umkehr, die Precision hart
  trifft, macht die Familie unspielbar – nenn die Zahl für sie getrennt.
- **Bots schießen auch.** Wenn die Kugeln langsamer werden, treffen die Bots
  schlechter, und das Pacing verschiebt sich still. Sag im Bericht, was deine
  Messung dazu zeigt.

Für eine Messung: Formen vorher wegräumen (`internals.shapes.clear()`), sie
wachsen während des Laufs nach.

Statusbericht wie gehabt nach `docs/status/chat-02/`.

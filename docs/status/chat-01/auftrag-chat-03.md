# Auftrag für Chat 03 – Client/UX

**Ausgestellt: 2026-08-06 (6. Fassung) · Basis: aktueller `origin/main`**

> Neu im Chat? Lies zuerst `docs/status/chat-03/UEBERGABE.md` – Rolle, Regeln,
> Design-Richtung und die Fallen, die uns schon Zeit gekostet haben. Danach
> diese Datei.

## VORRANG: Die UI ist an mehreren Stellen kaputt – finde heraus, wo

Sam, wörtlich und sichtlich genervt:

> *„ES GIBT VIELE UI PROBLEME z.B. beim aussuchen der klasse etc etc"*

Mehr Beschreibung gibt es nicht, und ich habe sie auch nicht. **Das ist der
Auftrag: Finde sie selbst.** Sam soll nicht Fehlerlisten schreiben müssen – er
spielt, und was ihm auffällt, hätte uns vorher auffallen müssen.

### Wie ich das gemacht haben will

**1. Klassenwahl zuerst**, weil er sie als einziges Beispiel genannt hat. Sie
erscheint auf Level 10 mitten im Spiel, unter Beschuss, und ist damit die
unbarmherzigste UI, die wir haben. Geh sie vollständig durch: Erscheinen und
Verschwinden, Tastatur und Maus, Fenster und Vollbild, während der Ladeschuss
gehalten wird, während der Death-Screen kommt, mit langen Klassennamen, auf
21:9 und auf 4:3, mit und ohne den neuen Sichtfeld-Modus. Und: Was passiert,
wenn man **nicht** wählt? Was, wenn man währenddessen stirbt?

**2. Danach der Rest im selben Verfahren.** Upgrade-Panel, Death-Screen,
Startscreen, HUD-Elemente, die Overlays untereinander. Der Verdacht, den ich
habe: Wir haben in den letzten Runden viel angebaut – Grafikstufe, Vollbild,
Sichtfeld-Modus, Vorhersage-Schalter, Familien-Slots, Ladebalken, geschrumpfter
Death-Screen – und **jedes Stück einzeln geprüft, nie alle zusammen**. Genau
dort sitzen die Fehler: zwei Overlays gleichzeitig, ein Panel, das über einem
anderen liegt, ein Zustand, den es vorher nicht gab.

**3. Schreib auf, was du findest, bevor du reparierst.** Eine Liste mit
Reproduktionsweg je Fehler, nach Schwere sortiert. Dann reparierst du von oben.
Wenn du nicht alles schaffst: Der Rest steht in der Liste und ist damit nicht
verloren.

**4. Nimm die Screenshot-Pipeline** (`docs/SCREENSHOT_PIPELINE.md`, Chromium
ist da). Ein Fehler, den du im Bild zeigen kannst, ist ein Fehler, über den Sam
nicht diskutieren muss.

**Kein Bug ohne Test**, wo es geht. Wir haben diese Runde gesehen, dass Messen
schlägt Vermuten – deine 24 Übergänge haben meine falsche Diagnose gekippt.
Dasselbe Verfahren, andere Baustelle.

## Befund 2 ist erledigt – gut gemacht

Der Startscreen trägt jetzt zwei Bedienelemente statt zwölf, die vier
Unterseiten haben denselben Aufbau, Escape geht zurück und der Fokus wandert
mit. Die Entscheidung zum Gastfall war die beste am Paket: Die
Achievements-Galerie steht auch ohne Login vollständig da, gesperrt und mit
Bedingung unter jedem Namen – zu sehen, was es zu holen gibt, ist für einen
Gast wertvoller als eine leere Seite. Damit sind **alle fünf** Live-Befunde von
Sam abgearbeitet, bis auf die UI-Fehler oben.

## Was seit deinem letzten Paket auf main dazugekommen ist

- **Drei Serverfeatures stehen jetzt auf Default an** (01, heute):
  Projektiltempo 2.0, Familien-Upgrades und der Precision-Ladeschuss. Sie waren
  als Opt-in gebaut und sind deshalb nie bei Sam angekommen. Für dich heißt
  das: **Die Familien-Slots und der Ladebalken sind ab jetzt im normalen Spiel
  sichtbar**, nicht nur mit gesetztem Schalter. Genau die Art frischer
  Zustandskombination, die in der Fehlersuche oben ganz oben stehen sollte.
- **Die Bezeichnungen für die Precision-Slots von 02:** `signatureRate` =
  Ladetempo, `signaturePower` = Ladewucht.

Statusbericht wie gehabt nach `docs/status/chat-03/`.

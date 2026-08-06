# Auftrag für Chat 03 – Client/UX

**Ausgestellt: 2026-08-06 (3. Fassung) · Basis: aktueller `origin/main`**

> Neu im Chat? Lies zuerst `docs/status/chat-03/UEBERGABE.md` – Rolle, Regeln,
> Design-Richtung und die Fallen, die uns schon Zeit gekostet haben. Danach
> diese Datei.

N2 ist gemerged (628 Tests grün). Zwei Dinge daran waren richtig gut: Du hast
`ACCELERATION_SCALE` aus `packages/shared` importiert statt die Zahl
abzuschreiben – genau die Falle, die ich zwei Runden vorher in der Doku
entschärft habe –, und du hast gegen den **echten** Server gemessen statt gegen
eine Annahme. Dass der Rechenfehler bei ~3 Einheiten stehen bleibt, während der
eingesparte Rückstand mit der Latenz wächst, ist die Zahl, die das Paket
rechtfertigt. Auch der Schalter im Startscreen statt in einer ENV-Variable war
die richtige Entscheidung.

**Eine Naht habe ich beim Merge zusammengesetzt:** Du hast auf `de7546c` gebaut,
also vor 02s KL4. Deren neue Upgrade-IDs `signatureRate`/`signaturePower`
fehlten im Testobjekt von `prediction.test.ts` und brachen den Typecheck. Kein
Vorwurf – sie existierten nicht, als du angefangen hast.

**Dein `Digit0`-Fix hat eine Betriebssperre gelöst:** 02 hatte gewarnt, dass
`FAMILY_UPGRADES_ENABLED` ohne ihn ein Rückschritt gewesen wäre – die Spieler
hätten Signature-Stärke verloren und über die Tastatur nicht zurückkaufen
können. Jetzt darf der Schalter umgelegt werden.

## Design: Der helle Look ist zurückgebaut

Falls du noch vom „Diep-Look" liest – Geschichte. Sam hat den hellen Grundlook
live gesehen und verworfen, **01 hat ihn am 06.08. zurückgebaut**. Grundlook
ist wieder dunkel (`--bg:#151a26`, `--text:#e8ebf3`, Akzent `#6f7ad6`), kein
`STYLE`-Block und kein `darken()` im `renderer.ts`.

Deine Flächen haben den Rückbau **von selbst überstanden**, weil sie an den
Theme-Variablen hängen – ich musste sie nicht anfassen. Genau deshalb: weiter
über die Variablen gehen, nie über Festwerte.

## Das Paket: Sams drei Live-Befunde

Die hier lagen noch nicht in Git, als du angefangen hast. Sie sind jetzt das
Wichtigste, was du bauen kannst – vor allem weiteren.

### 1. Die Ränder – und es ist ein Bug, keine Grundsatzfrage

Sam: *„die Ränder links rechts sind jetzt nur noch fetter ingame, das ist nicht
responsive!"* – und im Nachtrag: *„immer wenn ich Vollbildmodus wechsle oder in
keinem bin, gibt es die – also es gibt viele Bugs."*

Das verschiebt die Diagnose weg von der Ultrawide-Frage hin zu **R1s
Viewport-Härtung, die nicht hält**. Ich habe es bei 2560×1080 nachgestellt: Das
Spielfeld steht als schmale Spalte in der Mitte, links und rechts je rund ein
Viertel tote Fläche.

**Fang bei der Reproduktion an, nicht beim Umbau.** Rein ins Vollbild, raus,
im Fenster, Fenstergröße ziehen, Zoomstufe wechseln, zweiter Monitor. Sag im
Bericht, welcher Weg die Bänder erzeugt und warum. Mein Verdacht ist eine
Reihenfolge zwischen `fullscreenchange` und dem Neuberechnen von Auflösung,
Maske und Letterbox – aber das ist geraten, und du misst es.

Drei Dinge gehören dabei mit auf den Tisch:

1. **Das HUD hängt am Fenster, nicht am Spielfeld.** Deshalb landen
   Spielerkarte, Killfeed, Bestenliste und Minimap in der toten Fläche, sobald
   es eine gibt. Das ist unabhängig von der Ursache falsch.
2. **Die Grundsatzfrage bleibt offen:** Der Masterplan begründet die feste
   16:9-Sicht mit Fairness (wer breiter sieht, sieht Gegner früher). Wenn deine
   Messung zeigt, dass die Bänder auch bei korrektem Verhalten bleiben, sag
   mir, was du für richtig hältst.
3. **Kein Bug ohne Test.** Was reproduzierbar ist, wird festgenagelt.

### 2. Der Startscreen wird eine Navigation

Sam: *„der HOMESCREEN – dass man da direkt alle Achievements + Leaderboard
sieht, ist komplett kake. Die sollten alle geile cleane Unterseiten bekommen,
genauso wie Profil, Einstellungen etc. Nicht alles auf eine Seite
reinballern."*

Der Startscreen ist über K2, A4 und die Achievements-Galerie zu einer langen
Seite gewachsen. Start bleibt Logo, Name und **ARENA BETRETEN** – nichts sonst.
Alles andere wird eine eigene, ruhige Unterseite (Profil · Achievements ·
Bestenliste · Einstellungen). Das ist dein Revier und deine Handschrift; ich
gebe dir keine Kästchen vor. Zwei Auflagen: Der Weg ins Spiel wird **nicht**
länger als heute, und die Unterseiten laufen über die Theme-Variablen.

### 3. Der Death-Screen verdeckt den Zuschauermodus

Sam: *„‚du siehst Killer zu' funktioniert nicht so geil, weil ja drüber immer
das Popup ist und ich gar nichts sehe."*

Auf seinem Screenshot bestätigt: Das Banner „DU SIEHST NOVA ZU" steht oben,
aber die große ELIMINIERT-Karte liegt mittig und verdeckt genau das, was man
sehen soll. Der Modus ist so funktionslos. Löse den Konflikt – Karte kompakt an
den Rand, oder sie zieht sich nach ein paar Sekunden zusammen, oder Zuschauen
ist ein bewusster Schritt aus dem Death-Screen heraus. Respawn und „ZUM
STARTSCREEN" müssen jederzeit erreichbar bleiben.

## Schnitt

Das sind drei Pakete in einem. **Wenn es zu groß wird: die Ränder zuerst** –
das ist ein Bug, der jeden Spieler bei jedem Vollbildwechsel trifft, während
die anderen beiden Verbesserungen sind. Sag im Bericht, wie du geschnitten
hast.

Statusbericht wie gehabt nach `docs/status/chat-03/`.

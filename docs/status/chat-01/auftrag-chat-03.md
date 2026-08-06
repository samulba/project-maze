# Auftrag für Chat 03 – Client/UX

**Ausgestellt: 2026-08-06 (9. Fassung) · Basis: aktueller `origin/main`**

> Neu im Chat? Lies zuerst `docs/status/chat-03/UEBERGABE.md`. Danach diese Datei.

## Kurswechsel: sichtbar vor messbar

Sam hat heute Abend gesagt, was ich hätte sehen müssen:

> *„Es passiert einfach nix. Es sind noch immer die gleichen langweiligen Tanks
> drinnen. Die UI sitzt noch immer nicht, wenn man Tanks auswählen will. Es
> fehlen auch Bilder, wenn man die Tanks auswählen will. Wir machen grad so
> viel … ich merke einfach viel zu wenig davon."*

Er hat recht, und die Schuld liegt bei mir, nicht bei dir. Ich habe die letzten
Runden auf Messbarkeit gelenkt – Prüfstände, Balance-Läufe, Telemetrie,
Deploy-Wachen –, alles richtig und nichts davon sieht man. **Ab jetzt gilt: Was
Sam sieht, geht vor.** KL3 (das Rad) verschiebt sich; es erklärt Klassen, die
zuerst überhaupt unterscheidbar aussehen müssen.

## Das Paket: die Tanks müssen verschieden aussehen

**1. Rumpfgeometrie teilen (klein, und es blockiert alles andere).**
Ich habe die Bilder auf den Wahlkarten selbst gebaut (`class-preview.ts`,
gemerged). Sie zeichnen Rohre und Drohnen aus `CLASS_DEFINITIONS`, aber **jeden
Rumpf als Kreis** – die klassenweisen Formen stehen privat in `drawClassHull`
in `renderer.ts`. Zieh die Geometrie aus dem Renderer heraus, sodass Vorschau
und Spiel dieselbe Quelle benutzen. Danach ist die Vorschau exakt.

**2. Dann der eigentliche Befund: 29 Klassen, die aussehen wie vier.**
Die Vorschau macht es unbestreitbar (Bild liegt bei Sam):

- **Sieben Impact-Klassen haben überhaupt kein Rohr** – Impact, Crusher,
  Bulwark, Juggernaut, Fortress, Blitz, Comet sind als Silhouette nicht zu
  unterscheiden.
- Die Rapid-Linie unterscheidet sich nur in der Rohrzahl.
- Control nur in der Zahl der Drohnen.
- Von 29 Klassen sticht **eine** heraus (Octo).

Gib jeder Klasse eine erkennbare Silhouette. Das ist Formsprache, nicht Farbe:
Panzerungen, Stacheln, Schilde, Kufen, unterschiedliche Grundkörper. Eine
Klasse muss aus der Entfernung an ihrem Umriss erkennbar sein – das ist
dieselbe Anforderung, die im MASTERPLAN unter „Lesbarkeit" steht, nur für den
Tank statt für die Fähigkeit.

**Bevor du baust: Screenshot an mich.** Nimm vier bis sechs Klassen, bau die
Varianten, ich lege sie Sam vor. Der Grundlook ist beschlossen und wird nicht
angefasst – aber Silhouetten sind sein Thema, und er hat heute deutlich
gemacht, dass er Ergebnisse sehen will statt Ankündigungen.

**3. Die Klassenwahl sitzt weiter nicht.** Sams Worte, nach deinem
Reparaturpaket. Dein Prüfstand meldet 63/63 – dann prüft er das Falsche oder
nicht genug. Setz dich einmal *ins Spiel* statt in die Matrix: bis Level 10
spielen, wählen, und dabei auf das achten, was eine Matrix nicht sieht –
Zeitpunkt, Größe, Lesbarkeit unter Beschuss, wohin die Augen gehen.

## Reihenfolge

1 vor 3 vor 2, weil 1 klein ist und 2 auf Sams Freigabe wartet. Wenn du merkst,
dass 2 der eigentliche Brocken ist: sag es, dann schneiden wir.

Statusbericht wie gehabt nach `docs/status/chat-03/`.

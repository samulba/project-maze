# Auftrag für Chat 03 – Client/UX

**Ausgestellt: 2026-08-06 (10. Fassung) · Basis: aktueller `origin/main`**

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

**2. Der eigentliche Auftrag: 29 Klassen, die aussehen wie vier.**

Sam hat nachgeschoben, und das ist jetzt **verbindlich im MASTERPLAN**
(„Klassen-Identität"):

> *„Mir ist extrem wichtig, dass die Tanks wirklich unique Designs haben und man
> ALLE voneinander unterscheiden kann und alle irgendwie irgendwo special
> sind."*

**Alle 29** – nicht die auffälligen, nicht die Endklassen, alle. Zwei
Anforderungen, beide zu erfüllen:

- **Unterscheidbar:** Jede Klasse ist an ihrem *Umriss* erkennbar, ohne Farbe,
  ohne Beschriftung, in Spielgröße. Formsprache statt Farbcode – andere
  Grundkörper, Panzerplatten, Stacheln, Schilde, Kufen, Aufbauten.
- **Special:** Jede Klasse hat mindestens ein Merkmal, das nur sie hat, und das
  man beschreiben kann, ohne Zahlen zu nennen. Ein Tank, der sich nur in Werten
  vom Nachbarn unterscheidet, ist nicht fertig.

**Abnahme ist der Blindtest:** alle 29 Silhouetten auf einem Blatt, ohne Namen,
ohne Farbe. Wer zwei nicht auseinanderhalten kann, hat einen Befund. Das Blatt
gehört in den Statusbericht – hier zählen Bilder, keine Behauptungen.

Der heutige Stand als Ausgangspunkt (aus den Vorschaubildern): Sieben
Impact-Klassen tragen überhaupt kein Rohr und sind identisch; die Rapid-Linie
unterscheidet sich nur in der Rohrzahl; Control nur in der Zahl der Drohnen.

**Vorgehen, damit daraus kein Sammelsurium wird:**

1. **Erst ein System, dann 29 Formen.** Leg fest, woran man eine *Familie*
   erkennt (Grundkörper) und woran die *Stufe* innerhalb der Familie (was
   dazukommt: mehr Platten, größere Aufbauten, zusätzliche Elemente). Dann ist
   jede Silhouette ableitbar statt erfunden, und der Baum wird lesbar, bevor
   das Rad ihn zeigt.
2. **Sechs Beispiele als Screenshot an mich**, bevor du alle 29 baust – je
   Familie eine frühe und eine späte Klasse. Ich lege sie Sam vor. Erst bei
   seinem Ja der Rest.
3. **Die Kosten gelten weiter.** Silhouetten sind Draw-Calls; die
   Qualitätsstufen bleiben in Kraft, und im Zweifel gewinnt Flüssigkeit.
4. **Vorschau und Spiel aus derselben Quelle** – das ist Punkt 1 oben, und
   deshalb steht er davor.

**3. Die Klassenwahl sitzt weiter nicht.** Sams Worte, nach deinem
Reparaturpaket. Dein Prüfstand meldet 63/63 – dann prüft er das Falsche oder
nicht genug. Setz dich einmal *ins Spiel* statt in die Matrix: bis Level 10
spielen, wählen, und dabei auf das achten, was eine Matrix nicht sieht –
Zeitpunkt, Größe, Lesbarkeit unter Beschuss, wohin die Augen gehen.

## Reihenfolge

1 vor 3 vor 2, weil 1 klein ist und 2 auf Sams Freigabe wartet. Wenn du merkst,
dass 2 der eigentliche Brocken ist: sag es, dann schneiden wir.

Statusbericht wie gehabt nach `docs/status/chat-03/`.

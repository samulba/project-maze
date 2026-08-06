# Auftrag für Chat 02 – Server-Gameplay

**Ausgestellt: 2026-08-06 (7. Fassung) · Basis: aktueller `origin/main`**

> Neu im Chat? Lies zuerst `docs/status/chat-02/UEBERGABE.md`. Danach diese Datei.

**Dein Widerspruch ist angenommen und umgesetzt.** Dämpfer zurück auf 0,70,
Deckel auf 1,50× – deine Zahlen stehen auf `main`.

Du hattest recht an der Stelle, die ich nicht gesehen habe: Der Dämpfer auf
0,60 hat nichts verlangsamt, sondern **eingeebnet**. Dass danach acht Klassen
auf exakt demselben Tempo lagen und alle sieben Precision-Klassen ebenfalls,
war mir nicht klar – ich habe auf die Spitze geschaut und nicht auf die
Verteilung. Der Ausweich-Index von 4,6–7,3 statt 1,5 hätte Gefechte auf
mittlerer Distanz unmöglich gemacht und ausgerechnet Impact bevorteilt, die
einzige Familie, die von der Änderung gar nicht berührt wird.

Dass du das gemessen und nicht nur behauptet hast, ist der Grund, warum ich es
ohne Rückfrage übernommen habe.

## Das Paket: der weiche Deckel – und KL5 zu Ende

**1. Bau den weichen Deckel.** Dein eigener Befund: Ein harter Deckel ebnet
konstruktionsbedingt alles ein, was ihn erreicht. `cap + (damped − cap) × 0,15`
behält die Reihenfolge. Das ist eine Mechanikänderung, deshalb habe ich sie
nicht nebenbei eingebaut – sie gehört gemessen, mit deinem Ausweich-Index und
der Tempo-Spreizung als Zielgrößen, und mit einer Aussage dazu, ob der
Faktor 0,15 der richtige ist.

Diesmal **ohne neues Flag**: Das Paket ist an, und ein zweiter Schalter darüber
macht die Zustandsmatrix nur größer. Wenn du das anders siehst, sag es.

**2. KL5 zu Ende führen.** Die Nachmessung war der erste Teil. Offen bleibt die
eigentliche Frage: Ist jede Familie am Spielgefühl erkennbar, und dominiert
eine? Mit `--seed` und deinen Dominanzschwellen.

**Kontext:** 03 hat sieben UI-Fehler rund um die Klassenwahl gefunden; zwei
davon sind erst aufgegangen, weil die Familien-Slots seit heute sichtbar sind.
Falls dir beim Messen etwas auffällt, das nach Client aussieht – melden, nicht
selbst reparieren.

Statusbericht wie gehabt nach `docs/status/chat-02/`.

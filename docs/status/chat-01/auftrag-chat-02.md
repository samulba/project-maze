# Auftrag für Chat 02 – Server-Gameplay

**Ausgestellt: 2026-08-06 (8. Fassung) · Basis: aktueller `origin/main`**

> Neu im Chat? Lies zuerst `docs/status/chat-02/UEBERGABE.md`. Danach diese Datei.

Der weiche Deckel ist gemerged, und dass du deinen eigenen Vorschlag von 0,15
auf 0,06 korrigiert hast, weil die Ordnung schon ab 0,04 vollständig zurück ist
und mehr Weichheit nur Tempo an der Spitze kauft, war genau richtig.

## Kurswechsel: sichtbar vor messbar

Sam heute Abend:

> *„Es passiert einfach nix. Es sind noch immer die gleichen langweiligen Tanks
> drinnen … wir machen grad so viel … ich merke einfach viel zu wenig davon."*

Er hat recht, und es liegt an meiner Steuerung. Ich habe dich zuletzt auf
Messungen gesetzt – notwendig, sauber gemacht, und für ihn unsichtbar. **KL5
wird deshalb angehalten**, nicht verworfen: Die Zahlen sind gut aufgehoben,
solange niemand nach ihnen handelt.

## Das Paket: Handlungsfeld 3 – Fähigkeiten müssen nach Absicht aussehen

Der Punkt aus dem MASTERPLAN, der **noch nie angefasst wurde**, und der einzige
mit einer wörtlichen Beschwerde als Anlass: *„Ein Dash von Gegnern sieht aus
wie ein Teleport-Bug."*

Der sichtbare Teil ist 03s Arbeit (Trails, Nachbilder, Staubpuff). Deiner ist
die Voraussetzung: **Der Client kann eine Fähigkeit nur zeichnen, wenn er
weiß, dass und wie sie stattfindet.**

1. Geh die Module und Signatures durch und sag mir, was heute im Snapshot steht
   und was fehlt. Für den Dash zum Beispiel die Richtung – F2 im MASTERPLAN
   nennt genau das als offene Wire-Erweiterung.
2. Liefer einen **exakten Vorschlag** für die fehlenden Felder: Namen, Typen,
   Verhalten unter `SNAPSHOT_DELTAS`, Kosten je Snapshot. Deine Vorschläge
   waren bisher immer einbaufertig; halt das so.
3. Wo etwas serverseitig fehlt, damit eine Fähigkeit überhaupt lesbar sein
   *kann* – etwa ein Zeitfenster, das zu kurz ist, um es zu zeichnen –, sag es
   dazu. Das ist dein Urteil, nicht 03s.

**Halt es klein und schnell.** Ich brauche das Ergebnis, damit 03 zeichnen
kann; ein Paket mit drei Feldern und einer klaren Ansage ist mir lieber als
eine vollständige Analyse in zwei Tagen.

Wenn KL5 Ergebnisse hat, die eine Balance-Änderung nahelegen, nenn sie in einem
Absatz – aber bau sie nicht, bevor Sam den nächsten Stand beurteilt hat.

Statusbericht wie gehabt nach `docs/status/chat-02/`.

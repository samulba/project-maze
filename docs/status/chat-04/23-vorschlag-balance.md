# 23 – Vorschlagspapier: Sams Balance-Liste

| | |
| --- | --- |
| **Auftrag** | Sam (13.08., per Rückfrage): die Balance-Befunde aus Bericht 19/21 als entscheidbares Papier |
| **Grundlage** | Bestätigte Zahlen aus Bericht 19 (Details je Befund dort) und Bericht 21, Abschnitt 4 |
| **Status** | Vorschläge – **nichts ist umgesetzt.** Jeder Punkt einzeln entscheidbar; alle Kurven-Eingriffe liegen in `packages/shared` und sind damit unit-testbar |

Sortiert als **eine Geschichte des Laufs**: Ankunft → erste Wahl → Mitte →
Ende. Die Punkte 1–3 hängen zusammen (alle an `xpThresholdForLevel`) und
sollten als EIN Paket entschieden werden – dreimal einzeln an derselben
Kurve zu drehen erzeugt dreimal Migrationslärm.

## 1. Ankunft: erste Klassenwahl nach 2 s (25) + Anfängerschutz 6 s (30)

**Lage:** Level 5 kostet 507 XP; eine Pentagon zahlt 600. Die wichtigste
Entscheidung des Spiels (acht Familienkarten) fällt nach zwei Sekunden,
während das Onboarding noch „Beweg dich" zeigt. Der Spawnschutz endet nach
6 s oder bei der ersten Eingabe.

**Vorschlag:** Additiver Sockel auf den ersten zehn Stufen
(`xpThresholdForLevel` + ~900·L für L ≤ 10) → erste Familienwahl nach
45–60 s Farmen, Kurve oben unangetastet. Anfängerschutz an Fortschritt
statt Zeit koppeln (endet bei Level 3 oder erster Abgabe eines Schusses
auf einen Spieler), sonst läuft er ab, bevor der Gestreckte überhaupt
kämpft.

**Messung:** first-run-probe (Zeit bis Level 5, heute 2,0 s; Ziel 45–60 s)
+ bestehende Kurven-Unit-Tests in shared.

## 2. Mitte: Kosten ×102 gegen Durchsatz ×1,8 (31) + Elite-Bonus (32)

**Lage:** Die Levelkosten wachsen über den Lauf um Faktor 102, der
Farm-Durchsatz nur um 1,8 – jedes Level dauert länger, ohne dass neue
Quellen aufgehen. Der Elite-Festwert-Bonus belohnt zusätzlich das
Formen-Farmen, also das Gegenteil des Kill-Fortschritts (Befund 16).

**Vorschlag:** Nicht die Kurve flacher machen, sondern den Durchsatz
mitwachsen lassen: Kill-XP skaliert bereits mit dem Opferlevel
(130 + 18·L) – der Formen-Ertrag könnte mild mit dem EIGENEN Level
skalieren (z. B. ×(1 + L/60)), damit die Mitte trägt. Elite-Bonus vom
Festwert auf einen Anteil des Formenwerts umstellen, damit er nicht
relativ zur Kurve verhungert bzw. früh dominiert.

**Messung:** Sekunden je Level bei konstantem Farmen (Skript nach dem
Muster von messung-63; heute 20,7 s → 37,3 s zwischen L42 und L60).

## 3. Ende: 61 % Kurve ohne Inhalt (26) + Ziel-Leiter (59) + Tore mit einer Karte (27)

**Lage:** Nach dem letzten Klassentor (L42) kommen 103.096 XP = 61 % des
Laufs ohne jede Freischaltung; höchstes je gemessenes Level: 47. Zwischen
Level 19 und 60 nennt das Spiel kein Ziel. Die Tore L28 und L42 haben
genau eine Karte – die teuersten „Entscheidungen" sind Bestätigungsknöpfe.

**Vorschlag:** Ehrlichste Variante: `GAME.maxLevel` auf 45 – die Kurve
endet, wo Inhalt und Messung enden. Wer die 60 behalten will, braucht
die Leiter: Meilenstein-Erfolge (L20/30/45, gehört zu Befund 50) und ein
echtes Tor bei ~50. Für 27: die 24 Stufe-3-Klassen so umhängen
(`parent`), dass jede Stufe-2 mindestens zwei Kinder hat – reine
Datenänderung in shared, der Baum-Test erzwingt Konsistenz.

**Messung:** Anteil der Läufe, die je L42+ erreichen (persistente Runs,
sobald Migration live); Klassenabdeckung je Sitzung.

## 4. Bot-Dichte fürs Alleinsein (18)

**Lage:** 18 Bots auf 9000×6000 – ein Neuling ist ~70 % der Zeit allein
im Bild. GOAL.md lässt die Zielzahl offen; der Direktor kann bereits
nachschieben, tut es bei einem Menschen aber nicht
(`targetBotCount(1) = 18 = BOT_COUNT`).

**Vorschlag:** Kein globales „mehr Bots", sondern Dichte um Menschen:
Der Direktor hält in einem Radius (~1.500 px) um jeden Menschen eine
Mindestzahl (2–3) und schiebt gezielt dort nach. Schnitt (a) hat die
Angreiferzeit bereits von 19 % auf 41 % gehoben – **erst spielen**, dann
entscheiden, ob Dichte überhaupt noch fehlt.

**Messung:** messung-71b (Anteil Zeit ohne Angreifer, heute 59 %).

## 5. Pips und tote Zahl (34, 0,45-vs-0,5)

**Lage:** Das Upgrade-Panel zeichnet 120 Pips (12 Slots × 10), aber ein
Lauf hat maximal 59 Punkte – 61 Pips sind nie füllbar. Und in game.ts
liegt weiter die tote 0,45-Score-Fassung neben der wirksamen 0,5
(`respawnScoreFrom`, combat-tuning).

**Vorschlag:** 34 ist eher Anzeige als Balance: Pips je Slot auf das
tatsächlich Erreichbare deckeln oder die Restpunkte anzeigen („noch 12
Punkte in diesem Lauf"). Die 0,45 ist eine Ein-Zeilen-Entscheidung:
entweder die Basis auf `respawnScoreFrom` umstellen (dann gibt es genau
eine Quelle) oder die 0,45 bewusst dokumentieren – heute ist sie nur
vergessen.

**Messung:** Unit-Test „kein Pip jenseits der erreichbaren Punkte";
grep-Test auf die zweite Zahlenquelle.

## Empfohlene Reihenfolge

1. **Erst spielen** (Schnitt a + neue Familien sind frisch) – Punkt 4
   hängt direkt davon ab.
2. Dann Paket 1 (Ankunft) – kleinste Änderung, größter
   Erste-Minuten-Effekt, first-run-probe misst es.
3. Dann Paket 3 (Ende) entscheiden – maxLevel 45 ist die billigste
   ehrliche Variante, alles andere ist Content-Arbeit.
4. Paket 2 und 5 sind unabhängig und jederzeit einzeln machbar.

# 22 – Vorschlagspapier: Bot-Schwierigkeits-Paket (71, 72, 73, 76, 77, 78)

| | |
| --- | --- |
| **Auftrag** | Sam (12.08., per Rückfrage): „Vorschlagspapier schnüren" für die sechs bestätigten Balance-Befunde der Bot-Gruppe |
| **Grundlage** | Die Messwerte aus Bericht 21, Abschnitt 5; Gegenproben in `scripts/messungen/` |
| **Status** | Vorschläge – **nichts davon ist umgesetzt.** Jeder Punkt ist einzeln entscheidbar; die Defekte 75/79 sind bereits gefixt und hier nicht mehr enthalten |

Reihenfolge nach Wirkung aufs Spielgefühl, nicht nach Aufwand. Jeder Punkt
nennt: Eingriff, erwartete Wirkung, Gegenprobe, Risiko.

## 1. Befund 71 – Aggressionswurf einmal je Gefecht (Aufwand: klein)

**Eingriff:** In `bot-brain.ts` den Wurf `Math.random() < styleAggression`
überspringen, wenn `bot.targetId` bereits auf diesen Menschen zeigt – das
Ziel hält dann bis huntTimeout, Sichtverlust, Tod oder `calmUntil`. Genau
die Bedeutung, die der Kommentar an `styleAggression` heute schon behauptet.

**Erwartete Wirkung:** Farmer-Episoden steigen von Median 0,4 s auf
Sekunden; aus dem Flackern („greift der mich an?") werden lesbare Gefechte.
Die Kampfpausen bleiben, weil huntTimeout/calmUntil unverändert takten.

**Gegenprobe:** `messung-71a` – Median-Episode je Stil muss über 3 s
steigen, ohne dass die Anwesenheit über die heutigen 58 % der
Hunter/Brawler klettert. Danach `messung-71b` für die Arena-Sicht.

**Risiko:** Zusammen mit Punkt 6 (Distanz) steigt der Druck auf Anfänger –
nach dem Umbau eine Runde selbst spielen, bevor beides zusammen auf main geht.

## 2. Befund 73 – Tier ans Spielerlevel koppeln (Aufwand: mittel)

**Eingriff:** Tier nicht mehr nur bei der Geburt vergeben, sondern beim
Respawn des Bots neu bewerten, mit Fenster um das Level des besten
Menschen: darunter rookie-lastig, darüber elite-lastig. Die drei Profile
selbst bleiben unverändert; nur die Zuordnung wird lebendig.

**Erwartete Wirkung:** Der Aufstieg des Spielers zahlt sich erstmals in
Gegnern aus, die sich anders anfühlen. Kein neuer Inhalt, nur Zuordnung.

**Gegenprobe:** Erweiterung von `messung-73-tier-level`: derselbe Lauf mit
einem Level-5- und einem Level-40-Menschen muss unterschiedliche
Tier-Mischungen zeigen; heute: 0 Wechsel über 71 Tode.

**Risiko:** Respawn-gebunden bleibt es träge (gewollt – kein Gummiband).
Die 75er-Rotation muss erhalten bleiben (Test steht in bot-brain.test.ts).

## 3. Befund 76 – Feuerbremse je Familie (Aufwand: mittel)

**Eingriff:** Vor der Feuerzeile in `think` ein `feuerFrei(...)`-Haken:
SPECTER-Bots halten das Feuer unterhalb der Hinterhaltsschwelle (95) und
außerhalb der Wunschdistanz; SIEGE-Bots (seit dem 75er-Fix im Bestand!)
halten Stellung statt zu strafen, damit sich ihre Leiste füllt.

**Erwartete Wirkung:** Der Spieler sieht am Gegner erstmals die Mechanik,
die er selbst spielen soll – Verschwinden/Zuschlagen bei SPECTER, das
Festsetzen bei SIEGE. Heute: Median-Tarnung 0,0, Schwelle fällt nie.

**Gegenprobe:** `messung-76-signaturen` – SPECTER-P90 muss über 95 kommen;
der Feueranteil aller Bots (heute 83 %) darf nicht unter ~60 % fallen,
sonst wird die Arena passiv.

**Risiko:** Ein SPECTER-Bot, der wirklich aus der Tarnung zuschlägt, ist
für Anfänger ein harter Moment – gegen Level < 8 greift der bestehende
Anfängerschutz, das reicht vermutlich; beim Spielen prüfen.

## 4. Befund 72 – Bot-Pfad in Runden vergeben (Aufwand: klein)

**Eingriff:** `spendBotPoints` vergibt je Durchlauf einen Punkt pro
Pfad-Eintrag statt jeden Eintrag bis Deckel 10 zu füllen. Die Reihenfolge
bleibt als Gewichtung erhalten; ein Level-21-Bot hat dann bereits Punkte
in maxHealth statt null.

**Erwartete Wirkung:** Aufsteigende Bots werden zäher statt nur giftiger.
Heute erreichen 13 von 18 Plätzen rechnerisch nie einen HP-Punkt
(Level 72 nötig, Deckel 60).

**Gegenprobe:** Test je Stil bei Level 20/40/60: `upgrades.maxHealth > 0`
(heute für drei Stile überall rot); dazu `messung-72` Teil C.

**Risiko:** Das ist die spürbarste TTK-Änderung des Pakets – Bots sterben
langsamer. Wer die Arena heute schon zäh findet, merkt es sofort.
Empfehlung: als letzten Punkt umsetzen, einzeln spielen.

## 5. Befund 77 – Letzte bekannte Position (Aufwand: mittel)

**Eingriff:** Beim Sichtverlust die letzte bekannte Position merken, das
Ziel für die huntTimeout-Dauer behalten und dorthin fahren; erst wenn sie
erreicht ist und niemand auftaucht, `escapedUntil` setzen. Erweiterung
des vorhandenen Jagd-Timeouts, keine Wegfindung.

**Erwartete Wirkung:** Die Ecke bleibt Deckung, wird aber ein Zug im Duell
statt ein Ausschalter (heute: Zielverlust nach ~275 ms, ersatzlos).

**Gegenprobe:** `messung-77-ecke` – nach dem Schritt um die Ecke muss der
Bot ≥ 3 s am Ziel bleiben und sich der letzten Position auf < 200 px
nähern; heute Median-Zielverlust 275 ms.

**Risiko:** In Wandnähe kann das Zufahren am Stuck-Detektor zerren –
der 700-ms-Umweg sollte reichen, die Messung zeigt es.

## 6. Befund 78 – Wunschabstand aus der Klasse (Aufwand: mittel)

**Eingriff:** `preferredDistance` als Anteil der echten Reichweite
(`projectileSpeed × projectileLife`, z. B. 35–45 %), nach unten gedeckelt
durch den Stil (Brawler bleibt 80). Feuerdeckel 900/1150 und
Zielsuchweite 1050 müssen mitwachsen, sonst bindet weiter der Deckel.

**Erwartete Wirkung:** Ein Eclipse-Hunter kämpft wie ein Scharfschütze
statt auf 9 % seiner Reichweite; 65 Klassen fühlen sich beim Bekämpfen
nicht mehr wie fünf an.

**Gegenprobe:** `messung-78-reichweite` – kein Pfad unter 25 % und keiner
über 75 % des Verhältnisses Wunschabstand/Reichweite.

**Risiko:** Die größte Verhaltensänderung des Pakets: Fernkämpfer, die
wirklich auf Distanz gehen, verändern das Maze-Gefühl spürbar. Die
Sichtlinien im Labyrinth begrenzen es natürlich; trotzdem zuerst allein
umsetzen und spielen, nicht im Bündel.

## Empfohlene Schnitte

Nicht alles auf einmal: **(a)** 71 + 77 zusammen (beide machen Gefechte
lesbar, beide klein messbar), spielen; **(b)** 76 + 73 (Familien sichtbar,
Kurve lebendig), spielen; **(c)** 72 und 78 einzeln, je mit eigener Runde.
Nach jedem Schnitt die betroffenen Messungen aus `scripts/messungen/`
gegen die Zahlen in Bericht 21 stellen – nicht gegen das Gefühl.

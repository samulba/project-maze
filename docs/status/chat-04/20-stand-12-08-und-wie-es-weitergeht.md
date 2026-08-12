# 20 – Stand vom 12.08. und wie es weitergeht

| | |
| --- | --- |
| **Auftrag** | Sam: „RICHTIG STARKE ANALYSE des KOMPLETTEN CODES – Bugs finden, fixen, schauen was das Spiel noch schlecht macht" |
| **Branch** | `main` (Sam: „immer auf main pushen") |
| **Basis** | `e8ba512` |
| **Tests** | `npm run check` grün – 72 Dateien, **1001 Tests**, dreimal hintereinander |
| **Status** | **abgeschlossen und gepusht** – bis auf das Rohmaterial in Bericht 19 |

Dieses Dokument ist der Einstieg für die nächste Sitzung. Es sagt, was heute
passiert ist, was daraus folgt und womit anzufangen ist.

## 1. Was heute gelaufen ist

Zwei Analysen, beide mit sieben unabhängigen Suchern und einem Skeptiker je
Befund.

**Analyse A (Bugs): abgeschlossen.** 30 Befunde, 14 hielten der Gegenprüfung
stand, alle 14 behoben und einzeln per Sabotage belegt. Die schwersten:

* **Der Beitritt war zwei Stunden lang kaputt.** Die Layout-Reparatur vom
  Vortag setzte den Respawn-Knopf in eine neue Leiste; `insertBefore` gegen
  einen Knopf, der kein direktes Kind mehr war, warf mitten im Welcome-Zweig,
  und `input.setEnabled(true)` wurde nie erreicht. Startscreen weg, HUD da,
  Tank unbeweglich. Im Browser gegen beide Stände gemessen: „VERBINDE" gegen
  „MAZERS ALPHA". **996 Unit-Tests waren grün, 196 Layout-Fälle auch.**
* Royale: Der Guardian konnte gewinnen; der Direktor holte Ausgeschiedene
  zurück; Runde 2 war vorentschieden (L41-Gatling gegen ein Feld aus L20-Core);
  wer später kam, war 4263 Einheiten außerhalb und nach 5,7 s tot.
* Das Klassenrad log über 48 von 65 Klassen; ein abgelehnter Beitritt beendete
  die Sitzung; ein stiller Verbindungsabbruch ließ einen Geist-Tank bis zu 60 s
  weiterfeuern; AEGIS lud am langsamsten, wenn es am meisten einsteckte.
* **Zwei Zusicherungen in `docs/GOAL.md` waren falsch** – und beide haben
  Befunde gedeckt statt sie zu verhindern (die Kettenanalyse und die
  Familientabelle). Beide korrigiert und mit gezählten Zahlen belegt.

**Analyse B (Spielgefühl): Rohmaterial.** Sieben Sucher, **79 Befunde**, davon
acht gegengeprüft, als die Sitzung endete. Alles in
[`19-rohbefunde-spielgefuehl.md`](19-rohbefunde-spielgefuehl.md). Sechs davon
sind bereits behoben (siehe unten).

## 2. Was heute zusätzlich entstanden ist

**Gemessen statt gelesen** ([Bericht 18](18-erste-minuten-gemessen.md)): Vier
Läufe im Browser mit einem Skript, das sich wie ein Anfänger benimmt.

| | höchstes Level | Ende | Tode | Kills |
| --- | --- | --- | --- | --- |
| Lauf 1 | 5 | LVL 2 · 81 Score | 1 | **0** |
| Lauf 2 | 3 | LVL 2 · 29 Score | 3 | **0** |
| Lauf 3 | 19 | LVL 9 · 1.020 Score | 2 | 1 |
| Lauf 4 | 5 | LVL 2 · 72 Score | 2 | **0** |

Drei von vier töten in fünf Minuten nichts. Der Weg zur ersten Klasse ist eine
Lotterie (Level 5 nach 11 s bzw. 146 s bei identischem Verhalten). Und in
Lauf 4 war die Klasse siebzehn Sekunden nach der Wahl wieder weg.

**Drei neue Instrumente:**

* `npm run first-run-probe` – macht diese Messung wiederholbar. Fällt nicht
  durch, weil das Spiel schwer ist (Balance gehört Sam), sondern nur, wenn der
  Anfang kaputt ist.
* `npm run duo-probe` – **jede** Probe davor spielte allein. Diese hängt zwei
  Clients in eine Arena: sehen, treffen, sterben, richtig zugeordnet werden.
* `npm run proben` – alle Proben hintereinander, jede mit ihrem eigenen richtig
  konfigurierten Server. Genau deshalb, weil niemand alle fährt.

**Zwei Test-Flakes**, beide derselben Art („misst etwas anderes, wenn der
Zufall ungünstig fällt"): der Guardian-Test maß einen Spazierweg statt
Angriffslust, der Royale-Test eine vorbeitreibende Form statt der Zone.

## 3. Der Stand der Proben – alles heute gefahren

```
npm run check      1001 Tests gruen (3x hintereinander)
ui-layout-check    196/196 ohne Befund
wire-probe         okay (neues Kriterium: der Beitritt selbst)
progress-probe     okay
touch-probe:all    5/5 Formate spielbar
mode-probe         maze / ffa / royale je okay
royale-probe       okay -- MIT Direktor, wie in Produktion
duo-probe          okay
first-run-probe    okay (Bericht: 0 von 2 Laeufen mit einem Abschuss)
Lasttest 80 Clients  Maze 134,6 KB/s p95 10,8 ms · Royale 140,3 KB/s p95 7,2 ms
```

## 4. Womit anzufangen ist

**Zuerst: `docs/status/chat-04/19-rohbefunde-spielgefuehl.md` lesen – und
nicht abarbeiten, sondern nachmessen.** Von 30 Befunden der ersten Analyse
hielten 14; mehrere der verworfenen klangen überzeugend. Einer zitierte als
„Beweis" wörtlich den Kommentar der Behebung.

Die Befunde, die ich zuerst nachmessen würde – weil sie sich mit der eigenen
Messung aus Bericht 18 decken:

1. **Rückmeldung im Kampf** (Befunde 1–9). „Treffer am Gegner haben einen
   Kanal, Treffer an einem selbst drei" und „Getroffen werden erschüttert
   doppelt so stark wie Töten". Wenn das stimmt, erklärt es die null Abschüsse:
   Wer nicht merkt, dass er trifft, korrigiert nicht.
2. **Was der Tod wirklich kostet** (Befund 28: „nimmt 84 % des Fortschritts –
   der Bildschirm sagt halbes Level"). Die Regel ist Sams Entscheidung, die
   *Beschriftung* nicht.
3. **Das Handy** (Befund 38: keine Bestenliste, kein Killfeed, keine Minimap).
   `touch-probe` sagt „spielbar" – das ist etwas anderes als „man sieht, was
   los ist".

**Was nicht anzufassen ist:** Balance. Rundenlänge, XP-Kurve, Respawn-Regel,
Sichtfeld-Standard – alles Sams Entscheidung, und `docs/GOAL.md` führt es als
offen. Die Analyse darf messen und benennen, nicht entscheiden.

**Der einzige echte Blocker bleibt Sams:** Migration `0005_sessions.sql` und
die Railway-Variablen. Ohne sie misst das Portal nicht, ob Fremde
wiederkommen – und das ist die dreizehnte Zeile, die einzige, die zählt.

## 5. Die Lehre des Tages, in einem Satz

Eine Prüfung, die neben dem Weg misst, den ein Spieler nimmt, ist keine
Prüfung: Der kaputte Beitritt überlebte 996 grüne Tests und 196 grüne
Layout-Fälle, gefunden hat ihn die einzige Probe, die tatsächlich beitritt.
Deshalb gibt es seit heute `npm run proben`.

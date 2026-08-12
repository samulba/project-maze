# 18 – Die ersten Minuten, im Browser gemessen statt gelesen

| | |
| --- | --- |
| **Auftrag** | Sam: „schauen was das spiel noch schlecht macht" |
| **Branch** | `main` |
| **Basis** | `9a19c5a` |
| **Tests** | `npm run check` grün – 72 Dateien, 998 Tests (5 Läufe ohne Flake) |
| **Status** | **Messung, keine Änderung am Spiel** |

Nach der Bug-Analyse vom 12.08. bleibt die andere Hälfte der Frage: Was ist
schlecht, obwohl es funktioniert? Das lässt sich nicht lesen. Also habe ich es
gespielt – von einem Skript, das sich wie ein Anfänger benimmt: Dauerfeuer,
alle 2,5 Sekunden eine andere Richtung, kein Zielen, kein Ausweichen, RESPAWN
sobald möglich, und die erste Klassenkarte nehmen, die angeboten wird.

Vier Läufe à drei bis fünf Minuten gegen einen echten Server (1280 × 720,
Standardkonfiguration).

## Was dabei herauskam

| Lauf | Dauer | höchstes Level | Ende | Tode | Kills |
| --- | --- | --- | --- | --- | --- |
| 1 | 5 min | 5 | LVL 2 · 81 Score | 1 | 0 |
| 2 | 5 min | 3 | LVL 2 · 29 Score | 3 | 0 |
| 3 | 3 min | 19 | LVL 9 · 1.020 Score | 2 | 1 |
| 4 | 3 min | 5 | LVL 2 · 72 Score | 2 | 0 |

**Drei von vier Anfängern töten in fünf Minuten nichts.** Das ist die Zahl, die
mich am meisten stört – nicht das Level. In vergleichbaren Spielen ist der
erste Abschuss der Moment, an dem man beschließt weiterzuspielen.

**Der Weg zur ersten Klasse ist eine Lotterie.** Level 5 fiel in Lauf 3 nach
11 Sekunden, in Lauf 4 nach 146. Beide Male dasselbe Verhalten – der
Unterschied ist allein, ob der Tank zufällig in Formen hineinfährt. Wer die
Karte lenkt, hat es leichter; wer nichts weiß, wartet zweieinhalb Minuten auf
die erste Entscheidung.

**Und dann ist sie 17 Sekunden später wieder weg.** Lauf 4, protokolliert:

```
 146s  Level 5
 146s  Klassenkarte erreichbar, Klick abgesetzt
 150s  Klasse RAPID
 167s  Klasse CORE
```

Dazwischen liegt ein Tod. `respawnClassFrom` gibt immer `core` zurück
(`packages/shared/src/index.ts:850`), `respawnLevelFrom` die Hälfte. Beides ist
**Absicht** – Sams Befund vom 07.08. war das Gegenteil („nach dem Tod blieb die
alte Klasse erhalten"), und der zweite Run soll eine neue Entscheidung sein.

Die Regel steht also nicht zur Debatte. Was zur Debatte steht, ist ihr
Zusammenspiel mit dem Anfang: Zweieinhalb Minuten Arbeit, eine Entscheidung,
und siebzehn Sekunden später ist beides weg – bei jemandem, der noch keinen
einzigen Abschuss hatte. Das ist der erste Eindruck, und er entscheidet die
dreizehnte Zeile in `docs/GOAL.md`.

## Was die Messung NICHT sagt

* **Nichts über geübte Spieler.** Das Skript zielt nicht. Ein Mensch trifft,
  weicht aus und fährt zu Formen – Lauf 3 (Level 19 in 58 s) zeigt, wie schnell
  es geht, wenn der Zufall mitspielt.
* **Nichts über Spaß.** Gemessen sind Level, Score, Tode und Kills. Ob die
  Sekunden dazwischen gut sind, sagt kein Skript.
* **Nichts über die Bots als Gegner.** Alle Tode kamen von Bots („Eliminiert
  von Orbit"), aber ob das ein Duell war oder ein Überfahren, sieht man in
  diesen Zahlen nicht.

## Ein Fehlalarm, der es fast in den Befund geschafft hätte

Playwrights `page.click()` auf die Klassenkarte lief **80 Sekunden lang** in
Timeouts – bei einer Karte, die `document.elementFromPoint` an ihrem eigenen
Mittelpunkt zurückgibt, also von nichts verdeckt ist. Das sah nach „die
Klassenwahl ist nicht klickbar" aus.

War es nicht. Meine Sonde hielt die Maustaste für das Dauerfeuer gedrückt;
Playwright liefert einen Klick in diesem Zustand nicht aus. Derselbe Klick als
`knopf.click()` im Seitenkontext – der Weg, den `progress-probe` nimmt – wirkt
sofort (Lauf 4, Sekunde 150: Klasse RAPID).

Das steht hier, weil es die Lehre des Tages wiederholt: Eine Messung, die
neben dem Weg misst, den ein Spieler nimmt, misst ihr eigenes Werkzeug.

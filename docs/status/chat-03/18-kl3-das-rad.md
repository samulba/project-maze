# 18 – KL3: der Klassenbaum als Rad, an zwei Orten

**Branch:** `claude/chat-03-client-ux-mazers-yu57ca` · **Basis:** `origin/main` @ `43c879d` · **Status: OFFEN – wartet auf Merge**

Alle vier Familien hatten ihre Signature, und niemand sah sie. Jetzt steht der
komplette Baum als Rad: Core in der Mitte, die vier Familien auf Ring 1, ihre
Zweige auf Ring 2 und 3. Zwei Orte, ein Bauteil – die Enzyklopädie auf dem
Startscreen und das Overlay im Spiel auf Taste `C`.

## Der Baum wird gerechnet, nicht verdrahtet

`class-tree.ts` liest `CLASS_DEFINITIONS` und macht daraus Ringe, Sektoren und
Winkel. Keine Koordinatentabelle, die beim nächsten Klassenzuwachs von Hand
nachgezogen werden muss – **13 Tests** halten fest, dass jede der 29 Klassen im
richtigen Ring liegt, im Sektor ihrer Familie bleibt und jeder Ring-3-Knoten
dicht an seinem Elternteil steht. Kommt bei 02 eine Klasse dazu, wächst das Rad
mit; kippt dabei die Aufteilung, fällt es im Test auf und nicht im Bild.

## Auflage 1: die Signature erklären

Jede Karte trägt **LÄDT** und **BRINGT** statt einer Werteliste:

| Familie | Lädt | Bringt |
|---|---|---|
| Dauerfeuer | Feuern in Fahrt baut Momentum auf; wer stehen bleibt, verliert es | bei vollem Momentum deutlich schnelleres Nachladen |
| Präzision | Feuertaste halten lädt den Schuss; ein Sofortklick bleibt schwach | der geladene Schuss trifft härter und größer |
| Kontrolle | ein Nachschub-Konto füllt sich stetig, jede Einheit bezahlt daraus | volles Konto heißt vollständige Flotte |
| Panzerung | Wucht lädt allein durch Fahren, die Feuertaste spielt keine Rolle | ein Anlauf mit voller Wucht macht ein Vielfaches an Körperschaden |

Werte kommen bewusst **nicht** vor – die stehen auf den Wahlkarten. Dazu je
Klasse „Führt zu → X · Y · Z" und bei Endklassen „hier endet der Pfad".

Nicht mehr erreichbare Klassen bleiben sichtbar, nur gedämpft. Sie zu
verstecken wäre einfacher gewesen; man soll sehen, was die eigene Wahl gekostet
hat.

## Auflage 2: das Overlay hält nichts an

Meine erste Fassung hatte einen Vollbild-Schleier. Der ist wieder raus – „das
Spiel läuft weiter" und „ich sehe nichts mehr" wären ein Widerspruch. Rad und
Karte liegen auf zwei eigenen Flächen, die Arena bleibt sichtbar, und **die
Fläche zwischen den Speichen gehört dem Spielfeld**: Klicks nehmen nur die 29
Knoten, die Karte und der Schließen-Knopf.

| | tote Fläche |
|---|---|
| normales Spiel | 1,3 % |
| **mit offenem Rad** | **8,5 %** |
| zum Vergleich: Klassenwahl vor Paket 16 | 35,3 % |

**Auf kleinen Schirmen ist das Rad eine Leseansicht.** Unter 1000 px Breite,
620 px Höhe oder auf Touch geht die Rechnung nicht auf: Zwischen Spielerkarte,
Upgrade-Panel, Knopfspalte und Modul bleibt für 29 Knoten nichts übrig, das man
lesen könnte. Dort tritt die Bedienung mit zurück, und der Hinweis sagt es
auch: „die Arena läuft weiter, du fährst nicht". Das ist eine benannte
Entscheidung, keine übersehene Kollision – der Server hält nie an.

Was in **jeder** Größe zurücktritt, solange das Rad offen ist: Bestenliste,
Killfeed, Minimap, Onboarding, Event- und Bounty-Banner, Achievement-Popups und
die Klassenwahl. Letztere, weil man das Rad liest, **um** zu entscheiden – beide
gleichzeitig wären zwei Antworten auf dieselbe Frage.

## Auflage 4: Kosten

| | |
|---|---|
| SVG-Knoten | 29 Kreise, 28 Linien, 29 Beschriftungen ≈ 90 |
| Aufbau | **einmal** beim Start, danach nur Klassen umschalten |
| pro Snapshot | nichts – `setCurrent` prüft auf Gleichheit und kehrt zurück |
| Stufe „niedrig" | Ringlinien entfallen; die Knoten bleiben, sie sind der Inhalt |

Zum Vergleich: Die Bestenliste allein baut 8 Zeilen à 4 Elemente bei jeder
Änderung neu auf. SVG statt Canvas, weil die Trefferprüfung und die Skalierung
sonst von Hand zu rechnen wären – und weil das Rad so über die Tastatur
bedienbar ist.

## Auflage 3: der Prüfstand mit dem Rad

Die Matrix ist von 63 auf **75 Fälle** gewachsen: zwölf davon mit geöffnetem
Rad, quer über Fenstergrößen, Zustände und Geräte – darunter 844×390, das
härteste, was wir haben.

| Durchlauf | Rad-Fälle ohne Befund |
|---|---|
| erster | 2 / 12 |
| nach dem Zurücktreten des HUD | 9 / 13 |
| nach der Geometrie-Reparatur | 13 / 13 |
| nach der Vergrößerung des Rades | 7 / 13 |
| nach dem deterministischen Zurücktreten | **13 / 13** |

Der abschließende Durchlauf über die ganze Matrix – alle Fenstergrößen, alle
Zustände, Startseiten, Handy, Tablet, mit und ohne Rad – steht bei
**75 / 75 Fällen ohne Befund**. Die drei Regressionen, die der Prüfstand in
Paket 17 an meinen eigenen früheren Paketen gefunden hat, sind damit weiterhin
zu, und das Rad hat keine neue dazugelegt.

**Der teuerste Fehler war meiner und stand zwei Runden lang im Code:** Das
Overlay trägt beide Klassen am selben Element (`class="class-overlay codex"`).
Alle meine Regeln hießen `.class-overlay .codex` – ein Nachfahren-Selektor, der
nichts trifft. Die Overlay-Geometrie hat nie gegriffen; ich habe stattdessen
zweimal an Symptomen nachgebessert. Gefunden hat es erst eine Messung der
tatsächlichen Boxen, nachdem ich aufgehört habe, aus dem Quelltext zu
schließen. Dieselbe Lehre wie bei den Rändern in Paket 14, nur teurer bezahlt.

**Der zweite Fehler war subtiler und lehrreicher.** Nach der Geometrie-Reparatur
stand die Matrix auf 13/13; ein größeres Rad brachte sie auf 7/13 zurück, mit
Kollisionen gegen Panels, die nachweislich ausgeblendet waren – ich habe die
Deckkraft im Browser gemessen, sie war 0. Die Rücknahme der Vergrößerung half
**nicht**: 11/13. Die Ursache war nicht die Größe, sondern das Ausblenden
selbst: Ein Element mit `opacity: 0` ist weiterhin da, nimmt Platz und ist
während der Überblendung mehrdeutig. Mit `visibility: hidden` dazu steht die
Matrix wieder auf 13/13 – und zwar aus dem richtigen Grund. Zurücktreten heißt
jetzt weg, nicht fast weg.

Der Prüfstand hat außerdem zwei Bequemlichkeiten dazubekommen: `ONLY=<text>`
engt die Matrix beim Reparieren ein, und die tote Fläche wird in der
Leseansicht gemeldet, aber nicht bewertet – dort ist sie Absicht.

## Geänderte Dateien

**Neu:** `class-tree.ts(+test)`, `class-wheel.ts`, `class-codex.ts`, `class-tree.css`
**Geändert:** `ui.ts`, `main.ts`, `input.ts`, `start-nav.ts(+test)`, `scripts/ui-layout-check.mjs`

`packages/shared`, `apps/server` und `package.json` unangetastet.

## Tests

`npm run check` grün: 53 Dateien, 728 Tests (15 neu), Build in Ordnung.

## Von 01 gebraucht

1. **Merge.**
2. **Screenshots an Sam:** Enzyklopädie und Overlay gehen in den Chat.
3. **Eine Frage, die ich nicht entscheiden kann:** Soll das Rad beim Erreichen
   von Level 10 **einmal von selbst aufgehen**? Es beantwortet genau die Frage,
   die dann ansteht, und die Klassenwahl tritt dafür ohnehin zurück. Ich habe
   es nicht gebaut, weil ein Overlay, das sich im Gefecht selbst öffnet, auch
   der schlechteste denkbare Moment sein kann.
4. **Unverändert offen:** Sichtfeld-Standard, Vorhersage-Standard, `tier` bei 04.

## Abweichungen und Grenzen

1. **Das Rad ist auf 520 px gedeckelt, obwohl auf großen Schirmen Platz wäre.**
   Der Versuch mit 660 px steht oben; nachdem die eigentliche Ursache gefunden
   war, habe ich ihn nicht wiederholt, um die Matrix nicht ein drittes Mal
   umzuwerfen. Ein größeres Rad auf 1920 und Ultrawide ist eine Zeile und ein
   Durchlauf – aber einer, den ich nicht mehr gemacht habe.
2. **Kein Sprung von der Wahlkarte ins Rad.** Wer auf Level 10 die Wahl vor
   sich hat, muss `C` drücken, statt auf der Karte „mehr" zu tippen. Der Weg
   wäre eine Zeile, aber die Wahlkarte hat nach Paket 16 gerade so viel Platz,
   dass ich dort nichts hinzufügen wollte, ohne es zu messen.
3. **Das Rad zeigt keine Zahlen.** Kein Vergleich zweier Klassen, keine
   Balken wie auf den Wahlkarten. Das war eine Entscheidung: Die Karten tragen
   die Werte, das Rad trägt den Zusammenhang. Wenn Sam beides an einem Ort
   will, gehört es in ein eigenes Paket.
4. **Nur Chromium.** `:has()` trägt inzwischen die halbe HUD-Logik und ist auf
   Sams Gerät ungeprüft.
5. **Der Klassenwechsel ist im Prüfstand nicht abgebildet.** Dass der
   hervorgehobene Pfad beim Aufstieg mitwandert, ist über `setCurrent` gebaut
   und im Browser einmal von Hand gesehen, aber nicht als Fall festgehalten.
6. **Die Enzyklopädie ist nur im Gastfall geprüft** – wie alle
   Startscreen-Fälle, weil lokal keine Anmeldung eingerichtet ist. Sie hängt
   allerdings an keiner Verbindung: Der Baum steht im Client.

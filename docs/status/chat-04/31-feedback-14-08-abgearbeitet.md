# 31 – Sams Feedback vom 14.08., abgearbeitet

| | |
| --- | --- |
| **Auftrag** | Sam, 14.08.: „sortier den erstmal gescheit und lass das dann CLEAN step by step fixen / durcharbeiten! NIX DARF VERLOREN GEHEN & ALLES MUSS GEFIXT WERDEN! und das RICHTIG" |
| **Plan** | [Bericht 30](30-feedback-14-08-sortiert.md) – Sams Worte im Original und die Sortierung |
| **Branch** | `claude/mazers-feedback-testspiel-7y5cmj` |
| **Basis** | `2c90ca2` |
| **Tests** | `npm run check` grün – 93 Dateien, 1263 Tests (vorher 89 / 1214) |
| **Layout** | `scripts/ui-layout-check.mjs` ohne Befund |

## Alle neun Punkte

| # | Sams Punkt | Stand | Commit |
| --- | --- | --- | --- |
| 5 | Kugeln fliegen durch Squares, die sie nicht töten | ✅ | `a8d972d` |
| 7 | Drohnen nicht abschießbar, fliegen durch Objekte | ✅ | `a8d972d` |
| 8 | Drohnenklasse fühlt sich komisch an, will Diep.io 1:1 | ✅ | `9e783e6` |
| 1 | Rückstoß viel zu stark, nicht sinnvoll eingesetzt | ✅ | `6d92c6b` |
| 6a | ein Klick soll eine Salve sein, Halten = Auto | ✅ | `6d92c6b` |
| 6b | Kugel steht vor dem Rohr | ✅ | `6d92c6b` |
| 6c | Rohr-Design passt nicht zum Schuss | ✅ | `6d92c6b` |
| 2 | Kugeln verschwinden zu abrupt | ✅ | `46e6a66` |
| 9 | paar Tanks bewegen sich überdurchschnittlich schnell | ✅ | `46e6a66` |
| 4 | Spezialisierungskarten: nur Bild und Name | ✅ | `ba0c60c`, `cad9b4d` |
| 3 | Dropdown auf der RUN-BEENDET-Karte ist hässlich | ✅ | `cad9b4d` |

Elf Zeilen für neun Punkte: Punkt 6 waren drei getrennte Aufträge in einem
Absatz (Kadenz, Mündung, Rohr-Design), Punkt 7 zwei (abschießbar, solide).
Warum so geschnitten, steht in [Bericht 30](30-feedback-14-08-sortiert.md).

## Was gemessen wurde

### Drohnen am Zeiger (Punkt 8)

Mit gehaltenem Linksklick, eingeschwungen, über fünf Sekunden:

| Klasse | Tempo vorher | Tempo jetzt | Ring um den Zeiger |
| --- | ---: | ---: | ---: |
| drone | 0,0 px/s | 84,2 px/s | 38,3 px |
| overseer | 0,0 px/s | 133,4 px/s | 60,6 px |
| hive | 0,0 px/s | 131,6 px/s | 59,8 px |
| sentinel | 0,0 px/s | 81,6 px/s | 37,1 px |
| aviary | 0,0 px/s | 134,3 px/s | 61,0 px |
| sovereign | 0,0 px/s | 165,9 px/s | 75,4 px |

**Alle sechs Klassen parkten mit exakt 0,0 px/s auf dem Zeiger.** Der
Formationsplatz stand fest, und die Ankunftsbremse (`abstand / 0,18 s`) ergibt
auf einem festen Punkt null. Das ist Sams „fühlt sich MEGA MEGA komisch an" –
eine parkende Flotte ist ein Standbild, kein Schwarm.

Der Ring ist über die ganze Messung konstant (Schwankung < 0,1 px): Es ist ein
sauberer Kreis, kein Pendeln. Ein Tempo-Boden hätte genau dieses Pendeln
erzeugt – deshalb bleibt die Bremse und der Zielpunkt wandert stattdessen.

### Rückstoß (Punkt 1)

Drift beim Dauerfeuer, über drei Sekunden gemessen:

| Klasse | vorher | jetzt | Anteil der Laufgeschwindigkeit |
| --- | ---: | ---: | ---: |
| rapid | 25,0 px/s | 4,3 px/s | 1,5 % |
| core | 25,0 px/s | 6,0 px/s | 2,2 % |
| twin | 25,0 px/s | 5,9 px/s | 2,1 % |
| storm | 25,0 px/s | 8,8 px/s | 3,2 % |
| gatling | 25,0 px/s | 9,0 px/s | 3,2 % |
| sniper | 25,0 px/s | 10,9 px/s | 4,4 % |
| trebuchet | 25,0 px/s | 8,0 px/s | 3,6 % |

Vorher war die Drift für **jede** Klasse dieselbe – das ist Sams „nicht
sinnvoll eingesetzt". Jetzt folgt sie dem Impuls des Schusses (`kugelwucht`:
Kugelfläche × Tempo × Wurzel der Laufzahl), und die Werte sind
levelunabhängig: Der Rückstoß ist eine Eigenschaft der Kanone, nicht der
Ausbaustufe.

Der zweite Grund, warum sich 25 px/s stärker anfühlten als sie rechnen, steht
nicht in der Tabelle: **Der Client sagt den Rückstoß nicht vorher**
(`prediction.ts`, Abschnitt 5 der Doku). Jeder Schuss war zusätzlich ein
Korrekturzug von bis zu 17 px. `MAX_STOSS_PX` (8) hält ihn jetzt klein genug,
dass die weiche Korrektur ihn in rund 135 ms wegarbeitet.

### Fahrtempo (Punkt 9)

Bei vollem Tempo-Slot und dem schnellsten Rahmen (`lightweight`):

| Klasse | vorher | jetzt |
| --- | ---: | ---: |
| comet | 541 px/s | 452 px/s |
| blitz | 509 px/s | 446 px/s |
| smasher | 485 px/s | 441 px/s |
| rapid | 461 px/s | 436 px/s |
| **Median** | **401 px/s** | **401 px/s** |
| langsamste | 353 px/s | 353 px/s |

Die entscheidende Zahl steht woanders: Das Projektilsystem kalibriert Deckel
und Boden gegen `fastestPlayerSpeed` = **447 px/s**. Ein voll ausgebauter Comet
fuhr 21 % schneller als der Wert, gegen den jede Kugel im Spiel ausbalanciert
ist – die Zusage „jede Kugel holt einen Fliehenden ein" war für ihn schlicht
falsch. Jetzt liegt der schnellste baubare Panzer 1,2 % daneben.

Kein Grundtempo einer Klasse (Höchstwert 340) kommt an den Deckel: Wer nichts
in Tempo investiert, merkt nichts.

### Was Punkt 5 das Farmen kostet – nachgemessen

Die naheliegende Sorge bei „nur ein Kill schlägt durch": Eine Kugel, die vorher
eine ganze Reihe Formen abgeräumt hat, holt jetzt nur noch eine. Gemessen mit
Formen in einer Reihe direkt vor der Mündung, 60 s Dauerfeuer:

| Formen in Reihe | vorher | jetzt |
| --- | ---: | ---: |
| 1 | 1764 | 1962 |
| 2 | 3582 | 1818 |
| 4 | 5634 | 1710 |

Bei einer einzelnen Form ist es sogar etwas mehr (die Kugel entsteht seit
Punkt 6b näher am Rohr und ist damit früher da). Bei vier Formen in Reihe
bricht es um 70 % ein – **eine Kugel hat dort vorher drei Formen gefressen.**
Genau das ist der Effekt, den Sam „macht kein SINN" genannt hat.

Die Frage ist, ob das im Spiel etwas ändert. Auf der echten Karte liegen die
Formen gestreut, nicht in Reihe. Zwölf Läufe zu 45 s, feuernd im Kreis, mit der
Streuung, die die Karte selbst erzeugt:

| | vorher | jetzt |
| --- | ---: | ---: |
| Mittel | 240 | 249 |
| Median | 252 | 243 |
| Spanne | 117–345 | 90–477 |

**Kein Unterschied** – die Streuung zwischen zwei Läufen ist um ein Vielfaches
größer als der Abstand der Mittelwerte. Das Farmtempo bleibt, was es war; nur
der Sonderfall „Formen stehen zufällig in einer Linie" zahlt, und der sah
vorher falsch aus.

(Kontrolliert wurde auch die Gegenprobe: `progress-probe` erreicht in 150 s
Stufe 2–3 statt der geforderten 5 – **auf beiden Ständen gleich**. Das ist eine
zu knappe Geduld der Probe, kein Rückschritt aus diesem Paket.)

### Kadenz (Punkt 6a)

Rapid mit vollem Nachladen (133 ms) auf einen 175-ms-Klick: **vorher zwei
Kugeln, jetzt eine.** Repeater auf einen Klick: genau seine drei, nicht eine
und nicht sechs. Gehalten: nach 200 ms voller Takt wie bisher.

Die unterdrückte Salve kostet keine Nachladezeit – sonst wäre die Schicht eine
versteckte Feuerraten-Senkung statt einer Steuerungshilfe.

## Was NICHT passiert ist

* **Der Wandtod der Drohnen bleibt unverändert.** Sam korrigiert sich in
  Punkt 8 selbst („kleiner Nachfix: die Drohnen gehen doch kaputt, wenn sie
  Wände berühren, das ist gut"). Die Schwellen aus
  [Bericht 29](29-drohnen-rework-2.md) stehen weiter.
* **Reichweite und Tempo der Projektile sind unangetastet.** Beides kam am
  13.08. neu und steht in dieser Liste nicht.
* **Der `penetration`-Slot behält seine Bedeutung.** Punkt 5 verschärft ihn
  nicht zu „jede Kugel stirbt sofort": Ein Kill schlägt weiter durch, nur ein
  überlebendes Ziel hält die Kugel auf.

## Neue Bausteine

| Datei | Zweck |
| --- | --- |
| `packages/shared/src/barrels.ts` | Lauf-Geometrie als EINE Quelle für Server, Renderer und Wahlkarte |
| `apps/server/src/fire-cadence.ts` | ein Klick, eine Salve – Halbautomatik |
| `apps/client/src/projectile-fade.ts` | Ausblenden verschwundener Kugeln, als reine Logik |
| `apps/server/src/koerperkontakt.test.ts` | Kugeln und Drohnen durchdringen keine Körper |
| `apps/server/src/fire-cadence.test.ts` | die Kadenz, an der Zahl der Kugeln gemessen |
| `packages/shared/src/barrels.test.ts` | „was gezeichnet wird, ist das, woraus geschossen wird" |

Dazu zwei Nähte statt Kopien: `damageDrone` in `game.ts` (drei Aufrufer statt
dreier Fassungen derselben Buchführung) und `schiebeAuseinander` in
`physics.ts`.

## Ein blinder Fleck im Prüfstand – und was darunter lag

`scripts/ui-layout-check.mjs` wartete für das Admin-Portal auf `.kopf`. Die
Klasse heißt seit dem Portal-Umbau `.kopfleiste`. Der Prüfstand lief deshalb in
seine 15-Sekunden-Grenze und meldete „kommt nicht hoch" – **alle acht
Portal-Fälle, in jedem Lauf.** Gemeldet wurde damit kein Fehler, sondern ein
blinder Fleck: Acht Layout-Fälle waren ungeprüft, und der Prüfstand endete
verlässlich rot, was jede echte Meldung im Rauschen versteckt hätte.

Der Selektor ist korrigiert. Darunter kommen **vier echte Befunde** zum
Vorschein, alle im Admin-Portal auf kleinen Schirmen:

| Fall | Befund |
| --- | --- |
| `portal-tablet` (820×1180) | `dt`/`dd`/`.mono` ragen seitlich aus dem Bild |
| `portal-handy` (390×844) | dieselben, dazu `.navi-punkt` außerhalb |
| `portal-handy-klein` (375×667) | dieselben |
| `portal-handy-quer` (844×390) | dieselben |

**Nicht in diesem Paket gefixt.** Das Admin-Portal hat mit Sams Spieltest
nichts zu tun, und seine Handy-Ansicht zu richten ist eine eigene Aufgabe –
sie hier mit hineinzunehmen würde zwei unabhängige Änderungen in einem Zweig
vermischen. Der Prüfstand meldet sie ab sofort, statt sie zu verdecken.

## Zwei Testlücken, die dabei aufgefallen sind

1. **`arena-royale.test.ts`** ließ im Schonfrist-Test die Formen stehen und
   behauptete „kein Leben verloren" über 35 Sekunden. Eine vorbeitreibende Form
   kostet Leben – rund einer von acht Läufen rot. Der Nachbartest trägt die
   Erklärung seit dem 12.08. im Kommentar; hier fehlte nur der Aufruf.
2. **`projectile-speed.test.ts`** feuerte einen Schuss mit stehenden Formen.
   Seit Punkt 5 verschwindet eine Kugel an einer Form, die sie nicht tötet –
   lag eine der zufällig gestreuten Formen vor der Mündung, fand der Test gar
   kein Projektil und meldete einen Tempo-Fehler, wo eine Form stand.

Beide sind gefixt und beide waren dieselbe Fehlerklasse: ein Test, der den
Zufall misst, statt ihn wegzuräumen.

## Was Sam beim nächsten Spieltest ansehen sollte

1. **Die Halbautomatik**: Fühlen sich 200 ms als Grenze zwischen „Klick" und
   „Halten" richtig an? Das ist die einzige Zahl in diesem Paket, die reine
   Geschmackssache ist.
2. **Die Drohnenflotte am Zeiger**: Kreist sie so, wie er es aus Diep.io kennt,
   oder ist der Ring zu weit / die Drehung zu schnell?
3. **Der Rückstoß**: Ist er jetzt zu wenig? Die Spanne 4–11 px/s ist bewusst
   klein gewählt; nach oben ist Luft, ohne dass die Client-Vorhersage leidet.
4. **Die Wahlkarten**: Reicht das Bild allein, oder fehlt der Rollenname
   („DAUERFEUER") doch auf der Karte statt nur im Tooltip?

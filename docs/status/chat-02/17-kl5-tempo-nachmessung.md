# 17 – KL5, erster Teil: die Tempo-Verschärfung nachgemessen

**Branch:** `claude/chat-02-server-gameplay-w1i4o8` (neu von `origin/main`)
**Basis:** `origin/main` @ `7ecbc90` · **Auftrag:** `docs/status/chat-01/auftrag-chat-02.md` (6. Fassung)

Du hast gesagt: „Miss es nach und widersprich mir, wenn es Schaden anrichtet."
**Ich widerspreche – aber nicht dort, wo du es erwartest.** Die Verschärfung ist
nicht zu scharf. Sie besteht aus zwei Schrauben, und **eine davon dreht ins
Leere**, während die andere allein die ganze Wirkung trägt und dabei einen
Nebeneffekt hat, den du nicht wollen kannst.

---

## 1. Der Dämpfer 0,70 → 0,60 tut nichts

`projectileBaseSpeed` hat drei Regeln, und für jede Klasse gewinnt genau eine.
Ich habe ausgezählt, welche:

| Zahlen | Boden | **Dämpfer** | Deckel | verschiedene Tempi | Spreizung |
|---|---|---|---|---|---|
| meine (0,70 · 2,6→1,8) | 7 | **9** | 6 | 16 | 1,79× |
| **deine (0,60 · 2,0→1,35)** | 15 | **0** | 7 | **8** | **1,34×** |

**Mit 0,60 bestimmt der Dämpfer keine einzige Klasse mehr.** Jede Klasse außer
Precision liegt danach auf dem Boden – dem Wert, den du ausdrücklich nicht
anfassen wolltest. Der Grund ist Arithmetik: Ein Core-Projektil müsste unter
`0,682 × Rohtempo` fallen, um überhaupt noch vom Dämpfer bestimmt zu werden.
Bei 0,70 lag die Rapid-Linie mit 574–613 px/s knapp darüber, bei 0,60 fällt sie
geschlossen auf 559.

Der Dämpfer hat die Rapid-Linie also nicht verlangsamt – **er hat sie
eingeebnet.** Gemessen am Tempo sind Core, Rapid, Twin, Repeater, Storm,
Gatling, Flanker und Octo jetzt dieselbe Klasse: alle exakt 559 px/s. Vorher
lagen sie zwischen 626 und 656.

## 2. Der Deckel 1,8 → 1,35 trägt die ganze Wirkung – und flacht Precision ein

| Familie | vorher | mit meinen Zahlen | mit deinen |
|---|---|---|---|
| Precision | 990–1476 (1,49×) | 770–804 (1,04×) | **603–603 (1,00×)** |
| Rapid | 626–656 (1,05×) | 574–613 (1,07×) | **559–559 (1,00×)** |
| Impact | 450–525 (1,17×) | 450–525 (1,17×) | 450–525 (1,17×) |

**Alle sieben Precision-Klassen feuern jetzt exakt gleich schnell.** Ein Lancer
(Nachladezeit 1,30 s, 82 Schaden) und ein Hunter (0,50 s, 32 Schaden) hatten
einen Tempo-Unterschied von 1,49× – der war Teil des Gegengeschäfts, mit dem
Lancer seine lange Nachladezeit bezahlt bekommt. Der ist weg.

**Ehrlich dazu: Das Einebnen ist zur Hälfte meine Schuld.** Ein harter Deckel
flacht per Konstruktion alles ab, was ihn erreicht – mit meinen Zahlen lag
Precision schon bei 1,04×. Neu ist, dass der Abstand **zwischen** den Familien
mitverschwindet: Precision liegt jetzt 1,08× über der Rapid-Linie, mit meinen
Zahlen waren es 1,31×, davor 1,90×.

## 3. Der Nebeneffekt, den du nicht wollen kannst

Der Ausweich-Index (seitliche Ausweichstrecke in Trefferbreiten, 0,25 s
Reaktion) war mein Zielwert für „ausweichbar, aber nicht geschenkt": **rund
1,5.** Jetzt steht er auf 450 px bei **4,6 bis 7,3** – für jede Klasse.

Das heißt: Auf mittlerer Distanz trifft man ein sich bewegendes Ziel praktisch
nicht mehr. Und da trifft es die Familien ungleich:

- **Impact ist gar nicht betroffen** – die Klassen lagen schon unter dem Boden,
  ihr Tempo ist unverändert, und ihre Wucht wirkt über Körperkontakt, dem ein
  Ausweich-Index egal ist. Wucht ist seit heute an.
- **Precision zahlt doppelt**: langsamste Kugeln relativ zu ihrer Rolle, und
  jeder Fehlschuss kostet eine ganze Ladephase.

Wenn Gefechte auf mittlerer Distanz nicht mehr funktionieren, gewinnt, wer
hineinfährt. Das ist genau die Familie, die von der Änderung nicht berührt
wurde.

---

## 4. Was ich stattdessen vorschlage

| | Dämpfer | Deckel unten | Boden | Wirkung |
|---|---|---|---|---|
| deine | 0,60 | 1,35× | 1,25× | 8 Tempi, Spreizung 1,34× |
| **Vorschlag** | **0,70** | **1,50×** | 1,25× | **15 Tempi, Spreizung 1,49×** |

Der Dämpfer zurück auf 0,70 kostet **nichts an Langsamkeit** – die Rapid-Linie
liegt dann bei 574–613 statt 559, also 2,6–9,7 % über dem Boden – und gibt acht
Klassen ihre Unterscheidbarkeit zurück. Der Deckel auf 1,50× setzt Lancer auf
670 px/s: Ausweich-Index 3,78 auf 450 px und **1,26 auf 300 px** (deiner: 1,82 –
beide über 1, die Kugel bleibt auf jeder Distanz ausweichbar), und Precision
liegt wieder 1,20× über der Rapid-Linie. Gegenüber dem Stand vor Paket 14 ist
Lancer damit immer noch **−55 %**.

### Und ein Vorschlag für die Mechanik, nicht nur die Zahl

Dass ein harter Deckel alles einebnet, was ihn erreicht, ist der eigentliche
Konstruktionsfehler – meiner. Ein **weicher Deckel** behielte die Reihenfolge:

```
v = cap + (damped − cap) × 0,15      // statt v = min(damped, cap)
```

Mit Dämpfer 0,70 und Deckel 1,50× ergäbe das Hunter 685, Deadeye 712, Lancer
742 px/s – die Familie bliebe innen gestaffelt (1,08×), das obere Ende läge bei
1,66× Spielertempo statt bei 4,36× vor Paket 14. Ich habe es **nicht gebaut**:
Es ist eine Mechanikänderung an einer Stelle, die gerade strittig ist, und
zuerst gehört deine Entscheidung über die Zahlen dazu.

---

## 5. Die gepaarte Messung

04s `--seed` funktioniert wie versprochen: eigener Zufallsstrom je Client, beide
Seiten treffen dieselben Entscheidungen. Aufbau: je Konfiguration ein frischer
Server, 32 Clients, 300 s, zwei Läufe, danach `/metrics?format=json`, nach
Familien aggregiert (`.probe/kl5-ab.mjs`).

```
KONFIGURATION      FAMILIE    KILLS  DEATHS    K/D   je Lauf
A vorher (V2 aus)  rapid        117      64   1.83   1.91  2.82  1.08
A vorher (V2 aus)  impact        81      68   1.19   0.85  1.29  1.52
A vorher (V2 aus)  precision     92      68   1.35   1.21  1.30  1.65
A vorher (V2 aus)  control       44      56   0.79   0.61  0.61  1.10
A vorher (V2 aus)  core         185     308   0.60   0.66  0.53  0.64

B 01s Zahlen       rapid         98      67   1.46   1.25  1.48  1.81
B 01s Zahlen       impact        76      59   1.29   2.90  1.17  0.76
B 01s Zahlen       precision     80      75   1.07   0.43  1.89  1.03
B 01s Zahlen       control       60      47   1.28   1.67  1.44  0.54
B 01s Zahlen       core         201     293   0.69   0.66  0.57  0.89
```

**Das Ergebnis ist ein Nicht-Ergebnis, und das ist die wichtigste Zeile des
Berichts:** Bei **jeder** Familie ist die Streuung zwischen drei Läufen
derselben Konfiguration so groß wie der Unterschied zwischen den
Konfigurationen – bei Precision in B von 0,43 bis 1,89, bei Impact von 0,76 bis
2,90. Kein einziger Unterschied zwischen A und B liegt außerhalb dieser
Streuung.

**Ich hätte hier fast das Gegenteil berichtet.** Ein erster Durchgang mit zwei
Läufen, deren Einzelwerte ich nur summiert hatte, sah nach einem klaren Befund
aus: Precision 0,95 → 1,83, Control 1,70 → 0,36. Beides ist mit dem dritten
Lauf verschwunden. Der Unterschied zwischen den beiden Durchgängen war nicht die
Konfiguration, sondern dass ich die Einzelwerte ausgegeben habe.

### Was diese Messung **nicht** zeigt

Der erste Anlauf mit 90 s und 24 Clients lieferte je Familie 0 bis 19 Kills und
2 bis 8 Tode. **Bei solchen Zahlen ist jedes K/D Rauschen** – dieselbe Wand, an
der 04s Messung gescheitert ist. Der Grund ist nicht der Seed, sondern die
Levelkurve: In 90 Sekunden kommen die Clients kaum aus Core heraus, und Core
sammelt dann 50 der 74 Tode. Auch 300 s sind dafür noch knapp.

**Für eine belastbare Familienbilanz braucht es Läufe, die lang genug sind, dass
die Clients Level 24 bis 38 erreichen** – oder Clients, die auf einem Level
starten. Das Zweite wäre ein kleiner Eingriff in 04s Werkzeug (`--start-level`,
über die Debug-Route) und würde die nötige Laufzeit vermutlich halbieren. Das
ist die Zulieferung, um die ich bitte; sie gehört in 04s Revier.

Bis dahin gilt: **Die Zahlen oben sind eine Richtungsangabe, kein Urteil.** Die
Aussagen in den Abschnitten 1 bis 4 hängen nicht an ihnen – die sind aus dem
Code gerechnet.

---

## Von 01 gebraucht

1. **Entscheidung über die beiden Zahlen.** Mein Vorschlag: Dämpfer zurück auf
   **0,70**, Deckel unten auf **1,50×**. Begründung oben; der Dämpfer auf 0,60
   kostet Unterscheidbarkeit und bringt keine Langsamkeit.
2. **Soll ich den weichen Deckel bauen?** Er behebt das Einebnen an der Wurzel,
   ist aber eine Mechanikänderung – deine Entscheidung, meine Zahlen liegen bei.
3. **Von 04: ein Startlevel für die Lasttest-Clients.** Ohne das misst jede
   Familienbilanz überwiegend Core.
4. **Zur geänderten Regel (Default aus beim Mergen, 01 stellt um):** Die halte
   ich für richtig, und der Vorfall geht auf meine Kappe – ich habe in vier
   Berichten „Default aus" geschrieben und nie dazugesagt, **wann** er an
   sollte. Ab jetzt steht in jedem Bericht ein Satz dazu, was den Schalter
   blockiert und wann nichts mehr blockiert.

## Abweichungen vom Auftrag

1. **Die drei KL5-Fragen sind nur zum Teil beantwortet.** „Ist jede Familie
   erkennbar?" und „Dominiert eine?" brauchen Läufe, in denen die Familien
   überhaupt gespielt werden – siehe oben. Ich liefere die Messmethode und die
   Werkzeuge, aber kein Urteil, das die Daten nicht tragen.
2. **Kein Code in diesem Paket.** Ich habe an den Konstanten nichts geändert,
   obwohl ich sie für falsch halte: Du hast sie bewusst gesetzt, und „erst
   Zahlen, dann Code" gilt auch, wenn die Zahlen von dir kommen.

# 18 – Der weiche Deckel, und KL5 zu Ende

**Branch:** `claude/chat-02-server-gameplay-w1i4o8` · **Basis:** `origin/main` @ `f4aaa5c`
**Kein neues Flag** (wie beauftragt) · **Auftrag:** 7. Fassung

Zwei Teile: der weiche Deckel mit der Antwort auf „ist 0,15 der richtige
Faktor" (nein – 0,06), und die Familienbilanz, die beim ersten Anlauf an der
Streuung gescheitert war. Diesmal hat sie einen Befund, und er betrifft nicht
das, worüber wir zuletzt gestritten haben.

---

## 1. Der weiche Deckel – und warum 0,15 zu viel ist

`cap + (damped − cap) × soft` statt `min(damped, cap)`. Gemessen an den beiden
Zielgrößen aus dem Auftrag:

| Faktor | verschiedene Tempi | Precision-Spreizung | Ausweich-Index @300 (Lancer) | @450 |
|---|---|---|---|---|
| 0 (hart) | 15 | 1,00× | 1,26 | 3,78 |
| 0,04 | **21** | 1,02× | 1,12 | 3,57 |
| **0,06** | **21** | 1,03× | **1,06** | 3,47 |
| 0,08 | 21 | 1,04× | 0,99 | 3,37 |
| 0,10 | 21 | 1,06× | 0,93 | 3,28 |
| 0,15 | 21 | 1,08× | **0,79** | 3,05 |

**Die Ordnung ist schon ab 0,04 vollständig zurück** – alle Klassen mit
verschiedenem Rohtempo haben wieder verschiedene Werte. Mehr Weichheit kauft
dafür nichts; sie kauft nur Tempo an der Spitze. Und dort steht die Zusage aus
Paket 17: **ausweichbar auf jeder Distanz, also Index ≥ 1.** Zwischen 0,08 und
0,10 fällt der Index unter 1.

**Deshalb 0,06 und nicht 0,15** – die Mitte des Plateaus, auf dem beides gilt.
Mein eigener Vorschlag von 0,15 war geschätzt, nicht gerechnet; er hätte die
Zusage gebrochen, die ich im selben Bericht gegeben habe.

Ergebnis für Precision auf Level 45 (ohne Upgrade): Hunter 685, Sniper 696,
Arbalest 691, Deadeye 712, Railgun 719, Phantom 727, **Lancer 742**. Vorher
alle sieben 670. Die Spitze liegt bei 1,66× Spielertempo – vor Paket 14 waren
es 4,36×.

Ein Test hält die Zusage fest: Klassen mit verschiedenem Rohtempo haben
verschiedene Endtempi, und innerhalb von Precision stimmt die Reihenfolge. Die
Mutationsprobe (Deckel wieder hart) macht drei Tests rot.

---

## 2. KL5: die Familienbilanz – mit einem Befund, der nicht vom Tempo kommt

### Der Aufbau, und warum er anders ist als beim ersten Versuch

Der Lasttest ist für diese Frage das falsche Werkzeug: Seine Clients kommen in
300 s kaum aus Core heraus, und Core sammelte 293–308 von ~600 Toden. Statt auf
04s Startlevel zu warten, habe ich die Messung in eine **reine Bot-Arena**
verlegt, die headless und schneller als Echtzeit läuft (`.probe/kl5-familien.mjs`):
16 Bots, 20 Simulationsminuten je Lauf, drei Läufe je Konfiguration, Zahlen aus
`telemetryReport`. Bots leveln durch und erreichen alle vier Familien.

**Der Preis, klar benannt: Es sind Bots, keine Menschen.** Was hier steht, ist
eine Aussage über die Simulation, nicht über Sams Spielgefühl.

```
KONFIGURATION      FAMILIE    KILLS  DEATHS    K/D   LEBEN   je Lauf (K/D)
alles an (heute)   rapid        362     319   1.13     49s   1.05  1.31  1.04
alles an (heute)   impact        51     244   0.21     28s   0.24  0.14  0.25
alles an (heute)   precision    349     268   1.30     50s   1.44  1.09  1.39
alles an (heute)   control      142     139   1.02     40s   0.90  0.90  1.25
alles an (heute)   core         379     350   1.08     11s   1.17  1.15  0.95

ohne Signatures    rapid        254     374   0.68     43s   0.55  0.80  0.68
ohne Signatures    impact        54     238   0.23     27s   0.27  0.21  0.21
ohne Signatures    precision    571     240   2.38     54s   2.37  2.47  2.31
ohne Signatures    control      101     143   0.71     36s   0.63  0.61  0.85
ohne Signatures    core         388     417   0.93     10s   1.04  0.82  0.93

ohne Tempo 2.0     rapid        365     337   1.08     50s   1.35  1.02  0.90
ohne Tempo 2.0     impact        45     234   0.19     27s   0.23  0.22  0.13
ohne Tempo 2.0     precision    397     283   1.40     48s   1.18  1.37  1.70
ohne Tempo 2.0     control      154     120   1.28     46s   0.95  1.13  1.88
ohne Tempo 2.0     core         391     401   0.98     11s   0.99  1.12  0.84
```

### Befund 1: **Impact ist tot – und nichts davon ist neu**

K/D **0,19 bis 0,23** in allen drei Konfigurationen, über neun Läufe, ohne eine
einzige Ausnahme (Einzelwerte 0,13 bis 0,27). Die kürzeste Lebensdauer aller
Familien (27–28 s gegen 40–54 s). Impact stirbt vier- bis fünfmal so oft, wie es
tötet.

**Und es liegt weder an der Wucht noch am Tempo:** ohne Signatures 0,23, ohne
Tempo 2.0 0,19, mit allem an 0,21. Das ist kein Effekt unserer letzten vier
Pakete, sondern ein Zustand, der schon vorher da war und den bis jetzt niemand
gemessen hat. Genau dafür ist eine Balance-Runde da.

**Vorsicht bei der Deutung:** Impact-Bots fahren per Bauart in den Gegner
hinein – der Brawler-Stil hat `preferredDistance: 80`. Ein Mensch mit einem
Rammer spielt anders. Die Zahl beweist, dass die Familie **in der Simulation**
verliert; ob ein Mensch dasselbe erlebt, kann nur Sam sagen. Bevor jemand an
Impact dreht, sollte das jemand gespielt haben.

### Befund 2: Die Signatures wirken – und zwar in beide Richtungen

Hier überlappen die Einzelwerte **nicht**, das sind echte Effekte:

| Familie | ohne Signatures | mit | Einzelwerte |
|---|---|---|---|
| Rapid | 0,68 | **1,13** | 0,55–0,80 gegen 1,04–1,31 |
| Control | 0,71 | **1,02** | 0,61–0,85 gegen 0,90–1,25 |
| Precision | **2,38** | **1,30** | 2,31–2,47 gegen 1,09–1,44 |
| Impact | 0,23 | 0,21 | überlappend – kein Effekt |

Momentum und Einheiten-Budget heben ihre Familien deutlich. **Der Ladeschuss
kostet Precision fast die Hälfte seines K/D** – und das ist keine schlechte
Nachricht: Ohne Signatures dominiert Precision mit 2,38 gegen ≤ 0,93 bei allen
anderen. Der Ladeschuss ist damit der einzige Eingriff, der eine reale
Dominanz abgebaut hat. Dass er Schaden kostet, war Absicht (Klick-Sockel 0,45);
dass er so viel kostet, war nicht vorhersehbar.

Nach den Dominanzschwellen aus Paket 12 – auf Familien-K/D angewandt, nicht auf
Upgrade-Slots – steht es mit allem an: Impact **tot** (0,21), Control 1,02,
Rapid 1,13, Precision 1,30 knapp über der oberen Schwelle. **Drei von vier
Familien liegen jetzt innerhalb eines Bandes von 1,02 bis 1,30**; ohne
Signatures war die Spanne 0,68 bis 2,38.

### Befund 3: Projektiltempo 2.0 verschiebt die Familienbilanz nicht

„alles an" gegen „ohne Tempo 2.0": rapid 1,13/1,08, impact 0,21/0,19,
precision 1,30/1,40, control 1,02/1,28, core 1,08/0,98 – **jede Differenz liegt
innerhalb der Streuung der Einzelläufe.** Das Tempo ändert, wie sich Gefechte
anfühlen, aber nicht, wer sie gewinnt. Für die Diskussion der letzten zwei
Runden heißt das: Wir haben über Spielgefühl gestritten, nicht über Balance –
und das war richtig so, denn Sams Beschwerde war eine über Spielgefühl.

---

## Von 01 gebraucht

1. **Impact braucht eine eigene Runde.** K/D 0,21 über neun Läufe, unabhängig
   von allem, was wir zuletzt gebaut haben. Ich schlage vor: erst spielen
   lassen (Sam, ein paar Minuten Rammer), dann messen, dann drehen. Wenn du
   willst, liefere ich vorher eine Analyse wie beim Projektiltempo – die Zahlen
   dafür sind da.
2. **Precision liegt mit 1,30 knapp über der Schwelle**, aber deutlich näher an
   den anderen als vorher (2,38). Ich würde **nicht** nachschärfen: Der
   Ladeschuss hat gerade erst zugeschlagen, und Sam hat ihn noch nicht beurteilt.
3. **Der Faktor 0,06 steht ohne Flag auf dem Branch**, wie beauftragt. Wenn du
   ihn anders willst, ist es eine Konstante; die Tabelle oben zeigt, was jeder
   Wert kostet.
4. **04s Startlevel bleibt nützlich**, ist aber nicht mehr blockierend – die
   Bot-Arena beantwortet die Familienfrage schneller und billiger. Für Fragen,
   bei denen es auf **Menschen** ankommt, bleibt es die richtige Zulieferung.
5. **Nichts aufgefallen, was nach Client aussieht.** Die Messung läuft
   headless, sie sieht die UI nicht.

## Abweichungen vom Auftrag

1. **Faktor 0,06 statt der von mir selbst vorgeschlagenen 0,15.** Begründung
   und Tabelle oben – 0,15 hätte meine eigene Zusage „ausweichbar auf jeder
   Distanz" gebrochen.
2. **Die Familienbilanz kommt aus einer Bot-Arena, nicht aus dem Lasttest.**
   Schneller, mehr Daten, aber es sind Bots. Der Vorbehalt steht bei Befund 1,
   wo er zählt.
3. **Ich habe an Impact nichts geändert**, obwohl der Befund eindeutig ist. Eine
   Familie, die in der Simulation viermal so oft stirbt wie sie tötet, kann an
   der Bot-Steuerung liegen – und „erst Zahlen, dann Code" heißt hier: erst ein
   Mensch am Steuer.

## Geänderte Dateien

| Datei | Was |
|---|---|
| `apps/server/src/projectile-speed.ts` | `softCapped` + `PROJECTILE_SPEED_CAP_SOFTNESS` (0,06) |
| `apps/server/src/projectile-speed.test.ts` | Deckeltest umgestellt, neuer Reihenfolge-Test |

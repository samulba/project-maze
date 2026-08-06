# 14 – Projektiltempo 2.0

**Branch:** `claude/chat-02-server-gameplay-w1i4o8` (neu von `origin/main`, nachdem KL4 gemerged war)
**Basis:** `origin/main` @ `cd9585f` · **Flag:** `PROJECTILE_SPEED_V2`, Default aus
**Auftrag:** `docs/status/chat-01/auftrag-chat-02.md` (3. Fassung)

Erst die Analyse, wie verlangt – sie hat den naheliegenden Weg gekippt. Danach
der Code, der aus ihr folgt.

---

## 1. Analyse: der naheliegende Weg funktioniert nicht

Sams Forderung „Grundtempo runter, spürbar" heißt technisch: den Dämpfer von
`0.75` weiter absenken. Ich habe das durchgerechnet und **verworfen**, wegen
einer einzigen Zahl:

| | |
|---|---|
| Schnellster überhaupt baubarer Spieler | **447 px/s** (Comet mit Leichtbau-Rahmen, Bewegung 8) |
| Fortress-Projektil heute | **450 px/s** |

**Die langsamen Klassen haben keinen Spielraum nach unten.** Ein Fortress-
Projektil ist heute drei Pixel pro Sekunde schneller als der schnellste Spieler.
Es braucht schon jetzt 3,3 Sekunden, um ein mit 360 px/s fliehendes Ziel über
300 px einzuholen; bei einem stärkeren Dämpfer holt es es **nie** ein. Ein
globaler Dämpfer macht Weglaufen zur dominanten Strategie – und trifft dabei
ausgerechnet die Klassen, über die sich niemand beschwert hat.

### Das Problem ist die Spreizung, nicht der Mittelwert

Kugeltempo als Vielfaches des schnellsten Spielers, heute:

| Klasse | Zweig | 0 Punkte | 8 Punkte |
|---|---|---|---|
| Fortress | impact | **1,01×** | 1,33× |
| Juggernaut | impact | 1,04× | 1,37× |
| Core | core | 1,38× | 1,82× |
| Storm | rapid | 1,44× | 1,91× |
| Sniper | precision | 2,42× | 3,19× |
| Railgun | precision | 2,86× | 3,77× |
| **Lancer** | precision | **3,30×** | **4,36×** |

Faktor vier zwischen unterem und oberem Ende. Unfair ist das obere Ende.

### Ausweichbarkeit, gemessen

Kennzahl: Wie weit kommt ein ausweichendes Ziel (Rapid mit Bewegung 8,
360 px/s, aus dem Stand mit echter Beschleunigung) seitlich, während die Kugel
fliegt – nach 0,25 s Reaktion, gemessen in Trefferbreiten
(Spielerradius + Kugelradius). **Unter 1,0 ist die Kugel nicht ausweichbar.**

| Klasse, 8 Punkte | @300 px | @450 px |
|---|---|---|
| Core | 0,52 | 2,72 |
| Storm | 0,40 | 2,49 |
| Gatling | 0,36 | 2,41 |
| Sniper | 0,00 | 0,15 |
| Deadeye | 0,00 | 0,03 |
| Railgun | 0,00 | 0,01 |
| Lancer | 0,00 | 0,00 |

Sams Befund ist damit belegt und zugleich **präzisiert**:

1. **Precision ist auf keiner Distanz ausweichbar** – auf 450 px nicht, auf
   300 px erst recht nicht. Das ist der harte Kern des Fairness-Problems.
2. **Das Upgrade ist der zweite Teil.** Es hebt jede Klasse um 32 % und drückt
   die Rapid-Linie auf kurzer Distanz von 1,8 (ausweichbar) auf 0,4
   (nicht ausweichbar). Sams „umso stärker, umso unfairer" ist genau das.
3. Auf mittlerer Distanz sind die Massenklassen schon heute gut ausweichbar
   (2,4–2,7). Dort ist das Tempo nicht das Problem.

### Der tote Slot, den 01 befürchtet hat – er ist heute schon halb tot

Das Tempo-Upgrade verlängert nebenbei die **Reichweite** um 32 % (die
Lebensdauer bleibt, das Tempo steigt). Dieser Bonus ist fast wertlos: Zielen
lässt sich nur bis `maxAimDistance` = 650 px, sehen bis `viewRadius` = 1100 px –
und eine Core-Kugel fliegt schon ohne Upgrade **1271 px** weit. Ein Railgun mit
vollem Upgrade käme auf 4405 px in einer 6000 px breiten Arena.

Damit fällt eine der drei von 01 vorgeschlagenen Auflösungen weg: **„Der Slot
wird zu Reichweite/Präzision umgedeutet" wäre ein toter Slot** – die Währung
Reichweite ist bereits gesättigt.

---

## 2. Der Vorschlag: drei Regeln statt eines Dämpfers

Jede Regel beantwortet genau eine Frage.

| Regel | Wert | Aufgabe |
|---|---|---|
| **Dämpfer** | ×0,70 für alle Zweige | „overall zu schnell". Precision verliert die Sonderbehandlung (0,9) – dort war die Kugel am unfairsten. |
| **Deckel** | 2,6× → 1,8× Spielertempo über Level 1…45 | „je stärker, desto langsamer". Bindet genau bei den Klassen, die zu schnell sind. |
| **Boden** | 1,25× Spielertempo, **nie über dem heutigen Wert** | Keine Kugel wird so langsam, dass sie ein fliehendes Ziel nicht mehr einholt. |
| **Upgrade** | +2,5 %/Punkt statt +4 %, **nach** dem Deckel | Der Slot bleibt in jeder Klasse gleich viel wert (+20 %). |

Zwei Entwurfsentscheidungen, die den toten Slot verhindern:

- **Das Upgrade rechnet nach dem Deckel.** Vor ihm wäre es für jede
  Precision-Klasse wirkungslos – sie liegen alle am Deckel. Ein Test hält das
  fest: Das Verhältnis „8 Punkte / 0 Punkte" ist in **jeder** Klasse exakt 1,20.
- **Der Boden liegt nie über dem heutigen Tempo.** Sonst hätte die Änderung
  Impact-Klassen *beschleunigt*. Sie bleiben ohne Upgrade unverändert.

### Ergebnis (Level 45, volles Tempo-Upgrade)

| Klasse | heute | neu | Änderung | Ausweich-Index @300 | @450 |
|---|---|---|---|---|---|
| Lancer | 1948 | 965 | **−50 %** | 0,00 → 0,12 | 0,00 → **1,47** |
| Phantom | 1782 | 965 | −46 % | 0,00 → 0,13 | 0,00 → 1,57 |
| Railgun | 1687 | 965 | −43 % | 0,00 → 0,13 | 0,01 → 1,52 |
| Deadeye | 1604 | 965 | −40 % | 0,00 → 0,13 | 0,03 → 1,57 |
| Sniper | 1426 | 965 | −32 % | 0,00 → 0,13 | 0,15 → 1,57 |
| Storm | 851 | 722 | −15 % | 0,40 → **1,03** | 2,49 → 3,70 |
| Core | 812 | 689 | −15 % | 0,52 → **1,25** | 2,72 → 3,95 |
| Fortress | 594 | 540 | −9 % | 1,85 → 2,40 | 4,60 → 5,43 |

Auf mittlerer Distanz wird **jede** Klasse ausweichbar; auf kurzer Distanz
kippen die Massenklassen über die Schwelle. Precision bleibt auf 300 px
nicht ausweichbar – dazu unten mehr, das ist Absicht und Grenze zugleich.

Die Levelkurve (Lancer, ohne Upgrade): 1148 px/s auf Level 1 → 1089 (L10) →
975 (L24) → 861 (L38) → **804** (L45).

### Was Precision das kostet – die Zahl getrennt, wie verlangt

Precision zahlt jeden Fehlschuss mit einer kompletten Ladephase; das war meine
eigene Begründung für den milderen Dämpfer in Paket 07. Diese Begründung gilt
weiter, und die Änderung geht trotzdem bewusst gegen sie – weil dieselbe
Eigenschaft die Familie zur einzigen macht, deren Kugeln **gar nicht**
ausweichbar sind.

Der Preis, konkret für Lancer auf 450 px:

| | heute | neu |
|---|---|---|
| Flugzeit | 0,305 s | 0,560 s (**+84 %**) |
| Fehlschuss eines Schützen, der zu 80 % vorhält | 22 px | **40 px** |
| Trefferbreite | 32 px | 32 px |

**Aus einem Treffer wird ein Fehlschuss.** Ein Precision-Spieler muss nach der
Änderung um 84 % besser vorhalten, um dieselbe Trefferquote zu halten. Das ist
ein echter Könnensanspruch, kein Nebeneffekt – und der Punkt, an dem 01 oder Sam
widersprechen sollten, wenn sie ihn nicht wollen. Der Dämpfer für Precision ist
eine Konstante (`PROJECTILE_SPEED_DAMPER` wirkt heute auf alle Zweige gleich);
ein eigener, milderer Wert für Precision ist eine Zeile.

---

## 3. Die Bots – gemessen, nicht vermutet

01 hat zu Recht gewarnt: Langsamere Kugeln heißen längere Flugzeit, und der
absolute Vorhaltfehler eines Bots ist `Zieltempo × Flugzeit × (1 − leadFactor)`.
Er **wächst also linear mit der Flugzeit**. Ohne Gegenmaßnahme träfen die Bots
still schlechter.

Der Ausgleich hebt den Vorhaltfaktor genau so weit an, dass der absolute Fehler
derselbe bleibt wie bei einer Bezugsflugzeit von 0,35 s – und **nur** in diese
Richtung: Bei kurzen Flugzeiten bleibt alles, wie es war. Ein Test prüft, dass
der Fehler über Flugzeiten von 0,4 s bis 1,4 s konstant bleibt und der Faktor
nie über den perfekten Vorhalt hinausläuft.

**Messung** (`.probe/speed-sim.mjs`, 12 Bots, 3 Simulationsminuten, **3 Läufe je
Konfiguration**, Formen vorhanden – ohne sie leveln die Bots nicht und schießen
kaum):

| | ohne Flag | mit Flag |
|---|---|---|
| Schüsse | 5693 – 5833 | 5393 – 6043 |
| Trefferquote auf Spieler | 6,52 – 6,67 % | 5,81 – 6,82 % |
| lebende Projektile je Tick | 37,1 – 43,6 | 40,9 – 43,3 |
| ms je Tick | 0,958 – 1,057 | 0,809 – 0,944 |

**Die Trefferquote bleibt innerhalb der Streuung** – der Ausgleich tut, was er
soll. Die Bereiche überlappen; ein Lauf je Konfiguration hätte hier jedes
beliebige Vorzeichen „gezeigt".

### Kosten: keine – vermutlich sogar eine Ersparnis

Die ms/Tick liegen **mit** Flag niedriger, und dafür gibt es einen Mechanismus,
nicht nur eine Zahl: `stepProjectiles` bestimmt die Zahl der Substeps aus dem
**schnellsten** Projektil im Flug (`ceil(v_max · dt / 10)`, gedeckelt bei 12).
Ein Lancer-Projektil mit 1948 px/s erzwingt bei 25 ms Tick fünf Substeps, mit
965 px/s nur noch drei – und in **jedem** Substep wird die gesamte
Projektilliste durchlaufen. Die längere Lebensdauer hebt die Zahl lebender
Projektile leicht an (+6 %, innerhalb der Streuung), die gesparten Substeps
überwiegen. Ich schreibe die Ersparnis trotzdem nicht als Ergebnis fest: Beide
Bereiche überlappen. **Belastbar ist: kein Kapazitätsproblem.**

### Was ich nicht messen konnte

Ein kontrollierter Duell-Prüfstand (ein Bot schießt auf ein ausweichendes Ziel
in festem Abstand) **hat nicht konvergiert**: Dieselbe Konfiguration lieferte in
aufeinanderfolgenden Läufen 0 und 1304 Schüsse, weil die Zielerfassung der Bots
an Sichtlinie, Entscheidungstakt und Laufband-Rücksetzung hängt. Ich habe die
Zahlen deshalb **verworfen** statt sie zu berichten. Wenn eine belastbare
Trefferquote je Klasse gebraucht wird, gehört sie an 04s Lastprobe mit echten
Clients – nicht in eine selbstgebaute Duellschleife.

---

## 4. Code

| Datei | Was |
|---|---|
| `apps/server/src/projectile-speed.ts` | **neu** – die drei Regeln, der Vorhalt-Ausgleich, der Schalter |
| `apps/server/src/projectile-speed.test.ts` | **neu** – 11 Tests |
| `apps/server/src/combat-tuning.ts` | `tunedStatsFor` holt Tempo und Lebensdauer von dort |
| `apps/server/src/bot-brain.ts` | Vorhalt-Ausgleich in der Zielrechnung |
| `apps/server/src/index.ts` | Flag, Schicht in der Kette, `/health` |
| `scripts/balance-report.mjs` | Block `PROJEKTILTEMPO 2.0 — AUSWEICHBARKEIT` |
| `.env.example`, `docs/DEPLOYMENT.md` | neuer Schalter |

**599 Tests grün** (11 neu), `npm run check` vollständig.

### Warum das ausnahmsweise keine Schicht um `MazeGame` ist

Das Tempo entsteht in `tunedStatsFor` – einer **reinen Funktion**, die von
`fire`, der Bot-Zielrechnung, den Debug-Werkzeugen und dem Balance-Report
aufgerufen wird, teils ganz ohne Bezug auf ein Spiel. Ein Monkey-Patch an einer
dieser Stellen ließe die anderen still auseinanderlaufen: Der Bot hielte auf ein
Tempo vor, mit dem seine Kugel gar nicht fliegt. Deshalb steht die Entscheidung
in `tunedStatsFor`, und der Schalter ist **prozessweit** statt am Spiel.

Der Preis ist real und benannt: In Tests darf nie ein Spiel mit Schalter und
eines ohne gleichzeitig lebendig gemessen werden. `withProjectileSpeed` in den
Tests erzwingt das (setzt, misst, stellt im `finally` zurück), und ein
`afterEach` räumt zusätzlich auf. `tuneProjectileSpeed(game, flag)` steht
trotzdem in der Kette in `index.ts` – dort soll weiterhin alles stehen, was das
Spielgefühl verändert.

### Mutationsproben

| Mutation | Ergebnis |
|---|---|
| Deckel entfernt | 3 Tests rot |
| Upgrade **vor** dem Deckel gerechnet | 1 Test rot („in jeder Klasse gleich viel wert") |
| Vorhalt-Ausgleich auch nach unten | 1 Test rot („nur nach oben ausgleichen") |

Dazu ein Test, der für **jede** Klasse, jede der drei Upgrade-Stufen und drei
Levelstufen prüft, dass sich ohne Flag weder Tempo noch Lebensdauer um mehr als
1e-9 ändern.

---

## Von 01 gebraucht

1. **Entscheidung Precision.** Der Vorschlag nimmt Precision die
   Dämpfer-Sonderbehandlung. Das ist der schärfste Eingriff des Pakets
   (Lancer −50 %) und der einzige, der eine Familie im Kern trifft: 84 % besser
   vorhalten für dieselbe Trefferquote. Ich halte ihn für richtig – Precision ist
   die einzige Familie, deren Kugeln überhaupt nicht ausweichbar sind. Wenn Sam
   das anders sieht, ist ein eigener, milderer Precision-Dämpfer eine Zeile.
2. **Der Reichweitenbonus des Upgrades fällt weg** (heute +32 %, neu 0 %). Ich
   halte ihn für wertlos (Zielweite 650, Sicht 1100, Core-Kugel schon 1271) –
   aber es ist eine stillschweigende Zusatzänderung, und die soll nicht
   unbemerkt durchgehen.
3. **Der Ausweich-Index steht und fällt mit der angenommenen Reaktionszeit**
   (0,25 s). Bei 0,15 s wären auch heute mehr Kugeln ausweichbar, bei 0,35 s
   fast keine. Die Zahl ist eine Annahme, keine Messung – 04 könnte sie aus den
   Client-Metriken belegen.
4. **Für 03: nichts.** Die Änderung ist rein serverseitig; die Client-Prediction
   betrifft nur die Spielerbewegung, nicht Projektile.

## Abweichungen vom Auftrag

1. **„Grundtempo runter, spürbar" ist nicht als globaler Dämpfer umgesetzt.**
   Begründung in Abschnitt 1: Für die Impact-Linie gibt es keinen Spielraum. Der
   Dämpfer sinkt auf 0,70, den Rest macht der Deckel – der genau die Klassen
   trifft, die zu schnell sind.
2. **Von 01s drei Auflösungsvorschlägen habe ich den dritten gebaut** („Tempo
   fällt mit dem Level, das Upgrade bremst den Abfall") – in der Fassung
   „Deckel fällt mit dem Level, Upgrade rechnet dahinter". Den ersten
   (Umdeutung zu Reichweite) habe ich mit Zahlen verworfen, den zweiten
   (Slot neu belegen) nicht verfolgt: Er wäre eine eigene Design-Runde.
3. **Der Levelabfall trifft die Massenklassen nicht.** Der Deckel bindet dort
   nie – Core liegt mit 1,28× weit darunter. „Je stärker, desto langsamer" gilt
   für sie nur über das flachere Upgrade. Wer den Levelabfall auch dort spüren
   will, senkt `PROJECTILE_SPEED_CAP_LOW` von 1,8 auf 1,35; dann beginnt der
   Deckel bei Storm und Gatling zu greifen. Ich habe es nicht getan, weil bei
   1,35× alle Klassen auf denselben Wert zusammenlaufen und die
   Klassenidentität verlieren.
4. **Prozessweiter Schalter statt Schicht** – Begründung oben.

# 13 – Deploy-Wache scharf gemacht, Projektiltempo gemessen

| | |
| --- | --- |
| **Auftrag** | `docs/status/chat-01/auftrag-chat-04.md` (4. Fassung, 2026-08-06) |
| **Branch** | `claude/chat-04-infra-betrieb-ihx0xz` |
| **Basis** | `origin/main` (`7ecbc90`) |
| **Tests** | `npm run check` grün – 52 Dateien, 707 Tests |
| **Status** | **offen – wartet auf Review und Merge** |

---

# TEIL 1: Die Deploy-Wache unterscheidet jetzt drei Fälle

Umgesetzt wie beauftragt. Die Wache wertet `uptimeSeconds` aus und trennt
damit zwei Befunde, die sich dasselbe Symptom teilen:

| Befund | Ergebnis | Bedeutung |
| --- | --- | --- |
| `commit` stimmt | **grün** | Der Stand ist live. |
| `commit` stimmt nicht, Prozess frisch hochgekommen | **grün + Warnung** | Der Deploy **ist** angekommen, die Anzeige lügt. |
| `commit` stimmt nicht, Prozess läuft seit Stunden | **rot** | Jetzt ist es wirklich ein Deploy-Stopp. |

„Frisch hochgekommen" wird an drei Signalen erkannt, nach Verlässlichkeit
geordnet:

1. **Die Laufzeit ist zwischen zwei Abgriffen zurückgesprungen** – dann gab es
   sicher einen Neustart.
2. **`deploymentId` hat gewechselt** – 01s Feld, genau dafür gebaut.
3. `uptimeSeconds` liegt unter `FRESH_UPTIME_SECONDS` (Standard 900 s) – dann
   kann der Prozess nicht schon vor dem Push gelaufen sein.

Der mittlere Fall bleibt bewusst **grün** und meldet sich als
GitHub-Warnung. Die Begründung steht im Auftrag und ich teile sie: Eine Wache,
die dauerhaft rot steht, wird nach drei Tagen ignoriert – und meldet dann auch
den echten Stillstand nicht mehr.

Zwei Fälle bleiben rot: der Timeout mit altem Stand, und ein `/health` ohne
Commit-Angabe. Ohne die kann die Wache nichts beweisen, und eine Wache, die im
Zweifel grün meldet, ist schlimmer als keine.

Die Laufzeit steht ab jetzt lesbar in jeder Zeile – „läuft seit 3.1 Tagen"
statt „271844 s".

## Beim Testen gefunden: eine stille Falle in meinem eigenen Code

Der Commit-Vergleich war **exakt**. `/health` kürzt heute selbst auf sieben
Zeichen, also ging das gut. Wer diesen Schnitt dort einmal entfernt, hätte die
Wache lautlos lahmgelegt: Sie wäre gegen einen vollen SHA gelaufen und nie
wieder grün geworden – ohne dass jemand den Grund gesehen hätte, weil die
Meldung ja „Stand nicht angekommen" gelautet hätte. Jetzt werden beide Seiten
gekürzt, bevor verglichen wird. Aufgefallen ist es nur, weil ein Testserver den
vollen Hash lieferte.

## Verifiziert

Alle sechs Fälle **gegen einen Testserver gefahren**, nicht nur geschrieben:

| Fall | Erwartet | Ergebnis |
| --- | --- | --- |
| Commit stimmt | grün | ✔ Exit 0 |
| `/health` liefert vollen SHA | grün | ✔ Exit 0 (nach der Härtung) |
| Commit alt, Prozess seit 2 min | grün + Warnung | ✔ Exit 0, `::warning::` gesetzt |
| Commit alt, Laufzeit springt zurück | grün + Warnung | ✔ „die Laufzeit ist zurückgesprungen" |
| Commit alt, `deploymentId` wechselt | grün + Warnung | ✔ „die Deployment-Kennung hat gewechselt" |
| Commit alt, Prozess seit 3,1 Tagen | **rot** | ✔ Exit 1, Verdächtigenliste |
| `/health` meldet keinen Commit | **rot** | ✔ Exit 1 |

## Richtiggestellt: meine eigene Doku erzählte eine Legende

In `docs/DEPLOYMENT.md` stand von mir: *„Am 05.08. blieb der Auto-Deploy
stehen. Zwölf Commits landeten auf `main`, ohne live anzukommen."*

**Den Stillstand gab es nicht.** Railway hat durchgehend deployt, Sam hat es an
der Deploy-Historie gegengeprüft, und die Ursache waren kaputte
Freshness-Signale in `/health` – fehlendes `Cache-Control`, ein Festwert
(`build`), der aussieht wie eine Build-Kennung, und ein `commit`, das allein
nicht genügt. Ich habe die Stelle umgeschrieben; die Lehre lautet jetzt nicht
„der Deploy steht", sondern: **Ein Testprotokoll, dessen Frische man nicht
prüfen kann, erzeugt Diagnosen aus dem Nichts.**

Wäre das so stehengeblieben, hätte ausgerechnet die Betriebsdoku eine falsche
Ursache zementiert – und der nächste, der ein `/health` sieht, das alt aussieht,
hätte wieder bei den Watch-Paths angefangen zu suchen.

---

# TEIL 2: Was macht das Projektiltempo mit den Familien?

## Die kurze Antwort

**Der Lastlauf kann diese Frage nicht beantworten – und zwar aus zwei
konstruktiven Gründen, nicht wegen zu kleiner Stichprobe.** Das ist ein
Nullbefund über das Werkzeug, keiner über den Schalter.

## Der Aufbau

Gepaart wie in Bericht 12: Nur `PROJECTILE_SPEED_V2` wandert, alle übrigen
Schalter stehen fest auf ihrem heutigen Default (**an** – siehe Anmerkung
unten). Drei Runden, alternierend, je 10 Minuten, 40 Clients, Seeds
2001/2002/2003 beidseitig gleich.

## Das Ergebnis

Von zwanzig geprüften Kombinationen (fünf Familien × vier Kennzahlen) sind
**drei** in allen drei Runden gleichgerichtet. Bei reinem Zufall wären **fünf**
zu erwarten.

**Das Ergebnis liegt unter dem Zufallsniveau.** Es gibt in diesen Zahlen
keinen nachweisbaren Effekt des Projektiltempos auf K/D, Kills pro Minute,
Lebensdauer oder Familienbesetzung.

Zum Vergleich: Die Momentum-Messung aus Bericht 12 kam auf neun von zwanzig und
hatte mit der Rapid-Lebensdauer einen Befund, dessen drei Differenzen eng
beieinanderlagen. Hier gibt es nichts dergleichen.

## Warum – und das ist der eigentliche Befund

02s Vorhersage lautet: Der Deckel bindet bei den schnellen Klassen, der Boden
lässt die langsamen unberührt. Diese Vorhersage ist **nicht widerlegt**. Sie
ist mit diesem Werkzeug nicht prüfbar, weil beide Seiten der Arena gegen die
Änderung immun sind:

**1. Die Bots gleichen ihren Vorhalt aktiv aus.**
`apps/server/src/projectile-speed.ts` enthält `compensatedLeadFactor()`: Wird
die Kugel langsamer, wächst die Flugzeit und damit der absolute Vorhaltfehler
eines Bots – und genau das wird herausgerechnet. Das ist **Absicht** („damit
das Pacing nicht still verrutscht"). Ein Bot trifft mit `PROJECTILE_SPEED_V2`
per Konstruktion genauso gut wie ohne.

**2. Die Lasttest-Clients zielen im Random Walk.**
`scripts/loadtest.mjs`: `client.aimAngle += (rnd() - 0.5) * 0.9`. Sie zielen
nicht auf Gegner und halten nicht vor. Das Projektiltempo wirkt aber genau über
den Vorhalt – wer zufällig zielt, trifft zufällig, und langsamere Kugeln ändern
daran fast nichts.

Damit sind in der Arena **beide** Kill-Quellen unempfindlich gegen den
Schalter: die Bots per Design, die simulierten Clients mangels Zielverhalten.
Der Nullbefund ist genau das, was dieser Aufbau erzeugen muss.

**Die Wirkung, um die es 02 geht, entsteht bei einem Menschen, der vorhalten
muss.** Den hat der Lastlauf nicht.

## Greift der Schalter überhaupt?

Ein Nullbefund ist wertlos, wenn der Schalter gar nichts tut. Deshalb ein
zweiter, mechanischer Test, der ohne jedes Zielverhalten auskommt: Langsamere
Kugeln bei **gleicher** Reichweite sind länger in der Luft – also müssen mehr
gleichzeitig unterwegs sein. Je Konfiguration ein Lauf über zwei Minuten,
`/health` im Sekundentakt abgegriffen.

| Konfiguration | Projektile gleichzeitig (Median) | Spanne | Mittel |
| --- | --- | --- | --- |
| `PROJECTILE_SPEED_V2=true` | **94** | 43 – 132 | 93,3 |
| `PROJECTILE_SPEED_V2=false` | **67** | 38 – 105 | 68,5 |

**Faktor 1,40**, und die Verteilungen sind klar getrennt: 94 % aller
Abgriffe der Alt-Konfiguration liegen unter dem Median der V2-Konfiguration.
115 Abgriffe je Seite, gleicher Seed, gleiche Clientzahl.

**Der Schalter greift also deutlich** – die Kugeln sind langsamer und bleiben
entsprechend länger in der Luft. Der Nullbefund oben ist damit ein Befund über
die *Wirkung auf die Kampfstatistik*, nicht über den Schalter.

### Nebenbefund für die Kapazitätsplanung – der gehört mir

40 % mehr Projektile gleichzeitig sind 40 % mehr Entitäten, die in jedem Tick
bewegt und auf Kollisionen geprüft werden. Bericht 10 hatte den Preis eines
Projektils mit rund **0,023 ms** je Tick beziffert. Die hier gemessenen **+27
Projektile im Median** ergeben damit grob **+0,6 ms pro Tick** – rund
**2,5 Prozentpunkte** des 25-ms-Budgets.

Das ist bei der heutigen Auslastung kein Problem (die Simulation braucht ein
Zehntel des Budgets, der Flaschenhals ist der Snapshot-Versand). Es ist aber
**dauerhaft und additiv**: Der Schalter ist seit heute standardmäßig an, und
mehr Projektile gehen auch in jeden Snapshot. Wenn später über Kapazität
gesprochen wird, gehört diese Zahl dazu.

## Bewertung der Kennzahlen selbst

Auch unabhängig vom Zielverhalten sind K/D und Kills/min für diese Frage
schlechte Messgrößen: Sie hängen an Zielwahl, Ausweichen, Klassenverteilung und
Zufall. Was das Projektiltempo direkt ändert, ist die **Trefferwahrschein-
lichkeit gegen ein bewegtes Ziel** – und die misst niemand.

Wenn eine Zahl gebraucht wird, führt der Weg über eine dieser drei Türen:

1. **Trefferquote als Telemetrie** – abgegebene Schüsse gegen Treffer, je
   Klasse. Das ist die Größe, die der Schalter direkt bewegt, und sie wäre auch
   live aussagekräftig. Baubar in meinem Revier.
2. **Ein zielender Testclient** – der Lasttest hält vor statt zufällig zu
   zielen. Ändert allerdings, was der Lasttest sonst misst, und braucht eine
   eigene Entscheidung.
3. **Live-Telemetrie mit echten Spielern** – die einzige Quelle, in der die
   Wirkung überhaupt so entsteht, wie sie gemeint ist.

Meine Empfehlung ist **1**: klein, additiv, und sie beantwortet die Frage auch
für alle künftigen Tempo-Änderungen. Ich habe sie nicht gebaut – das wäre ein
eigenes Paket und nicht beauftragt.

## Einschränkung, die ich schon einmal hatte – und wiederholt habe

`tempo-v2-r1` ist ein Ausreißer: Tick-Abstand p95 **56,9 ms** gegen 33,1 und
33,2 in den beiden anderen V2-Runden. Der Lauf fiel auf 12:48–12:58, mein
Typecheck und Commit auf 12:50. **Ich habe während der Messung auf derselben
Maschine gearbeitet – genau die Einschränkung, die ich in Bericht 11 notiert
und in Bericht 12 vermieden hatte.**

Für die Lastkontrolle heißt das: Der Bereich „V2: 33,06–56,94 ms" überlappt
zwar formal mit „alt: 32,66–33,17 ms", aber nur wegen dieses einen Laufs. Die
automatische Überlappungsprüfung hat das durchgewinkt – **sie ist zu naiv, ein
einzelner Ausreißer weitet den Bereich und lässt jeden Vergleich gültig
aussehen.** Ohne r1 liegen die V2-Läufe bei 33,06–33,16 und die Alt-Läufe bei
32,66–33,17; dann überlappen sie wirklich.

An der Kernaussage ändert das nichts – der Nullbefund liegt unter dem
Zufallsniveau, und die konstruktive Begründung hängt an keinem Messwert. Aber
die Prüfung selbst gehört geschärft (Median statt Spannweite, oder Ausreißer
ausweisen), und ich hätte die Maschine in Ruhe lassen müssen.

---

## Bewusste Abweichungen vom Auftrag

**1. Nur ein Schalter gemessen statt mehrerer.**
Der Auftrag stellte drei zur Wahl und ließ die Zahl offen. Ich habe
`PROJECTILE_SPEED_V2` genommen – den, der ausdrücklich am meisten interessiert
– und dafür drei Runden gefahren, statt drei Schalter mit je einer Runde. Bei
der in Bericht 11/12 gemessenen Streuung liefert ein einzelner Lauf je
Konfiguration nichts; drei halbe Messungen wären drei wertlose Messungen.

**2. Der Auftrag sagt, die drei Schalter seien „alle noch aus". Das stimmt
nicht mehr.**
`ef98cc3` und `a6b00e1` haben sie auf **Default an** (Opt-out) umgestellt,
offenbar nach dem Ausstellen des Auftrags. Ich habe entsprechend gemessen: alle
übrigen Schalter auf ihrem heutigen Default an, damit gemessen wird, was das
Tempo **im aktuellen Spiel** tut. Für die Aus-Seite muss `PROJECTILE_SPEED_V2`
jetzt ausdrücklich auf `false` gesetzt werden – Weglassen genügt nicht mehr.

**3. Ich habe einen zweiten, nicht beauftragten Test nachgeschoben** (den
mechanischen Wirksamkeitsnachweis). Ohne ihn wäre der Nullbefund angreifbar
gewesen: „vielleicht greift der Schalter schlicht nicht".

## Von 01 gebraucht

1. **Merge.** Die geschärfte Wache nützt erst auf `main` etwas.
2. **Für 02, zum Projektiltempo:** Die Rechnung ist nicht widerlegt – sie ist
   mit dem Lastlauf nicht prüfbar, weil `compensatedLeadFactor()` die Bots
   gegen genau diese Änderung immunisiert und die Lasttest-Clients nicht
   vorhalten. Wer eine Zahl will, braucht eine Trefferquote (Vorschlag 1 oben)
   oder echte Spieler. **Bitte den Nullbefund nicht als „das Tempo wirkt
   nicht" weitergeben** – das steht hier ausdrücklich nicht.
3. **Entscheidung nötig, falls die Zahl gebraucht wird:** Trefferquote als
   Telemetrie ist ein kleines, eigenständiges Paket. Sag Bescheid, dann baue
   ich es – ungefragt fange ich es nicht an.
4. Die Lastkontrolle in meinem Auswertungsskript ist zu naiv (Spannweite statt
   Median). Ich habe es im Bericht ausgewiesen; wer meine Zahlen nachrechnet,
   sollte es wissen.

## Für Sam

Nichts zu tun. Falls du die Kugeln weiterhin zu schnell findest: Die drei neuen
Regeln greifen nachweislich (mechanischer Test oben), sie sind seit heute
standardmäßig an, und `/health` zeigt unter `features.projectileSpeedV2`, ob
sie auf der Instanz laufen, die du gerade ansiehst.

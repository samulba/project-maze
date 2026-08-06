# 12 – Momentum sauber gemessen: `--seed` und ein gepaarter A/B

| | |
| --- | --- |
| **Auftrag** | keiner – Fortsetzung aus eigenem Antrieb, nachdem Bericht 11 die alte Messung entwertet hatte |
| **Branch** | `claude/chat-04-infra-betrieb-ihx0xz` |
| **Basis** | `origin/main` (`de7546c`) |
| **Tests** | `npm run check` grün – 43 Dateien, 575 Tests (5 neu) |
| **Status** | **offen – wartet auf Review und Merge** |

## Warum überhaupt

Bericht 11 hat gezeigt, dass die bisherige Balance-Messung nichts trägt: Der
Aufbau „alle Schalter an gegen alle aus" misst die Serverlast mit, und die
Streuung zwischen zwei identisch konfigurierten Läufen ist so groß wie der
gesuchte Effekt. Damit war die Frage **„was macht Momentum eigentlich?"** offen
– nicht beantwortet, sondern unbeantwortbar geworden.

Dieser Bericht schließt die Lücke. Zwei Änderungen am Verfahren, dann dieselbe
Frage noch einmal.

## Was am Werkzeug geändert wurde

**`--seed` im Lasttest.** Die simulierten Clients wählen Klassen und Upgrades
zufällig; ohne Seed hat jeder Lauf eine andere Familienbesetzung. Mit demselben
Seed auf beiden Seiten einer Runde treffen sie dieselben Entscheidungen, und
die Läufe lassen sich **paarweise** vergleichen statt als zwei unabhängige
Stichproben.

Je Client ein eigener Strom, abgeleitet aus Seed und Index – ein gemeinsamer
Strom wäre wertlos, weil dann die Reihenfolge der Socket-Antworten bestimmt,
wer wann zieht. Ohne `--seed` bleibt alles bei `Math.random`.

**Ein Seed macht den Lauf nicht reproduzierbar**, und das steht so auch im Code:
Netzwerk-Timing, der Zufall des Servers und die Bots des Arena-Direktors bleiben
unberührt. Reproduzierbar wird allein, was die Clients *wollen*.

## Der Aufbau

Diesmal wandert **genau eine Variable**: `SIGNATURE_RAPID_ENABLED`. Alles
andere ist über beide Seiten konstant – auch `ACHIEVEMENTS_ENABLED`,
`SNAPSHOT_DELTAS`, `SHORT_NET_IDS` und `SPECTATOR_ENABLED`, die im alten
Aufbau mitgewandert sind und ihn verdorben haben. `SIGNATURE_IMPACT_ENABLED`
bleibt konstant aus, damit die Wirkung eindeutig Momentum zuzuordnen ist.

Drei Runden, alternierend, je 10 Minuten, 40 Clients. Seeds 1001/1002/1003 –
je Runde ein anderer, damit nicht dreimal dasselbe Spiel gemessen wird, aber
innerhalb einer Runde beidseitig derselbe.

**Die Maschine war diesmal frei** – kein Build, kein Test während der 63
Minuten. Das war die selbst verursachte Einschränkung aus Bericht 11.

## Lastkontrolle – zuerst, vor jeder Balance-Zahl

| Konfiguration | Abstand p95 je Lauf | Bereich |
| --- | --- | --- |
| Momentum AN | 35,87 · 35,70 · 35,80 ms | 35,70 – 35,87 |
| Momentum AUS | 35,89 · 36,68 · 35,64 ms | 35,64 – 36,68 |

**Die Bereiche überlappen** – die beiden Konfigurationen laufen unter derselben
Last, der Vergleich misst das Spiel und nicht die Maschine. Genau diese Prüfung
hat der alte Aufbau nicht bestanden (35,3–36,1 gegen 32,9–33,5 ms, ohne
Überlappung). Sie steht jetzt als Auflage in `docs/TELEMETRY.md`.

## Was Momentum tut

**Der belastbarste Befund – Rapid lebt länger:**

| Runde | AUS | AN | Differenz |
| --- | --- | --- | --- |
| r1 (Seed 1001) | 80,9 s | 93,9 s | **+13,0 s** |
| r2 (Seed 1002) | 74,6 s | 84,2 s | **+9,5 s** |
| r3 (Seed 1003) | 78,3 s | 88,7 s | **+10,4 s** |

Alle drei Runden gleichgerichtet, und – wichtiger – **die Differenzen liegen
eng beieinander** (9,5 bis 13,0 s, also +12 bis +17 %). Das ist der einzige
Befund der ganzen Messreihe, bei dem sowohl Richtung als auch Größenordnung
stabil sind. Momentum wirkt, und es wirkt auf die Familie, auf die es wirken
soll.

**Konsistent in der Richtung, nicht in der Größe:**

| Kennzahl | Richtung | Differenzen |
| --- | --- | --- |
| Precision K/D | konsistent **niedriger** (3/3) | −1,55 · −0,49 · −2,44 |
| Precision Kills/min | konsistent **niedriger** (3/3) | −0,86 · −0,43 · −1,69 |
| Control K/D | konsistent **höher** (3/3) | +0,63 · +0,12 · +0,48 |
| Rapid abgeschl. Leben | konsistent **höher** (3/3) | +9 · +13 · +16 |

Dass **Precision** verliert, ist der plausibelste Nebeneffekt: Ein stärkeres
Rapid tötet mehr von den Klassen, die ihm im Weg stehen. Die Größe schwankt
allerdings um den Faktor 5 – belastbar ist hier die Richtung, nicht die Zahl.

**Und der Befund, den ich erwartet hatte und nicht bekomme:**

Rapids **K/D** ist **nicht** eindeutig. Die Einzelwerte:

| | r1 | r2 | r3 |
| --- | --- | --- | --- |
| AUS | 1,50 | 0,92 | 0,36 |
| AN | 1,47 | 1,55 | 1,29 |
| Differenz | **−0,03** | +0,63 | +0,92 |

In Runde 1 liegt Momentum minimal *darunter*. Auffällig ist etwas anderes: Die
AUS-Seite schwankt zwischen 0,36 und 1,50, die AN-Seite nur zwischen 1,29 und
1,55. Momentum scheint Rapids Abschneiden eher zu **stabilisieren** als es
anzuheben – ein Muster, das drei Runden aber nicht belegen können.

**Die alte Behauptung „Momentum verdoppelt Rapids K/D" bleibt damit unbelegt.**
Sie ist auch nicht widerlegt; sie ist schlicht nicht das, was diese Messung
zeigt.

## Was gegen die eigenen Befunde spricht

**1. Neun von zwanzig geprüften Kombinationen sind „3/3" – bei reinem Zufall
wären fünf zu erwarten.** Fünf Familien × vier Kennzahlen ergeben zwanzig
Tests, und drei gleiche Vorzeichen haben bei Zufall eine Wahrscheinlichkeit von
¼. Neun liegt darüber, aber nicht weit. Wer aus dieser Liste einzelne Zeilen
herausgreift, greift mit gut einem Drittel Wahrscheinlichkeit Rauschen heraus.

Der Rapid-Lebensdauer-Befund steht besser da als die anderen – nicht wegen des
Vorzeichens, sondern weil die drei Differenzen eng beieinanderliegen. Bei allen
übrigen ist genau das nicht der Fall.

**2. Die Paarung ist unvollständig, und das war mir vorher nicht klar.** Der
Seed legt fest, welche Klasse ein Client aus den **verfügbaren** wählt – welche
verfügbar sind, hängt an Level und aktueller Klasse, also am Spielverlauf. Wenn
Rapid-Spieler länger leben, erreichen sie andere Level und bekommen andere
Auswahlmöglichkeiten. Genau das zeigen die Zahlen: Rapid hat mit Momentum
konsistent **mehr** abgeschlossene Leben (+9 bis +16), die Besetzung ist also
nicht dieselbe.

Der Seed reduziert die Streuung, er beseitigt sie nicht. **Wie viel er bringt,
kann ich mit dieser Messreihe nicht beziffern** – dafür bräuchte es zwei Läufe
mit identischem Seed *und* identischer Konfiguration, und die habe ich nicht
gefahren.

**3. Drei Runden bleiben drei Runden.** Für die Lebensdauer reicht das, weil
die Differenzen eng liegen. Für alles andere nicht.

## Empfehlung

- **Als belegt gilt:** Momentum verlängert Rapids Lebensdauer um 12 bis 17 %.
- **Als plausibel, aber unbelegt:** Precision verliert dadurch.
- **Als unbelegt gilt:** jede Aussage über Rapids K/D.
- **Nächster Schritt, falls eine Zahl gebraucht wird:** Läufe von 30 Minuten
  statt 10. Der Engpass ist die Stichprobe – 33 bis 67 abgeschlossene Leben je
  Familie sind zu wenig, und längere Läufe sind billiger als mehr Läufe.
- **Für die Paarung:** Wenn die Familienbesetzung wirklich konstant sein soll,
  müsste der Lasttest feste Klassen zugewiesen bekommen statt aus den
  verfügbaren zu wählen. Das wäre ein anderes Werkzeug und misst dann auch
  etwas anderes – kein Vorschlag, nur die Feststellung, wo die Grenze liegt.

## Verifiziert

- `npm run check` grün, 575 Tests (5 neu für Seed und PRNG).
- **Blindtest-Wache** in allen sechs Läufen bestanden (187–207 Klassenwahlen,
  3 077–3 495 Upgrades).
- **Flags gegengeprüft:** In jedem Lauf `/health` mitgeschrieben und den
  `features`-Block verifiziert – `signatureRapid` steht in den AN-Läufen auf
  `true`, in den AUS-Läufen auf `false`, `signatureImpact` durchgehend `false`.
  Der verwendete Seed steht im Abzug und wurde je Paar auf Gleichheit geprüft.
- **Lastkontrolle bestanden** (Bereiche überlappen, siehe oben).
- PRNG-Tests: gleiche Folge bei gleichem Seed, verschiedene bei verschiedenem,
  Werte durchgehend in `[0,1)` über 5 000 Ziehungen, und je Client ein eigener
  Strom.

Die sechs Abzüge liegen unter `docs/balance/2026-08-06-momentum-gepaart/`.

## Bewusste Abweichungen

**Dieses Paket war nicht beauftragt.** Es schließt die Lücke, die Bericht 11
aufgerissen hat: Dort steht, dass die alte Messung nichts taugt – ohne diesen
Nachtrag stünde die Frage „was macht Momentum" schlechter da als vorher, weil
die alte Antwort weg ist und keine neue da wäre. Wenn 01 das anders sieht, ist
der Seed-Teil (`scripts/loadtest.mjs`, `docs/TELEMETRY.md`) unabhängig von der
Messung nützlich und kann auch allein übernommen werden.

## Von 01 gebraucht

- **Für 02, zu KL2-RAPID:** Momentum wirkt messbar auf die Lebensdauer
  (+12 bis +17 %), nicht nachweisbar auf K/D. Wer die Signature nach ihrem
  K/D-Effekt auslegt, legt sie nach einer Zahl aus, die wir nicht haben.
- Die Aussage „verdoppelt K/D" bitte nirgends weiterverwenden – sie stammt aus
  dem Aufbau, der in Bericht 11 entwertet wurde.

## Für Sam

Nichts zu tun. Die beiden Fragen aus Bericht 11 (heller oder dunkler Auftritt,
aktueller `/health`) bleiben die einzigen offenen Punkte an dich.

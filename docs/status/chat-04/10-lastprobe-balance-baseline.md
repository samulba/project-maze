# 10 – Lastprobe „alle Schalter an" + Balance-Baseline

| | |
| --- | --- |
| **Auftrag** | `docs/status/chat-01/auftrag-chat-04.md` → Lastprobe-Matrix + Balance-Baseline |
| **Branch** | `claude/maze-lastprobe-baseline-dfb335` |
| **Commit** | `8261c82` |
| **Basis** | `origin/main` (`2551d34`) |
| **Tests** | `npm run check` grün – 38 Dateien, 507 Tests (20 neu) |
| **Status** | **offen – wartet auf Review und Merge** |

## Der Kern in vier Sätzen

Die Matrix lief zuerst durch und meldete: „alle Schalter an kostet nichts". Das
war falsch – nicht wegen des Servers, sondern weil der **Lasttest mit
`SHORT_NET_IDS` blind wird** und eine geschönte Last misst. Nach der Korrektur
sind die Zahlen belastbar: die volle Ausstattung kostet rund ein Zehntel mehr
Tickzeit und spart 44 % Bandbreite, bei 11 % Auslastung des Tickbudgets.
Der Projektiltempo-Dämpfer, nach dem 02 gefragt hatte, kostet **anderthalb
Prozentpunkte Tickbudget**.

## Der Fehler im Messwerkzeug

Erster Durchgang, Median aus drei Runden: B und D (mit `SNAPSHOT_DELTAS` +
`SHORT_NET_IDS`) lagen beim Tick **unter** A und C und sparten scheinbar 43 %
Bandbreite. Zu gut. Der Blick auf den Lasttest-Bericht erklärte es:

| | Klassenwahlen je Lauf | Upgrades je Lauf |
| --- | --- | --- |
| ohne die Schalter (A, C) | 15–21 | 408–466 |
| mit `SHORT_NET_IDS` (B, D) | **0 / 0 / 0** | **0 / 0 / 0** |

Zwei Eigenheiten der Übertragungsebene, beide dokumentiert, beide vom Lasttest
ignoriert:

1. **`SHORT_NET_IDS` nummeriert alle Entitäts-IDs durch – auch
   `snapshot.selfId`. Die `welcome`-Nachricht trägt weiterhin die UUID.** Wer
   seine ID aus dem Welcome behält und im Snapshot danach sucht, findet sich
   nie wieder: kein Level, kein Upgrade, keine Klassenwahl, **kein Respawn nach
   dem Tod**.
2. **`SNAPSHOT_DELTAS` lässt Klasse und Upgrades weg, solange sie unverändert
   sind.** Fehlend heißt „unverändert", nicht „leer".

Gemessen wurde also eine Arena aus Level-1-Tanks ohne Upgrades, die nach dem
ersten Tod liegen blieben – weniger Projektile, weniger Drohnen, weniger
Arbeit. Im 10-Minuten-Lauf war der Unterschied brutal: **63 abgeschlossene Leben
statt 477**.

**Der ausgelieferte Client macht beides richtig** (`snapshot-hydrator.ts`
puffert die Statik und wandelt eine numerische `selfId`, `renderer.ts` und
`ui.ts` lesen sie aus dem Snapshot). Der Fehler lag allein im Messwerkzeug.
Behoben mit `readSelf()` in `scripts/loadtest.mjs` (6 neue Tests): ID aus dem
Snapshot, fehlende Felder behalten. **Alle Zahlen unten stammen aus der
Wiederholung nach der Korrektur.**

Die Lehre steht in `docs/TELEMETRY.md`: Ein Lasttest, der einen Schalter nicht
mitspielt, meldet keinen Fehler – er meldet zu gute Zahlen. Bei jeder Matrix
gehören `classChoicesSent` und `upgradesSent` deshalb auf den Prüfstand.

## Die Matrix

Vier Konfigurationen, drei Runden im Wechsel A–B–C–D (nicht blockweise, sonst
verschiebt Maschinendrift ganze Konfigurationen gegeneinander), 40 Clients,
60 s, 4-Kern-Maschine, Lasttest-Clients auf derselben Maschine. Median, in
Klammern die Spannweite.

| Lauf | Schalter | p50 | p95 | budgetRatio | Abstand p95 | KB/s je Client | Projektile ⌀ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **A** Referenz | keiner | 1,80 ms | 2,57 ms (2,26–2,77) | 0,103 | 26,7 ms | 230,8 (223,5–239,6) | 71 |
| **B** Bandbreite | Deltas + kurze IDs | 1,81 ms | 2,66 ms (2,55–2,71) | 0,106 | 28,1 ms | 123,6 (121,5–127,2) | 65 |
| **C** Signature | `SIGNATURE_RAPID_ENABLED` | 2,10 ms | 2,93 ms (2,75–3,27) | 0,117 | 26,0 ms | 237,6 (228,8–240,0) | 74 |
| **D** Alle an | alle fünf | 1,97 ms | 2,83 ms (2,60–3,07) | 0,113 | 26,8 ms | 129,1 (126,6–133,9) | 70 |

In allen zwölf Läufen: **40 von 40 Joins, keine Abbrüche, keine einzige
gedrosselte Nachricht**, Snapshot-Latenz p95 1 ms, Snapshot-Rate 30,5–30,6/s je
Client, rund 44 Tanks in der Arena.

### Gegen die alten Referenzwerte

| | README/TELEMETRY (05.08.) | jetzt (06.08.) |
| --- | --- | --- |
| KB/s je Client, ohne Schalter | 231,9 | 230,8 |
| KB/s je Client, mit beiden Bandbreiten-Schaltern | 127,4 (−45 %) | 123,6 (**−46 %**) |
| Tick p95 bei 40 Clients | 4,7 ms | 2,6 ms |
| budgetRatio | 0,19 | 0,10 |
| Tick-Abstand p95 | 34 ms | 27 ms |

Die Bandbreite ist maschinenunabhängig und stimmt auf unter ein Prozent – die
Messung von damals hält. Die CPU-Zeilen stammen von **verschiedenen Maschinen**
und sind nicht direkt vergleichbar; die Doku sagt das jetzt ausdrücklich, statt
eine Verbesserung zu behaupten, die niemand belegen kann.

### Drei Ablesungen

- **„Alle Schalter an" kostet rund ein Zehntel mehr Tickzeit** (p95 2,83 gegen
  2,57 ms) und spart 44 % Bandbreite. 11 % des 25-ms-Budgets – die Arena trägt
  die volle Ausstattung mit großem Abstand.
- **Die Signature „Momentum" ist der teuerste einzelne Schalter, aber knapp an
  der Nachweisgrenze.** C liegt in allen drei Runden über A, die Spannweiten
  berühren sich nur am Rand (A bis 2,77, C ab 2,75). Rund 0,3 ms Aufschlag ist
  plausibel, mit drei Runden **nicht bewiesen**. Passt zur Wirkung: mehr
  Feuerrate, mehr Projektile (74 gegen 71).
- **Der Tick-Abstand liegt weiter über dem 25-ms-Soll** (26–28 ms), während die
  Simulation selbst nur ein Zehntel des Budgets braucht. Der Flaschenhals ist
  weiterhin der Snapshot-Versand, nicht die Physik – die Lehre von Paket 02
  gilt unverändert.

## Kosten des Projektiltempo-Dämpfers (02s Frage)

Abschalten lässt er sich nicht (kein Flag), also über die Steigung: Tick-Mittel
gegen mittlere Projektilzahl über alle zwölf Läufe, kleinste Quadrate –
**0,023 ms je Projektil** (r = 0,70).

Der Dämpfer verlängert die Projektil-Lebenszeit um Faktor 1,33 (Precision
1,11). Das bringt bei der gemessenen Last rund **18 Projektile mehr in die
Luft**, also **+0,40 ms Tick-Mittel = anderthalb Prozentpunkte Tickbudget** bei
8 % Auslastung. Messbar und unkritisch: Bei 0,023 ms je Projektil wäre das
Budget erst bei über tausend gleichzeitigen Projektilen erschöpft, beobachtet
wurden im Spitzenwert 114.

Die Schranke mischt zwangsläufig die Drohnen mit ein, die mit den Projektilen
zusammen schwanken – daher r = 0,70 statt höher. Wer eine saubere Zahl will,
braucht ein temporäres Flag am Dämpfer und einen A/B-Lauf. Für die
Kapazitätsfrage reicht diese Schranke.

## Balance-Baseline

Zwei eingefrorene Abzüge unter `docs/balance/`, beide aus einem
10-Minuten-Lastlauf nach demselben Rezept, nur Aggregatzahlen:

| Datei | Konfiguration | Umfang |
| --- | --- | --- |
| `2026-08-06-baseline.json` | alle Schalter an | 268 Klassenwahlen, 494 Leben, 452 Kills |
| `2026-08-06-referenz.json` | alle Schalter aus | 256 Klassenwahlen, 477 Leben, 437 Kills |

Der Auftrag verlangte einen Abzug; der zweite kommt dazu, weil sich mit einem
einzigen nicht messen lässt, was Momentum bewirkt hat – der Baseline-Lauf hat
die Signature ja bereits an. Gegeneinander gehalten (Familienebene):

| Familie | Leben | K/D | ⌀ Leben | Kills/min |
| --- | --- | --- | --- | --- |
| Core | 242 → 245 | 0,57 → 0,59 | 25,6 → 25,0 s | 1,34 → 1,42 |
| **Rapid** | 66 → 69 | **0,76 → 1,90** | 57,1 → 60,2 s | **0,80 → 1,89** |
| Precision | 67 → 62 | 1,60 → 1,84 | 60,1 → 53,6 s | 1,59 → 2,06 |
| Control | 53 → 58 | 1,60 → 0,38 | 70,0 → 62,2 s | 1,37 → 0,37 |
| Impact | 49 → 60 | 1,16 → 0,67 | 91,6 → 76,2 s | 0,76 → 0,52 |

**Rapid – und nur Rapid – verdoppelt K/D und Kills pro Minute.** Genau die
Familie, auf die Momentum wirkt. Die Richtung stimmt.

**Das ist noch keine Messung.** Ein Lauf je Konfiguration, 49–69 abgeschlossene
Leben je Familie außerhalb von Core, und die simulierten Clients spielen
zufällig. Dass Control und Impact gleichzeitig einbrechen, kann Folge eines
stärkeren Rapid sein oder schlicht Streuung. Für eine belastbare Aussage
gehören mehrere Läufe je Konfiguration dazu – so wie bei der Matrix.

## Bewusste Abweichungen

- **Zwei Abzüge statt einem.** Begründung oben. Zusammen 72 KB.
- **`RATE_LIMIT_CONNECTIONS_PER_IP=200` im Lastlauf.** 40 Clients auf einem
  Host teilen sich `127.0.0.1`; mit dem Produktionswert 5 misst der Lauf den
  Rate-Limiter statt der Arena. Die *Nachrichten*budgets (Input 50/s) blieben
  unangetastet – deshalb ist „null Drosselungen" eine echte Aussage.
- **Kein eigenes Matrix-Skript im Repo.** Der Auftrag verlangte einen
  Doku-Abschnitt; der steht in `docs/TELEMETRY.md` mit kopierfertigen Befehlen
  und den vier Fallstricken. Der Runner lief als Wegwerf-Skript im
  Sitzungs-Scratchpad (TEAMPLAN-Regel 7).
- **Zwei kleine Ergänzungen außerhalb des Auftrags:** `scripts/balance-live.mjs`
  nennt beim Baseline-Vergleich jetzt beide Quellen, wenn sie sich
  unterscheiden (der wahrscheinlichste Fehlgriff ist, einen eingecheckten
  Lastlauf-Abzug gegen die Produktionsinstanz zu halten), und
  `.env.example`/`DEPLOYMENT.md` warnen bei `SHORT_NET_IDS` vor der
  `welcome`-Falle.

## Von 01 gebraucht

- **Review und Merge von Paket 10.** Ohne den Lasttest-Fix misst jede weitere
  Lastprobe mit `SHORT_NET_IDS` zu gute Zahlen.
- **Für 02:** Der Dämpfer kostet anderthalb Prozentpunkte Tickbudget – kein
  Kapazitätsproblem. Wer die exakte Zahl will, braucht ein temporäres Flag.
- **Für 03 und alle, die Werkzeuge gegen den Server bauen:** Die eigene
  Spieler-ID **immer aus `snapshot.selfId`** lesen, nie aus der
  `welcome`-Nachricht. Sobald `SHORT_NET_IDS=true` gesetzt wird, ist das der
  Unterschied zwischen „funktioniert" und „wirkt seltsam leblos, meldet aber
  keinen Fehler". Der ausgelieferte Client ist bereits korrekt – geprüft.
- **Für KL5:** Der Vergleich mit den eingefrorenen Abzügen läuft im Modus
  `VERGLEICH`, nicht `ZEITFENSTER`. Das ist richtig so: zwei getrennte
  Lastläufe sind zwei getrennte Prozesse, ihre Zähler bauen nicht aufeinander
  auf. `docs/balance/README.md` erklärt es.
- **Paket 08 (Client-Perf-Telemetrie) hängt weiterhin** und blockiert nichts
  davon.

## Für Sam

Nichts einzurichten – keine neue ENV, keine Migration, keine neue Dependency.

Ein Punkt für später: Wenn `SHORT_NET_IDS=true` in Produktion gehen soll, ist
der ausgelieferte Client dafür bereit (geprüft). Der Schalter spart rund 16 %
Bytes zusätzlich zu `SNAPSHOT_DELTAS`.

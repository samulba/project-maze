# 02 – Lasttest, Tick-Gesundheit, Graceful Shutdown

| | |
| --- | --- |
| **Branch** | `claude/maze-loadtest-tickhealth-shutdown-dfb335` |
| **Commit** | `fe41cae` |
| **Basis** | `origin/main` (`5803ce7`) |
| **Tests** | `npm run check` grün – 17 Dateien, 108 Tests (28 neu) |
| **Status** | gemerged |

## Was gebaut wurde

**`scripts/loadtest.mjs`** – N Clients über die echten Protokolle: join →
gerichteter Random-Walk mit `--rate` Hz (Default 40) → alle 2 s Upgrade und,
sobald das Level es zulässt, Klassenwahl. Ein gemeinsamer Scheduler statt N
Timern, Joins über `--ramp` verteilt, Messfenster startet erst danach.

Beim Bauen wurde ein Punkt interessant: **Snapshot-Latenz ist gegen einen
Remote-Server ohne Uhrabgleich nicht messbar.** Der Script schätzt darum per
Ping/Pong den Uhrversatz (`serverTime − (sentAt + rtt/2)`) und rechnet damit das
echte Alter jedes Snapshots aus. Der Report zeigt vier Reihen mit
p50/p95/p99/max: Snapshot-Alter, Snapshot-Abstand (Soll ~33 ms), RTT und
Join-Dauer – plus Join-Erfolg, Abbrüche mit Close-Codes und KB/s je Client.
Exit-Code 1 bei unerwarteten Fehlern; eine volle Arena ist ein Messergebnis,
kein Fehler.

**Tick-Gesundheit (`telemetry.ts`)** – `game.step` wird mit `performance.now()`
in einem allokationsfreien 60-s-Ringpuffer gemessen. Neben p50/p95/max wird der
**tatsächliche Tick-Abstand** exportiert – der hat sich als der eigentlich
aussagekräftige Wert erwiesen. Dazu `budget_ratio` (p95 ÷ 25 ms), `busy_ratio`,
Overruns und Tick-Zähler. Gemessen wird bewusst nur die Simulation, sonst würde
die Loadout-Erhebung alle 250 ms das p95 verzerren.

**`shutdown.ts`** – SIGTERM/SIGINT → `/health` meldet 503 (`draining: true`),
Timer stoppen, Listener schließt, alle WebSockets bekommen **Close-Code 1001**.
Wer den Handshake ignoriert, wird nach 1,5 s getrennt, harte Obergrenze 8 s,
zweites Signal bricht sofort ab.

## Verifiziert

Gegen einen echten lokalen Server (8 Bots), beide Werkzeuge gegeneinander
geprüft:

| Clients | Join | p50/p95 Tick | budgetRatio | p95 Tick-**Abstand** | Snapshot-Latenz p99 |
| --- | --- | --- | --- | --- | --- |
| 25 | 25/25 | 1,3 / 2,7 ms | 0,11 | 26 ms | 2,5 ms |
| 45 (Cap 40) | 40/40 + 5 abgewiesen | 1,9 / 4,7 ms | 0,19 | **34 ms** | 23,5 ms |

**Das Ergebnis ist die eigentliche Antwort auf die Kapazitätsfrage:** Bei voller
Arena ist die Simulation erst zu einem Fünftel ausgelastet – die Grenze setzt
der Snapshot-Versand (274 KB/s je Client, ~11 MB/s JSON bei 40 Spielern).
Sichtbar wird das nur am Tick-Abstand von 34 statt 25 ms, nicht an der
Tick-Dauer. Wer mehr Spieler pro Container will, optimiert den Snapshot-Pfad,
nicht die Physik. *(Caveat: Lasttest-Clients liefen auf derselben Maschine, die
Zahlen sind pessimistisch.)*

SIGTERM im laufenden Betrieb mit 6 verbundenen Clients: Server loggt
„6 WebSocket-Verbindung(en) mit Code 1001 geschlossen", der Lasttest meldet
unabhängig davon „Unerwartete Close-Codes 1001×6".

## Bewusste Abweichungen

- **Fund:** Der 503-Zustand war für einen externen Checker gar nicht
  erreichbar – der Listener schließt so schnell, dass nur noch „connection
  refused" ankommt. Für Railway ist das richtig so; für Setups mit eigenem
  Loadbalancer wurde `SHUTDOWN_DRAIN_MS` ergänzt (Default 0, ändert das
  Live-Verhalten also nicht).

## Von 01 gebraucht

Nichts.

## Für Sam

- Nichts Zwingendes. `npm run loadtest -- --clients 40 --duration 60` steht für
  Kapazitätsmessungen bereit – **nie gegen eine Arena mit echten Spielern**,
  er belegt reale Plätze.

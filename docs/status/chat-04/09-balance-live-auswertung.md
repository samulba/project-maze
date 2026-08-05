# 09 – Balance-Live-Auswertung (Vorbereitung Klassen 3.0 / KL5)

| | |
| --- | --- |
| **Auftrag** | `docs/status/chat-01/auftrag-chat-04.md` → Balance-Live-Auswertung |
| **Branch** | `claude/maze-balance-live-dfb335` |
| **Commit** | `263fd5c` |
| **Basis** | `origin/main` (`a36a0dd`) |
| **Tests** | `npm run check` grün – 37 Dateien, 487 Tests (44 neu) |
| **Status** | **offen – wartet auf Review und Merge** |

## Was gebaut wurde

`scripts/balance-live.mjs` (`npm run balance:live`) zieht
`/metrics?format=json` von einer laufenden Instanz und druckt vier Tabellen –
je Klasse, je Familie, je Core Module und je Frame – mit Pickrate, K/D,
mittlerer Lebensdauer und Kills/Minute. Dazu eine Watchlist der Ausreißer und
optional der Zeitvergleich gegen einen früheren Abzug.

```bash
npm run balance:live -- --url https://mazers.de                      # Sicht jetzt
npm run balance:live -- --url https://mazers.de --json > vorher.json # Abzug sichern
npm run balance:live -- --url https://mazers.de --baseline vorher.json
```

URL und Token kommen aus Argumenten (`--url`, `--token`) oder ENV
(`METRICS_URL`, `METRICS_TOKEN`). Voreingestellt ist `subject=human` – Bots
sollen die Balance-Sicht nicht verwässern.

Das Skript braucht **keinen gebauten Workspace, keine Datenbank und keine
Kenntnis des Klassenkatalogs**. Familie, Tier und Beschriftungen kommen aus dem
Export. Das ist Absicht: Sonst würde eine Auswertung gegen die Live-Instanz
gegen den Katalog der eigenen Arbeitskopie rechnen und bei jedem Klassen-Paket
still danebenliegen.

## Vier Entscheidungen, die den Ausschlag geben

**1. Klassen vergleichen sich mit ihrer Familie, nicht mit dem Feld.**
Wie beauftragt. Der Median wird je Familie gebildet – ein Impact-Tank wird
nicht daran gemessen, dass Rapid mehr Kills macht. Zusätzlich gibt es
`--peer tier`: Vergleich innerhalb derselben Stufe. Das ist die ehrlichere
Frage, sobald ein Tier-3-Endpfad auffällig aussieht, denn in seinem
Familien-Median hängen auch die schwächeren Vorstufen mit drin. Beides ist
einen Schalter voneinander entfernt, Default bleibt `family`.

**2. Dünne Stichproben werden markiert, nicht bewertet.**
Eine Klasse mit zwei Leben und drei Kills hätte bei jeder Schwelle eine
sensationelle K/D. Deshalb: Wer die Mindest-Stichprobe (`--min-samples`,
Default 5) nicht erreicht, geht **weder in den Median ein noch auf die
Watchlist** und bekommt ein `·` statt einer Marke. Jede Kennzahl hat dabei
ihre eigene Stichprobe – Pickrate zählt Picks, K/D zählt Deaths, Lebensdauer
und Kills/Minute zählen abgeschlossene Leben. Zusätzlich braucht eine
Vergleichsgruppe mindestens drei taugliche Zeilen, sonst ist ihr Median kein
Maß, sondern Zufall.

**3. `--baseline` rechnet ein Zeitfenster, keinen Durchschnittsvergleich.**
Die Zähler sind kumulativ. Zwei Gesamtdurchschnitte nebeneinanderzustellen
verwässert genau das, was man sehen will: Nach einer Änderung um 18:00 ist der
Gesamtschnitt um 22:00 noch immer zur Hälfte der alte Zustand. Der Abzug
enthält deshalb die **Rohzähler**, und der Vergleich rechnet `aktuell −
Baseline` und leitet daraus die Quoten neu ab. Gezeigt wird also, was *seit*
dem Abzug passiert ist, mit Δ gegen den Stand davor.

**4. Ein Neustart wird erkannt und ausgesprochen.**
Beim Redeploy fangen die Zähler bei null an – ein Fenster ist dann nicht
rekonstruierbar. Erkannt wird das an gesunkener Laufzeit *oder* an irgendeinem
gesunkenen Zähler (der Fall, in dem ein Neustart in eine längere Laufzeit
fällt). Das Skript schaltet dann sichtbar auf „Vergleich zweier Gesamtstände"
um, statt ein Fenster zu erfinden.

## Additiv am Export ergänzt

Der Auftrag erlaubte additive Ergänzungen, falls eine Kennzahl fehlt. Drei
fehlten – alle hinter `TELEMETRY_ENABLED`, keine bestehende Zahl und kein
bestehender Metrikname ändert sich:

| Ergänzung | Warum |
| --- | --- |
| `branch` je Klasse | Ohne die Familie im Export müsste das Skript `packages/shared` importieren – also gebaut werden und gegen eine fremde Instanz falsch gruppieren |
| `lifetimeSeconds` und `killsPerMinute` je Eintrag | Bisher gab es nur `lives` und die **gerundete** Durchschnittsdauer. Kills/Minute daraus zu rechnen hieße, mit gerundeten Werten weiterzurechnen; für das Zeitfenster braucht es ohnehin die exakte Summe |
| Lebensdauer je Core Module und Frame | Es gab sie nur je Klasse – ohne sie ist „dieselbe Sicht je Modul/Frame" nicht möglich. Gebucht auf das Loadout **beim Tod**, exakt wie die Deaths es seit Paket 01 tun |

Dazu neu im Prometheus-Text: `maze_module_lives_total`,
`maze_module_life_seconds_total`, `maze_module_life_seconds_max` und die vier
Frame-Entsprechungen. `telemetryVersion` steht jetzt auf **3**; das Skript
warnt sichtbar, wenn eine Instanz noch v2 liefert, statt leere Spalten als
Nullen auszugeben.

## Verifiziert

- **`npm run check` grün:** 37 Dateien, 487 Tests. 37 neue in
  `scripts/balance-live.test.mjs` (reine Funktionen wie beim Lasttest), 7 neue
  in `apps/server/src/telemetry.test.ts`.
- **Gegen einen echten Server gelaufen**, nicht nur gegen Testdaten: lokale
  Instanz mit `TELEMETRY_ENABLED=true` und `METRICS_TOKEN`, befüllt über
  `npm run loadtest` (10 Clients, 150 s). Abzug → Last → Vergleich; das
  Zeitfenster wurde korrekt als `interval` erkannt (3 min 10 s) und lieferte
  plausible Deltas.
- **Fehlerwege live geprüft:** falsches Token → `401` mit Klartexthinweis,
  falscher Port → „nicht erreichbar", `TELEMETRY_ENABLED=false` → `404` mit
  Hinweis auf die Ursache, unbekannte Option → Hilfe. Exit-Code 2 bei jedem
  Fehler, 0 bei Erfolg.
- **Ausreißer-Logik in beide Richtungen getestet:** eine Klasse über und eine
  unter dem Familien-Median; eine ganze Familie doppelt so stark (fällt
  *innerhalb* der Familie nicht auf, in der Familientabelle schon); ein
  Zufluss mit zwei Leben verschiebt den Familien-Median nicht.
- **Reproduzierbar:** kein `Math.random`, keine Uhrzeit in der Logik. Die
  Watchlist-Sortierung hat einen Namens-Tiebreak, damit gleich starke
  Abweichungen immer in derselben Reihenfolge stehen.

**Nicht verifiziert:** ein Lauf gegen `mazers.de`. Der Proxy dieser Sitzung
blockt die Domain (`CONNECT tunnel failed, 403`), das ist eine Grenze der
Sandbox, nicht des Skripts. Der erste Produktionslauf ist damit ungetestet –
und läuft ohnehin erst nach dem Merge sinnvoll, weil die Live-Instanz bis
dahin `telemetryVersion 2` liefert.

## Bewusste Abweichungen

- **Kein CI-Schritt.** Das Skript braucht eine laufende Instanz; in CI hätte es
  nichts zu lesen. Die Tests laufen ohnehin über `npm run check` mit.
- **Zeilen ohne Bewegung werden im Zeitfenster ausgeblendet** (`--all` zeigt
  alle). In der Gesamtsicht bleiben alle 29 Klassen stehen – dort heißt eine
  Nullzeile „nie gespielt" und gehört zum Bild; im Fenster heißt sie nur
  „nichts passiert" und verdeckt 8 relevante Zeilen unter 21 leeren.
- **`core` ist eine eigene Familie in der Tabelle.** Es ist der Startzustand,
  keine Wahl – Pickrate 0 ist dort korrekt und kein Fehler. Die Lebensdauer und
  K/D von `core` sind trotzdem interessant (Anfängererfahrung), deshalb bleibt
  die Zeile drin.

## Von 01 gebraucht

- **Review und Merge von Paket 09.** Erst danach liefert die Live-Instanz
  `telemetryVersion 3` und damit Familie, exakte Lebenszeit und Kills/Minute.
- **Paket 08 (Client-Perf-Telemetrie) hängt weiterhin.** Es blockiert nichts
  von 09, aber der Sender-Spec für 03 liegt darin.
- **Für die KL5-Balance-Runde:** Der Ablauf steht in `docs/TELEMETRY.md` →
  „Balance-Runde fahren in 5 Minuten". Wichtig für die Reihenfolge: Der
  Vorher-Abzug muss **vor** dem Deploy der Änderung entstehen, weil der
  Redeploy alle Zähler zurücksetzt.

## Für Sam

Nichts einzurichten – keine neue ENV, keine Migration, keine neue Dependency.

Nach dem Merge einmal ausprobieren:

```bash
npm run balance:live -- --url https://mazers.de
```

Falls `/metrics` in Produktion mit `METRICS_TOKEN` geschützt ist, davorsetzen:
`METRICS_TOKEN=<token> npm run balance:live -- --url https://mazers.de`.

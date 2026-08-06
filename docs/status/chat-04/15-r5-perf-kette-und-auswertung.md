# 15 – R5: Die Perf-Kette trägt, und sie hat jetzt eine Auswertung

| | |
| --- | --- |
| **Auftrag** | `docs/status/chat-01/auftrag-chat-04.md` (5. Fassung, 2026-08-06) |
| **Branch** | `claude/chat-04-infra-betrieb-ihx0xz` |
| **Basis** | `origin/main` (`43c879d`) |
| **Tests** | `npm run check` grün – 53 Dateien, 731 Tests (18 neu) |
| **Status** | **offen – wartet auf Review und Merge** |

---

# TEIL 1: Trägt die Kette? Ja.

Der Auftrag sagt: erst prüfen, ob überhaupt Daten ankommen, bevor ausgebaut
wird. Der Verdacht war, dass der Client kaum oder gar nicht sendet
(`clientMetrics.samples: 0` bei `acceptedTotal: 1`).

**Der Verdacht trifft nicht zu. Der Client sendet, und der Server nimmt an.**

## Wie ich das geprüft habe

Nicht durch Nachbauen der Sendelogik – dabei prüft man die eigene Annahme statt
des Clients. Stattdessen ein echter Durchlauf: Chromium über Playwright,
gebauter Client, echter Server, echte Zeiten. Der Browser betritt die Arena und
spielt gut drei Minuten.

```
Arena betreten, warte auf den ersten Bericht (fruehestens 120 s) …
  [120s] [POST /client-metrics] -> 204
  [140s] {"samples":1,"acceptedTotal":1,"rejectedTotal":0}
  [180s] [POST /client-metrics] -> 204
  [200s] {"samples":2,"acceptedTotal":2,"rejectedTotal":0}

=> DIE KETTE TRAEGT: 2 Bericht(e) angenommen.
```

Zwei Berichte im erwarteten 60-Sekunden-Takt, beide mit `204` angenommen,
**keiner verworfen**. Schema, Rate-Limit, Aggregation und Export funktionieren
so, wie sie sollen.

## Warum es trotzdem nach „kaputt" aussah

Drei Dinge kommen zusammen, und keines davon ist ein Fehler:

**1. Der erste Bericht kommt frühestens nach 120 Sekunden.** Der Client wärmt
60 s auf (Shader, Nachladen) und misst dann 60 s, bevor er zum ersten Mal
sendet. Danach einmal pro Minute.

**2. Die Zähler leben nur im Arbeitsspeicher.** Jeder Deploy setzt sie auf
null. Am 06.08. wurde sehr oft deployt – ein niedriger `acceptedTotal` sagt
dann mehr über die letzte Deploy-Zeit als über den Client.

**3. `samples: 0` bei `acceptedTotal: 1` ist kein Widerspruch**, sondern die
Auskunft „der eine Bericht ist älter als das 15-Minuten-Fenster". Also: Vor
über einer Viertelstunde hat jemand lange genug gespielt, seitdem niemand mehr.

**Es ist damit kein Befund für 03.** Die Client-Seite arbeitet wie
spezifiziert.

## Der eigentliche Engpass – und er ist eine Entscheidung, keine Panne

**Ein Spieler muss zwei Minuten ununterbrochen in der Arena sein, um einen
einzigen Datenpunkt zu erzeugen.** Wer nach 90 Sekunden aufhört, hinterlässt
keine Spur; wer die Verbindung verliert, fängt von vorn an.

Für eine Seite, auf der gerade wenige Leute kurz reinschauen, heißt das: Die
Datenmenge bleibt sehr klein, ganz ohne dass etwas defekt ist. Das ist der
Grund, warum die Messlatte bis heute unbeantwortet ist.

Zwei Stellschrauben, beide in 03s Revier – **ich habe nichts davon geändert**:

- **Aufwärmphase kürzen** (60 s → z. B. 20 s). Die Aufwärmzeit soll Shader und
  Nachladen ausblenden; 20 s dürften dafür reichen. Ergäbe einen ersten Bericht
  nach 80 statt 120 Sekunden.
- **Beim Verlassen der Seite senden.** `sende()` benutzt bereits
  `keepalive: true` – ein Bericht im `visibilitychange`-Handler auf `hidden`
  würde genau die Sitzungen retten, die heute komplett verlorengehen. Der
  Server nimmt Teilfenster an, solange 30 Frames beisammen sind.

Meine Empfehlung ist die zweite: Sie kostet die kürzeste Sitzung nichts und
hebt die Ausbeute vermutlich am deutlichsten. **Beides ist eine Entscheidung
für 01/03, kein Fehler, den ich reparieren würde.**

---

# TEIL 2: Die Auswertung

## Ein Fund vorweg: `/metrics?format=json` ließ die Client-Daten weg

Der Prometheus-Text hatte sie, das JSON-Format nicht. Ausgerechnet das Format,
das für Werkzeuge gedacht ist, hätte also verlangt, den Textexport zu parsen.
Behoben: `telemetryReport()` trägt jetzt einen `client`-Block mit derselben
Aggregation.

Bewusst unabhängig von `?subject=` – die Berichte kommen aus Browsern und
kennen weder Mensch/Bot noch eine Klasse.

## `npm run perf:live`

```bash
npm run perf:live -- --url https://www.mazers.de
npm run perf:live -- --url http://localhost:2567 --json
```

Beantwortet die Messlatte aus dem MASTERPLAN – **FPS-p95 ≥ 55 auf dem
Referenz-Altgerät, keine Hänger über 100 ms** – getrennt nach Geräteklasse,
Renderpfad und Qualitätsstufe:

```
GERAET  RENDERPFAD     STUFE     BERICHTE  FPS p50  FPS p95 SCHLECHT. HAENGER  <30fps    MPx
────────────────────────────────────────────────────────────────────────────────────────────
high    webgl          high             1    144.0    120.0     120.0     0.0    0.00   3.69
low     webgl-kompat   low              6     42.0     27.0      27.0     3.0    1.00   1.05

MESSLATTE (MASTERPLAN): FPS-p95 >= 55, keine Haenger ueber 100 ms

  ✘ low/webgl-kompat/low             6 Berichte — FPS-p95 27 < 55, Haenger 3

  URTEIL: Messlatte VERFEHLT — siehe die markierten Zeilen.
```

## Drei Festlegungen

**1. „Referenz-Altgerät" ist `deviceClass=low` ODER `quality=webgl-kompat`.**
Der Software-Renderpfad ist per Definition der alte PC – dort läuft WebGL ohne
Grafikkarte, auch wenn die Maschine sonst kräftig ist. Nur auf `deviceClass` zu
schauen würde genau die Fälle übersehen, um die es geht.

**2. Es gibt drei Ausgänge, und zwei davon sind kein Bestehen.**

| Ausgang | Wann |
| --- | --- |
| `ERFUELLT` | alle ausreichend belegten Altgerät-Buckets halten die Latte |
| `VERFEHLT` | mindestens einer reißt sie |
| `UNBEANTWORTET` | keine Daten, nur starke Geräte, oder zu dünne Stichprobe |

**`UNBEANTWORTET` ist ausdrücklich kein Bestehen.** Eine leere Auswertung sieht
sonst aus wie ein grüner Test – dieselbe Falle wie beim blinden Lasttest und
beim gecachten `/health`. Ein Bucket unter fünf Berichten wird deshalb nicht
bewertet, sondern als „zu wenig Daten" ausgewiesen.

**3. Der Leerfall erklärt sich selbst.** Kommen keine Berichte an, nennt das
Skript die Ursachen in der Reihenfolge, in der man sie prüft – zuerst „hat
jemand lange genug gespielt", dann „wurde der Server neu gestartet", dann
„wurden Berichte verworfen", und erst danach „der Client sendet nicht, das ist
ein Fall für 03". Genau die Reihenfolge, die mir hier eine Fehldiagnose erspart
hätte.

## Verifiziert

- **Die Kette end-to-end** im echten Browser, siehe oben.
- **18 neue Tests**, darunter jeder der drei Ausgänge und ausdrücklich die
  Fälle, in denen das Werkzeug **nicht** „bestanden" sagen darf: keine Daten,
  nur starke Geräte, zu dünne Stichprobe.
- **Gegen einen laufenden Server gefahren**, mit eingespeisten Berichten für
  ein schwaches und ein starkes Gerät. Das Urteil `VERFEHLT` kam mit der
  richtigen Begründung.
- **Dabei aufgefallen:** Das Rate-Limit greift (`429` ab dem zweiten Bericht
  je Minute und IP) – wie vorgesehen, aber gut zu wissen, wenn jemand von Hand
  Berichte einspeist.

## Bewusste Abweichungen

**Ich habe `apps/client/src` nicht angefasst**, obwohl der Engpass dort liegt.
Der Auftrag sagt: melden, nicht reparieren. Die beiden Vorschläge stehen oben.

**Der `client`-Block im JSON-Export war nicht beauftragt.** Ohne ihn hätte das
Auswertungswerkzeug den Prometheus-Text parsen müssen – das wäre ein Werkzeug
gewesen, das bei der nächsten Formatänderung still falsch rechnet.

## Von 01 gebraucht

1. **Merge**, dann steht `npm run perf:live` zur Verfügung.
2. **Entscheidung für 03:** Aufwärmphase kürzen und/oder beim Verlassen der
   Seite senden. Ohne das eine oder andere bleibt die Datenmenge so klein, dass
   die Messlatte auf absehbare Zeit `UNBEANTWORTET` bleibt – nicht weil etwas
   kaputt ist, sondern weil kaum jemand zwei Minuten am Stück spielt.
3. **Die Messlatte ist weiterhin unbeantwortet**, und das ist nach diesem Paket
   eine belastbare Aussage statt einer Vermutung: Es liegen schlicht noch keine
   Berichte von einem Altgerät vor.
4. **Weiterhin offen, weiterhin nicht ungefragt begonnen:** die Trefferquote als
   Telemetrie (Bericht 13) – der einzige Weg zu einer Zahl beim Projektiltempo.

## Für Sam

Wenn du das nächste Mal eine Weile spielst: **Bleib zwei Minuten am Stück in
der Arena**, dann erzeugst du einen Perf-Datenpunkt. Danach `npm run perf:live
-- --url https://www.mazers.de` (oder sag Bescheid, dann werte ich aus).
Besonders wertvoll wäre eine Runde auf einem schwachen Gerät – genau dort steht
die Messlatte, und genau von dort fehlen bisher alle Daten.

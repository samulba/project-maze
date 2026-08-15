# Stand 14.08. – Sams Spieltest vom 14.08. vollständig abgearbeitet

| | |
| --- | --- |
| **Auftrag** | Sam, 14.08.: „das ist MEIN FEEDBACK, sortier den erstmal gescheit und lass das dann CLEAN step by step fixen / durcharbeiten! NIX DARF VERLOREN GEHEN & ALLES MUSS GEFIXT WERDEN! und das RICHTIG" |
| **Branch** | `claude/mazers-feedback-testspiel-7y5cmj` |
| **Basis** | `2c90ca2` |
| **Tests** | `npm run check` grün – 93 Dateien, 1263 Tests (vorher 89 / 1214) |
| **Layout** | `scripts/ui-layout-check.mjs` ohne Befund |

## Alle neun Punkte erledigt

| Stufe | Sams Punkte | Was sich geändert hat |
| --- | --- | --- |
| 1 – Körper | 5 + 7 | Nur ein Kill schlägt durch; Drohnen sind Projektilziele und werden aus Formen und Panzern herausgeschoben |
| 2 – Drohnen | 8 | Der Formationsplatz kreist um das Ziel, statt darauf zu parken (gemessen: 0,0 → 84–166 px/s) |
| 3 – Kadenz & Mündung | 1 + 6a + 6b | Ein Klick = eine Salve; die Kugel entsteht IM Rohr; Rückstoß 25 → 4–11 px/s je nach Kugelgewicht |
| 4 – was man sieht | 6c + 2 | Rohre werden aus derselben Quelle gezeichnet, aus der geschossen wird; Kugeln blenden aus statt zu verschwinden |
| 5 – Oberfläche & Tempo | 4 + 3 + 9 | Wahlkarten tragen Bild und Name; Loadout-Kacheln statt Dropdowns; Tempo-Spitze weich gedeckelt |

Sams Worte im Original und die Begründung der Reihenfolge stehen in
[Bericht 30](30-feedback-14-08-sortiert.md), alle Messungen in
[Bericht 31](31-feedback-14-08-abgearbeitet.md).

## Die drei Zahlen, die den Unterschied machen

1. **Drohnen parkten mit 0,0 px/s** auf dem Zeiger – alle sechs Klassen, ohne
   Ausnahme. Der Formationsplatz stand fest, und die Ankunftsbremse ergibt auf
   einem festen Punkt null. Das war Sams „fühlt sich MEGA MEGA komisch an".
2. **Ein voll ausgebauter Comet fuhr 541 px/s**, während das ganze
   Projektilsystem gegen 447 px/s kalibriert ist. Die Zusage „jede Kugel holt
   einen Fliehenden ein" war für die schnellsten Klassen falsch.
3. **Die Lauf-Geometrie stand dreimal im Code** – Server, Renderer und
   Wahlkarten-Vorschau –, und die drei Fassungen liefen auseinander: Storm
   zeigte sechs parallele Rohre und feuerte einen 24°-Fächer.

## Nachtrag vom selben Tag: Drohnen greifen nur im Auto-Modus von selbst an

Sam auf Rückfrage: „die sollen nur angreifen, wenn du im E-Auto-Modus bist und
man nix klickt; sonst immer in der Maus-Nähe, wenn man klickt."

| Klick | Auto-Modus (E) | Flotte |
| --- | --- | --- |
| ja | egal | zum Zeiger |
| nein | ja | sucht sich selbst ein Ziel |
| nein | nein | Orbit, greift nichts an |

Dafür trägt `InputMessage` ein neues, optionales Feld `klick`: den echten
Zeigerbefehl OHNE Auto-Modus. `primary` heißt weiterhin „der Tank feuert" und
ist Klick ODER Auto – für Rohre reicht das, für Drohnen sind es drei Zustände,
die eine Boolesche Variable nicht auseinanderhält.

## Zweiter Nachtrag: Tank-Designs komplett überarbeitet

Sam: „TANK DESIGNS an sich finde ich schauen leider alle noch echt kake aus.
ÜBERARBEITE DIE ALLE KOMPLETT."

Zwei der drei Ursachen betrafen alle 67 Klassen gleichzeitig: Der Umriss war
weiß bei 38 % (ein Schleier, kein Rand), und das Rohr trug die Familienfarbe
(Körper und Waffe verschmolzen zu einem Klumpen). Beides ist jetzt wie in
Diep.io – dunkle Kante, neutrales Metall –, aus EINER Rechnung für Spiel und
Wahlkarte.

Dazu: Vorschau ohne Drehung und um die echte Silhouette gerahmt, Fächerläufe
gestaffelt (und die Kugel folgt der Mündung DIESES Laufs), alle 67 Silhouetten
neu – jede Familie mit einem Merkmal, das nur sie trägt, jede Stufe sichtbar
wachsend. Details in [Bericht 32](32-tank-designs.md).

Neu: `node scripts/tank-sheet.mjs` zeichnet alle 67 nebeneinander. Ohne dieses
Bild konnten Rohre und Rümpfe monatelang auseinanderlaufen.

## Dritter Nachtrag: „ULTRA LAGGY" – erst gemessen, dann gefixt

Sam: „ok das game ist jetzt ULTRA LAGGY das müssen wir schnell fixen!"

Der A/B-Vergleich gegen die Basis sagt: **Es lag nicht am Paket vom 14.08.**
Tick 5,66 gegen 5,34 ms, Bildrate 3,1 gegen 3,0 – alles im Rauschen. Langsam war
etwas Älteres, das erst auffiel, als die Arena voller wurde:

| Posten | Was daran teuer war | Jetzt |
| --- | --- | --- |
| `isFree` | Durchlauf über alle 232 Wände, mit frischer Liste – zweimal je Bewegungsschritt, für jede Form, Drohne und jeden Panzer | Wandraster, keine Liste |
| Drohnen-Berührung | linear durch 562 Formen, seit Punkt 7 in JEDEM Tick | gemeinsames `Koerperraster` |
| Bot-Zielsuche | 562 Sichtstrahlen, um einen zu behalten | erst sortieren, dann sehen |

| | vorher | nachher |
| --- | ---: | ---: |
| Tick p50, normale Arena | 4,2–5,3 ms | **2,3 ms** |
| Tick p95 | 9,0–9,6 ms | **4,9 ms** |
| Tick p50 bei 160 Drohnen | 3,79 ms | **0,98 ms** |

Die Simulation ist damit doppelt so schnell wie vor dem ganzen 14.08. Details,
die falsche Zwischenmessung und die offenen Verdächtigen in
[Bericht 33](33-lag.md). Neu: `node scripts/frame-probe.mjs` misst Bildzeiten im
echten Browser.

## Vierter Nachtrag: Zeitlupe und Halbautomatik

Sam: „zäh beim reagieren, mach die 200ms halteschwelle weg" – und danach:
„locker 1–2 SEKUNDEN LAGGY und super langsam fast in abgehackter Zeitlupe".

**Die Halbautomatik ist weg.** `fire-cadence.ts` gelöscht. Sie verzögerte den
zweiten Schuss um bis zu 200 ms und änderte dabei nur bei drei Klassen etwas
(rapid, gatling, storm – alle unter 150 ms Nachladezeit); bezahlt haben es alle.

**Die Zeitlupe kam aus einer Zeile im Renderer**, älter als das Paket vom 14.08.:

```ts
this.render(Math.min(.05, ticker.deltaMS / 1000))
```

Unterhalb von 20 fps rechnete der Client die Welt **langsamer als die Uhr** – bei
10 fps auf halbem Tempo, bei 5 fps auf einem Viertel. Und weil die Annäherung an
die Serverposition denselben zu kleinen Schritt benutzt, blieb der Tank
sekundenlang zurück. Beide Worte aus einer Zeile.

Jetzt zählt bis 5 fps die echte Zeit (ruckelig statt zeitlupig), darüber wird
gesprungen statt gekrochen. Die Entscheidung steht als reine Funktion in
`frame-step.ts`, mit `welttempo()` als Test – die Frage „läuft die Welt in
Echtzeit?" hatte vorher niemand gestellt.

Der Server war es nicht: Tickintervall 26,7 ms bei 44 Spielern (Ziel 25).
Details in [Bericht 34](34-zeitlupe.md).

## Was Sam beim nächsten Test ansehen sollte

1. **Halbautomatik**: Sind 200 ms die richtige Grenze zwischen „Klick" und
   „Halten"? Die einzige Zahl im Paket, die reine Geschmackssache ist.
2. **Drohnen am Zeiger**: Kreist die Flotte so, wie er es aus Diep.io kennt –
   oder ist der Ring zu weit, die Drehung zu schnell?
3. **Rückstoß**: Jetzt zu wenig? Nach oben ist Luft, ohne dass die
   Client-Vorhersage leidet.
4. **Wahlkarten**: Reicht das Bild, oder fehlt der Rollenname auf der Karte
   statt nur im Tooltip?
5. **Die Tanks selbst**: Kontaktbogen unter `.probe/tanks-nachher.png`. Sitzt
   die Formsprache, oder soll eine Familie anders aussehen?

## Offen aus früheren Sitzungen

* **Klassen-Identität (Stufe 4 des Reworks vom 13.08.)** – Sams „alle Klassen
  fühlen sich gleich an" aus [Bericht 26](26-plan-rework.md) ist weiterhin der
  größte offene Brocken. Das Paket vom 14.08. hat davon zwei Ecken mitgenommen
  (Rohr-Design, Rückstoß nach Kugelgewicht), aber nicht den Kern.
* **Wie findet man einen Hauptplatz?** Die Minikarte ist ein Nahradar; die
  Plätze existieren, aber man findet sie nur durch Laufen (offen seit
  [Bericht 27](27-stufe-3-karte.md)).
* **Migration `0005_sessions.sql`** ist eingespielt; nach dem nächsten Deploy in
  `/health` unter `sessions` prüfen, dass die Schicht wirklich schreibt.
* **CI ist pausiert** (`2c90ca2`): GitHub-Actions-Minuten aufgebraucht. `npm run
  check` läuft lokal, der Prüfstand `ui-layout-check.mjs` von Hand.
* **Admin-Portal auf kleinen Schirmen** – neu aufgedeckt, nicht gefixt: Der
  Prüfstand wartete für das Portal auf eine Klasse, die es seit dem Umbau nicht
  mehr gibt, und meldete acht Fälle als „kommt nicht hoch". Der Selektor ist
  korrigiert; darunter liegen vier echte Befunde (Inhalt ragt seitlich aus dem
  Bild, auf Tablet und Handy). Eigene Aufgabe – siehe
  [Bericht 31](31-feedback-14-08-abgearbeitet.md).

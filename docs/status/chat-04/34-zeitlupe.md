# 34 – Zeitlupe und Halbautomatik: zwei Zeilen, zwei Symptome

| | |
| --- | --- |
| **Auftrag** | Sam, 14.08. abends: „zäh beim reagieren, mach die 200ms halteschwelle weg" und „locker 1–2 SEKUNDEN LAGGY / Verzögerung und super langsam fast in abgehackter Zeitlupe" |
| **Branch** | `main` |
| **Tests** | `npm run check` grün – 93 Dateien, 1270 Tests |

## 1. Die 200-ms-Halteschwelle ist weg

`fire-cadence.ts` ist gelöscht und aus der Kette genommen.

Sie hat Sams Punkt 6a umgesetzt („ein Klick, eine Salve") und dafür den zweiten
Schuss um bis zu 200 ms verzögert. Das war eine **absichtliche** Verzögerung,
und Sam hat sie als das erkannt, was sie ist.

Der Tausch war ohnehin schlecht, und das ist nachrechenbar: Die Schwelle ändert
nur etwas bei Klassen mit einer Nachladezeit **unter** der Klickdauer von
80–150 ms. Das sind, voll ausgebaut, drei:

| Klasse | Nachladen | Ohne Schwelle bei 150 ms Klick |
| --- | ---: | ---: |
| rapid | 0,090 s | 2 Schuss |
| gatling | 0,105 s | 2 Schuss |
| storm | 0,140 s | 2 Schuss |
| repeater | 0,260 s | 1 Salve – **schon immer** |

Für alle anderen war „ein Klick, eine Salve" auch ohne die Schicht schon wahr.
Bezahlt haben die Verzögerung dagegen alle – und am deutlichsten genau die drei,
die am schnellsten feuern.

**Was damit offen ist:** Ein sehr langer Klick auf einen voll ausgebauten Rapid
gibt zwei statt einem Schuss. Wenn Sam das stört, ist der nächste Versuch keine
Zeitschwelle, sondern eine Salvenzählung je Druck – die kostet keine Latenz.

## 2. Die Zeitlupe: ein Deckel von 50 ms

`renderer.ts` rief den Bildlauf so auf:

```ts
this.app.ticker.add(ticker => this.render(Math.min(.05, ticker.deltaMS / 1000)));
```

An diesem einen Wert hängt **alles**, was der Client über Zeit weiß: die
Annäherung an die Serverposition, die Rückstoßfeder, Partikel, Ringe,
Schadenszahlen, das Ausblenden der Kugeln.

Ein Deckel von 50 ms heißt: **Unterhalb von 20 Bildern je Sekunde rechnet der
Client die Welt langsamer als die Uhr.**

| Bildmaß | wirklich vergangen | angerechnet | Welttempo |
| ---: | ---: | ---: | ---: |
| 60 fps | 17 ms | 17 ms | 100 % |
| 20 fps | 50 ms | 50 ms | 100 % |
| 10 fps | 100 ms | 50 ms | **50 %** |
| 5 fps | 200 ms | 50 ms | **25 %** |

Das ist Sams Zeitlupe, wörtlich. Und die Verzögerung kommt aus derselben Zeile:
Die Annäherung an die Serverposition rechnet mit demselben zu kleinen Schritt
und kommt deshalb nie an – der Tank bleibt sekundenlang hinter dem zurück, was
der Server längst gemeldet hat.

Der Deckel ist **älter als das Paket vom 14.08.** (er steht auch in `2c90ca2`).
Er ist kein Rückschritt, sondern ein Verstärker: Er verwandelt jeden Einbruch
der Bildrate in ein Zeitproblem. Wer unter 20 fps fällt, bekommt nicht ein
ruckeliges Bild, sondern eine langsame Welt mit Rückstand.

### Was jetzt gilt

Der Deckel bleibt – ohne ihn schleudert ein Tab-Wechsel nach zehn Sekunden
jedes Teilchen quer. Geändert haben sich seine Höhe und das, was jenseits davon
passiert:

* **bis 200 ms (5 fps)** zählt die echte Zeit. Ein niedriges Bildmaß bleibt
  damit **ruckelig statt zeitlupig** – man sieht wenige Bilder, aber die Welt
  läuft in Echtzeit.
* **darüber** war es kein langsames Bild, sondern eine Pause. Dann wird
  gesprungen: Jede Ansicht setzt sich auf ihren Zielpunkt, das nächste Bild
  beginnt synchron. Sich über eine Sekunde Rückstand heranzukriechen wäre genau
  die Verzögerung, die Sam beschreibt.

Die Entscheidung steht als reine Funktion in `frame-step.ts`, mit Tests. Der
wichtigste ist `welttempo(bildmass)`: Läuft die Welt bei diesem Bildmaß in
Echtzeit? Mit dem alten Deckel lautete die Antwort ab 20 fps abwärts „nein" –
und **es gab keinen Test, der die Frage überhaupt gestellt hat.**

## Was der Server damit zu tun hat: nichts

Vor dem Eingriff wurde nachgemessen, ob der Server den Takt hält. Er hält ihn,
auch unter Last:

| | leer | 8 Clients | 30 Clients |
| --- | ---: | ---: | ---: |
| Tickdauer p50 | 1,4 ms | 1,4 ms | 1,6 ms |
| Tick**intervall** p95 | 25,8 ms | 26,0 ms | 26,7 ms |

Das Intervall ist die Zahl, die zählt: `game.step(1 / GAME.tickRate)` rechnet
mit **fester** dt an einem `setInterval`. Rutscht das Intervall, läuft die Welt
in echter Zeitlupe. Es rutscht nicht – Ziel 25 ms, gemessen 26 ms bei 44
Spielern. Auch die Client-Konsole meldet im Spiel keine Ausnahme, und alle 67
Silhouetten und Läufe sind auf NaN und entartete Formen geprüft.

## Was offen bleibt

* **Warum Sams Bildrate einbricht, ist damit nicht beantwortet** – nur, dass ein
  Einbruch jetzt nicht mehr zu Zeitlupe und Sekunden Rückstand führt. Diese
  Umgebung rasterisiert in Software (3 fps in JEDER Fassung) und kann die Frage
  nicht beantworten.
* **Die Zahlen dafür liegen schon auf dem Server**: Der Client meldet Bildrate,
  Geräteklasse und Renderpfad an `POST /client-metrics`;
  `node scripts/perf-live.mjs --url <host>` stellt sie nebeneinander. Nach Sams
  nächstem Spiel steht dort, ob es an Gerät, Qualitätsstufe oder Renderpfad
  hängt.
* **`moveCircle` für 562 Formen** bleibt der größte Serverposten (siehe
  [Bericht 33](33-lag.md)) – ohne Not, denn Formen driften mit 10–16 px/s.

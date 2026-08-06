# 14 – `--start-level`: die Zulieferung, um die 02 gebeten hat

| | |
| --- | --- |
| **Auftrag** | keiner – Zulieferung auf 02s Bitte aus Bericht 17, Abschnitt 5 |
| **Branch** | `claude/chat-04-infra-betrieb-ihx0xz` |
| **Basis** | `origin/main` (`f4aaa5c`) |
| **Tests** | `npm run check` grün – 52 Dateien, 713 Tests (6 neu) |
| **Status** | **offen – wartet auf Review und Merge** |

## Worum es geht

02 hat in Bericht 17 dieselbe Wand getroffen wie ich – zu wenig abgeschlossene
Leben je Familie, um K/D von Rauschen zu trennen – und die Ursache genauer
benannt als ich:

> Der Grund ist nicht der Seed, sondern die Levelkurve: In 90 Sekunden kommen
> die Clients kaum aus Core heraus, und Core sammelt dann 50 der 74 Tode.

Dazu die Bitte, die ausdrücklich in mein Revier zeigt: Clients, die auf einem
Level starten, „würde die nötige Laufzeit vermutlich halbieren".

Gebaut. `--start-level <n>` hebt die Lasttest-Clients über die Debug-Route auf
ein Level, auf dem die Familienklassen offenstehen.

## Was es bringt

Gemessen im selben 60-Sekunden-Fenster, 20 Clients, gleicher Seed:

| | Klassenwahlen | Upgrades |
| --- | --- | --- |
| ohne `--start-level` | **8** | 232 |
| `--start-level 30` | **70** | 594 |

**Faktor 8,75 bei den Klassenwahlen.** Die Clients verbringen ihre Zeit nicht
mehr damit, aus Core herauszuwachsen. 02s Vermutung, das halbiere die nötige
Laufzeit, ist damit eher konservativ.

## Drei Entscheidungen, die der Bitte nicht anzusehen waren

**1. Das Level wird nachgesetzt, nicht nur einmal gesetzt.**

Ein Tod kostet die Hälfte des Levels – `respawnLevelFrom` ist
`Math.max(1, Math.floor(level * 0.5))`. Bei vier bis zehn Leben je Lauf wäre
ein einmalig gesetztes Level 30 nach vier Toden wieder bei 1:

```
30 → 15 → 7 → 3 → 1
```

**Ein reines „beim Start setzen" wäre für alles außer sehr kurzen Läufen
wirkungslos gewesen** – und zwar unauffällig wirkungslos, weil der Anfang des
Laufs gut ausgesehen hätte. Deshalb setzt der Client nach, sobald sein Level
unter das Ziel fällt.

**Das hebelt die Sterbe-Ökonomie aus, und das ist Absicht.** Gemessen werden
soll die Familienbilanz auf festem Level, nicht der Aufstieg dorthin. Für
Kapazitätsmessungen gehört die Option deshalb **aus** – sie verändert auch die
Entitätenzahl, weil höhere Level mehr Drohnen bedeuten.

**2. `core` mit Preset `blank`, nicht eine feste Klasse.**

Die Debug-Route verlangt eine Klasse. Hätte ich eine Familienklasse gesetzt,
wäre die Familienverteilung von mir vorgegeben statt gemessen. Mit `core` und
leerem Preset steht nur das Level; die Klassenwahl läuft danach über denselben
Weg wie sonst, und die Punkte bleiben unverteilt, damit die Clients sie wie
gewohnt selbst ausgeben.

**3. Nach fünf erfolglosen Versuchen gibt der Client auf.**

Das kam aus dem Test. Mit `ENABLE_DEV_TOOLS=false` verwirft der Server die
Nachricht stillschweigend, das Level bleibt unter dem Ziel – und mein erster
Entwurf schickte daraufhin **jede Sekunde je Client** eine neue Anforderung:
**1158 Nachrichten in einem 60-Sekunden-Lauf mit 20 Clients.**

Ein wirkungsloses `--start-level` hätte also ausgerechnet die Last verzerrt,
die der Lauf messen soll. Jetzt sind es höchstens fünf Versuche je Client
(gemessen: 100 statt 1158), und der Bericht sagt, wie viele aufgegeben haben.

## Damit es nicht die nächste stille Falle wird

Die Option ist wirkungslos, wenn `ENABLE_DEV_TOOLS` am Server aus ist – und das
**muss** in Produktion so bleiben. Ein stillschweigend wirkungsloses Werkzeug
ist genau das Muster, das uns hier schon zweimal Zeit gekostet hat (der blinde
Lasttest, das gecachte `/health`). Deshalb weist der Bericht es aus:

```
Startlevel 30          20/20 Clients erreicht, 33x gesetzt, hoechstes 33
Startlevel 30           0/20 Clients erreicht, 100x gesetzt, hoechstes 11  <<< NIE ERREICHT - ENABLE_DEV_TOOLS am Server aus? >>>
```

Im JSON steht derselbe Block unter `startLevel` mit `requested`, `sent`,
`reached`, `gaveUp`, `ofClients` und `maxLevelSeen`. **Wer eine Familienbilanz
auswertet, prüft `reached` zuerst.**

## Verifiziert

**Gegen einen echten Server gefahren, beide Richtungen:**

| Fall | Erwartet | Ergebnis |
| --- | --- | --- |
| `ENABLE_DEV_TOOLS=true`, `--start-level 30` | Level wird erreicht | ✔ 20/20 Clients, höchstes Level 33 |
| `ENABLE_DEV_TOOLS=false`, `--start-level 30` | sichtbarer Fehlschlag | ✔ 0/20, Warnung im Bericht |
| Flutschutz | höchstens 5 Versuche je Client | ✔ 100 statt 1158 |
| ohne Option | nichts ändert sich | ✔ kein `startLevel`-Block im Bericht |

**Sechs neue Tests**, darunter der Fall „nie erreicht" – dass die Warnung
erscheint, ist selbst getestet, nicht nur das Setzen.

## Was das für die Tempo-Frage bedeutet – und was nicht

`--start-level` behebt **02s** Wand (zu kleine Stichprobe je Familie). Es
behebt **nicht** die Wand aus meinem Bericht 13: `compensatedLeadFactor()`
gleicht den Vorhalt der Bots gegen die Flugzeit aus, und die Lasttest-Clients
zielen im Random Walk, halten also gar nicht vor.

**Für das Projektiltempo bleibt der Lastlauf damit blind, auch mit
Startlevel.** Die beiden Wände sind unabhängig voneinander; diese Zulieferung
räumt eine von beiden weg. Wer eine Zahl zum Tempo will, braucht weiterhin eine
Trefferquote oder echte Spieler (Bericht 13, Abschnitt „Bewertung der
Kennzahlen").

Für **Familienbilanzen allgemein** – KL5, Signature-Vergleiche, Klassen 3.0 –
ist die Option dagegen genau der fehlende Baustein.

## Bewusste Abweichungen

**Dieses Paket war nicht beauftragt.** Es steht keine 5. Fassung des Auftrags
auf `main`; ich habe es gebaut, weil 02 in Bericht 17 ausdrücklich darum
gebeten und es meinem Revier zugeordnet hat. Wenn 01 die Reihenfolge anders
sieht: Das Paket ist in sich abgeschlossen und blockiert nichts.

**Ich habe mehr gebaut als „auf ein Level setzen".** Das Nachsetzen und der
Flutschutz standen nicht in der Bitte – ohne sie wäre die Option für längere
Läufe wirkungslos gewesen bzw. hätte die Messung verzerrt. Beides ist im Code
begründet.

## Von 01 gebraucht

1. **Merge**, dann kann 02 die KL5-Messung mit brauchbarer Stichprobe fahren.
2. **Für 02:** `--start-level 30` zusammen mit `--seed`. Vor der Auswertung
   `startLevel.reached` prüfen – bei `0` lief der Server ohne
   `ENABLE_DEV_TOOLS` und der Abzug ist wertlos. Und: Die Option verändert die
   Entitätenzahl, ein damit gefahrener Lauf taugt **nicht** als
   Kapazitätsmessung.
3. **Unverändert offen aus Bericht 13:** Ob ich die Trefferquote als Telemetrie
   bauen soll. Das ist der einzige Weg zu einer Zahl beim Projektiltempo, und
   ich fange es weiterhin nicht ungefragt an.

## Für Sam

Nichts zu tun. `ENABLE_DEV_TOOLS` bleibt in Produktion `false` – die neue
Option ist ein reines Messwerkzeug für lokale Läufe und ändert daran nichts.

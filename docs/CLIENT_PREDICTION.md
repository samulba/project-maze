# Client-Prediction – Vertrag mit dem Server

Der Client sagt die eigene Bewegung voraus, statt auf die Serverantwort zu
warten. Das funktioniert nur, wenn er **exakt dieselbe Rechnung** ausführt wie
der Server. Jede Abweichung – ein anderer Faktor, eine andere Reihenfolge, ein
anderer Zeitschritt – zeigt sich als Ruckeln, weil die Korrektur bei jedem
Snapshot dagegenzieht.

Dieses Dokument beschreibt die Rechnung Schritt für Schritt. Maßgeblich ist der
Code: `applyInput` und `stepPlayer` (`apps/server/src/game.ts`,
`apps/server/src/combat-tuning.ts`), `moveVectorToward` (`physics.ts`),
`moveCircle` und `isFree` (`world.ts`). Die Regressionstests in
`apps/server/src/input-ack.test.ts` halten die Form fest.

## 1. Die Quittung

Jeder Snapshot trägt `lastProcessedInput`: die Sequenznummer, die beim letzten
Tick in die Positionen dieses Snapshots eingeflossen ist. `-1` heißt „noch
nichts verarbeitet".

Wichtig ist das *Wann*: `applyInput` läuft sofort beim Eintreffen der Nachricht,
gerechnet wird aber erst im nächsten Tick. Eine zwischen Tick und Snapshot
eingetroffene Eingabe ist angenommen, steckt aber noch **nicht** in der
Position. Der Server quittiert deshalb bewusst erst nach dem Tick – was in
`lastProcessedInput` steht, ist garantiert in denselben Positionen enthalten.

Ablauf im Client:

1. Jede gesendete Eingabe mit ihrer Sequenznummer in einem Puffer behalten.
2. Kommt ein Snapshot: eigene Position/Geschwindigkeit auf die Serverwerte
   setzen.
3. Alle Puffereinträge mit `sequence <= lastProcessedInput` verwerfen.
4. Die verbleibenden Eingaben in Reihenfolge erneut durchrechnen – mit exakt der
   Integration aus Abschnitt 3.

## 2. Was der Server aus einer Eingabe macht

`applyInput` (sofort beim Empfang):

```text
wenn sequence <= lastInput  → Nachricht verwerfen (kein Ack-Fortschritt)
lastInput = sequence
wenn tot                    → move = (0,0), primary/secondary = false, fertig
move  = clampMagnitude(input.move, 1)
aim   = clampMagnitude(input.aim, GAME.maxAimDistance)
```

`clampMagnitude` **kürzt nur, es normiert nicht**: Ein `move` der Länge 0,5
ergibt halbes Tempo. Wer im Client normiert, läuft dauerhaft zu schnell.

Der Server hält immer nur die **zuletzt** empfangene Eingabe. Er arbeitet keine
Warteschlange ab – siehe Abschnitt 5.

## 3. Ein Tick, exakt

`dt` ist serverseitig immer `1 / GAME.tickRate = 0,025 s` und wird auf
`[0, 0,08]` geklemmt. Der Client rechnet pro nachgeholter Eingabe mit **genau
0,025 s**.

### 3.1 Zielgeschwindigkeit

```text
desired = move * stats.moveSpeed
```

### 3.2 Geschwindigkeit annähern (das ist die gesamte „Reibung")

```text
velocity = moveVectorToward(velocity, desired, stats.acceleration * dt)
```

mit

```text
moveVectorToward(current, target, maxDelta):
  diff = target - current
  d    = |diff|
  wenn d <= maxDelta oder d < 0.00001 → return target      // rastet exakt ein
  return current + diff * (maxDelta / d)
```

Es gibt **keinen separaten Reibungs- oder Dämpfungsterm**. Bremsen ist derselbe
Vorgang wie Beschleunigen: Bei `move = (0,0)` ist `desired = (0,0)`, und die
Geschwindigkeit läuft mit derselben Rate gegen null. Die Annäherung ist
*vektoriell*, nicht achsenweise – bei einem Richtungswechsel dreht der
Geschwindigkeitsvektor, er wird nicht pro Achse gerechnet.

### 3.3 Bewegen und Kollision

```text
{ position, velocity } = moveCircle(position, velocity, dt, GAME.playerRadius)
```

mit

```text
moveCircle(position, velocity, dt, radius):
  steps  = max(1, ceil(|velocity| * dt / max(8, radius * 0.55)))
  stepDt = dt / steps
  wiederhole steps mal:
    kandidatX = (position.x + velocity.x * stepDt, position.y)
    wenn isFree(kandidatX, radius) → position.x = kandidatX.x
    sonst                          → velocity.x = 0
    kandidatY = (position.x, position.y + velocity.y * stepDt)   // bereits neues x!
    wenn isFree(kandidatY, radius) → position.y = kandidatY.y
    sonst                          → velocity.y = 0
```

Drei Fallen, die alle drei Ruckeln erzeugen, wenn der Client sie anders baut:

- **Substeps.** Bei `radius = 22` ist die Schrittweite `max(8, 12,1) = 12,1`.
  Ein Tank mit 400 U/s macht also `ceil(400 * 0,025 / 12,1) = 1` Substep, einer
  mit 700 U/s deren 2. Ein einziger Schritt statt zwei liefert bei Wandkontakt
  eine andere Endposition.
- **Reihenfolge X vor Y.** Y wird mit dem **bereits aktualisierten** X getestet.
  Umgedreht ergibt sich an Innenecken eine andere Position.
- **Blockierte Achse wird genullt, nicht gespiegelt und nicht abgeglitten.**
  Die Null bleibt für die restlichen Substeps dieses Ticks stehen. Der
  zurückgegebene Geschwindigkeitsvektor ersetzt `player.velocity` – nach
  Wandkontakt ist die Komponente also auch im nächsten Tick 0 und muss neu
  aufgebaut werden.

`isFree(position, radius)`:

```text
isInsideWorld: radius <= x <= GAME.worldWidth  - radius
               radius <= y <= GAME.worldHeight - radius
und keine aktive Wand mit circleHitsWall(position, radius, wand)

circleHitsWall(p, r, w):
  nx = clamp(p.x, w.x, w.x + w.width)
  ny = clamp(p.y, w.y, w.y + w.height)
  return (p.x - nx)² + (p.y - ny)² < r²          // strikt kleiner
```

Der Client prüft gegen `snapshot.walls`. Diese Liste enthält bereits nur aktive
Wände – vom Fracture-Event geöffnete Segmente fehlen darin, und genau so soll
der Client auch rechnen. Mit `SNAPSHOT_DELTAS=true` wird `walls` nur bei
Änderung geschickt; der Hydrator muss den letzten Stand also weiterreichen.

### 3.4 Blickrichtung

```text
wenn |aim| > 0.01 → angle = atan2(aim.y, aim.x)
```

Reine Anzeige, für die Positionsvorhersage ohne Bedeutung.

## 4. Woher die Werte kommen – Achtung, nicht aus shared allein

`stats` stammt aus `tunedStatsFor` (`apps/server/src/combat-tuning.ts`):

```text
moveSpeed    = base.moveSpeed    * (1 + upgrades.moveSpeed * 0.03)  * frame.moveMultiplier
acceleration = base.acceleration * ACCELERATION_SCALE
                                 * (1 + upgrades.moveSpeed * 0.018) * frame.moveMultiplier
```

`base` ist `CLASS_DEFINITIONS[playerClass]` aus `packages/shared`,
`frame.moveMultiplier` kommt aus `PASSIVE_MODIFIER_DEFINITIONS` (ebenfalls
shared, Feld `gameplay[selfId].passiveModifier` im Snapshot).

**`ACCELERATION_SCALE` steht aber nur im Server** (aktuell `1.12`). Wer die
Vorhersage allein aus `CLASS_DEFINITIONS` baut, liegt bei jedem Tank 12 % neben
der echten Beschleunigung – konstant, in jedem Tick, in jede Richtung. Damit
das nicht passiert und nicht bei der nächsten Balance-Runde erneut auseinander
läuft, gehört der Faktor nach `packages/shared` (Vorschlag im Statusblock von
02). Bis dahin muss der Wert im Client von Hand gespiegelt werden – und jede
Änderung an ihm ist eine Änderung an zwei Stellen.

Alle Eingangsgrößen liegen im Snapshot: `players[self].upgrades` (mit
`SNAPSHOT_DELTAS` nur bei Änderung – Hydrator-Stand verwenden) und
`gameplay[selfId].passiveModifier`.

## 5. Was die Vorhersage *nicht* exakt treffen kann

- **Der Server ist nicht warteschlangengesteuert.** Er rechnet jeden Tick mit
  der zuletzt empfangenen Eingabe. Bei 40 Hz Eingaben und 40 Hz Ticks driften
  beide Uhren; gelegentlich wird dieselbe Eingabe für zwei Ticks benutzt oder
  eine übersprungen. Der Client kann also nicht wissen, über wie viele Ticks
  eine Eingabe gewirkt hat – das Nachrechnen ist prinzipbedingt eine Näherung
  im Bereich eines Ticks. Deshalb: Korrektur **weich** einblenden (Restfehler
  über 100–150 ms ausgleichen), nicht hart setzen. Nur oberhalb einer Schwelle
  von etwa 60 Einheiten hart nachziehen – dann ist etwas Größeres passiert.
- **Fremdeinwirkung sagt der Client nicht voraus.** Rückstoß bei Treffern
  (`class-mechanics.ts`), Repulse-Schub, Kollisionsauflösung zwischen Tanks und
  vor allem **Dash** verändern Position und Geschwindigkeit außerhalb der
  Eingabe. Dash versetzt über `moveCircle` mit ~1050 U/s über 0,18 s und setzt
  danach die Geschwindigkeit. Module werden serverbestätigt – der Client darf
  sie nicht vorhersagen, sondern übernimmt die Korrektur.
- **Tod und Respawn** setzen Position und Geschwindigkeit hart. Bei einem
  Sprung von `dead` oder einem Positionssprung über die Schwelle: Puffer leeren
  und den Serverzustand übernehmen.
- **Rundung.** Positionen kommen auf eine Nachkommastelle gerundet an
  (`snapshot-encoding.ts`). Ein Restfehler von 0,05 Einheiten ist normal und
  darf keine Korrektur auslösen.

## 6. Momentum (RAPID) – was der Client spiegeln muss

Gilt nur mit `SIGNATURE_RAPID_ENABLED=true` und nur für Klassen der
Rapid-Familie (`CLASS_DEFINITIONS[playerClass].branch === 'rapid'`). Ohne den
Schalter trägt kein Snapshot ein `signature`-Feld, und dieser Abschnitt ist
gegenstandslos.

**Was der Server rechnet** (`apps/server/src/signature-rapid.ts`), einmal je
Tick, *nach* der Bewegungsintegration aus Abschnitt 3:

```
speed    = |velocity|                          // die Geschwindigkeit NACH dem Tick
moving   = speed >= 0.45 * stats.moveSpeed     // moveThreshold
rate     = !moving          ? -50              // decayPerSecond
         : primary          ? +30              // buildPerSecond
         :                    -10              // holdDecayPerSecond
momentum = clamp(momentum + rate * dt, 0, 100)
```

Der Schuss dieses Ticks nutzt noch das Momentum **vom Tick davor**: Zuerst wird
der Nachladewert skaliert, dann das Momentum fortgeschrieben.

```
reload_effektiv = reload * (1 - 0.25 * momentum / 100)     // maxReloadBonus
```

**Drei Fallen für den Nachbau:**

1. **Der Aufbau hängt an `primary`, nicht am Schuss.** Gebaut wird, solange die
   Feuertaste gehalten wird – auch in den Ticks, in denen der Nachladewert noch
   läuft. Wer nur bei tatsächlichen Schüssen aufbaut, lädt bei einer Gatling
   (0,28 s) fünfmal langsamer als bei einer Rapid (0,19 s).
2. **`moving` misst die tatsächliche Geschwindigkeit, nicht die Eingabe.** Wer
   gegen eine Wand drückt, hat volle Eingabe und `speed = 0` – die blockierte
   Achse wird genullt (Abschnitt 3). Der Server baut in diesem Fall ab, und der
   Client muss das genauso sehen, sonst zeigt der Balken dauerhaft zu viel.
   `stats.moveSpeed` ist der **getunte** Wert inklusive Bewegungs-Upgrades und
   Frame-Multiplikator, nicht `CLASS_DEFINITIONS[...].moveSpeed`.
3. **Der Balken ist gerundet, die Rechnung nicht.** Im Snapshot steht
   `Math.round(momentum)`. Wer den gerundeten Wert weiterakkumuliert, driftet
   weg – der Client rechnet mit seinem eigenen ungerundeten Wert und übernimmt
   den Serverwert bei jeder Korrektur (`lastProcessedInput`, Abschnitt 1).

**Zurücksetzen:** Beim Tod auf 0, beim Verlassen der Familie (Respawn unter
Level 10 macht aus einem Storm wieder einen Core) verschwindet das Feld ganz.

## 7. Kurzcheck für den Nachbau

- [ ] `dt` ist exakt `1/40`, nicht die Framezeit
- [ ] `clampMagnitude` statt Normieren
- [ ] Geschwindigkeitsannäherung vektoriell, kein eigener Reibungsfaktor
- [ ] Substep-Zahl `ceil(|v| * dt / 12,1)`, mindestens 1
- [ ] X vor Y, Y mit dem neuen X
- [ ] blockierte Achse auf 0, auch für die Folge-Substeps
- [ ] `< r²` strikt, Weltgrenzen mit `radius` als Rand
- [ ] `ACCELERATION_SCALE` gespiegelt
- [ ] Korrektur weich, Hartkorrektur nur über der Schwelle
- [ ] Momentum (falls aktiv): Aufbau an `primary`, `moving` aus der echten
      Geschwindigkeit, Rechnung ungerundet

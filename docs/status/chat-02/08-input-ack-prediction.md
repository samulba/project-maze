# 08 – Input-Quittung für die Client-Prediction

**Branch:** `claude/input-ack-prediction` · **Basis:** `origin/main` @ `0daa9f0` · **Status: OFFEN – wartet auf Merge und Shared-Typ**

## Was drin ist

`lastProcessedInput` steckt jetzt in jedem Snapshot. Der wichtige Teil ist nicht
*dass* die Zahl drin ist, sondern **wann** sie hochzählt.

`applyInput` läuft sofort beim Eintreffen der Nachricht, integriert wird aber
erst im nächsten Tick – der Tick-Timer läuft mit 40 Hz, der Snapshot-Timer mit
30 Hz, Eingaben kommen asynchron dazwischen. Würde der Server einfach
`player.lastInput` melden, verwürfe der Client eine Eingabe, die der Server noch
gar nicht gerechnet hat: eine Tick-Länge Versatz bei jeder Korrektur, also genau
das Ruckeln, das die Vorhersage beseitigen soll. Die Sequenz wird deshalb **im
Tick** festgehalten und bis zum nächsten Tick unverändert gemeldet.

Die Schicht liegt **ganz außen**. Dort ist `selfId` garantiert der Empfänger –
auch wenn der Snapshot inhaltlich aus der Perspektive des Killers gebaut wurde
(Zuschauermodus). Ein Test belegt: Der Zuschauer bekommt seine eigene Quittung.

**Kein Flag.** Rein additives Feld, ~26 Bytes je Snapshot (0,6 %), stört keinen
Client, der es nicht kennt.

Dazu `docs/CLIENT_PREDICTION.md`: die serverseitige Bewegungsintegration Tick für
Tick, mit den drei Fallen, die im Nachbau Ruckeln erzeugen – Substep-Zahl
(`ceil(|v|·dt / 12,1)`), Achsenreihenfolge X vor Y (Y mit dem neuen X), und das
Nullen der blockierten Achse (bleibt auch im Folgetick 0). Plus: **es gibt keinen
Reibungsterm** – Bremsen ist derselbe Vorgang wie Beschleunigen.

## Fund beim Schreiben der Doku

Drei Bewegungstests fielen mit 42 statt 37,5 Einheiten pro Tick durch. Ursache:
**`ACCELERATION_SCALE = 1.12` in `combat-tuning.ts`** – steht nur im Server und
taucht in `CLASS_DEFINITIONS` nicht auf. Wer die Vorhersage aus den geteilten
Klassendefinitionen baut, liegt bei **jedem Tank 12 % neben der echten
Beschleunigung**, konstant, in jedem Tick. Dasselbe gilt für
`projectileSpeedScaleFor`, falls je Projektile vorhergesagt werden sollen.

Die Tests leiten ihre Erwartungswerte deshalb aus `tunedStatsFor` ab statt Zahlen
festzuschreiben – sie prüfen die Form der Rechnung und überleben die nächste
Balance-Runde.

## Dateien

`apps/server/src/input-ack.ts` (neu), `input-ack.test.ts` (neu),
`docs/CLIENT_PREDICTION.md` (neu), `index.ts`, `README.md`

## Tests

13 neu / 439 gesamt grün. Zwei Mutationsproben (beim Snapshot statt im Tick
quittieren; Quittung global statt je Empfänger) fallen jeweils im zuständigen
Test.

## Von 01 gebraucht

**1. `packages/shared/src/index.ts` – ein Feld in `WorldSnapshot`:**

```ts
/**
 * Sequenznummer der zuletzt in einen Tick eingeflossenen Eingabe dieses
 * Empfängers. `-1` = noch nichts verarbeitet. Der Client verwirft alle
 * gepufferten Eingaben bis einschließlich dieser Nummer und rechnet den Rest
 * auf der Serverposition nach.
 */
lastProcessedInput: number;
```

In `WireWorldSnapshot` mitführen. **Nicht** in `applyShortIds` umschreiben (keine
Entitäts-ID) und **nicht** in die „nur bei Änderung"-Logik aufnehmen – der Wert
ändert sich fast jeden Tick.

**2. `ACCELERATION_SCALE` nach shared verlagern** (Empfehlung):

```ts
/** Serverseitige Skalierung der Klassen-Beschleunigung. Client-Prediction muss sie spiegeln. */
export const ACCELERATION_SCALE = 1.12;
```

Sonst ist jede künftige Balance-Änderung daran eine Änderung an zwei Stellen –
und die zweite wird irgendwann vergessen.

**3. Client (03):** `docs/CLIENT_PREDICTION.md` ist dafür geschrieben,
Abschnitt 6 ist die Checkliste. Wichtigster Punkt: **Der Server ist nicht
warteschlangengesteuert.** Er rechnet jeden Tick mit der zuletzt empfangenen
Eingabe, nicht eine pro Tick. Nachrechnen ist deshalb prinzipbedingt eine
Näherung im Bereich eines Ticks – Korrektur weich einblenden (100–150 ms), hart
nachziehen erst ab ~60 Einheiten Abweichung.

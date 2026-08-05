# 10 – KL2-RAPID: Signature „Momentum"

**Branch:** `claude/signature-rapid-momentum` · **Basis:** `origin/main` @ `a36a0dd` ·
**Status: OFFEN – wartet auf Merge** · Auftrag: `docs/status/chat-01/auftrag-chat-02.md`

Die erste der vier Familien-Signatures steht. Flag **`SIGNATURE_RAPID_ENABLED`**
(Default aus): Ohne den Schalter wird die Schicht gar nicht erst angehängt,
`signature` taucht in keinem Snapshot auf, und die Nachladezeiten sind exakt die
alten. Zwei Tests und zwei Mutationsproben belegen genau das.

## Die Mechanik

Ein Skalar 0–100 je Spieler der Rapid-Familie, drei Zustände:

| Zustand | Rate | Konstante |
|---|---|---|
| fährt **und** hält die Feuertaste | **+30/s** | `buildPerSecond` |
| steht | **−50/s** | `decayPerSecond` |
| fährt, feuert aber nicht | **−10/s** | `holdDecayPerSecond` |

„In Bewegung" heißt ab **45 %** der eigenen Höchstgeschwindigkeit
(`moveThreshold`) – ein strafender Tank fällt beim Richtungswechsel kurz
darunter, das darf ihn nicht bestrafen. Wirkung: `reload × (1 − 0,25 · m/100)`
(`maxReloadBonus`). Von null auf Vollausschlag sind es 3,3 s Dauerfeuer in
Fahrt, zurück auf null 2 s im Stand. Der Aufbau ist bewusst träger als der
Abbau: Anfahren kostet, Anhalten kostet mehr.

### Zwei Entscheidungen, die nicht offensichtlich sind

**Der Aufbau hängt an `primary`, nicht am tatsächlichen Schuss.** Sonst hinge
die Aufbaurate an der Feuerrate: Eine Gatling (0,28 s) bräuchte für dieselbe
Ladung 47 % länger als eine Rapid (0,19 s) – ausgerechnet die Klasse, die am
meisten aufs Feuern setzt, wäre am schlechtesten dran. Eine Mutationsprobe
(„Aufbau hängt am Schuss") kippt sechs von dreizehn Tests.

**Der Schuss nutzt das Momentum vom Tick davor.** Erst wird der Nachladewert
skaliert, dann fortgeschrieben – die Kugel, die gerade rausgeht, benutzt den
Stand beim Abdrücken. Sonst bekäme der erste Schuss einer Salve rückwirkend
einen Bonus, den der Spieler beim Klicken noch nicht hatte.

## Wo die Schicht sitzt

`tuneRapidSignature` umschließt **`tuneCombatScaling`** – dort entsteht der
Cooldown, den die Signature verkürzt. Erkannt wird der Schuss daran, dass
`stepPlayer` den Cooldown **angehoben** hat; herunter zählt er sowieso jeden
Tick, hochgesetzt wird er nur beim Feuern. Damit bleibt `tunedStatsFor`
unangetastet und das Flag ist wirklich dicht: Ohne Schalter existiert die
Umhüllung nicht.

Die Bot-Regel braucht eine **zweite, äußere Schicht** (`tuneRapidBots`, direkt
um `tuneBotBrain`): Die Bot-Steuerung ersetzt `updateBot` vollständig, eine
innere Änderung würde stillschweigend überschrieben.

## Bots – erst gemessen, dann gebaut

Die Falle aus KL1 lautete: „Ein stehender Rapid-Bot wäre strikt schlechter."
Bevor ich eine Regel dagegen baue, habe ich nachgesehen, ob das Problem
überhaupt auftritt. 8 Storm-Bots, 180 s, 4 Läufe je Variante:

| | Ø Momentum | schwächster Bot | über Bewegungsschwelle |
|---|---|---|---|
| ohne Bot-Regel | 80,4 | 69,4 | 84 % |
| **mit Bot-Regel** | **83,5** | **75,3** | **87 %** |
| Vergleichsmensch (fährt + feuert dauerhaft) | 99,1 | – | – |

**Ehrlicher Befund: Rapid-Bots waren nie „strikt schlechter".** Die Steuerung
fährt praktisch immer – 84 % der Ticks über der Schwelle, ganz ohne Zutun. Die
Regel repariert keinen kaputten Fall, sie schließt den Rand: **+3,1 Punkte im
Mittel, +5,9 beim schwächsten Bot.** Sie greift genau dort, wo die Steuerung
bewusst anhält – beim Reparieren abseits des Gefechts, dem für Rapid teuersten
Moment. Gefeuert wird dabei weiterhin nicht, die Reparatur bricht also nicht ab,
und der Spawnschutz bleibt unangetastet (sonst würde die Regel ihn beenden).

## Balance-Sichtbarkeit

`npm run balance` hat einen eigenen Block bekommen. Die Zahlen kommen aus der
Server-Schicht, **nicht** aus einer zweiten Konstantenquelle – sonst balanciert
KL5 an Werten, die im Spiel nicht gelten. Dafür baut `prebalance` jetzt auch den
Server (vorher nur `shared`).

```
RAPID — SIGNATURE MOMENTUM (SIGNATURE_RAPID_ENABLED, max −25 % Nachladezeit)

CLASS          RELOAD    SHOTS/S @0  @50  @100    FWD DPS @0   @100    ZUWACHS
Rapid           0.190         5.26 6.02  7.02          55.3    73.7   +33%
Flanker         0.240         4.17 4.76  5.56          45.8    61.1   +33%
Repeater        0.340         2.94 3.36  3.92          70.6    94.1   +33%
Twin            0.250         4.00 4.57  5.33          76.0   101.3   +33%
Gatling         0.280         3.57 4.08  4.76          92.1   122.9   +33%
Octo            0.300         3.33 3.81  4.44          65.0    86.7   +33%
Storm           0.260         3.85 4.40  5.13          92.3   123.1   +33%
```

### Einordnung, die ich nicht verschweigen will

**−25 % Nachladezeit sind +33 % Feuerrate** – die Zahl klingt kleiner, als sie
ist. Damit steht die Rapid-Spitze bei vollem Momentum auf **123 FWD DPS**. Zum
Vergleich der bisherige Spitzenwert für Dauerschaden in der Arena: **Deadeye,
85,0.** Rapid liegt damit bei vollem Ausschlag **45 % über der nächstbesten
Familie** – bei allerdings kürzester Reichweite (1137–1232 gegen 2185–4346) und
niedrigster EHP.

Dazu kommt: Momentum ist **reiner Aufschlag, nie Abschlag.** Bei 0 gilt exakt
der alte Wert. Das Flag einzuschalten ist für Rapid also eine glatte
Verstärkung, kein Umbau. Zwei Wege, falls das zu viel ist:

1. **Konservativer starten:** `maxReloadBonus: 0.15` in `DEFAULT_BOT_PACING`s
   Nachbarn `DEFAULT_MOMENTUM` – eine Zahl, +18 % statt +33 %.
2. **Netto neutral:** Basis-Nachladezeit der Familie um ~12 % anheben, dann ist
   „campen" ein echter Malus und „fahren" der alte Normalwert. Das ginge nur
   über `CLASS_DEFINITIONS` (shared) und wäre ein eigener Auftrag – ich habe es
   **nicht** angefasst.

Ich habe die vorgeschlagenen 25 % umgesetzt, weil sie so beauftragt waren. Die
Entscheidung, ob es dabei bleibt, gehört zu 01 – die Zahlen dafür stehen jetzt
im Report, wo KL5 sie findet.

## Kosten, gemessen

**Das Feld** kostet praktisch nichts. Derselbe Snapshot, einmal mit und einmal
ohne die `signature`-Keys (60 s, identischer Weltzustand):

| Encoding | Snapshot ohne Feld | Aufschlag |
|---|---|---|
| roh | 8274 B | +15 B (**0,18 %**) |
| Deltas | 6105 B | +34 B (**0,55 %**) |
| Deltas + Kurz-IDs | 2866 B | +20 B (**0,69 %**) |

**Die Mechanik** kostet mehr als das Feld – und das ist der Punkt, den ich beim
ersten Messversuch fast übersehen hätte. Mehr Feuerrate heißt mehr Kugeln in der
Welt (8 Storm-Bots, 60 s, 3 Läufe je Variante):

| | ohne Flag | mit Flag | Δ |
|---|---|---|---|
| Ø Projektile in der Welt | 102,5 | 128,4 | **+25 %** |
| Ø Tick-Dauer | 0,99 ms | 1,34 ms | **+36 %** |

Einordnung: Das ist der **Extremfall** – alle acht Bots sind Storm. In einer
echten Arena stellt die Rapid-Familie etwa 40 % der Bots, der Aufschlag fällt
entsprechend kleiner aus. Und 1,34 ms sind gut 5 % des 25-ms-Budgets, also weit
weg von einer Grenze. Aber wenn KL2 einmal für alle vier Familien läuft, ist das
die Kennzahl, die man im Auge behält – nicht die Snapshot-Bytes.

Zur Methode, weil sie beim ersten Anlauf schiefging: Ein direkter Vergleich
„Flag an vs. Flag aus" misst hier **zwei** Dinge gleichzeitig, weil die Welten
sofort auseinanderlaufen (schnellere Bots treffen anders). Die erste Messung
zeigte deshalb −4 % Projektile, die Wiederholung über drei Läufe +25 %. Sauber
wird es nur, wenn man die Feldkosten am identischen Snapshot misst und die
Weltkosten getrennt und mehrfach.

## Tests

**13 neu / 462 gesamt**, alle deterministisch – die Bewegungsintegration und die
Nachladerechnung sind zufallsfrei, die Bot-Tests ersetzen die Bot-Steuerung
durch einen Stub, der immer anhält (so hängt der Test an der Regel und nicht an
`tuneBotBrain`).

Ein Testdetail, das erklärt werden will: Der Tank läuft auf einem **Laufband** –
nach jedem Tick wird die Position zurückgesetzt, die Geschwindigkeit bleibt.
Ohne das wäre nach zehn Sekunden Geradeausfahrt der Weltrand erreicht, und ein
Tank an der Wand hat zu Recht kein Momentum mehr (die blockierte Achse wird
genullt) – der Testfehler beim ersten Durchlauf.

Vierzehn Mutationsproben, jede gefangen:

| Mutation | gefangen |
|---|---|
| Nachladebonus wirkt nicht | 1 Test |
| Aufbau hängt am Schuss statt an `primary` | 6 Tests |
| Deckel bei 100 fehlt | 4 Tests |
| Stillstand baut nicht ab | 1 Test |
| Fahrt ohne Feuer hält komplett | 1 Test |
| Bewegungsschwelle ignoriert | 1 Test |
| Nicht-Rapid bekommt auch Momentum | 2 Tests |
| Tod setzt nicht zurück | 1 Test |
| Snapshot ungerundet | 1 Test |
| Skala clamped nicht (Werte außerhalb 0–100) | 1 Test |
| Signature-Schicht ohne Flag aktiv | 1 Test |
| Bot-Regel greift auch ohne Flag | 1 Test |
| Bot-Regel ignoriert Spawnschutz | 1 Test |
| Bot-Regel überschreibt fahrende Bots | 1 Test |

## Geänderte Dateien

| Datei | Was |
|---|---|
| `apps/server/src/signature-rapid.ts` | **neu** – Mechanik, `DEFAULT_MOMENTUM`, `momentumReloadScale`, `momentumFireRate`, Bot-Bewegungsregel |
| `apps/server/src/signature-rapid.test.ts` | **neu** – 13 Tests |
| `apps/server/src/index.ts` | `SIGNATURE_RAPID_ENABLED`, beide Schichten in die Kette |
| `scripts/balance-report.mjs` | Momentum-Block (Feuerrate @0/50/100, FWD DPS @0/@100) |
| `package.json` | `prebalance` baut jetzt auch den Server |
| `docs/CLIENT_PREDICTION.md` | Abschnitt 6: was der Client spiegeln muss, mit drei Fallen |
| `README.md` | Flag und Mechanik dokumentiert |

## Von 01 gebraucht

### 1. Nichts zwingend – shared ist bereits fertig

`PlayerSnapshot.signature?: number` steht und wird korrekt gefüllt. Kurz-IDs und
Deltas brauchen nichts Neues (keine ID, kein statisches Feld). Der Server
schreibt ausschließlich ganze Zahlen 0–100.

### 2. Zur Kenntnis: `prebalance` baut jetzt auch den Server

`npm run balance` dauert dadurch länger. Der Grund ist Absicht: Die
Momentum-Zahlen kommen aus `apps/server/dist/signature-rapid.js`, damit im
Report exakt die Werte stehen, die im Spiel gelten. Wenn du die Konstanten
lieber in `packages/shared/src/balance.ts` hättest, wäre der Vorschlag:

```ts
// packages/shared/src/balance.ts
/** Nachladeabschlag der RAPID-Signature bei vollem Momentum (KL2). */
export const MOMENTUM_MAX_RELOAD_BONUS = 0.25;

/** Effektive Feuerrate (Schuss/s) bei gegebenem Momentum 0–100. */
export function momentumFireRate(playerClass: PlayerClass, momentum: number): number {
  const reload = CLASS_DEFINITIONS[playerClass].reload;
  const clamped = Math.max(0, Math.min(100, momentum));
  return 1 / Math.max(0.001, reload * (1 - MOMENTUM_MAX_RELOAD_BONUS * clamped / 100));
}
```

Dann importiert der Server die Konstante von dort und der Report kommt ohne
Server-Build aus. **Meine Empfehlung: erst machen, wenn KL2 für alle vier
Familien steht** – sonst wandern vier Konstantensätze einzeln nach shared. Bis
dahin ist der Server-Build der ehrlichere Weg.

### 3. Entscheidung, die bei dir liegt

**Bleibt es bei −25 % (= +33 % Feuerrate)?** Zahlen und die beiden Alternativen
stehen oben unter „Einordnung". Eine Zahl in `DEFAULT_MOMENTUM`, wenn nicht.

### 4. Für 03 (Folgepaket HUD)

`docs/CLIENT_PREDICTION.md` Abschnitt 6 beschreibt die Rechnung vollständig. Für
den reinen Balken reicht `player.signature` (0–100, fehlt = keine Signature).
Nachbauen muss 03 die Rechnung erst mit N2 – dann aber exakt, inklusive der drei
dokumentierten Fallen.

## Abweichungen vom Auftrag

1. **Die Bot-Regel ist kleiner ausgefallen als der Auftrag nahelegt**, weil die
   Messung zeigt, dass das befürchtete Problem so nicht existiert (80/100 ohne
   jede Regel). Sie greift jetzt nur noch dort, wo die Steuerung wirklich
   anhält, und bringt +3 Punkte. Ich halte das für richtig so – eine größere
   Regel hätte Bot-Verhalten geändert, ohne ein Problem zu lösen.
2. **`package.json` angefasst** (`prebalance`). Formal 01s Gebiet, inhaltlich
   die Voraussetzung dafür, dass der Balance-Report die echten Zahlen zeigt.
   Rückgängig zu machen mit einer Zeile.
3. **Die Momentum-Spalte ist ein eigener Block statt einer Spalte in der
   Haupttabelle.** Drei zusätzliche Spalten hätten die Tabelle für 22 Klassen
   verbreitert, die nichts damit zu tun haben.

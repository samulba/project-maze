# 12 – KL4-Konzept: Familien-Upgrades

**Basis:** `origin/main` @ `d8568b6` · **Kein Code, kein Branch** – Vorschlagspaket
laut Auftrag · Auftrag: `docs/status/chat-01/auftrag-chat-02.md`

Alle Zahlen unten sind aus dem Code gerechnet, nicht geschätzt.

---

## Vorab: dein Hinweis zum Viertel-Deckel-Test

Angenommen, ohne Wenn und Aber. Der Test baute zwei getrennte Spiele und
verglich deren Zeit-bis-Tod – zwei Spiele heißen zwei zufällige Formen-Welten,
und eine Form am Messpunkt verschiebt die Messung. Ich hatte den Weltzustand
beim Anlauf abgesichert (Opfer jeden Tick geheilt), aber nicht bei der Messung
selbst. `internals.shapes.clear()` ist die richtige Antwort. Notiert: Regel 8
gilt auch für den Weltzustand, nicht nur für `Math.random()`.

---

## Die Kernfrage, die das Konzept entscheidet

Ich habe mit der naheliegenden Variante angefangen – *das Familien-Upgrade
addiert auf den heutigen Festwert* – und sie durchgerechnet. Sie funktioniert
nicht, und zwar aus einem Grund, der für alle vier Familien gilt:

| n | Basis `reload`, Grenzwert je Punkt | `signaturePower` (additiv), Grenzwert | Verhältnis |
|---|---|---|---|
| 1 | +5,3 % Feuerrate | +2,3 % | **0,43×** |
| 4 | +6,1 % | +2,5 % | **0,41×** |
| 8 | +7,5 % | +2,9 % | **0,39×** |

Ein Punkt in `signaturePower` wäre **zwei Fünftel** eines Punktes in `reload`
wert – und der wirkt auch noch nur bei vollem Momentum. **Niemand würde ihn je
nehmen.** Dreht man an der Schraube, bis er konkurrenzfähig ist, multiplizieren
sich zwei Werte auf derselben Achse: 8 Punkte `reload` (×1,51) mal ein
aufgewerteter Momentum-Bonus ergeben schnell die dreifache Feuerrate. Zwischen
„tot" und „explodiert" liegt kein brauchbares Fenster.

**Die Ursache ist strukturell:** Solange die Signature einen kostenlosen
Festwert hat und das Upgrade nur obendrauf kommt, konkurriert das Upgrade gegen
einen Basiswert auf derselben Achse und verliert oder explodiert.

### Der Vorschlag: der Festwert wandert **in** die Punkte-Ökonomie

Statt „Signature gratis + Upgrade obendrauf": **die Signature-Stärke ist das
Upgrade.** Ein kleiner Sockel bleibt (damit die Familie sich auch ohne
Investition nach Familie anfühlt und Slot 1 keine Falle wird), der Rest kommt
aus Punkten.

| | Sockel (0 Punkte) | je Punkt | bei 8 Punkten | heutiger Festwert erreicht bei |
|---|---|---|---|---|
| RAPID `maxReloadBonus` | 0,08 | +0,034 | 0,352 | **n = 5** |
| IMPACT `maxBodyDamageBonus` | 0,50 | +0,19 | 2,02 | n = 5 |

Und damit stimmt der Grenzwert:

| n | `maxReloadBonus` | Feuerrate @100 | Grenzwert | Basis `reload` Grenzwert | **Verhältnis** |
|---|---|---|---|---|---|
| 1 | 0,114 | 1,129× | +4,2 % | +5,3 % | **0,79×** |
| 2 | 0,148 | 1,174× | +4,5 % | +5,5 % | 0,81× |
| 4 | 0,216 | 1,276× | +5,3 % | +6,1 % | 0,86× |
| 6 | 0,284 | 1,397× | +6,3 % | +6,8 % | 0,93× |
| 8 | 0,352 | 1,543× | +7,7 % | +7,5 % | **1,02×** |

Nominal 0,79–1,02× des besten Basis-Upgrades – und weil der Bonus nur bei vollem
Momentum zieht, liegt der *tatsächliche* Wert darunter. Kein toter Slot, kein
Selbstläufer. Die steigende Kurve ist Absicht: Wer sich für die Signature
entscheidet, soll sie auch ausbauen, nicht zwei Punkte mitnehmen.

**Was das kostet, ehrlich benannt:** Wer null Punkte investiert, hat eine
deutlich schwächere Signature als heute (0,08 statt 0,25). Das ist die Antwort
auf die Punkte-Frage – und nebenbei die Auflösung des Einwands aus Paket 10
(„Momentum ist reiner Aufschlag, das Flag einzuschalten ist eine glatte
Verstärkung"). Ab KL4 bezahlt man die Signature.

---

## 1. Protokoll

### Empfehlung: **zwei familienneutrale IDs an `UPGRADE_IDS` anhängen**

```ts
// packages/shared/src/index.ts
export const UPGRADE_IDS = [
  'maxHealth', 'regen', 'moveSpeed', 'reload',
  'damage', 'projectileSpeed', 'penetration', 'bodyDamage',
  /**
   * Familien-Slots (Klassen 3.0/KL4). Wie `PlayerSnapshot.signature` ergibt
   * sich die Bedeutung aus der Familie des Spielers:
   *   RAPID     signatureRate = Momentum-Aufbau · signaturePower = Momentum-Maximum
   *   IMPACT    signatureRate = Anlauf-Tempo    · signaturePower = Wucht-Skalierung
   *   PRECISION signatureRate = Ladetempo       · signaturePower = Ladebonus
   *   CONTROL   signatureRate = Budget-Nachschub · signaturePower = Einheitenstärke
   * Ohne Familie (Core) sind beide gesperrt.
   */
  'signatureRate',
  'signaturePower'
] as const;

export interface UpgradeLevels {
  maxHealth: number; regen: number; moveSpeed: number; reload: number;
  damage: number; projectileSpeed: number; penetration: number; bodyDamage: number;
  signatureRate: number;
  signaturePower: number;
}

export const EMPTY_UPGRADES = (): UpgradeLevels => ({
  maxHealth:0, regen:0, moveSpeed:0, reload:0, damage:0,
  projectileSpeed:0, penetration:0, bodyDamage:0,
  signatureRate:0, signaturePower:0
});
```

**Warum zwei neutrale Slots und nicht acht familienspezifische:** Acht IDs
hießen, dass jeder Spieler sechs dauerhaft leere Werte mitschleppt – im
Snapshot, im Hydrator, in der UI. Zwei Slots wachsen `UpgradeLevels` von 8 auf
10, und die Bedeutung ergibt sich aus `playerClass` – **genau das Muster, das
wir mit `signature?: number` schon etabliert haben.** Ein Muster, nicht zwei.

**Warum nicht ein eigenes Feld `familyUpgrades`:** Es bräuchte eigene Einträge
in der Delta-Signatur, im Statik-Strip, im Hydrator und in der Validierung –
vier Stellen, die beim Anhängen an `UPGRADE_IDS` **automatisch** mitgehen (siehe
unten). Der einzige Vorteil wäre Rückwärtskompatibilität mit Clients, die
`UPGRADE_IDS` nicht kennen – die gibt es hier nicht, Client und Server werden
zusammen ausgeliefert.

### Was automatisch mitgeht (geprüft, nicht vermutet)

| Stelle | Verhalten beim Anhängen |
|---|---|
| `snapshot-encoding.ts:117` (Delta-Signatur) | iteriert `UPGRADE_IDS` → wächst mit ✓ |
| `snapshot-encoding.ts:203` (Statik-Strip) | strippt `upgrades` als Ganzes ✓ |
| `snapshot-hydrator.ts:50` (Client) | `Object.fromEntries(UPGRADE_IDS.map(id => [id, 0]))` ✓ |
| `index.ts:232` (Validierung) | `z.enum(UPGRADE_IDS)` ✓ |
| `combat-tuning.ts` `applyUpgrade` | prüft `UPGRADE_IDS.includes(...)` und den Deckel ✓ |
| `input.ts:80` Taste **9** | `Number('Digit9'.slice(5)) - 1 = 8` → trifft Slot 9 ✓ |

### Was **nicht** automatisch mitgeht (drei Stellen)

1. **Taste 0.** `Number('Digit0'.slice(5)) - 1 = -1` → `UPGRADE_IDS[-1]` ist
   `undefined`, die Taste tut nichts. Slot 10 braucht eine Zeile im Client
   (03): `const index = event.code === 'Digit0' ? 9 : Number(...) - 1;`
2. **Die Familiensperre.** `applyUpgrade` muss die beiden Slots ablehnen,
   solange der Spieler keine Familie hat (`branch === 'core'`). Server, meine
   Seite.
3. **Test-Fixturen mit `UpgradeLevels`-Literalen** brauchen die zwei neuen
   Schlüssel. Empfehlung: überall `EMPTY_UPGRADES()` statt Literal.

### Bandbreite

`upgrades` ist ein **Statik-Feld** – es geht nur raus, wenn es sich ändert. Zwei
zusätzliche Ganzzahlen kosten dann rund 4 Bytes je Änderung. Bei
`SNAPSHOT_DELTAS=false` sind es dieselben 4 Bytes je Snapshot und Spieler,
gemessen an ~8,3 KB Snapshot also unter 0,05 %. **Nicht messwürdig.**

---

## 2. Punkte-Ökonomie

**Empfehlung: gleicher Pool, keine neuen Punkte, keine Änderung an der
Levelkurve.**

| | heute | mit 2 Familien-Slots |
|---|---|---|
| Punkte auf Level 45 (`upgradePointsAtLevel`) | 44 | 44 |
| Kapazität (Werte × `maxUpgradeLevel` 8) | 64 | 80 |
| davon füllbar | **69 %** | **55 %** |
| ein voll ausgebauter Familien-Slot | – | 8 Punkte = **18 %** des Budgets |

Der Reiz entsteht genau daraus: Heute kann ein Level-45-Build 5,5 von 8 Werten
maximieren – die Wahl ist eng. Mit zehn Werten wird sie echt.

### Beispiel-Build, Level 45, Storm, jeweils 44 Punkte

| | FWD DPS @0 Momentum | @100 Momentum | voll geladen nach |
|---|---|---|---|
| **klassisch** – reload 8, damage 8, projSpeed 8, moveSpeed 8, maxHealth 8, pen 4 | 139,1 | 151,2 | 3,33 s |
| **Signature-Build** – reload 8, damage 8, moveSpeed 6, maxHealth 6, sigPower 8, sigRate 8 | 139,1 | **214,7** | **1,94 s** |

Gleiche Grundfeuerkraft, **+42 % Deckenwert bei vollem Momentum**, bezahlt mit
zwei Punkten Tempo und zwei Punkten Leben – der Signature-Build ist dünner und
langsamer und muss dafür in Bewegung bleiben. Genau die Trennung, die
„Familie = Spielstil" verlangt.

### Die beiden Alternativen, und warum nicht

- **Eigene Punkte je Klassenstufe** (+1 auf Level 10/24/38): Drei Punkte auf
  einen Slot mit acht Stufen – zu wenig, um etwas zu ändern, und es bräuchte
  einen zweiten Zähler im Snapshot (`availableFamilyPoints`) plus eine zweite
  Vergabelogik. Viel Protokoll für wenig Wirkung.
- **Levelkurve umbauen:** trifft alle 29 Klassen und die gesamte bestehende
  Balance. Kein vertretbares Verhältnis für zwei Slots.

### Ein Detail, das die Ökonomie entschärft

`respawn` setzt `upgrades` auf `EMPTY_UPGRADES()` und vergibt die Punkte neu.
Builds werden also **bei jedem Wiedereinstieg neu gewählt** – ein Fehlgriff hält
nur ein Leben. Das erste Leben bleibt der einzige Fall, in dem jemand Punkte
ausgibt, bevor er auf Level 10 eine Familie hat. Empfehlung: keine Sonderregel,
kein Respec – das Spiel repariert das von selbst.

---

## 3. Wirkung je Familie

### RAPID – konkret, gegen `DEFAULT_MOMENTUM`

| Slot | Konstante | Sockel | je Punkt | bei 8 |
|---|---|---|---|---|
| `signatureRate` | `buildPerSecond` | 30/s | ×(1 + 0,09·n) | 51,6/s → voll nach **1,94 s** statt 3,33 s |
| `signaturePower` | `maxReloadBonus` | 0,08 | +0,034 | 0,352 → **−35 % Nachladezeit** bei vollem Momentum |

### IMPACT – konkret, gegen `DEFAULT_WUCHT`

| Slot | Konstante | Sockel | je Punkt | bei 8 |
|---|---|---|---|---|
| `signatureRate` | `buildPerSecond` | 30/s | ×(1 + 0,09·n) | 51,6/s → Nachladen des Anlaufs in 1,94 s |
| `signaturePower` | `maxBodyDamageBonus` | 0,50 | +0,19 | 2,02 → bis **×3,02** Körperschaden |

**Der One-Shot-Deckel bleibt upgrade-fest** – das ist die wichtigste Eigenschaft
des ganzen Vorschlags. Der Anteilsdeckel (`maxContactShare = 0.08`) ist absolut
und wird von keinem Upgrade angefasst:

| Klasse | Opfer-HP | Grund/Tick | n=0 | n=4 | n=8 | Deckel | bei n=8 |
|---|---|---|---|---|---|---|---|
| Rammer | 94 | 2,32 | 3,48 | 5,24 | 7,01 | 7,52 | knapp darunter |
| Crusher | 92 | 3,36 | 5,04 | 7,36 | 7,36 | 7,36 | **gedeckelt** |
| Bulwark | 92 | 2,72 | 4,08 | 6,15 | 7,36 | 7,36 | **gedeckelt** |
| Juggernaut | 86 | 4,80 | 6,88 | 6,88 | 6,88 | 6,88 | **gedeckelt** |
| Fortress | 86 | 3,60 | 5,40 | 6,88 | 6,88 | 6,88 | **gedeckelt** |
| Blitz | 92 | 2,40 | 3,60 | 5,42 | 7,25 | 7,36 | knapp darunter |
| Comet | 86 | 3,52 | 5,28 | 6,88 | 6,88 | 6,88 | **gedeckelt** |

Fünf von sieben Klassen laufen bei vollem Ausbau in den Deckel, zwei bleiben
knapp darunter. `WUCHT_MAX_TTK_GAIN` gilt damit **unverändert auf jeder
Upgrade-Stufe**. Der bestehende Test deckt das ab, sobald er über die
Upgrade-Stufen läuft – das ist eine Zeile mehr Schleife.

Beim Anlauf-Tempo ist Impact interessanter als Rapid: Der Anlauf wird bei jedem
Aufprall verbraucht, `signatureRate` bestimmt also direkt, **wie oft** ein
Rammstoß mit voller Wucht landet. Doppelte Aufbaurate ≈ doppelt so viele
geladene Stöße.

### PRECISION – Annahme (Signature existiert noch nicht)

| Slot | vermutete Konstante | Wirkung |
|---|---|---|
| `signatureRate` | Ladetempo (Ladung/s) | volle Ladung schneller – der Kernwert der Familie |
| `signaturePower` | Ladebonus (Schaden × bei voller Ladung) | wie hart der eine perfekte Treffer sitzt |

**Warnung aus KL1, die hier doppelt zählt:** Precision zahlt jeden Fehlschuss
mit einer kompletten Ladephase. Ein `signaturePower`, das den Volltreffer
verstärkt, verschiebt die Varianz nach oben – gut für das Spielgefühl, riskant
für die Balance. `signatureRate` ist der ruhigere der beiden Slots und sollte
der stärkere sein.

### CONTROL – Annahme (Signature existiert noch nicht)

| Slot | vermutete Konstante | Wirkung |
|---|---|---|
| `signatureRate` | Budget-Nachschub | wie schnell verlorene Einheiten zurückkommen |
| `signaturePower` | Einheitenstärke (HP/Schaden je Einheit) | wie viel eine Einheit aushält und austeilt |

Hier ist der Deckel wichtiger als bei allen anderen: Einheiten sind **eigene
Entitäten** im Snapshot und in der Kollision. `signaturePower` (stärkere
Einheiten) kostet nichts an Tick-Budget, `signatureRate` (mehr/schnellere
Einheiten) schon. Empfehlung: `signatureRate` bei Control auf Nachschub-Tempo
begrenzen, **nicht** auf die Zahl der Einheiten – sonst skaliert die
Serverlast mit dem Build.

---

## 4. Bot-Pfade

**Anhängen reicht nicht – die Slots müssen nach vorn.**

`spendBotPoints` arbeitet `upgradePath` der Reihe nach ab und schüttet jeweils
alles hinein, bis der Deckel steht. Bei 44 Punkten und 8 Stufen je Wert füllt
ein Bot **5,5 Einträge**. Die Plätze 6–8 werden nie erreicht. Ein an die Liste
angehängter Familien-Slot wäre für Bots schlicht nicht existent.

Vorschlag (die beiden Slots jeweils an Position 2 und 4, passend zum Stil):

```ts
farmer:     ['reload', 'signaturePower', 'damage', 'signatureRate',
             'projectileSpeed', 'moveSpeed', 'maxHealth', 'penetration', 'regen', 'bodyDamage'],
brawler:    ['bodyDamage', 'signaturePower', 'maxHealth', 'signatureRate',
             'moveSpeed', 'regen', 'damage', 'reload', 'penetration', 'projectileSpeed'],
hunter:     ['damage', 'signaturePower', 'penetration', 'signatureRate', …],   // nach KL2-Precision
kiter:      ['moveSpeed', 'signatureRate', 'projectileSpeed', 'signaturePower', …],
controller: ['damage', 'signatureRate', 'reload', 'signaturePower', …]
```

### Eine Falle, die dabei aufgeht – bitte mitlesen

```ts
// game.ts, spendBotPoints
for (const upgrade of player.bot.upgradePath) {
  while (player.availablePoints > 0 && player.upgrades[upgrade] < GAME.maxUpgradeLevel)
    this.applyUpgrade(player.id, upgrade);
  …
}
```

Die Schleife bricht **nur** über die beiden Bedingungen ab. Lehnt `applyUpgrade`
ab, ohne einen Punkt zu verbrauchen, dreht sie **endlos**. Heute unerreichbar:
`applyUpgrade` scheitert nur an `dead`, an fehlenden Punkten oder am Deckel –
alles schon in der Bedingung. **Mit der Familiensperre wird es erreichbar:** Ein
Bot auf Level 9 mit Punkten und `signaturePower` im Pfad hängt den Server auf.

Die Absicherung ist eine Zeile:

```ts
while (player.availablePoints > 0 && player.upgrades[upgrade] < GAME.maxUpgradeLevel) {
  if (!this.applyUpgrade(player.id, upgrade)) break;
}
```

Ich habe sie **nicht** eingebaut – dieses Paket ist ein Vorschlag, und ein
Drive-by-Commit in fremdem Kontext gehört nicht dazu. Sie ist Teil des
KL4-Implementierungspakets, oder ich liefere sie vorab, wenn du willst.

---

## 5. Balance-Leitplanke im Report

**Kennzahl: Grenzwert je Punkt, gemessen in der Währung der Familie.**

Für Slot *s* und Punkt *n*: die Änderung der familientypischen Ausgabe durch den
*n*-ten Punkt, geteilt durch dieselbe Änderung beim **besten Basis-Upgrade auf
derselben Ausgabe**.

| Familie | Ausgabe | Bestes Basis-Upgrade zum Vergleich |
|---|---|---|
| RAPID | Feuerrate bei vollem Momentum | `reload` |
| IMPACT | Kontaktschaden nach Deckel bei voller Wucht | `bodyDamage` |
| PRECISION | Schaden je Volltreffer | `damage` |
| CONTROL | Einheiten-DPS | `damage` |

Zwei Schwellen, beide im Report als Flag:

| Verhältnis | Urteil |
|---|---|
| **< 0,5** | **TOT** – niemand nimmt den Slot |
| 0,5 – 1,2 | in Ordnung |
| **> 1,2** | **DOMINANT** – niemand nimmt den Basiswert |

Der Vorschlag oben landet bei 0,79–1,02 – und liegt real darunter, weil der
Bonus an die Signature gebunden ist.

Neuer Block, analog zu den beiden bestehenden Signature-Blöcken:

```
FAMILIEN-UPGRADES — DOMINANZPRUEFUNG

FAMILIE   SLOT              PUNKT 1   PUNKT 4   PUNKT 8   BASIS      VERHAELTNIS   URTEIL
RAPID     signaturePower     +4.2 %    +5.3 %    +7.7 %   reload     0.79–1.02x    OK
RAPID     signatureRate      …
IMPACT    signaturePower     …                            bodyDamage               OK
```

**Zwei Dinge gehören zusätzlich in die Tests, nicht in den Report:**

1. **Der One-Shot-Deckel muss upgrade-fest sein.** Der bestehende
   `WUCHT_MAX_TTK_GAIN`-Test läuft heute bei `signaturePower = 0`; er muss über
   alle acht Stufen laufen. Tabelle oben zeigt, dass er hält – bewiesen ist er
   erst mit dem Test.
2. **Kein Slot darf ohne Familie kaufbar sein.** Ein Test je Familie, plus einer
   für Core.

---

## Von 01 gebraucht

### 1. Entscheidung: Variante B?

Der Kern des Vorschlags ist, dass **der heutige Signature-Festwert in die
Punkte-Ökonomie wandert** (Sockel + Punkte statt Gratis-Festwert). Ohne das gibt
es kein Fenster zwischen „tot" und „explodiert" – die Rechnung dafür steht ganz
oben. Das ist eine Design-Entscheidung, keine technische, und sie ändert
rückwirkend, wie sich Rapid und Impact ohne Investition anfühlen.

### 2. Shared-Änderung, fertig zum Einbauen

`UPGRADE_IDS` + `UpgradeLevels` + `EMPTY_UPGRADES` wie oben (Abschnitt 1). Zwei
Einträge, drei Stellen.

### 3. Für 03: eine Zeile plus zwei Beschriftungen

- `input.ts`: `Digit0` auf Index 9 abbilden (heute `-1`).
- Die beiden Upgrade-Knöpfe brauchen familienabhängige Beschriftungen –
  dieselbe Ableitung aus `playerClass` wie beim `signature`-Balken.
- Ohne Familie (Core) beide Knöpfe gesperrt darstellen.

### 4. Was ich als Nächstes liefern kann

Sobald die Shared-Änderung steht: Server-Seite von KL4 (Familiensperre,
Skalierung an beiden Signatures, erweiterte Bot-Pfade, Endlosschleifen-
Absicherung) plus den Dominanz-Block im Report und die zwei zusätzlichen Tests.
Precision und Control tragen ihre Slots erst, wenn ihre Signatures stehen – die
IDs dürfen trotzdem jetzt schon rein, sie bleiben bis dahin einfach ohne
Wirkung.

## Abweichungen vom Auftrag

1. **Der Auftrag beschreibt acht familienspezifische Upgrade-Werte** („Rapid
   Momentum-Aufbau/-Maximum · Precision Ladetempo/Ladebonus · …"). Ich schlage
   **zwei familienneutrale Slots** vor, deren Bedeutung sich aus der Familie
   ergibt. Inhaltlich identisch, im Protokoll ein Viertel so groß, und
   konsistent mit `signature?: number`.
2. **Impacts zweiter Wert heißt im Masterplan „Charge-Abklingzeit".** Es gibt
   keine Charge-Angriffe – KL2-Impact hat bewusst nur die Anlauf-Skalierung
   gebaut. Ich habe den Slot auf das Anlauf-Tempo gelegt, das messbar wirkt.
   Sobald Charge-Angriffe kommen, passt dieselbe Konstante weiter.
3. **Kein Prototyp-Branch.** Ohne die Shared-IDs müsste ich das Protokoll
   serverlokal nachbauen; das Ergebnis wäre eine Attrappe, die den echten
   Aufwand eher verschleiert als zeigt.

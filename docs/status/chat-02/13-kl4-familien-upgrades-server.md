# 13 – KL4: Familien-Upgrades, Server-Seite

**Branch:** `claude/chat-02-server-gameplay-w1i4o8` · **Basis:** `origin/main` @ `de7546c`
**Auftrag:** `docs/status/chat-01/auftrag-chat-02.md` (2. Fassung) · **Flag:** `FAMILY_UPGRADES_ENABLED`, Default aus

Variante B ist gebaut, mit allen fünf Punkten des Auftrags. Zwei Dinge sind
anders geworden als geplant, und der Report meldet zwei Balance-Befunde, die ich
nicht selbst weggedreht habe – beides steht unten.

---

## Was drin ist

**Shared (freigegeben):** `signatureRate` und `signaturePower` hängen an
`UPGRADE_IDS`, `UpgradeLevels` und `EMPTY_UPGRADES`. Die acht Basis-IDs behalten
Reihenfolge und Index; ein Test schreibt das fest, damit die Delta-Signatur, der
Hydrator und die Tasten 1–8 nicht still verrutschen.

**Neue Schicht `apps/server/src/family-upgrades.ts`.** Sie hält die Zahlen, die
reinen Umrechnungen und die Familiensperre zusammen – eine Quelle für Server,
Tests und Balance-Report.

Sie sitzt **direkt außerhalb von `tuneCombatScaling`**. Das ist kein freier
Platz: `tuneCombatScaling` *ersetzt* `applyUpgrade` vollständig, statt die
vorherige Fassung aufzurufen. Weiter innen wäre die Sperre kommentarlos
überschrieben worden – ohne Fehler, ohne Test, der es merkt. Weiter außen ginge
auch, aber dann läge zwischen Sperre und Kaufregel die halbe Kette.

| Was | Wie |
|---|---|
| Familiensperre | `applyUpgrade` lehnt beide Slots ab, solange die Familie des Spielers keine **laufende** Signature hat. Core ist damit gesperrt, ohne Flag alles. |
| Skalierung RAPID | `maxReloadBonus` = 0,08 + 0,034·n · Aufbau ×(1 + 0,09·n) |
| Skalierung IMPACT | `maxBodyDamageBonus` = 0,50 + 0,19·n · Aufbau ×(1 + 0,09·n) |
| Unangetastet | `maxContactShare`, `contactDrainPerSecond`, alle Abbauraten, die Bewegungsschwelle |
| Bot-Pfade | beide Slots auf Position 2 und 4, Kiter und Controller mit `signatureRate` zuerst |
| Endlosschleife | Abbruch bei Ablehnung – in `game.ts` **und** in der Schicht |

Der Anteilsdeckel ist die wichtigste dieser Zeilen. Er bleibt absolut, und der
Test unten belegt, dass `WUCHT_MAX_TTK_GAIN` damit auf **jeder** der acht Stufen
hält, nicht nur bei null Punkten.

### Die Endlosschleife ist enger, als sie aussieht – und deshalb gefährlicher

Der Aufhänger braucht nicht nur einen gesperrten Slot im Pfad, sondern **Punkte,
die beim Erreichen noch übrig sind**. Sonst bricht schon die Schleifenbedingung
ab. Mein erster Testfall (Bot auf Level 9) traf das nicht: 8 Punkte, der erste
Pfadeintrag nimmt alle acht, der Slot wird nie erreicht. Der Test war grün –
auch mit entferntem Abbruch.

Der echte Fall ist **Level 10**: 9 Punkte, der erste Eintrag nimmt 8, einer
bleibt übrig, und `spendBotPoints` läuft im Aufstieg **vor** `advanceBotClass` –
der Bot ist in genau diesem Moment noch Core und damit gesperrt. Der Test steht
jetzt auf Level 10 und begründet das im Kommentar.

Zweite Lehre daraus: Eine Endlosschleife blockiert den Node-Event-Loop
vollständig. Der Testlauf schlägt nicht fehl, er *hängt* – in der CI ein Timeout
ohne Fehlermeldung. Beide Schleifentests deckeln deshalb die Zahl der
`applyUpgrade`-Aufrufe und werfen danach. Aus einem hängenden Lauf wird ein
lesbarer Fehlschlag in 7 ms.

---

## Tests

**19 neu / 585 gesamt, alle grün** (`npm run check`: Typecheck + Tests + Build).
18 davon in `family-upgrades.test.ts`, einer erweitert
`signature-impact.test.ts`.

Durchgeführte Mutationsproben – jede Zeile ist wirklich gelaufen:

| Mutation | Ergebnis |
|---|---|
| `maxContactShare` skaliert mit `signaturePower` | 3 Tests rot, darunter der neue Stufentest. **Der alte Ein-Stufen-Test blieb grün** – genau die Lücke, die er schließt. |
| Abbruch in der Schicht entfernt | Testlauf hängt (vor dem Deckel) → mit Deckel: roter Test in 7 ms |
| Abbruch in `game.ts` entfernt | roter Test in 2 ms |
| Sperre bei leerer Familienliste weggelassen | **Das war kein Probelauf, sondern ein echter Fund** – siehe unten |

### Der Fund: ohne Flag waren die Slots kaufbar

Meine erste Fassung hängte die Sperre nur an, wenn mindestens eine Familie offen
war. Das ist falsch: Mit der Shared-Erweiterung stehen beide IDs in
`UPGRADE_IDS`, `applyUpgrade` prüft nur `UPGRADE_IDS.includes(...)` – ohne Sperre
hätte **jeder Spieler auch ohne Flag** Punkte in zwei wirkungslose Slots
versenken können. Der Test „sperrt ohne Flag alles" hat das beim ersten Lauf
gefangen. Die Sperre hängt jetzt immer; bei leerer Liste lehnt sie schlicht alles
ab.

### Kosten

Zwei Klemmungen und eine Multiplikation je Spieler einer aktiven Familie und
Tick. Ich habe es **nicht** separat gemessen, weil es unter der Rauschgrenze
liegt: Drei Läufe je Konfiguration über 3 Simulationsminuten mit 12 Bots
(`.probe/family-bots.mjs`) ergeben mit Flag 0,816–0,965 ms/Tick, ohne Flag
0,870–1,011 ms/Tick. Die Bereiche überlappen vollständig; ein Lauf je
Konfiguration hätte hier jedes beliebige Vorzeichen „gezeigt".

Dieselbe Probe zeigt qualitativ, dass die Bot-Pfade greifen: Rapid-Bots stehen
nach fünf Minuten mit `signaturePower 8` da, ein Deadeye auf Level 45 (Precision,
gesperrt) mit null Familienpunkten und voll ausgebauten Basiswerten. Nichts hängt.

---

## Der Report-Block – zwei Befunde, die ich nicht weggedreht habe

`npm run balance`, Block `FAMILIEN-UPGRADES — DOMINANZPRUEFUNG`. Kennzahl wie im
Konzept: Grenzwert des n-ten Punktes in der Währung der Familie, geteilt durch
denselben Grenzwert beim besten Basis-Upgrade. Die Basiswerte kommen aus
`tunedStatsFor`, nicht aus abgeschriebenen Zahlen.

```
FAMILIE    SLOT             AUSGABE                        P1     P4     P8   BASIS        URTEIL
RAPID      signaturePower   Feuerrate @100 Momentum       0.73x  0.82x  1.00x  reload       OK
RAPID      signatureRate    Feuerrate, 5-s-Gefecht ab 0   0.13x  0.09x  0.05x  reload       TOT
IMPACT     signaturePower   Kontaktschaden vor Deckel     1.27x  1.19x  1.14x  bodyDamage   DOMINANT
IMPACT     signatureRate    Geladene Stoesse je Minute    0.90x  0.92x  0.94x  bodyDamage   OK
```

**`RAPID signaturePower` liegt bei 0,73–1,00** statt der im Konzept gerechneten
0,79–1,02. Der Unterschied ist die Vergleichsbasis: Ich rechne gegen den echten
`reload`-Grenzwert aus `tunedStatsFor` (0,95 je Punkt, konstant +5,26 %). Beide
Zahlen liegen im Fenster, die Aussage bleibt.

**`IMPACT signaturePower` steht bei 1,27× auf dem ersten Punkt – nominell
dominant.** Das gilt **vor** dem Anteilsdeckel. Der Deckel nimmt den Überschuss
in genau den Duellen wieder weg, in denen er zählt: Gegen den dünnsten Gegner
derselben Freischaltstufe laufen fünf von sieben Impact-Klassen hinein. Die Zeit
bis zum Tod bleibt auf jeder Stufe im erlaubten Viertel – das ist getestet, nicht
gehofft. Ich halte den Wert deshalb für vertretbar; die Zahl gehört trotzdem
sichtbar in den Report, weil sie gegen dicke Ziele real ist.

**`RAPID signatureRate` ist in DPS gerechnet tot, und die Schraube hilft nicht.**
Das ist der Befund, an dem ich am längsten gerechnet habe:

- Ein schnellerer Aufbau hebt die Decke nicht, er kommt nur früher dort an. Bei
  einem Deckenbonus von höchstens 35 % ist der Hebel strukturell klein.
- **Am Wert drehen hilft nicht:** Um mit `buildPerPoint` in das OK-Fenster zu
  kommen, bräuchte es rund 0,35 je Punkt – volle Ladung in 0,88 s. Das ist keine
  Justierung mehr, das ist ein anderer Slot.
- **Die naheliegende Alternative habe ich durchgerechnet und verworfen:**
  `signatureRate` zusätzlich die Abbauraten senken zu lassen (−6 % je Punkt, bei
  8 Punkten also 31/s statt 50/s). In einem Stop-and-Go-Gefecht (4 s Feuern,
  1 s Stand) hebt das das mittlere Momentum von 86,7 auf 93,7 – und die
  Feuerrate um **1,9 % für acht Punkte**. Verhältnis rund 0,05. Auch tot.

Die Ursache ist nicht die Zahl, sondern die Währung: `signatureRate` zahlt in
Reaktionszeit nach Respawn und Deckung, nicht in Dauerfeuer. Bei IMPACT ist das
anders – dort wird die Ladung bei jedem Aufprall verbraucht, die Aufbaurate
bestimmt also direkt, **wie oft** ein Stoß mit voller Wucht landet, und der Slot
landet sauber bei 0,90–0,94.

Ich habe deshalb **nichts** an den Zahlen geändert: Der Auftrag sagt „nach deinen
Zahlen", und eine Design-Entscheidung dieser Größe gehört nicht in einen
Implementierungs-Commit. Die Optionen für 01 stehen unten.

---

## Von 01 gebraucht

### 1. Betriebswarnung: Flag erst nach 03 einschalten

**`FAMILY_UPGRADES_ENABLED=true` ohne die Client-Änderung von 03 ist ein
Rückschritt für jeden Rapid- und Impact-Spieler.** Variante B senkt die Signature
auf den Sockel, und `Digit0` bildet heute auf Index −1 ab: `signaturePower` ist
über die Tastatur **nicht erreichbar**. Der Spieler verliert also die Stärke und
kann sie nicht zurückkaufen. Ohne Flag ändert sich nichts – die beiden Schalter
gehören zusammen umgelegt.

### 2. Entscheidung: Precision und Control – gesperrt oder kaufbar?

Der Auftrag sagt „Precision und Control bekommen ihre IDs schon jetzt,
wirkungslos bis ihre Signatures stehen". Die IDs sind da. **Kaufbar sind die
Slots bei mir trotzdem nicht** – ein Slot ohne laufende Signature ist ein
Punktegrab: Der Spieler zahlt, und nichts passiert.

Das ist bei mir Konfiguration, kein Code: `tuneFamilyUpgrades` bekommt die Liste
der Familien mit **laufender** Signature. Wenn du es anders willst, ist es eine
Zeile in `apps/server/src/index.ts`:

```ts
const FAMILY_UPGRADE_BRANCHES: SignatureFamily[] = FAMILY_UPGRADES_ENABLED
  ? ['rapid', 'impact', 'precision', 'control']   // statt der Flag-Prüfung
  : [];
```

Sobald KL5 die Precision-Signature bringt, wird daraus ohnehin ein Eintrag mehr.
`/health` meldet unter `features.familyUpgradeBranches`, was gerade offen ist.

### 3. Entscheidung: Was wird aus `RAPID signatureRate`?

Drei Wege, ich empfehle den ersten:

1. **So lassen und die Kennzahl ehrlich lassen.** Der Slot ist ein
   Reaktionszeit-Slot. Dann sollte der Report ihn als „nicht in DPS messbar"
   führen statt als TOT – das kann ich in einem Folgepaket nachziehen.
2. **Zweite, DPS-sichtbare Wirkung geben** (z. B. Momentum bleibt bei Treffern
   erhalten). Das ist neue Mechanik, kein Tuning – gehört in ein eigenes Paket.
3. **RAPID beide Punkte auf `signaturePower` geben** und den Rate-Slot bei Rapid
   sperren. Sauber messbar, kostet aber die Symmetrie der vier Familien.

Nichts davon ist dringend: Ohne Flag wirkt keiner der beiden Slots.

### 4. Für 03 (unverändert aus Paket 12, plus eine Bitte)

- `input.ts`: `Digit0` auf Index 9 abbilden (heute `-1`).
- Familienabhängige Beschriftungen der zwei Knöpfe, abgeleitet aus
  `playerClass` – dieselbe Ableitung wie beim Signature-Balken.
- Ohne Familie (und ohne laufende Signature der Familie) beide Knöpfe gesperrt
  darstellen. Der Server lehnt sie ohnehin ab; die UI soll es nur nicht anbieten.
- **Bitte:** In `apps/client/src/ui.ts` stehen zwei Platzhalter-Beschriftungen
  von mir (siehe Abweichung 1). Die gehören ersetzt, nicht ergänzt.

---

## Abweichungen vom Auftrag

1. **Ich habe zwei Zeilen in `apps/client/src/ui.ts` angefasst** – mein Revier
   ist das nicht. `upgradeLabels` ist als `Record<UpgradeId, string>` typisiert
   und wird durch die Shared-Erweiterung unvollständig; ohne die zwei Zeilen ist
   `npm run check` rot, und rot pushe ich nicht. Es sind zwei neutrale
   Platzhalter mit Kommentar, dass 03s Fassung sie ersetzt. Bei einem Konflikt
   gewinnt 03 ohne Rückfrage.

2. **Precision und Control sind gesperrt, nicht kaufbar** – Begründung und
   Ein-Zeilen-Umschaltung oben unter „Von 01 gebraucht" Punkt 2.

3. **Die Sperre hängt auch ohne Flag** (bei leerer Familienliste). Ohne das wären
   die Slots ohne Flag kaufbar gewesen – das war ein echter Fehler in meiner
   ersten Fassung, gefunden vom Test.

4. **Der heutige Impact-Festwert wird bei 6 Punkten erreicht, nicht bei 5.**
   0,50 + 5 × 0,19 = 1,45 < 1,50. Das Konzept hatte 5,26 auf 5 gerundet. Die
   Zahlen selbst sind unverändert übernommen; nur die Tabellenzeile im Konzept
   stimmte nicht.

5. **`SIGNATURE_RAPID_ENABLED` und `SIGNATURE_IMPACT_ENABLED` fehlten in
   `.env.example` und `docs/DEPLOYMENT.md`.** Beide sind in den Paketen 10 und 11
   nie eingetragen worden. Ich habe sie zusammen mit `FAMILY_UPGRADES_ENABLED`
   nachgetragen – Regel 3 gilt auch rückwirkend, und ein Schalter, der in keiner
   Doku steht, wird beim Deploy vergessen.

6. **Der Dämpfer-A/B-Lauf ist nicht nötig.** Die Antwort aus der Lastprobe („kein
   Kapazitätsproblem") reicht mir; ein temporäres Flag am Dämpfer wäre Aufwand
   bei 04 für eine Zahl, die keine Entscheidung ändert.

---

## Geänderte Dateien

| Datei | Was |
|---|---|
| `packages/shared/src/index.ts` | zwei IDs an `UPGRADE_IDS`, `UpgradeLevels`, `EMPTY_UPGRADES` (freigegeben) |
| `apps/server/src/family-upgrades.ts` | **neu** – Zahlen, Umrechnungen, Familiensperre, Bot-Pfade |
| `apps/server/src/family-upgrades.test.ts` | **neu** – 18 Tests |
| `apps/server/src/signature-rapid.ts` | Nachladeabschlag und Aufbaurate je Spieler (nur mit Flag) |
| `apps/server/src/signature-impact.ts` | Wucht-Skalierung und Aufbaurate je Spieler (nur mit Flag) |
| `apps/server/src/signature-impact.test.ts` | Deckeltest über alle acht Stufen |
| `apps/server/src/game.ts` | Abbruch bei Ablehnung in `spendBotPoints` |
| `apps/server/src/arena-events.ts` | `GUARDIAN_UPGRADES` um die zwei Schlüssel ergänzt |
| `apps/server/src/index.ts` | Flag, Familienliste, Schicht eingehängt, `/health` |
| `apps/client/src/ui.ts` | zwei Platzhalter-Beschriftungen (Abweichung 1) |
| `scripts/balance-report.mjs` | Block `FAMILIEN-UPGRADES — DOMINANZPRUEFUNG` |
| `.env.example`, `docs/DEPLOYMENT.md` | drei Schalter dokumentiert |

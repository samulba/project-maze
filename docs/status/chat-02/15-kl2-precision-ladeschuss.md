# 15 – KL2 Precision: Ladeschuss

**Branch:** `claude/chat-02-server-gameplay-w1i4o8` (neu von `origin/main`, nachdem Paket 14 gemerged war)
**Basis:** `origin/main` @ `c9aeb2b` · **Flag:** `SIGNATURE_PRECISION_ENABLED`, Default aus
**Auftrag:** `docs/status/chat-01/auftrag-chat-02.md` (4. Fassung)

Gebaut, aber **nicht so, wie der Masterplan es beschreibt** – und der Grund ist
eine einzelne Zahl, die schon heute im Code steht. Sie steht ganz oben, weil sie
den ganzen Entwurf bestimmt.

---

## Die Zahl, die alles entscheidet

Ein voll auf Schaden ausgebauter **Lancer** trägt **127,9 Schaden je Schuss**.
Der dünnste, voll auf Leben ausgebaute Gegner derselben Freischaltstufe hat
**148 Leben**. Das sind **86 %** – aus voller Entfernung, mit einem Schuss.

| Klasse | Schaden (8 Pkt) | dünnstes Ziel | HP | Anteil | Ladefaktor bis zum Ein-Schuss-Tod |
|---|---|---|---|---|---|
| **Lancer** | 127,9 | Lancer | 148 | **86 %** | **1,16×** |
| Railgun | 93,6 | Railgun | 158 | 59 % | 1,69× |
| Phantom | 78,0 | Lancer | 148 | 53 % | 1,90× |
| Sniper | 59,3 | Sniper | 162 | 37 % | 2,73× |
| Deadeye | 53,0 | Lancer | 148 | 36 % | 2,79× |
| Hunter | 49,9 | Railgun | 158 | 32 % | 3,17× |
| Arbalest | 40,6 | Railgun | 158 | 26 % | 3,90× |

**Jeder Ladefaktor über 1,16× erzeugt einen Ein-Schuss-Tod.** Die engste Klasse
bestimmt die Grenze, und Precision hat praktisch keinen Kopfraum.

### Damit sind drei Anforderungen nicht gleichzeitig erfüllbar

1. **Burst-Sicherheit:** Ladefaktor ≤ 1,16
2. **DPS-Neutralität:** Wer die Kadenz um Faktor F verlängert, muss Faktor F
   Schaden zurückbekommen – sonst ist der Ladeschuss ein Nerf
3. **Ein lebender `signatureRate`-Slot (KL4):** Damit acht Punkte à 9 % noch
   wirken, muss die Ladezeit mindestens 1,72 Nachladezeiten betragen

(1) und (2) zusammen zwingen F ≈ 1,16 – dann ist der Rate-Slot **ab dem zweiten
Punkt wirkungslos**, weil die Kadenz in den Nachlade-Boden läuft. (2) und (3)
zusammen zwingen einen Ladefaktor von 1,72 – das wären 220 Schaden für einen
Lancer und ein Ein-Schuss-Tod gegen jeden Gegner seiner Stufe.

**Zwei von dreien gehen. Alle drei nicht.**

---

## Die Auflösung: die Ladung kauft nicht mehr Schaden, sondern einen anderen Schuss

| Ladung | Kadenz | Schaden | Größe | DPS gegenüber heute |
|---|---|---|---|---|
| 0 % (Sofortklick) | Nachladezeit | **0,45×** | 1,0× | 45 % |
| **58 %** | Nachladezeit | **1,00×** | 1,23× | **100 %** |
| 100 % | 1,72 × Nachladezeit | 1,00× | **1,40×** | 58 % |

Der Schaden läuft vom Klick-Sockel (0,45×) auf **genau den heutigen Wert** und
keinen Deut darüber – quadratisch, damit halbgares Antippen nichts einbringt.
Er erreicht 1,0 bei 58 % Ladung, und das ist kein gewählter Wert, sondern
`1 / 1,72`: **genau der Punkt, an dem die Ladezeit der Nachladezeit entspricht.**
Bis dahin kostet Laden keine Kadenz.

Was der volle Ausschlag darüber hinaus kauft: **Größe ×1,4 und Durchschlag
×1,5.** Ein dickerer Schuss trifft leichter, ein durchschlagsstärkerer geht
durch Formen und mehrere Ziele. Bezahlt wird das mit Kadenz.

**Das Ergebnis für den Spieler:** Klick-Spam kostet 55 % Schaden. Die
DPS-optimale Spielweise ist die halbe Ladung. Der volle Ausschlag ist der
Schuss durch die Lücke, nicht der Schuss für die Statistik.

### Was das gegenüber dem Masterplan nicht leistet

Der Masterplan sagt „voll aufgeladen ist der starke Schuss". Bei mir ist voll
aufgeladen der **dickere** Schuss, nicht der stärkere – der DPS-Höhepunkt liegt
bei 58 %. Das ist eine bewusste Abweichung, und der einzige Hebel dagegen wäre
**Lancers Grundschaden**. Bei 100 statt 128 Schaden läge die Ein-Schuss-Grenze
bei 1,48× und ein echter Ladebonus wäre möglich. Das ist eine Balance-
Entscheidung über eine Klasse, die Sam gerade live beurteilt – die treffe ich
nicht nebenbei in einem Signature-Paket.

---

## Antworten auf die drei Punkte des Auftrags

### 1. Ladung und Projektiltempo 2.0 – die Ladung geht **nicht** aufs Tempo

Deine Vermutung stimmt: Ladung wirkt auf Schaden und Größe, nicht auf Tempo.
Die Begründung in Zahlen aus Paket 14: Precision war die einzige Familie, deren
Kugeln **überhaupt nicht ausweichbar** waren (Ausweich-Index 0,00–0,15 auf
450 px). Der Deckel bringt sie auf 1,47–1,88. Ein Ladeschuss, der über den
Deckel hinausschießt, wäre exakt die Kugel, über die Sam sich beschwert hat –
und ausgerechnet die stärkste im Spiel.

Die **Größe** übernimmt die Rolle des sichtbaren „stärkeren Schusses". Sie
kostet Ausweichbarkeit, aber viel weniger als Tempo: Bei ×1,4 wächst die
Trefferbreite eines Lancers von 32 auf 36 px, der Ausweich-Index fällt von 1,47
auf 1,31 – **über 1,0, die Kugel bleibt ausweichbar.** Ein Tempobonus derselben
gefühlten Stärke hätte den Index unter 1,0 gedrückt.

### 2. Die beiden KL4-Bezeichnungen für Precision

| Slot | Bezeichnung für 03 | Wirkung |
|---|---|---|
| `signatureRate` | **Ladetempo** | verkürzt die Ladezeit, −9 % je Punkt |
| `signaturePower` | **Ladewucht** | Größe und Durchschlag bei voller Ladung |

Der Masterplan schlug „Ladebonus" vor. Ich empfehle **Ladewucht**, weil der Slot
ausdrücklich **nicht** den Schaden anhebt – „Ladebonus" würde genau das
versprechen. Beide sind schon verdrahtet: `chargeConfigFor` in
`family-upgrades.ts`, und `precision` steht in `FAMILY_UPGRADE_BRANCHES`, sobald
`SIGNATURE_PRECISION_ENABLED` an ist. Damit ist auch die offene Frage aus Paket
13 für Precision beantwortet: Der Slot ist kein Punktegrab mehr, sobald die
Signature läuft.

`chargeReloadFactor` ist mit **1,72** kein runder Wert, sondern das KL4-Raster:
`1 + 0,09 × 8`. Acht Punkte Ladetempo drücken die Ladezeit auf genau eine
Nachladezeit – der Slot wirkt über alle acht Stufen und stirbt in keiner. Ein
Test hält das fest.

### 3. Bots laden – ohne eine einzige Zeile in der Bot-Steuerung

Die Bot-Steuerung hält `primary` durchgehend, solange ein Ziel in Reichweite
ist. Zusammen mit der **Selbstauslösung bei voller Ladung** schießen Bots damit
automatisch mit vollem Ausschlag. Ein Test belegt das gegen die echte
Aufrufreihenfolge: Die Bot-Steuerung setzt `primary` **innerhalb** des
Spielerschritts, nicht davor – deshalb verbiegt die Schicht die Eingabe nicht,
sondern fängt den Schuss ab und nimmt den Cooldown zurück.

Dieselbe Selbstauslösung löst nebenbei ein Problem, das sonst live aufgeschlagen
wäre: **Der Client hat einen Dauerfeuer-Schalter.** Ohne Selbstauslösung hielte
er die Taste ewig, die Ladung stünde bei 100 – und der Spieler schösse nie.

---

## Netzverhalten – die Machbarkeitsfrage, die du gestellt hast

„Halten und Loslassen" über das Netz funktioniert hier **besser als es sich
liest**, und zwar wegen einer Eigenschaft, die schon da ist: Die Eingabe wird
als **Zustand** übertragen (`primary: boolean` in jeder Input-Nachricht), nicht
als Flanke. Ein verlorenes Paket löscht damit keinen Schuss, es verzögert ihn um
ein Eingabeintervall (~33 ms). Zwei Ergänzungen sichern den Rest ab:

- **Losgelassen während der Nachladezeit geht nicht verloren.** Die Anweisung
  bleibt stehen und feuert, sobald der Cooldown steht. Ohne das wäre schnelles
  Klicken direkt nach einem Schuss ein stiller Fehlschlag.
- **Volle Ladung löst selbst aus.** Auch bei totaler Verbindungsstille kommt der
  Schuss.

Ein Test deckt beides ab.

---

## Tests und Proben

**15 neu / 654 gesamt, alle grün** (`npm run check`).

| Mutation | Ergebnis |
|---|---|
| Schadensdeckel bei 1,0 entfernt | 4 Tests rot, darunter „erzeugt in keiner Klasse einen neuen Ein-Schuss-Tod" |
| Selbstauslösung bei voller Ladung entfernt | 2 Tests rot (Dauerfeuer und Bots) |
| Zurückgehaltener Schuss setzt trotzdem den Cooldown | 5 Tests rot |

Der Ein-Schuss-Test läuft über **alle sieben Precision-Klassen** und alle
Ladestufen gegen den echten Statikpfad – nicht gegen abgeschriebene Zahlen.

---

## Von 01 gebraucht

1. **Entscheidung: Bleibt der volle Ausschlag der „andere" Schuss, oder soll
   Lancers Grundschaden fallen?** Nur Letzteres macht den Masterplan-Ladeschuss
   („voll aufgeladen ist der starke Schuss") möglich. Bei 100 statt 128 Schaden
   läge die Grenze bei 1,48×. Ich habe es nicht getan – das ist eine
   Balance-Entscheidung an einer Klasse, die Sam gerade beurteilt.
2. **Bezeichnungen für 03: „Ladetempo" und „Ladewucht"** (nicht „Ladebonus" –
   der Slot hebt bewusst nicht den Schaden).
3. **Precision ist ab sofort für die KL4-Slots freigegeben**, sobald beide Flags
   an sind. Die offene Frage aus Paket 13 ist damit für Precision erledigt; für
   Control bleibt sie offen.
4. **Doppelte Doku-Einträge aufgeräumt.** Beim Merge von Paket 13 sind
   `SIGNATURE_RAPID_ENABLED` und `SIGNATURE_IMPACT_ENABLED` in `.env.example`
   **und** `docs/DEPLOYMENT.md` doppelt gelandet – einmal dein Block, einmal
   meiner. Ich habe je einen Eintrag behalten und den ausführlicheren Inhalt in
   die verbleibende Zeile gezogen.

## Abweichungen vom Auftrag

1. **Die Ladung hebt den Schaden nicht über den heutigen Wert** – der Masterplan
   sieht steigenden Schaden vor. Grund: die Ein-Schuss-Grenze von 1,16× bei
   Lancer. Ganze Begründung oben.
2. **Kein Tempobonus durch die Ladung**, obwohl der Masterplan ihn nennt. Er
   würde den Deckel aus Paket 14 aushebeln – und zwar für die stärkste Kugel im
   Spiel.
3. **`signaturePower` heißt bei Precision „Ladewucht", nicht „Ladebonus"**, und
   skaliert Größe und Durchschlag statt Schaden.
4. **Der DPS-Höhepunkt liegt bei 58 % Ladung, nicht bei 100 %.** Das ist die
   direkte Folge von (1) und die einzige Stelle, an der sich der Entwurf vom
   Spielgefühl des Masterplans entfernt.

## Geänderte Dateien

| Datei | Was |
|---|---|
| `apps/server/src/signature-precision.ts` | **neu** – Ladeschuss, Ladekurve, Selbstauslösung |
| `apps/server/src/signature-precision.test.ts` | **neu** – 15 Tests |
| `apps/server/src/family-upgrades.ts` | `chargeConfigFor` + Precision-Skalierung |
| `apps/server/src/index.ts` | Flag, Schicht in der Kette, `precision` in den Familien, `/health` |
| `scripts/balance-report.mjs` | Block `PRECISION — SIGNATURE LADESCHUSS` |
| `.env.example`, `docs/DEPLOYMENT.md` | neuer Schalter, Doppel-Einträge aufgeräumt |

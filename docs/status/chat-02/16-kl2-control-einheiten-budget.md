# 16 – KL2 Control: Einheiten-Budget

**Branch:** `claude/chat-02-server-gameplay-w1i4o8` (neu von `origin/main`, nachdem Paket 15 gemerged war)
**Basis:** `origin/main` @ `07155a8` · **Flag:** `SIGNATURE_CONTROL_ENABLED`, Default aus
**Auftrag:** `docs/status/chat-01/auftrag-chat-02.md` (5. Fassung)

**Geschnitten wie von dir angeboten: Budget und Drohnen jetzt, Deployables als
Vorschlag.** Damit bleibt die Wire-Form unangetastet, und die vier Familien sind
mechanisch da. Der exakte Vorschlag für die zweite Einheitenart steht unten,
fertig zum Einbauen.

---

## Die Normierung, aus der alles folgt

**Volles Budget = eine komplette Flotte.** Beide Zahlen kommen aus den Werten
der Klasse, nicht aus einer zweiten Quelle:

- eine Einheit kostet `100 / droneCount`
- der Nachschub beträgt `100 / (droneCount × droneRespawn)` je Sekunde

| Klasse | Drohnen | Flotte neu (heute) | Kosten je Einheit | Nachschub |
|---|---|---|---|---|
| Hive | 10 | 5,5 s | 10,0 | 18,2/s |
| Drone | 4 | 5,8 s | 25,0 | 17,2/s |
| Guardian | 5 | 6,5 s | 20,0 | 15,4/s |
| Warden | 6 | 6,7 s | 16,7 | 14,9/s |
| Factory | 5 | 7,0 s | 20,0 | 14,3/s |
| Overseer | 8 | 7,0 s | 12,5 | 14,3/s |
| Carrier | 6 | 9,0 s | 16,7 | 11,1/s |

**Im Mittel ändert sich damit nichts.** Ein Test rechnet das für jede Klasse
nach: `Kosten / Nachschub` ergibt exakt `droneRespawn`. Was sich ändert, ist die
**Verteilung**:

| Situation | heute | mit Budget |
|---|---|---|
| Flotte ausgelöscht, vorher lange nichts verloren | Wiederaufbau dauert 5,5–9,0 s | **sofort komplett** |
| zweite Auslöschung kurz danach | genauso schnell wie beim ersten Mal | **kein Nachschub, Rückzug nötig** |
| Dauerbeschuss, stetige Verluste | gleichbleibendes Tempo | gleichbleibendes Tempo |

Das ist die Management-Handlung, die die Familie ausmacht: Ein Controller
**bankt** Nachschub, solange er nichts verliert, und zahlt für Verschleiß.
Ein Zeitgeber kann das nicht, weil er nicht weiß, was vorher passiert ist.

Die Startflotte bleibt geschenkt: Sie kommt über `spawnInitialDrones`
(Klassenwahl und Respawn), nicht über den Nachschub. Wer neu in die Familie
kommt, startet mit vollem Konto.

### Die KL4-Slots, wie im Konzept versprochen

| Slot | Bezeichnung für 03 | Wirkung |
|---|---|---|
| `signatureRate` | **Nachschub** | +9 % Nachfüllrate je Punkt |
| `signaturePower` | **Einheitenstärke** | bis +45 % Leben je Einheit |

`signatureRate` hebt **ausschließlich das Nachschub-Tempo, nie die Zahl der
Einheiten** – das war die Auflage aus meinem eigenen KL4-Konzept, weil sonst die
Serverlast mit dem Build skalieren würde. Ein Test hält fest, dass die
Flottenstärke bei 0 und bei 8 Punkten identisch ist und nur das Konto besser
dasteht.

Damit sind **alle vier Familien** an die KL4-Slots angeschlossen. Die offene
Frage aus Paket 13 („Precision und Control gesperrt oder kaufbar?") ist damit
gegenstandslos: Beide sind jetzt gebaut und öffnen sich automatisch, sobald ihr
Signature-Flag an ist.

---

## Deployables: der exakte Vorschlag (nicht gebaut)

### Was ich serverlokal überbrückt habe

**Nichts.** Ich habe keine Wire-Änderung mit Cast nachgebaut – das Budget
funktioniert vollständig mit der bestehenden Einheitenart. Der Vorschlag unten
ist Papier, kein halb gebauter Zustand.

### Shared: eine neue Entität

```ts
// packages/shared/src/index.ts
export const DEPLOYABLE_KINDS = ['turret', 'slowfield'] as const;
export type DeployableKind = (typeof DEPLOYABLE_KINDS)[number];

export interface DeployableSnapshot {
  id: string;
  ownerId: string;
  kind: DeployableKind;
  position: Vector2;
  /** Wirkradius – der Client zeichnet ihn, die Kollision benutzt ihn. */
  radius: number;
  health: number;
  maxHealth: number;
  /** Verbleibende Standzeit in Sekunden, gerundet auf eine Stelle. */
  life: number;
}

export interface WorldSnapshot {
  // … bestehende Felder unverändert …
  deployables: DeployableSnapshot[];
}
```

**Warum eine Liste und kein Feld an `PlayerSnapshot`:** Deployables überleben
ihren Besitzer nicht zwingend, stehen ortsfest und müssen auch dann sichtbar
sein, wenn der Besitzer außer Sicht ist. Dieselbe Begründung, aus der Drohnen
eine eigene Liste haben.

**Warum `kind` und nicht zwei Listen:** Der Mini-Turm und das
Verlangsamungsfeld unterscheiden sich in der Wirkung, nicht in der Form. Eine
Liste mit `kind` ist das Muster, das `ShapeSnapshot` mit `kind` schon benutzt.

### Verhalten unter `SNAPSHOT_DELTAS`

`deployables` gehört **nicht** in den Statik-Strip. Position und `life` ändern
sich zwar selten (der Turm steht still), aber `health` ändert sich im Gefecht
jeden Tick, und `life` läuft ohnehin herunter. Ein Delta-Eintrag lohnt sich
erst, wenn viele Deployables gleichzeitig stehen – dann aber als
**Feld-Delta innerhalb der Liste**, analog zu `players.upgrades`, nicht als
Ganzes. Konkret: In `snapshot-encoding.ts` reicht zunächst der Eintrag in der
Rundungsliste (Position auf ganze Pixel, `life` auf eine Nachkommastelle); die
Delta-Behandlung würde ich erst nachziehen, wenn eine Messung sie rechtfertigt.

### Was 03 zum Zeichnen braucht

Alles, was in `DeployableSnapshot` steht, und nichts darüber hinaus:

| Feld | wofür |
|---|---|
| `position`, `radius` | Wo steht er, wie weit reicht er (Feldwirkung als Ring) |
| `kind` | welches Symbol |
| `ownerId` | Eigen- oder Feindfarbe (Vergleich mit `snapshot.selfId`, **nicht** mit der `welcome`-ID) |
| `health` / `maxHealth` | kleiner Balken, wie bei Drohnen |
| `life` | Restzeit, z. B. als schrumpfender Ring – ohne sie wirkt das Verschwinden willkürlich |

### Kosten, gemessen

Gemessen an einer Drohne, weil ein Deployable dieselbe Snapshot-Form hätte
(`.probe/deployable-cost.mjs`, Overseer mit 8 Drohnen):

| | |
|---|---|
| Snapshot-Anteil je Einheit | **287 Bytes** (ungerundet, ohne `SNAPSHOT_DELTAS`) |
| bei 30 Snapshots/s und 40 Clients, alle in Sicht | **337 KB/s je Einheit** |

Das ist die relevante Zahl, und sie bestätigt 04s Befund: Der Flaschenhals ist
der Snapshot-Versand. **Zwei Deployables je Controller bei acht Controllern
wären 16 Einheiten – rund 4,6 KB je Snapshot und Client, gut die Hälfte des
heutigen Snapshots.** Das ist kein Argument gegen Deployables, aber eines für
eine harte Obergrenze: Ich würde die Zahl gleichzeitig stehender Deployables je
Spieler auf **zwei** begrenzen und das Budget so ansetzen, dass mehr ohnehin
nicht bezahlbar ist. Die Kollisionskosten sind daneben zu vernachlässigen –
ortsfeste Kreise sind der billigste Fall im Spatial-Hash.

### Wie das Budget die zweite Einheitenart aufnimmt

Nur ein weiterer Kostensatz. `unitCost` ist heute `100 / droneCount`; ein
Deployable bekäme einen eigenen, höheren Satz (Vorschlag: 40 – zwei Türme und
eine Rest-Flotte passen nicht zusammen, und genau das ist die Umschichtung).
Die Schicht braucht dafür keine neue Struktur, nur eine Fallunterscheidung
beim Bezahlen.

**Was noch fehlt und nicht in diesem Paket steckt:** die Eingabe. „Turm hier
aufstellen" braucht eine neue Client-Nachricht (`deploy` mit Position und
`kind`), und die gehört mit derselben Sorgfalt entworfen wie die Wire-Form –
inklusive Rate-Limit und Positionsprüfung (frei, in Reichweite, nicht in einer
Wand). Das ist ein eigenes Paket.

---

## Tests und Proben

**14 neu / 668 gesamt, alle grün** (`npm run check`).

| Mutation | Ergebnis |
|---|---|
| Budget wird beim Nachschub nicht geprüft | 1 Test rot („zweiter Verlust in Folge") |
| Nachschubrate nicht auf die Flottengröße normiert | 2 Tests rot |

Ein Test belegt, dass ohne Flag weiter der Zeitgeber ersetzt – inklusive der
vollen `droneRespawn`-Wartezeit je Einheit und ohne `signature` im Snapshot.

**Zwei Fehler beim Testen, beide festgehalten:**

1. Die erste Fassung hat die Klasse direkt gesetzt statt über
   `spawnInitialDrones` – dann entsteht die Startflotte über den Nachschub und
   bezahlt sich selbst, was im echten Spiel nie passiert (dort kommt sie über
   `chooseClass`). Der Test hätte ein Verhalten festgeschrieben, das es nicht
   gibt.
2. **Ein Lauf war flaky, drei danach nicht.** Ursache war die wiederkehrende
   Falle aus der Übergabe: Ich hatte die Formen einmal beim Aufbau geräumt, aber
   sie **wachsen während des Laufs nach** – und eine Form neben der Flotte
   zerlegt Drohnen, womit die Zählung kippt. Der Helfer räumt jetzt **jeden
   Tick**. Danach fünf Läufe der Datei und drei vollständige `npm run check`
   hintereinander grün. Einen einzelnen grünen Lauf hätte ich nach dem Ausfall
   nicht als Beleg genommen.

**Bots:** Sie brauchen keine eigene Regel – das Budget hängt am Nachschub, nicht
an der Eingabe, und Bots verlieren und ersetzen Einheiten über denselben Pfad.
Ein Test belegt das gegen einen Bot-Zustand.

---

## Von 01 gebraucht

1. **Shared-Änderung für Deployables** – exakter Vorschlag oben. Wie bei KL4:
   Wenn du sie freigibst, baue ich sie selbst; sonst baust du sie ein.
2. **Entscheidung zur Obergrenze:** Ich schlage **zwei Deployables je Spieler**
   vor, hart begrenzt. Bei 337 KB/s je Einheit und 40 Clients ist das keine
   Feinheit, sondern die Differenz zwischen „passt" und „Snapshot verdoppelt".
3. **Für 03: die beiden Control-Bezeichnungen** heißen **Nachschub**
   (`signatureRate`) und **Einheitenstärke** (`signaturePower`).
4. **Die Eingabe für Deployables ist ein eigenes Paket** – neue Client-Nachricht
   plus Positionsprüfung und Rate-Limit. Nicht nebenbei.

## Abweichungen vom Auftrag

1. **Deployables sind nicht gebaut** – der von dir angebotene Schnitt. Das
   Umschichten zwischen zwei Einheitenarten, im Masterplan die Kernhandlung,
   fehlt damit noch. Was das Budget heute leistet, ist die Ökonomie darunter:
   banken und für Verschleiß bezahlen.
2. **Der Nachschub ist im Mittel tempo-neutral**, nicht schwächer. Anders als
   bei Rapid und Impact (Variante B) zahlt Control seine Signature nicht mit
   einer Absenkung – es gibt keinen Festwert, der in die Punkte wandern könnte,
   weil die Signature den Zeitgeber *ersetzt*. Wer das für zu freundlich hält,
   dreht an `refillFactor`: 0,85 macht den Nachschub um 15 % langsamer als heute.

## Geänderte Dateien

| Datei | Was |
|---|---|
| `apps/server/src/signature-control.ts` | **neu** – Budget, Nachschub, Einheitenstärke |
| `apps/server/src/signature-control.test.ts` | **neu** – 14 Tests |
| `apps/server/src/index.ts` | Flag, Schicht außerhalb von `tuneDrones`, `control` in den Familien, `/health` |
| `.env.example`, `docs/DEPLOYMENT.md` | neuer Schalter |

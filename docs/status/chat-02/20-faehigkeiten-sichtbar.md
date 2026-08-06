# 20 – Fähigkeiten sichtbar machen: die Protokollseite

**Branch:** `claude/chat-02-server-gameplay-w1i4o8` · **Basis:** `origin/main` @ `999d66e`
**Flag:** `DASH_TRAVEL_ENABLED`, Default aus · **Auftrag:** 8. Fassung

Klein und schnell, wie verlangt. Ein Befund, der wichtiger ist als alle
fehlenden Felder, ein Server-Fix dazu, und eine kurze Liste dessen, was im
Protokoll noch fehlt.

---

## Der Befund: Der Dash **ist** ein Teleport

Sams Beschwerde aus dem MASTERPLAN – „ein Dash von Gegnern sieht aus wie ein
Teleport-Bug" – ist keine Frage der Darstellung. Der Dash ist einer:

```ts
// loadout-system.ts, activateModule – der Stand vor diesem Paket
const moved = moveCircle(player.position, { x: dir.x * 1_050, … }, 0.18, GAME.playerRadius);
player.position = moved.position;
```

Die **gesamte Strecke von 189 px wird in einem einzigen Aufruf** zurückgelegt,
im selben Tick, in dem die Taste ankommt. Die 180 ms `activeMs` des Moduls sind
danach nur noch ein Zustandsfenster – bewegt wird in ihnen nichts mehr.

Beim Client kommt damit **eine** Positionsänderung zwischen zwei Snapshots an.
Es gibt keine Bewegung zu interpolieren, keine Zwischenposition, keinen Pfad.
**03 kann daran mit Trails und Nachbildern nichts reparieren** – man kann keine
Spur an etwas zeichnen, das nie unterwegs war.

### Der Fix: dieselbe Strecke, über die Wirkdauer verteilt

`DASH_TRAVEL_ENABLED` (Default aus) lässt den Dash fahren statt springen:
1050 px/s über 180 ms – **exakt dieselben 189 px**, aber über 7 Ticks, und
damit über **fünf bis sechs Snapshots**, in denen der Tank sichtbar unterwegs
ist. Das ist die Voraussetzung, die 03 braucht.

Zwei Dinge, die dabei nebenbei richtig werden:

- **Die Fahrt endet an Wänden.** Der Sprung nahm den Endpunkt und fragte nicht
  nach dem Weg; `moveCircle` prüft ihn jetzt Tick für Tick. Ein Test hält das
  fest.
- **Die Fahrt ist unterbrechbar** – sie läuft durch die normale
  Bewegungsintegration. Das ist eine Änderung am Spielgefühl, und der Grund,
  warum das Flag aus bleibt, bis 03s Spur steht.

Vier Tests, davon einer, der den alten Sprung als solchen festhält. Ein Fehler
beim Bauen ist im Kommentar notiert: Die erste Fassung maß 360 statt 189 px,
weil der Originalschritt den Tank schon bewegt hatte und meine Fahrt vom
Ergebnis aus nochmal rechnete.

---

## Was im Snapshot steht – und was fehlt

| Fähigkeit | im Snapshot vorhanden | fehlt zum Zeichnen |
|---|---|---|
| **Dash** | `activeModule`, `moduleActiveUntil` | **Richtung** – siehe unten |
| **Repulse** | `activeModule`, `moduleActiveUntil` | **Wirkradius** (195 px, Serverliteral) |
| **Barrier** | `barrierHealth`, `barrierMaxHealth`, `moduleActiveUntil`, `angle` | **Frontwinkel** (0,28 als Skalarprodukt, Serverliteral) |
| **Repair** | `repairing` | nichts |
| Rapid / Impact / Precision / Control | `signature` 0–100 + `playerClass` | nichts |

Die vier Signatures sind vollständig lesbar: Der Balken steht im Snapshot, die
Bedeutung ergibt sich aus der Klasse. Bei den Modulen fehlen **drei Angaben**,
und zwei davon sind gar keine Snapshot-Felder.

### 1. Zwei geteilte Konstanten statt zwei Snapshot-Feldern

Radius und Frontwinkel ändern sich nie. Sie gehören nicht in jeden Snapshot,
sondern nach `shared` – wie `ACCELERATION_SCALE`, an dem wir gelernt haben, was
eine zweite Zahlenquelle anrichtet. Ich habe sie serverseitig schon aus den
Literalen herausgezogen (`REPULSE_RADIUS`, `BARRIER_FRONT_DOT` in
`loadout-system.ts`); der Umzug nach `shared` ist deine Freigabe:

```ts
// packages/shared/src/gameplay.ts
/** Wirkradius des Repulse in Weltpixeln. */
export const REPULSE_RADIUS = 195;
/**
 * Frontwinkel der Barriere als Skalarprodukt zwischen Blickrichtung und
 * Angriffsrichtung. 0,28 entspricht rund ±74°.
 */
export const BARRIER_FRONT_DOT = 0.28;
```

**Kosten: null Bytes je Snapshot.** Das ist der ganze Punkt.

### 2. Ein echtes neues Feld: die Dash-Richtung

```ts
// packages/shared/src/gameplay.ts, PlayerGameplaySnapshot
/**
 * Richtung der laufenden Dash-Fahrt als Einheitsvektor. Nur gesetzt, solange
 * `moduleActiveUntil` in der Zukunft liegt und das Modul `dash` ist.
 */
moduleDirection?: Vector2;
```

**Brauchst du es überhaupt?** Ehrliche Antwort: **nur fast.** Mit der Fahrt
oben kann der Client die Richtung aus zwei aufeinanderfolgenden Positionen
selbst bilden. Das Feld erspart ihm den ersten Frame – er kann die Spur schon
im Snapshot zeichnen, in dem die Fahrt beginnt, statt einen Snapshot später.
Bei 180 ms Fahrt ist das ein Sechstel des Effekts.

**Meine Empfehlung: bauen, aber zuletzt.** Wenn 03 nach der Fahrt sagt, die
Spur setzt sichtbar zu spät ein, ist das Feld die Antwort; wenn nicht, spart es
Bytes und eine Wire-Änderung.

**Kosten, falls doch:** zwei gerundete Zahlen, nur während 180 ms je 10 s
Abklingzeit und nur für Spieler im Sichtfeld – rund 30 Byte je Snapshot und
dashendem Spieler, also **unter 0,4 % eines Snapshots** und das auch nur im
Moment des Dashs. Unter `SNAPSHOT_DELTAS` gehört es **nicht** in den
Statik-Strip: Es ändert sich genau dann, wenn es zählt.

---

## Was serverseitig sonst noch fehlt, damit etwas lesbar sein kann

Punkt 3 des Auftrags, mein Urteil:

- **Repulse: 260 ms sind knapp, aber genug** – acht Snapshots. Kein Handlungsbedarf.
- **Dash: 180 ms sind fünf bis sechs Snapshots**, nach dem Fix. Vorher: null.
- **Barrier: 900 ms, Repair: 3 s** – reichlich.
- **Der Wucht-Verbrauch bei Impact ist unsichtbar.** Der `signature`-Balken
  fällt beim Aufprall in einem Tick von 100 auf ~0, und mehr sieht der Client
  nicht. Wenn der Rammstoß sich nach etwas anfühlen soll, braucht 03 den
  Moment – aber das ist kein fehlendes Feld, sondern ein Ableiten aus dem
  Balken-Sprung. Ich würde es 03 überlassen und erst reagieren, wenn sie sagen,
  dass es nicht reicht.

---

## Von 01 gebraucht

1. **Freigabe für die zwei geteilten Konstanten** (`REPULSE_RADIUS`,
   `BARRIER_FRONT_DOT` nach `shared/gameplay`). Null Snapshot-Kosten, und ohne
   sie schätzt 03 die Zahlen oder schreibt sie ab.
2. **`moduleDirection` erst auf Zuruf von 03** – Begründung oben.
3. **`DASH_TRAVEL_ENABLED` gehört zusammen mit 03s Spur an**, nicht davor. Was
   ihn blockiert: nichts Serverseitiges. Sobald 03 zeichnet, ist er frei.

## Nebenbei aufgeräumt – und ein eigener Fehler

`.env.example` hatte seit Paket 14 einen **Kommentarblock für
`PROJECTILE_SPEED_V2`, aber keine Variablenzeile**. Wer die Datei kopiert, hat
den Schalter nie gesehen. Das ist mein Fehler aus Paket 14, und er passt
unangenehm gut zu dem, was du über dunkel liegende Pakete geschrieben hast:
Der Schalter stand in `DEPLOYMENT.md`, aber nicht dort, wo man ihn kopiert.
Zeile ergänzt (`PROJECTILE_SPEED_V2=true`, dem Stand auf `main` entsprechend).

## Abweichungen vom Auftrag

1. **Ich habe einen Server-Fix gebaut, nicht nur berichtet.** Der Auftrag
   verlangte ein Urteil darüber, wo serverseitig etwas fehlt; beim Dash ist die
   Antwort so eindeutig und der Eingriff so klein, dass ein Bericht ohne Code
   die Sache nur verzögert hätte. Hinter Flag, Default aus.
2. **Ich schlage weniger Felder vor, als du vielleicht erwartest.** Drei
   Angaben fehlen, zwei davon sind Konstanten und kosten kein Byte. Das
   einzige echte Feld empfehle ich zurückzustellen, bis 03 sagt, dass es
   gebraucht wird.
3. **KL5 ruht**, wie angeordnet. Der eine Absatz dazu: Impact steht bei K/D
   0,21 (Paket 19), und die Ursache ist, dass Körperkontakt praktisch nie
   zustande kommt – nicht die Wucht. Das ist die einzige Balance-Änderung, die
   ich nach KL5 für dringend halte; gebaut ist nichts.

## Geänderte Dateien

| Datei | Was |
|---|---|
| `apps/server/src/loadout-system.ts` | Dash fährt statt zu springen (hinter Flag); `REPULSE_RADIUS`, `BARRIER_FRONT_DOT`, `DASH_SPEED` aus Literalen herausgezogen |
| `apps/server/src/loadout-dash.test.ts` | **neu** – 4 Tests |
| `apps/server/src/index.ts` | Flag, Durchreichung an Schicht und `activateModule`, `/health` |
| `.env.example`, `docs/DEPLOYMENT.md` | neuer Schalter, fehlende `PROJECTILE_SPEED_V2`-Zeile ergänzt |

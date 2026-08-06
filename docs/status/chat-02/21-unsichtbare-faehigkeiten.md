# 21 – Die restlichen unsichtbaren Fähigkeiten

**Branch:** `claude/chat-02-server-gameplay-w1i4o8` · **Basis:** `origin/main` @ `4b28dd2`
**Flags:** `REPULSE_TRAVEL_ENABLED` (neu, Default aus) · **Auftrag:** 9. Fassung

Drei Befunde, drei Reparaturen an der Ursache. Der erste ist ein Fehler in
meinem eigenen Paket 20 – und ausgerechnet der, der deine Entscheidung, den
Dash sofort einzuschalten, fast wirkungslos gemacht hätte.

---

## 1. Der Bot-Dash sprang weiter — mein Fehler aus Paket 20

`DASH_TRAVEL_ENABLED` steht seit deinem Merge auf an. Trotzdem hätte Sam vom
Fix **nichts** gesehen. Die Fahrt hing am vierten Parameter von
`activateModule`, und den setzte genau eine Stelle:

```ts
// index.ts – der Spieler-Pfad, mit Schalter
activateModule(game, playerId, now, DASH_TRAVEL_ENABLED);

// bot-brain.ts:430 – der Bot-Pfad, ohne. Default: springen.
if (wantsModule && activateModule(game, player.id, now)) { … }
```

Gemessen: Ein Bot legt **189,0 px in einem einzigen Aufruf** zurück, bei
eingeschaltetem Schalter. Und in der Arena sind fast alle Dashes Bot-Dashes –
zwei der fünf Bot-Stile (`hunter`, `kiter`) tragen das Modul, Menschen sind zu
acht Bots je einer. Sams Satz lautet „ein Dash **von Gegnern** sieht aus wie ein
Teleport-Bug". Genau diese Gegner sprangen weiter.

**Die Ursache ist nicht der vergessene Parameter, sondern dass es einen gab.**
Ein Schalter, den jeder Aufrufer einzeln mitgeben muss, wird irgendwann von
einem Aufrufer vergessen; das ist keine Frage der Sorgfalt. Der Schalter steht
jetzt **am Spiel** – `tuneLoadoutSystem` schreibt ihn in den Zustand, den
`activateModule` ohnehin liest, und der vierte Parameter ist ersatzlos weg. Ein
Aufrufer kann ihn nicht mehr vergessen, weil es nichts mehr zu übergeben gibt.

Ein Test hält es fest, und zwar über den Bot-Pfad, nicht über den Spieler-Pfad.

## 2. Repair verbrennt 17 Sekunden unsichtbar — und tat es immer

Der Auftrag fragt nach Zeitfenstern, die kürzer sind als ein Snapshot-Abstand.
Das hier ist keins: Es ist ein Fenster der Länge **null**.

`activateModule` startet den Reparaturzyklus, egal wie schnell der Tank fährt.
Der nächste Schritt bricht ihn ab, sobald die Geschwindigkeit über 40 px/s
liegt. Zwischen beidem liegt **kein Tick**. Gemessen, Aktivierung bei
Fluchttempo:

```
repairing = true in 0 von 20 Ticks       (Snapshot-Abstand = 1,33 Ticks)
Abklingzeit läuft noch 16 500 ms
```

Das ist der Normalfall, nicht der Sonderfall: Wer flieht und Reparatur drückt,
drückt in Fahrt. Der Client zeigt korrekt an, was er weiß – 17 Sekunden
Abklingzeit –, und es ist nichts passiert. Kein Feld fehlt; es gibt nichts
anzuzeigen.

**Der Fix ist eine Zeile an der Stelle, an der ohnehin schon geprüft wird**, ob
eine Reparatur sinnvoll ist (volle Gesundheit weist die Aktivierung schon heute
zurück): In Fahrt startet sie gar nicht erst. Das Modul bleibt bereit, statt
sich unsichtbar zu verbrauchen. `REPAIR_MOVE_LIMIT` ist jetzt **eine** Zahl für
beide Stellen – Abbruchgrenze und Startgrenze können nicht auseinanderlaufen.

Die Bot-Steuerung braucht dazu einen Halbsatz mehr: Sie aktivierte in Fahrt und
hielt erst **danach** an. Jetzt hält sie zuerst an und aktiviert 150 ms später.
Ohne diese Anpassung hätte mein Fix den Bots die Reparatur genommen — die
Prüfung hätte sie dauerhaft abgewiesen. Ein Test fährt den Bot komplett durch.

**Ohne Flag.** Es gibt keinen Fall, in dem das alte Verhalten etwas anderes tut
als eine Abklingzeit zu verbrennen; ein Schalter dafür hätte nichts zu schalten.

## 3. Der Repulse schiebt einen Tankdurchmesser weit

Derselbe Fehler wie beim Dash, nur andersherum: nicht in einem Tick zu viel,
sondern nach einem Tick nichts mehr.

```ts
target.velocity.x += direction.x * strength;   // 413 px/s auf 100 px Abstand
```

Eine Geschwindigkeit zu setzen heißt, sie der Bewegungsintegration zu
überlassen – und die zieht sie im nächsten Tick zur Eingabe zurück, mit rund
1 850 px/s². Gemessen am Getroffenen:

| nach | 100 ms | 200 ms | 400 ms | 1 000 ms |
|---|---|---|---|---|
| Weg | 30 px | 44 px | 44 px | 44 px |

**44 px sind ein Tankdurchmesser** – bei 195 px Wirkradius und 12 s
Abklingzeit. Weniger, als der Getroffene in derselben Zeit zu Fuß geht
(290 px/s × 0,2 s = 58 px). Der Stoß ist damit nicht nur schwach, er ist von
gewöhnlicher Bewegung nicht zu unterscheiden. Die Gegenprobe zeigt, dass die
Ursache die Integration ist und nicht der Stoß: **Dieselbe Pulswelle wirft eine
Drohne 340 px weit**, weil Drohnen einen viel schwächeren Regler haben.

Der Fix hat die Form des Dash-Fixes: dieselbe Stoßstärke, über die 260 ms
Wirkdauer getragen statt sofort wegintegriert. Rund **107 px** auf 100 px
Abstand, sichtbar über acht Snapshots. Drei Dinge sind mir dabei wichtig:

- **Der Getroffene behält die Kontrolle.** Anders als die Dash-Fahrt
  *überschreibt* der Stoß die eigene Bewegung nicht, er *addiert* sich. Ein
  Repulse ist ein Schub, keine Betäubung – ein Test drückt während des Stoßes
  quer und prüft, dass die Querbewegung ankommt.
- **Die Strecke endet an Wänden.** `moveCircle`, Tick für Tick.
- **Er läuft aus**, linear von 2× auf 0, statt nach 260 ms abzureißen.

**Hinter `REPULSE_TRAVEL_ENABLED`, Default aus** – und das ist bewusst anders
als beim Dash. Die Dash-Fahrt trug dieselbe Strecke nur anders aus. Hier
verdoppelt sich die Wirkung eines Moduls. Das ist eine Balance-Entscheidung,
und die triffst du, nicht ich. Die Zahlen dafür stehen oben.

---

## Was ich geprüft und **nicht** repariert habe

Der Auftrag verlangt, die Frage für alle Module und Signatures durchzugehen.
Was übrig bleibt, ist sichtbar – hier die Begründungen, damit niemand dieselbe
Runde nochmal dreht:

| Fähigkeit | Fenster | Urteil |
|---|---|---|
| Barrier | 900 ms = 27 Snapshots | `barrierHealth` sinkt sichtbar; nur der **Bruch** ist von einem Ablauf nicht zu unterscheiden (beide enden bei 0). Kein Bot trägt Barrier, also sieht Sam sie nur an sich selbst. Zurückgestellt. |
| Repulse-Puls | 260 ms = 7,8 Snapshots | Das Fenster ist lang genug; das Problem war die Wirkung, siehe oben. |
| Repair-Vorlauf | 800 ms | Der Client kann ihn ausrechnen: `moduleActiveUntil − 3 000 ms` ist der Start. Kein fehlender Zustand. |
| Dash-Schadensabschlag (×0,25) | 180 ms | Ableitbar aus `activeModule` + `moduleActiveUntil`. Kein Feld nötig. |
| Rapid / Momentum | laufend | `signature` 0–100, sichtbar. |
| Precision / Ladeschuss | laufend | `signature` = Ladung; der geladene Schuss ist zusätzlich am `radius` und `maxIntegrity` des Projektils erkennbar. Vollständig lesbar. |
| Control / Budget | laufend | `signature` = Konto; der Lebensbonus steht in `maxHealth` der Drohne. |
| Impact / Wucht | 1 Tick beim Aufprall | Der Balken springt von 100 auf ~0. Ableitbar, aber nur aus dem Sprung – Urteil unverändert aus Paket 20: 03 überlassen, bis sie sagen, es reicht nicht. |

Ein Fall, den ich bewusst offen lasse, weil der Fix teuer wäre: Ein Schuss auf
Tuchfühlung erzeugt **kein sichtbares Projektil** – es entsteht und trifft
innerhalb eines Ticks. Der Schaden kommt aus dem Nichts. Das zu heilen hieße,
Treffer als Ereignis in den Snapshot zu nehmen; das ist eine Wire-Änderung und
gehört in einen eigenen Auftrag, nicht in ein „klein und schnell".

## Freigabe umgesetzt: die zwei geteilten Konstanten

`REPULSE_RADIUS` (195) und `BARRIER_FRONT_DOT` (0,28) stehen jetzt in
`packages/shared/src/gameplay.ts`, mit Kommentar. Der Server re-exportiert sie
aus `loadout-system.ts`, damit bestehende Importe nicht auf zwei Quellen
zeigen. Null Snapshot-Kosten. Ein Test prüft den Radius über die geteilte Zahl.

`moduleDirection` bleibt liegen, wie besprochen.

## Nebenbei aufgeräumt

Die Standard-Spalte in `docs/DEPLOYMENT.md` stand bei **sieben** Schaltern noch
auf `false`, obwohl sie in `index.ts` längst Opt-out sind (beide Signature-Paare,
Familien-Upgrades, Projektiltempo, Dash-Fahrt). Wer die Tabelle liest, um zu
entscheiden, was live läuft, liest den Stand von vor zwei Runden. Korrigiert.

## Von 01 gebraucht

1. **Entscheidung zu `REPULSE_TRAVEL_ENABLED`.** 44 px → 107 px ist eine
   Verdopplung der Modulwirkung. Serverseitig blockiert nichts; ein Client
   braucht dafür ebenfalls nichts, die Bewegung steht in den Positionen.
2. **Zur Kenntnis: Der Bot-Dash sprang seit Paket 20 weiter.** Wenn du in der
   Zwischenzeit auf `main` geschaut und keinen Unterschied gesehen hast – das
   war der Grund, nicht die Fahrt selbst.
3. Repair und die geteilten Konstanten brauchen keine Entscheidung, aber der
   Repair-Fix ändert Verhalten ohne Flag. Wenn dir das zu weit geht, sag es:
   Es sind die Zeilen um `REPAIR_MOVE_LIMIT` in `loadout-system.ts` und der
   `rolling`-Zweig in `bot-brain.ts`, sonst nichts.

## Abweichungen vom Auftrag

1. **Ich habe drei Sachen repariert, nicht nur berichtet** – der Auftrag ließ
   das ausdrücklich zu („repariere es wie beim Dash").
2. **Ich habe die Bot-Steuerung angefasst** (`bot-brain.ts`), zweimal: einmal
   als Folge des Repair-Fixes, einmal beim Suchen des Dash-Fehlers. Das ist
   mein Revier, aber es ist nicht Modulcode – deshalb steht es hier.
3. **KL5 ruht weiter.** Nichts gebaut, nichts gemessen.

## Geänderte Dateien

| Datei | Was |
|---|---|
| `packages/shared/src/gameplay.ts` | `REPULSE_RADIUS`, `BARRIER_FRONT_DOT` (deine Freigabe) |
| `apps/server/src/loadout-system.ts` | Fahr-Schalter ans Spiel statt an den Aufruf; Repair weist Aktivierung in Fahrt zurück; getragener Rückstoß hinter Flag; `REPAIR_MOVE_LIMIT` |
| `apps/server/src/bot-brain.ts` | Bot hält an, bevor er repariert |
| `apps/server/src/index.ts` | neues Flag, Durchreichung, `/health.features.repulseTravel`; vierter Parameter entfernt |
| `apps/server/src/loadout-visibility.test.ts` | **neu** – 8 Tests (Repair, Repulse) |
| `apps/server/src/loadout-dash.test.ts` | +1 Test: Bot-Dash fährt |
| `.env.example`, `docs/DEPLOYMENT.md` | neuer Schalter; sieben falsche Standardwerte korrigiert |

**Tests: 772 grün** (9 neu), `npm run check` sauber.

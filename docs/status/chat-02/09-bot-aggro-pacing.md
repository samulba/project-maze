# 09 – Bot-Aggro-Pacing (P1) + Machbarkeitskommentar Klassen 3.0 (KL1)

**Branch:** `claude/bot-aggro-pacing` · **Basis:** `origin/main` @ `b4598db` ·
**Status: OFFEN – wartet auf Merge** · Auftrag: `docs/status/chat-01/auftrag-chat-02.md`

---

# Teil 1 – Aggro-Pacing

## Der eigentliche Befund

Sams Beschwerde war „es wird durchgehend geschossen". Beim Lesen der Zielwahl
zeigt sich, warum: **keine einzige Regel beendete je eine Jagd.** Ein Bot nahm
ein Ziel auf und behielt es, bis es tot, unsichtbar oder außer Reichweite war.
Anfängerschutz und Anti-Gang-up regelten nur, *wen* er sich aussucht – nie, wie
lange. Vier Regeln ändern das, alle Werte in `DEFAULT_BOT_PACING`:

| Regel | Wert | Was sie tut |
|---|---|---|
| Verschnaufpause | `killDisengageMs = 6000` | Nach einem Abschuss sind **alle** Menschen 6 s tabu. Der Bot farmt oder repositioniert. |
| Jagd-Timeout | `huntTimeoutMs = 8000` | Verfolgt ein Bot einen Menschen 8 s ohne **eigenen Treffer**, bricht er ab. Jeder eigene Treffer stellt die Uhr neu. |
| Fluchtfenster | `huntGiveUpMs = 6000` | Wer so entkommen ist, ist für genau diesen Bot 6 s unsichtbar. Sonst nimmt er die Jagd im nächsten Tick wieder auf. |
| Angreifer-Deckel | `maxAttackersPerHuman = 2` | Hart. Auch Vergeltung öffnet keinen dritten Platz mehr. |
| Stil-Verteilung | `BOT_STYLES` (`game.ts`) | Farmer 20 % → 40 %, Sniper-Stile schrumpfen. |
| Angriffslust | `styleAggression` | Farmer 0.2, Kiter 0.45, Controller 0.4, Hunter/Brawler 1.0. |

### Warum der Deckel vorher leckte

`MAX_ATTACKERS_PER_TARGET = 2` gab es schon, aber mit zwei Hintertüren: Wer
selbst getroffen wurde (`attackedMe`), durfte über den Deckel hinweg – und die
Zählung verglich die Gesamtzahl der Verfolger gegen 2, inklusive des Bots, der
gerade entscheidet. Ein Bot, der seinen Platz bereits hatte, hätte ihn bei jeder
Entscheidung wieder hergeben müssen; nur die erste Hintertür verhinderte das.
Jetzt zählt das eigene Ziel nicht mit (der Platz bleibt), und Vergeltung öffnet
keinen dritten (der Deckel hält). Für **Bots untereinander** bleibt die alte,
weiche Regel – die dürfen sich weiter zerlegen, das kostet niemanden Nerven.

### Warum die Stil-Verteilung allein nichts gebracht hätte

`aggressive` war `style === 'hunter' || style === 'brawler' || Math.random() > 0.4`.
Ein Farmer war also zu 60 % angriffslustig – dem Namen nach friedlich, im
Verhalten kaum von einem Jäger zu unterscheiden. Mehr Farmer hätten deshalb
fast nichts geändert. Die Angriffslust hängt jetzt am Stil. Erwartete Zahl
angriffslustiger Bots in der 8er-Arena: **6,0 → 4,45**.

## Gemessen

Kopfrechnen reicht hier nicht, also drei Szenarien in der echten Simulation:
3 Menschen an festen freien Positionen quer durch die Arena, 8 Bots, 240 s,
6 Läufe je Variante (`.probe/`, nicht eingecheckt).

| Szenario | Kennzahl | ohne Pacing | mit Pacing | Δ |
|---|---|---|---|---|
| **A** standhaft | Zeit unter Beschuss | 45,2 % | 29,5 % | **−35 %** |
| | ≥ 2 Jäger gleichzeitig | 3,85 % | 1,28 % | **−67 %** |
| **B** fliehend | Zeit unter Beschuss | 45,7 % | 26,0 % | **−43 %** |
| | Ø Dauer einer Jagd | 2,35 s | 1,28 s | **−45 %** |
| **C** sterblich, Respawn am Ort | Zeit unter Beschuss | 43,8 % | 13,7 % | **−69 %** |
| | Tode in 240 s | 115,7 | 27,0 | **−77 %** |
| | **Ruhe nach dem Respawn** | **0,4 s** | **7,8 s** | **+1767 %** |

Szenario C ist die Antwort auf Sams Satz. Vorher lag zwischen Wiedereinstieg und
dem nächsten Bot, der anlegt, **0,4 Sekunden**. Jetzt sind es **7,8**.

Ehrlich dazu: Szenario C ist ein konstruierter Härtefall – die Testmenschen
respawnen sofort am selben belebten Punkt und ohne Spawnschutz. Die absoluten
Todeszahlen sind deshalb unrealistisch hoch; belastbar ist der Vergleich, nicht
der Absolutwert. Und Szenario A unterschätzt den Jagd-Timeout systematisch: Wer
stehen bleibt, wird getroffen, und jeder Treffer stellt die Uhr zu Recht neu.
Der Timeout ist eine Belohnung fürs Ausweichen, keine generelle Abkühlung.

## Tests

**6 neu / 435 gesamt**, alle deterministisch. Der Jäger ist der einzige Stil mit
Angriffslust 1.0 und entscheidet damit ohne Zufallsziehung – alle Zielwahl-Tests
laufen über ihn (Teamplan-Regel 8). Die Testkoordinaten sind vorab mit
`isFree`/`hasLineOfSight` geprüft, nicht geraten.

Zehn Mutationsproben, jede genau von den Tests gefangen, die sie fangen soll:

| Mutation | gefangen |
|---|---|
| Verschnaufpause entfernt | 1 Test |
| Jagd-Timeout entfernt | 2 Tests |
| Fluchtfenster entfernt | 2 Tests |
| Deckel wieder weich (Vergeltung schlägt durch) | 1 Test |
| Deckel zählt sich selbst mit (Platz geht verloren) | 1 Test |
| Eigener Treffer stellt Timeout nicht neu | 1 Test |
| Alte Stil-Verteilung | 1 Test |
| Farmer wieder pauschal aggressiv | 1 Test |
| Flag-Aus greift bei `killPlayer` nicht | 1 Test |
| Flag-Aus fällt auf Default zurück | 1 Test |

## Flag

`BOT_PACING_ENABLED` (Opt-out, Default an; `false`/`0`/`off` schalten ab).
Technisch ist es kein Boolean, sondern die Konfiguration selbst:
`tuneBotBrain(game, pacing)` mit `pacing = null` = Verhalten exakt wie vorher.
Ein Test belegt das (Teamplan-Regel 4), zwei Mutationsproben sichern es ab.

**Bewusste Ausnahme:** Die Stil-Verteilung in `game.ts` hängt **nicht** am Flag.
Sie ist reine Daten – eine Liste mit fünf Stilen –, wird vom Konstruktor und vom
Arena-Direktor gelesen und wäre nur über einen Umweg durch beide zu schalten.
Bei `BOT_PACING_ENABLED=false` bleibt also der höhere Farmer-Anteil bestehen;
die Angriffslust fällt auf die alten pauschalen 60 % zurück. Wer den exakten
Vorzustand will, ändert die Liste zurück – eine Zeile.

## Geänderte Dateien

| Datei | Was |
|---|---|
| `apps/server/src/bot-brain.ts` | `BotPacingConfig`, `DEFAULT_BOT_PACING`, `RETALIATION_MEMORY_MS`, `killPlayer`-Hook, Jagd-Timeout, harter Deckel, stilabhängige Angriffslust |
| `apps/server/src/bot-brain.test.ts` | 6 neue Tests + Testhelfer `duel()`/`decide()` |
| `apps/server/src/game.ts` | `BOT_STYLES`: 5 → 10 Einträge, Farmer 20 % → 40 % |
| `apps/server/src/index.ts` | `BOT_PACING_ENABLED`, Durchreichen an `tuneBotBrain` |
| `README.md` | Flag und Bot-Verhalten dokumentiert |

---

# Teil 2 – KL1: Machbarkeitskommentar Klassen 3.0

Nur Kommentar, keine Implementierung. Grundlage: MASTERPLAN.md Handlungsfeld 5.

## Übersicht

| Familie | Signature | Server | Protokoll | Client | Gesamt | Hauptfalle |
|---|---|---|---|---|---|---|
| RAPID | Momentum | S | 1 Zahl | HUD-Balken | **M** | Unsichtbar = fühlt sich nach Lag an |
| IMPACT | Wucht | S | 1 Zahl | VFX | **M** | Wand nullt die Achse – „Wände nutzen" braucht Bewegungsänderung |
| PRECISION | Ladeschuss | M | Eingabe-Semantik | Ladeanzeige | **L** | Server ist *latest-input*, nicht *queue* – Halten ist nicht sauber ableitbar |
| CONTROL | Einheiten-Budget | L | **neue Entitätstypen** | neue Renderer + Eingabe | **XL** | Verlangsamungsfeld kollidiert frontal mit der Client-Prediction |

## RAPID – Momentum · Aufwand M

**Server (klein).** Ein Skalar je Spieler, im Tick aus `|velocity|` und
„wurde gefeuert" fortgeschrieben, als Multiplikator auf `reload`. Die Naht dafür
existiert: `tunedStatsFor()` in `combat-tuning.ts` ist bereits die einzige Stelle,
an der Klassenwerte spielerabhängig verbogen werden.

**Fallen.**
1. **Ohne Anzeige unspielbar.** Eine schwankende Feuerrate ohne sichtbaren
   Grund liest sich als Netzproblem. Braucht ein Snapshot-Feld – siehe den
   gemeinsamen Vorschlag unten.
2. **Kollidiert mit N2.** Wenn der Client die eigene Bewegung vorhersagt, muss er
   auch den Momentum-Aufbau nachbauen, sonst zeigt der Balken etwas anderes als
   der Server rechnet. Gehört in `docs/CLIENT_PREDICTION.md`.
3. **Multiplikatoren stapeln.** `reload` wird bereits von `combat-tuning`, vom
   `lightweight`-Frame und von Upgrades angefasst. +40 % obendrauf trifft die
   Rapid-Linie, die ohnehin am Feuerratenlimit spielt. `npm run balance` liest
   Basiswerte und **sieht Momentum nicht** – der Report braucht eine Spalte,
   sonst balanciert die Runde KL5 an der falschen Zahl.
4. **Bots.** `think()` kennt kein Momentum; ein Rapid-Bot, der zum Zielen stehen
   bleibt, wird strikt schlechter. Braucht eine Bewegungsregel im Stil-Profil.

## IMPACT – Wucht · Aufwand M

**Server (am kleinsten von allen vier).** Der Körperschaden existiert und wird
schon je Kontakttick angewendet (`statsFor(b).bodyDamage * 0.08`); ein
Anlauf-Faktor ist ein Multiplikator an genau dieser Stelle. Anlaufstrecke ist
derselbe Skalar-Typ wie Momentum – beide Familien teilen sich die Mechanik
„Zahl läuft hoch, Stillstand baut ab" und damit den Code.

**Fallen.**
1. **„Wände nutzen" ist keine Kleinigkeit.** `moveCircle` **nullt** die blockierte
   Achse (dokumentiert in `docs/CLIENT_PREDICTION.md`, Abschnitt 3). Wer in eine
   Wand rammt, verliert seinen Anlauf schlagartig. Abprallen oder Anlauf-Erhalt
   an Wänden wäre eine Änderung der Bewegungsintegration – also genau die Stelle,
   die der Client identisch nachbauen muss. **Empfehlung: für KL2 weglassen**,
   Wucht rein über Strecke, Wandmechanik separat nach N2.
2. **One-Shot-Gefahr.** Ein Juggernaut mit vollem Anlauf auf einen Frischling ist
   ein P0-Gefühlsbug. Braucht eine Obergrenze und eine Verzahnung mit
   `ROOKIE_PROTECTION_LEVEL`.
3. **Feedback.** Ohne sichtbaren Anlauf (Spur, Bildschirmeffekt) wirkt der
   Schaden zufällig. Gleiche Plumbing wie der Momentum-Balken.

## PRECISION – Ladeschuss · Aufwand L

**Server (mittel), Protokoll (heikel).**

**Fallen.**
1. **Der Server ist eingabe-*getrieben*, nicht eingabe-*gepuffert*.** `applyInput`
   verwirft alles mit `sequence <= lastInput` und behält nur den jüngsten
   Zustand; zwischen zwei Ticks ankommende Eingaben überschreiben einander.
   „Wie lange hält der Spieler?" ist daraus nur näherungsweise ableitbar: Ein
   verlorenes Paket, in dem `primary` kurz `false` war, bleibt unsichtbar – oder
   umgekehrt setzt ein verlorenes Paket die Ladung zurück, die der Spieler
   gehalten hat. **Das ist die einzige der vier Signatures, die die
   Eingabe-Semantik selbst betrifft.**
2. **Feuern auf die fallende Flanke.** Heute feuert `primary === true` wiederholt,
   sobald der Cooldown abgelaufen ist. Ein Ladeschuss löst beim **Loslassen** aus.
   Das ist ein Eingriff in den Feuerpfad in `game.ts`, keine Tuning-Schicht
   obendrauf – die erste Signature, die den Kern anfasst.
3. **Auto-Fire (`E`) hat kein Loslassen.** Braucht eine Designentscheidung:
   Auto-Fire lädt immer voll durch (dann ist Auto-Fire optimal und das Halten
   sinnlos) oder Auto-Fire feuert Schwachschüsse (dann ist es für Precision
   nutzlos). Beides ist vertretbar, aber es ist eine **Design-, keine
   Technikfrage** – gehört zu KL1 bei 01.
4. **Latenz trifft genau den Kern.** Die fallende Flanke kommt eine RTT zu spät;
   der „eine perfekte Treffer" löst sichtbar nach dem Loslassen aus. Sauber lösbar
   nur, indem der Client die Haltedauer mitschickt und der Server sie gegen ein
   Toleranzfenster prüft – ein bewusster Kompromiss an der Serverautorität.
   **Deshalb erst nach N2**, wenn die Sequenznummern ohnehin fließen.

## CONTROL – Einheiten-Budget · Aufwand XL

**Die einzige Familie, die neue Entitätstypen braucht.**

**Fallen.**
1. **Neue Entität = Protokoll, Culling, Encoding, Rendering.** Mini-Turm und
   Verlangsamungsfeld brauchen je ein Snapshot-Array, einen AOI-Filter, einen
   Eintrag in der Delta-Logik **und** in der Kurz-ID-Zuordnung
   (`snapshot-encoding.ts` behandelt jeden Typ einzeln) plus einen Renderer.
   Allein das ist mehr Arbeit als Rapid und Impact zusammen.
2. **Verlangsamungsfeld ist ein Bewegungsmodifikator** – und Bewegung ist exakt
   das, was N2 im Client nachrechnet. Ein Feld, das die Geschwindigkeit ändert,
   muss der Client kennen, sonst gummibandet jeder Spieler darin dauerhaft. Von
   allen vier Signatures die **schlechteste Verträglichkeit mit der Prediction**.
3. **Kosten steigen mit der Population.** Drei Deployables je Controller sind bei
   voller Arena zwei Dutzend zusätzliche Entitäten in Snapshot und Kollision.
   Mess- und begrenzbar (`npm run loadtest`, Tick-Budget in `/metrics`), aber es
   muss vorher gemessen werden, nicht danach.
4. **Umschichten braucht einen Eingabekanal, den es nicht gibt.** `1–8` liegen auf
   den Upgrades, Links/Rechts auf Feuern und Drohnen. Radialmenü oder
   Modifiertaste – wieder eine Designentscheidung vor der Implementierung.

## Empfohlene Reihenfolge

Der Plan sagt Rapid → Precision → Impact → Control. **Mein Vorschlag: Rapid →
Impact → Precision → Control** – also Precision und Impact tauschen.

1. **RAPID** zuerst, unverändert. Kleinste Protokollfläche und der Testfall dafür,
   dass „Signature hinter Flag, eine Familie nach der anderen" überhaupt trägt.
2. **IMPACT** vorziehen, weil es dieselbe Mechanik wie Rapid ist (Skalar läuft
   hoch, Stillstand baut ab) und damit dieselbe Plumbing im Client wiederverwendet
   – zwei Familien zum Preis von anderthalb. Ohne die Wandmechanik.
3. **PRECISION** danach, weil es als einzige die Eingabe-Semantik betrifft und
   latenzempfindlich ist. **Nach N2**: Wenn die Prediction steht, ist die
   Haltedauer sauber begründbar statt geraten.
4. **CONTROL** zuletzt, unverändert. Neue Entitäten, neue Eingaben, neues
   Rendering – und der Konflikt mit der Prediction ist dann bereits verstanden.

**Ein Vorschlag quer zu allen vieren:** Erst *ein* gemeinsames Snapshot-Feld
verabreden, dann Familie für Familie bauen. Sonst sind es vier
Shared-Änderungen, vier Client-Runden und vier HUD-Elemente für dieselbe Sache.
Konkreter Vorschlag unten.

---

## Von 01 gebraucht

### 1. Nichts für Teil 1

Das Paket ist rein serverseitig. Keine Shared-Änderung, kein Client-Bedarf.

### 2. Für KL2 – ein Feld für alle vier Signatures

Vorschlag in `packages/shared/src/index.ts`, `PlayerSnapshot`:

```ts
  /**
   * Füllstand der Familien-Signature in Prozent (0–100, ganzzahlig).
   * Die Bedeutung ergibt sich aus `playerClass`: Rapid = Momentum,
   * Precision = Ladung, Control = freies Einheiten-Budget, Impact = Wucht.
   * Fehlt bei Klassen ohne Signature und solange KL2 abgeschaltet ist.
   */
  signature?: number;
```

Begründung der Form:
- **Eine Zahl statt eines Objekts.** Die Art ist aus `playerClass` ableitbar, die
  der Client ohnehin hat. Spart Bytes und eine Union im Protokoll.
- **Ganzzahlig 0–100.** Bei Rapid ändert sich der Wert praktisch jeden Tick; als
  gerundete Ganzzahl kostet er 2–3 Bytes, als `float` das Vierfache. Die
  Delta-Schicht (`SNAPSHOT_DELTAS`) unterdrückt ihn, solange er steht – das
  funktioniert nur bei gerundeten Werten.
- **Für alle sichtbaren Spieler, nicht nur `selfId`.** Einen ladenden Precision-
  Gegner zu sehen ist das Gegenspiel zum Ladeschuss.
- **Optional.** Bewusst nach der `lastProcessedInput`-Konvention – Test-Fixtures
  bleiben gültig.
- **Nicht in `applyShortIds`** (keine ID), **nicht in die Statik-Liste** der
  Delta-Schicht (ändert sich ständig).

Sobald das steht, kann KL2 Familie für Familie liefern, ohne `packages/shared`
erneut anzufassen.

### 3. Zwei Designfragen vor KL2 (nicht von mir zu entscheiden)

1. **Auto-Fire × Ladeschuss** – lädt `E` voll durch oder feuert es Schwachschüsse?
2. **Umschichten der Control-Einheiten** – welcher Eingabekanal?

---

## Erledigt, kein offener Punkt mehr

- **`spectatorTargetId` in `applyShortIds`** (offen aus Paket 07): steht,
  `snapshot-encoding.ts:312` schreibt es um, der Typ ist `NetId | null`.
- **`ACCELERATION_SCALE` nach shared** (Empfehlung aus Paket 08): liegt dort.
- **Einspruch gegen `lastProcessedInput?` als optionales Feld: ziehe ich zurück.**
  Meine Sorge war, dass ein optionales Feld still verschwinden kann, ohne dass
  der Compiler es merkt – und der Client mit `?? -1` kommentarlos in „keine
  Prediction" zurückfällt. Das ist durch `input-ack.test.ts` abgedeckt: Der Test
  prüft die Anwesenheit am fertig gebauten Snapshot. Die Garantie liegt damit im
  Test statt im Typ. Das ist gegen Dutzende Fixtures ein fairer Tausch.

## Abweichungen vom Auftrag

1. **Stilabhängige Angriffslust zusätzlich eingebaut.** Der Auftrag sagt nur
   „Farmer-Anteil erhöhen". Mehr Farmer allein hätten fast nichts bewirkt, weil
   ein Farmer zu 60 % angriffslustig war (Rechnung oben). Die Tabelle
   `styleAggression` macht die Maßnahme erst wirksam. Wer sie nicht will:
   alle Werte auf `1` bzw. `0.6` setzen, dann gilt exakt die alte Regel.
2. **Stil-Verteilung hängt nicht am Flag** (Begründung im Flag-Abschnitt).
3. **Verschnaufpause gilt nach *jedem* Abschuss, nicht nur nach dem Töten eines
   Menschen.** Der Auftrag sagt „Nach einem Kill lässt der Bot ~6 s von Menschen
   ab" – ich habe das wörtlich genommen. Ein Bot, der gerade einen anderen Bot
   erledigt hat, nimmt sich denselben Moment. Umzustellen wäre es mit einer
   Zeile (`if (target.isBot) return;` im `killPlayer`-Hook).
4. **`MAX_ATTACKERS_PER_TARGET` bleibt bestehen** und gilt weiterhin für
   Bot-gegen-Bot-Ziele; der harte Deckel ist ein zweiter Wert nur für Menschen.
   Zwei Namen für ähnliche Dinge, aber die Regeln sind bewusst verschieden.

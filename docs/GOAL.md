# MAZERS – das Ziel

Stand: 11.08.2026. Dieses Dokument ist der Nordstern. Wenn eine Aufgabe nicht
auf eine der Zeilen hier einzahlt, ist sie nicht dran.

---

## In einem Satz

MAZERS ist eine gesunde Mischung aus Diep.io und Arras.io: viele Tanks mit
echten Rollen statt nur unterschiedlich schneller Kugeln, mehrere Modi, eine
Karte, die sich groß anfühlt – und es fühlt sich an wie ein fertiges Spiel,
nicht wie ein Prototyp.

„Fertig" ist kein Gefühl, das wir uns selbst bescheinigen. Es ist die Liste
unten, und die ist prüfbar.

---

## Was „fertig" heißt

| Zeile | Womit geprüft | Stand heute |
|---|---|---|
| Regeln und Typen stimmen | `npm run check` grün | ✅ |
| Keine UI, die sich überlappt oder aus dem Bild läuft | `scripts/ui-layout-check.mjs` 181/181 | ✅ |
| Kein Tank ist Müll, keiner ist Pflicht | Balance-Korridore in `packages/shared/src/balance.test.ts` | ✅ |
| Das Labyrinth bleibt ein Labyrinth | Wanddeckung 3,8–5,2 % der Fläche (`world.test.ts`) | ✅ 4,53 % |
| Kein Upgrade ohne Wirkung | `upgradeAppliesTo` + Test „haelt Projektil-Upgrades von Klassen ohne Rohr fern" | ✅ |
| Kein Knopf ohne Server-Antwort | Alle 8 Familien-Signatures serverseitig verdrahtet | ✅ |
| Keine Serverlags bei voller Arena | Tick p95 < 25 ms **und ≤ 160 KB/s pro Spieler** | ✅ 138,8 KB/s bei 80 Spielern, Tick p95 10,4 ms |
| Die Leitung Server→Client ist heil | `npm run wire-probe` grün | ✅ |
| Auf dem Handy lässt sich **spielen**, nicht nur gucken | `npm run touch-probe` grün | ✅ 844×390 |
| Mehrere Modi | Drei spielbare Modi im Client wählbar | ❌ 1 von 3 (nur Maze) |
| Es fühlt sich groß an | 675.000 px² je Spieler, Dichte-Test grün | ✅ 9000 × 6000, 80 Spieler |
| **Fremde kommen wieder** | Admin-Portal: wiederkehrende `device_id` über 7 Tage | 🔍 misst ab jetzt |

Die letzte Zeile ist die einzige, die wir nicht selbst bestehen können. Alles
darüber kann grün sein und das Spiel trotzdem langweilig – deswegen steht sie
drin.

**Stand 11.08.: neun von elf Zeilen grün.** Offen sind genau zwei – die Modi
(bewusst zurückgestellt, siehe Reihenfolge) und die Wiederkehr, für die Sam
erst die Supabase-Migration und die Railway-Variablen setzen muss.

Was zur Karte gehört, ist systematisch nachgeprüft und nicht nur angenommen:
Bandbreite, Tick-Budget, Bot-Dichte, Wanddeckung, Arena-Events, Spawn-Verteilung
(Notausgang greift in 20.000 Ziehungen nie), Formen-Nachschub, Rate-Limits
(Respawn läuft nicht über die Join-Grenze), Handy-Layout und Touch-Bedienung.
Ein echter Befund kam dabei heraus – die Arena-Events – und der ist behoben.

---

## Die drei Entscheidungen

Drei Dinge waren im ursprünglichen Zielsatz offen. **Sam hat sie am 11.08.2026
entschieden** – die Vorschläge kamen von mir, die Entscheidung von ihm. Bei den
Modi hat er anders entschieden als vorgeschlagen.

### 1. Welche Modi? → Maze (aktuell) + FFA + Battle Royale. Drei.

Im Code gibt es **keine** Modi-Infrastruktur; `mode: 'maze-alpha'` ist ein
hartkodiertes Etikett in `index.ts` und `telemetry.ts`. „Mehrere Modi" ist also
Neuland, kein Feinschliff.

| Modus | Was ihn ausmacht | Aufwand |
|---|---|---|
| **Maze** | Der heutige Modus: Wände in Bahnen (`world.ts`), Deckung, Ecken | ✅ da |
| **FFA** | Offene Arena ohne Wände – das Diep.io-Gefühl, freie Sichtlinien | klein |
| **Battle Royale** | Schrumpfende Zone, letzter Überlebender | groß |

FFA ist billig, weil es der heutige Modus **ohne** Wandgenerierung ist – und
trotzdem ein völlig anderes Spiel: ohne Deckung zählen Reichweite und Tempo
statt Ecken. Battle Royale ist der eigentliche Bau (Zonen-System, Siegbedingung,
verändertes Spawn-Verhalten) und kommt zuletzt.

Team-Arena, Boss-Runden und 2v2 sind **nach** 1.0.

### 2. Handy drin oder raus? → Drin, aber als „spielbar", nicht als „gleichwertig".

Es steckt bereits viel fertige Touch-Arbeit im Code: `.move-stick`,
`.aim-stick`, `.auto-fire`, `.secondary-action`, `.core-ability`, 44-px-Ziele
unter `@media (pointer: coarse)`, und die Harness prüft 17 echte Gerätegrößen
inklusive Handys im Querformat. Das wieder rauszureißen wäre Vernichtung
fertiger Arbeit.

Die Latte ist aber bewusst niedriger als am Desktop: **Handy = Querformat, alle
Handy-Fälle der Harness grün, keine tote Klickfläche.** Kein Versprechen, dass
man per Daumen gegen Maus-Spieler gewinnt.

Wichtig zur Einordnung: „niedriger als Desktop" heißt **nicht** „nebenbei".
Handy steht in der Reihenfolge vor den Modi – „muss natürlich mit dabei sein"
(Sam, 11.08.). Ein Spiel, das auf dem Handy hakt, fühlt sich nicht fertig an,
egal wie viele Modi es hat.

### 3. Wie viel größer? → 9000 × 6000 bei 80 Spielern. Und: die Karte wächst nur zusammen mit der Spielerzahl.

Das ist die wichtigste Entscheidung, weil „größere Karte" allein das Spiel
**schlechter** macht: gleiche 40 Spieler auf doppelter Fläche heißt leere
Karte und lange Wege ohne Gegner.

Die feste Größe ist deshalb nicht die Kantenlänge, sondern die **Dichte**:

> **rund 600.000 px² pro Spieler.**
> Vorher: 6000 × 4000 ÷ 40 = 600.000. Heute: 9000 × 6000 ÷ 80 = 675.000.
> `packages/shared/src/index.test.ts` hält den Korridor 450.000–750.000 fest.

„Größere Karte" heißt damit automatisch „mehr Spieler". Und genau das war die
Frage, ob das ohne Lags geht. Gemessen, nicht geschätzt:

| Arena | Spieler | Schalter | KB/s pro Spieler | Tick p95 | Budget |
|---|---|---|---|---|---|
| 6000 × 4000 | 32 | aus (vorher) | **229,6** | 2,2 ms | 7 % |
| 6000 × 4000 | 32 | `SNAPSHOT_DELTAS` | 142,1 | – | – |
| 6000 × 4000 | 32 | beide | 118,8 | 2,6 ms | 7 % |
| 9000 × 6000 | 80 | aus | 281,4 | 9,4 ms | 24 % |
| **9000 × 6000** | **80** | **beide (heute)** | **138,8** | 10,4 ms | 34 % |

Ergebnis: Eine **2,25-fach größere Karte mit doppelt so vielen Spielern kostet
pro Kopf weniger** als die alte kleine Arena – 138,8 gegen 229,6 KB/s.

Zwei Dinge, die man beim Nachmessen wissen muss, sonst erschrickt man:

* **Kurze Läufe messen den Einschwingvorgang, nicht den Betrieb.** Ein 30-s-Lauf
  zeigt 166 KB/s, ein 110-s-Lauf 138,8. Der Unterschied sind die Bots: Der
  Direktor baut sie ab, sobald Menschen kommen, aber nur einzeln und nur, wenn
  gerade keiner zusieht.
* **Der Abbau lässt sich nicht beschleunigen.** Ein Aufholmechanismus (mehrere
  Abgänge je Fenster) brachte gemessen 6 statt 7 Bots nach 95 s – Rauschen. Der
  Engpass ist die Regel „niemand verschwindet vor den Augen eines Spielers":
  Bei voller Arena ist schlicht kein Bot unbeobachtet. Der Mechanismus wurde
  wieder entfernt, statt als wirkungslose Stellschraube stehenzubleiben.

Die Bedingung dafür sind zwei Schalter, die **fertig und getestet im Repo
liegen und trotzdem aus sind**: `SNAPSHOT_DELTAS` und `SHORT_NET_IDS`. Der
Client kann beide seit Langem (`snapshot-hydrator.ts`, 20 Tests); ein echter
Browser joint, spielt und rendert damit sauber – Wände, Formen, Killfeed,
Bestenliste mit Klasse und Level.

Ohne die Schalter ist die große Karte mit 281,4 KB/s pro Spieler das teuerste
Szenario überhaupt. **Die Schalter sind die Voraussetzung, nicht die Kür.**

---

## Was schon steht

- 65 Klassen in 8 Familien. „Nicht nur langweilige Kugeln" war Sams Wunsch –
  hier steht, warum das stimmt, statt es zu behaupten.

  Entscheidend ist **nicht** die Bonushöhe; die ist bei fünf der acht Familien
  ein Statfaktor. Entscheidend ist die **Bedingung, unter der sich die Leiste
  füllt** – denn die bestimmt, wie man spielt:

  | Familie | Leiste füllt sich durch | erzwingt | Wirkung bei voll |
  |---|---|---|---|
  | RAPID | fahren **und** feuern | ständig in Bewegung | Nachladen −25 % |
  | SIEGE | **stillstehen** | Position beziehen | Schaden +45 %, Reichweite +50 % |
  | PRECISION | Feuertaste **halten** | Timing statt Klickrate | Schaden ×2,2, Größe +40 % |
  | IMPACT | schnell fahren | rammen | Rammschaden +150 % |
  | SPECTER | ungesehen bleiben | flankieren | ab 95: Hinterhalt +35 % |
  | TEMPEST | jede Salve heizt | Dauerfeuer aushalten | Schaden +40 % |
  | CONTROL | Nachschub-Konto | Flotte verwalten | Drohnen-Leben +45 % |
  | AEGIS | **erlittener** Schaden | Treffer einstecken *wollen* | Entladung 34 auf Radius 240, Rüstung 18 % |

  RAPID und SIEGE sind im Code ausdrücklich als Gegenteile gebaut – „wer steht,
  wird zur Kanone" gegen „wer fährt, lädt nach". Zwei Familien, die sich auf
  demselben Feld gegenseitig bestrafen, ergeben eine echte Positionsentscheidung
  statt zweier unabhängiger Buffs. AEGIS ist die einzige Familie, die getroffen
  werden *will*.

  Nachzulesen mit `npm run balance` – der Report zeigt die Tabelle inzwischen
  für alle acht Familien. Vorher standen dort nur RAPID, IMPACT und PRECISION
  ausführlich, und er schwieg über die fünf neueren: ausgerechnet dort, wo das
  Ziel am konkretesten ist.
- Wechselnde Ziele in der Arena: Elite Shapes, Core Surge, Bounty auf den
  dominanten Spieler.
- Serverautorität sauber durchgezogen, Client schickt nur Eingaben.
- Admin-Portal, das beantworten kann, ob Spieler wiederkommen.

## Was fehlt

1. ~~Die zwei Bandbreiten-Schalter anschalten.~~ ✅ **erledigt** – beide sind
   jetzt Opt-out statt Opt-in, gesichert durch `npm run wire-probe`.
2. ~~Karte und Spielerzahl hochziehen.~~ ✅ **erledigt** – 9000 × 6000 bei
   80 Spielern, 562 Formen. Dazu musste die Bot-Population mitwachsen (8 → 18):
   Der Direktor hält bei *einem* Menschen die Arena belebt, und acht Bots auf
   54 Mio px² wären eine gespenstisch leere Karte gewesen – ausgerechnet beim
   ersten Eindruck eines neuen Spielers. Maßgeblich ist auch hier nicht die
   Zahl, sondern der Platz je Bot: 3,0 Mio px², exakt der Wert, den Sam auf der
   alten Karte freigegeben hatte.

   Drei Dinge wären dabei fast still verlorengegangen, beide beim ersten
   Eindruck am teuersten:

   * **Die Arena-Events wären halb verschwunden.** Sie lagen fest in der
     Kartenmitte mit festem Radius: auf der alten Karte 5 % der Fläche und nie
     mehr als 3600 Einheiten entfernt, auf der neuen nur noch 2,2 % und bis zu
     5400 Einheiten – bei Tempo 300 also achtzehn Sekunden Anfahrt für ein
     Event, das vierzig dauert. Die Kartenecken wären dauerhaft belanglos
     gewesen. Events suchen sich jetzt einen freien Platz in Reichweite eines
     Spielers; der Radius bleibt, also stehen bei gleicher Dichte gleich viele
     Leute drin wie vorher.

   * **Das Labyrinth wurde offener.** Die Bahn-*Anzahlen* standen fest (4 Reihen,
     6 Spalten), also wurden die Bahnen größer statt zahlreicher – Deckung fiel
     von 4,4 % auf 3,5 %. Die Design-Einheit ist die Bahn*breite*, nicht ihre
     Anzahl; jetzt wächst die Zahl mit (1,65 Wände je Mio px² gegen vorher 1,67).
   * **Zwei Tests fielen über die Karte statt über das Verhalten.** Beide
     benutzten Festpunkte, die auf der alten Karte in einer Wand lagen bzw.
     freies Feld waren. Einer wäre still wirkungslos geworden, statt rot – er
     hätte eine Kollision geprüft, die gar nicht mehr stattfindet. Beide suchen
     ihre Position jetzt, statt sie zu raten.

   **Kartengröße geht nicht per Railway-Variable.** Der Client liest `GAME.worldWidth`
   direkt (Hintergrundraster in `renderer.ts`, Grenzen in `prediction.ts`). Ein
   Env-Schalter nur auf dem Server würde beide Seiten auseinanderlaufen lassen –
   Raster und Vorhersage in der falschen Größe. `shared` bleibt die eine
   Wahrheit; die Änderung ist ein Deploy, kein Regler.

   Abgesichert ist die Regel durch den Test „haelt die Arena-Dichte im
   vereinbarten Korridor": Wer die Karte vergrößert, ohne `maxPlayers`
   mitzuziehen, bekommt einen roten Test statt einer leeren Arena.
3. **Handy richtig hinbekommen.** Kein Nachklapp, sondern gleichrangig mit der
   Karte – „muss natürlich mit dabei sein" (Sam, 11.08.).

   Angefangen: `npm run touch-probe` beweist, dass sich auf 844 × 390 wirklich
   spielen lässt – Bewegung über den Onboarding-Schritt, Feuern über echte XP.
   Bisher prüfte **nichts** das: Die Layout-Harness sagt nur, ob die Sticks
   sitzen. Mit lahmgelegten Sticks bleibt sie grün, während das Spiel
   unspielbar ist – genau dieser Fall ist jetzt abgedeckt.

   Was noch offen ist: die übrigen Formate (667 × 375 bis 932 × 430) durch
   dieselbe Probe, und die Frage, ob sich das Zielen per Daumen auch *gut*
   anfühlt – das ist keine Messung, das braucht Sams Daumen.
4. **FFA als zweiter Modus** – der heutige Modus ohne Wandgenerierung. Klein,
   weil `world.ts` nur übersprungen wird; trotzdem ein anderes Spiel.
5. **Battle Royale als dritter Modus** – schrumpfende Zone, Siegbedingung,
   verändertes Spawn-Verhalten. Der eigentliche Bau.

### Warum die Reihenfolge so ist

**Modi kommen zuletzt** – ausdrücklich: „Modi erst wenn alles sitzt" (Sam,
11.08.). Ein zweiter Modus auf einem wackeligen Fundament verdoppelt nur die
Zahl der Stellen, an denen es hakt. Erst sitzt das eine Spiel, dann kommt das
zweite dazu.

Ohne Schritt 1 hätte Schritt 2 das Spiel *verschlechtert*: die große Arena ohne
Deltas war mit 281,4 KB/s pro Spieler das teuerste Szenario der ganzen Messung.
Erst mit den Schaltern wurde „größer" billiger als „klein von vorher".

Und wenn die Modi dann dran sind, sind sie froh über den Platz: FFA ohne Wände
braucht Sichtlinien, die sich lohnen, und eine Battle-Royale-Zone, die auf
6000 × 4000 schrumpft, ist nach zwei Minuten ein Faustkampf.

### Spielerzahl: 80 ist ein Zwischenstand, kein Endwert

„Wenns iwann voll is sind 40 schon wenig – aber das können wir ja dann
skalieren" (Sam, 11.08.). Genau so ist es gebaut: Die Dichte-Regel (600.000 px²
je Spieler) macht das Hochziehen zu einer Rechnung statt zu einer Diskussion.
Der nächste Schritt wäre 12000 × 8000 bei 160 Spielern – noch nicht gemessen,
und der Tick läge dann grob bei 70 % Auslastung statt 34 %. Vorher messen.

## Wie man das nachmisst

```bash
# Bandbreite und Tick-Budget unter Last.
# Mindestens 100 s laufen lassen: Kuerzere Laeufe messen den Einschwingvorgang
# (der Direktor baut seine Bots erst ab) und zeigen rund 20 % zu viel.
node apps/server/dist/index.js &
npm run loadtest -- --url ws://127.0.0.1:2567 --clients 80 --duration 110 --ramp 6 --json

# Leitung Server→Client (braucht zusaetzlich: npx vite --port 5199 apps/client)
npm run wire-probe

# Laesst sich auf dem Handy wirklich spielen? (gleiche Voraussetzung)
npm run touch-probe
BREITE=667 HOEHE=375 npm run touch-probe    # iPhone SE quer

# UI auf 17 echten Geraetegroessen.
# Nichts Schweres nebenher laufen lassen: Unter Last laufen einzelne Faelle in
# einen Timeout und melden rot, ohne dass am Layout etwas falsch waere.
PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/ui-layout-check.mjs
```

---

## Was das Ziel *nicht* ist

Damit es abschließbar bleibt: keine Team-Arena, keine Boss-Runden, kein 2v2,
kein Ranked, keine Clans, keine Skins, kein Handy-Hochformat. Alles davon kann
gut sein – aber nach 1.0.

(Battle Royale stand hier zwischenzeitlich auch. Sam hat es am 11.08. bewusst
**ins** Ziel geholt und stattdessen die Team-Arena herausgenommen.)

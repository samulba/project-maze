# 11 – KL2-IMPACT: Signature „Wucht"

**Branch:** `claude/signature-impact-wucht` · **Basis:** `origin/main` @ `2551d34` ·
**Status: OFFEN – wartet auf Merge** · Auftrag: `docs/status/chat-01/auftrag-chat-02.md`

Zweite der vier Familien-Signatures. Flag **`SIGNATURE_IMPACT_ENABLED`**
(Default aus): Ohne den Schalter wird die Schicht nicht angehängt, `signature`
taucht in keinem Snapshot auf und der Körperschaden ist der alte.

## Die Mechanik

| Zustand | Rate | Konstante |
|---|---|---|
| fährt (≥ 45 % der eigenen Höchstgeschwindigkeit) | **+30/s** | `buildPerSecond` |
| steht | **−50/s** | `decayPerSecond` |
| **macht Körperschaden** | **−600/s** | `contactDrainPerSecond` |

Wirkung: Körperschaden × `1 + 1.5 · w/100`, also bis **×2,5** bei vollem Anlauf.

Zwei Dinge machen daraus eine andere Spielweise als Momentum, obwohl der
Unterbau derselbe ist:

1. **Der Aufbau hängt nicht am Feuern.** Impact lädt allein durch Fahren.
2. **Der Anlauf wird beim Aufprall verbraucht.** Eine volle Ladung hält
   **0,17 s** Dauerkontakt. Wucht ist ein *Rammstoß*, kein Dauerbuff – wer
   Abstand nimmt und neu Anlauf holt, ist der bessere Impact-Spieler.

Punkt 2 ist zugleich der eigentliche One-Shot-Schutz: Er begrenzt, was **ein**
Anlauf insgesamt austeilen kann, statt nur den einzelnen Tick zu deckeln.

## Der One-Shot-Deckel – und warum der Auftrag so nicht erfüllbar war

Der Auftrag verlangte: „Obergrenze so wählen, dass voller Anlauf einen
gleichlevelig-frischen Tank **nie** in einem Kontakt tötet."

**Das ist ohne jede Wucht schon nicht wahr.** Gemessen am unveränderten Stand,
Dauerkontakt bis zum Tod:

| Angreifer | Opfer (dünnster gleicher Stufe) | HP | Schaden/Tick | tot nach |
|---|---|---|---|---|
| Juggernaut | Lancer | 86 | 4,80 | **0,45 s** |
| Fortress | Lancer | 86 | 3,60 | 0,60 s |
| Crusher | Railgun | 92 | 3,36 | 0,70 s |
| Blitz | Railgun | 92 | 2,40 | 0,75 s |
| Rammer | Sniper | 94 | 2,32 | 1,03 s |

Körperschaden fällt bei jedem Tick an, in dem sich zwei Tanks überlappen – bei
40 Hz sind das 93 bis 192 Schaden pro Sekunde. Ein Ramm-Tod in unter einer
Sekunde ist der Normalzustand, nicht etwas, das Wucht einführt.

Ich habe die Forderung deshalb in die stärkste Form übersetzt, die sich
tatsächlich einhalten **und testen** lässt, und sie als Konstante festgeschrieben:

```ts
/** Ein voller Anlauf darf die Zeit bis zum Tod um höchstens ein Viertel verkürzen. */
export const WUCHT_MAX_TTK_GAIN = 0.25;
```

Dazu zwei harte Grenzen im Code:

- **Anteilsdeckel** (`maxContactShare = 0.08`): Ein Kontakttick nimmt nie mehr
  als 8 % des Maximallebens des Opfers – und **nie weniger als den
  Grundschaden**, damit die Signature gegen dicke Gegner kein Malus wird.
- **Anfängerschutz**: Gegen Spieler unter `ROOKIE_PROTECTION_LEVEL` wirkt der
  Aufschlag gar nicht, nicht einmal anteilig.

Die beiden Grenzen greifen genau da, wo sie sollen – die schärfere gewinnt:

| Angreifer | Opfer | Grund/Tick | voll/Tick | Anteil HP | Faktor | TTK ohne | TTK voll | Δ |
|---|---|---|---|---|---|---|---|---|
| Rammer | Sniper | 2,32 | 5,80 | 6,2 % | **2,50×** | 1,03 s | 0,88 s | −15 % |
| Blitz | Railgun | 2,40 | 6,00 | 6,5 % | **2,50×** | 0,75 s | 0,58 s | −23 % |
| Bulwark | Railgun | 2,72 | 6,80 | 7,4 % | **2,50×** | 0,80 s | 0,70 s | −13 % |
| Crusher | Railgun | 3,36 | 7,36 | **8,0 %** | 2,19× | 0,70 s | 0,55 s | −21 % |
| Comet | Lancer | 3,52 | 6,88 | **8,0 %** | 1,95× | 0,50 s | 0,40 s | −20 % |
| Fortress | Lancer | 3,60 | 6,88 | **8,0 %** | 1,91× | 0,60 s | 0,48 s | −21 % |
| Juggernaut | Lancer | 4,80 | 6,88 | **8,0 %** | 1,43× | 0,45 s | 0,40 s | −11 % |

Bei den leichten Rammern bindet der Aufschlag (2,50×), bei den schweren der
Anteilsdeckel (8 %). Der Juggernaut – der gefährlichste Fall aus meiner
KL1-Analyse – bekommt mit 1,43× den kleinsten Faktor von allen. Das ist kein
Zufall, sondern die Absicht hinter dem Anteilsdeckel: Er schützt dünne Opfer vor
schweren Angreifern.

### Kalibriert, nicht geraten

`contactDrainPerSecond` ist gegen `WUCHT_MAX_TTK_GAIN` eingestellt worden:

| Verbrauch | stärkste TTK-Verkürzung |
|---|---|
| 250/s | −50 % |
| 500/s | −27 % |
| **600/s** | **−23 %** ✓ |
| 800/s | −20 % |

600/s hält das Viertel mit Reserve. Ein Test prüft es für **jede** Impact-Klasse
gegen den dünnsten Tank derselben Freischaltstufe – nicht die Formel, sondern
zwei echte Simulationsläufe bis zum Tod des Opfers.

## Gemeinsamer Unterbau

Wie beauftragt teilen sich beide Familien den Code. Neu: `signature.ts` mit
`SIGNATURE_MAX`, dem Zähler je Spiel, der Deckelung, der Rundung in den Snapshot
und dem Aufräumen bei Tod und Familienwechsel. `signature-rapid.ts` ist darauf
umgestellt (13 Tests unverändert grün), `signature-impact.ts` baut darauf auf.

**Eine Falle steckt genau dort:** Beide Schichten laufen gleichzeitig über
dieselben Spieler. Die frühere Rapid-Aufräumlogik hätte als Impact-Schicht das
`signature`-Feld eines Rapid-Spielers gelöscht. Deshalb führt **jede Familie
ihren eigenen Zähler** und räumt nur auf, was sie selbst eingetragen hat
(`if (state.delete(id)) delete player.signature`). Zwei Mutationsproben sichern
das ab – ein gemeinsamer Zähler lässt 13 von 28 Tests fallen.

## Wo die Schicht sitzt

Der Körperschaden entsteht in `resolvePlayerCollisions`, nicht in
`tunedStatsFor`. Die Schicht setzt deshalb an zwei Stellen an:

```ts
internals.resolvePlayerCollisions = (now) => { inBodyContact = true; … };
internals.damagePlayer = (target, damage, attackerId, now) =>
  inBodyContact ? boosted(…) : original(…);
```

Nur Schaden, der **innerhalb** der Kollisionsauflösung entsteht, wird verstärkt.
Projektile, Formen und Umgebungsschaden bleiben unberührt – eine Mutationsprobe
prüft das.

**Bewusst nicht mitgenommen:** Der Ramm-Schaden gegen **Formen** (eigener
Kontaktpunkt in `resolveShapeBodyCollisions`). Er würde Impact still zur besten
Farm-Familie machen; das ist eine Balance-Entscheidung, keine Signature.

**Ohne Wandmechanik**, wie in KL1 empfohlen und von 01 übernommen: `moveCircle`
bleibt unangetastet.

## Bots – geprüft, Regel nicht nötig

Der Auftrag sagte „prüfen, ob die bestehende Bewegung reicht". Sie reicht.

| | Ø Wucht | schwächster Bot | über Bewegungsschwelle |
|---|---|---|---|
| Impact-Bots (8 × Juggernaut, 180 s, 4 Läufe) | **87,4** | 79,3 | 83 % |
| Vergleichsmensch (fährt dauerhaft) | 95,9 | – | – |

Impact-Bots liegen mit 87,4 deutlich besser als Rapid-Bots vor ihrer Regel
(80,4) – Wucht braucht die Feuertaste nicht, nur Fahrt. Der strukturelle Grund
ist nachprüfbar: Die einzige Stelle, an der die Bot-Steuerung bewusst stehen
bleibt, ist die Reparatur-Pause – und `BOT_LOADOUTS.brawler` ist `repulse`,
nicht `repair`. Die Auslösebedingung der Rapid-Regel existiert für Impact-Bots
schlicht nicht.

**Keine Regel gebaut.** Eine Bot-Verhaltensänderung ohne Problem dahinter wäre
Ballast.

## Tests

**15 neu / 515 gesamt**, alle deterministisch (Bewegung, Kollision und
Schadensrechnung sind zufallsfrei).

Drei Testfehler beim ersten Durchlauf, alle mit echter Ursache:

1. **Der Deckel-Test riss scheinbar** (−56 % statt −23 %). Ursache: Das Opfer
   parkte während der zehn Sekunden Anlauf in der Arena und nahm **Formschaden**
   – es ging angeschlagen in den Ramm-Vergleich. Jetzt wird es im Anlauf jeden
   Tick geheilt.
2. **Der Verbrauchs-Test erwartete 14,25, bekam 15.** Meine Erwartung war
   falsch: Der Aufbau desselben Ticks fällt weg, weil der Zähler schon am Deckel
   stand.
3. **Der Aufräum-Test fand nach dem Tod kein Momentum mehr.** Ursache: Der
   Auto-Respawn stuft die Klasse über `classAvailableAtLevel` auf das
   Respawn-Level herunter – aus dem Juggernaut wurde ein Core. Der Test setzt
   die Klasse jetzt bewusst zurück.

Vierzehn Mutationsproben. **Drei überlebten zuerst** – eine war eine untaugliche
Mutation von mir, zwei waren echte Testlücken:

- *„Verbrauch je Opfer statt je Tick"*: Ohne das Leeren der Trefferliste zöge
  ein einziger Kontakt die Ladung **dauerhaft** ab. Mein Test prüfte nur einen
  Tick. Neuer Test: nach dem Kontakt lädt der Anlauf wieder auf.
- *„auch Nicht-Kontaktschaden wird verstärkt"*: Mein erster Versuch nutzte
  10 Schaden – der lag über dem Anteilsdeckel, der Aufschlag verschwand also
  ohnehin. Mit 2 Schaden greift die Probe.

| Mutation | gefangen |
|---|---|
| Wucht wirkt gar nicht | 1 Test |
| Anteilsdeckel fehlt | 2 Tests |
| Deckel senkt unter den Grundschaden | 1 Test |
| Anfängerschutz ignoriert | 1 Test |
| kein Verbrauch beim Aufprall | 3 Tests |
| Verbrauch je Opfer statt je Tick | 1 Test |
| Aufbau hängt fälschlich am Feuern | 9 Tests |
| Stand baut nicht ab | 1 Test |
| Schicht ohne Flag aktiv | 1 Test |
| auch Nicht-Kontaktschaden verstärkt | 1 Test |
| Deckel bei 100 fehlt (Unterbau) | 12 Tests |
| Familien räumen sich gegenseitig auf | 3 Tests |
| Tod setzt nicht zurück | 2 Tests |
| Schichten teilen sich einen Zähler | 13 Tests |

## Geänderte Dateien

| Datei | Was |
|---|---|
| `apps/server/src/signature.ts` | **neu** – gemeinsamer Unterbau beider Signatures |
| `apps/server/src/signature-impact.ts` | **neu** – Wucht, Deckel, Kontaktverbrauch |
| `apps/server/src/signature-impact.test.ts` | **neu** – 15 Tests |
| `apps/server/src/signature-rapid.ts` | auf den gemeinsamen Unterbau umgestellt |
| `apps/server/src/index.ts` | `SIGNATURE_IMPACT_ENABLED`, Schicht in die Kette |
| `scripts/balance-report.mjs` | Wucht-Block analog zum Momentum-Block |
| `docs/CLIENT_PREDICTION.md` | Abschnitt 7: was der Client spiegeln muss |
| `README.md` | Flag und Mechanik dokumentiert |

## Von 01 gebraucht

### 1. Nichts zwingend

`PlayerSnapshot.signature` trägt jetzt beide Familien. Kein Shared-Bedarf, keine
Protokolländerung, Deltas und Kurz-IDs brauchen nichts Neues.

### 2. Eine Entscheidung

**Bleibt es bei „höchstens ein Viertel schneller tot"?** `WUCHT_MAX_TTK_GAIN`
ist meine Übersetzung der ursprünglichen Forderung, nicht deine. Wenn dir das zu
viel ist: `contactDrainPerSecond: 800` bringt es auf −20 %, `1000` auf unter
−17 %. Eine Zahl, der Test zieht automatisch nach.

### 3. Zur Kenntnis: was ich bewusst weggelassen habe

- **Ramm-Schaden gegen Formen** bleibt unverstärkt (Begründung oben).
- **Wandmechanik** wie vereinbart nicht angefasst.

### 4. Für 03

`docs/CLIENT_PREDICTION.md` Abschnitt 7. Wichtigster Punkt: Der
**Kontaktverbrauch lässt sich clientseitig nicht vorhersagen** – ob ein Kontakt
Schaden gemacht hat, entscheidet der Server (Unverwundbarkeit, Anfängerschutz).
Der Balken folgt hier dem Serverwert, statt ihn zu raten. Der Aufbau dagegen ist
sauber nachrechenbar – und **ohne** die `primary`-Bedingung aus der
Momentum-Rechnung.

## Abweichungen vom Auftrag

1. **„Tötet nie in einem Kontakt" ist durch `WUCHT_MAX_TTK_GAIN = 0.25`
   ersetzt.** Begründung samt Messreihe oben – die wörtliche Forderung ist ohne
   Wucht bereits verletzt.
2. **Keine Bot-Regel**, weil die Messung keine braucht (87,4/100).
3. **Formschaden ausgenommen.**

# MAZERS – Ultramasterplan v4: „Das nächste Level"

Stand: 2026-08-05. Live auf https://www.mazers.de (Railway, Auto-Deploy von
`main`). Arbeitsmodell und eiserne Regeln: [`TEAMPLAN.md`](TEAMPLAN.md) –
dieser Plan setzt darauf auf und ersetzt die dortige Roadmap.

**Nordstern:** MAZERS läuft überall flüssig und sauber (auch auf älteren PCs
und auf dem Handy), fühlt sich in jeder Sekunde direkt an, und die Wahl der
Klasse verändert wirklich, WIE man spielt – nicht nur Zahlen.

---

## Leitplanken (gelten für jedes einzelne Paket)

1. **Performance ist ein Feature.** Zielwert: 60 FPS stabil auf einem fünf
   Jahre alten Laptop, keine Frame-Hänger über 100 ms. Jedes Grafik-Paket
   nennt seine Kosten (Partikel, Draw-Calls) und respektiert die
   Qualitätsstufen (R4). Im Zweifel gewinnt Flüssigkeit gegen Schönheit.
2. **Der Server bleibt autoritativ.** Feel-Verbesserungen (Prediction,
   Sofort-Turm) ändern nie, was wirklich passiert – nur, wann man es sieht.
3. **Feature-Flags, Tests, Statusblöcke** wie im Teamplan. Kein Paket ohne
   grünes `npm run check`, kein Merge ohne Basis `origin/main`.
4. **Sam ist die Messlatte.** Jede Phase endet mit seinem Live-Test; sein
   Urteil („fühlt sich X % richtig an") steuert die nächste Runde nach.

---

## Design-Richtung (verbindlich, Stand 2026-08-06 abends)

**Der Grundlook ist der dunkle Stand, wie er vor dem Diep-Umbau war.** Sam hat
den hellen Diep-Look live gesehen und verworfen („das ist kake, zurück zum
alten"); 01 hat ihn am 06.08. zurückgebaut (Revert von `77f8a3f`, Look-Stand
entspricht `d8568b6`).

- **UI:** `:root` ist dunkel (`color-scheme:dark`, `--bg:#151a26`,
  `--text:#e8ebf3`, Akzent `#6f7ad6`). Die Wahl-Themes void/neon/classic
  bleiben wie sie sind.
- **Arena:** dunkler Boden mit dezentem Gitter, Außenbereich abgesetzt; keine
  abgedunkelten Konturen an allen Spielobjekten mehr (der `STYLE`-Block und
  `darken()` sind mit dem Revert verschwunden).

**Was das nicht heißt:** „dark & moody" ist weiterhin nicht das Ziel. Der
Merksatz bleibt **ruhig und minimalistisch JA, düster NEIN** – Sam hat auf dem
Weg hierher einmal „zu düster, so will ich das gar nicht" gesagt, und der
Grundton wurde daraufhin eine Stufe angehoben. Genau dieser angehobene dunkle
Stand ist jetzt die Basis.

**Historie, damit niemand im Kreis läuft:** „Neon raus" → „zu düster"
(Grundton angehoben) → Paletten- und Stilrunden → Diep-Basis hell (12
Varianten, von Sam abgenommen) → **live verworfen, zurückgebaut**. Ein
erneuter Vorstoß Richtung hell braucht mehr als eine Screenshot-Runde am
Standbild; der helle Look sah in der Vorschau gut aus und im Spiel nicht.

Design-Änderungen am Grundlook weiterhin nur nach Screenshot-Freigabe durch
Sam.

## Klassen-Identität (verbindlich, Sams Vorgabe vom 06.08.)

> *„Mir ist extrem wichtig, dass die Tanks wirklich unique Designs haben und man
> ALLE voneinander unterscheiden kann und alle irgendwie irgendwo special sind."*

Das ist keine Politur, sondern eine Abnahmebedingung. **Alle 29 Klassen** – nicht
die auffälligen, nicht die Endklassen, alle.

**Der Ist-Stand, belegt an den Vorschaubildern vom 06.08.:**

- Sieben Impact-Klassen (Impact, Crusher, Bulwark, Juggernaut, Fortress, Blitz,
  Comet) tragen **überhaupt kein Rohr** und sind als Silhouette identisch.
- Die Rapid-Linie unterscheidet sich allein in der Zahl der Rohre.
- Control allein in der Zahl der Drohnen.
- Von 29 Klassen sticht genau eine heraus (Octo).

**Zwei Anforderungen, beide sind zu erfüllen:**

1. **Unterscheidbar.** Jede Klasse ist an ihrem *Umriss* erkennbar – ohne Farbe,
   ohne Beschriftung, in Spielgröße. Formsprache statt Farbcode: andere
   Grundkörper, Panzerplatten, Stacheln, Schilde, Kufen, Aufbauten.
2. **Special.** Jede Klasse hat mindestens ein Merkmal, das nur sie hat – ein
   Element, das man beschreiben kann, ohne Zahlen zu nennen. Ein Tank, der sich
   nur in Werten von seinem Nachbarn unterscheidet, ist nicht fertig.

**Abnahme: der Blindtest.** Alle 29 Silhouetten auf einem Blatt, ohne Namen,
ohne Farbe. Wer zwei nicht auseinanderhalten kann, hat einen Befund. Das Blatt
gehört in den Statusbericht – Behauptungen zählen hier nicht, Bilder schon.

**Reihenfolge:** Silhouetten vor Rad (KL3), vor Balance (KL5). Ein sichtbarer
Klassenbaum, der 29-mal denselben Kreis zeigt, erklärt nichts, und eine
Balance-Runde über Klassen, die sich gleich anfühlen, misst das falsche
Problem.

## KLASSEN 4.0 – „Jeder Tank ein Charakter" (v5-Kern, Sams Direktauftrag 06.08. nachts)

Sam, wörtlich: mehr Auswahl schon bei der ersten Klasse · mehr als drei Stufen
nach oben · mehr Level · jeder Tank sein eigener Spielstil · besser
ausbalanciert · überall ein Bild vom Tank statt Name+Beschreibung · die
Wahl-UI beim ersten Level-Up ist ultrakacke. **Umsetzung durch 01 selbst, in
Wellen, ohne Umweg über die Arbeits-Chats.** Die Chats 02/03/04 sind
angehalten, bis 01 sie wieder einbindet.

### Progression (Welle A)

| | vorher | **jetzt** |
|---|---|---|
| Max-Level | 45 | **60** |
| Wahlstufen | 10 / 24 / 38 | **5 / 15 / 28 / 42** (vier statt drei, erste nach ~2 Minuten) |
| Upgrade-Cap je Slot | 8 | **10** |
| Basis-Slots | 8 | **10** (+ Reichweite `projectileRange` +6 %/P · + Fähigkeit `moduleCooldown` −5 %/P auf Modul-Abklingzeit) |
| Slots gesamt | 10 | **12** (10 Basis + 2 Familie) |

Wire-Regel wie bei KL4: neue IDs werden **angehängt**, die bestehenden Indizes
bleiben. `availableClassChoices` lernt Apex-Klassen (`apexOf`-Feld): erreichbar
aus **jeder** Klasse der Familie ab L42, nicht nur aus einem Pfad.

### Der Baum: 6 Familien, 45 Klassen (Welle A)

Erste Wahl auf **Level 5 zwischen sechs Familien**:

| Familie | Signature | Spielstil | Warum Spam verliert |
|---|---|---|---|
| RAPID | Momentum | Druck in Bewegung | Stillstand baut ab |
| PRECISION | Ladeschuss | der eine perfekte Treffer | Klick-Spam = Schwachschüsse |
| CONTROL | Einheiten-Budget | dirigieren statt klicken | Stärke liegt im Management |
| IMPACT | Wucht | Anlauf und Aufprall | ohne Bewegung keine Wucht |
| **SPECTER (neu)** | **Tarnung** – nicht schießen baut Tarnung auf (bis ~85 % unsichtbar), der Erstschlag aus voller Tarnung trägt Bonus; jeder Schuss enttarnt | Hinterhalt, Winkel, Geduld | Dauerfeuer = dauerhaft sichtbar |
| **TEMPEST (neu)** | **Hitze** – Feuern heizt auf (+Schaden bis +40 %), bei 100 Überhitzung: 1,2 s Zwangspause | Burst-Fenster, Risikomanagement | Dauerfeuer bestraft sich selbst |

Struktur je Familie: Starter (L5) → 2 Wege (L15) → 2 Wege (L28) → **Apex (L42)**.
Bestand: 29 Klassen behalten Namen, Familien und Eltern; nur die Stufen wandern
(10→5, 24→15, 38→28). Neu: 4 Apex für die Altfamilien (**Vortex** rapid ·
**Eclipse** precision · **Sovereign** control · **Leviathan** impact) und zwei
komplette Linien: **Specter → Wraith/Shade → Mirage/Revenant → Eidolon** und
**Tempest → Scorch/Surge → Inferno/Overload → Cataclysm**. Gesamt **45**.

### Perks – jede Klasse ihr Alleinstellungsmerkmal (Welle B)

Ab L15 trägt jede Klasse genau **einen benannten Perk** aus einem Baukasten von
~14 Mechaniken (Ricochet, Splitter beim Kill, Vollstrecker, Blutpanzer, Dornen,
Schildring, Doppelschlag, Drohnen-Nova, Sprengfalle beim Dash, Adrenalin,
Frostschuss, …), parametrisiert je Klasse. Der Perk steht auf der Wahlkarte und
im Rad. Datenhaltung in shared, Umsetzung als eine `tunePerks`-Schicht.

### Sichtbarkeit (Welle B)

Rumpf-Geometrie wandert nach shared: **eine Quelle** für Renderer, Wahlkarte,
Rad, Death-Screen. Jede Klasse erhält ihren eigenen Umriss (Familien-Grundform
+ Stufen-Aufbauten + Klassen-Merkmal); Abnahme bleibt der Blindtest über alle
45. Tank-Bild überall, wo eine Klasse benannt wird.

### Wahl-UI (Welle B)

Der L5-Moment wird eine bewusste Wahl: großformatige Karten mit Bild,
Signature-Satz, Perk-Zeile und „führt zu →", Grid sitzt auf allen
Prüfstand-Formaten inkl. Touch. Das Spiel pausiert nicht.

### Balance (Welle C)

Neue Klassen aus Familien-Basiskurven abgeleitet; Messung mit `--seed` +
`--start-level`, Dominanzprüfung, eingefrorener Abzug. Sams Live-Urteil
steuert die Zahlenrunde.

## Handlungsfeld 1 – Überall sauber: Responsive & Performance

**Ist:** Fullscreen-Wechsel buggy, Artefakte/Striche an den Rändern großer
Bildschirme, Mobile unsauber, Verhalten auf älteren PCs unbekannt.

**Soll:** Ein Layout, das von 360×640 (Handy quer) bis Ultrawide sitzt.
Fullscreen rein/raus nahtlos. Drei Qualitätsstufen mit Auto-Erkennung.

| # | Maßnahme | Wer |
|---|---|---|
| R1 | **Viewport-Härtung:** auf `fullscreenchange`, `orientationchange`, `visualViewport.resize` und devicePixelRatio-Wechsel reagieren; Renderer-Auflösung/Maske/Letterbox neu rechnen. Ränder-Artefakte beheben. | 03 |
| R2 | **Letterbox & Skalierung:** feste 16:9-Sicht bleibt (Fairness), aber die Flächen außerhalb werden gestaltete Ruhe statt Striche; HUD skaliert mit `clamp()`-Typo statt fixer Pixel. | 03 |
| R3 | **Mobile-Pass** (Detail-Spezifikation unten), Ziel „ultra clean – macht auf dem Handy wirklich Spaß". | 03 |
| R4 | **Qualitätsstufen:** hoch/mittel/niedrig (Partikelmenge, Glow, Antialias, Auflösungs-Cap). Auto: Start auf „mittel", nach 10 s FPS-Messung hoch- oder runterstufen; manuell im Startscreen wählbar. | 03 |
| R5 | **Client-Perf-Telemetrie:** anonymes FPS-/Geräteklassen-Sampling an den Server (`/metrics`-Erweiterung), damit wir „läuft auf alten PCs" messen statt glauben. | 04 |

### R3 im Detail – Mobile-Spezifikation

Befund (Sams iPhone-Screenshot, 2026-08-05): Spielfeld lag fast vollständig
unter dem Bildschirmrand (Viewport-Bug, von 01 behoben: visualViewport +
100dvh + viewport-fit=cover), darüber stapelten sich acht HUD-Elemente.

**Grundsatz: Auf dem Handy ist das Spielfeld der Star.** Maximal 4 Elemente
gleichzeitig sichtbar:

1. **Links unten:** Move-Stick · **Rechts unten:** Aim-Stick (beide größer
   als heute, Daumenzonen-Ergonomie, `env(safe-area-inset-*)`).
2. **Oben links, EINE kompakte Leiste** statt Panel: Level + HP-Balken +
   XP-Strich, halbtransparent, max. 44 px hoch. Kein Name, kein K/D, kein
   Score im Dauer-HUD (steht alles im Death-Screen).
3. **Rechts über dem Aim-Stick:** Modul-Knopf (DASH/…) + AUTO-Knopf,
   übereinander, einheitliche Größe. REPEL in den Aim-Stick integrieren
   (zweiter Finger/Doppeltipp) oder als dritter Knopf im selben Stapel.
4. **Ereignisse** (Event-Banner, Bounty, Achievements, Killfeed): EIN
   gemeinsamer Meldungs-Slot oben Mitte, eine Meldung zur Zeit, kurz.

**Gestrichen auf Mobile:** Bestenliste (bereits raus), Ping-Pill (bereits
raus), Minimap (optional per Tipp auf die Statusleiste einblendbar),
Dauer-Killfeed. Upgrades: kompaktes Bottom-Sheet statt seitlicher Liste,
öffnet über Punkte-Badge an der Statusleiste, pausiert nie das Spiel.

**Pflicht-Tests** (gehören in den Report): iPhone Safari quer (mit UND ohne
eingeblendete Leisten), Android Chrome quer, Tablet; Rotation während des
Spiels; Rückkehr aus dem App-Switcher. Null überlappende Elemente, Spielfeld
immer vollständig sichtbar, alle Knöpfe mit dem Daumen erreichbar.

## Handlungsfeld 2 – Pacing: Stress raus, Kontrolle rein

**Ist:** Dauerbeschuss, kaum Verschnaufpausen, Regeneration zu langsam,
Zwangs-Respawn nach 7 s. Überleben fühlt sich unmöglich an.

**Soll:** Kämpfe sind Entscheidungen. Rückzug lohnt sich. Wer farmen will,
findet Räume dafür.

| # | Maßnahme | Wer | Status |
|---|---|---|---|
| P0 | **Sofort-Paket:** Population 8/−1/min 3 statt 11/−2/min 4 · Chill-Regeneration (nach 3,5 s ohne Treffer Ramp auf +4 % Max-HP/s) · kein Zwangs-Respawn für Menschen · „ZUM STARTSCREEN"-Knopf im Death-Screen | 01 | ✅ umgesetzt |
| P1 | **Bot-Aggro-Pacing:** Disengage nach Kill, Jagd-Timeout, harter 2-Angreifer-Deckel, Farmer 40 %. Gemessen: Zeit unter Beschuss −35…−69 %, Ruhe nach Respawn 0,4 → 7,8 s. | 02 | ✅ umgesetzt |
| P2 | **Feintuning mit Telemetrie:** Überlebenszeiten & Kampfdichte aus `/metrics` auswerten, Werte nachziehen. | 02+04 | nach P1 |

## Handlungsfeld 3 – Lesbarkeit: Fähigkeiten müssen nach Absicht aussehen

**Ist:** Ein Dash von Gegnern sieht aus wie ein Teleport-Bug.

**Soll:** Jede Fähigkeit ist in einer Zehntelsekunde als Fähigkeit erkennbar.

| # | Maßnahme | Wer |
|---|---|---|
| F1 | **Dash-VFX:** Bewegungs-Trail + 2–3 Nachbilder + kurze Streckung des Tanks in Bewegungsrichtung + Ankunfts-Staubpuff. Gilt für ALLE (auch Bots); `moduleActiveUntil`/`activeModule` stehen im Snapshot. Dazu: Repulse-Druckring, Barrier-Frontschild sichtbar, Repair-Aura. | 03 |
| F2 | Falls dafür Zusatzfelder nötig werden (z. B. Dash-Richtung): Wire-Erweiterung. | 01 |

## Handlungsfeld 4 – Konto & Profil

**Ist:** Google-Login steht, aber es gibt keinen Ort für „mich".
Death-Flow zwang zurück in die Arena (P0 behoben).

**Soll:** Profil-Tab auf dem Startscreen: Avatar/Name von Google, Anzeigename
ändern, Bestwerte, Achievements-Galerie (Katalog existiert), Lieblingsklasse.

| # | Maßnahme | Wer |
|---|---|---|
| K1 | **Profil-Backend:** `POST /profile` (Token-verifiziert, Anzeigename ändern, Rate-Limit, Sanitizing); `GET /profile/:id` um Lieblingsklasse/Spielzeit erweitern. | 04 |
| K2 | **Profil-Tab UI:** eigener Tab/Panel auf dem Startscreen (angemeldet: Profilkarte + Achievements-Raster + Bestwerte; Gast: dezenter Hinweis auf Login). | 03 |
| K3 | Shared-Typen für Profil-Antworten. | 01 |

## Handlungsfeld 5 – Klassen 3.0: Spielstil statt Statistik (das Herzstück)

**Ist (ehrlich benannt):** Es gibt 29 Klassen in 4 Familien und 8
Upgrade-Werte – aber sie FÜHLEN sich gleich an. Alle schießen, Spam gewinnt
überall, Unterschiede sind Zahlen statt Verhalten. Sams Eindruck („gefühlt 4
Klassen, 3 Upgrades") ist das eigentliche Messergebnis.

**Soll:** Familie = Spielstil. Wer die Klasse wechselt, spielt ein anderes
Spiel. Spam ist nie die beste Strategie.

### Design: Signature-Mechaniken je Familie (Anti-Spam eingebaut)

| Familie | Signature | Spielgefühl | Warum Spam verliert |
|---|---|---|---|
| **RAPID** | **Momentum** – Feuern in Bewegung baut Momentum auf (Feuerrate steigt bis +X %), Stillstand baut ab | Druck machen, strafen, nie stehen bleiben | Wer campt und hält, feuert langsamer als wer sich bewegt |
| **PRECISION** | **Ladeschuss** – Halten lädt den Schuss auf (Schaden/Tempo/Größe ×), Sofortklick = schwacher Schuss | Timing, Positionsspiel, der eine perfekte Treffer | Klick-Spam produziert nur Schwachschüsse |
| **CONTROL** | **Einheiten-Budget** – Drohnen und neue Deployables (Mini-Turm, Verlangsamungsfeld) teilen ein Budget; Umschichten im Kampf | Gebiet vorbereiten, Werkzeuge dirigieren | Die Stärke liegt im Management, nicht im Klicken |
| **IMPACT** | **Wucht** – Körperschaden und Fähigkeiten skalieren mit Anlaufstrecke; neue Charge-Angriffe | Nahkampf-Tempo, Anlauf nehmen, Wände nutzen | Ohne Bewegung keine Wucht |

### Upgrades 2.0

Die 8 Basis-Werte bleiben. Dazu bekommt **jede Familie 2 familienspezifische
Upgrade-Werte** (Rapid: Momentum-Aufbau / Momentum-Maximum · Precision:
Ladetempo / Ladebonus · Control: Budget / Einheitenstärke · Impact:
Wucht-Skalierung / Charge-Abklingzeit). Damit unterscheiden sich Builds
sichtbar – zwei Gatlings mit anderen Schwerpunkten spielen sich anders.

### „Das Rad" – der sichtbare Klassenbaum

In-Game-Overlay (Taste `C` / Button) und Startscreen-Enzyklopädie: der
komplette Baum als Rad – Mitte Core, Ring 1 die vier Familien (Lvl 10),
Ring 2 (Lvl 24), Ring 3 die Endklassen. Eigener Pfad hervorgehoben, jede
Klasse mit Ein-Satz-Spielstil, Signature-Anzeige und „führt zu → X/Y/Z".
Nie wieder blind wählen.

### Reihenfolge

| # | Paket | Wer |
|---|---|---|
| KL1 | Design-Feinschliff auf Basis dieses Kapitels; 02 liefert Machbarkeits-/Aufwandskommentar je Signature | 01+02 |
| KL2 | Signature-Mechaniken hinter Flag, **eine Familie nach der anderen** – Reihenfolge nach 02s Machbarkeitsanalyse (KL1): **Rapid → Impact → Precision (nach N2) → Control**. Gemeinsames Snapshot-Feld `signature` (0–100) liegt in shared. | 02 |
| KL3 | Rad-UI (Overlay + Startscreen) | 03 |
| KL4 | Familien-Upgrades (Protokoll/shared 01, Server 02, UI 03) | alle |
| KL5 | Balance-Runde mit Telemetrie (Pickraten, K/D, Überlebenszeit je Klasse) | 02+04 |

## Handlungsfeld 6 – Flüssigkeit: Netz & Prediction

**Ist:** Eigene Bewegung reagiert eine Netzrunde verzögert (Turm-Sofortdreh
ist schon da). Deltas + Kurz-IDs live (−45 % Traffic).

**Soll:** Eingabe fühlt sich lokal an, bei jeder Latenz.

| # | Maßnahme | Wer | Status |
|---|---|---|---|
| N1 | Input-Ack (`lastProcessedInput` je Empfänger) + exakte Bewegungs-Doku | 02 | beauftragt |
| N2 | Client-Prediction + Reconciliation für den eigenen Tank, Flag `CLIENT_PREDICTION` | 03 | nach N1 |
| N3 | Review-Schwerpunkt: Server- und Client-Bewegung dürfen nicht divergieren (Ruckel-Gefahr) | 01 | laufend |

---

## Phasenplan

**Phase 0 – HEUTE (01):** P0-Sofortpaket ✅ (dieser Push)

**Phase 1 – „Sauber & Flüssig"** (parallel, je Chat der Reihe nach):
- **02:** N1 Input-Ack (läuft) → P1 Bot-Aggro-Pacing → KL1-Kommentar
- **03:** „Ruhe & Gewicht" + Spectator-Kamera (läuft) → R1–R4 Responsive/Qualität → F1 Dash-VFX → N2 Prediction
- **04:** K1 Profil-Backend → R5 Perf-Telemetrie

**Phase 2 – „Klassen 3.0":** KL1 → KL2 (familienweise) + KL3 parallel → KL4 → KL5.
Startet, sobald Phase 1 bei 02 und 03 zur Hälfte durch ist.

**Phase 3 – „Meta & Politur":** K2 Profil-Tab, `SPECTATOR_ENABLED=true`,
Achievements-Galerie, Onboarding-Feinschliff, Startzeit-Optimierung.

## Messlatte (woran wir „nächstes Level" festmachen)

- FPS-p95 ≥ 55 auf dem Referenz-Altgerät, keine Hänger > 100 ms (R5 misst es)
- Fullscreen/Resize/Rotation: null sichtbare Artefakte auf 5 Testformaten
- Sam überlebt entspannte Runs > 4 Minuten und NENNT es entspannt
- Jede Familie ist im Blindtest am Spielgefühl erkennbar
- Death-Screen: beide Wege (Respawn / Startscreen) fühlen sich gewollt an
- 0 bekannte P0/P1-Bugs vor jedem Phasenwechsel

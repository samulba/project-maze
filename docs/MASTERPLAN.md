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

## Handlungsfeld 1 – Überall sauber: Responsive & Performance

**Ist:** Fullscreen-Wechsel buggy, Artefakte/Striche an den Rändern großer
Bildschirme, Mobile unsauber, Verhalten auf älteren PCs unbekannt.

**Soll:** Ein Layout, das von 360×640 (Handy quer) bis Ultrawide sitzt.
Fullscreen rein/raus nahtlos. Drei Qualitätsstufen mit Auto-Erkennung.

| # | Maßnahme | Wer |
|---|---|---|
| R1 | **Viewport-Härtung:** auf `fullscreenchange`, `orientationchange`, `visualViewport.resize` und devicePixelRatio-Wechsel reagieren; Renderer-Auflösung/Maske/Letterbox neu rechnen. Ränder-Artefakte beheben. | 03 |
| R2 | **Letterbox & Skalierung:** feste 16:9-Sicht bleibt (Fairness), aber die Flächen außerhalb werden gestaltete Ruhe statt Striche; HUD skaliert mit `clamp()`-Typo statt fixer Pixel. | 03 |
| R3 | **Mobile-Pass:** Touch-Layout neu (Sticks, Buttons, Safe-Areas/Notch, Panels), Ziel „ultra clean". | 03 |
| R4 | **Qualitätsstufen:** hoch/mittel/niedrig (Partikelmenge, Glow, Antialias, Auflösungs-Cap). Auto: Start auf „mittel", nach 10 s FPS-Messung hoch- oder runterstufen; manuell im Startscreen wählbar. | 03 |
| R5 | **Client-Perf-Telemetrie:** anonymes FPS-/Geräteklassen-Sampling an den Server (`/metrics`-Erweiterung), damit wir „läuft auf alten PCs" messen statt glauben. | 04 |

## Handlungsfeld 2 – Pacing: Stress raus, Kontrolle rein

**Ist:** Dauerbeschuss, kaum Verschnaufpausen, Regeneration zu langsam,
Zwangs-Respawn nach 7 s. Überleben fühlt sich unmöglich an.

**Soll:** Kämpfe sind Entscheidungen. Rückzug lohnt sich. Wer farmen will,
findet Räume dafür.

| # | Maßnahme | Wer | Status |
|---|---|---|---|
| P0 | **Sofort-Paket:** Population 8/−1/min 3 statt 11/−2/min 4 · Chill-Regeneration (nach 3,5 s ohne Treffer Ramp auf +4 % Max-HP/s) · kein Zwangs-Respawn für Menschen · „ZUM STARTSCREEN"-Knopf im Death-Screen | 01 | ✅ umgesetzt |
| P1 | **Bot-Aggro-Pacing:** Bots lassen nach einem Kill ab (Disengage-Fenster), Jagd-Timeout (wer entkommt, ist entkommen), maximal N gleichzeitige Angreifer auf denselben Menschen (Anti-Gang-up verschärfen), größerer Farmer-Anteil in der Stil-Verteilung. | 02 | offen |
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
| KL2 | Signature-Mechaniken hinter Flag, **eine Familie nach der anderen** (Rapid → Precision → Impact → Control), jede einzeln live testbar | 02 |
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

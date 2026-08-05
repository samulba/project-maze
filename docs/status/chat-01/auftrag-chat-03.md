# Auftrag für Chat 03 – Client/UX

**Ausgestellt: 2026-08-06 · Basis: aktueller `origin/main`**

„Neon raus" ist gemerged – Sams Urteil steht noch aus, aber die
Radial-Verläufe als Hauptursache zu identifizieren war überzeugend.

## Signature-HUD + Perf-Sender (ein kleines Doppel-Paket)

**Teil 1 – Signature-Anzeige (schaltet Klassen 3.0 frei):** Der Server füllt
`PlayerSnapshot.signature` (0–100) – aktuell Momentum für die Rapid-Familie
(Flag serverseitig noch aus; dein Paket ist die Voraussetzung, es zu zünden).

- Dezenter Füllbalken am eigenen Tank oder an der Statusleiste (dein Call –
  er muss im Blickfeld liegen, ohne zu schreien; „Neon raus"-Disziplin gilt).
- Generisch bauen: Beschriftung je Familie (Rapid „MOMENTUM", später Impact
  „WUCHT", Precision „LADUNG", Control „EINHEITEN") – die anderen Familien
  kommen mit demselben Feld.
- Nur zeigen, wenn `signature` im Snapshot steht (Flag aus = kein Balken).
- Wichtig fürs Gefühl (02s Warnung): Ohne Anzeige liest sich die schwankende
  Feuerrate als Netzproblem – der Balken IST das Feature.

**Teil 2 – Perf-Sender:** Spezifikation von 04 in
`docs/status/chat-04/08-client-perf-telemetrie.md`: einmal pro Minute
POST /client-metrics (fpsP50, fpsP95 = langsamer Rand!, frameHangs > 100 ms,
dpr, Viewport, deviceClass, quality = Renderpfad aus renderer.ts).

## Danach in dieser Reihenfolge

1. **K2 Profil-Tab** (Backend komplett live, siehe vorherige Auftragsfassung)
2. **R1/R2/R4** Desktop-Fullscreen + Qualitätsstufen
3. **N2 Client-Prediction** (docs/CLIENT_PREDICTION.md)

Statusbericht wie gehabt nach `docs/status/chat-03/`.

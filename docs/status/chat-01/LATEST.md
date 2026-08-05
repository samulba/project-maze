# Integrationsstand – Chat 01 (Zentrale)

**Stand: 2026-08-05, Abend**

## Zuletzt auf main gemerged

- 03 „Ruhe & Gewicht" (Letterbox-Striche-Fix, HUD-Entrümpelung, Rückstoß,
  **Spectator-Kamera**, Killcam ausgebaut)
- 02 Input-Quittung (`lastProcessedInput`, Schicht ganz außen)
- Shared dazu: `WorldSnapshot.lastProcessedInput?` (optional statt Pflicht –
  Dutzende Test-Fixtures bauen Snapshot-Literale; der Server setzt es immer,
  der Client liest mit `?? -1`), `ACCELERATION_SCALE` von combat-tuning nach
  shared verlagert (Prediction spiegelt dieselbe Zahl)
- davor heute: Masterplan v4 + Phase 0 (Pacing), Mobile-Viewport-Fix
  (visualViewport/100dvh), Klassen-Balance nach 02s Dämpfer-Analyse

## Flags live (Railway)

`SNAPSHOT_DELTAS=true` · `SHORT_NET_IDS=true` · `ACHIEVEMENTS_ENABLED=true` ·
`AUTH_ENABLED=true` · Rate-Limits/Direktor default-an ·
**`SPECTATOR_ENABLED` → kann jetzt auf `true`** (Client-Kamera ist gemerged)

## Erwartet als Nächstes

- 02: P1 Bot-Aggro-Pacing + KL1-Machbarkeitskommentar (MASTERPLAN Feld 5)
- 03: R3 Mobile-Paket (Spez. im MASTERPLAN) → danach R1/R2/R4 → N2 Prediction
- 04: K1 Profil-Backend → R5 Client-Perf-Telemetrie
- Sam: `SPECTATOR_ENABLED=true` setzen, Mobile + Pacing live testen

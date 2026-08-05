# Integrationsstand – Chat 01 (Zentrale)

**Stand: 2026-08-05, Nacht**

## Zuletzt auf main gemerged

- 02 Aggro-Pacing (Zeit unter Beschuss −35…−69 %, BOT_PACING_ENABLED default an)
  + KL1-Machbarkeitsanalyse → Reihenfolge Rapid → Impact → Precision → Control
- 03 R3 Mobile-Pass (Statusleiste, Aktions-Stapel, Meldungs-Slot, Bottom-Sheet)
- 04 Client-Perf-Telemetrie (POST /client-metrics + /metrics-Export)
- Shared: PlayerSnapshot.signature (0–100, ein Feld für alle vier Signatures)
- davor: Profil-Backend, Ruhe & Gewicht + Spectator-Kamera, Input-Quittung,
  Masterplan v4 + Phase 0, Mobile-Viewport-Fix

## Flags live (Railway)

`SNAPSHOT_DELTAS=true` · `SHORT_NET_IDS=true` · `ACHIEVEMENTS_ENABLED=true` ·
`AUTH_ENABLED=true` · Rate-Limits/Direktor default-an ·
**`SPECTATOR_ENABLED` → kann jetzt auf `true`** (Client-Kamera ist gemerged)

## Erwartet als Nächstes

- 02: P1 Bot-Aggro-Pacing + KL1-Machbarkeitskommentar (MASTERPLAN Feld 5)
- 03: R3 Mobile-Paket (Spez. im MASTERPLAN) → danach R1/R2/R4 → N2 Prediction
- 04: K1 Profil-Backend → R5 Client-Perf-Telemetrie
- Sam: `SPECTATOR_ENABLED=true` setzen, Mobile + Pacing live testen

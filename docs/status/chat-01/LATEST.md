# Integrationsstand – Chat 01 (Zentrale)

**Stand: 2026-08-06**

## Zuletzt auf main gemerged

- 01 **Design-Entscheid „Diep-Basis"**: Standard-Theme hell (Arena `0xcdcdcd`
  + Gitter, Konturen in abgedunkelter Füllfarbe via `STYLE`/`darken()` in
  `renderer.ts`, UI `color-scheme:light`). Verbindlich im MASTERPLAN
  („Design-Richtung") verankert – Grundlook-Änderungen nur nach
  Screenshot-Freigabe durch Sam. Wahl-Themes void/neon/classic unverändert.
- 03 K2 Profil-Tab (Profilkarte, Namensänderung, Achievements-Galerie über
  den ganzen Katalog; ohne Login-Konfiguration existiert das Panel nicht)
- 02 KL2-IMPACT „Wucht" + 03 Signature-HUD
- davor: Momentum, Neon raus, Balance-Live, Aggro-Pacing, R3 Mobile, …

## Flags live (Railway)

`SNAPSHOT_DELTAS=true` · `SHORT_NET_IDS=true` · `ACHIEVEMENTS_ENABLED=true` ·
`AUTH_ENABLED=true` · Rate-Limits/Direktor default-an ·
`SPECTATOR_ENABLED=true` · **`SIGNATURE_RAPID_ENABLED` + `SIGNATURE_IMPACT_ENABLED` → JETZT zündbar (HUD ist da)**

## Erwartet als Nächstes

- 02: KL4-Konzept Familien-Upgrades (Auftrag vom 06.08.); dazu neu:
  Flake-Verdacht in `signature-impact.test.ts` (Details im Auftrag)
- 03: R1/R2/R4 (Fullscreen, Letterbox, Qualitätsstufen) → danach N2
  Prediction; Design-Basis ist ab jetzt der Diep-Look (MASTERPLAN)
- 04: Lastprobe „alle Schalter an" + Balance-Baseline
  `docs/balance/2026-08-06-baseline.json`
- Sam: `SIGNATURE_RAPID_ENABLED=true` + `SIGNATURE_IMPACT_ENABLED=true`
  setzen; Momentum/Wucht/Spectator live beurteilen; neuen Diep-Look auf
  www.mazers.de ansehen

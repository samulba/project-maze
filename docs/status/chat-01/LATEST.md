# Integrationsstand – Chat 01 (Zentrale)

**Stand: 2026-08-06**

## Zuletzt auf main gemerged

- 01 **Design-Entscheid „Diep-Basis"**: Standard-Theme hell (Arena `0xcdcdcd`
  + Gitter, Konturen in abgedunkelter Füllfarbe via `STYLE`/`darken()` in
  `renderer.ts`, UI `color-scheme:light`, selbst Cyan / Gegner Rot).
  Verbindlich im MASTERPLAN („Design-Richtung") – Grundlook-Änderungen nur
  nach Screenshot-Freigabe durch Sam. Wahl-Themes void/neon/classic bleiben
  dunkel. Ein Review-Sweep hat vier Stellen gefunden, die durch den
  Hell-Umbau unlesbar geworden wären (Guardian-Label, Schadens- und
  Belohnungszahlen, Gold-Effekte, Kleinschrift am Startscreen) – alle gefixt.
- 03 **Paket 12 R1/R2/R4**: Vollbild-Knopf, Auflösung folgt jetzt Zoom- und
  Monitorwechsel (die klebte vorher am Startwert), weicher Letterbox-Abschluss
  ohne Rahmenstrich, drei Qualitätsstufen mit Automatik (`localStorage`:
  `project-maze-quality`). Handlungsfeld 1 ist damit client-seitig durch.
- 04 **Paket 10 Lastprobe + Baseline**: Der Lasttest war mit `SHORT_NET_IDS`
  blind (eigene ID aus `welcome` statt aus dem Snapshot) und meldete 0
  Klassenwahlen/0 Upgrades. Nach dem Fix: „alle Schalter an" kostet ~10 % mehr
  Tickzeit und spart 44 % Bandbreite, bei 11 % Auslastung des Tickbudgets.
  Zwei eingefrorene Balance-Abzüge unter `docs/balance/`.
- 02 **Paket 12 KL4-Konzept** (reines Konzept, kein Code): Familien-Upgrades
  als Sockel + Punkte statt als Aufschlag auf einen Festwert.
- davor: K2 Profil-Tab, KL2-IMPACT „Wucht", Signature-HUD, Momentum,
  Balance-Live, Aggro-Pacing, R3 Mobile.

## Flags live (Railway)

`SNAPSHOT_DELTAS=true` · `SHORT_NET_IDS=true` · `ACHIEVEMENTS_ENABLED=true` ·
`AUTH_ENABLED=true` · `SPECTATOR_ENABLED=true` · Rate-Limits/Direktor
default-an · **`SIGNATURE_RAPID_ENABLED` + `SIGNATURE_IMPACT_ENABLED` →
zündbar, HUD ist da** (offen: hat Sam sie gesetzt?)

Kommt als Nächstes dazu: `FAMILY_UPGRADES_ENABLED` (02, Default aus).

## Entscheidungen der Zentrale vom 06.08.

- **KL4 Variante B angenommen:** Der Signature-Festwert wandert in die
  Punkte-Ökonomie (Sockel + Punkte). Ändert rückwirkend, wie sich Rapid und
  Impact ohne Investition anfühlen – bewusst, sonst gibt es kein Fenster
  zwischen „toter Slot" und „zwei Werte multiplizieren sich".
- **Shared-Änderung freigegeben:** `signatureRate` + `signaturePower` werden
  an `UPGRADE_IDS` angehängt; 02 baut sie selbst, die 8 Basis-IDs behalten
  Reihenfolge und Indizes.
- **`tier` als eigenes Perf-Feld** statt kombiniertem Label (03s Vorschlag,
  Kardinalität 4 statt 12). 04 erweitert die Serverseite, 03 zieht nach.

## Erwartet als Nächstes

- **02:** KL4 Server-Seite hinter `FAMILY_UPGRADES_ENABLED` – Familiensperre,
  Skalierung an Momentum und Wucht, Bot-Pfade (Slots auf Position 2 und 4),
  Endlosschleifen-Fix in `spendBotPoints`, Dominanzprüfung im Report
- **03:** N2 Client-Prediction; dazu zwei kleine Zulieferungen (`Digit0` auf
  Index 9, Beschriftung der KL4-Knöpfe, `tier` senden sobald 04 es annimmt)
- **04:** `tier` im Perf-Report erlauben (blockiert 03), danach die
  Balance-Läufe mehrfach fahren statt einmal
- **Sam:** `SIGNATURE_RAPID_ENABLED=true` + `SIGNATURE_IMPACT_ENABLED=true`
  setzen, falls noch nicht; den neuen hellen Look auf www.mazers.de ansehen;
  Momentum, Wucht und Spectator beurteilen

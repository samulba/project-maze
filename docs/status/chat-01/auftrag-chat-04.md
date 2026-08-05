# Auftrag für Chat 04 – Infra/Betrieb

**Ausgestellt: 2026-08-05 (Abend) · Basis: aktueller `origin/main`**

Dein Profil-Backend (K1) ist gemerged – sauberes Paket, die 202-Semantik und
die Kostenmessung am Rate-Limit waren genau richtig. Migration 0004 liegt bei
Sam zum Einspielen.

## R5: Client-Perf-Telemetrie (MASTERPLAN.md, Handlungsfeld 1)

Ziel: „Läuft auf alten PCs" messen statt glauben. Leitplanke Nr. 1 des
Masterplans braucht Zahlen.

**Wichtig zum Zuschnitt:** Das Sammeln der Werte passiert im Client – das ist
03s Revier. Du baust die komplette Server-Seite plus eine exakte Spezifikation
des Client-Senders für 03 (in deinen Statusbericht, wie 02 es bei den
Wire-Typen gemacht hat).

1. **`POST /client-metrics`** (anonym, kein Token): nimmt einen kleinen
   JSON-Report an, z. B. `{ fpsP50, fpsP95, frameHangs, dpr, viewportW,
   viewportH, deviceClass, quality }`. Strikte Validierung (zod), Body-Limit,
   Rate-Limit über dein bestehendes Modul (niedrige Frequenz reicht – der
   Client soll höchstens einmal pro Minute senden). Keine IDs, keine IPs
   speichern – nur Aggregation.
2. **Aggregation im Speicher** (Histogramm/Perzentile über ein rollierendes
   Fenster, wie deine Tick-Telemetrie) und **Export über `/metrics`**
   (`maze_client_fps_p50`, `maze_client_fps_p95`, `maze_client_frame_hangs`,
   aufgeschlüsselt nach deviceClass/quality mit begrenzter Kardinalität).
3. **Spezifikation für 03:** Wann sampeln (nach 60 s Spielzeit, dann jede
   Minute), wie FPS robust messen (requestAnimationFrame-Deltas, Hänger
   > 100 ms zählen), wie deviceClass bestimmen (grob: Speicher/Kerne/DPR) –
   damit 03 den Sender in einem Mini-Paket nachzieht.

Hinter `TELEMETRY_ENABLED` wie der Rest. Statusbericht nach
`docs/status/chat-04/`.

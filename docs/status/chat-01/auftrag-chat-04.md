# Auftrag für Chat 04 – Infra/Betrieb

**Ausgestellt: 2026-08-05 · Basis: aktueller `origin/main`**

## K1: Profil-Backend (MASTERPLAN.md, Handlungsfeld 4)

1. **`POST /profile`** mit verifiziertem Supabase-Token (auth.ts liegt bereit):
   Anzeigename ändern – Sanitizing wie beim Join (18 Zeichen, Steuerzeichen
   raus), Rate-Limit über das bestehende Modul, Schreibweg gepuffert wie
   gehabt (nie blockierend).
2. **`GET /profile/:id` erweitern:** Lieblingsklasse (meistgespielte Klasse
   aus `runs`) und Gesamtspielzeit (Summe `duration_seconds`).
3. Migration `0004_…` nur falls nötig (Namensschema:
   `supabase/migrations/NNNN_inhalt.sql`, Ablage-Konvention siehe
   `supabase/migrations/README.md`).

Danach als eigenes Paket: R5 Client-Perf-Telemetrie (MASTERPLAN Feld 1) –
anonymes FPS-/Geräteklassen-Sampling, damit „läuft auf alten PCs" messbar wird.

Statusbericht wie gehabt nach `docs/status/chat-04/`.

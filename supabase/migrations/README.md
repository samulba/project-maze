# Migrations-Ablage

Supabase bekommt sein Schema über nummerierte SQL-Dateien aus diesem Ordner –
eingespielt von Hand über den SQL Editor (siehe `docs/SUPABASE.md`).

**Konvention:**

- Direkt in `migrations/` liegen Migrationen, die **noch eingespielt werden
  müssen**. Neue Dateien landen immer hier.
- In `applied/` liegen Migrationen, die Sam **bereits erfolgreich eingespielt
  und bestätigt** hat. Verschoben wird erst nach seiner Bestätigung – nie auf
  Verdacht.

Der Inhalt einer Datei ändert sich durch das Verschieben nicht; jede Migration
ist so geschrieben, dass ein versehentlicher zweiter Durchlauf nichts kaputt
macht (`if not exists` / `on conflict do nothing`).

| Nr. | Datei | Status |
| --- | --- | --- |
| 0001 | `applied/20260805120000_create_runs.sql` | eingespielt 2026-08-05 |
| 0002 | `applied/20260805130000_0002_profiles_and_run_user.sql` | eingespielt 2026-08-05 |

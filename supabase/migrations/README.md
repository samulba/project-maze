# Migrations-Ablage

Supabase bekommt sein Schema über nummerierte SQL-Dateien aus diesem Ordner –
eingespielt von Hand über den SQL Editor (siehe `docs/SUPABASE.md`).

**Namensschema:** `<laufende Nummer>_<kurzer Inhalt>.sql`, z. B. `0004_stats.sql`.
Keine Zeitstempel im Namen – die Nummer allein bestimmt die Reihenfolge.

**Ablage-Konvention:**

- Direkt in `migrations/` liegen Migrationen, die **noch eingespielt werden
  müssen**. Neue Dateien landen immer hier.
- In `applied/` liegen Migrationen, die Sam **bereits erfolgreich eingespielt
  und bestätigt** hat. Verschoben wird erst nach seiner Bestätigung – nie auf
  Verdacht.

Der Inhalt einer Datei ändert sich durch das Verschieben nicht; jede Migration
ist so geschrieben, dass ein versehentlicher zweiter Durchlauf nichts kaputt
macht (`if not exists` / `on conflict do nothing`).

**Ob eine Migration wirklich drin ist, muss man nicht raten.** Der Server prüft
das beim Start und schreibt es ins Log (`[supabase] …`) sowie nach `/health`
unter `persistence.schema`. Fehlt etwas, nennt die Meldung die Datei, die es
anlegt. Diese Ablage-Tabelle ist die *Absicht*, `/health` ist der *Stand* – wer
sie auseinanderlaufen sieht, glaubt `/health`.

| Nr. | Datei | Inhalt | Status |
| --- | --- | --- | --- |
| 0001 | `applied/0001_runs.sql` | Tabelle `runs` (Leaderboard) | eingespielt 2026-08-05 |
| 0002 | `applied/0002_profiles.sql` | Tabelle `profiles` + `runs.user_id` | eingespielt 2026-08-05 |
| 0003 | `applied/0003_achievements.sql` | Tabelle `achievements` + View `profile_stats` | eingespielt 2026-08-05 |
| 0004 | `applied/0004_profile_favorite_class.sql` | View `profile_favorite_class` + Lieblingsklasse in `profile_stats` | eingespielt 2026-08-05 |
| 0005 | `0005_sessions.sql` | Tabellen `sessions` + `devices`, Trigger `touch_device`, Views `admin_daily` und `admin_class_daily` (Admin-Portal) | **offen** |

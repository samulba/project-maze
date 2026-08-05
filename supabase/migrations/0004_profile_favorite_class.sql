-- Project Maze / MAZERS – Migration 0004: Lieblingsklasse im Profil
--
-- Voraussetzung: 0001 (runs), 0002 (profiles, runs.user_id), 0003
-- (achievements, View profile_stats).
--
-- Ändert kein Schreibverhalten und keine Tabelle – nur zwei Views. Ohne
-- Supabase-ENV bleibt der Server davon vollständig unberührt.
--
-- Ausführen: Supabase Studio → SQL Editor → Inhalt einfügen → Run.
-- Das Skript ist wiederholbar; ein zweiter Lauf ändert nichts.

-- ---------------------------------------------------------------------------
-- Lieblingsklasse je Konto
--
-- `runs.player_class` ist die Klasse **beim Tod**. Jeder startet als `core`,
-- also sammeln sich dort zwangsläufig die kurzen, frühen Runs. Die häufigste
-- Klasse wäre damit für fast jeden „Core" – als Lieblingsklasse wertlos.
--
-- Deshalb: unter den Klassen, die jemand tatsächlich *gewählt* hat, die
-- häufigste. Nur wer noch nie eine Klasse gewählt hat, bekommt `core`.
-- Bei Gleichstand entscheidet der Klassenname, damit die Anzeige stabil bleibt
-- und nicht zwischen zwei Klassen springt.
-- ---------------------------------------------------------------------------

create or replace view public.profile_favorite_class
  with (security_invoker = true)
  as
select distinct on (user_id)
  user_id,
  player_class                as favorite_class,
  count(*)::int               as favorite_class_runs,
  sum(duration_seconds)       as favorite_class_seconds
from public.runs
where user_id is not null
group by user_id, player_class
order by user_id, (player_class <> 'core') desc, count(*) desc, player_class asc;

comment on view public.profile_favorite_class is
  'Meistgespielte selbst gewählte Klasse je Konto; core nur, wenn nie eine Klasse gewählt wurde.';

revoke all on public.profile_favorite_class from anon, authenticated;
grant select on public.profile_favorite_class to service_role;

-- ---------------------------------------------------------------------------
-- profile_stats um die Lieblingsklasse erweitern
--
-- `create or replace view` darf Spalten nur **anhängen** – die bestehenden
-- elf bleiben deshalb in Name, Reihenfolge und Typ unverändert.
--
-- ACHTUNG bei künftigen Änderungen: Der LEFT JOIN ist nur deshalb harmlos,
-- weil `profile_favorite_class` durch `distinct on (user_id)` **höchstens eine
-- Zeile je Konto** liefert. Gäbe sie mehrere zurück, würde der Join die
-- Run-Zeilen vervielfachen und `runs`, `total_kills` und `total_seconds`
-- stillschweigend zu hoch ausweisen.
-- ---------------------------------------------------------------------------

create or replace view public.profile_stats
  with (security_invoker = true)
  as
select
  r.user_id,
  count(*)::int                        as runs,
  max(r.score)::int                    as best_score,
  max(r.level)::int                    as best_level,
  max(r.kills)::int                    as best_kills,
  max(r.best_streak)::int              as best_streak,
  max(r.duration_seconds)              as longest_run_seconds,
  sum(r.kills)::int                    as total_kills,
  sum(r.duration_seconds)              as total_seconds,
  min(r.created_at)                    as first_run_at,
  max(r.created_at)                    as last_run_at,
  f.favorite_class                     as favorite_class,
  coalesce(f.favorite_class_runs, 0)   as favorite_class_runs,
  coalesce(f.favorite_class_seconds, 0) as favorite_class_seconds
from public.runs r
left join public.profile_favorite_class f on f.user_id = r.user_id
where r.user_id is not null
group by r.user_id, f.favorite_class, f.favorite_class_runs, f.favorite_class_seconds;

comment on view public.profile_stats is
  'Bestleistungen je Konto inklusive Gesamtspielzeit und Lieblingsklasse. Nur Runs mit Konto; Gast-Runs bleiben außen vor.';

revoke all on public.profile_stats from anon, authenticated;
grant select on public.profile_stats to service_role;

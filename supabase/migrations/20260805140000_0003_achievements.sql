-- Project Maze / MAZERS – Migration 0003: Achievements und Profil-Statistik
--
-- Voraussetzung: Migration 0001 (runs) und 0002 (profiles, runs.user_id).
--
-- Wie bei 0002 ändert diese Migration das Verhalten des Servers nicht. Ohne
-- Supabase-ENV bleibt der gesamte Persistenzpfad aus, ohne AUTH_ENABLED gibt es
-- keine verknüpften Konten – und ohne Konto wird hier nichts geschrieben.
--
-- Ausführen: Supabase Studio → SQL Editor → Inhalt einfügen → Run.
-- Oder mit der CLI: supabase db push
-- Das Skript ist wiederholbar; ein zweiter Lauf ändert nichts.

-- ---------------------------------------------------------------------------
-- Freigeschaltete Achievements
--
-- Der zusammengesetzte Primärschlüssel ist zugleich die geforderte
-- Eindeutigkeit: Ein Konto kann ein Achievement genau einmal besitzen. Damit
-- ist ein doppelter Insert kein Fehlerfall, sondern ein No-op (der Server
-- schreibt mit `ignoreDuplicates`).
--
-- Der Schlüssel beginnt mit `user_id`, deshalb bedient er auch die einzige
-- Leseabfrage („alle Achievements dieses Kontos") ohne zusätzlichen Index.
-- ---------------------------------------------------------------------------

create table if not exists public.achievements (
  user_id        uuid        not null references auth.users (id) on delete cascade,
  achievement_id text        not null check (char_length(achievement_id) between 1 and 64),
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

comment on table public.achievements is
  'Freigeschaltete Achievements je Konto. Der Katalog selbst lebt im Code, hier stehen nur IDs.';
comment on column public.achievements.achievement_id is
  'ID aus ACHIEVEMENT_IDS (packages/shared). Bewusst Text und kein Enum: Ein neues Achievement soll keine Migration brauchen.';

alter table public.achievements enable row level security;

revoke all on table public.achievements from anon, authenticated;

drop policy if exists achievements_no_public_access on public.achievements;
create policy achievements_no_public_access
  on public.achievements
  for all
  to anon, authenticated
  using (false)
  with check (false);

grant select, insert on table public.achievements to service_role;

-- ---------------------------------------------------------------------------
-- Bestleistungen je Konto
--
-- Aggregiert wird in der Datenbank, nicht im Spielserver: GET /profile/:userId
-- kommt damit mit einer Abfrage aus, statt Runs zu holen und selbst zu rechnen.
--
-- `security_invoker = true` ist wichtig: Ohne diese Einstellung liefe die View
-- mit den Rechten ihres Eigentümers und würde die Row Level Security von
-- `runs` aushebeln. So gilt für die View exakt dasselbe wie für die Tabelle –
-- nur der Service-Role-Key kommt heran.
-- ---------------------------------------------------------------------------

create or replace view public.profile_stats
  with (security_invoker = true)
  as
select
  user_id,
  count(*)::int                    as runs,
  max(score)::int                  as best_score,
  max(level)::int                  as best_level,
  max(kills)::int                  as best_kills,
  max(best_streak)::int            as best_streak,
  max(duration_seconds)            as longest_run_seconds,
  sum(kills)::int                  as total_kills,
  sum(duration_seconds)            as total_seconds,
  min(created_at)                  as first_run_at,
  max(created_at)                  as last_run_at
from public.runs
where user_id is not null
group by user_id;

comment on view public.profile_stats is
  'Bestleistungen je Konto, aggregiert aus runs. Nur Runs mit Konto; Gast-Runs bleiben außen vor.';

revoke all on public.profile_stats from anon, authenticated;
grant select on public.profile_stats to service_role;

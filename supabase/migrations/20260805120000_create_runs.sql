-- Project Maze – Persistenz Etappe 1+2
--
-- Legt die Tabelle für abgeschlossene Runs an, die das globale Leaderboard
-- speist. Geschrieben wird ausschließlich vom Spielserver mit dem
-- Service-Role-Key; gelesen wird öffentlich nur über die Server-Route
-- GET /leaderboard, niemals direkt aus dem Browser.
--
-- Ausführen: Supabase Studio → SQL Editor → Inhalt einfügen → Run.
-- Oder mit der CLI: supabase db push
-- Das Skript ist wiederholbar; ein zweiter Lauf ändert nichts.

create table if not exists public.runs (
  id            bigint generated always as identity primary key,
  created_at    timestamptz   not null default now(),
  player_name   text          not null check (char_length(player_name) between 1 and 18),
  score         integer       not null check (score >= 0),
  level         integer       not null check (level >= 1),
  player_class  text          not null check (char_length(player_class) between 1 and 32),
  kills         integer       not null check (kills >= 0),
  best_streak   integer       not null check (best_streak >= 0),
  duration_seconds numeric(10, 1) not null check (duration_seconds >= 0)
);

comment on table public.runs is
  'Abgeschlossene Spielrunden (Spawn bis Tod). Nur echte Spieler, keine Bots, nur Runs mit Score > 0.';
comment on column public.runs.duration_seconds is
  'Überlebensdauer des Runs in Sekunden, auf eine Nachkommastelle gerundet.';

-- Die einzige heiße Abfrage: Top-N nach Score. Bei Gleichstand gewinnt der
-- ältere Run, damit die Rangfolge stabil bleibt.
create index if not exists runs_score_idx on public.runs (score desc, created_at asc);

-- Für Retention und Zeitreihen ("Runs der letzten 24 h").
create index if not exists runs_created_at_idx on public.runs (created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- RLS an + keine erlaubende Policy = anon und authenticated sehen nichts und
-- schreiben nichts, auch nicht mit dem öffentlichen anon-Key. Der
-- Service-Role-Key umgeht RLS und bleibt damit der einzige Schreibweg – er
-- gehört ausschließlich in die Server-ENV, niemals in das Client-Bundle.
-- ---------------------------------------------------------------------------

alter table public.runs enable row level security;

-- Rechte der öffentlichen Rollen entziehen (Supabase vergibt sie per Default).
revoke all on table public.runs from anon, authenticated;

-- Explizit und selbsterklärend: Für anon/authenticated ist nichts sichtbar.
-- Die Policy ist streng genommen redundant, dokumentiert die Absicht aber im
-- Schema selbst – wer später eine Lese-Policy ergänzt, sieht sofort, dass das
-- eine bewusste Entscheidung wäre.
drop policy if exists runs_no_public_access on public.runs;
create policy runs_no_public_access
  on public.runs
  for all
  to anon, authenticated
  using (false)
  with check (false);

grant select, insert on table public.runs to service_role;

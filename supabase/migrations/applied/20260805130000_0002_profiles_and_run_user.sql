-- Project Maze / MAZERS – Migration 0002: Konten (Sprint B, Google-Login)
--
-- Legt die Profiltabelle an und verknüpft Runs optional mit einem Konto.
-- Voraussetzung: Migration 0001 (20260805120000_create_runs.sql) ist gelaufen.
--
-- Wichtig: Diese Migration ändert das Verhalten des Servers nicht. Ohne
-- AUTH_ENABLED=true bleibt `runs.user_id` immer NULL, und `profiles` bleibt
-- leer. Gäste können weiterhin ohne Konto spielen – das ist kein Übergangs-
-- zustand, sondern die Zusage aus dem Teamplan.
--
-- Ausführen: Supabase Studio → SQL Editor → Inhalt einfügen → Run.
-- Oder mit der CLI: supabase db push
-- Das Skript ist wiederholbar; ein zweiter Lauf ändert nichts.

-- ---------------------------------------------------------------------------
-- Profile
--
-- Eine Zeile je angemeldetem Konto. `auth.users` verwaltet Supabase selbst;
-- wir speichern hier nur, was das Spiel anzeigt. Bewusst keine E-Mail: Die
-- steht in auth.users und hat in einer Tabelle, aus der ein Leaderboard
-- gespeist wird, nichts verloren.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  user_id      uuid        primary key references auth.users (id) on delete cascade,
  display_name text        not null check (char_length(display_name) between 1 and 18),
  created_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Spielprofil je Supabase-Konto. Angelegt beim ersten angemeldeten Join.';
comment on column public.profiles.display_name is
  'Anzeigename im Spiel, gleiche Regeln wie der Gastname: max. 18 Zeichen, ohne Steuerzeichen.';

-- ---------------------------------------------------------------------------
-- Runs mit optionalem Konto
--
-- NULL heißt „als Gast gespielt" und bleibt der Normalfall. Löscht jemand sein
-- Konto, verschwinden seine zugeordneten Runs mit (on delete cascade) – das
-- ist die datenschutzfreundliche Voreinstellung. Wer die Bestenliste lieber
-- vollständig behalten und nur die Verknüpfung lösen will, ersetzt das durch
-- `on delete set null`.
-- ---------------------------------------------------------------------------

alter table public.runs
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

comment on column public.runs.user_id is
  'Konto des Spielers, NULL bei Gast-Runs. Wird nur mit AUTH_ENABLED=true gesetzt.';

-- Lifetime-Stats je Konto ("meine besten Runs"). Der Teilindex bleibt klein,
-- solange die meisten Runs Gast-Runs sind.
create index if not exists runs_user_id_idx
  on public.runs (user_id, score desc)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- Row Level Security – identisch zur Regel aus Migration 0001
--
-- RLS an, keine erlaubende Policy: anon und authenticated kommen an nichts
-- heran, auch nicht mit dem öffentlichen Schlüssel und auch nicht mit einem
-- gültigen Google-Login. Geschrieben wird ausschließlich vom Spielserver mit
-- dem Service-Role-Key, gelesen öffentlich nur über unsere Server-Routen.
--
-- Das ist bewusst strenger als das übliche Supabase-Muster („jeder darf sein
-- eigenes Profil lesen"): Der Browser spricht in MAZERS nie direkt mit
-- Supabase, deshalb braucht er dort auch keine Rechte.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;

drop policy if exists profiles_no_public_access on public.profiles;
create policy profiles_no_public_access
  on public.profiles
  for all
  to anon, authenticated
  using (false)
  with check (false);

grant select, insert, update on table public.profiles to service_role;

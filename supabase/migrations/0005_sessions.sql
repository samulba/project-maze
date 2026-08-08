-- Project Maze / MAZERS – Migration 0005: Sitzungen, Geräte, Admin-Auswertungen
--
-- Voraussetzung: Migrationen 0001–0004.
--
-- ANLASS
--
-- Bis hierher speichert MAZERS nur **abgeschlossene Runs mit Score > 0**. Damit
-- lässt sich die Frage, die das Admin-Portal beantworten soll – „haben wir neue
-- Spieler?" – nicht beantworten:
--
--   * Wer die Arena betritt und ohne Punkte wieder geht, hinterlässt keine Spur.
--   * Zwei Runs desselben Gastes sind nicht als derselbe Mensch erkennbar.
--   * „Wie viele waren heute da" wäre nur aus Runs geschätzt, nicht gezählt.
--
-- Diese Migration schließt die Lücke mit zwei Tabellen: `sessions` (eine Zeile
-- je Besuch) und `devices` (das Aggregat je Browser, per Trigger gepflegt).
--
-- WAS GESPEICHERT WIRD – UND WAS NICHT
--
-- `device_id` ist eine Zufalls-ID, die der Browser selbst erzeugt und in
-- localStorage ablegt. Sie sagt nichts über die Person; wer sie loswerden will,
-- löscht die Website-Daten. Bewusst **nicht** gespeichert werden IP-Adresse,
-- User-Agent, Auflösung oder irgendetwas anderes, woraus sich ein Fingerabdruck
-- bauen ließe – gezählt werden Besuche, nicht Menschen.
--
-- Ausführen: Supabase Studio → SQL Editor → Inhalt einfügen → Run.
-- Das Skript ist wiederholbar; ein zweiter Lauf ändert nichts.

-- ---------------------------------------------------------------------------
-- Sitzungen
--
-- Eine Zeile je Besuch, geschrieben beim Verlassen der Arena (nicht beim
-- Betreten): Erst dann steht die Dauer fest, und erst dann weiß der Server, was
-- in dem Besuch passiert ist. Ein Server, der abstürzt, verliert die laufenden
-- Sitzungen – das ist der bewusste Preis dafür, im Tick-Pfad nichts zu tun.
-- ---------------------------------------------------------------------------

create table if not exists public.sessions (
  id               bigint       generated always as identity primary key,
  started_at       timestamptz  not null,
  ended_at         timestamptz  not null default now(),
  duration_seconds numeric(10, 1) not null check (duration_seconds >= 0),
  device_id        text         not null check (char_length(device_id) between 8 and 64),
  user_id          uuid         references auth.users (id) on delete set null,
  player_name      text         not null check (char_length(player_name) between 1 and 18),
  runs             integer      not null default 0 check (runs >= 0),
  kills            integer      not null default 0 check (kills >= 0),
  best_score       integer      not null default 0 check (best_score >= 0),
  best_level       integer      not null default 1 check (best_level >= 1)
);

comment on table public.sessions is
  'Ein Besuch der Arena, vom Join bis zum Verlassen. Nur Menschen, keine Bots.';
comment on column public.sessions.device_id is
  'Zufalls-ID aus dem localStorage des Browsers. Kein Fingerabdruck, keine IP – nur ein Wiedererkennungsmerkmal, das der Spieler jederzeit löschen kann.';
comment on column public.sessions.user_id is
  'Konto, falls angemeldet gespielt wurde. NULL heißt Gast und bleibt der Normalfall.';
comment on column public.sessions.runs is
  'Abgeschlossene Leben in dieser Sitzung (jeder Tod zählt, auch ohne Punkte).';

-- Die beiden heißen Abfragen des Portals: „Sitzungen der letzten N Tage" und
-- „alles zu diesem Gerät".
create index if not exists sessions_started_at_idx on public.sessions (started_at desc);
create index if not exists sessions_device_idx on public.sessions (device_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Geräte
--
-- Das Aggregat je `device_id`. Es gibt genau eine Frage, für die es existiert:
-- „Ist dieser Besuch der erste?" Über `sessions` wäre das ein Gruppieren über
-- die gesamte Historie – hier ist es ein Blick auf `first_seen`, und „neue
-- Spieler heute" wird ein indizierter Zählvorgang.
-- ---------------------------------------------------------------------------

create table if not exists public.devices (
  device_id     text        primary key,
  first_seen    timestamptz not null,
  last_seen     timestamptz not null,
  sessions      integer     not null default 0,
  runs          integer     not null default 0,
  kills         integer     not null default 0,
  total_seconds numeric(12, 1) not null default 0,
  best_score    integer     not null default 0,
  best_level    integer     not null default 1,
  last_user_id  uuid        references auth.users (id) on delete set null,
  last_name     text
);

comment on table public.devices is
  'Aggregat je Browser. Existiert für die Frage „neu oder wiederkehrend" – alles andere ließe sich auch aus sessions rechnen.';

create index if not exists devices_first_seen_idx on public.devices (first_seen desc);
create index if not exists devices_last_seen_idx on public.devices (last_seen desc);

-- ---------------------------------------------------------------------------
-- Der Trigger, der `devices` pflegt
--
-- Bewusst in der Datenbank und nicht im Spielserver: Der Server schreibt damit
-- weiterhin nur *einen* Datensatz je Sitzung und muss weder vorher lesen noch
-- zwei Schreibvorgänge koordinieren. Fällt die Verbindung zwischen beiden aus,
-- kann `devices` gar nicht erst von `sessions` abweichen.
-- ---------------------------------------------------------------------------

create or replace function public.touch_device() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.devices as d (
    device_id, first_seen, last_seen, sessions, runs, kills,
    total_seconds, best_score, best_level, last_user_id, last_name
  )
  values (
    new.device_id, new.started_at, new.ended_at, 1, new.runs, new.kills,
    new.duration_seconds, new.best_score, new.best_level, new.user_id, new.player_name
  )
  on conflict (device_id) do update set
    -- `least`/`greatest` statt Zuweisung: Sitzungen können verspätet
    -- eintreffen (der Server puffert), die Reihenfolge ist nicht garantiert.
    first_seen    = least(d.first_seen, excluded.first_seen),
    last_seen     = greatest(d.last_seen, excluded.last_seen),
    sessions      = d.sessions + 1,
    runs          = d.runs + excluded.runs,
    kills         = d.kills + excluded.kills,
    total_seconds = d.total_seconds + excluded.total_seconds,
    best_score    = greatest(d.best_score, excluded.best_score),
    best_level    = greatest(d.best_level, excluded.best_level),
    -- Der zuletzt gesehene Name/das zuletzt gesehene Konto gewinnt, aber ein
    -- Gast-Besuch löscht die bekannte Kontoverknüpfung nicht.
    last_user_id  = coalesce(excluded.last_user_id, d.last_user_id),
    last_name     = coalesce(excluded.last_name, d.last_name);
  return new;
end;
$$;

comment on function public.touch_device() is
  'Hält public.devices synchron zu public.sessions. security definer, weil der Trigger auch dann schreiben können muss, wenn der Aufrufer nur auf sessions Rechte hat.';

drop trigger if exists sessions_touch_device on public.sessions;
create trigger sessions_touch_device
  after insert on public.sessions
  for each row execute function public.touch_device();

-- ---------------------------------------------------------------------------
-- Auswertungen für das Admin-Portal
--
-- Beide Views gruppieren **auf Tagesebene**. Das ist Absicht: Supabases
-- REST-Schnittstelle kann nicht gruppieren, ein Zeitraumfilter auf eine fertig
-- aggregierte View wäre also unmöglich. Mit Tageszeilen filtert der Server nach
-- `day` und summiert die paar Zeilen selbst – ein Zeitraum ist damit ein
-- Parameter und keine neue View.
--
-- `security_invoker = true` ist Pflicht (wie bei profile_stats in 0003):
-- Andernfalls liefe die View mit den Rechten ihres Eigentümers und würde die
-- Row Level Security der zugrunde liegenden Tabellen aushebeln.
-- ---------------------------------------------------------------------------

create or replace view public.admin_daily
  with (security_invoker = true)
  as
with besuche as (
  select
    date_trunc('day', started_at)                                    as day,
    count(*)::int                                                    as sessions,
    count(distinct device_id)::int                                   as players,
    count(distinct user_id) filter (where user_id is not null)::int  as accounts,
    sum(runs)::int                                                   as runs,
    sum(kills)::int                                                  as kills,
    sum(duration_seconds)                                            as total_seconds,
    max(best_level)::int                                             as best_level
  from public.sessions
  group by 1
),
neulinge as (
  select date_trunc('day', first_seen) as day, count(*)::int as new_players
  from public.devices
  group by 1
)
select
  coalesce(b.day, n.day)          as day,
  coalesce(b.sessions, 0)         as sessions,
  coalesce(b.players, 0)          as players,
  coalesce(n.new_players, 0)      as new_players,
  coalesce(b.accounts, 0)         as accounts,
  coalesce(b.runs, 0)             as runs,
  coalesce(b.kills, 0)            as kills,
  coalesce(b.total_seconds, 0)    as total_seconds,
  coalesce(b.best_level, 0)       as best_level
from besuche b
full outer join neulinge n on b.day = n.day;

comment on view public.admin_daily is
  'Tageswerte für das Admin-Portal: Besuche, Spieler, davon neu, Konten, Runs, Kills, Spielzeit.';

create or replace view public.admin_class_daily
  with (security_invoker = true)
  as
select
  date_trunc('day', created_at) as day,
  player_class,
  count(*)::int                 as runs,
  sum(level)::int               as level_sum,
  sum(score)::bigint            as score_sum,
  sum(kills)::int               as kills,
  sum(duration_seconds)         as seconds,
  max(score)::int               as best_score,
  max(level)::int               as best_level
from public.runs
group by 1, 2;

comment on view public.admin_class_daily is
  'Klassennutzung je Tag. Summen statt Mittelwerte, damit der Server über einen beliebigen Zeitraum korrekt mitteln kann.';

-- ---------------------------------------------------------------------------
-- Row Level Security – dieselbe Regel wie in 0001–0003
--
-- RLS an, keine erlaubende Policy: Weder der öffentliche anon-Key noch ein
-- gültiger Google-Login kommt an diese Daten. Der Browser spricht in MAZERS nie
-- direkt mit Supabase; das Admin-Portal fragt den Spielserver, und nur der hat
-- den Service-Role-Key.
-- ---------------------------------------------------------------------------

alter table public.sessions enable row level security;
alter table public.devices  enable row level security;

revoke all on table public.sessions from anon, authenticated;
revoke all on table public.devices  from anon, authenticated;

drop policy if exists sessions_no_public_access on public.sessions;
create policy sessions_no_public_access
  on public.sessions for all to anon, authenticated
  using (false) with check (false);

drop policy if exists devices_no_public_access on public.devices;
create policy devices_no_public_access
  on public.devices for all to anon, authenticated
  using (false) with check (false);

grant select, insert on table public.sessions to service_role;
grant select on table public.devices to service_role;
-- Der Trigger schreibt als `security definer`, deshalb braucht service_role
-- selbst kein Insert/Update auf devices.

revoke all on public.admin_daily       from anon, authenticated;
revoke all on public.admin_class_daily from anon, authenticated;
grant select on public.admin_daily       to service_role;
grant select on public.admin_class_daily to service_role;

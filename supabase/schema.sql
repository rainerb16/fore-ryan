-- Ryan Arcade leaderboard schema.
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Every statement is idempotent, so it is safe to re-run after a change here,
-- and the whole file is one transaction: it applies completely or not at all.
--
-- Nothing here is reachable with the anon key. Row Level Security is on and no
-- policies are granted, so the only way in is a Netlify Function holding the
-- service role key. That key must never reach the browser.

begin;

-- --------------------------------------------------------------------------
-- run_tokens: issued when a contest run starts, consumed when it is submitted.
-- A submission without a matching unused token is rejected, which stops anyone
-- POSTing a fabricated score straight at the endpoint.
-- --------------------------------------------------------------------------
create table if not exists run_tokens (
  token      uuid primary key default gen_random_uuid(),
  issued_at  timestamptz not null default now(),
  used_at    timestamptz,
  ip_hash    text
);

create index if not exists run_tokens_issued_at_idx on run_tokens (issued_at desc);
-- Supports the per-address rate limit on issuing tokens.
create index if not exists run_tokens_ip_hash_idx on run_tokens (ip_hash, issued_at desc);

-- --------------------------------------------------------------------------
-- runs: one row per submitted contest run.
-- points is always the server's own recomputation, never the client's claim.
-- --------------------------------------------------------------------------
create table if not exists runs (
  id             uuid primary key default gen_random_uuid(),
  display_name   text not null check (char_length(display_name) between 1 and 40),
  -- Random id the browser generates and keeps. Not personal data and not proof
  -- of anything — it exists so one person's runs collapse to their best, and so
  -- they can be shown their own standing.
  player_id      text not null,
  points         int  not null check (points >= 0),
  level_reached  int  not null check (level_reached >= 1),
  levels_cleared int  not null default 0 check (levels_cleared >= 0),
  duration_ms    int  not null check (duration_ms >= 0),
  shots_fired    int  not null default 0 check (shots_fired >= 0),
  holes_sunk     int  not null default 0 check (holes_sunk >= 0),
  -- The per-level stats the score was derived from, kept so a disputed run
  -- can be re-scored later without trusting anything new from the client.
  levels         jsonb not null,
  run_token      uuid not null unique references run_tokens (token),
  client_meta    jsonb,
  created_at     timestamptz not null default now(),
  -- Set by hand to hide a run without deleting it.
  flagged        boolean not null default false
);

-- --------------------------------------------------------------------------
-- Migration: the leaderboard used to identify players by a hash of their work
-- email. Asking for one was more than a birthday game needed, so runs are keyed
-- on a browser-generated id instead. Existing rows carry their old identity
-- across, so runs already posted still collapse per person.
-- --------------------------------------------------------------------------
alter table runs add column if not exists player_id text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'runs' and column_name = 'email_hash'
  ) then
    execute 'update runs set player_id = email_hash where player_id is null';
    execute 'drop view if exists leaderboard';
    execute 'alter table runs drop column email_hash';
  end if;
end $$;

-- Only once every row has one, or a re-run on a half-migrated table would fail.
do $$
begin
  if not exists (select 1 from runs where player_id is null) then
    execute 'alter table runs alter column player_id set not null';
  end if;
end $$;

drop index if exists runs_email_hash_idx;

create index if not exists runs_leaderboard_idx on runs (points desc, duration_ms asc);
create index if not exists runs_player_id_idx   on runs (player_id);
create index if not exists runs_created_at_idx  on runs (created_at desc);

-- --------------------------------------------------------------------------
-- Arcade: one database for every game. Extended in place — existing rows are
-- tagged as the birthday game by the column defaults, and nothing is dropped
-- or renamed.
-- --------------------------------------------------------------------------
create table if not exists games (
  id       text primary key,              -- occasion and year: 'christmas-2026'
  title    text not null,
  occasion text not null,
  year     int  not null,
  sort     text not null default 'desc' check (sort in ('asc', 'desc'))
);

insert into games (id, title, occasion, year, sort) values
  ('birthday-2026',  'Fore Ryan!',      'Birthday',  2026, 'desc'),
  ('christmas-2026', 'Ryan Ski Jump',   'Christmas', 2026, 'desc')
on conflict (id) do update
  set title = excluded.title, occasion = excluded.occasion,
      year = excluded.year, sort = excluded.sort;

alter table runs
  add column if not exists game_id text not null default 'birthday-2026' references games (id);
alter table run_tokens
  add column if not exists game_id text not null default 'birthday-2026' references games (id);

-- Game-specific stats for games after golf. Golf keeps its own columns, which
-- become optional because the other games leave them empty.
alter table runs add column if not exists details jsonb;
alter table runs alter column level_reached  drop not null;
alter table runs alter column levels_cleared drop not null;
alter table runs alter column shots_fired    drop not null;
alter table runs alter column holes_sunk     drop not null;
alter table runs alter column levels         drop not null;

create index if not exists runs_game_points_idx on runs (game_id, points desc);

-- --------------------------------------------------------------------------
-- leaderboard: each player's best run per game, so one person cannot fill a
-- top ten. Best means the game's own direction (most points, or fewest), then
-- the faster run as the tie-break.
-- --------------------------------------------------------------------------
drop view if exists leaderboard;

create view leaderboard as
select distinct on (r.game_id, r.player_id)
  r.game_id,
  r.player_id,
  r.display_name,
  r.points,
  r.level_reached,
  r.levels_cleared,
  r.duration_ms,
  r.details,
  r.created_at
from runs r
join games g on g.id = r.game_id
where not r.flagged
order by r.game_id, r.player_id,
  case when g.sort = 'desc' then r.points end desc,
  case when g.sort = 'asc'  then r.points end asc,
  r.duration_ms asc;

-- --------------------------------------------------------------------------
-- Lock everything down. No policies are created on purpose. The view is
-- revoked again every time it is recreated, since Supabase grants new objects
-- to anon by default.
-- --------------------------------------------------------------------------
alter table runs       enable row level security;
alter table run_tokens enable row level security;
alter table games      enable row level security;

revoke all on runs        from anon, authenticated;
revoke all on run_tokens  from anon, authenticated;
revoke all on games       from anon, authenticated;
revoke all on leaderboard from anon, authenticated;

commit;

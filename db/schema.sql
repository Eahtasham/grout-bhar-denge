-- Grout Bhar Denge schema (Postgres / Supabase).
-- Apply with: npm run db:migrate
-- Every table has RLS enabled and no policies, so the public Supabase API
-- (publishable key) cannot read or write them. Only the server, connecting with
-- DATABASE_URL, can.

create table if not exists game_sessions (
  id          uuid primary key default gen_random_uuid(),
  seed        bigint not null,
  started_at  timestamptz not null default now()
);
create index if not exists game_sessions_started_at on game_sessions (started_at);

create table if not exists scores (
  id            text primary key,              -- short share id used in /s/[id]
  session_id    uuid not null unique,
  device_id     text not null,
  nickname      text not null,
  score         integer not null check (score >= 0),
  fills         integer not null,
  max_combo     integer not null,
  rank          text not null,
  best_problem  integer,                       -- index into content/problems.json
  day           date not null,                 -- IST date the round was played
  created_at    timestamptz not null default now()
);
create index if not exists scores_day_score on scores (day, score desc, created_at);
-- Daily board picks each player's best of the day.
create index if not exists scores_day_device_score on scores (day, device_id, score desc, created_at);

-- One row per device: its best score ever (the all-time board).
create table if not exists player_best (
  device_id   text primary key,
  score_id    text not null references scores (id) on delete cascade,
  nickname    text not null,
  score       integer not null,
  rank        text not null,
  updated_at  timestamptz not null default now()
);
create index if not exists player_best_score on player_best (score desc, updated_at);

-- Fixed-window rate limiting (keyed by hashed IP + route).
create table if not exists rate_hits (
  key     text not null,
  bucket  bigint not null,
  count   integer not null default 1,
  primary key (key, bucket)
);

alter table game_sessions enable row level security;
alter table scores        enable row level security;
alter table player_best   enable row level security;
alter table rate_hits     enable row level security;

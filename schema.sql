-- Выполни в Supabase: SQL Editor -> New query -> Run
create table if not exists public.players (
  tg_id        bigint primary key,
  name         text   not null default 'Игрок',
  state        jsonb  not null,
  total_earned bigint not null default 0,  -- заработано в текущей жизни
  best_total   bigint not null default 0,  -- лучший результат (по нему рейтинг)
  rank         int    not null default 0,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists players_best_idx on public.players (best_total desc);

-- Доступ закрыт для всех, кроме серверной функции (она использует service role)
alter table public.players enable row level security;

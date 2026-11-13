-- Wordzone: accounts and cloud progress.
-- Run once in Supabase → SQL Editor. One row per user; row-level security lets each user
-- read and write only their own row, so the public anon key cannot reach anyone else's data.

create table if not exists public.progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  constraint progress_size check (pg_column_size(data) < 4000000)
);

alter table public.progress enable row level security;

drop policy if exists "progress: read own"   on public.progress;
drop policy if exists "progress: insert own" on public.progress;
drop policy if exists "progress: update own" on public.progress;
drop policy if exists "progress: delete own" on public.progress;
create policy "progress: read own"   on public.progress for select using (auth.uid() = user_id);
create policy "progress: insert own" on public.progress for insert with check (auth.uid() = user_id);
create policy "progress: update own" on public.progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "progress: delete own" on public.progress for delete using (auth.uid() = user_id);

-- The server stamps every save; the app uses it to tell which device saved last.
create or replace function public.progress_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists progress_touch on public.progress;
create trigger progress_touch before insert or update on public.progress
  for each row execute function public.progress_touch();

-- v2.26: shared translation cache. A word translated once for a language pair is reused by everyone,
-- so it costs no AI request. Only the server (/api/ai with SUPABASE_SECRET_KEY) reads and writes it:
-- row-level security is on and there are no policies, so the public key gets nothing.
create table if not exists public.translation_cache (
  source     text        not null,
  target     text        not null,
  v          smallint    not null,
  word       text        not null check (char_length(word) between 1 and 120),
  item       jsonb       not null,
  created_at timestamptz not null default now(),
  primary key (source, target, v, word)
);
alter table public.translation_cache enable row level security;
revoke all on public.translation_cache from anon, authenticated;

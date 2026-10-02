-- ============================================================
-- SVR Pipeline — Supabase schema
--
-- Run this once, in full, in your Supabase project's SQL Editor:
--   Project → SQL Editor → New query → paste this whole file → Run
--
-- Safe to re-run: every step checks for its own prior existence,
-- so running this twice (e.g. after fixing a typo) won't error out.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1. Tables
-- ============================================================

create table if not exists prospects (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  company           text default '',
  phone             text default '',
  email             text default '',
  address           text default '',
  stage             text not null default 'new_lead'
                      check (stage in ('new_lead','site_survey','proposal_sent','negotiation','won','lost')),
  value             numeric not null default 0,
  source            text default '',
  priority          text not null default 'medium'
                      check (priority in ('high','medium','low')),
  owner             text default '',
  next_follow_up    date,
  lost_reason       text default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  stage_updated_at  timestamptz not null default now()
);

create table if not exists interactions (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   uuid not null references prospects(id) on delete cascade,
  type          text not null default 'note'
                  check (type in ('note','call','email','site_visit','meeting','stage_change')),
  content       text default '',
  author        text default '',
  from_stage    text,
  to_stage      text,
  created_at    timestamptz not null default now()
);

create index if not exists interactions_prospect_id_idx on interactions(prospect_id);
create index if not exists prospects_stage_idx on prospects(stage);

-- ============================================================
-- 1b. Added for the "Import properties" feature — safe to run
--     even if you already set up prospects/interactions earlier;
--     this just adds one column if it isn't already there.
-- ============================================================

alter table prospects add column if not exists source_url text;

-- ============================================================
-- 1c. Added for the sector filter — a simple classification field,
--     same pattern as "source": a fixed list enforced by the app's
--     dropdown, not a database constraint, so it's safe to add free-
--     hand later if you ever need to.
-- ============================================================

alter table prospects add column if not exists sector text default '';

-- ============================================================
-- 1d. Added for the dashboard map — coordinates looked up once from
--     a prospect's address (see the optional "geocode" function) and
--     cached here, so the map doesn't need to re-look-up addresses
--     every time it's opened. Null until a prospect has been located.
-- ============================================================

alter table prospects add column if not exists lat double precision;
alter table prospects add column if not exists lng double precision;

-- ============================================================
-- 2. Keep updated_at current automatically on every edit
-- ============================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists prospects_set_updated_at on prospects;
create trigger prospects_set_updated_at
  before update on prospects
  for each row
  execute function set_updated_at();

-- ============================================================
-- 3. Row Level Security — only signed-in team members can
--    read or write anything. This is the real access control;
--    the login screen alone would not protect the data without this.
-- ============================================================

alter table prospects enable row level security;
alter table interactions enable row level security;

drop policy if exists "Authenticated users can read prospects" on prospects;
create policy "Authenticated users can read prospects"
  on prospects for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can insert prospects" on prospects;
create policy "Authenticated users can insert prospects"
  on prospects for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update prospects" on prospects;
create policy "Authenticated users can update prospects"
  on prospects for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete prospects" on prospects;
create policy "Authenticated users can delete prospects"
  on prospects for delete
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read interactions" on interactions;
create policy "Authenticated users can read interactions"
  on interactions for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can insert interactions" on interactions;
create policy "Authenticated users can insert interactions"
  on interactions for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update interactions" on interactions;
create policy "Authenticated users can update interactions"
  on interactions for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete interactions" on interactions;
create policy "Authenticated users can delete interactions"
  on interactions for delete
  using (auth.role() = 'authenticated');

-- ============================================================
-- 4. Realtime — lets everyone's screen update live when a
--    teammate adds, edits, moves, or deletes a prospect.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'prospects'
  ) then
    alter publication supabase_realtime add table prospects;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'interactions'
  ) then
    alter publication supabase_realtime add table interactions;
  end if;
end $$;

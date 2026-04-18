-- Run this in Supabase SQL editor.
-- It creates history tables for processed videos, generated sections, and chat conversations.

create extension if not exists "pgcrypto";

create table if not exists public.video_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  youtube_url text not null,
  youtube_video_id text,
  video_title text,
  channel_name text,
  duration_seconds int,
  duration_label text,
  thumbnail_url text,
  embed_url text,
  provider text not null,
  model text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.video_sections (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.video_history(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position int not null,
  title text not null,
  summary text not null,
  start_seconds int not null,
  end_seconds int not null,
  start_time text not null,
  end_time text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_history (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.video_history(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  sources text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.user_provider_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_provider text not null check (active_provider in ('openai', 'gemini')),
  active_model text not null,
  openai_api_key text,
  gemini_api_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.video_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  youtube_url text not null,
  provider text not null,
  model text not null,
  status text not null check (status in ('pending', 'processing', 'completed', 'failed')),
  progress_stage text,
  video_id uuid references public.video_history(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_video_history_user_created
  on public.video_history(user_id, created_at desc);

create index if not exists idx_video_sections_video_position
  on public.video_sections(video_id, position);

create index if not exists idx_conversation_video_created
  on public.conversation_history(video_id, created_at);

create index if not exists idx_user_provider_settings_updated
  on public.user_provider_settings(updated_at desc);

create index if not exists idx_video_generation_jobs_user_created
  on public.video_generation_jobs(user_id, created_at desc);

create index if not exists idx_video_generation_jobs_user_status
  on public.video_generation_jobs(user_id, status, updated_at desc);

alter table public.video_history enable row level security;
alter table public.video_sections enable row level security;
alter table public.conversation_history enable row level security;
alter table public.user_provider_settings enable row level security;
alter table public.video_generation_jobs enable row level security;

drop policy if exists "video_history_select_own" on public.video_history;
create policy "video_history_select_own"
  on public.video_history for select
  using (auth.uid() = user_id);

drop policy if exists "video_history_insert_own" on public.video_history;
create policy "video_history_insert_own"
  on public.video_history for insert
  with check (auth.uid() = user_id);

drop policy if exists "video_history_update_own" on public.video_history;
create policy "video_history_update_own"
  on public.video_history for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "video_sections_select_own" on public.video_sections;
create policy "video_sections_select_own"
  on public.video_sections for select
  using (auth.uid() = user_id);

drop policy if exists "video_sections_insert_own" on public.video_sections;
create policy "video_sections_insert_own"
  on public.video_sections for insert
  with check (auth.uid() = user_id);

drop policy if exists "conversation_select_own" on public.conversation_history;
create policy "conversation_select_own"
  on public.conversation_history for select
  using (auth.uid() = user_id);

drop policy if exists "conversation_insert_own" on public.conversation_history;
create policy "conversation_insert_own"
  on public.conversation_history for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_provider_settings_select_own" on public.user_provider_settings;
create policy "user_provider_settings_select_own"
  on public.user_provider_settings for select
  using (auth.uid() = user_id);

drop policy if exists "user_provider_settings_insert_own" on public.user_provider_settings;
create policy "user_provider_settings_insert_own"
  on public.user_provider_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_provider_settings_update_own" on public.user_provider_settings;
create policy "user_provider_settings_update_own"
  on public.user_provider_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "video_generation_jobs_select_own" on public.video_generation_jobs;
create policy "video_generation_jobs_select_own"
  on public.video_generation_jobs for select
  using (auth.uid() = user_id);

drop policy if exists "video_generation_jobs_insert_own" on public.video_generation_jobs;
create policy "video_generation_jobs_insert_own"
  on public.video_generation_jobs for insert
  with check (auth.uid() = user_id);

drop policy if exists "video_generation_jobs_update_own" on public.video_generation_jobs;
create policy "video_generation_jobs_update_own"
  on public.video_generation_jobs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Migration for older deployments:
-- Ensure video_sections references video_history and remove obsolete processed_videos.
alter table public.video_sections
  drop constraint if exists video_sections_video_id_fkey;

alter table public.video_sections
  add constraint video_sections_video_id_fkey
  foreign key (video_id) references public.video_history(id) on delete cascade;

drop table if exists public.processed_videos;

alter table public.user_provider_settings
  add column if not exists active_provider text;

alter table public.user_provider_settings
  add column if not exists active_model text;

alter table public.user_provider_settings
  add column if not exists openai_api_key text;

alter table public.user_provider_settings
  add column if not exists gemini_api_key text;

alter table public.user_provider_settings
  add column if not exists created_at timestamptz not null default now();

alter table public.user_provider_settings
  add column if not exists updated_at timestamptz not null default now();

alter table public.video_history
  add column if not exists youtube_video_id text;

alter table public.video_history
  add column if not exists video_title text;

alter table public.video_history
  add column if not exists channel_name text;

alter table public.video_history
  add column if not exists duration_seconds int;

alter table public.video_history
  add column if not exists duration_label text;

alter table public.video_history
  add column if not exists thumbnail_url text;

alter table public.video_history
  add column if not exists embed_url text;

create table if not exists public.video_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  youtube_url text not null,
  provider text not null,
  model text not null,
  status text not null check (status in ('pending', 'processing', 'completed', 'failed')),
  progress_stage text,
  video_id uuid references public.video_history(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.video_generation_jobs
  add column if not exists progress_stage text;

alter table public.video_generation_jobs
  add column if not exists video_id uuid references public.video_history(id) on delete set null;

alter table public.video_generation_jobs
  add column if not exists error_message text;

alter table public.video_generation_jobs
  add column if not exists created_at timestamptz not null default now();

alter table public.video_generation_jobs
  add column if not exists updated_at timestamptz not null default now();

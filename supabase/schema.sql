create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Student',
  email text,
  avatar_initials text not null default 'ST',
  theme text not null default 'light' check (theme in ('light','dark')),
  created_at timestamptz not null default now()
);

create table if not exists dsa_questions (
  id integer primary key,
  section text not null,
  title text not null,
  difficulty text not null check (difficulty in ('Easy','Medium','Hard')),
  pattern text not null
);
create table if not exists placement_questions (
  id integer primary key,
  topic text not null,
  title text not null,
  difficulty text not null check (difficulty in ('Easy','Medium')),
  pattern text not null,
  source text not null,
  priority text not null default 'Unranked' check (priority in ('TOP PRIORITY','HIGH','MEDIUM','LOW','Unranked'))
);

create table if not exists dsa_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id integer not null references dsa_questions(id) on delete cascade,
  solved boolean not null default false,
  hint_used boolean not null default false,
  solution_seen boolean not null default false,
  solved_at timestamptz,
  last_viewed_at timestamptz,
  primary key (user_id, question_id)
);
create table if not exists dsa_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id integer not null references dsa_questions(id) on delete cascade,
  note_text text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
create table if not exists activity_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  dsa_solved_count integer not null default 0,
  primary key (user_id, date)
);

create table if not exists placement_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id integer not null references placement_questions(id) on delete cascade,
  solved boolean not null default false,
  hint_used boolean not null default false,
  solution_seen boolean not null default false,
  solved_at timestamptz,
  last_viewed_at timestamptz,
  primary key (user_id, question_id)
);
create table if not exists placement_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id integer not null references placement_questions(id) on delete cascade,
  note_text text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
create table if not exists placement_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  placement_solved_count integer not null default 0,
  primary key (user_id, date)
);

create table if not exists custom_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  difficulty text not null check (difficulty in ('Easy','Medium','Hard')),
  topic text not null default '',
  pattern text not null default '',
  statement text not null default '',
  source text,
  link text,
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists custom_question_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references custom_questions(id) on delete cascade,
  solved boolean not null default false,
  hint_used boolean not null default false,
  solution_seen boolean not null default false,
  solved_at timestamptz,
  last_viewed_at timestamptz,
  primary key (user_id, question_id)
);
create table if not exists custom_question_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references custom_questions(id) on delete cascade,
  note_text text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

-- safe to re-run: adds the priority column if this table already existed from an earlier version
alter table placement_questions add column if not exists priority text not null default 'Unranked';

alter table profiles enable row level security;
alter table dsa_progress enable row level security;
alter table dsa_notes enable row level security;
alter table activity_log enable row level security;
alter table placement_progress enable row level security;
alter table placement_notes enable row level security;
alter table placement_activity enable row level security;
alter table custom_questions enable row level security;
alter table custom_question_progress enable row level security;
alter table custom_question_notes enable row level security;
alter table dsa_questions enable row level security;
alter table placement_questions enable row level security;

drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles for all using (auth.uid()=id) with check (auth.uid()=id);
drop policy if exists dsa_questions_read on dsa_questions;
create policy dsa_questions_read on dsa_questions for select using (true);
drop policy if exists placement_questions_read on placement_questions;
create policy placement_questions_read on placement_questions for select using (true);

drop policy if exists dsa_progress_self on dsa_progress;
create policy dsa_progress_self on dsa_progress for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists dsa_notes_self on dsa_notes;
create policy dsa_notes_self on dsa_notes for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists activity_self on activity_log;
create policy activity_self on activity_log for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists placement_progress_self on placement_progress;
create policy placement_progress_self on placement_progress for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists placement_notes_self on placement_notes;
create policy placement_notes_self on placement_notes for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists placement_activity_self on placement_activity;
create policy placement_activity_self on placement_activity for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists custom_questions_self on custom_questions;
create policy custom_questions_self on custom_questions for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists custom_progress_self on custom_question_progress;
create policy custom_progress_self on custom_question_progress for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists custom_notes_self on custom_question_notes;
create policy custom_notes_self on custom_question_notes for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

create index if not exists dsa_progress_user_idx on dsa_progress(user_id);
create index if not exists placement_progress_user_idx on placement_progress(user_id);
create index if not exists custom_questions_user_idx on custom_questions(user_id);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles(id,email,display_name,avatar_initials)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'display_name','Student'),upper(left(coalesce(new.raw_user_meta_data->>'display_name','Student'),2)))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

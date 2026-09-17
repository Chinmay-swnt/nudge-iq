-- Supabase Schema for NudgeIQ

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Teams Table
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- 2. Users Table (Profile mirroring auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  phone_number text,
  created_at timestamptz default now()
);

-- 3. Team Members Table (Junction table)
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  role text default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz default now(),
  unique(team_id, user_id)
);

-- 4. Invites Table
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade not null,
  email text not null,
  status text default 'pending' check (status in ('pending', 'accepted')),
  invited_by uuid references public.users(id) on delete set null,
  created_at timestamptz default now()
);

-- 5. Meetings Table
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade not null,
  title text not null,
  meeting_date timestamptz not null,
  transcript_url text,
  status text default 'pending' check (status in ('pending', 'processed')),
  created_at timestamptz default now()
);

-- 6. Transcripts Table
create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id) on delete cascade not null,
  raw_text text,
  diarized_json jsonb,
  created_at timestamptz default now()
);

-- 7. Action Items Table
create table if not exists public.action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id) on delete cascade not null,
  task_description text not null,
  owner_id uuid references public.users(id) on delete set null,
  deadline date,
  created_at timestamptz default now()
);

-- 8. Tasks Table
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  action_item_id uuid references public.action_items(id) on delete cascade not null,
  status text default 'todo' check (status in ('todo', 'in_progress', 'done', 'overdue')),
  reminder_sent_at timestamptz,
  created_at timestamptz default now()
);

-- 9. Personal Notes Table
create table if not exists public.personal_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  title text,
  recording_url text,
  raw_text text,
  status text default 'pending' check (status in ('pending', 'processed')),
  created_at timestamptz default now()
);

-- 10. Personal Note Tasks Table
create table if not exists public.personal_note_tasks (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references public.personal_notes(id) on delete cascade not null,
  task_description text not null,
  deadline date,
  status text default 'todo' check (status in ('todo', 'in_progress', 'done', 'overdue')),
  created_at timestamptz default now()
);

-- ==========================================
-- Permissions Grants for Supabase Auth
-- ==========================================
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all routines in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;

-- ==========================================
-- Robust Trigger for Auth & User Creation
-- ==========================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  user_full_name text;
begin
  -- Safely extract name metadata
  user_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(coalesce(new.email, ''), '@', 1),
    'User'
  );

  -- 1. Insert or update public.users
  insert into public.users (id, name, email)
  values (
    new.id,
    user_full_name,
    new.email
  )
  on conflict (id) do update
  set
    name = excluded.name,
    email = excluded.email;

  -- 2. Check for pending invites for this email and automatically add user as team member
  if new.email is not null and length(trim(new.email)) > 0 then
    begin
      for inv in select * from public.invites where lower(email) = lower(new.email) and status = 'pending' loop
        insert into public.team_members (team_id, user_id, role)
        values (inv.team_id, new.id, 'member')
        on conflict (team_id, user_id) do nothing;

        update public.invites
        set status = 'accepted'
        where id = inv.id;
      end loop;
    exception when others then
      -- Do not block user registration if invite processing encounters an edge case
      raise warning 'Invite matching error in handle_new_user: %', SQLERRM;
    end;
  end if;

  return new;
exception when others then
  raise warning 'Error in handle_new_user: %', SQLERRM;
  return new;
end;
$$;

-- Trigger on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ==========================================
-- Enable Row Level Security (RLS)
-- ==========================================

alter table public.teams enable row level security;
alter table public.users enable row level security;
alter table public.team_members enable row level security;
alter table public.invites enable row level security;
alter table public.meetings enable row level security;
alter table public.transcripts enable row level security;
alter table public.action_items enable row level security;
alter table public.tasks enable row level security;
alter table public.personal_notes enable row level security;
alter table public.personal_note_tasks enable row level security;

-- Helper functions for RLS checks
create or replace function public.is_team_member(team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = $1 and user_id = auth.uid()
  );
$$;

create or replace function public.is_team_owner(team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = $1 and user_id = auth.uid() and role = 'owner'
  );
$$;

-- 1. Users policies
create policy "Users can view profile of teammates and themselves"
  on public.users for select
  using (
    id = auth.uid() or
    exists (
      select 1 from public.team_members tm1
      join public.team_members tm2 on tm1.team_id = tm2.team_id
      where tm1.user_id = auth.uid() and tm2.user_id = public.users.id
    )
  );

create policy "Users can update their own profile"
  on public.users for update
  using (id = auth.uid());

-- 2. Teams policies
create policy "Team members can view their teams"
  on public.teams for select
  using (public.is_team_member(id));

create policy "Authenticated users can create teams"
  on public.teams for insert
  with check (auth.role() = 'authenticated');

create policy "Owners can update their teams"
  on public.teams for update
  using (public.is_team_owner(id));

create policy "Owners can delete their teams"
  on public.teams for delete
  using (public.is_team_owner(id));

-- 3. Team Members policies
create policy "Team members can view team membership"
  on public.team_members for select
  using (public.is_team_member(team_id) or user_id = auth.uid());

create policy "Authenticated users can create own team member row as owner on team create"
  on public.team_members for insert
  with check (auth.uid() = user_id or public.is_team_owner(team_id));

create policy "Owners can update team members"
  on public.team_members for update
  using (public.is_team_owner(team_id));

create policy "Owners or member themselves can delete team membership"
  on public.team_members for delete
  using (public.is_team_owner(team_id) or user_id = auth.uid());

-- 4. Invites policies
create policy "Team members can view team invites"
  on public.invites for select
  using (public.is_team_member(team_id));

create policy "Team owners can create invites"
  on public.invites for insert
  with check (public.is_team_owner(team_id));

create policy "Team owners can update/cancel invites"
  on public.invites for update
  using (public.is_team_owner(team_id));

-- 5. Meetings policies
create policy "Team members can view their team meetings"
  on public.meetings for select
  using (public.is_team_member(team_id));

create policy "Team members can insert meetings"
  on public.meetings for insert
  with check (public.is_team_member(team_id));

create policy "Team members can update meetings"
  on public.meetings for update
  using (public.is_team_member(team_id));

-- 6. Transcripts policies
create policy "Team members can view transcripts"
  on public.transcripts for select
  using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_id and public.is_team_member(m.team_id)
    )
  );

create policy "Team members can insert transcripts"
  on public.transcripts for insert
  with check (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_id and public.is_team_member(m.team_id)
    )
  );

-- 7. Action Items policies
create policy "Team members can view action items"
  on public.action_items for select
  using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_id and public.is_team_member(m.team_id)
    )
  );

create policy "Team members can insert action items"
  on public.action_items for insert
  with check (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_id and public.is_team_member(m.team_id)
    )
  );

create policy "Team members can update action items"
  on public.action_items for update
  using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_id and public.is_team_member(m.team_id)
    )
  );

-- 8. Tasks policies
create policy "Team members can view tasks"
  on public.tasks for select
  using (
    exists (
      select 1 from public.action_items ai
      join public.meetings m on m.id = ai.meeting_id
      where ai.id = action_item_id and public.is_team_member(m.team_id)
    )
  );

create policy "Team members can insert tasks"
  on public.tasks for insert
  with check (
    exists (
      select 1 from public.action_items ai
      join public.meetings m on m.id = ai.meeting_id
      where ai.id = action_item_id and public.is_team_member(m.team_id)
    )
  );

create policy "Team members can update task status"
  on public.tasks for update
  using (
    exists (
      select 1 from public.action_items ai
      join public.meetings m on m.id = ai.meeting_id
      where ai.id = action_item_id and public.is_team_member(m.team_id)
    )
  );

-- 9. Personal Notes policies
create policy "Users can manage their own personal notes"
  on public.personal_notes for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 10. Personal Note Tasks policies
create policy "Users can manage their personal note tasks"
  on public.personal_note_tasks for all
  using (
    exists (
      select 1 from public.personal_notes pn
      where pn.id = note_id and pn.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.personal_notes pn
      where pn.id = note_id and pn.user_id = auth.uid()
    )
  );

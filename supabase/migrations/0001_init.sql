-- teams
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- users
create table users (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id),
  name text not null,
  email text unique,
  phone_number text,
  created_at timestamptz default now()
);

-- meetings
create table meetings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id),
  title text not null,
  meeting_date timestamptz not null,
  transcript_url text,
  status text default 'pending', -- pending | processed
  created_at timestamptz default now()
);

-- transcripts
create table transcripts (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id),
  raw_text text,
  diarized_json jsonb,
  created_at timestamptz default now()
);

-- action_items
create table action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id),
  task_description text not null,
  owner_id uuid references users(id),
  deadline date,
  created_at timestamptz default now()
);

-- tasks
create table tasks (
  id uuid primary key default gen_random_uuid(),
  action_item_id uuid references action_items(id),
  status text default 'todo', -- todo | in_progress | done | overdue
  reminder_sent_at timestamptz,
  created_at timestamptz default now()
);
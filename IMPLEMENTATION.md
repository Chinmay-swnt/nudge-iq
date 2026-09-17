# NudgeIQ — Implementation Spec

AI meeting action-item extraction & WhatsApp follow-up system, built for teams. This doc covers **frontend + backend only** for this build pass. AI extraction pipeline and hardware ingestion are stubbed as placeholder functions/routes to be implemented later — do not build their internals now, just leave clean integration points (see "Deferred: AI" and "Deferred: Hardware" sections).

---

## Stack

- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS
- **Backend:** Node.js/Express (Dockerized)
- **ML service:** Python FastAPI (Dockerized) — currently just a health-check stub, real logic deferred
- **Database/Auth:** Supabase (Postgres + Auth + Storage)
- **Auth method:** Google OAuth only, via Supabase Auth (PKCE flow, `@supabase/ssr`)
- **Package manager:** pnpm

---

## Design System

- Primary background: `#F8F9FA`
- Card/surface: `#FFFFFF`, rounded corners (8-12px), border `#E5E5E5`, subtle shadow
- Primary text: `#111111`
- Sidebar/contrast blocks: `#0A0A0A` / `#1A1A1A`, white text
- Accent: `#3B82F6` (buttons, links, active states, status badges)
- Danger/overdue: `#EF4444`
- Font: Inter or similar modern sans-serif
- Aesthetic: minimal SaaS dashboard, generous whitespace, no gradients

---

## Routing Structure

```
app/
├── get-started/page.tsx              # Google login, single button, no sidebar
├── auth/callback/route.ts            # PKCE code exchange, sets session cookie
├── dashboard/
│   ├── layout.tsx                    # auth-gate only, no sidebar (global page)
│   ├── page.tsx                      # all-teams overview: stat cards + team list + "create team" modal
│   └── team/
│       └── [teamId]/
│           ├── layout.tsx            # team sidebar (Dashboard/Meetings/Tasks/Invite nav), validates membership
│           ├── page.tsx              # team dashboard: stat cards + recent meetings
│           ├── meetings/
│           │   └── page.tsx          # meetings list + "Add Meeting" modal
│           ├── tasks/
│           │   └── page.tsx          # kanban task board + "Add Task" modal
│           └── invite/
│               └── page.tsx          # owner-only: invite teammate by email
components/
├── CreateTeamButton.tsx              # modal: team name input -> creates team + team_members row
├── AddMeetingButton.tsx              # modal: title + date -> inserts meetings row
├── AddTaskButton.tsx                 # modal: description + owner dropdown + deadline -> inserts action_items + tasks row
lib/
├── supabaseClient.ts                 # browser client (createBrowserClient)
└── supabaseServer.ts                 # server client (createServerClient, async, next/headers cookies)
```

---

## Database Schema (Supabase Postgres)

```sql
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table users (
  id uuid primary key references auth.users(id),
  name text,
  email text unique,
  phone_number text,
  created_at timestamptz default now()
);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) not null,
  user_id uuid references users(id) not null,
  role text default 'member', -- 'owner' | 'member'
  joined_at timestamptz default now(),
  unique(team_id, user_id)
);

create table invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) not null,
  email text not null,
  status text default 'pending', -- 'pending' | 'accepted'
  invited_by uuid references users(id),
  created_at timestamptz default now()
);

create table meetings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) not null,
  title text not null,
  meeting_date timestamptz not null,
  transcript_url text,               -- populated later by AI pipeline / hardware upload
  status text default 'pending',     -- 'pending' | 'processed'
  created_at timestamptz default now()
);

create table transcripts (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) not null,
  raw_text text,                     -- populated later by AI pipeline
  diarized_json jsonb,                -- populated later by AI pipeline
  created_at timestamptz default now()
);

create table action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) not null,
  task_description text not null,
  owner_id uuid references users(id),
  deadline date,
  created_at timestamptz default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  action_item_id uuid references action_items(id) not null,
  status text default 'todo',        -- 'todo' | 'in_progress' | 'done' | 'overdue'
  reminder_sent_at timestamptz,       -- populated later by WhatsApp reminder job
  created_at timestamptz default now()
);

create table personal_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  title text,
  recording_url text,                -- populated later by hardware upload
  raw_text text,                     -- populated later by AI pipeline
  status text default 'pending',
  created_at timestamptz default now()
);

create table personal_note_tasks (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references personal_notes(id) not null,
  task_description text not null,
  deadline date,
  status text default 'todo',
  created_at timestamptz default now()
);
```

**Design notes:**
- `team_members` is a junction table — a user can belong to multiple teams, each with its own role. Do not add `team_id`/`role` columns directly to `users`.
- `personal_notes` is fully separate from `meetings` — single-speaker, private to the user by default, no team visibility. Maps to the hardware's "hold-to-record" mode later.
- RLS must be enabled on every table. Pattern: check membership via `team_members` where `user_id = auth.uid()`, scoped to the relevant `team_id`.

---

## Auth Flow

1. `/get-started` — single "Continue with Google" button, calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: "${origin}/auth/callback" } })`
2. `/auth/callback/route.ts` — exchanges the PKCE code for a session. **Must read cookies via `next/headers` `cookies()` for `getAll()`**, not return an empty array — this is a known failure point that causes silent redirect loops back to `/get-started`.
3. On first login, a Postgres trigger on `auth.users` insert auto-creates a matching row in `public.users`.
4. New users with no pending invite land on `/dashboard` with zero teams — must be prompted to create one (CreateTeamButton modal).
5. Users with a matching pending `invites` row are auto-added to that team as `member` on signup.

---

## Core Pages — Functional Requirements

### `/dashboard` (global)
- Auth-gated, no sidebar
- Stat cards: total teams, total meetings, total tasks (aggregated across all teams user belongs to)
- List of team cards (name + role badge), each links to `/dashboard/team/{teamId}`
- "+ Create Team" modal — team name input → inserts `teams` row → inserts `team_members` row (role: owner) → redirects to new team's dashboard

### `/dashboard/team/[teamId]` (team dashboard)
- Sidebar with team switcher + nav (Dashboard/Meetings/Tasks/Invite)
- Validates the logged-in user is actually a member of `teamId` (query `team_members`) — redirect to `/dashboard` if not
- Stat cards: total meetings, total tasks, completed, overdue (scoped to this team only)
- Recent meetings list (last 3, sorted by date)

### `/dashboard/team/[teamId]/meetings`
- List of meetings for this team, sorted by date desc
- Status badge (pending = gray, processed = green)
- "+ Add Meeting" modal — title + date fields → inserts `meetings` row with this `team_id`, `status: pending`

### `/dashboard/team/[teamId]/tasks`
- Kanban board, 4 columns: todo / in_progress / done / overdue
- Each card shows task description + deadline, pulled via `action_items` joined through `tasks`
- "+ Add Task" modal — task description + owner (dropdown, populated from `team_members` joined to `users` for this team) + deadline → inserts `action_items` row, then inserts a linked `tasks` row with `status: todo`
- Task status should be changeable from the UI (dropdown or drag-drop) — updates `tasks.status`

### `/dashboard/team/[teamId]/invite`
- Owner-only (check role from `team_members`)
- Email input + "Send Invite" button → inserts `invites` row (`team_id`, `email`, `invited_by`)
- Confirmation message on success

---

## RLS Policy Pattern (apply to all tables)

```sql
-- Read access example (meetings)
create policy "Team members can view their team's meetings"
  on meetings for select
  using (
    team_id in (select team_id from team_members where user_id = auth.uid())
  );

-- Write access example (owner-only actions)
create policy "Only owners can insert meetings"
  on meetings for insert
  with check (
    team_id in (
      select team_id from team_members
      where user_id = auth.uid() and role = 'owner'
    )
  );
```

Apply equivalent read/write policies to: `teams`, `team_members`, `invites`, `users`, `meetings`, `transcripts`, `action_items`, `tasks`, `personal_notes`, `personal_note_tasks`.

---

## Deferred: AI Pipeline (build later — leave integration points only)

Do NOT implement the actual ML logic now. Just leave these as clearly marked stub functions/routes so it's a clean drop-in later:

- `ml-service/app/routes/transcribe.py` — stub endpoint `POST /transcribe` (accepts audio file reference, returns placeholder `{ status: "not_implemented" }`)
- `ml-service/app/routes/diarize.py` — stub endpoint `POST /diarize`
- `ml-service/app/routes/extract.py` — stub endpoint `POST /extract` (will eventually call LLM API, return structured action items)
- `backend/src/services/llmExtraction.service.js` — stub function `extractActionItems(transcriptText)` that currently just returns `[]` or throws `NotImplementedError`
- `backend/src/services/ownerMatching.service.js` — stub function `matchOwnerByVoice(speakerEmbedding)` returning `null`

Wire these into the meeting flow conceptually (e.g., when a meeting's `transcript_url` is populated, something SHOULD eventually call extract → populate `action_items`), but the actual body stays a placeholder/TODO comment.

---

## Deferred: Hardware Ingestion (build later — leave integration points only)

The physical device (ESP32 + mic) will eventually POST recorded audio here. Leave these ready but unimplemented beyond basic file receipt:

- `backend/src/routes/hardware.routes.js` — stub route `POST /meetings/upload-hardware`
  - Expected payload: `{ team_id, recording_type: "full_meeting" | "personal_note", audio_file }`
  - On `full_meeting`: create a `meetings` row (`status: pending`), store audio in Supabase Storage, set `transcript_url`
  - On `personal_note`: create a `personal_notes` row instead
  - For now: just accept the file, store it in Supabase Storage, create the DB row with `status: pending` — do NOT trigger any processing yet, that depends on the AI pipeline above

This route is the single integration point the hardware team needs — once built, the ESP32 firmware just needs to know this one endpoint and payload shape.

---

## What "done" looks like for this build pass

- Google login works end-to-end, session persists correctly
- User with no team can create one, lands on that team's dashboard
- User can add a meeting manually (title + date) and see it in the list
- User can add a task manually (description + owner + deadline) and see it on the kanban board, move it between columns
- Owner can invite a teammate by email; that teammate joins the correct team automatically on their first Google login
- A user can belong to multiple teams and switch between them, each showing only its own scoped data
- RLS is enabled and enforced on every table — tested by confirming a second team's data is NOT visible to a user not on that team
- `hardware.routes.js` and the ML service stub routes exist and return placeholder responses without erroring

# NudgeIQ Progress Log

## Phase 1 — Stabilize the Base

### What was built
1. **Server-Side Service-Role Admin Client**:
   - Created `backend/src/config/supabaseAdmin.js` using `@supabase/supabase-js` configured strictly for backend-only execution with `persistSession: false`.
   - Exported `supabaseAdmin` alongside existing client in `backend/src/services/supabase.service.js`.

2. **Health Check Endpoints Verified**:
   - Backend Express API: `GET /health` on port 4000 returns `{"status": "ok", "service": "backend"}`.
   - AI FastAPI Service: `GET /health` on port 8000 returns `{"status": "ok", "service": "ml-service"}`.

3. **Row-Level Security (RLS) Policy Specifications**:
   - Formulated clean, non-recursive RLS policies in `supabase/migrations/0002_rls.sql` for `teams`, `team_members`, `users`, `meetings`, `transcripts`, `action_items`, and `tasks`.
   - Application layer enforcement verified in `web/app/dashboard/team/[teamId]/layout.tsx` (redirects if not a team member) and `web/app/dashboard/page.tsx` (queries scoped by `team_members`).

4. **Phase 1 Acceptance Suite**:
   - Built automated test script `backend/test_phase1.js` checking:
     - Backend `/health` status (200 OK)
     - AI service `/health` status (200 OK)
     - Supabase Admin connectivity
     - RLS Team Isolation verification (User A in Team 1 cannot view Team 2's meetings)

### How to test Phase 1
Run the automated acceptance test script:
```powershell
cd backend
node test_phase1.js
```

### Known gaps & notes
- Running the `supabase/migrations/0002_rls.sql` SQL in the Supabase Dashboard SQL Editor ensures database-level enforcement alongside the existing application-level route guards.

---

## Phase 2 — Audio Upload

### What was built
1. **Schema Migration & Supabase Storage**:
   - Authored `supabase/migrations/0002_pipeline.sql` for meeting upload and processing state tracking.
   - Initialized and configured private Supabase Storage bucket `recordings` via `supabaseAdmin.storage`.

2. **Backend API Endpoints (`backend/src/routes/meetings.routes.js`)**:
   - `POST /api/meetings`: creates a meeting with `{ team_id, title, meeting_date }`, returning HTTP 201 with `{ meeting_id }`.
   - `POST /api/meetings/:meetingId/audio`: multipart audio file upload (supporting mp3, wav, m4a, mp4, webm, ogg up to 200MB).
     - Validates caller JWT Authorization Bearer token against `team_members` for the meeting's team.
     - Uploads file buffer to Supabase Storage at `{team_id}/{meeting_id}/{filename}`.
     - Updates meeting row status to `'uploaded'`, returning HTTP 200 `{ meeting_id, audio_path, processing_status: "uploaded" }`.
   - `POST /api/meetings/:meetingId/process`: triggers on-demand pipeline processing for uploaded audio.

3. **Frontend UI Integration**:
   - Updated `web/components/AddMeetingButton.tsx` with an optional audio file input. Seamless flow: create meeting -> upload audio file -> redirect to meeting detail view.
   - Updated meeting detail page (`web/app/dashboard/team/[teamId]/meetings/[meetingId]/page.tsx`) to show `Audio Uploaded` status badge.
   - Created `web/components/ProcessNowButton.tsx` rendering an interactive "Process Now" action on uploaded meetings.

4. **Phase 2 Acceptance Suite**:
   - Built automated test script `backend/test_phase2.js` checking:
     - Meeting creation via `POST /api/meetings` (HTTP 201)
     - Audio upload via `POST /api/meetings/:meetingId/audio` (HTTP 200)
     - Storage file presence in bucket `recordings`
     - Database status transition to `'uploaded'`
     - Cross-team authorization enforcement (HTTP 403 Forbidden on unauthorized user)

### How to test Phase 2
Run the automated acceptance test script:
```powershell
cd backend
node test_phase2.js
```


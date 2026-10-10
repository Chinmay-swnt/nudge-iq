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

---

## Phase 3 — AI Pipeline & Processing

### What was built
1. **End-to-End Processing Architecture (`backend/src/services/pipeline.service.js`)**:
   - Implemented `processMeetingAudio`: Audio ingestion $\to$ Speech-to-Text $\to$ Action Item / Summary Extraction $\to$ Owner Matching $\to$ Idempotent Database Persistence.
   - Status progression lifecycle: Transitions meeting through `created` $\to$ `uploaded` $\to$ `transcribing` $\to$ `extracting` $\to$ `processed` (or `failed` with error recording).
   - Schema resilience: Graceful fallback for base schema configurations where optional migration columns (`summary`, `processing_status`) may not yet be run.

2. **Backend API Endpoints**:
   - `POST /api/meetings/:meetingId/process`: On-demand AI processing trigger with JWT authentication and team isolation verification.
   - `POST /meetings/process-audio`: Direct multipart form upload & pipeline trigger for audio recordings from the dashboard.

3. **Transcription & High-Precision Extraction**:
   - Faster-Whisper integration in `ai-service/app/routes/transcribe.py` for local, offline transcription.
   - LLM/NLP extraction in `ai-service/app/routes/extract.py` with Node.js fallback in `backend/src/services/llmExtraction.service.js`.
   - Automatic relative deadline parsing ("tomorrow", "by Friday", "in 2 days") and team member owner matching by spoken names/emails.

4. **Frontend UI Enhancements**:
   - Updated meeting detail page (`web/app/dashboard/team/[teamId]/meetings/[meetingId]/page.tsx`):
     - Displays synthesized **Executive Summary** and **Key Operational Decisions**.
     - Renders diarized dialogue and audio processing status badges.
     - Interactive `ProcessNowButton` triggers backend processing and refreshes page data.

5. **Phase 3 Acceptance Suite (`backend/test_phase3.js`)**:
   - Built automated test script checking:
     - Meeting creation via `POST /api/meetings` (HTTP 201)
     - Audio upload via `POST /api/meetings/:meetingId/audio` (HTTP 200)
     - Processing execution via `POST /api/meetings/:meetingId/process` (HTTP 200)
     - Database persistence for `transcripts` (raw text + structured JSON)
     - Database persistence for `action_items` and linked `tasks` with status `'todo'`
     - Meeting record status transition to `'processed'`
     - Cross-team authorization enforcement (HTTP 403 Forbidden on unauthorized user)
     - End-to-end extraction with action items, deadline parsing, and owner matching

### How to test Phase 3
Run the automated acceptance test script:
```powershell
cd backend
node test_phase3.js
```

---

## Phase 4 — Task Nudges & Automated Reminders

### What was built
1. **Automated Reminder & Nudge Engine (`backend/src/services/reminder.service.js`)**:
   - `evaluateTasksForReminders`: Sweeps active tasks and evaluates deadlines against current date.
   - Categorizes task alerts into:
     - `due_soon`: Deliverable due within $\le 24$ hours ($[today, tomorrow]$).
     - `overdue`: Deadline in the past $\to$ automatically transitions task `status` to `'overdue'` in the database.
     - `escalation`: Task overdue by $> 48$ hours $\to$ alerts team owner for manager intervention.
   - Formats conversational WhatsApp/SMS nudge templates with assignee names, task commitments, and meeting references.
   - Pluggable notification dispatcher supporting Webhooks, WhatsApp Meta API, and SMS.
   - **Idempotency Guard**: Prevents re-alerting already-notified tasks on the same day via `tasks.reminder_sent_at` and `reminders_log`.

2. **Backend API Endpoints (`backend/src/routes/reminder.routes.js`)**:
   - `POST /api/reminders/sweep`: Automated cron/worker endpoint to evaluate and dispatch nudges across all teams.
   - `POST /api/reminders/nudge/:taskId`: On-demand manual nudge action, authenticated via JWT with strict team membership authorization.
   - `GET /api/reminders/logs/:taskId`: History of sent reminders and current task reminder state.
   - `GET /api/reminders/stats`: High-level metrics on reminded and overdue tasks.

3. **Hardware Ingestion & Personal Notes Pipeline (`backend/src/routes/hardware.routes.js`)**:
   - Enhanced `POST /meetings/upload-hardware` to auto-trigger Phase 3 AI pipeline processing for ESP32 hardware uploads (`full_meeting`).
   - Integrated personal voice memo processing: Saves to `personal_notes` and extracts personal tasks into `personal_note_tasks`.

4. **Frontend UI Integration (`web/components/TaskCard.tsx`)**:
   - Added interactive **"⚡ Nudge"** button to each active task card on the Kanban board and meeting matrix.
   - Dispatches on-demand nudges to the task owner with real-time UI status feedback (*"Nudging…"*, *"Nudged!"*).

5. **Phase 4 Acceptance Suite (`backend/test_phase4.js`)**:
   - Built automated test script checking:
     - Test task initialization with `due_soon` and `overdue` deadlines
     - Automated sweep execution via `POST /api/reminders/sweep` (HTTP 200)
     - Automatic database status transition to `'overdue'` and `reminder_sent_at` update
     - Sweep idempotency enforcement on same-day executions
     - Manual on-demand task nudge execution via `POST /api/reminders/nudge/:taskId` (HTTP 200)
     - Cross-team authorization security (unauthorized user blocked with HTTP 403 Forbidden)
     - ESP32 hardware meeting ingestion via `POST /meetings/upload-hardware` (HTTP 201)
     - Personal voice memo ingestion and task creation (HTTP 201)

### How to test Phase 4
Run the automated acceptance test script:
```powershell
cd backend
node test_phase4.js
```

### Full Regression Suite (All Phases 1–4)
```powershell
cd backend
node test_phase1.js
node test_phase2.js
node test_phase3.js
node test_phase4.js
```

---

## Phase 5 — Local LLM Action Item Extraction (Ollama)

### What was built
1. **Ollama Integration & Model Configuration**:
   - Automated local setup of Ollama on Windows running on `http://localhost:11434`.
   - Downloaded and configured `llama3.2:3b` (~2.0 GB, lightweight, fast CPU inference, fits comfortably within 16GB RAM).
   - Replaced fragile hardcoded verb regex heuristics in `ai-service/app/routes/extract.py` with structured LLM JSON extraction.
   - Built an owner-matching resolver to fuzzy-match LLM-extracted names against registered team members to ensure Supabase `user_id` resolution.
   - Maintained a resilient fallback to the rule-based extractor if Ollama is ever offline.

2. **Reprocess API Endpoint (`backend/src/routes/meetings.routes.js`)**:
   - `POST /api/meetings/:meetingId/reprocess`: On-demand re-extraction of existing meeting transcripts through the local LLM without re-uploading or re-transcribing audio.

3. **Frontend UI Integration**:
   - Updated `ProcessNowButton.tsx` and `page.tsx` with a **"Reprocess with AI"** button for processed meetings.

### How to test Phase 5
1. Ensure Ollama service is running:
   ```powershell
   ollama list
   ```
2. Start the AI service:
   ```powershell
   cd ai-service
   python -m uvicorn app.main:app --port 8000 --reload
   ```
3. Test LLM extraction status endpoint:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:8000/llm-status"
   ```

---

## Phase 6 — UI for Results

### What was built
1. **Interactive Meeting Results View (`web/components/MeetingResultsView.tsx`)**:
   - **Executive Summary & Key Decisions Card**: High-level bulleted summary and decisions card displayed above meeting transcript and tasks.
   - **"Needs Review" Section**: Dedicated triage card list for action items flagged with `needs_review: true` or unassigned owner (`owner_id: null`).
     - Inline editable task description and deadline datepicker.
     - Owner dropdown selector mapped to verified team members.
     - **"✓ Approve" Action**: Persists edits to the backend, sets `needs_review = false`, immediately generates/links a corresponding task row in `tasks` with status `'todo'`, and transitions the card into the Assigned Action Items list.
     - **"✕ Delete" Action**: Deletes the action item and linked tasks with immediate reactive UI removal.
   - **Assigned Action Items List**: Displays assigned commitments with owner pill, deadline, and an interactive **"🔍 Source Quote"** button.
   - **Verbatim Transcript with Interactive Quote Highlighting**:
     - Speaker-labelled dialogue turns with timestamp chips.
     - Clicking "🔍 Source Quote" on any action item highlights the exact dialogue turn (`source_quote`) with an amber ring & background glow, smoothly auto-scrolling it into view.

2. **Real-Time Processing Polling Badge (`web/components/ProcessingStatusBadge.tsx`)**:
   - Replaced static status pills on the meeting detail page with an auto-polling badge.
   - Polls `GET /api/meetings/:meetingId/status` every 5 seconds while meeting is in `transcribing` or `extracting` state.
   - Automatically triggers Next.js router refresh once processing transitions to `processed`.

3. **Task Board (Kanban) Enhancements (`web/components/TaskCard.tsx` & `tasks/page.tsx`)**:
   - Shows circular owner avatar badge with team member initials (e.g., "MK", "CS", or "U" for unassigned).
   - Formatted deadline badge with overdue indicator styling.
   - Dedicated **"AI EXTRACTED"** badge when `created_by = 'ai'`.
   - Direct status change dropdown updating `tasks.status` in Supabase in real-time.

4. **Backend API Endpoints (`backend/src/routes/meetings.routes.js`)**:
   - `GET /api/meetings/:meetingId/status`: Fast, lightweight status polling endpoint for the frontend.
   - `PATCH /api/meetings/action-items/:id`: Updates task description, owner ID, deadline, and creates linked `tasks` row with status `'todo'`. Includes fallback for DB schema drift (`42703`).
   - `DELETE /api/meetings/action-items/:id`: Cleanly cascades removal across `tasks` and `action_items`.

### How to test Phase 6
1. Visit a meeting page: `http://localhost:3000/dashboard/team/<teamId>/meetings/<meetingId>`.
2. Inspect the **"Needs Review"** section: assign an owner from the dropdown and click **"✓ Approve"**.
3. Verify the item moves to **"Assigned Action Items"**.
4. Click **"🔍 Source Quote"** to see the verbatim speaker turn highlighted in the transcript.
5. Navigate to the **Tasks** board: `http://localhost:3000/dashboard/team/<teamId>/tasks` and confirm the task appears with owner initials avatar and AI badge.






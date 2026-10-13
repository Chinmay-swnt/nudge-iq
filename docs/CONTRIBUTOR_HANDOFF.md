# NudgeIQ — Project Status, Completed Work & Future Roadmap

> **Target Audience:** Engineering contributors, team members, and collaborators.  
> **Objective:** Comprehensive overview of the project architecture, features delivered across Phases 1–6, and actionable roadmap of upcoming work.

---

## 1. Project High-Level Architecture

NudgeIQ is an AI-first workspace tool that captures meeting audio, transcribes it locally, extracts structured action items with assigned owners and deadlines via a local LLM, and provides automated follow-ups (nudges).

```
                        ┌──────────────────────────────────────────────┐
                        │              NudgeIQ Monorepo                │
                        └──────────────────────┬───────────────────────┘
                                               │
         ┌───────────────────┬─────────────────┴─────────────────┬───────────────────┐
         ▼                   ▼                                   ▼                   ▼
   [ web/ ]            [ backend/ ]                       [ ai-service/ ]      [ mobile/ ]
   Next.js 15          Node.js / Express                  Python / FastAPI     Flutter App
   React 19, Tailwind  Pipeline & Reminder Engine         Faster-Whisper STT   Task management,
   Kanban, Review UI   Supabase Admin SDK                 Ollama (Llama 3.2)   Meetings viewer
         │                   │                                   ▲                   │
         └─────────┬─────────┴───────────────────────────────────┼───────────────────┘
                   ▼                                             │
      ┌─────────────────────────┐                                │
      │   Supabase (PostgreSQL) │                                │
      │   Auth + RLS + Storage  │                                │
      └─────────────────────────┘                                │
                   ▲                                             │
                   └─────────────────────────────────────────────┘
```

### Core Technologies
- **Frontend (`web/`):** Next.js 15 App Router, TypeScript, Tailwind CSS, Supabase SSR Auth (Google OAuth).
- **Backend (`backend/`):** Node.js / Express, Supabase Service Role Admin Client, Puppeteer (Meeting Bot), automated cron sweeps.
- **AI Engine (`ai-service/`):** FastAPI, Faster-Whisper (offline Speech-to-Text), Ollama (`llama3.2:3b` structured JSON extraction, runs on 16GB RAM).
- **Mobile (`mobile/`):** Flutter companion app (My Tasks, status toggling, meeting details, offline demo mode).
- **Database & Storage (`supabase/`):** Supabase PostgreSQL, Row-Level Security (RLS) policies, private bucket `recordings`.

---

## 2. Completed Phases & Deliverables (Phases 1 — 6)

### ✅ Phase 1: Base Stabilization & Security
- **Service-Role Backend Admin:** Dedicated client in `backend/src/config/supabaseAdmin.js` with isolated backend privileges.
- **Row-Level Security (RLS):** Non-recursive isolation policies ensuring team members can only access data belonging to their respective `team_id`.
- **Health Verification:** `/health` endpoints live across Backend (4000) and AI Service (8000).
- **Acceptance:** Validated via `backend/test_phase1.js`.

### ✅ Phase 2: Audio Ingestion & Storage Pipeline
- **Storage Bucket:** Private bucket `recordings` configured with scoped path storage (`{teamId}/{meetingId}/{file}`).
- **Audio Upload API:** `POST /api/meetings/:meetingId/audio` supporting audio/video formats up to 200MB.
- **Cross-Team Guards:** Token validation preventing unauthorized cross-team uploads.
- **UI:** Audio file uploader embedded directly in meeting creation.
- **Acceptance:** Validated via `backend/test_phase2.js`.

### ✅ Phase 3: AI Transcription Pipeline
- **Faster-Whisper Integration:** Offline local STT converting recorded audio into timestamps and verbatim dialogue turns.
- **Pipeline Orchestrator:** `backend/src/services/pipeline.service.js` coordinating:
  $$\text{Audio} \longrightarrow \text{Faster-Whisper} \longrightarrow \text{Action Extraction} \longrightarrow \text{Owner Matching} \longrightarrow \text{DB Persistence}$$
- **Lifecycle States:** Tracking meetings through `uploaded` $\to$ `transcribing` $\to$ `extracting` $\to$ `processed` (or `failed`).
- **Database Storage:** Storing raw text, diarized dialogue turns, and executive summaries.
- **Acceptance:** Validated via `backend/test_phase3.js`.

### ✅ Phase 4: Task Nudges & Automated Reminders
- **Deadline Sweep Engine:** `backend/src/services/reminder.service.js` periodically evaluating active tasks:
  - `due_soon`: Deliverables due within $\le 24$ hours.
  - `overdue`: Auto-transitions `tasks.status` to `'overdue'`.
  - `escalation`: Notifies managers for deliverables overdue by $> 48$ hours.
- **Idempotency Safeguard:** Prevents spamming users on identical dates using `reminder_sent_at`.
- **Manual Nudges:** Instant **"⚡ Nudge"** button on task cards.
- **Hardware Integration Point:** `POST /meetings/upload-hardware` accepting ESP32 mic audio for full meetings and single-speaker voice memos (`personal_notes`).
- **Acceptance:** Validated via `backend/test_phase4.js`.

### ✅ Phase 5: Local LLM Extraction (Ollama)
- **Local LLM Engine:** Integrated Ollama with `llama3.2:3b` (~2.0 GB, lightweight, fast CPU inference).
- **Structured JSON Schema:** Replaced brittle regex heuristics with structured extraction:
  - Task commitment description.
  - Assignee resolution against team member names/emails.
  - Relative deadline normalization (`"tomorrow"`, `"by Friday"` $\to$ ISO date).
  - Verbatim `source_quote` capturing spoken sentences from transcript.
- **Reprocess API:** `POST /api/meetings/:id/reprocess` allowing re-extraction without re-transcribing audio.
- **Acceptance:** Validated via `backend/test_phase5.js`.

### ✅ Phase 6: Results UI & Action Item Triage
- **Meeting Detail View:**
  - Executive summary & operational decisions card.
  - Speaker-labelled verbatim transcript with timestamp badges.
  - **Interactive Source Quote Highlighting:** Clicking "🔍 Source Quote" on any action item highlights and smoothly scrolls to the exact dialogue turn in the transcript.
- **"Needs Review" Section:**
  - Triage section for AI items needing verification (`needs_review = true` or `owner_id = null`).
  - Inline editing of description and deadline.
  - Team member owner dropdown.
  - **"✓ Approve" Action:** Persists to backend, marks `needs_review = false`, generates linked task on Kanban board.
  - **"✕ Delete" Action:** Removes item with cascading database cleanup.
- **Enhanced Task Board:** Kanban cards with owner initials avatar (`MK`, `CS`, `U`), `AI EXTRACTED` badge, deadline pills, and real-time status dropdowns.
- **Real-Time Polling Badge:** 5-second polling on `GET /api/meetings/:id/status` during processing states.
- **Acceptance:** Validated via `backend/test_phase6.js`.

---

## 3. Current System State & Regression Test Suite

All 6 phases have automated acceptance scripts in `backend/` that run end-to-end against live database and service endpoints:

```powershell
cd backend
node test_phase1.js   # RLS & base health
node test_phase2.js   # Audio upload & Supabase storage
node test_phase3.js   # Faster-Whisper pipeline
node test_phase4.js   # Task reminders, nudges & hardware upload
node test_phase5.js   # Ollama LLM extraction & reprocess
node test_phase6.js   # Results UI triage, status polling & approval
```

---

## 4. What's Next: Upcoming Roadmap

Here is what remains to be built or expanded, organized by priority:

### Priority 1: Mobile App Polishing & Release (`mobile/`)
*The Flutter app core is written (Auth, My Tasks, Meetings, Add Task, Demo Mode), but needs field-testing.*
- **Google OAuth Mobile Callback:** Complete deep-link redirection (`io.supabase.nudgeiq://login-callback`) with Supabase in Google Cloud Console.
- **Push Notifications Integration:** Replace `mobile/lib/services/notification_service.dart` placeholder with Firebase Cloud Messaging (FCM) or local notifications when tasks are assigned or nudged.
- **Real-Time Sync:** Add Supabase real-time channel listeners (`tasks` table) so mobile task status reflects changes made on the web dashboard instantly.

### Priority 2: External Messaging Channels for Nudges
*Phase 4 created the nudge engine and message templates; delivery currently logs and dispatches via generic webhook.*
- **WhatsApp Cloud API Integration:** Wire official Meta WhatsApp Business API credentials into `reminder.service.js` for WhatsApp nudges to assignees with registered `phone_number`.
- **Slack / Discord Webhooks:** Add workspace webhook URLs in team settings for posting meeting summaries and newly generated action items to channels.

### Priority 3: Virtual Meeting Bot Enhancement (`backend/src/listener/`)
*Puppeteer bot skeleton exists in `bot.service.js`.*
- **Meeting Audio Capture:** Capture audio stream from virtual call tabs (Google Meet, Zoom web client) and pipe directly into `processMeetingAudio`.
- **Bot Auto-Leave Trigger:** Detect call end or low participant count to automatically stop recording and initiate transcription.

### Priority 4: ESP32 Hardware Firmware Verification
- **Firmware Integration:** Verify the physical ESP32 microphone recording flow against `POST /meetings/upload-hardware`.
- **Dual-Mode Testing:** Full meeting recording vs. quick press personal voice memo (`personal_notes`).

---

## 5. Quick Reference for Contributors

### Service Ports
| Service | Directory | Command | URL / Port |
|---|---|---|---|
| Ollama LLM | System | `ollama serve` | `http://localhost:11434` |
| AI Service | `ai-service/` | `uvicorn app.main:app --port 8000 --reload` | `http://localhost:8000` |
| Express Backend | `backend/` | `pnpm start` | `http://localhost:4000` |
| Web Dashboard | `web/` | `pnpm dev` | `http://localhost:3000` |
| Mobile Companion | `mobile/` | `flutter run` | Mobile / Emulator |

### Essential Files
- Pipeline Orchestrator: [`backend/src/services/pipeline.service.js`](file:///c:/Projects/nudge-iq/backend/src/services/pipeline.service.js)
- Ollama Extraction: [`ai-service/app/routes/extract.py`](file:///c:/Projects/nudge-iq/ai-service/app/routes/extract.py)
- Meeting Detail & Triage UI: [`web/components/MeetingResultsView.tsx`](file:///c:/Projects/nudge-iq/web/components/MeetingResultsView.tsx)
- Task Board & AI Tags: [`web/components/TaskCard.tsx`](file:///c:/Projects/nudge-iq/web/components/TaskCard.tsx)
- Test Suite: [`backend/test_phase1.js`](file:///c:/Projects/nudge-iq/backend/test_phase1.js) – [`test_phase6.js`](file:///c:/Projects/nudge-iq/backend/test_phase6.js)

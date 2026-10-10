# NudgeIQ 🚀

AI-powered meeting transcription, structured local LLM action-item extraction, interactive transcript triage, task nudges, and multi-workspace tracking for teams.

---

## 🏗️ Architecture Overview

- **Web Dashboard (`web/`)**: Next.js 15 (React 19), Tailwind CSS, Supabase Auth (Google OAuth), Real-time Kanban board, and Interactive transcript review with quote highlighting.
- **Backend API (`backend/`)**: Node.js & Express API, Supabase Admin service-role integration, audio processing orchestrator, automated periodic deadline sweep & WhatsApp/SMS reminder dispatcher.
- **AI Service (`ai-service/`)**: FastAPI, Faster-Whisper local speech-to-text, and local LLM extraction via Ollama (`llama3.2:3b`).
- **Mobile Companion (`mobile/`)**: Flutter app for personal task tracking, meeting review, and status updates.
- **Database & Storage (`supabase/`)**: PostgreSQL with Row-Level Security (RLS) policies and private Supabase storage bucket (`recordings`).

---

## ⚡ Prerequisites

1. **Node.js** (v18+) & **pnpm** (`npm i -g pnpm`)
2. **Python** (3.10 – 3.13)
3. **Ollama** (for local offline LLM action-item extraction)
   - Windows: Download & install from [ollama.com/download](https://ollama.com/download)
   - macOS / Linux: `curl -fsSL https://ollama.com/install.sh | sh`

---

## 📦 Setup & Installation

### 1. Setup Local LLM (Ollama)

Ensure Ollama is running and download the lightweight 3B model (~2.0 GB, optimized for fast CPU inference within 16GB RAM):

```powershell
# Pull the required model
ollama pull llama3.2:3b

# Verify Ollama is serving
ollama list
```

---

### 2. Install Project Dependencies

```powershell
# 1. Web Dashboard
cd web
pnpm install

# 2. Backend API
cd ../backend
pnpm install

# 3. AI Service (Faster-Whisper + FastAPI)
cd ../ai-service
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

---

### 3. Environment Variables

Create `.env` in `backend/` and `.env.local` in `web/`:

#### **`backend/.env`**
```env
PORT=4000
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# AI Service Configuration
AI_SERVICE_URL=http://localhost:8000

# Automated Reminders & Deadline Sweep (Runs in background)
ENABLE_AUTO_SWEEP=true
REMINDER_SWEEP_INTERVAL_MS=3600000
```

#### **`web/.env.local`**
```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

---

## 🚀 Running the Application

Open 4 terminal windows (or start background daemons):

### Terminal 1: Ollama Service
```powershell
ollama serve
```

### Terminal 2: AI Service (Port 8000)
```powershell
cd ai-service
.\venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Terminal 3: Backend API (Port 4000)
```powershell
cd backend
pnpm start
```

### Terminal 4: Web Dashboard (Port 3000)
```powershell
cd web
pnpm dev
```

---

## 🧪 Running Acceptance & Regression Tests

Run the automated acceptance test suite for all built phases (Phases 1 through 6):

```powershell
cd backend
node test_phase1.js   # Base health & RLS multi-team isolation
node test_phase2.js   # Audio file upload & storage bucket
node test_phase3.js   # Faster-Whisper AI transcription & pipeline
node test_phase4.js   # Task nudges, deadline sweep & hardware ingestion
node test_phase5.js   # Local LLM action-item extraction (Ollama llama3.2:3b)
node test_phase6.js   # Results UI, approval workflow & fast status polling
```

---

## 🌐 Endpoints & URLs

- **Web Dashboard**: [http://localhost:3000](http://localhost:3000)
- **Backend Health**: [http://localhost:4000/health](http://localhost:4000/health)
- **AI Service Health**: [http://localhost:8000/health](http://localhost:8000/health)
- **LLM Status Check**: [http://localhost:8000/llm-status](http://localhost:8000/llm-status)
- **Ollama Engine**: [http://localhost:11434](http://localhost:11434)

# NudgeIQ 🚀

AI-powered meeting transcription, structured local LLM action-item extraction, interactive transcript triage, task nudges, automated live meeting bot (Google Meet & Zoom), and multi-workspace tracking for teams.

---

## 🏗️ Architecture Overview

- **Web Dashboard (`web/`)**: Next.js 15 (React 19), Tailwind CSS, Supabase Auth (Google OAuth), Real-time Kanban board, Interactive transcript review, Meeting bot dispatcher & Audio upload modal.
- **Backend API (`backend/`)**: Node.js & Express API, Puppeteer + `puppeteer-stream` headless meeting bot with zero-echo digital audio isolation, Supabase Admin service-role integration, automated background pipeline processing.
- **AI Service (`ai-service/`)**: FastAPI, Faster-Whisper local speech-to-text (`base` model, int8 CPU quantization, multilingual auto-detect), and local LLM extraction via Ollama (`llama3.2:3b`). Automatically manages and auto-starts Ollama if not running.
- **Database & Storage (`supabase/`)**: PostgreSQL with Row-Level Security (RLS) policies and private Supabase storage buckets (`recordings`).

---

## ⚡ Prerequisites

Before getting started, make sure you have the following installed on your machine:

1. **Git**: [git-scm.com](https://git-scm.com/)
2. **Node.js** (v18 or higher): [nodejs.org](https://nodejs.org/)
3. **pnpm** (Package manager):
   ```bash
   npm install -g pnpm
   ```
4. **Python** (3.10 – 3.13): [python.org](https://www.python.org/) (Ensure _"Add Python to PATH"_ is checked during installation)
5. **Ollama** (Local offline LLM engine):
   - **Windows**: Download installer from [ollama.com/download](https://ollama.com/download)
   - **macOS / Linux**:
     ```bash
     curl -fsSL https://ollama.com/install.sh | sh
     ```

---

## 📥 1. Clone the Repository

```bash
git clone <repository-url>
cd nudge-iq
```

---

## 🤖 2. Setup Local Models (Ollama & Whisper)

### Pull the Local LLM Model

Ensure Ollama is installed and pull the required `llama3.2:3b` model (lightweight ~2.0 GB model optimized for CPU inference):

```bash
# Pull Llama 3.2 3B model
ollama pull llama3.2:3b

# Verify model is ready
ollama list
```

_(Note: The AI service also auto-detects and launches `ollama.exe serve` if it is not already running on port 11434)._

### Speech-to-Text (Faster-Whisper)

Faster-Whisper (`base` model) will download automatically on first run inside `ai-service/` and runs 100% locally on CPU without requiring an external API key or GPU.

---

## 📦 3. Install Dependencies

Install all dependencies across the services:

### A. Web Dashboard

```bash
cd web
pnpm install
cd ..
```

### B. Backend API

```bash
cd backend
pnpm install
cd ..
```

### C. AI Service (Python FastAPI)

```bash
cd ai-service

# Create and activate Python virtual environment
# Windows (PowerShell):
python -m venv venv
.\venv\Scripts\Activate.ps1

# macOS / Linux:
# python3 -m venv venv
# source venv/bin/activate

# Install requirements (FastAPI, Faster-Whisper, Ollama client, etc.)
pip install -r requirements.txt
cd ..
```

---

## ⚙️ 4. Environment Variables Configuration

Create the environment files in `backend/` and `web/`:

---

## 🚀 5. Running the Application

Open **3 separate terminal windows** to start the local stack:

### Terminal 1: AI Service (Port 8000)

```powershell
cd ai-service
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

_(On macOS/Linux replace `.\venv\Scripts\Activate.ps1` with `source venv/bin/activate`)_

### Terminal 2: Backend API (Port 4000)

```powershell
cd backend
pnpm start
```

### Terminal 3: Web Dashboard (Port 3000)

```powershell
cd web
pnpm dev
```

---

## 🎯 How to Use

1. **Access Web App**: Open [http://localhost:3000](http://localhost:3000) in your browser.
2. **Sign In**: Sign in using your Google account or demo credentials.
3. **Dispatch Meeting Bot**:
   - Navigate to your team dashboard.
   - Click **Send Bot**.
   - Paste a **Google Meet** or **Zoom** link.
   - In your meeting room, click **Admit** when the bot requests entry.
   - The bot records with digital zero-echo isolation and captures real participant dialogue.
   - Click **Stop Bot** when your meeting ends. The audio is transcribed with Faster-Whisper and parsed for action items using Ollama in the background.
4. **Upload Recorded Audio**:
   - Click **Upload Audio** (`.mp3`, `.wav`, `.m4a`, `.webm`).
   - The modal returns immediately (HTTP 202) and tracks background pipeline status (`uploading` → `transcribing` → `extracting` → `processed`).

---

## 🧪 Quick Health Checks & Verification

You can verify all microservices are responding:

```powershell
# Backend Health
curl http://localhost:4000/health
# {"status":"ok","service":"backend"}

# AI Service Health
curl http://localhost:8000/health
# {"status":"ok","service":"ml-service"}

# Ollama Tags / Models
curl http://localhost:11434/api/tags
```

---

## 📁 Repository Structure

```
nudge-iq/
├── ai-service/             # FastAPI speech & LLM inference microservice
│   ├── app/
│   │   ├── routes/         # /transcribe (Faster-Whisper) & /extract (Ollama)
│   │   └── main.py         # App entrypoint & Ollama auto-start manager
│   └── requirements.txt
├── backend/                # Express.js REST API
│   ├── src/
│   │   ├── routes/         # Meetings, pipeline, reminders, hardware
│   │   ├── services/       # bot.service (Puppeteer), pipeline, transcription
│   │   └── index.js
│   └── recordings/         # Temporary local storage for in-flight meeting recordings
├── web/                    # Next.js 15 Web Application
│   ├── app/                # App router (dashboard, meetings, team views)
│   └── components/         # Modals, Kanban, Action items, bot banners
└── supabase/               # Database schema & migrations
```

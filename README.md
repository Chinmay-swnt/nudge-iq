# NudgeIQ 🚀

AI-powered meeting transcription, action-item extraction, and task tracking for teams.

---

## ⚡ Quickstart

### 1. Prerequisites
- **Node.js** (v18+) & **pnpm** (`npm i -g pnpm`)
- **Python** (3.10 – 3.13)

---

### 2. Install Dependencies

```powershell
# Web Dashboard
cd web
pnpm install

# Backend API
cd ../backend
pnpm install

# AI Service (Local Whisper + NLP)
cd ../ai-service
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

---

### 3. Environment Variables

Create `.env` in `backend/` and `.env.local` in `web/`:

**`backend/.env`**
```env
PORT=4000
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

**`web/.env.local`**
```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

---

### 4. Run the Project

Open 3 terminal windows:

#### Terminal 1: AI Service (Port 8000)
```powershell
cd ai-service
.\venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Terminal 2: Backend API (Port 4000)
```powershell
cd backend
pnpm start
```

#### Terminal 3: Web Dashboard (Port 3000)
```powershell
cd web
pnpm dev
```

---

## 🌐 URLs
- **Web App**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:4000/health](http://localhost:4000/health)
- **AI Service**: [http://localhost:8000/health](http://localhost:8000/health)

import os
import subprocess
import time
import httpx
from fastapi import FastAPI
from app.routes import transcribe, diarize, extract


def ensure_ollama_running():
    """Auto-start Ollama server if it is not already reachable."""
    ollama_host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    try:
        r = httpx.get(f"{ollama_host}/api/tags", timeout=2)
        if r.status_code == 200:
            print("[startup] Ollama already running.")
            return
    except Exception:
        pass

    # Try well-known install paths on Windows
    candidates = [
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Ollama\ollama.exe"),
        r"C:\Program Files\Ollama\ollama.exe",
    ]
    exe = next((p for p in candidates if os.path.exists(p)), None)

    if exe:
        subprocess.Popen(
            [exe, "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        print("[startup] Ollama server launched — waiting 4 s for it to come up...")
        time.sleep(4)
        # Confirm it's up
        try:
            r = httpx.get(f"{ollama_host}/api/tags", timeout=3)
            if r.status_code == 200:
                print("[startup] Ollama is now reachable.")
                return
        except Exception:
            pass
        print("[startup] WARNING: Ollama launched but not yet reachable. LLM extraction may use fallback on first request.")
    else:
        print("[startup] WARNING: Ollama binary not found. LLM extraction will use rule-based fallback.")


ensure_ollama_running()

app = FastAPI(title="NudgeIQ ML Service", version="1.0.0")

app.include_router(transcribe.router)
app.include_router(diarize.router)
app.include_router(extract.router)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ml-service"}
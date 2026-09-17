from fastapi import FastAPI
from app.routes import transcribe, diarize, extract

app = FastAPI(title="NudgeIQ ML Service", version="1.0.0")

app.include_router(transcribe.router)
app.include_router(diarize.router)
app.include_router(extract.router)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ml-service"}
from fastapi import APIRouter, UploadFile, File, Form
from typing import Optional

router = APIRouter(tags=["transcribe"])

@router.post("/transcribe")
async def transcribe_audio(
    audio_file: Optional[UploadFile] = File(None),
    audio_url: Optional[str] = Form(None)
):
    # Stub implementation - placeholder for Whisper or speech-to-text pipeline
    return {
        "status": "not_implemented",
        "message": "Transcription pipeline stub. Integration point ready.",
        "raw_text": None
    }

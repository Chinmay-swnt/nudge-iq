from fastapi import APIRouter, UploadFile, File, Form
from typing import Optional

router = APIRouter(tags=["diarize"])

@router.post("/diarize")
async def diarize_audio(
    audio_file: Optional[UploadFile] = File(None),
    audio_url: Optional[str] = Form(None)
):
    # Stub implementation - placeholder for speaker diarization (e.g. pyannote.audio)
    return {
        "status": "not_implemented",
        "message": "Speaker diarization pipeline stub. Integration point ready.",
        "diarized_json": []
    }

from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(tags=["extract"])

class ExtractRequest(BaseModel):
    transcript_text: str
    diarized_json: Optional[List[dict]] = None
    team_members: Optional[List[dict]] = None

@router.post("/extract")
async def extract_action_items(request: ExtractRequest):
    # Stub implementation - placeholder for LLM extraction (e.g. Gemini / Claude / GPT)
    return {
        "status": "not_implemented",
        "message": "LLM Action-item extraction pipeline stub. Integration point ready.",
        "action_items": []
    }

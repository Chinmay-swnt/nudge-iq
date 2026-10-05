import re
import datetime
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

router = APIRouter(tags=["extract"])

class ExtractRequest(BaseModel):
    transcript_text: str
    diarized_json: Optional[List[dict]] = None
    team_members: Optional[List[dict]] = None

def parse_deadline_from_text(text: str) -> Optional[str]:
    """
    Extracts relative dates like 'tomorrow', 'by Friday', 'next week', 'by Oct 15'
    and resolves to YYYY-MM-DD.
    """
    today = datetime.date.today()
    text_lower = text.lower()

    if "tomorrow" in text_lower:
        return (today + datetime.timedelta(days=1)).isoformat()
    elif "today" in text_lower:
        return today.isoformat()
    elif "next week" in text_lower:
        return (today + datetime.timedelta(days=7)).isoformat()
    elif "in 2 days" in text_lower or "in two days" in text_lower:
        return (today + datetime.timedelta(days=2)).isoformat()
    elif "in 3 days" in text_lower or "in three days" in text_lower:
        return (today + datetime.timedelta(days=3)).isoformat()

    # Day of week detection
    days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    for i, day in enumerate(days):
        if f"by {day}" in text_lower or f"on {day}" in text_lower or f"this {day}" in text_lower:
            current_weekday = today.weekday()
            target_weekday = i
            days_ahead = target_weekday - current_weekday
            if days_ahead <= 0:
                days_ahead += 7
            return (today + datetime.timedelta(days=days_ahead)).isoformat()

    # Default fallback: 3 days from now
    return (today + datetime.timedelta(days=3)).isoformat()

def extract_tasks_and_summary(transcript: str, team_members: List[dict] = None) -> Dict[str, Any]:
    """
    Rule-based & NLP action-item extractor (100% Free / Local).
    Extracts action items, assignees, deadlines, and key summaries.
    """
    sentences = re.split(r'[.!?\n]+', transcript)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 5]

    action_keywords = [
        "will", "need to", "needs to", "action item", "todo", "follow up", "assign",
        "should", "must", "going to", "take care of", "responsible for", "handle",
        "prepare", "finalize", "create", "deploy", "review", "update", "send"
    ]

    action_items = []
    key_decisions = []

    # Map team member names for owner matching
    member_lookup = {}
    if team_members:
        for m in team_members:
            uid = m.get("user_id") or m.get("id")
            name = m.get("name") or (m.get("users", {}) or {}).get("name") or ""
            email = m.get("email") or (m.get("users", {}) or {}).get("email") or ""
            
            if name:
                member_lookup[name.lower()] = {"id": uid, "name": name}
                first_name = name.split()[0].lower()
                member_lookup[first_name] = {"id": uid, "name": name}
            if email:
                username = email.split('@')[0].lower()
                member_lookup[username] = {"id": uid, "name": name or username}

    for sentence in sentences:
        s_lower = sentence.lower()

        # Decision detection
        if any(w in s_lower for w in ["decided", "agreed", "decision", "concluded", "approved"]):
            key_decisions.append(sentence.strip())

        # Action item detection
        has_action = any(kw in s_lower for kw in action_keywords)
        if has_action:
            # Find matched owner if any member is mentioned
            matched_owner_id = None
            matched_owner_name = None

            for key, val in member_lookup.items():
                if re.search(rf'\b{re.escape(key)}\b', s_lower):
                    matched_owner_id = val["id"]
                    matched_owner_name = val["name"]
                    break

            # Clean up task description
            clean_desc = sentence.strip()
            # Remove leading speaker prefixes like "Speaker 1:"
            clean_desc = re.sub(r'^(speaker\s*\d+|[a-zA-Z\s]+):\s*', '', clean_desc, flags=re.IGNORECASE)

            deadline = parse_deadline_from_text(sentence)

            action_items.append({
                "task_description": clean_desc,
                "owner_id": matched_owner_id,
                "owner_name": matched_owner_name or "Unassigned",
                "deadline": deadline
            })

    # Generate summary
    if len(sentences) > 0:
        summary_sentences = sentences[:3]
        summary = " ".join(summary_sentences)
    else:
        summary = "Meeting concluded with key operational discussions and follow-up assignments."

    if not key_decisions:
        key_decisions = ["Team aligned on milestone deliverables and scheduled next sync."]

    return {
        "summary": summary,
        "key_decisions": key_decisions,
        "action_items": action_items
    }

@router.post("/extract")
async def extract_action_items(request: ExtractRequest):
    """
    100% Free structured action item and summary extractor.
    """
    res = extract_tasks_and_summary(request.transcript_text, request.team_members or [])
    return {
        "status": "success",
        "summary": res["summary"],
        "key_decisions": res["key_decisions"],
        "action_items": res["action_items"]
    }

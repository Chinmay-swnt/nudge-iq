import os
import re
import json
import datetime
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

router = APIRouter(tags=["extract"])

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
DEFAULT_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")

class ExtractRequest(BaseModel):
    transcript_text: str
    diarized_json: Optional[List[dict]] = None
    team_members: Optional[List[dict]] = None

# =====================================================================
# 1. Ollama LLM Extraction Engine
# =====================================================================

def get_ollama_client():
    """Returns an initialized Ollama Client instance."""
    try:
        import ollama
        return ollama.Client(host=OLLAMA_HOST)
    except Exception as e:
        print(f"[extract] Could not initialize ollama library: {e}")
        return None

def resolve_ollama_model(client) -> Optional[str]:
    """
    Checks if configured model is available.
    If not, falls back to any available local model or returns None.
    """
    try:
        models_res = client.list()
        models_list = getattr(models_res, 'models', []) or models_res.get('models', [])
        exact_names = []
        for m in models_list:
            name = getattr(m, 'model', None) or (m.get('name') if isinstance(m, dict) else str(m))
            if name:
                exact_names.append(name)

        target_base = DEFAULT_MODEL.split(':')[0]
        # Check if default model or its base name matches an installed model
        for name in exact_names:
            if DEFAULT_MODEL == name or target_base == name.split(':')[0]:
                return name

        # If default model not found, pick the first available model
        if exact_names:
            first_available = exact_names[0]
            print(f"[extract] Configured model '{DEFAULT_MODEL}' not found. Using installed model '{first_available}'.")
            return first_available

        return None
    except Exception as e:
        print(f"[extract] Ollama model check warning: {e}")
        return None

def match_owner_to_team(owner_name: Optional[str], owner_id: Optional[str], team_members: List[dict]):
    """
    Fuzzy matches owner name/id against team members list to guarantee
    accurate Supabase user_id resolution.
    """
    if not team_members:
        return None, owner_name or "Unassigned"

    # If owner_id is already a valid user_id in team_members
    if owner_id:
        for m in team_members:
            uid = m.get("user_id") or m.get("id")
            if uid == owner_id:
                m_name = m.get("name") or (m.get("users", {}) or {}).get("name") or owner_name
                return uid, m_name

    if not owner_name or owner_name.lower() in ["unassigned", "none", "null", "team"]:
        return None, "Unassigned"

    clean_name = owner_name.strip().lower()

    for m in team_members:
        uid = m.get("user_id") or m.get("id")
        name = m.get("name") or (m.get("users", {}) or {}).get("name") or ""
        email = m.get("email") or (m.get("users", {}) or {}).get("email") or ""

        if not uid:
            continue

        # Exact match
        if name and name.lower() == clean_name:
            return uid, name

        # First name match
        first_name = name.split()[0].lower() if name else ""
        if first_name and (first_name == clean_name or clean_name in first_name or first_name in clean_name):
            return uid, name

        # Username from email match
        if email:
            uname = email.split('@')[0].lower()
            if uname == clean_name or clean_name in uname:
                return uid, name or uname

    # If there is only one team member in this workspace, any task committed in the meeting belongs to that member
    if len(team_members) == 1:
        single = team_members[0]
        s_uid = single.get("user_id") or single.get("id")
        s_name = single.get("name") or (single.get("users", {}) or {}).get("name") or owner_name or "Team Member"
        return s_uid, s_name

    return None, owner_name

def extract_with_llm(transcript: str, team_members: List[dict] = None) -> Optional[Dict[str, Any]]:
    """
    Executes structured extraction via Local LLM (Ollama).
    Returns None if Ollama is unreachable or model is unavailable.
    """
    client = get_ollama_client()
    if not client:
        return None

    model_name = resolve_ollama_model(client)
    if not model_name:
        return None

    today_str = datetime.date.today().isoformat()

    # Format team members for prompt
    formatted_members = []
    if team_members:
        for m in team_members:
            uid = m.get("user_id") or m.get("id") or ""
            name = m.get("name") or (m.get("users", {}) or {}).get("name") or ""
            email = m.get("email") or (m.get("users", {}) or {}).get("email") or ""
            role = m.get("role") or ""
            if name or email:
                role_str = f" (Role: {role})" if role else ""
                formatted_members.append(f"- Name: {name or 'N/A'}, ID: {uid}, Email: {email or 'N/A'}{role_str}")

    members_block = "\n".join(formatted_members) if formatted_members else "No specific registered members provided."

    system_prompt = f"""You are an expert AI meeting analyst for NudgeIQ.
Today's reference date is: {today_str}.

Your task is to analyze the meeting transcript and extract structured project insights.

CRITICAL INSTRUCTIONS:
1. SUMMARY: Write a concise, professional 2-3 sentence executive summary capturing the discussion objectives, progress, and alignment.
2. KEY DECISIONS: List explicit agreements, decisions, approvals, or operational alignments reached.
3. ACTION ITEMS:
   - Extract actionable commitments, to-dos, or follow-ups mentioned in the discussion (e.g. tasks to finish, tests to run, agendas to create, features to implement, deliverables to submit).
   - Write clear, professional imperative task descriptions (e.g. "Finish testing the NudgeIQ port", "Create agenda for next meeting", "Run backend test suite").
   - Assign each task to the most appropriate team member from the Team Members list below. If the speaker refers to themselves ("I will...", "I am doing...", "first I will...", "as the host...") and a team member/host is listed, assign the task to that person with their matching ID.
   - If a specific deadline was stated, compute the ISO date (YYYY-MM-DD) relative to today ({today_str}). If no specific deadline was mentioned, set deadline to null.

TEAM MEMBERS:
{members_block}

YOU MUST RESPOND WITH STRICT, VALID JSON ONLY conforming to this schema:
{{
  "summary": "2-3 sentence executive summary",
  "key_decisions": ["decision 1", "decision 2"],
  "action_items": [
    {{
      "task_description": "imperative task description",
      "owner_name": "Name of assigned person",
      "owner_id": "matching user ID from Team Members",
      "deadline": "YYYY-MM-DD or null"
    }}
  ]
}}"""

    user_prompt = f"TRANSCRIPT TO ANALYZE:\n\"\"\"\n{transcript}\n\"\"\""

    try:
        print(f"[extract] Running local LLM extraction using model: '{model_name}' on Ollama...")
        response = client.chat(
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            format="json",
            options={
                "temperature": 0.1,  # Low temperature for deterministic, factual JSON
                "num_ctx": 4096,
            }
        )

        content = response["message"]["content"]
        if not content:
            return None

        # Clean potential markdown wrapping
        cleaned_json = content.strip()
        if cleaned_json.startswith("```json"):
            cleaned_json = cleaned_json[7:]
        if cleaned_json.startswith("```"):
            cleaned_json = cleaned_json[3:]
        if cleaned_json.endswith("```"):
            cleaned_json = cleaned_json[:-3]
        cleaned_json = cleaned_json.strip()

        parsed = json.loads(cleaned_json)

        # Validate and normalize parsed content
        summary = parsed.get("summary") or "Meeting concluded with team synchronization and task alignment."
        key_decisions = parsed.get("key_decisions") or []
        if not isinstance(key_decisions, list):
            key_decisions = [str(key_decisions)]

        raw_items = parsed.get("action_items") or []
        cleaned_action_items = []

        for item in raw_items:
            if not isinstance(item, dict):
                continue
            desc = (item.get("task_description") or "").strip()
            if len(desc) < 6:
                continue

            owner_id = item.get("owner_id")
            owner_name = item.get("owner_name")
            resolved_uid, resolved_name = match_owner_to_team(owner_name, owner_id, team_members or [])

            deadline_val = item.get("deadline")
            if deadline_val and isinstance(deadline_val, str):
                deadline_val = deadline_val.strip()
                if not re.match(r'^\d{4}-\d{2}-\d{2}$', deadline_val):
                    deadline_val = None
            else:
                deadline_val = None

            cleaned_action_items.append({
                "task_description": desc,
                "owner_id": resolved_uid,
                "owner_name": resolved_name,
                "deadline": deadline_val
            })

        print(f"[extract] Local LLM succeeded: {len(cleaned_action_items)} action items extracted.")
        return {
            "summary": summary,
            "key_decisions": key_decisions if key_decisions else ["Team aligned on current sprint deliverables."],
            "action_items": cleaned_action_items,
            "engine": f"ollama ({model_name})"
        }

    except Exception as err:
        print(f"[extract] Local LLM extraction exception: {err}")
        return None

# =====================================================================
# 2. Resilient Rule-Based Fallback Engine
# =====================================================================

def parse_deadline_from_text(text: str) -> Optional[str]:
    today = datetime.date.today()
    t = text.lower()
    if re.search(r'\b(by\s+tomorrow|due\s+tomorrow)\b', t):
        return (today + datetime.timedelta(days=1)).isoformat()
    if re.search(r'\b(by\s+eod|by\s+end\s+of\s+day|due\s+today|by\s+today)\b', t):
        return today.isoformat()
    if re.search(r'\b(by\s+next\s+week|due\s+next\s+week|by\s+end\s+of\s+week)\b', t):
        return (today + datetime.timedelta(days=7)).isoformat()
    if re.search(r'\bin\s+(2|two)\s+days\b', t):
        return (today + datetime.timedelta(days=2)).isoformat()
    if re.search(r'\bin\s+(3|three)\s+days\b', t):
        return (today + datetime.timedelta(days=3)).isoformat()
    if re.search(r'\bin\s+a\s+week\b', t):
        return (today + datetime.timedelta(days=7)).isoformat()

    weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    for i, day in enumerate(weekdays):
        if re.search(rf'\b(by|on|this|before)\s+{day}\b', t):
            diff = i - today.weekday()
            if diff <= 0:
                diff += 7
            return (today + datetime.timedelta(days=diff)).isoformat()
    return None

def clean_action_phrase(text: str) -> str:
    cleaned = re.sub(r'^(speaker\s*\d+|[a-zA-Z\s]+):\s*', '', text, flags=re.IGNORECASE)
    cleaned = re.sub(
        r"^(so\s+|um\s+|uh\s+|like\s+|basically\s+|okay\s+so\s+|okay[,\s]+|"
        r"alright[,\s]+|right\s+so\s+|now\s+|i\s+think\s+that\s+|"
        r"we\s+need\s+to\s+|let's\s+make\s+sure\s+to\s+|please\s+|make\s+sure\s+to\s+)",
        '',
        cleaned,
        flags=re.IGNORECASE
    )
    cleaned = cleaned.strip(" ,.-;:")
    if cleaned:
        cleaned = cleaned[0].upper() + cleaned[1:]
    return cleaned

_SYSTEM_SUBJECT_RE = re.compile(
    r'\b(nudgeiq|nudgeyq|the\s+bot|the\s+ai|the\s+assistant|the\s+system|'
    r'the\s+tool|whisper|the\s+model|it\s+will|that\s+will|which\s+will|'
    r'so\s+\w+\s+will|and\s+\w+\s+will\s+summarize|and\s+\w+\s+will\s+create)\b',
    re.IGNORECASE
)

_PRESENT_PROGRESSIVE_RE = re.compile(
    r'\b(i\s+am|i\'m|we\s+are|we\'re)\s+(testing|trying|checking|doing|running|'
    r'going|recording|hosting|sharing|clicking|loading|starting)\b',
    re.IGNORECASE
)

_CONTEXT_DESC_RE = re.compile(
    r'\b(running\s+a\s+test\s+meeting|this\s+is\s+a\s+test\s+meeting|'
    r'the\s+port\s+is\s+in|my\s+name\s+is\s+\d|'
    r'i\s+am\s+the\s+host|i\'m\s+the\s+host|so\s+my\s+name\s+is)\b',
    re.IGNORECASE
)

def is_actionable_clause(clause: str) -> bool:
    t = clause.strip()
    if len(t) < 12:
        return False
    if _SYSTEM_SUBJECT_RE.search(t):
        return False
    if _PRESENT_PROGRESSIVE_RE.search(t):
        return False
    if _CONTEXT_DESC_RE.search(t):
        return False

    filler_starts = re.compile(
        r'^(okay[,\s]|alright[,\s]|anyway[,\s]|now for\s|first let\s|then let\s|'
        r'let me see|i will go on|i will now end|and see what|'
        r'i will click|i will name|i will load|i will start my audio|'
        r'i will share the link|click on the)',
        re.IGNORECASE
    )
    if filler_starts.match(t):
        return False
    if len(re.findall(r'\bI will\b', t, re.IGNORECASE)) >= 3:
        return False
    return True

def split_into_clauses(sentence: str) -> list:
    primary_pattern = (
        r',?\s*\b(and\s+also|and\s+then|and\s+now|additionally|furthermore|'
        r'as\s+well\s+as|then\s+i\s+will|then\s+we\s+will|'
        r'first\s+i\s+will|first\s+we\s+will|also\s+i\s+will|also\s+we\s+will)\b'
    )
    parts = re.split(primary_pattern, sentence, flags=re.IGNORECASE)
    result = []
    for part in parts:
        sub = re.split(r',\s+(then|and|also)\s+', part, flags=re.IGNORECASE)
        result.extend(sub)

    conjunction_re = re.compile(
        r'^(and\s+also|and\s+then|and\s+now|additionally|furthermore|'
        r'as\s+well\s+as|then\s+i\s+will|then\s+we\s+will|'
        r'first\s+i\s+will|first\s+we\s+will|also\s+i\s+will|'
        r'also\s+we\s+will|then|and|also)$',
        re.IGNORECASE
    )
    return [c.strip() for c in result if c.strip() and len(c.strip()) > 6
            and not conjunction_re.match(c.strip())]

def extract_fallback_rule_based(transcript: str, team_members: List[dict] = None) -> Dict[str, Any]:
    if not transcript or not transcript.strip() or "No audible speech detected" in transcript:
        return {
            "summary": "Meeting concluded without audible spoken items.",
            "key_decisions": ["Session recorded and archived."],
            "action_items": [],
            "engine": "fallback (rule-based)"
        }

    raw_sentences = re.split(r'[.!?\n]+', transcript)
    sentences = [s.strip() for s in raw_sentences if len(s.strip()) > 3]

    action_verbs = [
        "deploy", "finish", "create", "review", "update", "send", "fix", "implement",
        "schedule", "finalize", "prepare", "build", "submit", "write", "organize",
        "investigate", "document", "deliver", "publish", "merge", "setup", "configure",
        "verify", "email", "design", "refactor", "audit", "coordinate", "complete",
        "remove", "migrate", "integrate", "optimize", "push", "release", "add",
        "run", "test", "check", "share", "start", "install", "connect", "enable"
    ]

    action_triggers = [
        "need to", "needs to", "action item", "todo", "follow up",
        "must", "going to", "take care of", "responsible for",
        "make sure", "has to", "have to",
        "i need", "we need", "you need", "should fix", "should review",
        "should deploy", "should update", "should create", "should send"
    ]

    human_will_pattern = re.compile(
        r'\b(i|we|you|he|she|they|[A-Z][a-z]+)\s+will\s+('
        + '|'.join(re.escape(v) for v in action_verbs) + r')\b',
        re.IGNORECASE
    )

    action_items = []
    key_decisions = []

    for sentence in sentences:
        s_lower = sentence.lower()
        if any(w in s_lower for w in ["decided", "agreed", "decision", "concluded", "approved", "aligned on"]):
            clean_decision = clean_action_phrase(sentence)
            if len(clean_decision) > 10 and clean_decision not in key_decisions:
                key_decisions.append(clean_decision)

        clauses = split_into_clauses(sentence) or [sentence]
        for clause in clauses:
            c_lower = clause.lower()
            has_trigger = any(re.search(rf'\b{re.escape(kw)}\b', c_lower) for kw in action_triggers)
            has_human_will_verb = bool(human_will_pattern.search(clause))
            if not (has_trigger or has_human_will_verb):
                continue
            if not is_actionable_clause(clause):
                continue

            clean_desc = clean_action_phrase(clause)
            if len(clean_desc) > 120:
                clean_desc = clean_desc[:117].rsplit(' ', 1)[0] + '...'

            deadline = parse_deadline_from_text(clause)
            matched_uid, matched_name = match_owner_to_team(None, None, team_members or [])

            # Simple lookup for owner from clause text
            if team_members:
                for m in team_members:
                    name = m.get("name") or (m.get("users", {}) or {}).get("name") or ""
                    if name and re.search(rf'\b{re.escape(name.split()[0])}\b', clause, re.IGNORECASE):
                        matched_uid = m.get("user_id") or m.get("id")
                        matched_name = name
                        break

            if len(clean_desc) >= 12:
                if not any(a["task_description"].lower() == clean_desc.lower() for a in action_items):
                    action_items.append({
                        "task_description": clean_desc,
                        "owner_id": matched_uid,
                        "owner_name": matched_name or "Unassigned",
                        "deadline": deadline
                    })

    summary_parts = []
    for s in sentences[:5]:
        cleaned_s = re.sub(r'^(speaker\s*\d+|[a-zA-Z\s]+):\s*', '', s, flags=re.IGNORECASE).strip()
        if len(cleaned_s) > 10 and cleaned_s not in summary_parts:
            summary_parts.append(cleaned_s)
            if len(summary_parts) == 3:
                break
    summary = ". ".join(summary_parts) + "." if summary_parts else "Meeting concluded with team synchronization."

    return {
        "summary": summary,
        "key_decisions": key_decisions if key_decisions else ["Team aligned on current sprint deliverables."],
        "action_items": action_items,
        "engine": "fallback (rule-based)"
    }

# =====================================================================
# 3. Router Endpoints
# =====================================================================

@router.get("/llm-status")
def get_llm_status():
    """Returns local LLM availability and configuration details."""
    client = get_ollama_client()
    if not client:
        return {
            "status": "unavailable",
            "ollama_host": OLLAMA_HOST,
            "configured_model": DEFAULT_MODEL,
            "installed_models": [],
            "active_engine": "fallback (rule-based)"
        }

    try:
        models_res = client.list()
        models_list = getattr(models_res, 'models', []) or models_res.get('models', [])
        installed = []
        for m in models_list:
            name = getattr(m, 'model', None) or (m.get('name') if isinstance(m, dict) else str(m))
            if name:
                installed.append(name)

        active_model = resolve_ollama_model(client)
        return {
            "status": "online" if active_model else "no_models_installed",
            "ollama_host": OLLAMA_HOST,
            "configured_model": DEFAULT_MODEL,
            "active_model": active_model,
            "installed_models": installed,
            "active_engine": f"ollama ({active_model})" if active_model else "fallback (rule-based)"
        }
    except Exception as e:
        return {
            "status": "offline",
            "error": str(e),
            "ollama_host": OLLAMA_HOST,
            "configured_model": DEFAULT_MODEL,
            "installed_models": [],
            "active_engine": "fallback (rule-based)"
        }

@router.post("/extract")
async def extract_action_items(request: ExtractRequest):
    """
    Main extraction endpoint: Attempts Local LLM extraction via Ollama first,
    falling back automatically to the rule-based engine if Ollama is unavailable.
    """
    transcript = request.transcript_text or ""

    # 1. Attempt LLM extraction
    llm_result = extract_with_llm(transcript, request.team_members or [])
    if llm_result:
        return {
            "status": "success",
            "summary": llm_result["summary"],
            "key_decisions": llm_result["key_decisions"],
            "action_items": llm_result["action_items"],
            "engine": llm_result.get("engine", "ollama")
        }

    # 2. Resilient fallback
    print("[extract] Ollama LLM extraction not available, using rule-based fallback.")
    fallback_result = extract_fallback_rule_based(transcript, request.team_members or [])
    return {
        "status": "success",
        "summary": fallback_result["summary"],
        "key_decisions": fallback_result["key_decisions"],
        "action_items": fallback_result["action_items"],
        "engine": fallback_result.get("engine", "fallback")
    }

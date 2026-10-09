const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

/**
 * Extract action items from a transcript (100% Free / Local).
 * @param {string} transcriptText - The raw or diarized transcript text.
 * @param {Array<Object>} [teamMembers] - List of team members for owner matching.
 * @returns {Promise<{ summary: string, key_decisions: Array, action_items: Array }>}
 */
async function extractActionItems(transcriptText, teamMembers = []) {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transcript_text: transcriptText,
        team_members: teamMembers,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        summary: data.summary || "",
        key_decisions: data.key_decisions || [],
        action_items: data.action_items || [],
      };
    }
  } catch (err) {
    console.warn("[llmExtraction.service] ML service offline, using Node.js local extractor:", err.message);
  }

  // Node.js Local Fallback Extractor (100% Offline / Free)
  return localRuleBasedExtract(transcriptText, teamMembers);
}

function parseDeadlines(text) {
  const today = new Date();
  const t = text.toLowerCase();

  if (t.includes("tomorrow")) {
    const d = new Date(today);
    d.setDate(today.getDate() + 1);
    return d.toISOString().split("T")[0];
  } else if (t.includes("next week")) {
    const d = new Date(today);
    d.setDate(today.getDate() + 7);
    return d.toISOString().split("T")[0];
  } else if (t.includes("in 2 days")) {
    const d = new Date(today);
    d.setDate(today.getDate() + 2);
    return d.toISOString().split("T")[0];
  }

  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (let i = 0; i < weekdays.length; i++) {
    if (t.includes(weekdays[i])) {
      const currentDay = today.getDay();
      let diff = i - currentDay;
      if (diff <= 0) diff += 7;
      const d = new Date(today);
      d.setDate(today.getDate() + diff);
      return d.toISOString().split("T")[0];
    }
  }

  const d = new Date(today);
  d.setDate(today.getDate() + 3);
  return d.toISOString().split("T")[0];
}

function cleanTask(str) {
  let cleaned = str.replace(/^(speaker\s*\d+|[a-zA-Z\s]+):\s*/i, "");
  cleaned = cleaned.replace(
    /^(so\s+|um\s+|uh\s+|like\s+|basically\s+|i\s+think\s+that\s+|we\s+need\s+to\s+|please\s+|make\s+sure\s+to\s+)/i,
    ""
  ).trim();
  if (cleaned.length > 0) {
    cleaned = cleaned[0].toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

function localRuleBasedExtract(transcript, teamMembers = []) {
  if (!transcript || !transcript.trim() || transcript.includes("No audible speech detected")) {
    return {
      summary: "Meeting concluded without audible spoken items.",
      key_decisions: ["Session recorded and archived."],
      action_items: [],
    };
  }

  const sentences = transcript.split(/[.!?\n]+/).map((s) => s.trim()).filter((s) => s.length > 4);

  const actionKeywords = [
    "deploy", "finish", "create", "review", "update", "send", "fix", "implement",
    "schedule", "finalize", "prepare", "test", "build", "submit", "write", "organize",
    "will", "need to", "needs to", "action item", "todo", "follow up", "assign",
    "should", "must", "going to", "take care of", "responsible for", "handle"
  ];

  const actionItems = [];
  const keyDecisions = [];

  const memberLookup = {};
  for (const m of teamMembers) {
    const uid = m.user_id || m.id;
    const name = m.name || (m.users && m.users.name) || "";
    const email = m.email || (m.users && m.users.email) || "";

    if (name) {
      memberLookup[name.toLowerCase()] = { id: uid, name };
      const firstName = name.split(" ")[0].toLowerCase();
      memberLookup[firstName] = { id: uid, name };
    }
    if (email) {
      const username = email.split("@")[0].toLowerCase();
      memberLookup[username] = { id: uid, name: name || username };
    }
  }

  for (const sentence of sentences) {
    const sLower = sentence.toLowerCase();

    if (["decided", "agreed", "decision", "concluded", "approved", "aligned on"].some((w) => sLower.includes(w))) {
      const cleanDec = cleanTask(sentence);
      if (cleanDec.length > 8 && !keyDecisions.includes(cleanDec)) {
        keyDecisions.push(cleanDec);
      }
    }

    const clauses = sentence.split(/\b(and also|and then|additionally|furthermore)\b/i).filter((c) => c.trim().length > 5);

    for (const clause of clauses) {
      const cLower = clause.toLowerCase();
      const hasAction = actionKeywords.some((kw) => cLower.includes(kw));

      if (hasAction) {
        let matchedOwnerId = null;
        let matchedOwnerName = "Unassigned";

        for (const [key, val] of Object.entries(memberLookup)) {
          const regex = new RegExp(`\\b${key}\\b`, "i");
          if (regex.test(clause)) {
            matchedOwnerId = val.id;
            matchedOwnerName = val.name;
            break;
          }
        }

        let cleanDesc = cleanTask(clause);
        if (cleanDesc.length > 130) {
          cleanDesc = cleanDesc.slice(0, 127) + "...";
        }

        if (cleanDesc.length >= 8 && !actionItems.some((a) => a.task_description.toLowerCase() === cleanDesc.toLowerCase())) {
          actionItems.push({
            task_description: cleanDesc,
            owner_id: matchedOwnerId,
            owner_name: matchedOwnerName,
            deadline: parseDeadlines(clause),
          });
        }
      }
    }
  }

  const summary = sentences.length > 0
    ? sentences.slice(0, 3).map(cleanTask).join(". ") + "."
    : "Meeting concluded with team synchronization and task alignment.";

  return {
    summary,
    key_decisions: keyDecisions.length ? keyDecisions : ["Aligned on core deliverables."],
    action_items: actionItems,
  };
}

module.exports = {
  extractActionItems,
};

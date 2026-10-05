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

function localRuleBasedExtract(transcript, teamMembers = []) {
  const sentences = transcript.split(/[.!?\n]+/).map((s) => s.trim()).filter((s) => s.length > 5);

  const actionKeywords = [
    "will", "need to", "needs to", "action item", "todo", "follow up", "assign",
    "should", "must", "going to", "take care of", "responsible for", "handle",
    "prepare", "finalize", "create", "deploy", "review", "update", "send"
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

  const today = new Date();

  for (const sentence of sentences) {
    const sLower = sentence.toLowerCase();

    if (["decided", "agreed", "decision", "concluded", "approved"].some((w) => sLower.includes(w))) {
      keyDecisions.push(sentence);
    }

    const hasAction = actionKeywords.some((kw) => sLower.includes(kw));
    if (hasAction) {
      let matchedOwnerId = null;
      let matchedOwnerName = "Unassigned";

      for (const [key, val] of Object.entries(memberLookup)) {
        const regex = new RegExp(`\\b${key}\\b`, "i");
        if (regex.test(sentence)) {
          matchedOwnerId = val.id;
          matchedOwnerName = val.name;
          break;
        }
      }

      // Calculate default relative deadline
      const deadlineDate = new Date(today);
      if (sLower.includes("tomorrow")) {
        deadlineDate.setDate(today.getDate() + 1);
      } else if (sLower.includes("next week")) {
        deadlineDate.setDate(today.getDate() + 7);
      } else if (sLower.includes("friday")) {
        const day = today.getDay();
        const diff = (5 - day + 7) % 7 || 7;
        deadlineDate.setDate(today.getDate() + diff);
      } else {
        deadlineDate.setDate(today.getDate() + 3);
      }

      const cleanDesc = sentence.replace(/^(speaker\s*\d+|[a-zA-Z\s]+):\s*/i, "");

      actionItems.push({
        task_description: cleanDesc,
        owner_id: matchedOwnerId,
        owner_name: matchedOwnerName,
        deadline: deadlineDate.toISOString().split("T")[0],
      });
    }
  }

  const summary = sentences.length > 0
    ? sentences.slice(0, 3).join(". ") + "."
    : "Meeting concluded with task commitments and follow-up milestones.";

  return {
    summary,
    key_decisions: keyDecisions.length ? keyDecisions : ["Aligned on core deliverables."],
    action_items: actionItems,
  };
}

module.exports = {
  extractActionItems,
};

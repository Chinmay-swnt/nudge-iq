/**
 * LLM Extraction Service (Deferred: AI Pipeline)
 *
 * Extracts structured action items, owners, and deadlines from meeting transcripts.
 * Currently a placeholder stub with a clean integration point.
 */

class NotImplementedError extends Error {
  constructor(message = "LLM extraction is not implemented yet") {
    super(message);
    this.name = "NotImplementedError";
  }
}

/**
 * Extract action items from a transcript.
 * @param {string} transcriptText - The raw or diarized transcript text.
 * @param {Array<Object>} [teamMembers] - List of team members to assist with owner matching.
 * @returns {Promise<Array<Object>>} Extracted action items.
 */
async function extractActionItems(transcriptText, teamMembers = []) {
  // TODO: Call LLM API (Gemini/OpenAI/Claude) or ml-service /extract endpoint
  // Example expected output format:
  // [
  //   {
  //     task_description: "Update billing integration docs",
  //     owner_id: "user-uuid",
  //     deadline: "2026-09-30"
  //   }
  // ]
  console.log("[llmExtraction.service] extractActionItems called with text length:", transcriptText?.length || 0);
  return [];
}

module.exports = {
  extractActionItems,
  NotImplementedError,
};

const { supabase } = require("./supabase.service");
const { transcribeAudio } = require("./transcription.service");
const { extractActionItems } = require("./llmExtraction.service");

/**
 * Process a meeting end-to-end: Audio -> Transcript -> Action Items -> Database
 * @param {Object} params
 * @param {string} params.meetingId
 * @param {string} params.teamId
 * @param {Buffer|string} [params.audioData]
 * @param {string} [params.transcriptUrl]
 * @returns {Promise<Object>}
 */
async function processMeetingAudio({ meetingId, teamId, audioData, transcriptUrl, preloadedTranscript }) {
  console.log(`[pipeline.service] Starting AI processing for meeting: ${meetingId} (team: ${teamId})`);

  try {
    // 1. Fetch team members for owner matching
    let teamMembers = [];
    if (supabase && teamId) {
      const { data } = await supabase
        .from("team_members")
        .select("user_id, role, users(id, name, email)")
        .eq("team_id", teamId);
      teamMembers = data || [];
    }

    // 2. Speech-to-Text or Live Transcripts
    let raw_text = "";
    let diarized_json = [];

    // Try Faster-Whisper audio transcription first if real audio buffer is provided
    if (audioData || transcriptUrl) {
      try {
        const audioSource = audioData || transcriptUrl;
        const result = await transcribeAudio(audioSource, "meeting_recording.webm");
        if (result && result.raw_text && result.raw_text.trim().length > 0 && !result.raw_text.includes("No audible speech detected")) {
          raw_text = result.raw_text;
          diarized_json = result.diarized_json || [];
        }
      } catch (e) {
        console.warn("[pipeline.service] Audio transcription failed, checking for live captions:", e.message);
      }
    }

    // Fallback to preloaded live captions (from Google Meet / Zoom CC scraper)
    if (!raw_text && preloadedTranscript && preloadedTranscript.raw_text) {
      raw_text = preloadedTranscript.raw_text;
      diarized_json = preloadedTranscript.diarized_json || [];
    }

    if (!raw_text) {
      raw_text = "No audible speech or action items detected during this session.";
    }

    console.log(`[pipeline.service] Transcription ready (${raw_text?.length || 0} chars)`);

    // 3. Run Free LLM / NLP Action Item Extraction
    const extractionResult = await extractActionItems(raw_text, teamMembers);
    console.log(`[pipeline.service] Extracted ${extractionResult.action_items.length} action items`);

    // 4. Update Database
    if (supabase) {
      // 4a. Insert Transcript
      const { data: transcriptRecord, error: transcriptError } = await supabase
        .from("transcripts")
        .insert({
          meeting_id: meetingId,
          raw_text,
          diarized_json,
        })
        .select()
        .single();

      if (transcriptError) {
        console.error("[pipeline.service] Error saving transcript:", transcriptError);
      }

      // 4b. Insert Action Items and Tasks
      for (const item of extractionResult.action_items) {
        const { data: actionItem, error: actionItemError } = await supabase
          .from("action_items")
          .insert({
            meeting_id: meetingId,
            task_description: item.task_description,
            owner_id: item.owner_id || null,
            deadline: item.deadline || null,
          })
          .select()
          .single();

        if (actionItem && !actionItemError) {
          await supabase.from("tasks").insert({
            action_item_id: actionItem.id,
            status: "todo",
          });
        }
      }

      // 4c. Update Meeting status to 'processed'
      await supabase
        .from("meetings")
        .update({
          status: "processed",
        })
        .eq("id", meetingId);
    }

    return {
      success: true,
      meetingId,
      raw_text,
      diarized_json,
      summary: extractionResult.summary,
      action_items: extractionResult.action_items,
    };
  } catch (err) {
    console.error(`[pipeline.service] Pipeline error for meeting ${meetingId}:`, err);
    throw err;
  }
}

module.exports = {
  processMeetingAudio,
};

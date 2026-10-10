const { supabase, supabaseAdmin } = require("./supabase.service");
const { transcribeAudio } = require("./transcription.service");
const { extractActionItems } = require("./llmExtraction.service");

/**
 * Process a meeting end-to-end: Audio -> Transcript -> Action Items -> Database
 * @param {Object} params
 * @param {string} params.meetingId
 * @param {string} params.teamId
 * @param {Buffer|string} [params.audioData]
 * @param {string} [params.transcriptUrl]
 * @param {Object} [params.preloadedTranscript]
 * @returns {Promise<Object>}
 */
async function processMeetingAudio({ meetingId, teamId, audioData, transcriptUrl, preloadedTranscript }) {
  console.log(`[pipeline.service] Starting Phase 3 AI processing for meeting: ${meetingId} (team: ${teamId})`);

  const client = supabaseAdmin || supabase;

  try {
    // 0. Update meeting processing status to 'transcribing'
    if (client) {
      try {
        await client
          .from("meetings")
          .update({ processing_status: "transcribing" })
          .eq("id", meetingId);
      } catch (_) {}
    }

    // 1. Fetch team members for owner matching
    let teamMembers = [];
    if (client && teamId) {
      const { data } = await client
        .from("team_members")
        .select("user_id, role, users(id, name, email)")
        .eq("team_id", teamId);
      teamMembers = data || [];
    }

    // 2. Speech-to-Text or Live Transcripts
    let raw_text = "";
    let diarized_json = [];

    // Try audio transcription first if real audio buffer or path is provided
    if (audioData || transcriptUrl) {
      try {
        const audioSource = audioData || transcriptUrl;
        const result = await transcribeAudio(audioSource, "meeting_recording.webm");
        if (result && result.raw_text && result.raw_text.trim().length > 0 && !result.raw_text.includes("No audible speech detected")) {
          raw_text = result.raw_text;
          diarized_json = result.diarized_json || [];
        }
      } catch (e) {
        console.warn("[pipeline.service] Audio transcription failed, checking fallback:", e.message);
      }
    }

    // Fallback to preloaded live captions if available
    if (!raw_text && preloadedTranscript && preloadedTranscript.raw_text) {
      raw_text = preloadedTranscript.raw_text;
      diarized_json = preloadedTranscript.diarized_json || [];
    }

    if (!raw_text) {
      raw_text = "No audible speech or action items detected during this session.";
    }

    console.log(`[pipeline.service] Transcription ready (${raw_text.length} chars)`);

    // 3. Update status to 'extracting'
    if (client) {
      try {
        await client
          .from("meetings")
          .update({ processing_status: "extracting" })
          .eq("id", meetingId);
      } catch (_) {}
    }

    // 4. Run LLM / NLP Action Item and Summary Extraction
    const extractionResult = await extractActionItems(raw_text, teamMembers);
    console.log(`[pipeline.service] Extracted ${extractionResult.action_items.length} action items`);

    // Structure transcript metadata to preserve summary, key decisions, & action item quotes
    const transcriptPayload = {
      dialogue: Array.isArray(diarized_json) ? diarized_json : [],
      summary: extractionResult.summary,
      key_decisions: extractionResult.key_decisions || [],
      action_items_meta: extractionResult.action_items || [],
    };

    // 5. Update Database
    if (client) {
      // 5a. Clean up any existing transcripts and previous AI tasks for idempotency on reprocessing
      await client.from("transcripts").delete().eq("meeting_id", meetingId);

      const { data: existingAIs } = await client
        .from("action_items")
        .select("id")
        .eq("meeting_id", meetingId);

      if (existingAIs && existingAIs.length > 0) {
        const aiIds = existingAIs.map((a) => a.id);
        await client.from("tasks").delete().in("action_item_id", aiIds);
        await client.from("action_items").delete().eq("meeting_id", meetingId);
      }

      // 5b. Insert Transcript
      const { error: transcriptError } = await client
        .from("transcripts")
        .insert({
          meeting_id: meetingId,
          raw_text,
          diarized_json: transcriptPayload,
        });

      if (transcriptError) {
        console.error("[pipeline.service] Error saving transcript:", transcriptError);
      }

      // 5c. Insert Action Items and Tasks
      for (const item of extractionResult.action_items) {
        const insertPayload = {
          meeting_id: meetingId,
          task_description: item.task_description,
          owner_id: item.owner_id || null,
          deadline: item.deadline || null,
          source_quote: item.source_quote || item.task_description,
          needs_review: !item.owner_id,
          created_by: "ai",
        };

        let { data: actionItem, error: actionItemError } = await client
          .from("action_items")
          .insert(insertPayload)
          .select()
          .single();

        if (actionItemError && (actionItemError.code === "42703" || String(actionItemError.message).includes("column"))) {
          // Schema fallback if optional migration columns are absent
          const fb = await client
            .from("action_items")
            .insert({
              meeting_id: meetingId,
              task_description: item.task_description,
              owner_id: item.owner_id || null,
              deadline: item.deadline || null,
            })
            .select()
            .single();
          actionItem = fb.data;
          actionItemError = fb.error;
        }

        if (actionItem && !actionItemError) {
          await client.from("tasks").insert({
            action_item_id: actionItem.id,
            status: "todo",
          });
        }
      }

      // 5d. Update Meeting status to 'processed'
      let updateRes = await client
        .from("meetings")
        .update({
          status: "processed",
          processing_status: "processed",
          summary: extractionResult.summary || null,
        })
        .eq("id", meetingId);

      if (updateRes.error) {
        // Fallback if processing_status or summary columns are not present
        await client
          .from("meetings")
          .update({
            status: "processed",
          })
          .eq("id", meetingId);
      }
    }

    return {
      success: true,
      meetingId,
      raw_text,
      diarized_json: transcriptPayload,
      summary: extractionResult.summary,
      key_decisions: extractionResult.key_decisions || [],
      action_items: extractionResult.action_items,
    };
  } catch (err) {
    console.error(`[pipeline.service] Pipeline error for meeting ${meetingId}:`, err);
    if (client) {
      try {
        await client
          .from("meetings")
          .update({
            processing_status: "failed",
            error_message: err.message,
          })
          .eq("id", meetingId);
      } catch (_) {}
    }
    throw err;
  }
}

module.exports = {
  processMeetingAudio,
};

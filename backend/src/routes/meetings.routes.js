const express = require("express");
const multer = require("multer");
const path = require("path");
const { supabaseAdmin } = require("../config/supabaseAdmin");
const { processMeetingAudio } = require("../services/pipeline.service");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB max per PLAN.md
  fileFilter: (req, file, cb) => {
    const allowedExts = [".mp3", ".wav", ".m4a", ".mp4", ".webm", ".ogg"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext) || file.mimetype.startsWith("audio/") || file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file format. Supported formats: mp3, wav, m4a, mp4, webm, ogg"));
    }
  },
});

/**
 * Helper to authenticate caller and verify team membership
 */
async function authenticateAndAuthorize(req, teamId) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { authorized: false, status: 401, error: "Missing or invalid Authorization header" };
  }

  const token = authHeader.split(" ")[1];

  // If service role key is passed directly (internal/tests)
  if (token === process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { authorized: true, isServiceRole: true };
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return { authorized: false, status: 401, error: "Invalid user token" };
  }

  const userId = userData.user.id;

  // Check team membership
  const { data: member, error: memberError } = await supabaseAdmin
    .from("team_members")
    .select("id, role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .single();

  if (memberError || !member) {
    return { authorized: false, status: 403, error: "Forbidden: You are not a member of this team" };
  }

  return { authorized: true, user: userData.user, member };
}

/**
 * 1. Create a meeting record
 * POST /api/meetings
 * Request: { team_id, title, meeting_date }
 * Response 201: { meeting_id }
 */
router.post("/", async (req, res) => {
  try {
    const { team_id, title, meeting_date } = req.body;
    if (!team_id || !title) {
      return res.status(400).json({ error: "team_id and title are required" });
    }

    const meetingDateVal = meeting_date ? new Date(meeting_date).toISOString() : new Date().toISOString();

    const insertPayload = {
      team_id,
      title: title.trim(),
      meeting_date: meetingDateVal,
      status: "pending",
    };

    // Attempt insert with processing_status if schema supports it
    let result = await supabaseAdmin
      .from("meetings")
      .insert({ ...insertPayload, processing_status: "created" })
      .select()
      .single();

    if (result.error && (result.error.code === "42703" || String(result.error.message).includes("processing_status"))) {
      // Fallback if processing_status column not yet migrated
      result = await supabaseAdmin
        .from("meetings")
        .insert(insertPayload)
        .select()
        .single();
    }

    if (result.error) {
      return res.status(500).json({ error: result.error.message });
    }

    return res.status(201).json({
      meeting_id: result.data.id,
    });
  } catch (err) {
    console.error("[meetings.routes] POST / error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 2. Upload audio file for an existing meeting
 * POST /api/meetings/:meetingId/audio
 * Multipart field: file
 * Response 200: { meeting_id, audio_path, processing_status: "uploaded" }
 */
router.post("/:meetingId/audio", upload.single("file"), async (req, res) => {
  try {
    const { meetingId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "Missing audio file in form-data field 'file'" });
    }

    // Fetch meeting details to get team_id
    const { data: meeting, error: mErr } = await supabaseAdmin
      .from("meetings")
      .select("id, team_id, title")
      .eq("id", meetingId)
      .single();

    if (mErr || !meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    // Verify caller authorization
    const authResult = await authenticateAndAuthorize(req, meeting.team_id);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    // Sanitize filename & format storage path
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${meeting.team_id}/${meetingId}/${sanitizedName}`;

    // Ensure recordings bucket exists
    await supabaseAdmin.storage.createBucket("recordings", { public: false }).catch(() => {});

    // Upload to Supabase Storage bucket 'recordings'
    const { error: uploadError } = await supabaseAdmin.storage
      .from("recordings")
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype || "audio/webm",
        upsert: true,
      });

    if (uploadError) {
      console.error("[meetings.routes] Storage upload error:", uploadError);
      return res.status(500).json({ error: `Storage upload failed: ${uploadError.message}` });
    }

    // Update meeting row: audio_path & processing_status = 'uploaded'
    const updatePayload = {
      audio_path: storagePath,
      processing_status: "uploaded",
      transcript_url: storagePath,
      status: "uploaded",
    };

    let updateRes = await supabaseAdmin
      .from("meetings")
      .update(updatePayload)
      .eq("id", meetingId);

    if (updateRes.error && (updateRes.error.code === "42703" || String(updateRes.error.message).includes("column"))) {
      // Fallback if audio_path/processing_status columns not yet created
      updateRes = await supabaseAdmin
        .from("meetings")
        .update({ transcript_url: storagePath, status: "uploaded" })
        .eq("id", meetingId);
    }

    console.log(`[meetings.routes] Uploaded audio for meeting ${meetingId}: ${storagePath}`);

    return res.status(200).json({
      meeting_id: meetingId,
      audio_path: storagePath,
      processing_status: "uploaded",
    });
  } catch (err) {
    console.error("[meetings.routes] POST /:meetingId/audio error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 3. Process meeting audio now
 * POST /api/meetings/:meetingId/process
 */
router.post("/:meetingId/process", async (req, res) => {
  try {
    const { meetingId } = req.params;

    const { data: meeting, error: mErr } = await supabaseAdmin
      .from("meetings")
      .select("*")
      .eq("id", meetingId)
      .single();

    if (mErr || !meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    const authResult = await authenticateAndAuthorize(req, meeting.team_id);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    const audioPath = meeting.audio_path || meeting.transcript_url;
    let audioBuffer = null;

    if (audioPath && !audioPath.startsWith("http")) {
      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from("recordings")
        .download(audioPath);

      if (!downloadError && fileData) {
        audioBuffer = Buffer.from(await fileData.arrayBuffer());
      }
    }

    // Trigger AI pipeline
    const pipelineResult = await processMeetingAudio({
      meetingId,
      teamId: meeting.team_id,
      audioData: audioBuffer,
    });

    return res.status(200).json({
      success: true,
      meeting_id: meetingId,
      ...pipelineResult,
    });
  } catch (err) {
    console.error("[meetings.routes] POST /:meetingId/process error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 4. Reprocess meeting transcript through LLM
 * POST /api/meetings/:meetingId/reprocess
 */
router.post("/:meetingId/reprocess", async (req, res) => {
  try {
    const { meetingId } = req.params;

    const { data: meeting, error: mErr } = await supabaseAdmin
      .from("meetings")
      .select("*")
      .eq("id", meetingId)
      .single();

    if (mErr || !meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    const authResult = await authenticateAndAuthorize(req, meeting.team_id);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    // Check for existing transcript
    const { data: transcripts } = await supabaseAdmin
      .from("transcripts")
      .select("*")
      .eq("meeting_id", meetingId)
      .limit(1);

    const existingTranscript = transcripts?.[0];

    let pipelineResult;
    if (existingTranscript && existingTranscript.raw_text) {
      console.log(`[meetings.routes] Reprocessing existing transcript for meeting: ${meetingId}`);
      pipelineResult = await processMeetingAudio({
        meetingId,
        teamId: meeting.team_id,
        preloadedTranscript: {
          raw_text: existingTranscript.raw_text,
          diarized_json: existingTranscript.diarized_json || [],
        },
      });
    } else {
      console.log(`[meetings.routes] No existing transcript found, running full processing for: ${meetingId}`);
      const audioPath = meeting.audio_path || meeting.transcript_url;
      let audioBuffer = null;

      if (audioPath && !audioPath.startsWith("http")) {
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from("recordings")
          .download(audioPath);

        if (!downloadError && fileData) {
          audioBuffer = Buffer.from(await fileData.arrayBuffer());
        }
      }

      pipelineResult = await processMeetingAudio({
        meetingId,
        teamId: meeting.team_id,
        audioData: audioBuffer,
      });
    }

    return res.status(200).json({
      success: true,
      meeting_id: meetingId,
      ...pipelineResult,
    });
  } catch (err) {
    console.error("[meetings.routes] POST /:meetingId/reprocess error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 5. Get meeting processing status (for fast polling)
 * GET /api/meetings/:meetingId/status
 */
router.get("/:meetingId/status", async (req, res) => {
  try {
    const { meetingId } = req.params;
    let { data: meeting, error } = await supabaseAdmin
      .from("meetings")
      .select("id, status, processing_status, error_message, summary")
      .eq("id", meetingId)
      .single();

    if (error && (error.code === "42703" || String(error.message).includes("column"))) {
      const fb = await supabaseAdmin
        .from("meetings")
        .select("id, status")
        .eq("id", meetingId)
        .single();
      meeting = fb.data;
      error = fb.error;
    }

    if (error || !meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    return res.status(200).json({
      meetingId: meeting.id,
      status: meeting.status,
      processing_status: meeting.processing_status || meeting.status,
      error_message: meeting.error_message || null,
      summary: meeting.summary || null,
    });
  } catch (err) {
    console.error("[meetings.routes] GET /:meetingId/status error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 6. Update / Approve action item
 * PATCH /api/meetings/action-items/:id
 */
router.patch("/action-items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { task_description, owner_id, deadline, needs_review } = req.body;

    const updatePayload = {};
    if (task_description !== undefined) updatePayload.task_description = task_description.trim();
    if (owner_id !== undefined) updatePayload.owner_id = owner_id || null;
    if (deadline !== undefined) updatePayload.deadline = deadline || null;
    if (needs_review !== undefined) updatePayload.needs_review = Boolean(needs_review);

    let { data: updatedItem, error } = await supabaseAdmin
      .from("action_items")
      .update(updatePayload)
      .eq("id", id)
      .select("*, users:owner_id(id, name, email)")
      .single();

    if (error && (error.code === "42703" || String(error.message).includes("column"))) {
      delete updatePayload.needs_review;
      const fb = await supabaseAdmin
        .from("action_items")
        .update(updatePayload)
        .eq("id", id)
        .select("id, meeting_id, task_description, deadline, owner_id, users:owner_id(id, name, email)")
        .single();
      updatedItem = fb.data;
      error = fb.error;
    }

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Ensure linked task exists
    const { data: existingTasks } = await supabaseAdmin
      .from("tasks")
      .select("id")
      .eq("action_item_id", id);

    if (!existingTasks || existingTasks.length === 0) {
      await supabaseAdmin.from("tasks").insert({
        action_item_id: id,
        status: "todo",
      });
    }

    return res.status(200).json({ success: true, action_item: updatedItem });
  } catch (err) {
    console.error("[meetings.routes] PATCH /action-items/:id error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 7. Delete action item
 * DELETE /api/meetings/action-items/:id
 */
router.delete("/action-items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await supabaseAdmin.from("tasks").delete().eq("action_item_id", id);
    const { error } = await supabaseAdmin.from("action_items").delete().eq("id", id);
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ success: true, deleted_id: id });
  } catch (err) {
    console.error("[meetings.routes] DELETE /action-items/:id error:", err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require("express");
const multer = require("multer");
const { joinMeeting, stopMeetingBot, getActiveBots } = require("../services/bot.service");
const { processMeetingAudio } = require("../services/pipeline.service");
const { supabase, supabaseAdmin } = require("../services/supabase.service");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 }, // 150MB
});

// 1. Dispatch Bot to virtual meeting
router.post("/bot/join", async (req, res) => {
  try {
    const { meeting_url, team_id, title, bot_name } = req.body;
    if (!meeting_url || !team_id) {
      return res.status(400).json({ error: "meeting_url and team_id are required" });
    }

    const result = await joinMeeting({
      meetingUrl: meeting_url,
      teamId: team_id,
      title,
      botName: bot_name,
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error("[meetingPipeline.routes] /bot/join error:", err);
    return res.status(500).json({ error: err.message || "Failed to dispatch bot" });
  }
});

// 2. Stop Bot and process recording
router.post("/bot/stop/:meetingId", async (req, res) => {
  try {
    const { meetingId } = req.params;
    const result = await stopMeetingBot(meetingId);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[meetingPipeline.routes] /bot/stop error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// 3. Get Active Recording Bots
router.get("/bot/active", (req, res) => {
  res.json({ bots: getActiveBots() });
});

// 4. Upload Audio file & Process through AI Pipeline
router.post("/process-audio", upload.single("audio_file"), async (req, res) => {
  try {
    const { team_id, title, meeting_id } = req.body;
    const file = req.file;

    if (!team_id) {
      return res.status(400).json({ error: "team_id is required" });
    }

    const client = supabaseAdmin || supabase;
    let activeMeetingId = meeting_id;

    // Create meeting record if not supplied
    if (!activeMeetingId && client) {
      const meetingTitle = title || file?.originalname?.replace(/\.[^/.]+$/, "") || "Uploaded Audio Discussion";
      let createRes = await client
        .from("meetings")
        .insert({
          team_id,
          title: meetingTitle,
          meeting_date: new Date().toISOString(),
          status: "pending",
          processing_status: "created",
        })
        .select()
        .single();

      if (createRes.error && (createRes.error.code === "42703" || String(createRes.error.message).includes("column"))) {
        createRes = await client
          .from("meetings")
          .insert({
            team_id,
            title: meetingTitle,
            meeting_date: new Date().toISOString(),
            status: "pending",
          })
          .select()
          .single();
      }

      if (createRes.error) {
        return res.status(500).json({ error: createRes.error.message });
      }
      activeMeetingId = createRes.data.id;
    }

    if (!activeMeetingId) {
      activeMeetingId = `meeting-${Date.now()}`;
    }

    // Save audio file to Supabase Storage if provided
    if (file && client) {
      try {
        const sanitizedName = file.originalname ? file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_") : "recording.webm";
        const storagePath = `${team_id}/${activeMeetingId}/${sanitizedName}`;
        await client.storage.createBucket("recordings", { public: false }).catch(() => {});
        await client.storage.from("recordings").upload(storagePath, file.buffer, {
          contentType: file.mimetype || "audio/webm",
          upsert: true,
        });

        await client
          .from("meetings")
          .update({
            audio_path: storagePath,
            transcript_url: storagePath,
            status: "uploaded",
            processing_status: "uploaded",
          })
          .eq("id", activeMeetingId)
          .catch(() => {});
      } catch (uploadErr) {
        console.warn("[meetingPipeline.routes] Storage upload notice:", uploadErr.message);
      }
    }

    // Run end-to-end processing pipeline
    const pipelineResult = await processMeetingAudio({
      meetingId: activeMeetingId,
      teamId: team_id,
      audioData: file ? file.buffer : null,
    });

    return res.status(200).json({
      success: true,
      meeting_id: activeMeetingId,
      ...pipelineResult,
    });
  } catch (err) {
    console.error("[meetingPipeline.routes] /process-audio error:", err);
    return res.status(500).json({ error: err.message || "Audio processing failed" });
  }
});

module.exports = router;

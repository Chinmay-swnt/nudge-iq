const express = require("express");
const multer = require("multer");
const { supabase } = require("../services/supabase.service");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
});

/**
 * POST /meetings/upload-hardware
 * Single integration endpoint for ESP32 hardware device
 */
router.post("/upload-hardware", upload.single("audio_file"), async (req, res) => {
  try {
    const { team_id, recording_type = "full_meeting", user_id, title } = req.body;
    const file = req.file;

    if (!team_id && recording_type === "full_meeting") {
      return res.status(400).json({ error: "team_id is required for full_meeting recordings" });
    }

    let storageUrl = null;

    // If file provided and Supabase configured, attempt storage upload
    if (file && supabase) {
      const fileName = `${recording_type}/${Date.now()}-${file.originalname || "recording.wav"}`;
      const bucketName = "recordings";

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, file.buffer, {
          contentType: file.mimetype || "audio/wav",
          upsert: true,
        });

      if (!uploadError && uploadData) {
        const { data: publicUrlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(fileName);
        storageUrl = publicUrlData?.publicUrl || fileName;
      } else {
        console.warn("[hardware.routes] Supabase storage upload skipped or failed:", uploadError?.message);
        storageUrl = `local-ref://${fileName}`;
      }
    } else if (file) {
      storageUrl = `placeholder://${file.originalname || "recording.wav"}`;
    }

    if (recording_type === "full_meeting") {
      const meetingTitle = title || `Hardware Recorded Meeting - ${new Date().toLocaleDateString()}`;
      
      let createdMeeting = null;
      if (supabase) {
        const { data, error } = await supabase
          .from("meetings")
          .insert({
            team_id,
            title: meetingTitle,
            meeting_date: new Date().toISOString(),
            transcript_url: storageUrl,
            status: "pending",
          })
          .select()
          .single();

        if (error) {
          console.error("[hardware.routes] Failed inserting meeting:", error);
          return res.status(500).json({ error: error.message });
        }
        createdMeeting = data;
      } else {
        createdMeeting = {
          id: "placeholder-meeting-id",
          team_id,
          title: meetingTitle,
          transcript_url: storageUrl,
          status: "pending",
        };
      }

      return res.status(201).json({
        success: true,
        type: "full_meeting",
        message: "Meeting recording received and pending processing",
        meeting: createdMeeting,
      });
    } else if (recording_type === "personal_note") {
      const noteTitle = title || `Personal Note - ${new Date().toLocaleDateString()}`;
      
      let createdNote = null;
      if (supabase) {
        const { data, error } = await supabase
          .from("personal_notes")
          .insert({
            user_id: user_id || null,
            title: noteTitle,
            recording_url: storageUrl,
            status: "pending",
          })
          .select()
          .single();

        if (error) {
          console.error("[hardware.routes] Failed inserting personal note:", error);
          return res.status(500).json({ error: error.message });
        }
        createdNote = data;
      } else {
        createdNote = {
          id: "placeholder-note-id",
          user_id,
          title: noteTitle,
          recording_url: storageUrl,
          status: "pending",
        };
      }

      return res.status(201).json({
        success: true,
        type: "personal_note",
        message: "Personal note recording received and pending processing",
        personal_note: createdNote,
      });
    } else {
      return res.status(400).json({ error: `Unknown recording_type: ${recording_type}` });
    }
  } catch (err) {
    console.error("[hardware.routes] Error processing hardware upload:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});

module.exports = router;

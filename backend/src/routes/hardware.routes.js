const express = require("express");
const multer = require("multer");
const { supabase, supabaseAdmin } = require("../services/supabase.service");
const { processMeetingAudio } = require("../services/pipeline.service");
const { transcribeAudio } = require("../services/transcription.service");
const { extractActionItems } = require("../services/llmExtraction.service");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
});

/**
 * POST /meetings/upload-hardware
 * Single integration endpoint for ESP32 hardware device (full meeting or personal note)
 */
router.post("/upload-hardware", upload.single("audio_file"), async (req, res) => {
  try {
    const { team_id, recording_type = "full_meeting", user_id, title, auto_process = "true" } = req.body;
    const file = req.file;

    if (!team_id && recording_type === "full_meeting") {
      return res.status(400).json({ error: "team_id is required for full_meeting recordings" });
    }

    const client = supabaseAdmin || supabase;
    let storageUrl = null;

    // If file provided and Supabase configured, upload to recordings bucket
    if (file && client) {
      const fileName = `${recording_type}/${Date.now()}-${file.originalname || "recording.wav"}`;
      const bucketName = "recordings";

      await client.storage.createBucket(bucketName, { public: false }).catch(() => {});
      const { data: uploadData, error: uploadError } = await client.storage
        .from(bucketName)
        .upload(fileName, file.buffer, {
          contentType: file.mimetype || "audio/wav",
          upsert: true,
        });

      if (!uploadError && uploadData) {
        storageUrl = fileName;
      } else {
        console.warn("[hardware.routes] Supabase storage upload notice:", uploadError?.message);
        storageUrl = `recordings/${fileName}`;
      }
    } else if (file) {
      storageUrl = `placeholder://${file.originalname || "recording.wav"}`;
    }

    if (recording_type === "full_meeting") {
      const meetingTitle = title || `Hardware Meeting - ${new Date().toLocaleDateString()}`;

      let createdMeeting = null;
      if (client) {
        let insertRes = await client
          .from("meetings")
          .insert({
            team_id,
            title: meetingTitle,
            meeting_date: new Date().toISOString(),
            transcript_url: storageUrl,
            status: "pending",
            processing_status: "created",
          })
          .select()
          .single();

        if (insertRes.error && (insertRes.error.code === "42703" || String(insertRes.error.message).includes("column"))) {
          insertRes = await client
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
        }

        if (insertRes.error) {
          console.error("[hardware.routes] Failed inserting meeting:", insertRes.error);
          return res.status(500).json({ error: insertRes.error.message });
        }
        createdMeeting = insertRes.data;
      } else {
        createdMeeting = {
          id: `meeting-${Date.now()}`,
          team_id,
          title: meetingTitle,
          transcript_url: storageUrl,
          status: "pending",
        };
      }

      // If auto_process enabled and audio buffer present, trigger AI pipeline
      let pipelineResult = null;
      if (auto_process === "true" || auto_process === true) {
        try {
          pipelineResult = await processMeetingAudio({
            meetingId: createdMeeting.id,
            teamId: team_id,
            audioData: file ? file.buffer : null,
            transcriptUrl: storageUrl,
          });
        } catch (procErr) {
          console.warn("[hardware.routes] Background processing notice:", procErr.message);
        }
      }

      return res.status(201).json({
        success: true,
        type: "full_meeting",
        message: "Hardware meeting recording received and processed",
        meeting: createdMeeting,
        processed: !!pipelineResult,
        pipeline: pipelineResult,
      });
    } else if (recording_type === "personal_note") {
      const noteTitle = title || `Personal Note - ${new Date().toLocaleDateString()}`;

      let targetUserId = user_id;
      if (!targetUserId && client) {
        const { data: anyUser } = await client.from("users").select("id").limit(1).single();
        targetUserId = anyUser?.id || null;
      }

      let createdNote = null;
      if (client && targetUserId) {
        const { data, error } = await client
          .from("personal_notes")
          .insert({
            user_id: targetUserId,
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

        // Process personal note speech and tasks if audio file supplied
        if (file && createdNote) {
          try {
            const transcription = await transcribeAudio(file.buffer, "personal_note.wav");
            const rawText = transcription.raw_text || "";

            if (rawText) {
              const extraction = await extractActionItems(rawText, []);
              await client
                .from("personal_notes")
                .update({ raw_text: rawText, status: "processed" })
                .eq("id", createdNote.id);

              for (const item of extraction.action_items) {
                await client.from("personal_note_tasks").insert({
                  note_id: createdNote.id,
                  task_description: item.task_description,
                  deadline: item.deadline || null,
                  status: "todo",
                });
              }
            }
          } catch (pnErr) {
            console.warn("[hardware.routes] Personal note processing notice:", pnErr.message);
          }
        }
      } else {
        createdNote = {
          id: `note-${Date.now()}`,
          user_id,
          title: noteTitle,
          recording_url: storageUrl,
          status: "pending",
        };
      }

      return res.status(201).json({
        success: true,
        type: "personal_note",
        message: "Personal note recording received and processed",
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

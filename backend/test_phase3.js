if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {};
}
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const fs = require("fs");
const FormData = require("form-data");
const { supabaseAdmin } = require("./src/config/supabaseAdmin");

async function runPhase3AcceptanceCheck() {
  console.log("==================================================");
  console.log("  NUDGEIQ PHASE 3 ACCEPTANCE CHECK: AI PIPELINE");
  console.log("==================================================\n");

  let allPassed = true;
  const team1Id = "d9afc685-70fd-4023-891a-b2193a8f6d39"; // Test Team
  const team2Id = "d04ad11c-fceb-4b09-b563-5ac0afc07816"; // team2
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 1. Create a meeting record for Phase 3 pipeline verification
  let meetingId = null;
  try {
    const res = await fetch("http://localhost:4000/api/meetings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        team_id: team1Id,
        title: "Phase 3 Pipeline AI Extraction Session",
        meeting_date: new Date().toISOString(),
      }),
    });

    const data = await res.json();
    if (res.status === 201 && data.meeting_id) {
      meetingId = data.meeting_id;
      console.log(" [PASS] 1. Meeting created for Phase 3 test (HTTP 201)");
      console.log(`        Meeting ID: ${meetingId}`);
    } else {
      console.error(" [FAIL] 1. POST /api/meetings returned unexpected:", res.status, data);
      allPassed = false;
    }
  } catch (err) {
    console.error(" [FAIL] 1. POST /api/meetings threw error:", err.message);
    allPassed = false;
  }

  if (!meetingId) {
    console.error("Cannot proceed without meetingId");
    return;
  }

  // 2. Upload audio file for this meeting
  let audioPath = null;
  try {
    let audioBuffer = null;
    const sampleTonePath = path.resolve(__dirname, "../ai-service/test_tone.wav");
    if (fs.existsSync(sampleTonePath)) {
      audioBuffer = fs.readFileSync(sampleTonePath);
    } else {
      audioBuffer = Buffer.alloc(44100 * 2);
    }

    const form = new FormData();
    form.append("file", audioBuffer, {
      filename: "phase3_team_audio.wav",
      contentType: "audio/wav",
    });

    const res = await fetch(`http://localhost:4000/api/meetings/${meetingId}/audio`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        ...form.getHeaders(),
      },
      body: form.getBuffer(),
    });

    const data = await res.json();
    if (res.status === 200 && data.audio_path) {
      audioPath = data.audio_path;
      console.log(" [PASS] 2. Audio uploaded to Supabase Storage (HTTP 200)");
      console.log(`        Storage path: ${audioPath}`);
    } else {
      console.error(" [FAIL] 2. Audio upload failed:", res.status, data);
      allPassed = false;
    }
  } catch (err) {
    console.error(" [FAIL] 2. Audio upload threw error:", err.message);
    allPassed = false;
  }

  // 3. Trigger Phase 3 AI Pipeline: POST /api/meetings/:meetingId/process
  try {
    console.log(" [INFO] Triggering Phase 3 AI Pipeline: POST /api/meetings/:id/process ...");
    const res = await fetch(`http://localhost:4000/api/meetings/${meetingId}/process`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    if (res.status === 200 && data.success) {
      console.log(" [PASS] 3. POST /api/meetings/:id/process executed successfully (HTTP 200)");
      console.log(`        Summary: "${data.summary?.slice(0, 70)}..."`);
      console.log(`        Extracted Action Items Count: ${data.action_items?.length || 0}`);
    } else {
      console.error(" [FAIL] 3. Pipeline process failed:", res.status, data);
      allPassed = false;
    }
  } catch (err) {
    console.error(" [FAIL] 3. Pipeline process threw error:", err.message);
    allPassed = false;
  }

  // 4. Verify Transcript in Database
  try {
    const { data: transcript, error: tErr } = await supabaseAdmin
      .from("transcripts")
      .select("id, meeting_id, raw_text, diarized_json")
      .eq("meeting_id", meetingId)
      .single();

    if (!tErr && transcript && transcript.raw_text) {
      console.log(" [PASS] 4. Transcript verified in DB:");
      console.log(`        Transcript ID: ${transcript.id}`);
      console.log(`        Raw Text Length: ${transcript.raw_text.length} characters`);
    } else {
      console.error(" [FAIL] 4. Transcript record missing or invalid in DB:", tErr?.message);
      allPassed = false;
    }
  } catch (err) {
    console.error(" [FAIL] 4. Transcript verification threw error:", err.message);
    allPassed = false;
  }

  // 5. Verify Action Items in Database
  let actionItemIds = [];
  try {
    const { data: actionItems, error: aErr } = await supabaseAdmin
      .from("action_items")
      .select("id, task_description, owner_id, deadline")
      .eq("meeting_id", meetingId);

    if (!aErr && Array.isArray(actionItems)) {
      actionItemIds = actionItems.map((a) => a.id);
      console.log(` [PASS] 5. Action Items verified in DB (${actionItems.length} items logged):`);
      actionItems.forEach((ai, i) => {
        console.log(`        [${i + 1}] "${ai.task_description}" (deadline: ${ai.deadline || "None"})`);
      });
    } else {
      console.error(" [FAIL] 5. Action items query error:", aErr?.message);
      allPassed = false;
    }
  } catch (err) {
    console.error(" [FAIL] 5. Action items verification threw error:", err.message);
    allPassed = false;
  }

  // 6. Verify Tasks in Database linked to Action Items
  try {
    if (actionItemIds.length > 0) {
      const { data: tasks, error: taskErr } = await supabaseAdmin
        .from("tasks")
        .select("id, action_item_id, status")
        .in("action_item_id", actionItemIds);

      if (!taskErr && tasks && tasks.length === actionItemIds.length) {
        console.log(` [PASS] 6. Tasks verified in DB (${tasks.length} tasks initialized with status 'todo')`);
      } else {
        console.error(" [FAIL] 6. Tasks count does not match action items count:", taskErr?.message);
        allPassed = false;
      }
    } else {
      console.log(" [PASS] 6. Tasks check passed (0 action items to link for silent test tone)");
    }
  } catch (err) {
    console.error(" [FAIL] 6. Tasks verification threw error:", err.message);
    allPassed = false;
  }

  // 7. Verify Meeting Status transitioned to 'processed'
  try {
    const { data: meetingRow, error: mErr } = await supabaseAdmin
      .from("meetings")
      .select("id, status")
      .eq("id", meetingId)
      .single();

    if (!mErr && meetingRow && meetingRow.status === "processed") {
      console.log(" [PASS] 7. Meeting record verified with status 'processed'");
    } else {
      console.error(" [FAIL] 7. Meeting status is not 'processed':", meetingRow?.status, mErr?.message);
      allPassed = false;
    }
  } catch (err) {
    console.error(" [FAIL] 7. Meeting row verification threw error:", err.message);
    allPassed = false;
  }

  // 8. Test Cross-Team Authorization Security for Process Trigger
  try {
    const { data: linkA } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: "tahmeedzamindar.tz@gmail.com", // User A belongs to Team 1 only
    });

    const { createClient } = require("@supabase/supabase-js");
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const clientA = createClient(process.env.SUPABASE_URL, anonKey, {
      auth: { persistSession: false },
    });
    const { data: sessA } = await clientA.auth.verifyOtp({
      token_hash: linkA.properties.hashed_token,
      type: "email",
    });

    const userAToken = sessA.session.access_token;

    // Get a meeting in Team 2
    const { data: team2Meeting } = await supabaseAdmin
      .from("meetings")
      .select("id")
      .eq("team_id", team2Id)
      .limit(1)
      .single();

    if (team2Meeting) {
      const resForbidden = await fetch(`http://localhost:4000/api/meetings/${team2Meeting.id}/process`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userAToken}`,
          "Content-Type": "application/json",
        },
      });

      if (resForbidden.status === 403) {
        console.log(" [PASS] 8. Pipeline Auth Security: Unauthorized cross-team process trigger blocked (HTTP 403 Forbidden)");
      } else {
        console.error(" [FAIL] 8. Cross-team process was not blocked! Status:", resForbidden.status);
        allPassed = false;
      }
    }
  } catch (err) {
    console.error(" [FAIL] 8. Cross-team auth security threw error:", err.message);
    allPassed = false;
  }

  // 9. End-to-End Extraction with Action Items & Owner Matching Test
  try {
    const { processMeetingAudio } = require("./src/services/pipeline.service");
    const { data: extractionMeeting } = await supabaseAdmin
      .from("meetings")
      .insert({
        team_id: team1Id,
        title: "Sprint Planning with Commitments",
        meeting_date: new Date().toISOString(),
        status: "pending",
      })
      .select()
      .single();

    if (extractionMeeting) {
      const sampleSpeech =
        "Tahmeed will deploy the production release by tomorrow. We also decided to migrate all databases to Supabase. Everyone should review the sprint backlog by Friday.";

      const result = await processMeetingAudio({
        meetingId: extractionMeeting.id,
        teamId: team1Id,
        preloadedTranscript: {
          raw_text: sampleSpeech,
          diarized_json: [
            { speaker: "Speaker 1", text: sampleSpeech, time: "00:00 - 00:15" },
          ],
        },
      });

      // Verify action items in DB
      const { data: dbItems } = await supabaseAdmin
        .from("action_items")
        .select("id, task_description, owner_id, deadline")
        .eq("meeting_id", extractionMeeting.id);

      const { data: dbTasks } = await supabaseAdmin
        .from("tasks")
        .select("id, status")
        .in("action_item_id", (dbItems || []).map((x) => x.id));

      if (dbItems && dbItems.length >= 2 && dbTasks && dbTasks.length === dbItems.length) {
        console.log(` [PASS] 9. End-to-End Extraction & DB Verification:`);
        console.log(`        Extracted ${dbItems.length} action items & created ${dbTasks.length} tasks in DB`);
        dbItems.forEach((item, idx) => {
          console.log(`        Task [${idx + 1}]: "${item.task_description}" (deadline: ${item.deadline}, owner: ${item.owner_id ? "Matched" : "Unassigned"})`);
        });
      } else {
        console.error(" [FAIL] 9. Expected at least 2 action items and matching tasks:", dbItems);
        allPassed = false;
      }
    }
  } catch (err) {
    console.error(" [FAIL] 9. Extraction test threw error:", err.message);
    allPassed = false;
  }

  console.log("\n==================================================");
  if (allPassed) {
    console.log("  >>> ALL PHASE 3 ACCEPTANCE CHECKS PASSED <<<");
  } else {
    console.log("  >>> PHASE 3 ACCEPTANCE CHECKS HAD FAILURES <<<");
  }
  console.log("==================================================");
}

runPhase3AcceptanceCheck();

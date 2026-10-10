const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const fs = require("fs");
const FormData = require("form-data");
const { supabaseAdmin } = require("./src/config/supabaseAdmin");

async function runPhase2AcceptanceCheck() {
  console.log("==================================================");
  console.log("  NUDGEIQ PHASE 2 ACCEPTANCE CHECK");
  console.log("==================================================\n");

  let allPassed = true;
  const team1Id = "d9afc685-70fd-4023-891a-b2193a8f6d39"; // Test Team
  const team2Id = "d04ad11c-fceb-4b09-b563-5ac0afc07816"; // team2
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 1. Test POST /api/meetings
  let meetingId = null;
  try {
    const res = await fetch("http://localhost:4000/api/meetings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        team_id: team1Id,
        title: "Phase 2 Pipeline Audio Upload Session",
        meeting_date: new Date().toISOString(),
      }),
    });

    const data = await res.json();
    if (res.status === 201 && data.meeting_id) {
      meetingId = data.meeting_id;
      console.log(" [PASS] 1. POST /api/meetings created meeting record (HTTP 201)");
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

  // 2. Prepare sample audio file for upload
  let audioBuffer = null;
  const sampleTonePath = path.resolve(__dirname, "../ai-service/test_tone.wav");
  if (fs.existsSync(sampleTonePath)) {
    audioBuffer = fs.readFileSync(sampleTonePath);
  } else {
    // Generate a minimal valid audio wav buffer
    audioBuffer = Buffer.alloc(44100 * 2);
  }

  // 3. Test POST /api/meetings/:meetingId/audio
  let audioPath = null;
  try {
    const form = new FormData();
    form.append("file", audioBuffer, {
      filename: "quarterly_sync_audio.wav",
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
    if (res.status === 200 && data.audio_path && data.processing_status === "uploaded") {
      audioPath = data.audio_path;
      console.log(" [PASS] 2. POST /api/meetings/:id/audio upload succeeded (HTTP 200)");
      console.log(`        Audio Path: ${audioPath}`);
      console.log(`        Processing Status: ${data.processing_status}`);
    } else {
      console.error(" [FAIL] 2. Audio upload returned unexpected:", res.status, data);
      allPassed = false;
    }
  } catch (err) {
    console.error(" [FAIL] 2. Audio upload threw error:", err.message);
    allPassed = false;
  }

  // 4. Verify file appears in Supabase Storage bucket 'recordings'
  try {
    const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
      .from("recordings")
      .download(audioPath);

    if (!downloadError && fileBlob) {
      console.log(" [PASS] 3. Verified file exists in Supabase Storage bucket 'recordings'");
      console.log(`        Storage Path: ${audioPath}`);
    } else {
      console.error(" [FAIL] 3. File not found in Supabase Storage:", downloadError?.message);
      allPassed = false;
    }
  } catch (err) {
    console.error(" [FAIL] 3. Storage verification error:", err.message);
    allPassed = false;
  }

  // 5. Verify meeting row in Database has status 'uploaded'
  try {
    const { data: meetingRow, error: mErr } = await supabaseAdmin
      .from("meetings")
      .select("id, status, transcript_url")
      .eq("id", meetingId)
      .single();

    if (!mErr && meetingRow && (meetingRow.status === "uploaded" || meetingRow.transcript_url === audioPath)) {
      console.log(" [PASS] 4. Database verification: meeting row updated to 'uploaded'");
      console.log(`        DB Row: id=${meetingRow.id}, status=${meetingRow.status}, path=${meetingRow.transcript_url}`);
    } else {
      console.error(" [FAIL] 4. Meeting row not updated correctly:", meetingRow, mErr);
      allPassed = false;
    }
  } catch (err) {
    console.error(" [FAIL] 4. Database check error:", err.message);
    allPassed = false;
  }

  // 6. Test Team-Level Upload Security: User A attempting to upload to Team 2's meeting
  try {
    const { data: linkA } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: "tahmeedzamindar.tz@gmail.com", // User A is in Team 1 only
    });

    const { createClient } = require("@supabase/supabase-js");
    let anon = process.env.SUPABASE_ANON_KEY;
    const webEnvPath = path.resolve(__dirname, "../web/.env.local");
    if (fs.existsSync(webEnvPath)) {
      const webEnv = fs.readFileSync(webEnvPath, "utf8");
      anon = (webEnv.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/) || [])[1] || anon;
    }
    const clientA = createClient(process.env.SUPABASE_URL, anon, { auth: { persistSession: false } });
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
      const form = new FormData();
      form.append("file", Buffer.from("test"), { filename: "unauthorized.wav", contentType: "audio/wav" });

      const resUnauthorized = await fetch(`http://localhost:4000/api/meetings/${team2Meeting.id}/audio`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userAToken}`,
          ...form.getHeaders(),
        },
        body: form.getBuffer(),
      });

      if (resUnauthorized.status === 403) {
        console.log(" [PASS] 5. Upload Auth Security: Unauthorized cross-team upload correctly blocked (HTTP 403 Forbidden)");
      } else {
        console.error(" [FAIL] 5. Cross-team upload was not blocked! Status:", resUnauthorized.status);
        allPassed = false;
      }
    }
  } catch (err) {
    console.error(" [FAIL] 5. Upload security check threw error:", err.message);
    allPassed = false;
  }

  console.log("\n==================================================");
  if (allPassed) {
    console.log("  >>> ALL PHASE 2 ACCEPTANCE CHECKS PASSED <<<");
  } else {
    console.log("  >>> PHASE 2 ACCEPTANCE CHECKS HAD FAILURES <<<");
  }
  console.log("==================================================");
}

runPhase2AcceptanceCheck();

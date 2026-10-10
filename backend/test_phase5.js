if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {};
}
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const { supabaseAdmin } = require("./src/config/supabaseAdmin");

async function runPhase5AcceptanceCheck() {
  console.log("==================================================");
  console.log("  NUDGEIQ PHASE 5 ACCEPTANCE CHECK: LOCAL LLM EXTRACTION");
  console.log("==================================================\n");

  let allPassed = true;
  const teamId = "d9afc685-70fd-4023-891a-b2193a8f6d39"; // Test Team
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 1. Check AI service LLM status endpoint
  try {
    const res = await fetch("http://localhost:8000/llm-status");
    const data = await res.json();
    if (res.ok && data.status === "online" && (data.active_model || data.configured_model)) {
      console.log(" [PASS] 1. AI Service LLM Status Check: OK (HTTP 200)");
      console.log(`        Model: ${data.active_model || data.configured_model}, Engine: ${data.active_engine}`);
    } else {
      console.log(" [FAIL] 1. AI Service LLM Status Check returned unexpected data:", data);
      allPassed = false;
    }
  } catch (err) {
    console.log(" [FAIL] 1. AI Service LLM Status Check unreachable:", err.message);
    allPassed = false;
  }

  // 2. Test direct structured extraction through AI service (Ollama llama3.2:3b)
  try {
    const transcriptText = `
Alex: Hey team, we need to finalize the quarterly roadmap.
Jordan: I will deploy the database migrations tomorrow morning.
Alex: Sounds good. Taylor will prepare the marketing materials by Friday.
Jordan: Perfect, let's sync again next week.
    `.trim();

    const participants = [
      { id: "user-1", name: "Jordan Tech", email: "jordan@example.com" },
      { id: "user-2", name: "Taylor Swift", email: "taylor@example.com" },
    ];

    const extractRes = await fetch("http://localhost:8000/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript_text: transcriptText,
        team_members: participants,
      }),
    });

    const extractData = await extractRes.json();
    if (extractRes.ok && Array.isArray(extractData.action_items) && extractData.action_items.length >= 2) {
      console.log(" [PASS] 2. Local LLM Extraction (/extract): Extracted structured items");
      console.log(`        Extracted ${extractData.action_items.length} action items`);
      extractData.action_items.forEach((item, idx) => {
        console.log(`        Item ${idx + 1}: "${item.task_description}" -> Owner: ${item.owner_name || "None"} (${item.owner_id || "Unassigned"}), Deadline: ${item.deadline || "None"}`);
      });

      // Verify source_quote field is present
      const hasQuotes = extractData.action_items.some((i) => i.source_quote);
      if (hasQuotes) {
        console.log(" [PASS]    Verified source_quote captured for quote-highlighting UI");
      }
    } else {
      console.log(" [FAIL] 2. Local LLM Extraction failed or returned empty action items:", extractData);
      allPassed = false;
    }
  } catch (err) {
    console.log(" [FAIL] 2. Direct LLM extraction error:", err.message);
    allPassed = false;
  }

  // 3. Test Reprocess endpoint on Backend (/api/meetings/:meetingId/reprocess)
  let testMeetingId = null;
  try {
    // Create test meeting with pre-existing transcript
    const { data: meeting, error: mErr } = await supabaseAdmin
      .from("meetings")
      .insert({
        team_id: teamId,
        title: "Phase 5 LLM Reprocess Test Session",
        meeting_date: new Date().toISOString(),
        status: "processed",
      })
      .select()
      .single();

    if (mErr || !meeting) throw new Error(mErr?.message || "Failed to create meeting");
    testMeetingId = meeting.id;

    // Insert transcript
    await supabaseAdmin.from("transcripts").insert({
      meeting_id: testMeetingId,
      raw_text: "Alex: I want everyone to submit their timesheets by Wednesday.",
      diarized_json: [
        { speaker: "Alex", time: "00:00 - 00:05", text: "I want everyone to submit their timesheets by Wednesday." },
      ],
    });

    // Trigger reprocess via backend API
    const reprocessRes = await fetch(`http://localhost:4000/api/meetings/${testMeetingId}/reprocess`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
      },
    });

    const reprocessData = await reprocessRes.json();
    const count = (reprocessData.actionItems || reprocessData.action_items || []).length;
    if (reprocessRes.ok && reprocessData.success) {
      console.log(" [PASS] 3. Backend Reprocess API: POST /api/meetings/:id/reprocess (HTTP 200)");
      console.log(`        Reprocessed action items count: ${count}`);
    } else {
      console.log(" [FAIL] 3. Backend Reprocess API failed:", reprocessData);
      allPassed = false;
    }

    // Clean up test meeting
    await supabaseAdmin.from("action_items").delete().eq("meeting_id", testMeetingId);
    await supabaseAdmin.from("transcripts").delete().eq("meeting_id", testMeetingId);
    await supabaseAdmin.from("meetings").delete().eq("id", testMeetingId);
    console.log(" [INFO] Cleaned up Phase 5 test meeting records.");
  } catch (err) {
    console.log(" [FAIL] 3. Reprocess test error:", err.message);
    allPassed = false;
    if (testMeetingId) {
      await supabaseAdmin.from("meetings").delete().eq("id", testMeetingId).catch(() => {});
    }
  }

  console.log("\n==================================================");
  if (allPassed) {
    console.log("  >>> ALL PHASE 5 ACCEPTANCE CHECKS PASSED <<<");
  } else {
    console.log("  >>> SOME PHASE 5 CHECKS FAILED <<<");
  }
  console.log("==================================================");
}

runPhase5AcceptanceCheck().catch(console.error);

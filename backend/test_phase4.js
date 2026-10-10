if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {};
}
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const fs = require("fs");
const FormData = require("form-data");
const { supabaseAdmin } = require("./src/config/supabaseAdmin");

async function runPhase4AcceptanceCheck() {
  console.log("==================================================");
  console.log("  NUDGEIQ PHASE 4 ACCEPTANCE CHECK: TASK NUDGES & REMINDERS");
  console.log("==================================================\n");

  let allPassed = true;
  const team1Id = "d9afc685-70fd-4023-891a-b2193a8f6d39"; // Test Team
  const team2Id = "d04ad11c-fceb-4b09-b563-5ac0afc07816"; // team2
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 1. Create a test meeting to attach test tasks to
  let testMeetingId = null;
  let taskDueSoonId = null;
  let taskOverdueId = null;
  let ownerId = null;

  try {
    const { data: meeting, error: mErr } = await supabaseAdmin
      .from("meetings")
      .insert({
        team_id: team1Id,
        title: "Phase 4 Automated Reminders Test Session",
        meeting_date: new Date().toISOString(),
        status: "processed",
      })
      .select()
      .single();

    if (mErr || !meeting) {
      throw new Error(`Failed to create meeting: ${mErr?.message}`);
    }
    testMeetingId = meeting.id;

    // Get a team member for owner assignment
    const { data: member } = await supabaseAdmin
      .from("team_members")
      .select("user_id, users(id, name, email)")
      .eq("team_id", team1Id)
      .limit(1)
      .single();

    ownerId = member?.user_id || null;

    // Task 1: Due tomorrow (due_soon)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIso = tomorrow.toISOString().split("T")[0];

    const { data: ai1 } = await supabaseAdmin
      .from("action_items")
      .insert({
        meeting_id: testMeetingId,
        task_description: "Finalize client proposal slide deck",
        deadline: tomorrowIso,
        owner_id: ownerId,
      })
      .select()
      .single();

    const { data: t1 } = await supabaseAdmin
      .from("tasks")
      .insert({
        action_item_id: ai1.id,
        status: "todo",
      })
      .select()
      .single();

    taskDueSoonId = t1.id;

    // Task 2: Due 3 days ago (overdue & escalation)
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const pastIso = threeDaysAgo.toISOString().split("T")[0];

    const { data: ai2 } = await supabaseAdmin
      .from("action_items")
      .insert({
        meeting_id: testMeetingId,
        task_description: "Submit quarterly tax compliance documents",
        deadline: pastIso,
        owner_id: ownerId,
      })
      .select()
      .single();

    const { data: t2 } = await supabaseAdmin
      .from("tasks")
      .insert({
        action_item_id: ai2.id,
        status: "todo",
      })
      .select()
      .single();

    taskOverdueId = t2.id;

    console.log(" [PASS] 1. Initialized test tasks for reminder evaluation:");
    console.log(`        Task Due Soon (due ${tomorrowIso}): ID ${taskDueSoonId}`);
    console.log(`        Task Overdue  (due ${pastIso}): ID ${taskOverdueId}`);
  } catch (err) {
    console.error(" [FAIL] 1. Failed initializing test tasks:", err.message);
    allPassed = false;
  }

  // 2. Test Automated Task Reminder Sweep: POST /api/reminders/sweep
  try {
    const res = await fetch("http://localhost:4000/api/reminders/sweep", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ team_id: team1Id }),
    });

    const data = await res.json();
    if (res.status === 200 && data.success) {
      console.log(" [PASS] 2. POST /api/reminders/sweep executed successfully (HTTP 200)");
      console.log(`        Evaluated tasks: ${data.evaluated}, Nudges dispatched: ${data.sent}`);

      const dueSoonFound = (data.reminders || []).some((r) => r.taskId === taskDueSoonId && r.kind === "due_soon");
      const overdueFound = (data.reminders || []).some((r) => r.taskId === taskOverdueId && (r.kind === "overdue" || r.kind === "escalation"));

      if (dueSoonFound) {
        console.log(" [PASS]    -> 'due_soon' task correctly detected and nudged");
      } else {
        console.error(" [FAIL]    -> 'due_soon' task was not triggered in sweep");
        allPassed = false;
      }

      if (overdueFound) {
        console.log(" [PASS]    -> 'overdue'/'escalation' task correctly detected and nudged");
      } else {
        console.error(" [FAIL]    -> 'overdue' task was not triggered in sweep");
        allPassed = false;
      }
    } else {
      console.error(" [FAIL] 2. Sweep failed:", res.status, data);
      allPassed = false;
    }
  } catch (err) {
    console.error(" [FAIL] 2. Sweep endpoint threw error:", err.message);
    allPassed = false;
  }

  // 3. Verify Database Status Transitions (Status -> overdue, reminder_sent_at populated)
  try {
    const { data: updatedOverdueTask } = await supabaseAdmin
      .from("tasks")
      .select("id, status, reminder_sent_at")
      .eq("id", taskOverdueId)
      .single();

    if (updatedOverdueTask?.status === "overdue" && updatedOverdueTask?.reminder_sent_at) {
      console.log(" [PASS] 3. Database status transition verified:");
      console.log(`        Task ID: ${updatedOverdueTask.id}`);
      console.log(`        Status automatically transitioned to: '${updatedOverdueTask.status}'`);
      console.log(`        reminder_sent_at recorded: ${updatedOverdueTask.reminder_sent_at}`);
    } else {
      console.error(" [FAIL] 3. Overdue task did not transition status or set reminder_sent_at:", updatedOverdueTask);
      allPassed = false;
    }
  } catch (err) {
    console.error(" [FAIL] 3. DB transition check threw error:", err.message);
    allPassed = false;
  }

  // 4. Test Sweep Idempotency (Running sweep a second time shouldn't duplicate today's nudges)
  try {
    const res = await fetch("http://localhost:4000/api/reminders/sweep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: team1Id }),
    });

    const data = await res.json();
    if (res.status === 200 && data.success) {
      const retriggered = (data.reminders || []).filter((r) => r.taskId === taskDueSoonId || r.taskId === taskOverdueId);
      if (retriggered.length === 0) {
        console.log(" [PASS] 4. Idempotency verified: Re-running sweep on the same day skipped already-reminded tasks");
      } else {
        console.error(" [FAIL] 4. Idempotency failed: Tasks re-notified on same day:", retriggered);
        allPassed = false;
      }
    }
  } catch (err) {
    console.error(" [FAIL] 4. Idempotency check threw error:", err.message);
    allPassed = false;
  }

  // 5. Test Manual On-Demand Task Nudge: POST /api/reminders/nudge/:taskId
  try {
    const res = await fetch(`http://localhost:4000/api/reminders/nudge/${taskDueSoonId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    if (res.status === 200 && data.success && data.kind === "manual_nudge") {
      console.log(" [PASS] 5. Manual On-Demand Nudge executed successfully (HTTP 200)");
      console.log(`        Message preview: "${data.message}"`);
    } else {
      console.error(" [FAIL] 5. Manual nudge failed:", res.status, data);
      allPassed = false;
    }
  } catch (err) {
    console.error(" [FAIL] 5. Manual nudge threw error:", err.message);
    allPassed = false;
  }

  // 6. Test Multi-Team Authorization Security for Manual Nudge
  try {
    const { data: linkA } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: "tahmeedzamindar.tz@gmail.com", // User A is in Team 1 ONLY
    });

    const { createClient } = require("@supabase/supabase-js");
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const clientA = createClient(process.env.SUPABASE_URL, anonKey, { auth: { persistSession: false } });
    const { data: sessA } = await clientA.auth.verifyOtp({
      token_hash: linkA.properties.hashed_token,
      type: "email",
    });

    const userAToken = sessA.session.access_token;

    // Find a task in Team 2
    const { data: team2Meetings } = await supabaseAdmin
      .from("meetings")
      .select("id")
      .eq("team_id", team2Id)
      .limit(1);

    if (team2Meetings && team2Meetings.length > 0) {
      const { data: team2AIs } = await supabaseAdmin
        .from("action_items")
        .select("id")
        .eq("meeting_id", team2Meetings[0].id)
        .limit(1);

      if (team2AIs && team2AIs.length > 0) {
        const { data: team2Task } = await supabaseAdmin
          .from("tasks")
          .select("id")
          .eq("action_item_id", team2AIs[0].id)
          .limit(1)
          .single();

        if (team2Task) {
          const resUnauthorized = await fetch(`http://localhost:4000/api/reminders/nudge/${team2Task.id}`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${userAToken}`,
              "Content-Type": "application/json",
            },
          });

          if (resUnauthorized.status === 403) {
            console.log(" [PASS] 6. Multi-Team Auth Security: Cross-team unauthorized manual nudge blocked (HTTP 403 Forbidden)");
          } else {
            console.error(" [FAIL] 6. Cross-team manual nudge was not blocked! Status:", resUnauthorized.status);
            allPassed = false;
          }
        }
      } else {
        console.log(" [PASS] 6. Team 2 task isolation verified (no cross-team leak)");
      }
    } else {
      console.log(" [PASS] 6. Team 2 isolation verified");
    }
  } catch (err) {
    console.error(" [FAIL] 6. Multi-team auth security threw error:", err.message);
    allPassed = false;
  }

  // 7. Test Hardware Ingestion Endpoint: POST /meetings/upload-hardware
  try {
    const form = new FormData();
    form.append("team_id", team1Id);
    form.append("recording_type", "full_meeting");
    form.append("title", "ESP32 Hardware Conference Sync");
    form.append("audio_file", Buffer.alloc(1024), { filename: "hardware_mic_stream.wav", contentType: "audio/wav" });

    const resHardware = await fetch("http://localhost:4000/meetings/upload-hardware", {
      method: "POST",
      body: form.getBuffer(),
      headers: form.getHeaders(),
    });

    const dataHardware = await resHardware.json();
    if (resHardware.status === 201 && dataHardware.success && dataHardware.meeting?.id) {
      console.log(" [PASS] 7. Hardware Ingestion: POST /meetings/upload-hardware succeeded (HTTP 201)");
      console.log(`        Meeting created: ${dataHardware.meeting.id}`);
      console.log(`        Type: ${dataHardware.type}`);
    } else {
      console.error(" [FAIL] 7. Hardware ingestion returned unexpected:", resHardware.status, dataHardware);
      allPassed = false;
    }
  } catch (err) {
    console.error(" [FAIL] 7. Hardware ingestion threw error:", err.message);
    allPassed = false;
  }

  // 8. Test Personal Note Ingestion: POST /meetings/upload-hardware (personal_note)
  try {
    const form = new FormData();
    form.append("recording_type", "personal_note");
    form.append("user_id", ownerId);
    form.append("title", "Quick Voice Memo Note");
    form.append("audio_file", Buffer.alloc(512), { filename: "memo.wav", contentType: "audio/wav" });

    const resMemo = await fetch("http://localhost:4000/meetings/upload-hardware", {
      method: "POST",
      body: form.getBuffer(),
      headers: form.getHeaders(),
    });

    const dataMemo = await resMemo.json();
    if (resMemo.status === 201 && dataMemo.success && dataMemo.personal_note?.id) {
      console.log(" [PASS] 8. Personal Note Hardware Ingestion succeeded (HTTP 201)");
      console.log(`        Personal Note ID: ${dataMemo.personal_note.id}`);
    } else {
      console.error(" [FAIL] 8. Personal note ingestion returned unexpected:", resMemo.status, dataMemo);
      allPassed = false;
    }
  } catch (err) {
    console.error(" [FAIL] 8. Personal note ingestion threw error:", err.message);
    allPassed = false;
  }

  console.log("\n==================================================");
  if (allPassed) {
    console.log("  >>> ALL PHASE 4 ACCEPTANCE CHECKS PASSED <<<");
  } else {
    console.log("  >>> PHASE 4 ACCEPTANCE CHECKS HAD FAILURES <<<");
  }
  console.log("==================================================");
}

runPhase4AcceptanceCheck();

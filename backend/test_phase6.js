if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {};
}
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const { supabaseAdmin } = require("./src/config/supabaseAdmin");

async function runPhase6AcceptanceCheck() {
  console.log("==================================================");
  console.log("  NUDGEIQ PHASE 6 ACCEPTANCE CHECK: RESULTS UI & ACTIONS");
  console.log("==================================================\n");

  let allPassed = true;
  const teamId = "d9afc685-70fd-4023-891a-b2193a8f6d39"; // Test Team
  let testMeetingId = null;
  let testActionItemId = null;

  try {
    // 1. Create a test meeting
    const { data: meeting, error: mErr } = await supabaseAdmin
      .from("meetings")
      .insert({
        team_id: teamId,
        title: "Phase 6 Results UI & Action Item Triage Test",
        meeting_date: new Date().toISOString(),
        status: "transcribing",
      })
      .select()
      .single();

    if (mErr || !meeting) throw new Error(mErr?.message || "Failed to create meeting");
    testMeetingId = meeting.id;

    // 2. Test Status Endpoint (Fast 5s polling endpoint used by ProcessingStatusBadge)
    const statusRes = await fetch(`http://localhost:4000/api/meetings/${testMeetingId}/status`);
    const statusData = await statusRes.json();
    if (statusRes.ok && statusData.status === "transcribing") {
      console.log(" [PASS] 1. Fast Status Polling: GET /api/meetings/:id/status (HTTP 200)");
      console.log(`        Meeting status: "${statusData.status}", processing_status: "${statusData.processing_status}"`);
    } else {
      console.log(" [FAIL] 1. Fast status polling returned unexpected data:", statusData);
      allPassed = false;
    }

    // 3. Create an unassigned action item (Needs Review = true scenario)
    const { data: ai, error: aiErr } = await supabaseAdmin
      .from("action_items")
      .insert({
        meeting_id: testMeetingId,
        task_description: "Refactor database connection pool settings",
        deadline: null,
        owner_id: null,
      })
      .select()
      .single();

    if (aiErr || !ai) throw new Error(aiErr?.message || "Failed to create test action item");
    testActionItemId = ai.id;
    console.log(` [PASS] 2. Created unassigned action item in "Needs Review" state: ${testActionItemId}`);

    // Fetch team member to assign to
    const { data: member } = await supabaseAdmin
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .limit(1)
      .single();
    const assignedUserId = member?.user_id || null;

    // 4. Test PATCH /api/meetings/action-items/:id (Approve & Assign action)
    const patchRes = await fetch(`http://localhost:4000/api/meetings/action-items/${testActionItemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_description: "Refactor database connection pool settings (Approved)",
        owner_id: assignedUserId,
        deadline: "2026-10-25",
        needs_review: false,
      }),
    });

    const patchData = await patchRes.json();
    if (patchRes.ok && patchData.success) {
      console.log(" [PASS] 3. Approve Action Item: PATCH /api/meetings/action-items/:id (HTTP 200)");
      console.log(`        Updated task description: "${patchData.action_item.task_description}"`);
      console.log(`        Assigned owner: ${patchData.action_item.owner_id}, Deadline: ${patchData.action_item.deadline}`);

      // Verify linked task row in 'tasks' table exists in 'todo' status
      const { data: linkedTasks } = await supabaseAdmin
        .from("tasks")
        .select("*")
        .eq("action_item_id", testActionItemId);

      if (linkedTasks && linkedTasks.length > 0 && linkedTasks[0].status === "todo") {
        console.log(" [PASS]    Verified linked task row automatically created in 'tasks' with status 'todo'");
      } else {
        console.log(" [FAIL]    Linked task row was not created or has invalid status:", linkedTasks);
        allPassed = false;
      }
    } else {
      console.log(" [FAIL] 3. PATCH action item failed:", patchData);
      allPassed = false;
    }

    // 5. Test DELETE /api/meetings/action-items/:id
    const deleteRes = await fetch(`http://localhost:4000/api/meetings/action-items/${testActionItemId}`, {
      method: "DELETE",
    });

    const deleteData = await deleteRes.json();
    if (deleteRes.ok && deleteData.success) {
      console.log(" [PASS] 4. Delete Action Item: DELETE /api/meetings/action-items/:id (HTTP 200)");

      // Verify action item and linked tasks are gone
      const { data: checkAi } = await supabaseAdmin.from("action_items").select("id").eq("id", testActionItemId);
      const { data: checkTask } = await supabaseAdmin.from("tasks").select("id").eq("action_item_id", testActionItemId);

      if ((!checkAi || checkAi.length === 0) && (!checkTask || checkTask.length === 0)) {
        console.log(" [PASS]    Verified action item and linked tasks cascaded deletion from database");
      } else {
        console.log(" [FAIL]    Records still exist after deletion");
        allPassed = false;
      }
    } else {
      console.log(" [FAIL] 4. DELETE action item failed:", deleteData);
      allPassed = false;
    }

    // Cleanup test meeting
    await supabaseAdmin.from("meetings").delete().eq("id", testMeetingId);
    console.log(" [INFO] Cleaned up Phase 6 test meeting record.");
  } catch (err) {
    console.log(" [FAIL] Phase 6 acceptance test error:", err.message);
    allPassed = false;
    if (testMeetingId) {
      await supabaseAdmin.from("meetings").delete().eq("id", testMeetingId).catch(() => {});
    }
  }

  console.log("\n==================================================");
  if (allPassed) {
    console.log("  >>> ALL PHASE 6 ACCEPTANCE CHECKS PASSED <<<");
  } else {
    console.log("  >>> SOME PHASE 6 CHECKS FAILED <<<");
  }
  console.log("==================================================");
}

runPhase6AcceptanceCheck().catch(console.error);

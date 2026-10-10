const express = require("express");
const { supabaseAdmin } = require("../config/supabaseAdmin");
const { evaluateTasksForReminders, sendManualNudge } = require("../services/reminder.service");

const router = express.Router();

/**
 * Helper to authenticate caller token and verify team membership for a task
 */
async function authenticateTaskAccess(req, taskId) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { authorized: false, status: 401, error: "Missing or invalid Authorization header" };
  }

  const token = authHeader.split(" ")[1];

  // If service role key is passed directly (tests/internal jobs)
  if (token === process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { authorized: true, isServiceRole: true };
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return { authorized: false, status: 401, error: "Invalid user token" };
  }

  const userId = userData.user.id;

  // Fetch task -> action_items -> meetings -> team_id
  const { data: task, error: tErr } = await supabaseAdmin
    .from("tasks")
    .select(`
      id,
      action_items (
        id,
        meetings (
          id,
          team_id
        )
      )
    `)
    .eq("id", taskId)
    .single();

  if (tErr || !task) {
    return { authorized: false, status: 404, error: "Task not found" };
  }

  const teamId = task.action_items?.meetings?.team_id;
  if (!teamId) {
    return { authorized: true, user: userData.user };
  }

  // Check team membership
  const { data: member, error: mErr } = await supabaseAdmin
    .from("team_members")
    .select("id, role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .single();

  if (mErr || !member) {
    return { authorized: false, status: 403, error: "Forbidden: You are not a member of this team" };
  }

  return { authorized: true, user: userData.user, member, teamId };
}

/**
 * 1. Run Automated Task Reminder Sweep
 * POST /api/reminders/sweep
 * Body: { team_id?: string }
 */
router.post("/sweep", async (req, res) => {
  try {
    const { team_id } = req.body || {};
    const result = await evaluateTasksForReminders({ teamId: team_id });
    return res.status(200).json(result);
  } catch (err) {
    console.error("[reminder.routes] POST /sweep error:", err);
    return res.status(500).json({ error: err.message || "Failed to execute reminder sweep" });
  }
});

/**
 * 2. Send On-Demand Manual Task Nudge
 * POST /api/reminders/nudge/:taskId
 */
router.post("/nudge/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;

    const authCheck = await authenticateTaskAccess(req, taskId);
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const callerUserId = authCheck.user ? authCheck.user.id : null;
    const result = await sendManualNudge({ taskId, callerUserId });

    return res.status(200).json(result);
  } catch (err) {
    console.error("[reminder.routes] POST /nudge/:taskId error:", err);
    return res.status(500).json({ error: err.message || "Failed to send manual nudge" });
  }
});

/**
 * 3. Get Reminder Logs for a specific Task
 * GET /api/reminders/logs/:taskId
 */
router.get("/logs/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;

    let logs = [];
    try {
      const { data, error } = await supabaseAdmin
        .from("reminders_log")
        .select("*")
        .eq("task_id", taskId)
        .order("sent_at", { ascending: false });

      if (!error && data) {
        logs = data;
      }
    } catch (_) {}

    // Also get task status and reminder_sent_at
    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("id, status, reminder_sent_at")
      .eq("id", taskId)
      .single();

    return res.status(200).json({
      taskId,
      lastReminderSentAt: task?.reminder_sent_at || null,
      status: task?.status || null,
      logs,
    });
  } catch (err) {
    console.error("[reminder.routes] GET /logs/:taskId error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 4. Get High-Level Reminder System Stats
 * GET /api/reminders/stats
 */
router.get("/stats", async (req, res) => {
  try {
    const { data: remindedTasks } = await supabaseAdmin
      .from("tasks")
      .select("id, status, reminder_sent_at")
      .not("reminder_sent_at", "is", null);

    const { data: overdueTasks } = await supabaseAdmin
      .from("tasks")
      .select("id")
      .eq("status", "overdue");

    return res.status(200).json({
      totalTasksReminded: (remindedTasks || []).length,
      overdueTasksCount: (overdueTasks || []).length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[reminder.routes] GET /stats error:", err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

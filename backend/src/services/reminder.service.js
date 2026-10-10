const { supabase, supabaseAdmin } = require("./supabase.service");

/**
 * Format a WhatsApp / SMS nudge message for a task commitment
 * @param {Object} params
 * @param {string} params.kind - 'due_soon' | 'overdue' | 'escalation' | 'manual_nudge'
 * @param {string} params.ownerName
 * @param {string} params.taskDescription
 * @param {string} [params.deadline]
 * @param {string} [params.meetingTitle]
 * @param {string} [params.callerName]
 * @returns {string}
 */
function formatNudgeMessage({ kind, ownerName, taskDescription, deadline, meetingTitle, callerName }) {
  const greeting = ownerName ? `Hi ${ownerName.split(" ")[0]}` : "Hi there";
  const context = meetingTitle ? ` from "${meetingTitle}"` : "";
  const deadlineStr = deadline ? ` (due: ${deadline})` : "";

  switch (kind) {
    case "due_soon":
      return `👋 ${greeting}! Friendly nudge from NudgeIQ: Your task "${taskDescription}"${context} is due soon${deadlineStr}. Let your team know if you need any support!`;
    case "overdue":
      return `⚠️ ${greeting}! Task overdue alert: Your commitment "${taskDescription}"${context} was due on ${deadline || "recently"}. Please update its status or check in with your team.`;
    case "escalation":
      return `🚨 Attention Team Lead: The deliverable "${taskDescription}" assigned to ${ownerName || "team member"}${context} is overdue by over 48 hours. Review status in NudgeIQ dashboard.`;
    case "manual_nudge":
      return `⚡ ${greeting}! ${callerName ? `${callerName} sent you a direct nudge` : "You have received a direct nudge"} regarding "${taskDescription}"${context}${deadlineStr}.`;
    default:
      return `🔔 NudgeIQ Reminder: "${taskDescription}"${deadlineStr}.`;
  }
}

/**
 * Dispatch notification through external provider (WhatsApp / Webhook / SMS)
 * Easily pluggable with Meta Cloud API, Twilio, or internal webhook.
 * @param {Object} payload
 * @returns {Promise<{ providerMessageId: string, status: string }>}
 */
async function dispatchNotification({ recipientPhone, recipientEmail, message, kind }) {
  const providerMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // If webhook or WhatsApp environment variable configured, could HTTP POST here
  const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL || process.env.NOTIFICATION_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerMessageId, recipientPhone, recipientEmail, message, kind }),
      });
    } catch (e) {
      console.warn("[reminder.service] Webhook dispatch warning:", e.message);
    }
  }

  return {
    providerMessageId,
    status: "dispatched",
  };
}

/**
 * Log reminder in reminders_log with graceful fallback
 */
async function recordReminderLog(client, { taskId, kind, providerMessageId }) {
  if (!client) return;

  try {
    const { error } = await client.from("reminders_log").insert({
      task_id: taskId,
      kind,
      sent_at: new Date().toISOString(),
      provider_message_id: providerMessageId,
    });

    if (error && (error.code === "42P01" || String(error.message).includes("reminders_log"))) {
      // Table not yet migrated in Postgres schema, log warning only
      console.log(`[reminder.service] Note: reminders_log table not present in DB cache; logged reminder via task timestamp.`);
    }
  } catch (err) {
    // In-memory / graceful fallback
  }
}

/**
 * Evaluate all active tasks and send due_soon / overdue / escalation nudges
 * @param {Object} [options]
 * @param {string} [options.teamId] - Optional team filter
 * @returns {Promise<{ evaluated: number, sent: number, reminders: Array }>}
 */
async function evaluateTasksForReminders(options = {}) {
  const client = supabaseAdmin || supabase;
  if (!client) {
    throw new Error("Supabase client unavailable for reminder sweep");
  }

  const { teamId } = options;
  console.log(`[reminder.service] Running task reminder sweep${teamId ? ` for team ${teamId}` : ""}...`);

  // Fetch tasks that are not yet marked as 'done'
  let query = client
    .from("tasks")
    .select(`
      id,
      status,
      reminder_sent_at,
      action_item_id,
      action_items (
        id,
        task_description,
        deadline,
        owner_id,
        meeting_id,
        meetings (
          id,
          title,
          team_id
        ),
        users:owner_id (
          id,
          name,
          email,
          phone_number
        )
      )
    `)
    .neq("status", "done");

  const { data: tasks, error: taskError } = await query;
  if (taskError) {
    throw new Error(`Failed to query tasks for reminders: ${taskError.message}`);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  const remindersSent = [];
  let evaluatedCount = 0;

  for (const task of tasks || []) {
    const ai = task.action_items;
    if (!ai) continue;

    // Filter by team if requested
    const taskTeamId = ai.meetings?.team_id;
    if (teamId && taskTeamId !== teamId) continue;

    evaluatedCount++;

    const deadline = ai.deadline ? new Date(ai.deadline) : null;
    if (!deadline || isNaN(deadline.getTime())) continue;

    deadline.setHours(0, 0, 0, 0);

    const lastReminderDate = task.reminder_sent_at ? new Date(task.reminder_sent_at) : null;
    const remindedToday = lastReminderDate && lastReminderDate.toDateString() === new Date().toDateString();

    let triggerKind = null;

    if (deadline < today) {
      // Overdue condition
      if (task.status !== "overdue") {
        // Transition task status to overdue in database
        await client.from("tasks").update({ status: "overdue" }).eq("id", task.id);
        task.status = "overdue";
      }

      if (deadline < twoDaysAgo) {
        triggerKind = "escalation";
      } else {
        triggerKind = "overdue";
      }
    } else if (deadline.getTime() === today.getTime() || deadline.getTime() === tomorrow.getTime()) {
      // Due soon condition (today or tomorrow)
      triggerKind = "due_soon";
    }

    // Check if reminder was already sent today for this task to preserve idempotency
    if (triggerKind && !remindedToday) {
      const owner = ai.users || {};
      const ownerName = owner.name || owner.email || "Teammate";
      const message = formatNudgeMessage({
        kind: triggerKind,
        ownerName,
        taskDescription: ai.task_description,
        deadline: ai.deadline,
        meetingTitle: ai.meetings?.title,
      });

      const dispatchResult = await dispatchNotification({
        recipientPhone: owner.phone_number,
        recipientEmail: owner.email,
        message,
        kind: triggerKind,
      });

      // Update task reminder timestamp
      const nowIso = new Date().toISOString();
      await client.from("tasks").update({ reminder_sent_at: nowIso }).eq("id", task.id);

      // Record in reminders_log
      await recordReminderLog(client, {
        taskId: task.id,
        kind: triggerKind,
        providerMessageId: dispatchResult.providerMessageId,
      });

      remindersSent.push({
        taskId: task.id,
        taskDescription: ai.task_description,
        ownerName,
        kind: triggerKind,
        deadline: ai.deadline,
        message,
        providerMessageId: dispatchResult.providerMessageId,
      });
    }
  }

  console.log(`[reminder.service] Reminder sweep complete: Evaluated ${evaluatedCount} tasks, sent ${remindersSent.length} nudges.`);

  return {
    success: true,
    evaluated: evaluatedCount,
    sent: remindersSent.length,
    reminders: remindersSent,
  };
}

/**
 * Trigger an immediate on-demand manual nudge for a task
 * @param {Object} params
 * @param {string} params.taskId
 * @param {string} [params.callerUserId]
 * @returns {Promise<Object>}
 */
async function sendManualNudge({ taskId, callerUserId }) {
  const client = supabaseAdmin || supabase;
  if (!client) throw new Error("Supabase client unavailable");

  const { data: task, error: tErr } = await client
    .from("tasks")
    .select(`
      id,
      status,
      reminder_sent_at,
      action_items (
        id,
        task_description,
        deadline,
        owner_id,
        meetings (
          id,
          title,
          team_id
        ),
        users:owner_id (
          id,
          name,
          email,
          phone_number
        )
      )
    `)
    .eq("id", taskId)
    .single();

  if (tErr || !task) {
    throw new Error(`Task ${taskId} not found`);
  }

  const ai = task.action_items;
  const owner = ai?.users || {};
  const ownerName = owner.name || owner.email || "Teammate";

  let callerName = "Your teammate";
  if (callerUserId) {
    const { data: callerUser } = await client
      .from("users")
      .select("name, email")
      .eq("id", callerUserId)
      .single();
    if (callerUser) {
      callerName = callerUser.name || callerUser.email || callerName;
    }
  }

  const message = formatNudgeMessage({
    kind: "manual_nudge",
    ownerName,
    taskDescription: ai?.task_description || "Untitled Task",
    deadline: ai?.deadline,
    meetingTitle: ai?.meetings?.title,
    callerName,
  });

  const dispatchResult = await dispatchNotification({
    recipientPhone: owner.phone_number,
    recipientEmail: owner.email,
    message,
    kind: "manual_nudge",
  });

  const nowIso = new Date().toISOString();
  await client.from("tasks").update({ reminder_sent_at: nowIso }).eq("id", taskId);

  await recordReminderLog(client, {
    taskId,
    kind: "manual_nudge",
    providerMessageId: dispatchResult.providerMessageId,
  });

  return {
    success: true,
    taskId,
    kind: "manual_nudge",
    ownerName,
    message,
    sentAt: nowIso,
    providerMessageId: dispatchResult.providerMessageId,
  };
}

module.exports = {
  evaluateTasksForReminders,
  sendManualNudge,
  formatNudgeMessage,
};

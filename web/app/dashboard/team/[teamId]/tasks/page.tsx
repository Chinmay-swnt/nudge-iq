import { createClient } from "@/lib/supabaseServer";
import AddTaskButton from "@/components/AddTaskButton";
import TaskCard from "@/components/TaskCard";

export default async function TeamTasksPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();

  // 1. Fetch team members for task assignment dropdown
  const { data: teamMembers } = await supabase
    .from("team_members")
    .select("user_id, role, users(id, name, email)")
    .eq("team_id", teamId);

  // 2. Fetch team meetings
  const { data: meetings } = await supabase
    .from("meetings")
    .select("id, title, meeting_date")
    .eq("team_id", teamId)
    .order("meeting_date", { ascending: false });

  const meetingIds = meetings?.map((m) => m.id) || [];

  // 3. Fetch action items & owners for this team's meetings
  let actionItemsRes: any = meetingIds.length
    ? await supabase
        .from("action_items")
        .select("id, meeting_id, task_description, deadline, owner_id, created_by, users:owner_id(id, name, email)")
        .in("meeting_id", meetingIds)
    : { data: [] };

  if (actionItemsRes?.error && actionItemsRes.error.code === "42703") {
    actionItemsRes = await supabase
      .from("action_items")
      .select("id, meeting_id, task_description, deadline, owner_id, users:owner_id(id, name, email)")
      .in("meeting_id", meetingIds);
  }

  const actionItems = actionItemsRes.data || [];
  const actionItemMap = new Map(actionItems.map((ai: any) => [ai.id, ai]));
  const actionItemIds = actionItems.map((a: any) => a.id);

  // 4. Fetch tasks
  const { data: tasks } = actionItemIds.length
    ? await supabase
        .from("tasks")
        .select("*")
        .in("action_item_id", actionItemIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  // Associate action items with tasks
  const fullTasks = (tasks || []).map((t) => {
    const ai = actionItemMap.get(t.action_item_id) as any;
    return {
      ...t,
      action_item: ai
        ? {
            id: ai.id,
            task_description: ai.task_description,
            deadline: ai.deadline,
            owner_id: ai.owner_id,
            owner: ai.users || null,
            created_by: ai.created_by ?? "ai",
          }
        : null,
    };
  });

  const columns = [
    { key: "todo", title: "To Do", bg: "bg-gray-50", badge: "bg-gray-200 text-gray-700" },
    { key: "in_progress", title: "In Progress", bg: "bg-blue-50/40", badge: "bg-blue-100 text-blue-700" },
    { key: "done", title: "Done", bg: "bg-emerald-50/40", badge: "bg-emerald-100 text-emerald-700" },
    { key: "overdue", title: "Overdue", bg: "bg-red-50/40", badge: "bg-red-100 text-red-700" },
  ];

  const formattedTeamMembers = (teamMembers || []).map((tm: any) => ({
    user_id: tm.user_id,
    role: tm.role,
    users: tm.users || null,
  }));

  const meetingOptions = (meetings || []).map((m: any) => ({
    id: m.id,
    title: m.title,
    meeting_date: m.meeting_date,
  }));

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#111111]">
            Tasks & Kanban Board
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Kanban workflow of action items extracted from meetings and manual assignments.
          </p>
        </div>

        <AddTaskButton
          teamId={teamId}
          teamMembers={formattedTeamMembers}
          meetings={meetingOptions}
        />
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {columns.map((col) => {
          const colTasks = fullTasks.filter((t) => t.status === col.key);

          return (
            <div
              key={col.key}
              className={`${col.bg} border border-[#E5E5E5] rounded-2xl p-4 flex flex-col min-h-[540px] shadow-2xs`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E5E5E5]">
                <h3 className="font-bold text-sm text-[#111111]">{col.title}</h3>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${col.badge}`}>
                  {colTasks.length}
                </span>
              </div>

              {/* Tasks List */}
              <div className="space-y-3 flex-1">
                {colTasks.length === 0 ? (
                  <div className="h-32 border border-dashed border-gray-300 rounded-xl flex items-center justify-center text-xs text-gray-400">
                    No tasks in {col.title.toLowerCase()}
                  </div>
                ) : (
                  colTasks.map((t) => <TaskCard key={t.id} task={t} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

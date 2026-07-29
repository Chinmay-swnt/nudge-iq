import { createClient } from "@/lib/supabaseServer";

export default async function TeamTasks({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const supabase = await createClient();
  const { teamId } = await params;

  const { data: meetings } = await supabase
    .from("meetings")
    .select("id")
    .eq("team_id", (await params).teamId);

  const meetingIds = meetings?.map((m) => m.id) ?? [];

  const { data: actionItems } = await supabase
    .from("action_items")
    .select("id, task_description, deadline")
    .in(
      "meeting_id",
      meetingIds.length ? meetingIds : ["00000000-0000-0000-0000-000000000000"],
    );

  const actionItemIds = actionItems?.map((a) => a.id) ?? [];

  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .in(
      "action_item_id",
      actionItemIds.length
        ? actionItemIds
        : ["00000000-0000-0000-0000-000000000000"],
    );

  const columns = ["todo", "in_progress", "done", "overdue"];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Tasks</h1>
      <div className="grid grid-cols-4 gap-4">
        {columns.map((col) => (
          <div key={col} className="bg-[#F8F9FA] rounded-xl p-3">
            <h3 className="font-medium mb-3 capitalize">
              {col.replace("_", " ")}
            </h3>
            {tasks
              ?.filter((t) => t.status === col)
              .map((t) => {
                const item = actionItems?.find(
                  (a) => a.id === t.action_item_id,
                );
                return (
                  <div
                    key={t.id}
                    className="bg-white border border-[#E5E5E5] rounded-lg p-3 mb-2"
                  >
                    <p className="text-sm">{item?.task_description}</p>
                    <p className="text-xs text-gray-500">{item?.deadline}</p>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

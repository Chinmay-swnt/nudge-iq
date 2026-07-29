import { createClient } from "@/lib/supabaseServer";

export default async function TeamOverviewPage({
  params,
}: {
  params: { teamId: string };
}) {
  const supabase = await createClient();

  const { data: meetings } = await supabase
    .from("meetings")
    .select("*")
    .eq("team_id", params.teamId);

  const meetingIds = meetings?.map((m) => m.id) ?? [];

  const { data: actionItems } = await supabase
    .from("action_items")
    .select("id")
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

  const totalMeetings = meetings?.length ?? 0;
  const totalTasks = tasks?.length ?? 0;
  const doneTasks = tasks?.filter((t) => t.status === "done").length ?? 0;
  const overdueTasks = tasks?.filter((t) => t.status === "overdue").length ?? 0;

  const recentMeetings = [...(meetings ?? [])]
    .sort(
      (a, b) =>
        new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime(),
    )
    .slice(0, 3);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Team Overview</h1>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Meetings" value={totalMeetings} />
        <StatCard label="Total Tasks" value={totalTasks} />
        <StatCard label="Completed" value={doneTasks} />
        <StatCard label="Overdue" value={overdueTasks} />
      </div>

      <h2 className="text-lg font-semibold mb-3">Recent Meetings</h2>
      <div className="flex flex-col gap-3">
        {recentMeetings.map((meeting) => (
          <div
            key={meeting.id}
            className="bg-white border border-[#E5E5E5] rounded-xl p-4"
          >
            <h3 className="font-medium">{meeting.title}</h3>
            <p className="text-sm text-gray-500">{meeting.meeting_date}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

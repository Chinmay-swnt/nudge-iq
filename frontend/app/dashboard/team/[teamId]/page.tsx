import Link from "next/link";
import { createClient } from "@/lib/supabaseServer";
import AddMeetingButton from "@/components/AddMeetingButton";
import AddTaskButton from "@/components/AddTaskButton";

export default async function TeamOverviewPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();

  // 1. Fetch team info
  const { data: team } = await supabase
    .from("teams")
    .select("id, name")
    .eq("id", teamId)
    .single();

  // 2. Fetch team members (with user profiles)
  const { data: teamMembers } = await supabase
    .from("team_members")
    .select("user_id, role, users(id, name, email)")
    .eq("team_id", teamId);

  // 3. Fetch team meetings
  const { data: meetings } = await supabase
    .from("meetings")
    .select("*, transcripts(id), action_items(id)")
    .eq("team_id", teamId)
    .order("meeting_date", { ascending: false });

  const meetingIds = meetings?.map((m) => m.id) || [];

  // 4. Fetch action items and tasks
  const { data: actionItems } = meetingIds.length
    ? await supabase
        .from("action_items")
        .select("id, meeting_id, task_description, deadline, owner_id")
        .in("meeting_id", meetingIds)
    : { data: [] };

  const actionItemIds = actionItems?.map((a) => a.id) || [];

  const { data: tasks } = actionItemIds.length
    ? await supabase
        .from("tasks")
        .select("id, action_item_id, status, created_at")
        .in("action_item_id", actionItemIds)
    : { data: [] };

  const totalMeetings = meetings?.length || 0;
  const totalTasks = tasks?.length || 0;
  const doneTasks = tasks?.filter((t) => t.status === "done").length || 0;
  const overdueTasks = tasks?.filter((t) => t.status === "overdue").length || 0;

  const recentMeetings = (meetings || []).slice(0, 4);

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
      {/* Workspace Header */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-100">
              Workspace
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#111111]">
            {team?.name || "Team Workspace"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track meeting discussions, automatically extracted action items, and WhatsApp reminders.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <AddMeetingButton teamId={teamId} />
          <AddTaskButton
            teamId={teamId}
            teamMembers={formattedTeamMembers}
            meetings={meetingOptions}
          />
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <MetricCard label="Total Meetings" value={totalMeetings} tone="default" description="Recorded sessions" />
        <MetricCard label="Total Tasks" value={totalTasks} tone="default" description="Extracted action items" />
        <MetricCard label="Completed Tasks" value={doneTasks} tone="success" description="Resolved tasks" />
        <MetricCard label="Overdue" value={overdueTasks} tone="danger" description="Action required" />
      </div>

      {/* Recent Meetings Section */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-[#111111]">Recent Meetings</h2>
            <p className="text-xs text-gray-400 mt-0.5">Click any meeting to inspect summary, full transcript, and action items</p>
          </div>
          <Link
            href={`/dashboard/team/${teamId}/meetings`}
            className="text-xs font-semibold text-[#3B82F6] hover:text-blue-700 hover:underline flex items-center gap-1"
          >
            <span>View all ({totalMeetings})</span>
            <span>&rarr;</span>
          </Link>
        </div>

        {recentMeetings.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-[#3B82F6] flex items-center justify-center font-bold text-xl mx-auto mb-3">
              🎙️
            </div>
            <p className="text-base font-semibold text-[#111111] mb-1">No meetings recorded yet</p>
            <p className="text-sm text-gray-500 max-w-sm mx-auto mb-4">Add your first meeting or ingest audio to extract action items.</p>
            <AddMeetingButton teamId={teamId} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recentMeetings.map((meeting: any) => {
              const count = meeting.action_items?.length || 0;
              return (
                <Link
                  key={meeting.id}
                  href={`/dashboard/team/${teamId}/meetings/${meeting.id}`}
                  className="group bg-[#F8F9FA] border border-[#E5E5E5] hover:border-[#3B82F6] hover:bg-white rounded-xl p-5 transition-all flex flex-col justify-between shadow-2xs hover:shadow-sm"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-base text-[#111111] group-hover:text-[#3B82F6] transition-colors line-clamp-1">
                        {meeting.title}
                      </h3>
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium shrink-0 ${
                          meeting.status === "processed"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-gray-200 text-gray-700"
                        }`}
                      >
                        {meeting.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {new Date(meeting.meeting_date).toLocaleDateString(undefined, {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  <div className="mt-5 pt-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500 group-hover:text-[#3B82F6] font-medium">
                    <span>{count} action items extracted</span>
                    <span className="flex items-center gap-1">
                      View details &rarr;
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Team Roster Snippet */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-[#111111]">Team Members</h2>
            <p className="text-xs text-gray-400 mt-0.5">Colleagues collaborating in this workspace</p>
          </div>
          <Link
            href={`/dashboard/team/${teamId}/invite`}
            className="text-xs font-semibold text-[#3B82F6] hover:text-blue-700 hover:underline flex items-center gap-1"
          >
            <span>Invite teammates</span>
            <span>&rarr;</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {formattedTeamMembers.map((tm) => (
            <div
              key={tm.user_id}
              className="p-4 bg-[#F8F9FA] rounded-xl border border-[#E5E5E5] flex items-center justify-between"
            >
              <div className="truncate pr-2">
                <p className="text-sm font-semibold text-[#111111] truncate">
                  {tm.users?.name || tm.users?.email || "Teammate"}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {tm.users?.email || "No email provided"}
                </p>
              </div>
              <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider bg-white px-2 py-1 rounded-md border border-gray-200">
                {tm.role}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  description,
  tone = "default",
}: {
  label: string;
  value: number;
  description: string;
  tone?: "default" | "success" | "danger";
}) {
  const toneClasses = {
    default: "text-[#111111]",
    success: "text-emerald-600",
    danger: "text-[#EF4444]",
  };

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
        {label}
      </p>
      <p className={`text-4xl font-extrabold ${toneClasses[tone]} mb-1`}>{value}</p>
      <p className="text-xs text-gray-400">{description}</p>
    </div>
  );
}

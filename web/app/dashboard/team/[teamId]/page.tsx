import Link from "next/link";
import { createClient } from "@/lib/supabaseServer";
import AddMeetingButton from "@/components/AddMeetingButton";
import AddTaskButton from "@/components/AddTaskButton";
import SendBotModal from "@/components/SendBotModal";
import UploadAudioModal from "@/components/UploadAudioModal";
import ActiveBotsBanner from "@/components/ActiveBotsBanner";

export default async function TeamOverviewPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();

  const { data: team } = await supabase
    .from("teams")
    .select("id, name")
    .eq("id", teamId)
    .single();

  const { data: teamMembers } = await supabase
    .from("team_members")
    .select("user_id, role, users(id, name, email)")
    .eq("team_id", teamId);

  const { data: meetings } = await supabase
    .from("meetings")
    .select("*, transcripts(id), action_items(id)")
    .eq("team_id", teamId)
    .order("meeting_date", { ascending: false });

  const meetingIds = meetings?.map((m) => m.id) || [];

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
  const pendingTasks = totalTasks - doneTasks;

  const recentMeetings = (meetings || []).slice(0, 5);

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
    <div className="space-y-6 pb-12">
      {/* Active Bot Banner */}
      <ActiveBotsBanner teamId={teamId} />

      {/* Workspace Header */}
      <div className="bg-[#0F172A] rounded-xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">Workspace</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {team?.name || "Team Workspace"}
          </h1>
          <p className="text-sm text-slate-400 mt-1.5">
            Record calls, upload audio, and track AI-extracted action items.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <SendBotModal teamId={teamId} />
          <UploadAudioModal teamId={teamId} />
          <AddTaskButton
            teamId={teamId}
            teamMembers={formattedTeamMembers}
            meetings={meetingOptions}
          />
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Meetings" value={totalMeetings} sub="recorded" />
        <StatCard label="Tasks" value={totalTasks} sub="extracted" />
        <StatCard label="Completed" value={doneTasks} sub="resolved" accent="green" />
        <StatCard label="Overdue" value={overdueTasks} sub="action required" accent="red" />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent Meetings — spans 2 cols */}
        <div className="lg:col-span-2 bg-white border border-gray-100 rounded-xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-semibold text-[#0F172A]">Recent Meetings</h2>
              <p className="text-xs text-[#64748B] mt-0.5">Latest recorded sessions</p>
            </div>
            <Link
              href={`/dashboard/team/${teamId}/meetings`}
              className="text-xs font-medium text-[#3B82F6] hover:text-blue-700 transition-colors"
            >
              View all →
            </Link>
          </div>

          {recentMeetings.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[#0F172A] mb-1">No meetings yet</p>
              <p className="text-xs text-[#64748B] mb-4">Send a bot to a call or upload audio to get started.</p>
              <div className="flex justify-center gap-2">
                <SendBotModal teamId={teamId} />
                <UploadAudioModal teamId={teamId} />
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentMeetings.map((meeting: any) => {
                const count = meeting.action_items?.length || 0;
                const isProcessed = meeting.status === "processed";
                return (
                  <Link
                    key={meeting.id}
                    href={`/dashboard/team/${teamId}/meetings/${meeting.id}`}
                    className="flex items-center justify-between gap-4 px-6 py-3.5 hover:bg-[#F8FAFC] transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isProcessed ? "bg-emerald-500" : "bg-amber-400"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#0F172A] group-hover:text-[#3B82F6] truncate transition-colors">
                          {meeting.title}
                        </p>
                        <p className="text-xs text-[#64748B]">
                          {new Date(meeting.meeting_date).toLocaleDateString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-[#64748B] tabular-nums">
                        {count} {count === 1 ? "task" : "tasks"}
                      </span>
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                          isProcessed
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {isProcessed ? "Processed" : "Pending"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column — Team Members + Quick Stats */}
        <div className="space-y-5">
          {/* Task Progress */}
          {totalTasks > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-[#0F172A] mb-4">Task Progress</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-xs text-[#64748B] mb-1">
                  <span>Completion</span>
                  <span className="font-semibold text-[#0F172A]">
                    {doneTasks}/{totalTasks}
                  </span>
                </div>
                <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all"
                    style={{ width: `${totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="text-center">
                    <p className="text-lg font-bold text-emerald-600">{doneTasks}</p>
                    <p className="text-[10px] text-[#64748B] uppercase tracking-wide">Done</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-[#3B82F6]">{pendingTasks}</p>
                    <p className="text-[10px] text-[#64748B] uppercase tracking-wide">Active</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-red-500">{overdueTasks}</p>
                    <p className="text-[10px] text-[#64748B] uppercase tracking-wide">Overdue</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Team Members */}
          <div className="bg-white border border-gray-100 rounded-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-[#0F172A]">Team</h3>
              <Link
                href={`/dashboard/team/${teamId}/invite`}
                className="text-xs font-medium text-[#3B82F6] hover:text-blue-700 transition-colors"
              >
                + Invite
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {formattedTeamMembers.length === 0 ? (
                <p className="px-5 py-4 text-xs text-[#64748B]">No team members found.</p>
              ) : (
                formattedTeamMembers.slice(0, 6).map((tm) => {
                  const name = tm.users?.name || tm.users?.email || "Teammate";
                  const initials = name.slice(0, 2).toUpperCase();
                  return (
                    <div
                      key={tm.user_id}
                      className="flex items-center justify-between gap-3 px-5 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-[#0F172A] truncate">{name}</p>
                          {tm.users?.email && (
                            <p className="text-[10px] text-[#64748B] truncate">{tm.users.email}</p>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B] bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded shrink-0">
                        {tm.role}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub: string;
  accent?: "green" | "red";
}) {
  const valueColor =
    accent === "green"
      ? "text-emerald-600"
      : accent === "red"
      ? "text-red-500"
      : "text-[#0F172A]";

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5">
      <p className="text-xs font-medium text-[#64748B] mb-2">{label}</p>
      <p className={`text-3xl font-bold ${valueColor} leading-none mb-1`}>{value}</p>
      <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide">{sub}</p>
    </div>
  );
}

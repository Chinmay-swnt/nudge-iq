import Link from "next/link";
import { createClient } from "@/lib/supabaseServer";
import CreateTeamButton from "@/components/CreateTeamButton";

export default async function DashboardOverviewPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch teams the user belongs to
  const { data: teamMemberships } = await supabase
    .from("team_members")
    .select("team_id, role, teams(id, name, created_at)")
    .eq("user_id", user.id);

  const teams = teamMemberships?.map((tm: any) => ({
    id: tm.team_id,
    name: tm.teams?.name || "Untitled Team",
    role: tm.role,
    createdAt: tm.teams?.created_at,
  })) || [];

  const teamIds = teams.map((t) => t.id);

  // Fetch meetings across all user teams
  const { data: meetings } = teamIds.length
    ? await supabase.from("meetings").select("id, team_id").in("team_id", teamIds)
    : { data: [] };

  const meetingIds = meetings?.map((m) => m.id) || [];

  // Fetch action items across those meetings
  const { data: actionItems } = meetingIds.length
    ? await supabase.from("action_items").select("id").in("meeting_id", meetingIds)
    : { data: [] };

  const actionItemIds = actionItems?.map((a) => a.id) || [];

  // Fetch tasks across those action items
  const { data: tasks } = actionItemIds.length
    ? await supabase.from("tasks").select("id, status").in("action_item_id", actionItemIds)
    : { data: [] };

  const totalTeams = teams.length;
  const totalMeetings = meetings?.length || 0;
  const totalTasks = tasks?.length || 0;
  const completedTasks = tasks?.filter((t) => t.status === "done").length || 0;

  return (
    <div className="space-y-8">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
            Global Overview
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Summary of all workspaces, meetings, and team action items.
          </p>
        </div>

        <CreateTeamButton label="+ Create Team" />
      </div>

      {/* Aggregate Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Teams" value={totalTeams} subtitle="Active workspaces" />
        <StatCard label="Total Meetings" value={totalMeetings} subtitle="Across all teams" />
        <StatCard label="Total Tasks" value={totalTasks} subtitle="Action items tracked" />
        <StatCard label="Completed Tasks" value={completedTasks} subtitle="Resolved action items" />
      </div>

      {/* Teams Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#111111]">Your Teams</h2>
          <span className="text-xs text-gray-500 font-medium">{totalTeams} total</span>
        </div>

        {totalTeams === 0 ? (
          <div className="bg-white border border-[#E5E5E5] rounded-xl p-10 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-[#3B82F6] flex items-center justify-center font-bold text-xl mb-3">
              +
            </div>
            <h3 className="text-base font-semibold text-[#111111] mb-1">
              No teams yet
            </h3>
            <p className="text-sm text-gray-500 max-w-sm mb-5">
              Create your first team workspace to start recording meetings and generating action items.
            </p>
            <CreateTeamButton label="Create your first team" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team) => (
              <Link
                key={team.id}
                href={`/dashboard/team/${team.id}`}
                className="group bg-white border border-[#E5E5E5] hover:border-[#3B82F6] rounded-xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-base text-[#111111] group-hover:text-[#3B82F6] transition-colors">
                      {team.name}
                    </h3>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                        team.role === "owner"
                          ? "bg-purple-50 text-purple-700 border border-purple-200"
                          : "bg-gray-100 text-gray-600 border border-gray-200"
                      }`}
                    >
                      {team.role === "owner" ? "Owner" : "Member"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Workspace ID: {team.id.slice(0, 8)}...
                  </p>
                </div>

                <div className="mt-6 pt-3 border-t border-[#F0F0F0] flex items-center justify-between text-xs text-gray-500 group-hover:text-[#3B82F6] font-medium">
                  <span>Enter workspace</span>
                  <span>&rarr;</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: number;
  subtitle: string;
}) {
  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl p-5 shadow-xs">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
        {label}
      </p>
      <p className="text-3xl font-bold text-[#111111] mb-1">{value}</p>
      <p className="text-xs text-gray-400">{subtitle}</p>
    </div>
  );
}

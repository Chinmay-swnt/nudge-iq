import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseServer";

export default async function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/get-started");
  }

  // 1. Validate membership for this team
  const { data: membership, error } = await supabase
    .from("team_members")
    .select("role, teams(id, name)")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .single();

  if (error || !membership) {
    redirect("/dashboard");
  }

  // 2. Fetch all user teams for switcher dropdown
  const { data: allMemberships } = await supabase
    .from("team_members")
    .select("team_id, teams(id, name)")
    .eq("user_id", user.id);

  const currentTeamName = (membership.teams as any)?.name || "Team Workspace";
  const isOwner = membership.role === "owner";
  const base = `/dashboard/team/${teamId}`;

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col md:flex-row gap-8 items-start py-2">
      {/* Team Sidebar */}
      <aside className="w-full md:w-64 bg-[#0A0A0A] text-white rounded-2xl p-5 flex flex-col justify-between shrink-0 shadow-sm border border-[#222222]">
        <div className="space-y-6">
          {/* TOP: Back to All Workspaces Button */}
          <div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-xs font-medium text-gray-400 hover:text-white px-3 py-2 rounded-lg hover:bg-[#1A1A1A] transition-colors w-full border border-[#262626] hover:border-gray-600"
            >
              <span>&larr;</span> Back to All Workspaces
            </Link>
          </div>

          {/* Active Workspace Header */}
          <div className="pb-4 border-b border-[#262626]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Active Workspace
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                  isOwner
                    ? "bg-purple-950 text-purple-300 border border-purple-800"
                    : "bg-gray-800 text-gray-300"
                }`}
              >
                {isOwner ? "Owner" : "Member"}
              </span>
            </div>
            <h2 className="text-lg font-bold text-white truncate" title={currentTeamName}>
              {currentTeamName}
            </h2>

            {/* Switch workspace dropdown */}
            {allMemberships && allMemberships.length > 1 && (
              <div className="mt-3 pt-3 border-t border-[#1F1F1F]">
                <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1 tracking-wider">
                  Switch workspace:
                </label>
                <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
                  {allMemberships
                    .filter((m: any) => m.team_id !== teamId)
                    .map((m: any) => (
                      <Link
                        key={m.team_id}
                        href={`/dashboard/team/${m.team_id}`}
                        className="text-xs text-gray-300 hover:text-white py-1.5 px-2.5 rounded-md hover:bg-[#1A1A1A] transition-colors truncate flex items-center justify-between"
                      >
                        <span className="truncate">{m.teams?.name}</span>
                        <span className="text-gray-500 text-[10px]">&rarr;</span>
                      </Link>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1.5">
            <SidebarNavLink href={base} label="Overview" icon="📊" />
            <SidebarNavLink href={`${base}/meetings`} label="Meetings" icon="🎙️" />
            <SidebarNavLink href={`${base}/tasks`} label="Tasks & Kanban" icon="📋" />
            {isOwner && (
              <SidebarNavLink href={`${base}/invite`} label="Invite Teammates" icon="✉️" />
            )}
          </nav>
        </div>

        {/* Sidebar Footer info */}
        <div className="pt-6 mt-6 border-t border-[#262626]">
          <p className="text-[11px] text-gray-500 text-center">
            NudgeIQ Team Space &bull; v1.0
          </p>
        </div>
      </aside>

      {/* Main View Area */}
      <section className="flex-1 min-w-0 w-full">
        {children}
      </section>
    </div>
  );
}

function SidebarNavLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-[#1A1A1A] hover:text-white transition-colors"
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

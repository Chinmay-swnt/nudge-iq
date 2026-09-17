import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import InviteForm from "@/components/InviteForm";

export default async function TeamInvitePage({
  params,
}: {
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

  // 1. Verify owner role
  const { data: memberRole } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .single();

  if (memberRole?.role !== "owner") {
    redirect(`/dashboard/team/${teamId}`);
  }

  // 2. Fetch team members
  const { data: teamMembers } = await supabase
    .from("team_members")
    .select("id, role, joined_at, users(id, name, email)")
    .eq("team_id", teamId);

  // 3. Fetch pending invites
  const { data: invites } = await supabase
    .from("invites")
    .select("*")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  const pendingInvites = invites?.filter((i) => i.status === "pending") || [];

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs">
        <h1 className="text-3xl font-extrabold tracking-tight text-[#111111]">
          Invite Teammates
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Add colleagues to this workspace so they can view meetings, take ownership of action items, and collaborate.
        </p>
      </div>

      {/* Invite Form Card */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs">
        <h2 className="text-xl font-bold text-[#111111] mb-2">
          Invite by Google Email
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Enter your teammate's email address. When they sign in with Google using this email, they will automatically join this workspace.
        </p>
        <InviteForm teamId={teamId} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pending Invites */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
            <h2 className="text-lg font-bold text-[#111111]">
              Pending Invites ({pendingInvites.length})
            </h2>
          </div>

          {pendingInvites.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center">No pending invitations.</p>
          ) : (
            <div className="space-y-2">
              {pendingInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between p-3.5 bg-[#F8F9FA] rounded-xl border border-[#E5E5E5] text-sm"
                >
                  <div>
                    <p className="font-semibold text-[#111111]">{inv.email}</p>
                    <p className="text-xs text-gray-400">
                      Sent {new Date(inv.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full font-medium">
                    Pending
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Current Team Members */}
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
            <h2 className="text-lg font-bold text-[#111111]">
              Current Members ({teamMembers?.length || 0})
            </h2>
          </div>

          <div className="space-y-2">
            {teamMembers?.map((tm: any) => (
              <div
                key={tm.id}
                className="flex items-center justify-between p-3.5 bg-[#F8F9FA] rounded-xl border border-[#E5E5E5] text-sm"
              >
                <div>
                  <p className="font-semibold text-[#111111]">
                    {tm.users?.name || tm.users?.email || "Unknown User"}
                  </p>
                  <p className="text-xs text-gray-500">{tm.users?.email}</p>
                </div>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                    tm.role === "owner"
                      ? "bg-purple-50 text-purple-700 border border-purple-200"
                      : "bg-gray-100 text-gray-700 border border-gray-200"
                  }`}
                >
                  {tm.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

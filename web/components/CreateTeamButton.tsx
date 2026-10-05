"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

interface CreateTeamButtonProps {
  label?: string;
  className?: string;
}

export default function CreateTeamButton({
  label = "+ Create Team",
  className = "bg-[#3B82F6] hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
}: CreateTeamButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/get-started");
        return;
      }

      // 1. Create team
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .insert({ name: name.trim() })
        .select()
        .single();

      if (teamError || !team) {
        throw new Error(teamError?.message || "Failed to create team");
      }

      // 2. Add creator as owner
      const { error: memberError } = await supabase.from("team_members").insert({
        team_id: team.id,
        user_id: user.id,
        role: "owner",
      });

      if (memberError) {
        throw new Error(memberError.message);
      }

      setOpen(false);
      setName("");
      router.push(`/dashboard/team/${team.id}`);
      router.refresh();
    } catch (err: any) {
      console.error("Error creating team:", err);
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className}
        type="button"
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-[#E5E5E5] shadow-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-2 text-[#111111]">
              Create New Team
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              Set up a workspace for your meetings, transcripts, and action items.
            </p>

            <form onSubmit={handleCreate}>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg mb-4">
                  {error}
                </div>
              )}

              <div className="mb-5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-2">
                  Team Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Engineering, Sales, Product"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#F8F9FA] border border-[#E5E5E5] rounded-lg px-3.5 py-2.5 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:bg-white transition-all"
                  autoFocus
                  required
                />
              </div>

              <div className="flex justify-end items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setError(null);
                  }}
                  disabled={loading}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className="bg-[#3B82F6] hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg px-5 py-2 text-sm font-medium transition-colors cursor-pointer"
                >
                  {loading ? "Creating..." : "Create Team"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

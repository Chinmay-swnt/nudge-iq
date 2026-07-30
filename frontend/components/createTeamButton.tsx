"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function CreateTeamButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleCreate = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !name.trim()) return;

    const { data: team, error } = await supabase
      .from("teams")
      .insert({ name })
      .select()
      .single();

    if (error || !team) return;

    await supabase.from("team_members").insert({
      team_id: team.id,
      user_id: user.id,
      role: "owner",
    });

    setOpen(false);
    setName("");
    router.push(`/dashboard/team/${team.id}`);
    router.refresh();
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-white">
        +
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-80">
            <h2 className="text-lg font-semibold mb-4 text-[#111111]">
              Create Team
            </h2>
            <input
              type="text"
              placeholder="Team name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-[#E5E5E5] rounded-lg px-3 py-2 text-sm mb-4 text-[#111111] focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="bg-blue-500 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-600"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

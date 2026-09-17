"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

interface AddMeetingButtonProps {
  teamId: string;
}

export default function AddMeetingButton({ teamId }: AddMeetingButtonProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !meetingDate || loading) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: insertError } = await supabase
        .from("meetings")
        .insert({
          team_id: teamId,
          title: title.trim(),
          meeting_date: new Date(meetingDate).toISOString(),
          status: "pending",
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      setOpen(false);
      setTitle("");
      router.refresh();
    } catch (err: any) {
      console.error("Error adding meeting:", err);
      setError(err.message || "Failed to add meeting");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-[#3B82F6] hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
        type="button"
      >
        <span>+</span> Add Meeting
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-[#E5E5E5] shadow-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-1 text-[#111111]">
              Add New Meeting
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              Record meeting details manually or prepare for audio processing.
            </p>

            <form onSubmit={handleCreate}>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg mb-4">
                  {error}
                </div>
              )}

              <div className="mb-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Meeting Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Q4 Sprint Planning, Architecture Sync"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[#F8F9FA] border border-[#E5E5E5] rounded-lg px-3.5 py-2.5 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:bg-white transition-all"
                  autoFocus
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  className="w-full bg-[#F8F9FA] border border-[#E5E5E5] rounded-lg px-3.5 py-2.5 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:bg-white transition-all"
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
                  disabled={loading || !title.trim()}
                  className="bg-[#3B82F6] hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg px-5 py-2 text-sm font-medium transition-colors cursor-pointer"
                >
                  {loading ? "Adding..." : "Add Meeting"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

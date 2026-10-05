"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SendBotModalProps {
  teamId: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export default function SendBotModal({ teamId }: SendBotModalProps) {
  const [open, setOpen] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingUrl.trim() || loading) return;

    setLoading(true);
    setError(null);
    setStatusMessage(null);

    try {
      const res = await fetch(`${BACKEND_URL}/meetings/bot/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          meeting_url: meetingUrl.trim(),
          team_id: teamId,
          title: title.trim() || undefined,
          bot_name: "NudgeIQ Assistant",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to dispatch bot");
      }

      setStatusMessage("Bot dispatched! It is joining the meeting to record and extract action items.");
      setTimeout(() => {
        setOpen(false);
        setMeetingUrl("");
        setTitle("");
        setStatusMessage(null);
        router.refresh();
      }, 2000);
    } catch (err: any) {
      console.error("Bot dispatch error:", err);
      setError(err.message || "Failed to dispatch bot. Make sure the backend is running on port 4000.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-[#0A0A0A] hover:bg-neutral-800 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
        type="button"
      >
        <span>🤖</span> Send Bot to Call
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-xl p-6 sm:p-7 w-full max-w-md">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-2xl">🤖</span>
              <h2 className="text-xl font-bold text-[#111111]">
                Record Virtual Meeting
              </h2>
            </div>
            <p className="text-xs text-gray-500 mb-5">
              Send the free NudgeIQ Bot to join your Google Meet, Zoom, or Teams call to record audio and extract action items.
            </p>

            <form onSubmit={handleDispatch}>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl mb-4">
                  {error}
                </div>
              )}

              {statusMessage && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3.5 rounded-xl mb-4">
                  {statusMessage}
                </div>
              )}

              <div className="mb-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Meeting Link (Google Meet / Zoom / Teams)
                </label>
                <input
                  type="url"
                  placeholder="https://meet.google.com/abc-defg-hij"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  className="w-full bg-[#F8F9FA] border border-[#E5E5E5] rounded-xl px-3.5 py-2.5 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:bg-white transition-all"
                  autoFocus
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Meeting Title (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Weekly Strategy Sync"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[#F8F9FA] border border-[#E5E5E5] rounded-xl px-3.5 py-2.5 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:bg-white transition-all"
                />
              </div>

              <div className="flex justify-end items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setError(null);
                    setStatusMessage(null);
                  }}
                  disabled={loading}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !meetingUrl.trim()}
                  className="bg-[#0A0A0A] hover:bg-neutral-800 disabled:opacity-50 text-white rounded-xl px-5 py-2 text-sm font-semibold transition-colors cursor-pointer"
                >
                  {loading ? "Dispatching..." : "Send Bot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

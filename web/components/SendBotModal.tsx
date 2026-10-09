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

  const close = () => {
    if (loading) return;
    setOpen(false);
    setError(null);
    setStatusMessage(null);
  };

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingUrl.trim() || loading) return;

    setLoading(true);
    setError(null);
    setStatusMessage(null);

    try {
      const res = await fetch(`${BACKEND_URL}/meetings/bot/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meeting_url: meetingUrl.trim(),
          team_id: teamId,
          title: title.trim() || undefined,
          bot_name: "NudgeIQ Assistant",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to dispatch bot");

      setStatusMessage("Bot dispatched — it will join the call shortly.");
      setTimeout(() => {
        close();
        setMeetingUrl("");
        setTitle("");
        router.refresh();
      }, 1800);
    } catch (err: any) {
      setError(err.message || "Failed to dispatch bot. Make sure the backend is running on port 4000.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        type="button"
        className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
        </svg>
        Send Bot
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-md p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-[#0F172A]">Send Bot to Meeting</h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Joins Google Meet or Zoom to record audio and extract action items automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="text-gray-400 hover:text-gray-700 p-1 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleDispatch} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg">
                  {error}
                </div>
              )}
              {statusMessage && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-lg">
                  {statusMessage}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                  Meeting link <span className="text-[#64748B] font-normal">(Google Meet or Zoom)</span>
                </label>
                <input
                  type="url"
                  placeholder="https://meet.google.com/abc-defg-hij"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                  Meeting title <span className="text-[#64748B] font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sprint Planning Q4"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all"
                />
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-2.5">
                <svg className="w-3.5 h-3.5 text-[#3B82F6] shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <p className="text-xs text-blue-900 leading-relaxed">
                  When the bot requests to join, click <strong>Admit</strong> in your meeting app. Enable <strong>closed captions</strong> for best transcript quality.
                </p>
              </div>

              <div className="flex justify-end items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={close}
                  disabled={loading}
                  className="px-3.5 py-2 text-sm text-[#64748B] hover:text-[#0F172A] font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !meetingUrl.trim()}
                  className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer"
                >
                  {loading ? "Dispatching…" : "Send Bot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

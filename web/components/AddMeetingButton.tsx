"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

interface AddMeetingButtonProps {
  teamId: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export default function AddMeetingButton({ teamId }: AddMeetingButtonProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !meetingDate || loading) return;

    setLoading(true);
    setError(null);
    setStatusMsg("Creating meeting record...");

    try {
      // 1. Get user session for Auth header
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const authToken = session?.access_token || "";

      // 2. Call POST /api/meetings
      const createRes = await fetch(`${BACKEND_URL}/api/meetings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          team_id: teamId,
          title: title.trim(),
          meeting_date: new Date(meetingDate).toISOString(),
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok || !createData.meeting_id) {
        throw new Error(createData.error || "Failed to create meeting");
      }

      const meetingId = createData.meeting_id;

      // 3. Upload audio if file was selected
      if (audioFile) {
        setStatusMsg("Uploading audio file to storage...");
        const formData = new FormData();
        formData.append("file", audioFile);

        const uploadRes = await fetch(`${BACKEND_URL}/api/meetings/${meetingId}/audio`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
          body: formData,
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(uploadData.error || "Failed to upload audio file");
        }
      }

      setOpen(false);
      setTitle("");
      setAudioFile(null);
      setStatusMsg(null);
      router.push(`/dashboard/team/${teamId}/meetings/${meetingId}`);
    } catch (err: any) {
      console.error("Error adding meeting:", err);
      setError(err.message || "Failed to add meeting");
      setStatusMsg(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
        type="button"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add Meeting
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !loading) {
              setOpen(false);
              setError(null);
            }
          }}
        >
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 w-full max-w-md">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-[#0F172A]">Add Meeting</h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Create a session and optionally upload recording audio.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={loading}
                className="text-gray-400 hover:text-gray-700 p-1 cursor-pointer transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg">
                  {error}
                </div>
              )}

              {statusMsg && (
                <div className="bg-blue-50 border border-blue-100 text-blue-800 text-xs p-3 rounded-lg flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>{statusMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                  Meeting Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Q4 Sprint Planning, Architecture Sync"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                  Date &amp; Time
                </label>
                <input
                  type="datetime-local"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                  Audio Recording <span className="text-[#64748B] font-normal">(optional: mp3, wav, m4a, webm, ogg)</span>
                </label>
                <input
                  type="file"
                  accept="audio/*,video/*,.mp3,.wav,.m4a,.webm,.ogg,.mp4"
                  onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                  className="w-full bg-[#F8FAFC] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0F172A] file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3B82F6] transition-all"
                />
              </div>

              <div className="flex justify-end items-center gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setError(null);
                  }}
                  disabled={loading}
                  className="px-3.5 py-2 text-sm text-[#64748B] hover:text-[#0F172A] font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !title.trim()}
                  className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer"
                >
                  {loading ? "Saving…" : audioFile ? "Create & Upload" : "Add Meeting"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

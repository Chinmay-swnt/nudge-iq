"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface UploadAudioModalProps {
  teamId: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

const STATUS_LABELS: Record<string, string> = {
  uploading: "Uploading audio file…",
  queued: "Audio uploaded — queued for processing…",
  processing: "Processing — this may take a minute…",
  transcribing: "Transcribing audio with Whisper (local, free)…",
  extracting: "Extracting action items with local LLM…",
  processed: "Done! Redirecting to meeting…",
  failed: "Processing failed.",
};

export default function UploadAudioModal({ teamId }: UploadAudioModalProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const pollStatus = (meetingId: string) => {
    let attempts = 0;
    const MAX_ATTEMPTS = 180; // 3 min max (1s interval)

    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(pollRef.current!);
        setError("Processing timed out. Check the meeting page later.");
        setLoading(false);
        setProgressStatus(null);
        return;
      }

      try {
        const res = await fetch(`${BACKEND_URL}/api/meetings/${meetingId}/status`);
        if (!res.ok) return; // transient error, keep polling

        const data = await res.json();
        const ps: string = data.processing_status || data.status || "";

        setProgressStatus(STATUS_LABELS[ps] || `Processing… (${ps})`);

        if (ps === "processed") {
          clearInterval(pollRef.current!);
          setProgressStatus("Done! Redirecting…");
          setTimeout(() => {
            setOpen(false);
            setFile(null);
            setTitle("");
            setProgressStatus(null);
            setLoading(false);
            router.push(`/dashboard/team/${teamId}/meetings/${meetingId}`);
          }, 800);
        } else if (ps === "failed") {
          clearInterval(pollRef.current!);
          setError(data.error_message || "Processing failed. Please try again.");
          setLoading(false);
          setProgressStatus(null);
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 1000);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || loading) return;

    setLoading(true);
    setError(null);
    setProgressStatus("Uploading audio file…");

    try {
      const formData = new FormData();
      formData.append("audio_file", file);
      formData.append("team_id", teamId);
      if (title.trim()) formData.append("title", title.trim());

      const res = await fetch(`${BACKEND_URL}/meetings/process-audio`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      // Backend responds with 202 immediately — start polling
      setProgressStatus(STATUS_LABELS["queued"]);
      pollStatus(data.meeting_id);
    } catch (err: any) {
      console.error("Upload error:", err);
      setError(err.message || "Failed to upload audio. Make sure the backend is running.");
      setProgressStatus(null);
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    if (pollRef.current) clearInterval(pollRef.current);
    setOpen(false);
    setError(null);
    setProgressStatus(null);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-white border border-gray-200 hover:border-gray-300 text-[#0F172A] px-3.5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer hover:bg-[#F8FAFC]"
        type="button"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M16 12l-4-4m0 0L8 12m4-4v12" />
        </svg>
        Upload Audio
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-6 w-full max-w-md">
            {/* Header */}
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-4 h-4 text-[#3B82F6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M16 12l-4-4m0 0L8 12m4-4v12" />
              </svg>
              <h2 className="text-base font-semibold text-[#0F172A]">Upload Meeting Audio</h2>
            </div>
            <p className="text-xs text-[#64748B] mb-5 pl-6">
              Upload a recorded audio file (.wav, .mp3, .m4a, .webm) — multilingual, free local transcription.
            </p>

            <form onSubmit={handleUpload} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg">
                  {error}
                </div>
              )}

              {progressStatus && (
                <div className="bg-blue-50 border border-blue-100 text-blue-800 text-xs p-3 rounded-lg flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>{progressStatus}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                  Audio file <span className="text-[#64748B] font-normal">(.mp3, .wav, .m4a, .webm)</span>
                </label>
                <input
                  type="file"
                  accept="audio/*,video/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  disabled={loading}
                  className="w-full bg-[#F8FAFC] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white cursor-pointer transition-all disabled:opacity-50"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                  Meeting title <span className="text-[#64748B] font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Design Architecture Review"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={loading}
                  className="w-full bg-[#F8FAFC] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all disabled:opacity-50"
                />
              </div>

              {/* Info note */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-2.5">
                <svg className="w-3.5 h-3.5 text-[#3B82F6] shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <p className="text-xs text-blue-900 leading-relaxed">
                  Transcription runs locally via Whisper — multilingual, no data leaves your server. Processing continues in background after upload.
                </p>
              </div>

              <div className="flex justify-end items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="px-3.5 py-2 text-sm text-[#64748B] hover:text-[#0F172A] font-medium transition-colors cursor-pointer disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !file}
                  className="bg-[#3B82F6] hover:bg-blue-600 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer"
                >
                  {loading ? "Processing…" : "Upload & Process"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface UploadAudioModalProps {
  teamId: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export default function UploadAudioModal({ teamId }: UploadAudioModalProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || loading) return;

    setLoading(true);
    setError(null);
    setProgressStatus("Transcribing audio locally with Whisper (100% Free)...");

    try {
      const formData = new FormData();
      formData.append("audio_file", file);
      formData.append("team_id", teamId);
      if (title.trim()) {
        formData.append("title", title.trim());
      }

      setProgressStatus("Extracting action items, deadlines, and assigned owners...");

      const res = await fetch(`${BACKEND_URL}/meetings/process-audio`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Audio processing failed");
      }

      setProgressStatus("Processing complete! Redirecting to meeting view...");
      setTimeout(() => {
        setOpen(false);
        setFile(null);
        setTitle("");
        setProgressStatus(null);
        if (data.meeting_id) {
          router.push(`/dashboard/team/${teamId}/meetings/${data.meeting_id}`);
        } else {
          router.refresh();
        }
      }, 1000);
    } catch (err: any) {
      console.error("Upload processing error:", err);
      setError(err.message || "Failed to process audio. Make sure the backend service is running.");
      setProgressStatus(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-white border border-[#E5E5E5] hover:border-gray-400 text-[#111111] px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer shadow-2xs hover:bg-[#F8F9FA]"
        type="button"
      >
        <span>📁</span> Upload Audio
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-xl p-6 sm:p-7 w-full max-w-md">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-2xl">🎙️</span>
              <h2 className="text-xl font-bold text-[#111111]">
                Upload Meeting Audio
              </h2>
            </div>
            <p className="text-xs text-gray-500 mb-5">
              Upload any recorded audio (.wav, .mp3, .m4a, .webm) for free local transcription and automatic task extraction.
            </p>

            <form onSubmit={handleUpload}>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl mb-4">
                  {error}
                </div>
              )}

              {progressStatus && (
                <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs p-3.5 rounded-xl mb-4 flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>{progressStatus}</span>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Audio File (.mp3, .wav, .m4a, .webm)
                </label>
                <input
                  type="file"
                  accept="audio/*,video/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full bg-[#F8F9FA] border border-[#E5E5E5] rounded-xl px-3.5 py-2.5 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#111111] file:text-white cursor-pointer"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Meeting Title (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Design Architecture Review"
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
                    setProgressStatus(null);
                  }}
                  disabled={loading}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !file}
                  className="bg-[#3B82F6] hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl px-5 py-2 text-sm font-semibold transition-colors cursor-pointer"
                >
                  {loading ? "Processing..." : "Process Audio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

interface ProcessNowButtonProps {
  meetingId: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export default function ProcessNowButton({ meetingId }: ProcessNowButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleProcessNow = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token || "";

      const res = await fetch(`${BACKEND_URL}/api/meetings/${meetingId}/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to process audio recording");
      }

      router.refresh();
    } catch (err: any) {
      console.error("Process now error:", err);
      setError(err.message || "Failed to process audio");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={handleProcessNow}
        disabled={loading}
        className="bg-[#3B82F6] hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
        type="button"
      >
        {loading ? (
          <>
            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Transcribing &amp; Extracting…</span>
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
            </svg>
            <span>Process Now</span>
          </>
        )}
      </button>
      {error && <p className="text-[11px] text-red-600 max-w-xs text-right">{error}</p>}
    </div>
  );
}

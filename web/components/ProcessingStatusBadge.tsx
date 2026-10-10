"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ProcessingStatusBadgeProps {
  meetingId: string;
  initialStatus: string;
  initialProcessingStatus?: string | null;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export default function ProcessingStatusBadge({
  meetingId,
  initialStatus,
  initialProcessingStatus,
}: ProcessingStatusBadgeProps) {
  const [status, setStatus] = useState(initialStatus);
  const [processingStatus, setProcessingStatus] = useState(
    initialProcessingStatus || initialStatus
  );
  const router = useRouter();

  const isWorking =
    processingStatus === "transcribing" ||
    processingStatus === "extracting" ||
    processingStatus === "created" ||
    processingStatus === "uploaded" ||
    (status !== "processed" && status !== "failed");

  useEffect(() => {
    if (!isWorking) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/meetings/${meetingId}/status`);
        if (!res.ok) return;

        const data = await res.json();
        const newProcStatus = data.processing_status || data.status;
        const newStatus = data.status;

        setProcessingStatus(newProcStatus);
        setStatus(newStatus);

        if (newStatus === "processed" || newProcStatus === "processed") {
          clearInterval(interval);
          router.refresh();
        }
      } catch (err) {
        console.warn("[ProcessingStatusBadge] Polling error:", err);
      }
    }, 5000); // Poll every 5s per Phase 6 requirements

    return () => clearInterval(interval);
  }, [meetingId, isWorking, router]);

  // Color & label logic
  if (processingStatus === "transcribing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
        🎙️ Faster-Whisper Transcribing…
      </span>
    );
  }

  if (processingStatus === "extracting") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200 animate-pulse">
        <span className="w-2 h-2 rounded-full bg-purple-500"></span>
        🤖 LLM Extracting Tasks…
      </span>
    );
  }

  if (processingStatus === "uploaded") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
        Audio Uploaded (Ready)
      </span>
    );
  }

  if (status === "processed" || processingStatus === "processed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
        AI Processed
      </span>
    );
  }

  if (status === "failed" || processingStatus === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200">
        <span className="w-2 h-2 rounded-full bg-red-500"></span>
        Processing Failed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider bg-gray-50 text-gray-700 border border-gray-200">
      <span className="w-2 h-2 rounded-full bg-gray-400"></span>
      Pending Audio
    </span>
  );
}

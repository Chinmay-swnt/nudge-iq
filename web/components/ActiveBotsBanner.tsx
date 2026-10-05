"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

interface ActiveBot {
  meetingId: string;
  teamId: string;
  status: string;
  startedAt: number;
}

export default function ActiveBotsBanner({ teamId }: { teamId?: string }) {
  const [activeBots, setActiveBots] = useState<ActiveBot[]>([]);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const router = useRouter();

  const fetchBots = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/meetings/bot/active`);
      if (res.ok) {
        const data = await res.json();
        const bots = data.bots || [];
        if (teamId) {
          setActiveBots(bots.filter((b: ActiveBot) => b.teamId === teamId));
        } else {
          setActiveBots(bots);
        }
      }
    } catch (e) {
      // Backend might be offline
    }
  };

  useEffect(() => {
    fetchBots();
    const interval = setInterval(fetchBots, 4000);
    return () => clearInterval(interval);
  }, [teamId]);

  const handleStop = async (meetingId: string) => {
    setStoppingId(meetingId);
    try {
      const res = await fetch(`${BACKEND_URL}/meetings/bot/stop/${meetingId}`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchBots();
        router.refresh();
      }
    } catch (e) {
      console.error("Failed to stop bot:", e);
    } finally {
      setStoppingId(null);
    }
  };

  if (activeBots.length === 0) return null;

  return (
    <div className="space-y-3 mb-6">
      {activeBots.map((bot) => (
        <div
          key={bot.meetingId}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs animate-pulse-subtle"
        >
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-ping"></span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-amber-900">
                  Bot Active in Call
                </span>
                <span className="text-xs bg-amber-200/60 text-amber-900 px-2 py-0.5 rounded-full font-medium">
                  {bot.status}
                </span>
              </div>
              <p className="text-xs text-amber-700 mt-0.5">
                Meeting ID: {bot.meetingId}
              </p>
            </div>
          </div>

          <button
            onClick={() => handleStop(bot.meetingId)}
            disabled={stoppingId === bot.meetingId}
            className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
          >
            {stoppingId === bot.meetingId ? (
              <>
                <span className="inline-block animate-spin">⏳</span>
                Stopping & Processing...
              </>
            ) : (
              <>
                <span>⏹️</span> Stop Bot & Process
              </>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}

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

function elapsed(startedAt: number) {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export default function ActiveBotsBanner({ teamId }: { teamId?: string }) {
  const [activeBots, setActiveBots] = useState<ActiveBot[]>([]);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const router = useRouter();

  const fetchBots = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/meetings/bot/active`);
      if (res.ok) {
        const data = await res.json();
        const bots: ActiveBot[] = data.bots || [];
        setActiveBots(teamId ? bots.filter((b) => b.teamId === teamId) : bots);
      }
    } catch {}
  };

  useEffect(() => {
    fetchBots();
    const poll = setInterval(fetchBots, 4000);
    const clock = setInterval(() => setTick((t) => t + 1), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [teamId]);

  const handleStop = async (meetingId: string) => {
    setStoppingId(meetingId);
    try {
      const res = await fetch(`${BACKEND_URL}/meetings/bot/stop/${meetingId}`, { method: "POST" });
      if (res.ok) { await fetchBots(); router.refresh(); }
    } catch {}
    finally { setStoppingId(null); }
  };

  if (activeBots.length === 0) return null;

  return (
    <div className="mb-5 space-y-2">
      {activeBots.map((bot) => (
        <div
          key={bot.meetingId}
          className="flex items-center justify-between gap-4 bg-rose-950 text-white px-4 py-2.5 rounded-lg text-sm"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400" />
            </span>
            <span className="font-medium">Recording in progress</span>
            <span className="text-rose-300 text-xs font-mono hidden sm:block">
              {bot.meetingId.slice(0, 8)}… · {elapsed(bot.startedAt)}
            </span>
            <span className="text-rose-300 text-xs capitalize">{bot.status}</span>
          </div>

          <button
            onClick={() => handleStop(bot.meetingId)}
            disabled={stoppingId === bot.meetingId}
            className="shrink-0 bg-white text-rose-950 text-xs font-semibold px-3 py-1.5 rounded-md hover:bg-rose-50 transition-colors disabled:opacity-60 cursor-pointer flex items-center gap-1.5"
          >
            {stoppingId === bot.meetingId ? (
              <>
                <span className="w-3 h-3 border-2 border-rose-900 border-t-transparent rounded-full animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
                Stop &amp; Process
              </>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}

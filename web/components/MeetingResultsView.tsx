"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import TaskCard from "@/components/TaskCard";

export interface ActionItemData {
  id: string;
  meeting_id: string;
  task_description: string;
  deadline?: string | null;
  owner_id?: string | null;
  needs_review?: boolean;
  created_by?: string | null;
  source_quote?: string | null;
  users?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
  tasks?: Array<{
    id: string;
    status: string;
  }>;
}

export interface DialogueTurn {
  speaker: string;
  text: string;
  time?: string;
}

interface TeamMember {
  user_id: string;
  role?: string;
  users?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
}

interface MeetingResultsViewProps {
  meetingId: string;
  initialActionItems: ActionItemData[];
  dialogue: DialogueTurn[];
  rawText?: string | null;
  teamMembers: TeamMember[];
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export default function MeetingResultsView({
  meetingId,
  initialActionItems,
  dialogue,
  rawText,
  teamMembers,
}: MeetingResultsViewProps) {
  const [items, setItems] = useState<ActionItemData[]>(initialActionItems);
  const [activeQuote, setActiveQuote] = useState<string | null>(null);
  const [activeTaskDesc, setActiveTaskDesc] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Editable local state for items in "Needs Review"
  const [editStates, setEditStates] = useState<
    Record<string, { description: string; ownerId: string; deadline: string }>
  >(() => {
    const initial: Record<string, { description: string; ownerId: string; deadline: string }> = {};
    for (const item of initialActionItems) {
      initial[item.id] = {
        description: item.task_description,
        ownerId: item.owner_id || "",
        deadline: item.deadline || "",
      };
    }
    return initial;
  });

  const router = useRouter();
  const transcriptRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Needs Review: items that have needs_review = true OR unassigned owner
  const needsReviewItems = items.filter(
    (item) => item.needs_review === true || !item.owner_id
  );

  // Confirmed items: items that have an owner and do NOT need review
  const confirmedItems = items.filter(
    (item) => item.needs_review !== true && Boolean(item.owner_id)
  );

  const handleEditChange = (
    id: string,
    field: "description" | "ownerId" | "deadline",
    value: string
  ) => {
    setEditStates((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  };

  const handleApprove = async (item: ActionItemData) => {
    const edit = editStates[item.id] || {
      description: item.task_description,
      ownerId: item.owner_id || "",
      deadline: item.deadline || "",
    };

    setSavingId(item.id);

    try {
      const res = await fetch(`${BACKEND_URL}/api/meetings/action-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_description: edit.description,
          owner_id: edit.ownerId || null,
          deadline: edit.deadline || null,
          needs_review: false,
        }),
      });

      if (!res.ok) throw new Error("Failed to approve action item");
      const data = await res.json();

      // Find selected member's user details
      const matchedMember = teamMembers.find((m) => m.user_id === edit.ownerId);

      // Optimistically update local items state
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                task_description: edit.description,
                owner_id: edit.ownerId || null,
                deadline: edit.deadline || null,
                needs_review: false,
                users: matchedMember?.users || null,
              }
            : i
        )
      );

      router.refresh();
    } catch (err) {
      console.error("[MeetingResultsView] Approve error:", err);
      alert("Failed to approve item. Make sure an owner is selected.");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this action item?")) return;
    setDeletingId(id);

    try {
      const res = await fetch(`${BACKEND_URL}/api/meetings/action-items/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete action item");

      setItems((prev) => prev.filter((i) => i.id !== id));
      router.refresh();
    } catch (err) {
      console.error("[MeetingResultsView] Delete error:", err);
      alert("Failed to delete item.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleHighlightQuote = (quote: string | null | undefined, taskDesc: string) => {
    if (!quote) return;
    setActiveQuote(quote);
    setActiveTaskDesc(taskDesc);

    // Find the first dialogue turn containing this quote
    const cleanQuote = quote.toLowerCase().trim();
    const index = dialogue.findIndex((turn) => {
      const t = turn.text.toLowerCase();
      return (
        t.includes(cleanQuote) ||
        cleanQuote.includes(t.slice(0, 30)) ||
        cleanQuote.split(" ").some((w) => w.length > 5 && t.includes(w))
      );
    });

    if (index !== -1 && transcriptRefs.current[index]) {
      transcriptRefs.current[index]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. NEEDS REVIEW SECTION */}
      {needsReviewItems.length > 0 && (
        <div className="bg-amber-50/40 border border-amber-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-amber-200/60">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                <h2 className="text-lg font-bold text-amber-950">
                  Needs Review &amp; Assignment
                </h2>
                <span className="bg-amber-200 text-amber-900 text-xs font-bold px-2 py-0.5 rounded-full">
                  {needsReviewItems.length}
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-1">
                These action items were extracted by AI but require owner confirmation or editing before publishing to the team board.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {needsReviewItems.map((item) => {
              const edit = editStates[item.id] || {
                description: item.task_description,
                ownerId: item.owner_id || "",
                deadline: item.deadline || "",
              };
              const quote = item.source_quote || item.task_description;
              const isSaving = savingId === item.id;
              const isDeleting = deletingId === item.id;

              return (
                <div
                  key={item.id}
                  className="bg-white border border-amber-200 rounded-xl p-5 shadow-2xs hover:shadow-xs transition-shadow flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                >
                  <div className="flex-1 w-full space-y-3">
                    {/* Editable Task Description */}
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                        Task Description
                      </label>
                      <input
                        type="text"
                        value={edit.description}
                        onChange={(e) =>
                          handleEditChange(item.id, "description", e.target.value)
                        }
                        className="w-full text-sm font-semibold text-[#111111] bg-[#F8F9FA] border border-[#E5E5E5] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                        placeholder="Task description..."
                      />
                    </div>

                    {/* Source Quote Pill */}
                    {quote && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleHighlightQuote(quote, edit.description)}
                          className="text-[11px] text-amber-800 hover:text-amber-950 bg-amber-100/60 hover:bg-amber-100 px-2.5 py-1 rounded-md border border-amber-200/80 transition-colors flex items-center gap-1.5 cursor-pointer"
                          title="Click to view and highlight source quote in transcript below"
                        >
                          <span>🔍 Quote:</span>
                          <span className="italic truncate max-w-[280px]">
                            &ldquo;{quote}&rdquo;
                          </span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Owner & Deadline Controls */}
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0 w-full md:w-auto">
                    {/* Owner Dropdown */}
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                        Assignee
                      </label>
                      <select
                        value={edit.ownerId}
                        onChange={(e) =>
                          handleEditChange(item.id, "ownerId", e.target.value)
                        }
                        className="text-xs bg-white border border-[#E5E5E5] rounded-lg px-3 py-2 text-gray-700 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#3B82F6] min-w-[150px]"
                      >
                        <option value="">-- Select Member --</option>
                        {teamMembers.map((tm) => (
                          <option key={tm.user_id} value={tm.user_id}>
                            {tm.users?.name || tm.users?.email || tm.user_id}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Deadline Picker */}
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                        Deadline
                      </label>
                      <input
                        type="date"
                        value={edit.deadline}
                        onChange={(e) =>
                          handleEditChange(item.id, "deadline", e.target.value)
                        }
                        className="text-xs bg-white border border-[#E5E5E5] rounded-lg px-2.5 py-2 text-gray-700 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 self-end mt-auto pt-1">
                      <button
                        type="button"
                        onClick={() => handleApprove(item)}
                        disabled={isSaving || isDeleting}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                        title="Approve task and publish to team board"
                      >
                        {isSaving ? "Saving…" : "✓ Approve"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        disabled={isSaving || isDeleting}
                        className="bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 border border-red-200 text-xs font-bold px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                        title="Delete this task"
                      >
                        {isDeleting ? "…" : "✕ Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. CONFIRMED ACTION ITEMS LIST */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#111111]">Assigned Action Items</h2>
              <span className="bg-[#0A0A0A] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {confirmedItems.length}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Verified action items logged with assigned owners and status tracking
            </p>
          </div>
        </div>

        {confirmedItems.length === 0 ? (
          <div className="bg-[#F8F9FA] border border-dashed border-gray-200 rounded-xl p-8 text-center space-y-2">
            <p className="font-bold text-[#111111] text-sm">
              {needsReviewItems.length > 0
                ? "All extracted items are currently in the Needs Review section above."
                : "No action items recorded for this session."}
            </p>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              Approve pending items above or click &ldquo;Add Action Item&rdquo; to create manual commitments.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {confirmedItems.map((item) => {
              const taskObj = item.tasks?.[0] || { id: item.id, status: "todo" };
              const quote = item.source_quote || item.task_description;

              return (
                <div key={item.id} className="relative group">
                  <TaskCard
                    task={{
                      id: taskObj.id,
                      status: taskObj.status,
                      action_item_id: item.id,
                      action_item: {
                        id: item.id,
                        task_description: item.task_description,
                        deadline: item.deadline,
                        owner_id: item.owner_id,
                        created_by: item.created_by || "ai",
                        owner: item.users || null,
                      },
                    }}
                  />

                  {quote && (
                    <button
                      type="button"
                      onClick={() => handleHighlightQuote(quote, item.task_description)}
                      className="mt-1.5 text-[11px] text-gray-500 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 px-2 py-0.5 rounded border border-gray-200 transition-colors flex items-center gap-1 cursor-pointer w-fit"
                      title="Highlight quote in transcript"
                    >
                      <span>🔍 Source Quote</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. SPEAKER-LABELLED VERBATIM TRANSCRIPT */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-[#111111]">
              Verbatim Meeting Transcript
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Speaker-labelled dialogue generated by Faster-Whisper. Click any action item&apos;s quote to highlight.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {activeQuote && (
              <button
                type="button"
                onClick={() => {
                  setActiveQuote(null);
                  setActiveTaskDesc(null);
                }}
                className="text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 transition-colors cursor-pointer flex items-center gap-1"
              >
                <span>✕ Clear Highlight</span>
              </button>
            )}
            <span className="text-xs font-bold text-gray-500 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-200">
              {dialogue.length > 0 ? `${dialogue.length} Turns` : "Raw Text"}
            </span>
          </div>
        </div>

        {/* Active Highlight Banner */}
        {activeQuote && activeTaskDesc && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-900 flex items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="font-bold">Highlighting source quote for:</span>
              <span className="font-semibold">&ldquo;{activeTaskDesc}&rdquo;</span>
            </div>
            <span className="italic text-amber-700 truncate max-w-sm">
              &ldquo;{activeQuote}&rdquo;
            </span>
          </div>
        )}

        {/* Transcript Dialogue List */}
        {dialogue.length > 0 ? (
          <div className="space-y-3 max-h-[550px] overflow-y-auto pr-2">
            {dialogue.map((turn, idx) => {
              const isSpeaker1 = turn.speaker.toLowerCase().includes("1");
              const isHighlighted =
                activeQuote &&
                (turn.text.toLowerCase().includes(activeQuote.toLowerCase().trim()) ||
                  activeQuote.toLowerCase().trim().includes(turn.text.toLowerCase().slice(0, 30)));

              return (
                <div
                  key={idx}
                  ref={(el) => {
                    transcriptRefs.current[idx] = el;
                  }}
                  className={`p-4 rounded-xl border transition-all duration-300 ${
                    isHighlighted
                      ? "ring-2 ring-amber-400 bg-amber-50/90 border-amber-300 shadow-md scale-[1.008]"
                      : isSpeaker1
                      ? "bg-[#F8F9FA] border-[#E5E5E5]"
                      : "bg-white border-blue-100 shadow-2xs"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-[#111111] flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isHighlighted
                            ? "bg-amber-500 ring-2 ring-amber-200"
                            : isSpeaker1
                            ? "bg-gray-700"
                            : "bg-[#3B82F6]"
                        }`}
                      ></span>
                      {turn.speaker}
                    </span>
                    {turn.time && (
                      <span className="text-[11px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        {turn.time}
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-sm leading-relaxed ${
                      isHighlighted ? "text-amber-950 font-medium" : "text-gray-700"
                    }`}
                  >
                    {turn.text}
                  </p>
                </div>
              );
            })}
          </div>
        ) : rawText ? (
          <div className="bg-[#F8F9FA] p-5 rounded-xl border border-[#E5E5E5] text-sm text-gray-700 leading-relaxed font-mono whitespace-pre-line max-h-[400px] overflow-y-auto">
            {rawText}
          </div>
        ) : (
          <div className="bg-[#F8F9FA] border border-dashed border-gray-200 rounded-xl p-8 text-center text-xs text-gray-400">
            Transcript pending audio ingestion.
          </div>
        )}
      </div>
    </div>
  );
}

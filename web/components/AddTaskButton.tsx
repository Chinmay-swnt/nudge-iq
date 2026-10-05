"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

interface TeamMember {
  user_id: string;
  role?: string;
  users?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
}

interface MeetingOption {
  id: string;
  title: string;
  meeting_date: string;
}

interface AddTaskButtonProps {
  teamId: string;
  teamMembers?: TeamMember[];
  meetings?: MeetingOption[];
}

export default function AddTaskButton({
  teamId,
  teamMembers = [],
  meetings = [],
}: AddTaskButtonProps) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState<string>("");
  const [meetingId, setMeetingId] = useState<string>(meetings[0]?.id || "");
  const [deadline, setDeadline] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      let activeMeetingId = meetingId;

      // If no meeting is selected or exists, create a default "General Tasks" meeting for this team
      if (!activeMeetingId) {
        const { data: defaultMeeting, error: meetingError } = await supabase
          .from("meetings")
          .insert({
            team_id: teamId,
            title: "General Action Items",
            meeting_date: new Date().toISOString(),
            status: "processed",
          })
          .select()
          .single();

        if (meetingError || !defaultMeeting) {
          throw new Error(meetingError?.message || "Failed to create meeting reference");
        }
        activeMeetingId = defaultMeeting.id;
      }

      // 1. Insert action item
      const { data: actionItem, error: actionItemError } = await supabase
        .from("action_items")
        .insert({
          meeting_id: activeMeetingId,
          task_description: description.trim(),
          owner_id: ownerId || null,
          deadline: deadline || null,
        })
        .select()
        .single();

      if (actionItemError || !actionItem) {
        throw new Error(actionItemError?.message || "Failed to create action item");
      }

      // 2. Insert linked task in 'todo' status
      const { error: taskError } = await supabase.from("tasks").insert({
        action_item_id: actionItem.id,
        status: "todo",
      });

      if (taskError) {
        throw new Error(taskError.message);
      }

      setOpen(false);
      setDescription("");
      setOwnerId("");
      setDeadline("");
      router.refresh();
    } catch (err: any) {
      console.error("Error adding task:", err);
      setError(err.message || "Failed to add task");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-[#3B82F6] hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
        type="button"
      >
        <span>+</span> Add Task
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-[#E5E5E5] shadow-lg p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold mb-1 text-[#111111]">
              Add New Task
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              Create an action item, assign an owner, and set a deadline.
            </p>

            <form onSubmit={handleCreate}>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg mb-4">
                  {error}
                </div>
              )}

              <div className="mb-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Task Description
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Follow up on vendor contracts and finalize Q4 pricing proposal"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[#F8F9FA] border border-[#E5E5E5] rounded-lg px-3.5 py-2.5 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:bg-white transition-all resize-none"
                  autoFocus
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Assignee
                  </label>
                  <select
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                    className="w-full bg-[#F8F9FA] border border-[#E5E5E5] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:bg-white transition-all"
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.users?.name || m.users?.email || m.user_id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Deadline
                  </label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full bg-[#F8F9FA] border border-[#E5E5E5] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:bg-white transition-all"
                  />
                </div>
              </div>

              {meetings.length > 0 && (
                <div className="mb-6">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                    Associated Meeting (Optional)
                  </label>
                  <select
                    value={meetingId}
                    onChange={(e) => setMeetingId(e.target.value)}
                    className="w-full bg-[#F8F9FA] border border-[#E5E5E5] rounded-lg px-3 py-2 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:bg-white transition-all"
                  >
                    {meetings.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} ({new Date(m.meeting_date).toLocaleDateString()})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end items-center gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setError(null);
                  }}
                  disabled={loading}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !description.trim()}
                  className="bg-[#3B82F6] hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg px-5 py-2 text-sm font-medium transition-colors cursor-pointer"
                >
                  {loading ? "Adding..." : "Add Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

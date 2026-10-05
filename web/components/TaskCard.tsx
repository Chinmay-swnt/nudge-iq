"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

interface TaskItem {
  id: string;
  status: "todo" | "in_progress" | "done" | "overdue" | string;
  action_item_id: string;
  action_item?: {
    id: string;
    task_description: string;
    deadline?: string | null;
    owner_id?: string | null;
    owner?: {
      name?: string | null;
      email?: string | null;
    } | null;
  } | null;
}

interface TaskCardProps {
  task: TaskItem;
}

const STATUS_OPTIONS = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "overdue", label: "Overdue" },
];

export default function TaskCard({ task }: TaskCardProps) {
  const [status, setStatus] = useState(task.status);
  const [updating, setUpdating] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === status || updating) return;
    setStatus(newStatus);
    setUpdating(true);

    try {
      const { error } = await supabase
        .from("tasks")
        .update({ status: newStatus })
        .eq("id", task.id);

      if (error) {
        console.error("Failed to update status:", error);
        setStatus(task.status);
      } else {
        router.refresh();
      }
    } catch (err) {
      console.error("Error updating status:", err);
      setStatus(task.status);
    } finally {
      setUpdating(false);
    }
  };

  const isOverdue =
    task.action_item?.deadline &&
    new Date(task.action_item.deadline) < new Date() &&
    status !== "done";

  const ownerName =
    task.action_item?.owner?.name ||
    task.action_item?.owner?.email ||
    "Unassigned";

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 shadow-xs hover:shadow-sm transition-shadow flex flex-col justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-[#111111] leading-snug">
          {task.action_item?.task_description || "Untitled task"}
        </p>

        <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-gray-500">
          <div className="flex items-center gap-1.5 bg-[#F8F9FA] px-2 py-1 rounded-md border border-[#E5E5E5]">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
            <span className="truncate max-w-[120px]">{ownerName}</span>
          </div>

          {task.action_item?.deadline && (
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-md border text-xs ${
                isOverdue
                  ? "bg-red-50 text-red-600 border-red-200"
                  : "bg-gray-50 text-gray-600 border-gray-200"
              }`}
            >
              <span>{task.action_item.deadline}</span>
            </div>
          )}
        </div>
      </div>

      <div className="pt-2 border-t border-[#F0F0F0] flex items-center justify-between">
        <label className="text-xs text-gray-400">Move to:</label>
        <select
          value={status}
          onChange={(e) => handleStatusChange(e.target.value)}
          disabled={updating}
          className="text-xs bg-[#F8F9FA] border border-[#E5E5E5] rounded-md px-2 py-1 text-gray-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

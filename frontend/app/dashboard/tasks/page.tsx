// app/dashboard/tasks/page.tsx
import { createClient } from "@/lib/supabaseServer";

export default async function TasksPage() {
  const supabase = await createClient();
  const { data: tasks } = await supabase
    .from("tasks")
    .select("*, action_items(task_description, deadline, owner_id)");

  const columns = ["todo", "in_progress", "done"];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Tasks</h1>
      <div className="grid grid-cols-3 gap-4">
        {columns.map((col) => (
          <div key={col} className="bg-[#F8F9FA] rounded-xl p-3">
            <h3 className="font-medium mb-3 capitalize">
              {col.replace("_", " ")}
            </h3>
            {tasks
              ?.filter((t) => t.status === col)
              .map((task) => (
                <div
                  key={task.id}
                  className="bg-white border border-[#E5E5E5] rounded-lg p-3 mb-2"
                >
                  <p className="text-sm">
                    {task.action_items?.task_description}
                  </p>
                  <p className="text-xs text-gray-500">
                    {task.action_items?.deadline}
                  </p>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

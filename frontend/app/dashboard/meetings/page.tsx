// app/dashboard/meetings/page.tsx
import { createClient } from "@/lib/supabaseServer";

export default async function MeetingsPage() {
  const supabase = await createClient();
  const { data: meetings } = await supabase
    .from("meetings")
    .select("*")
    .order("meeting_date", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Meetings</h1>
      <div className="flex flex-col gap-3">
        {meetings?.map((meeting) => (
          <div
            key={meeting.id}
            className="bg-white border border-[#E5E5E5] rounded-xl p-4"
          >
            <h2 className="font-medium">{meeting.title}</h2>
            <p className="text-sm text-gray-500">{meeting.meeting_date}</p>
            <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full">
              {meeting.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

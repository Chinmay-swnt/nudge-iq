import { createClient } from "@/lib/supabaseServer";

export default async function TeamMeetings({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();
  const { data: meetings } = await supabase
    .from("meetings")
    .select("*")
    .eq("team_id", (await params).teamId)
    .order("meeting_date", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Meetings</h1>
      {meetings?.map((m) => (
        <div
          key={m.id}
          className="bg-white border border-[#E5E5E5] rounded-xl p-4 mb-3"
        >
          <h2 className="font-medium">{m.title}</h2>
          <p className="text-sm text-gray-500">{m.meeting_date}</p>
          <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full">
            {m.status}
          </span>
        </div>
      ))}
    </div>
  );
}

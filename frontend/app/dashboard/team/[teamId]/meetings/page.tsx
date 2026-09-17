import Link from "next/link";
import { createClient } from "@/lib/supabaseServer";
import AddMeetingButton from "@/components/AddMeetingButton";

export default async function TeamMeetingsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();

  const { data: meetings } = await supabase
    .from("meetings")
    .select("*, transcripts(id, raw_text), action_items(id, task_description)")
    .eq("team_id", teamId)
    .order("meeting_date", { ascending: false });

  const totalMeetings = meetings?.length || 0;

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#111111]">
            Meetings
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Recorded team discussions, full summaries, speaker transcripts, and extracted tasks.
          </p>
        </div>

        <AddMeetingButton teamId={teamId} />
      </div>

      {/* Meetings List */}
      {totalMeetings === 0 ? (
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-12 text-center shadow-xs">
          <div className="w-14 h-14 rounded-full bg-blue-50 text-[#3B82F6] flex items-center justify-center font-bold text-2xl mx-auto mb-4">
            🎙️
          </div>
          <h3 className="text-lg font-bold text-[#111111] mb-1">
            No meetings recorded yet
          </h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
            Log a meeting manually or upload audio from the hardware device to trigger automatic transcription and action item extraction.
          </p>
          <AddMeetingButton teamId={teamId} />
        </div>
      ) : (
        <div className="space-y-4">
          {meetings?.map((meeting: any) => {
            const actionItemsCount = meeting.action_items?.length || 0;
            const hasTranscript = Boolean(meeting.transcript_url || meeting.transcripts?.length);

            return (
              <Link
                key={meeting.id}
                href={`/dashboard/team/${teamId}/meetings/${meeting.id}`}
                className="group block bg-white border border-[#E5E5E5] hover:border-[#3B82F6] rounded-2xl p-6 shadow-xs hover:shadow-md transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h2 className="font-bold text-lg text-[#111111] group-hover:text-[#3B82F6] transition-colors">
                        {meeting.title}
                      </h2>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                          meeting.status === "processed"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-gray-100 text-gray-700 border border-gray-200"
                        }`}
                      >
                        {meeting.status}
                      </span>
                    </div>

                    <p className="text-xs text-gray-500 flex items-center gap-2">
                      <span>📅</span>
                      <span>
                        {new Date(meeting.meeting_date).toLocaleDateString(undefined, {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                    <div className="flex items-center gap-1.5 bg-[#F8F9FA] px-3 py-1.5 rounded-lg border border-[#E5E5E5]">
                      <span className="font-bold text-[#111111]">{actionItemsCount}</span>
                      <span>action items</span>
                    </div>

                    {hasTranscript ? (
                      <span className="bg-blue-50 text-[#3B82F6] border border-blue-200 px-3 py-1.5 rounded-lg font-medium">
                        Transcript Available
                      </span>
                    ) : (
                      <span className="bg-gray-50 text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg">
                        Pending Audio / Transcript
                      </span>
                    )}

                    <span className="text-[#3B82F6] font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      View details &rarr;
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

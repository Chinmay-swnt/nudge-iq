import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseServer";
import TaskCard from "@/components/TaskCard";
import AddMeetingActionItemModal from "@/components/AddMeetingActionItemModal";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ teamId: string; meetingId: string }>;
}) {
  const { teamId, meetingId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/get-started");
  }

  // 1. Fetch meeting details
  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("*, teams(id, name)")
    .eq("id", meetingId)
    .eq("team_id", teamId)
    .single();

  if (meetingError || !meeting) {
    notFound();
  }

  // 2. Fetch transcripts
  const { data: transcripts } = await supabase
    .from("transcripts")
    .select("*")
    .eq("meeting_id", meetingId);

  const transcript = transcripts?.[0] || null;

  // 3. Fetch action items & owners for this meeting
  const { data: actionItems } = await supabase
    .from("action_items")
    .select("id, meeting_id, task_description, deadline, owner_id, users:owner_id(id, name, email)")
    .eq("meeting_id", meetingId);

  const actionItemIds = (actionItems || []).map((a: any) => a.id);
  const actionItemMap = new Map((actionItems || []).map((ai: any) => [ai.id, ai]));

  // 4. Fetch linked tasks
  const { data: tasks } = actionItemIds.length
    ? await supabase
        .from("tasks")
        .select("*")
        .in("action_item_id", actionItemIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const fullTasks = (tasks || []).map((t) => {
    const ai = actionItemMap.get(t.action_item_id) as any;
    return {
      ...t,
      action_item: ai
        ? {
            id: ai.id,
            task_description: ai.task_description,
            deadline: ai.deadline,
            owner_id: ai.owner_id,
            owner: ai.users || null,
          }
        : null,
    };
  });

  // 5. Fetch team members
  const { data: teamMembers } = await supabase
    .from("team_members")
    .select("user_id, role, users(id, name, email)")
    .eq("team_id", teamId);

  const formattedTeamMembers = (teamMembers || []).map((tm: any) => ({
    user_id: tm.user_id,
    role: tm.role,
    users: tm.users || null,
  }));

  // Parse diarized conversation if available
  let diarizedDialogue: Array<{ speaker: string; text: string; time?: string }> = [];
  if (transcript?.diarized_json && Array.isArray(transcript.diarized_json)) {
    diarizedDialogue = transcript.diarized_json;
  }

  // Calculate task counts
  const totalTasks = fullTasks.length;
  const completedTasks = fullTasks.filter((t) => t.status === "done").length;
  const pendingTasks = fullTasks.filter((t) => t.status !== "done").length;

  return (
    <div className="space-y-8 pb-12">
      {/* Top Breadcrumb & Header */}
      <div className="space-y-4">
        <div>
          <Link
            href={`/dashboard/team/${teamId}/meetings`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3B82F6] hover:underline"
          >
            <span>&larr;</span> Back to Meetings
          </Link>
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-extrabold tracking-tight text-[#111111]">
                {meeting.title}
              </h1>
              <span
                className={`text-xs px-3 py-1 rounded-full font-semibold ${
                  meeting.status === "processed"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-gray-100 text-gray-700 border border-gray-200"
                }`}
              >
                {meeting.status === "processed" ? "AI Processed" : "Pending Processing"}
              </span>
            </div>

            <p className="text-sm text-gray-500 flex items-center gap-2">
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

          <div className="flex items-center gap-3 shrink-0">
            <AddMeetingActionItemModal
              meetingId={meetingId}
              teamMembers={formattedTeamMembers}
            />
          </div>
        </div>
      </div>

      {/* Overview Stats for this Meeting */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E5E5E5] rounded-xl p-5 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
            Total Action Items
          </p>
          <p className="text-3xl font-extrabold text-[#111111]">{totalTasks}</p>
          <p className="text-xs text-gray-400 mt-1">Extracted from discussion</p>
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-xl p-5 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
            Completed Tasks
          </p>
          <p className="text-3xl font-extrabold text-emerald-600">{completedTasks}</p>
          <p className="text-xs text-gray-400 mt-1">Resolved follow-ups</p>
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-xl p-5 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
            Pending Tasks
          </p>
          <p className="text-3xl font-extrabold text-[#3B82F6]">{pendingTasks}</p>
          <p className="text-xs text-gray-400 mt-1">In progress & to-do</p>
        </div>
      </div>

      {/* Meeting Summary & Key Decisions */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-[#111111]">Meeting Summary & Takeaways</h2>
            <p className="text-xs text-gray-400 mt-0.5">High-level synthesis of discussion and decisions</p>
          </div>
          <span className="text-xs bg-blue-50 text-[#3B82F6] px-2.5 py-1 rounded-md font-medium border border-blue-100">
            Summary
          </span>
        </div>

        {meeting.status === "processed" || transcript?.raw_text ? (
          <div className="prose text-sm text-gray-700 leading-relaxed bg-[#F8F9FA] p-5 rounded-xl border border-[#E5E5E5]">
            <p className="font-medium text-[#111111] mb-2">
              Discussion Highlights:
            </p>
            <p>
              {transcript?.raw_text
                ? transcript.raw_text.slice(0, 400) + (transcript.raw_text.length > 400 ? "..." : "")
                : "The team aligned on project deliverables, milestones, and assigned specific action items for the upcoming cycle."}
            </p>
          </div>
        ) : (
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500">
            <p className="font-semibold text-gray-700 mb-1">Summary Pending AI Processing</p>
            <p className="text-xs text-gray-400">
              When audio is uploaded from the hardware ingestion device or ML service, a detailed summary and decisions log will appear here.
            </p>
          </div>
        )}
      </div>

      {/* Attendees / Team Members Section */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-[#111111]">Team Members & Attendees</h2>
            <p className="text-xs text-gray-400 mt-0.5">Participants involved in this session</p>
          </div>
          <span className="text-xs font-semibold text-gray-500">
            {formattedTeamMembers.length} members
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {formattedTeamMembers.map((tm) => (
            <div
              key={tm.user_id}
              className="p-3 bg-[#F8F9FA] rounded-xl border border-[#E5E5E5] flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold text-sm flex items-center justify-center shrink-0">
                {(tm.users?.name || tm.users?.email || "U")[0].toUpperCase()}
              </div>
              <div className="truncate">
                <p className="text-sm font-semibold text-[#111111] truncate">
                  {tm.users?.name || tm.users?.email || "Teammate"}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {tm.users?.email || "No email"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Items & Tasks Assigned */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-[#111111]">Action Items Assigned</h2>
            <p className="text-xs text-gray-400 mt-0.5">Extracted tasks, owners, deadlines, and current status</p>
          </div>

          <AddMeetingActionItemModal
            meetingId={meetingId}
            teamMembers={formattedTeamMembers}
          />
        </div>

        {fullTasks.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl">
            <p className="text-sm font-semibold text-[#111111] mb-1">No action items recorded for this meeting yet</p>
            <p className="text-xs text-gray-400 mb-4">Click "Add Action Item" above to assign tasks to teammates.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fullTasks.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        )}
      </div>

      {/* Detailed Communication / Transcript Section */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-[#111111]">Detailed Communication & Transcript</h2>
            <p className="text-xs text-gray-400 mt-0.5">Speaker turns, verbatim discussion, and audio records</p>
          </div>

          {meeting.transcript_url && (
            <a
              href={meeting.transcript_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#3B82F6] hover:underline font-medium flex items-center gap-1"
            >
              <span>🎧 Audio File</span>
              <span>&nearr;</span>
            </a>
          )}
        </div>

        {diarizedDialogue.length > 0 ? (
          <div className="space-y-3 bg-[#F8F9FA] p-5 rounded-xl border border-[#E5E5E5]">
            {diarizedDialogue.map((item, idx) => (
              <div key={idx} className="flex gap-4 text-sm pb-3 border-b border-gray-200 last:border-0 last:pb-0">
                <div className="font-bold text-[#111111] shrink-0 w-28 text-xs uppercase tracking-wider text-blue-600">
                  {item.speaker || `Speaker ${idx + 1}`}:
                </div>
                <div className="flex-1 text-gray-800">
                  <p>{item.text}</p>
                  {item.time && <span className="text-[10px] text-gray-400">{item.time}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : transcript?.raw_text ? (
          <div className="bg-[#F8F9FA] p-5 rounded-xl border border-[#E5E5E5] text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
            {transcript.raw_text}
          </div>
        ) : (
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500">
            <div className="w-10 h-10 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center mx-auto mb-2 font-bold text-lg">
              💬
            </div>
            <p className="font-semibold text-gray-700 mb-1">Transcript Not Yet Available</p>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              Once meeting audio is processed through the ESP32 hardware upload or ML service, the full transcript and speaker breakdown will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

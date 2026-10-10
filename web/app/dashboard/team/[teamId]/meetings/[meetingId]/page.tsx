import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseServer";
import TaskCard from "@/components/TaskCard";
import AddMeetingActionItemModal from "@/components/AddMeetingActionItemModal";
import ProcessNowButton from "@/components/ProcessNowButton";

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

  // Parse diarized conversation, executive summary, and key decisions
  let diarizedDialogue: Array<{ speaker: string; text: string; time?: string }> = [];
  let executiveSummary = meeting.summary || "";
  let keyDecisions: string[] = [];

  if (transcript?.diarized_json) {
    if (Array.isArray(transcript.diarized_json)) {
      diarizedDialogue = transcript.diarized_json;
    } else if (typeof transcript.diarized_json === "object") {
      if (Array.isArray(transcript.diarized_json.dialogue)) {
        diarizedDialogue = transcript.diarized_json.dialogue;
      }
      if (!executiveSummary && transcript.diarized_json.summary) {
        executiveSummary = transcript.diarized_json.summary;
      }
      if (Array.isArray(transcript.diarized_json.key_decisions)) {
        keyDecisions = transcript.diarized_json.key_decisions;
      }
    }
  }

  if (!executiveSummary && transcript?.raw_text) {
    executiveSummary = transcript.raw_text;
  }

  const totalTasks = fullTasks.length;
  const completedTasks = fullTasks.filter((t) => t.status === "done").length;
  const pendingTasks = fullTasks.filter((t) => t.status !== "done").length;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="space-y-8 pb-16 max-w-6xl mx-auto">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href={`/dashboard/team/${teamId}/meetings`}
          className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-[#111111] transition-colors py-1 px-2.5 rounded-lg bg-white border border-[#E5E5E5] hover:border-gray-300 shadow-2xs"
        >
          <span>&larr;</span> All Meetings
        </Link>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 border border-gray-200">
            Workspace: {meeting.teams?.name || "Team"}
          </span>
        </div>
      </div>

      {/* Main Header Hero Card */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider ${
                  meeting.status === "processed"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : meeting.status === "uploaded" || meeting.processing_status === "uploaded"
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200 animate-pulse"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    meeting.status === "processed"
                      ? "bg-emerald-500"
                      : meeting.status === "uploaded" || meeting.processing_status === "uploaded"
                      ? "bg-blue-500"
                      : "bg-amber-500"
                  }`}
                ></span>
                {meeting.status === "processed"
                  ? "AI Processed"
                  : meeting.status === "uploaded" || meeting.processing_status === "uploaded"
                  ? "Audio Uploaded"
                  : "Recording Pending"}
              </span>

              <span className="text-xs text-gray-500 bg-[#F8F9FA] px-3 py-1 rounded-full border border-[#E5E5E5] font-medium">
                📅 {new Date(meeting.meeting_date).toLocaleDateString(undefined, {
                  weekday: "short",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111111]">
              {meeting.title}
            </h1>

            <p className="text-xs sm:text-sm text-gray-500 max-w-2xl">
              Automated synthesis, assigned action deliverables, and full diarized transcript powered by NudgeIQ AI.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {(meeting.status === "uploaded" || meeting.processing_status === "uploaded" || Boolean(meeting.transcript_url && meeting.status !== "processed")) ? (
              <ProcessNowButton meetingId={meetingId} />
            ) : meeting.status === "processed" ? (
              <ProcessNowButton meetingId={meetingId} isReprocess={true} />
            ) : null}
            <AddMeetingActionItemModal
              meetingId={meetingId}
              teamMembers={formattedTeamMembers}
            />
          </div>
        </div>

        {/* Task Completion Progress Bar */}
        {totalTasks > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-600 mb-2">
              <span>Action Items Completion</span>
              <span className="text-[#111111]">{completedTasks} of {totalTasks} completed ({progressPercent}%)</span>
            </div>
            <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">
            Total Deliverables
          </p>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-[#111111]">{totalTasks}</span>
            <span className="text-xs font-semibold text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
              Tasks
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-2">Actionable commitments</p>
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">
            Completed
          </p>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-emerald-600">{completedTasks}</span>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              {progressPercent}% Done
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-2">Resolved deliverables</p>
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">
            Pending Follow-Ups
          </p>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-[#3B82F6]">{pendingTasks}</span>
            <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              Active
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-2">In progress & to-do items</p>
        </div>
      </div>

      {/* Executive Summary & Key Decisions */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-[#111111]">Executive Summary</h2>
            <p className="text-xs text-gray-500 mt-0.5">Core takeaways and operational alignments</p>
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-200">
            AI Synthesis
          </span>
        </div>

        {executiveSummary ? (
          <div className="space-y-4">
            <div className="bg-[#F8F9FA] p-5 rounded-xl border border-[#E5E5E5] text-sm text-gray-800 leading-relaxed font-normal">
              <p className="font-semibold text-[#111111] mb-2 text-xs uppercase tracking-wider text-gray-500">
                Key Discussion Summary
              </p>
              <p className="whitespace-pre-line leading-relaxed">
                {executiveSummary}
              </p>
            </div>

            {keyDecisions.length > 0 && (
              <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-100">
                <p className="font-semibold text-emerald-900 mb-2 text-xs uppercase tracking-wider">
                  Key Operational Decisions
                </p>
                <ul className="list-disc list-inside space-y-1 text-xs text-emerald-800">
                  {keyDecisions.map((dec, i) => (
                    <li key={i}>{dec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[#F8F9FA] border border-dashed border-gray-200 rounded-xl p-8 text-center space-y-2">
            <p className="font-bold text-[#111111] text-sm">Summary Pending Processing</p>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              Once the bot leaves the call or audio is uploaded, Faster-Whisper will generate an executive summary and extract all commitments automatically.
            </p>
          </div>
        )}
      </div>

      {/* Action Items Matrix */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#111111]">Assigned Action Items</h2>
              <span className="bg-[#0A0A0A] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {totalTasks}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Tasks extracted by AI or logged by team members with real-time status tracking
            </p>
          </div>

          <AddMeetingActionItemModal
            meetingId={meetingId}
            teamMembers={formattedTeamMembers}
          />
        </div>

        {totalTasks === 0 ? (
          <div className="bg-[#F8F9FA] border border-dashed border-gray-200 rounded-xl p-8 text-center space-y-2">
            <p className="font-bold text-[#111111] text-sm">No action items recorded for this session</p>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              Click &quot;Add Action Item&quot; above to log commitments manually, or run the recording bot to extract them from live speech.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fullTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>

      {/* Diarized Conversation Transcript */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-[#111111]">Verbatim Meeting Transcript</h2>
            <p className="text-xs text-gray-500 mt-0.5">Time-coded speaker dialogue generated by Faster-Whisper</p>
          </div>
          <span className="text-xs font-bold text-gray-500 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-200">
            {diarizedDialogue.length > 0 ? `${diarizedDialogue.length} Turns` : "Full Text"}
          </span>
        </div>

        {diarizedDialogue.length > 0 ? (
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            {diarizedDialogue.map((turn, idx) => {
              const isSpeaker1 = turn.speaker.toLowerCase().includes("1");
              return (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border transition-colors ${
                    isSpeaker1
                      ? "bg-[#F8F9FA] border-[#E5E5E5]"
                      : "bg-white border-blue-100 shadow-2xs"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-[#111111] flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${isSpeaker1 ? "bg-gray-700" : "bg-[#3B82F6]"}`}></span>
                      {turn.speaker}
                    </span>
                    {turn.time && (
                      <span className="text-[11px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        {turn.time}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{turn.text}</p>
                </div>
              );
            })}
          </div>
        ) : transcript?.raw_text ? (
          <div className="bg-[#F8F9FA] p-5 rounded-xl border border-[#E5E5E5] text-sm text-gray-700 leading-relaxed font-mono whitespace-pre-line max-h-[400px] overflow-y-auto">
            {transcript.raw_text}
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

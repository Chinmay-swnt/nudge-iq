"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

interface InviteFormProps {
  teamId: string;
}

export default function InviteForm({ teamId }: InviteFormProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || loading) return;

    setLoading(true);
    setStatus(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/get-started");
        return;
      }

      // Check if already invited or member
      const { data: existingInvite } = await supabase
        .from("invites")
        .select("id, status")
        .eq("team_id", teamId)
        .eq("email", email.trim().toLowerCase())
        .eq("status", "pending")
        .maybeSingle();

      if (existingInvite) {
        throw new Error("A pending invite has already been sent to this email address.");
      }

      const { error: inviteError } = await supabase.from("invites").insert({
        team_id: teamId,
        email: email.trim().toLowerCase(),
        invited_by: user.id,
        status: "pending",
      });

      if (inviteError) {
        throw new Error(inviteError.message);
      }

      setStatus({
        type: "success",
        message: `Invite sent to ${email.trim()}. When they sign in with Google using this email, they will automatically join this workspace!`,
      });
      setEmail("");
      router.refresh();
    } catch (err: any) {
      console.error("Error sending invite:", err);
      setStatus({
        type: "error",
        message: err.message || "Failed to send invite",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleInvite} className="space-y-4">
      {status && (
        <div
          className={`p-4 rounded-xl text-sm border ${
            status.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          {status.message}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          placeholder="colleague@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 bg-[#F8F9FA] border border-[#E5E5E5] rounded-xl px-4 py-2.5 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:bg-white transition-all"
          required
        />
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="bg-[#3B82F6] hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl px-6 py-2.5 text-sm font-medium transition-colors shrink-0 cursor-pointer shadow-xs"
        >
          {loading ? "Sending..." : "Send Invite"}
        </button>
      </div>
    </form>
  );
}

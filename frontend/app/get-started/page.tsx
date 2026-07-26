// src/app/get-started/page.tsx
"use client";

import Link from "next/link";

// import { createClient } from "@/lib/supabaseClient"; // client-side supabase client

const GetStarted = () => {
  //   const supabase = createClient();

  //   const handleGoogleAuth = async () => {
  //     await supabase.auth.signInWithOAuth({
  //       provider: "google",
  //       options: {
  //         redirectTo: `${window.location.origin}/dashboard`,
  //       },
  //     });
  //     // Supabase handles both signup + login automatically —
  //     // if the Google account doesn't exist yet, it creates one;
  //     // if it does, it logs in. No separate flow needed.
  //   };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-[#E5E5E5] p-8 text-center">
        <h1 className="text-2xl font-bold mb-1">NudgeIQ</h1>
        <p className="text-sm text-gray-500 mb-8">
          Track meetings. Assign tasks. Never miss a follow-up.
        </p>

        <Link
          href="/dashboard"
          className="w-full flex items-center justify-center gap-2 border border-[#E5E5E5] rounded-lg py-2 text-sm font-medium text-[#111111] hover:bg-[#F8F9FA] transition-colors"
        >
          <GoogleIcon />
          Continue with Google
        </Link>
      </div>
    </div>
  );
};

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path
      fill="#FFC107"
      d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"
    />
    <path
      fill="#FF3D00"
      d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.5 0-14 4.2-17.7 10.7z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.5 0 10.4-1.9 14.2-5.1l-6.5-5.5c-2 1.4-4.6 2.2-7.7 2.2-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.9 39.7 16.4 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.5 5.5C41.4 36.4 44 30.8 44 24c0-1.2-.1-2.4-.4-3.5z"
    />
  </svg>
);

export default GetStarted;

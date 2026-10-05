// src/app/get-started/page.tsx
"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

function GetStartedContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // 1. Check search params
    const queryError = searchParams.get("error_description") || searchParams.get("error");
    if (queryError) {
      setErrorMessage(queryError);
      return;
    }

    // 2. Check hash fragments (Supabase sometimes redirects with #error=...)
    if (typeof window !== "undefined" && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const hashError = hashParams.get("error_description") || hashParams.get("error");
      if (hashError) {
        setErrorMessage(decodeURIComponent(hashError.replace(/\+/g, " ")));
      }
    }
  }, [searchParams]);

  const handleGoogleAuth = async () => {
    setErrorMessage(null);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xs border border-[#E5E5E5] p-8 text-center">
        <div className="w-10 h-10 bg-[#0A0A0A] text-white rounded-xl flex items-center justify-center font-black text-lg mx-auto mb-3">
          N
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#111111] mb-1">
          NudgeIQ
        </h1>
        <p className="text-xs text-gray-500 mb-6">
          Track meetings. Assign tasks. Never miss a follow-up.
        </p>

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl mb-5 text-left">
            <p className="font-semibold mb-1">Sign-in Error</p>
            <p className="text-gray-600 leading-relaxed">{errorMessage}</p>
          </div>
        )}

        <button
          onClick={handleGoogleAuth}
          className="w-full flex items-center justify-center gap-2.5 border border-[#E5E5E5] hover:border-gray-400 bg-white rounded-xl py-2.5 px-4 text-sm font-semibold text-[#111111] hover:bg-[#F8F9FA] transition-all cursor-pointer shadow-xs"
        >
          <GoogleIcon />
          Continue with Google
        </button>
      </div>
    </div>
  );
}

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

export default function GetStartedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8F9FA]" />}>
      <GetStartedContent />
    </Suspense>
  );
}

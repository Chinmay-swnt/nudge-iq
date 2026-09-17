import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseServer";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/get-started");
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      {/* Global Top Navbar */}
      <header className="bg-white border-b border-[#E5E5E5] px-8 py-3.5 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-xl font-bold tracking-tight text-[#111111] flex items-center gap-2">
            <span className="w-7 h-7 bg-[#0A0A0A] text-white rounded-lg flex items-center justify-center font-black text-sm">
              N
            </span>
            NudgeIQ
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500 hidden sm:inline-block">
            {user.email}
          </span>
          <form action="/auth/signout" method="post">
            <button
              formAction={async () => {
                "use server";
                const serverSupabase = await createClient();
                await serverSupabase.auth.signOut();
                redirect("/get-started");
              }}
              className="text-xs text-gray-500 hover:text-red-600 font-medium px-3 py-1.5 rounded-md hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
        {children}
      </main>
    </div>
  );
}

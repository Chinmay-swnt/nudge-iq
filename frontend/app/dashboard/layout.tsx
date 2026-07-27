// src/app/dashboard/layout.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseServer"; // server-side supabase client

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser(); // remove the extra (await supabase)

  if (!user) {
    redirect("/get-started");
  }

  return (
    <div className="flex min-h-screen bg-[#F8F9FA]">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0F182B] text-white flex flex-col justify-between p-4">
        <div>
          <div className="text-xl font-bold mb-8 px-2">NudgeIQ</div>

          <nav className="flex flex-col gap-1">
            <SidebarLink href="/dashboard" label="Dashboard" />
            <SidebarLink href="/dashboard/meetings" label="Meetings" />
            <SidebarLink href="/dashboard/tasks" label="Tasks" />
            <SidebarLink href="/dashboard/analytics" label="Analytics" />
            <SidebarLink href="/dashboard/settings" label="Settings" />
          </nav>
        </div>

        <div className="px-2 text-sm text-gray-400 truncate">{user.email}</div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}

function SidebarLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-[#1A1A1A] hover:text-white transition-colors"
    >
      {label}
    </Link>
  );
}

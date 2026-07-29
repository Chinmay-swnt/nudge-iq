import Link from "next/link";

export default async function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const base = `/dashboard/team/${teamId}`;

  return (
    <div className="flex h-full">
      {/* Teams side panel */}
      <aside className="w-1/8 h-40 bg-[#0A0A0A] self-center text-white p-4 rounded-4xl">
        <nav className="flex flex-col gap-1">
          <SidebarLink href={base} label="Dashboard" />
          <SidebarLink href={`${base}/meetings`} label="Meetings" />
          <SidebarLink href={`${base}/tasks`} label="Tasks" />
        </nav>
      </aside>

      {/* Main view — swaps based on child route */}
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}

function SidebarLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-[#1A1A1A] hover:text-white transition-colors"
    >
      {label}
    </Link>
  );
}

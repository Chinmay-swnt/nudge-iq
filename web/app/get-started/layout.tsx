export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <section className="min-h-screen bg-[#F8F9FA]">
      <main>{children}</main>
    </section>
  );
}

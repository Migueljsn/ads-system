import { Sidebar } from "@/components/sidebar";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="md:flex">
      <Sidebar email={user.email} />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8"><div className="mx-auto max-w-[1400px]">{children}</div></main>
    </div>
  );
}

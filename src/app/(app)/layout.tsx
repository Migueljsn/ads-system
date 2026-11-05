import Link from "next/link";
import { BarChart3, Bot, Building2, KeyRound, Megaphone, Plug, Settings } from "lucide-react";
import { requireUser } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Visão geral", icon: BarChart3 },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/contas", label: "Contas", icon: Plug },
  { href: "/clientes", label: "Clientes", icon: Building2 },
  { href: "/ia", label: "IA", icon: Bot },
  { href: "/mcp", label: "API & MCP", icon: KeyRound },
  { href: "/config", label: "Configurações", icon: Settings },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="md:flex">
      <aside className="border-b border-line bg-panel md:sticky md:top-0 md:h-screen md:w-56 md:border-r md:border-b-0">
        <div className="px-4 py-4 text-base font-semibold">Fonil <span className="text-brand">Ads</span></div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/5">
              <Icon size={16} /> {label}
            </Link>
          ))}
        </nav>
        <div className="hidden px-4 py-3 text-xs text-muted md:absolute md:bottom-0 md:block">
          {user.email}
          <form action="/auth/logout" method="post"><button className="underline">sair</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bot, Building2, Funnel, KeyRound, LogOut, Megaphone, Plug, Settings } from "lucide-react";
import { Logo } from "./logo";

const NAV = [
  { href: "/", label: "Visão geral", icon: BarChart3 },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/crm", label: "Resultados no CRM", icon: Funnel },
  { href: "/ia", label: "Assistente IA", icon: Bot },
  { href: "/clientes", label: "Clientes", icon: Building2 },
  { href: "/contas", label: "Contas de anúncio", icon: Plug },
  { href: "/mcp", label: "API & MCP", icon: KeyRound },
  { href: "/config", label: "Configurações", icon: Settings },
];

export function Sidebar({ email }: { email: string }) {
  const path = usePathname();
  return (
    <aside className="sticky top-0 z-20 flex flex-col border-b border-line bg-panel/70 backdrop-blur-xl md:h-screen md:w-64 md:shrink-0 md:border-r md:border-b-0">
      <div className="flex items-center justify-between px-5 py-4 md:py-6"><Logo /></div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:pb-0">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link key={href} href={href}
              className={`group relative flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-gradient-to-r from-brand/20 to-transparent text-ink" : "text-muted hover:bg-white/[0.04] hover:text-ink"}`}>
              {active && <span className="absolute top-2 bottom-2 left-0 hidden w-[3px] rounded-full bg-brand md:block" />}
              <Icon size={17} className={active ? "text-brand" : "opacity-70 group-hover:opacity-100"} /> {label}
            </Link>
          );
        })}
      </nav>
      <div className="hidden border-t border-line p-4 md:block">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-brand/40 to-brand-2/30 text-sm font-semibold uppercase">{email[0]}</div>
          <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{email}</div><div className="text-[11px] text-muted">Conectado</div></div>
          <form action="/auth/logout" method="post"><button title="Sair" className="rounded-lg p-2 text-muted transition hover:bg-white/5 hover:text-ink"><LogOut size={16} /></button></form>
        </div>
      </div>
    </aside>
  );
}

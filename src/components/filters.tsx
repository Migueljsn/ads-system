import Link from "next/link";
import { Suspense } from "react";
import { DateRangePicker } from "./date-range-picker";
import { db } from "@/lib/supabase/server";

const PERIODS = [["1", "Hoje"], ["7", "7 dias"], ["14", "14 dias"], ["30", "30 dias"], ["90", "90 dias"]] as const;

/** filtros por GET: atalhos de período + calendário único (since/until) + formulário de plataforma e cliente */
export async function Filters({ sp, extra, path = "/" }: { sp: Record<string, string | undefined>; extra?: React.ReactNode; path?: string }) {
  const { data: clients } = await db().from("clients").select("id, name").order("name");
  const keep = (o: Record<string, string>) => {
    const q = new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v) as [string, string][]);
    return `${path}?${q}`;
  };
  const current = sp.since ? "" : sp.days ?? "7";
  return (
    <div className="mb-6 space-y-3">
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-panel/80 p-1">
        {PERIODS.map(([v, l]) => (
          <Link key={v} href={keep({ days: v, since: "", until: "" })} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${current === v ? "bg-brand text-white shadow shadow-brand/30" : "text-muted hover:text-ink"}`}>{l}</Link>
        ))}
        <Suspense><DateRangePicker since={sp.since} until={sp.until} /></Suspense>
      </div>
      <form action={path} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="days" value={sp.days ?? ""} />
        <input type="hidden" name="since" value={sp.since ?? ""} />
        <input type="hidden" name="until" value={sp.until ?? ""} />
        <div className="min-w-36"><label className="label">Plataforma</label>
          <select name="platform" defaultValue={sp.platform ?? ""} className="input"><option value="">Meta + Google</option><option value="meta">Meta Ads</option><option value="google">Google Ads</option></select></div>
        <div className="min-w-44"><label className="label">Cliente</label>
          <select name="client" defaultValue={sp.client ?? ""} className="input"><option value="">Todos os clientes</option>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        {extra}
        <button className="btn-ghost h-[38px]">Aplicar</button>
      </form>
    </div>
  );
}

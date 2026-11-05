import Link from "next/link";
import { Filters } from "@/components/filters";
import { Bars, PerfTable } from "@/components/perf-table";
import { money, num, pct, when } from "@/lib/format";
import { filtersFrom, type SP } from "@/lib/params";
import { compare, lastRuns, listAccounts, performance } from "@/lib/report";

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const f = filtersFrom(sp);
  const [cmp, daily, campaigns, accounts, runs] = await Promise.all([compare(f, "platform"), performance(f, "day"), performance(f, "campaign"), listAccounts(), lastRuns()]);
  const t = cmp.current.totals;
  const ccy = cmp.current.currencies.length === 1 ? cmp.current.currencies[0] : "BRL";
  const kpis = [
    { label: "Gasto", v: money(t.spend, ccy), c: cmp.change.spend, good: null },
    { label: "Conversões", v: num(t.conversions, 1), c: cmp.change.conversions, good: true },
    { label: "CPA", v: money(t.cpa, ccy), c: cmp.change.cpa, good: false },
    { label: "Valor de conversão", v: money(t.conversionValue, ccy), c: cmp.change.conversionValue, good: true },
    { label: "ROAS", v: t.roas == null ? "—" : `${num(t.roas, 2)}x`, c: cmp.change.roas, good: true },
    { label: "Cliques", v: num(t.clicks), c: cmp.change.clicks, good: true },
    { label: "CTR", v: t.ctr == null ? "—" : `${num(t.ctr, 2)}%`, c: cmp.change.ctr, good: true },
    { label: "CPM", v: money(t.cpm, ccy), c: cmp.change.cpm, good: false },
  ];
  const last = runs[0];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Visão geral</h1>
        <span className="text-xs text-muted">{f.since} → {f.until} · último sync: {last ? `${when(last.finished_at ?? last.started_at)} (${last.status})` : "nunca"}</span>
      </div>
      <Filters sp={sp} />
      {!accounts.length && (
        <div className="card mb-4 border-brand/40">Nenhuma conta conectada ainda. <Link href="/contas" className="text-brand underline">Conectar Meta e Google →</Link></div>
      )}
      {cmp.current.currencies.length > 1 && <p className="mb-2 text-xs text-amber-600">Atenção: contas com moedas diferentes ({cmp.current.currencies.join(", ")}) — totais somados sem conversão.</p>}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => {
          const up = (k.c ?? 0) > 0;
          const color = k.c == null || k.good == null ? "text-muted" : up === k.good ? "text-emerald-500" : "text-red-500";
          return (
            <div key={k.label} className="card">
              <div className="text-xs text-muted">{k.label}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{k.v}</div>
              <div className={`text-xs ${color}`}>{pct(k.c)} vs período anterior</div>
            </div>
          );
        })}
      </div>
      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <div className="card lg:col-span-2"><div className="mb-2 text-sm font-medium">Gasto por dia</div><Bars rows={daily.rows} ccy={ccy} /></div>
        <div className="card"><div className="mb-2 text-sm font-medium">Por plataforma</div>
          {cmp.current.rows.map((r) => (
            <div key={r.key} className="flex justify-between border-b border-line py-2 text-sm last:border-0"><span>{r.label}</span><span className="tabular-nums">{money(r.spend, ccy)} · {num(r.conversions, 1)} conv.</span></div>
          ))}
          {!cmp.current.rows.length && <p className="text-sm text-muted">Sem dados.</p>}
        </div>
      </div>
      <div className="card">
        <div className="mb-2 flex items-center justify-between text-sm font-medium">Top campanhas <Link href={`/campanhas?${new URLSearchParams(sp as Record<string, string>)}`} className="text-xs text-brand">ver todas →</Link></div>
        <PerfTable rows={campaigns.rows.slice(0, 15)} totals={campaigns.totals} ccy={ccy} />
      </div>
    </>
  );
}

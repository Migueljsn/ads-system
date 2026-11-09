import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, DollarSign, MousePointerClick, Percent, Repeat, ShoppingCart, Target, TrendingUp, Eye } from "lucide-react";
import { Filters } from "@/components/filters";
import { PageHeader } from "@/components/page-header";
import { DailyChart, Empty, PerfTable, PlatformBadge } from "@/components/perf-table";
import { money, num, pct, when } from "@/lib/format";
import { filtersFrom, type SP } from "@/lib/params";
import { compare, lastRuns, listAccounts, performance } from "@/lib/report";
import { SuggestionList } from "@/components/suggestions";
import { suggestions } from "@/lib/suggestions";

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const f = filtersFrom(sp);
  const [cmp, daily, campaigns, accounts, runs, sug] = await Promise.all([compare(f, "platform"), performance(f, "day"), performance(f, "campaign"), listAccounts(), lastRuns(), suggestions({ clientId: f.clientId }).catch(() => [])]);
  const t = cmp.current.totals;
  const ccy = cmp.current.currencies.length === 1 ? cmp.current.currencies[0] : "BRL";
  const kpis = [
    { label: "Investimento", v: money(t.spend, ccy), c: cmp.change.spend, good: null, icon: DollarSign },
    { label: "Conversões", v: num(t.conversions, 1), c: cmp.change.conversions, good: true, icon: ShoppingCart },
    { label: "Custo por conversão", v: money(t.cpa, ccy), c: cmp.change.cpa, good: false, icon: Target },
    { label: "ROAS", v: t.roas == null ? "—" : `${num(t.roas, 2)}x`, c: cmp.change.roas, good: true, icon: TrendingUp },
    { label: "Valor de conversão", v: money(t.conversionValue, ccy), c: cmp.change.conversionValue, good: true, icon: Repeat },
    { label: "Cliques", v: num(t.clicks), c: cmp.change.clicks, good: true, icon: MousePointerClick },
    { label: "CTR", v: t.ctr == null ? "—" : `${num(t.ctr, 2)}%`, c: cmp.change.ctr, good: true, icon: Percent },
    { label: "CPM", v: money(t.cpm, ccy), c: cmp.change.cpm, good: false, icon: Eye },
  ];
  const last = runs[0];
  return (
    <>
      <PageHeader title="Visão geral" subtitle={<>{f.since.split("-").reverse().join("/")} — {f.until.split("-").reverse().join("/")} · comparado ao período anterior</>}
        right={<span className="badge border border-line bg-white/[0.03] px-3 py-1.5 font-medium text-muted"><span className={`size-2 rounded-full ${last?.status === "success" ? "bg-good" : last ? "bg-bad" : "bg-muted"}`} />Sincronizado {last ? when(last.finished_at ?? last.started_at) : "nunca"}</span>} />
      <Filters sp={sp} />
      {!accounts.length && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 border-brand/30 bg-gradient-to-r from-brand/15 to-transparent">
          <div><div className="font-semibold">Conecte suas contas de anúncio</div><div className="text-sm text-muted">Ligue o Business Manager da Meta e o Google Ads para os dados aparecerem aqui.</div></div>
          <Link href="/contas" className="btn">Conectar contas</Link>
        </div>
      )}
      {cmp.current.currencies.length > 1 && <p className="mb-3 text-xs text-google">Atenção: contas em moedas diferentes ({cmp.current.currencies.join(", ")}) — totais somados sem conversão.</p>}
      {sug.length > 0 && <SuggestionList items={sug} limit={5} title="Sugestões para hoje" />}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => {
          const up = (k.c ?? 0) > 0;
          const tone = k.c == null || k.good == null || k.c === 0 ? "bg-white/5 text-muted" : up === k.good ? "bg-good/15 text-good" : "bg-bad/15 text-bad";
          const Icon = k.icon;
          return (
            <div key={k.label} className="card group relative overflow-hidden">
              <div className="pointer-events-none absolute -top-10 -right-10 size-28 rounded-full bg-brand/10 blur-2xl transition group-hover:bg-brand/20" />
              <div className="flex items-center justify-between"><span className="text-xs font-medium text-muted">{k.label}</span><Icon size={16} className="text-muted" /></div>
              <div className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{k.v}</div>
              <span className={`badge mt-2 ${tone}`}>{k.c != null && (up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />)}{pct(k.c)}</span>
            </div>
          );
        })}
      </div>
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2"><div className="card-title">Investimento × conversões por dia</div><DailyChart rows={daily.rows} ccy={ccy} /></div>
        <div className="card">
          <div className="card-title">Por plataforma</div>
          {cmp.current.rows.length ? cmp.current.rows.map((r) => {
            const share = t.spend ? (r.spend / t.spend) * 100 : 0;
            return (
              <div key={r.key} className="mb-5 last:mb-0">
                <div className="mb-2 flex items-center justify-between"><PlatformBadge p={r.key} /><span className="text-sm font-semibold tabular-nums">{money(r.spend, ccy)}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5"><div className={`h-full rounded-full ${r.key === "meta" ? "bg-meta" : "bg-google"}`} style={{ width: `${share}%` }} /></div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted">
                  <div><div className="text-ink tabular-nums">{num(r.conversions, 1)}</div>conversões</div>
                  <div><div className="text-ink tabular-nums">{money(r.cpa, ccy)}</div>CPA</div>
                  <div><div className="text-ink tabular-nums">{r.roas == null ? "—" : `${num(r.roas, 2)}x`}</div>ROAS</div>
                </div>
              </div>
            );
          }) : <Empty text="Sem dados." />}
        </div>
      </div>
      <div className="card">
        <div className="mb-3 flex items-center justify-between"><div className="card-title mb-0">Principais campanhas</div><Link href={`/campanhas?${new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][])}`} className="text-sm text-brand hover:underline">Ver todas →</Link></div>
        <PerfTable rows={campaigns.rows.slice(0, 12)} totals={campaigns.totals} ccy={ccy} />
      </div>
    </>
  );
}

import { Filters } from "@/components/filters";
import { PageHeader } from "@/components/page-header";
import { Empty, PlatformBadge } from "@/components/perf-table";
import { money, num } from "@/lib/format";
import { filtersFrom, type SP } from "@/lib/params";
import { SuggestionBadge, SuggestionList } from "@/components/suggestions";
import { suggestions } from "@/lib/suggestions";
import { crmPipeline, crmResults, trackingEnabled } from "@/lib/tracking";

export default async function Crm({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const f = filtersFrom(sp);
  if (!trackingEnabled()) return (<><PageHeader title="Resultados no CRM" /><Empty text="Defina TRACKING_DATABASE_URL para ligar o tracking (Fonil CRM)." /></>);
  const [res, pipe, sug] = await Promise.all([crmResults({ since: f.since, until: f.until, clientId: f.clientId }), crmPipeline({ since: f.since, until: f.until, clientId: f.clientId }), suggestions({ since: f.since, until: f.until, clientId: f.clientId })]);
  const forCamp = (clientId: string, campanha: string) => sug.filter((s) => s.clientId === clientId && s.campanha === campanha);
  const forClient = (clientId: string) => sug.filter((s) => s.clientId === clientId && !s.campanha);
  const x = (n: number | null) => (n == null ? "—" : `${num(n, 2)}x`);
  const p = (n: number | null) => (n == null ? "—" : `${num(n, 1)}%`);
  return (
    <>
      <PageHeader title="Resultados no CRM" subtitle={<>{f.since.split("-").reverse().join("/")} — {f.until.split("-").reverse().join("/")} · gasto em anúncios × leads e vendas reais do Fonil CRM</>} />
      <Filters sp={sp} path="/crm" />
      <SuggestionList items={sug} />
      <div className="card mb-6 overflow-x-auto">
        <div className="card-title">Por cliente</div>
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-xs text-muted"><tr>
            <th className="py-2 pr-3">Cliente</th><th className="pr-3 text-right">Gasto</th><th className="pr-3 text-right">Leads</th><th className="pr-3 text-right">CPL</th>
            <th className="pr-3 text-right">Vendas</th><th className="pr-3 text-right">Conversão</th><th className="pr-3 text-right">Faturamento</th><th className="pr-3 text-right">Custo/venda</th><th className="pr-3 text-right">ROAS real</th><th className="text-right">Leads c/ campanha</th>
          </tr></thead>
          <tbody>{res.clientes.map((c) => (
            <tr key={c.clientId} className="border-t border-line">
              <td className="py-2 pr-3 font-medium">{c.cliente}{forClient(c.clientId).map((s) => <SuggestionBadge key={s.key} s={s} />)}</td><td className="pr-3 text-right">{money(c.gasto)}</td><td className="pr-3 text-right">{num(c.leads)}</td><td className="pr-3 text-right">{money(c.cpl)}</td>
              <td className="pr-3 text-right">{num(c.vendas)}{c.recompras ? <span className="text-muted"> ({c.recompras} rec.)</span> : null}</td><td className="pr-3 text-right">{p(c.taxaConversao)}</td>
              <td className="pr-3 text-right">{money(c.faturamento)}</td><td className="pr-3 text-right">{money(c.custoPorVenda)}</td><td className="pr-3 text-right">{x(c.roas)}</td>
              <td className={`text-right ${c.leadsComCampanhaPct != null && c.leadsComCampanhaPct < 50 ? "text-bad" : ""}`}>{p(c.leadsComCampanhaPct)}</td>
            </tr>))}</tbody>
        </table>
        <p className="mt-3 text-xs text-muted">{res.observacao} &quot;Leads c/ campanha&quot; abaixo de 50% indica UTM/tracking faltando nos anúncios.</p>
      </div>
      {res.clientes.filter((c) => c.campanhas.length).map((c) => (
        <div key={c.clientId} className="card mb-4 overflow-x-auto">
          <div className="card-title">{c.cliente} · campanhas</div>
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-xs text-muted"><tr><th className="py-2 pr-3">Campanha</th><th className="pr-3 text-right">Gasto</th><th className="pr-3 text-right">Leads (plataforma)</th><th className="pr-3 text-right">Leads (CRM)</th><th className="pr-3 text-right">CPL real</th><th className="pr-3 text-right">Vendas</th><th className="pr-3 text-right">Faturamento</th><th className="text-right">ROAS real</th></tr></thead>
            <tbody>{c.campanhas.map((r) => (
              <tr key={r.campanha} className="border-t border-line">
                <td className="py-2 pr-3"><span className="mr-2"><PlatformBadge p={r.plataforma} /></span>{r.campanha}{forCamp(c.clientId, r.campanha).map((s) => <SuggestionBadge key={s.key} s={s} />)}</td><td className="pr-3 text-right">{money(r.gasto)}</td><td className="pr-3 text-right">{num(r.leadsAnuncio)}</td>
                <td className="pr-3 text-right">{num(r.leadsCRM)}</td><td className="pr-3 text-right">{money(r.cplCRM)}</td><td className="pr-3 text-right">{num(r.vendas)}</td><td className="pr-3 text-right">{money(r.faturamento)}</td><td className="text-right">{x(r.roasReal)}</td>
              </tr>))}</tbody>
          </table>
        </div>
      ))}
      <div className="grid gap-4 lg:grid-cols-2">
        {pipe.filter((c) => c.funil.length).map((c) => (
          <div key={c.clientId} className="card">
            <div className="card-title">{c.cliente} · funil agora</div>
            {c.funil.map((s) => <div key={s.etapa} className="flex justify-between border-t border-line py-1.5 text-sm first:border-0"><span>{s.etapa}</span><span className="tabular-nums">{num(s.leads)}</span></div>)}
            {c.motivosDePerda.length > 0 && <div className="mt-3 text-xs text-muted">Perdas no período: {c.motivosDePerda.slice(0, 4).map((m) => `${m.motivo} (${m.leads})`).join(" · ")}</div>}
          </div>
        ))}
      </div>
    </>
  );
}

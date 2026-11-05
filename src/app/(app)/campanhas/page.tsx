import { Filters } from "@/components/filters";
import { PageHeader } from "@/components/page-header";
import { PerfTable } from "@/components/perf-table";
import { filtersFrom, type SP } from "@/lib/params";
import { performance, type GroupBy } from "@/lib/report";

const LEVELS: { v: GroupBy; l: string }[] = [
  { v: "campaign", l: "Campanha" }, { v: "group", l: "Conjunto / grupo" }, { v: "ad", l: "Anúncio" }, { v: "account", l: "Conta" }, { v: "client", l: "Cliente" }, { v: "day", l: "Dia" },
];

export default async function Campaigns({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const level = (LEVELS.find((l) => l.v === sp.level)?.v ?? "campaign") as GroupBy;
  const r = await performance(filtersFrom(sp), level);
  const ccy = r.currencies.length === 1 ? r.currencies[0] : "BRL";
  return (
    <>
      <PageHeader title="Campanhas" subtitle="Desempenho detalhado por campanha, conjunto, anúncio, conta ou cliente." />
      <Filters sp={sp} path="/campanhas" extra={<>
        <div className="min-w-40"><label className="label">Agrupar por</label><select name="level" defaultValue={level} className="input">{LEVELS.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}</select></div>
        <div><label className="label">Buscar</label><input name="q" defaultValue={sp.q} placeholder="nome da campanha" className="input" /></div>
      </>} />
      <div className="card"><PerfTable rows={r.rows} totals={r.totals} ccy={ccy} /></div>
      <p className="mt-3 text-xs text-muted">{r.rows.length} linhas · Na Meta, conversões = compras + leads + conversas iniciadas; no Google, conversões da conta.</p>
    </>
  );
}

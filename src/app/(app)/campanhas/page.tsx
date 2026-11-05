import { Filters } from "@/components/filters";
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
      <h1 className="mb-4 text-xl font-semibold">Campanhas</h1>
      <Filters sp={sp} extra={<>
        <div><label className="label">Nível</label><select name="level" defaultValue={level} className="input">{LEVELS.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}</select></div>
        <div><label className="label">Busca</label><input name="q" defaultValue={sp.q} placeholder="nome da campanha" className="input" /></div>
      </>} />
      <div className="card"><PerfTable rows={r.rows} totals={r.totals} ccy={ccy} /></div>
      <p className="mt-2 text-xs text-muted">{r.rows.length} linhas · Conversões Meta = compras + leads + conversas iniciadas; Google = conversões da conta.</p>
    </>
  );
}

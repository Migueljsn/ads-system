import type { Row } from "@/lib/report";
import { money, num } from "@/lib/format";

export function PlatformBadge({ p }: { p?: string }) {
  if (!p) return null;
  return <span className={`badge mr-2 ${p === "meta" ? "bg-meta/15 text-meta" : "bg-google/15 text-google"}`}><span className={`size-1.5 rounded-full ${p === "meta" ? "bg-meta" : "bg-google"}`} />{p === "meta" ? "Meta" : "Google"}</span>;
}

export function PerfTable({ rows, totals, ccy = "BRL", showPlatform = true }: { rows: Row[]; totals?: Row; ccy?: string; showPlatform?: boolean }) {
  if (!rows.length) return <Empty text="Sem dados no período." />;
  const maxSpend = Math.max(...rows.map((r) => r.spend), 1);
  const line = (r: Row, total = false) => (
    <tr key={r.key} className={total ? "total" : ""}>
      <td className="max-w-[360px]">
        <div className="flex items-center truncate" title={r.label}>{showPlatform && !total && <PlatformBadge p={r.platform} />}<span className="truncate">{r.label}</span></div>
        {!total && (r.campaign || r.account) && <div className="truncate text-xs text-muted">{r.campaign ?? r.account}</div>}
      </td>
      <td className="n">
        <div>{money(r.spend, ccy)}</div>
        {!total && <div className="mt-1 ml-auto h-1 w-20 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-2" style={{ width: `${(r.spend / maxSpend) * 100}%` }} /></div>}
      </td>
      <td className="n">{num(r.impressions)}</td><td className="n">{num(r.clicks)}</td>
      <td className="n">{r.ctr == null ? "—" : `${num(r.ctr, 2)}%`}</td><td className="n">{money(r.cpc, ccy)}</td><td className="n">{money(r.cpm, ccy)}</td>
      <td className="n font-medium">{num(r.conversions, 1)}</td><td className="n">{money(r.cpa, ccy)}</td><td className="n">{num(r.leads)}</td><td className="n">{num(r.messages)}</td>
      <td className="n">{money(r.conversionValue, ccy)}</td>
      <td className="n">{r.roas == null ? "—" : <span className={`badge ${r.roas >= 1 ? "bg-good/15 text-good" : "bg-bad/15 text-bad"}`}>{num(r.roas, 2)}x</span>}</td>
    </tr>
  );
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="t">
        <thead><tr><th className="pl-5">Nome</th><th className="n">Gasto</th><th className="n">Impressões</th><th className="n">Cliques</th><th className="n">CTR</th><th className="n">CPC</th><th className="n">CPM</th><th className="n">Conv.</th><th className="n">CPA</th><th className="n">Leads</th><th className="n">Conversas</th><th className="n">Valor</th><th className="n pr-5">ROAS</th></tr></thead>
        <tbody>{rows.map((r) => line(r))}{totals && line(totals, true)}</tbody>
      </table>
    </div>
  );
}

export function Empty({ text, children }: { text: string; children?: React.ReactNode }) {
  return <div className="grid place-items-center rounded-xl border border-dashed border-line py-10 text-center text-sm text-muted">{text}{children}</div>;
}

/** gasto (barras) e conversões (linha) por dia */
export function DailyChart({ rows, ccy = "BRL" }: { rows: Row[]; ccy?: string }) {
  if (!rows.length) return <Empty text="Sem dados no período." />;
  const W = 800, H = 220, P = 28;
  const maxS = Math.max(...rows.map((r) => r.spend), 1);
  const maxC = Math.max(...rows.map((r) => r.conversions), 1);
  const bw = (W - P * 2) / rows.length;
  const x = (i: number) => P + i * bw + bw / 2;
  const yS = (v: number) => H - P - (v / maxS) * (H - P * 2);
  const yC = (v: number) => H - P - (v / maxC) * (H - P * 2);
  const line = rows.map((r, i) => `${i ? "L" : "M"}${x(i)},${yC(r.conversions)}`).join(" ");
  const step = Math.ceil(rows.length / 10);
  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-muted"><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand" />Gasto</span><span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-brand-2" />Conversões</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" preserveAspectRatio="none">
        <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#7c5cff" stopOpacity=".95" /><stop offset="1" stopColor="#7c5cff" stopOpacity=".25" /></linearGradient></defs>
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={P} x2={W - P} y1={H - P - f * (H - P * 2)} y2={H - P - f * (H - P * 2)} stroke="rgba(255,255,255,.06)" strokeDasharray="3 4" />)}
        {rows.map((r, i) => (
          <g key={r.key}>
            <rect x={x(i) - bw * 0.32} y={yS(r.spend)} width={bw * 0.64} height={Math.max(1, H - P - yS(r.spend))} rx={3} fill="url(#g)"><title>{`${r.key}\nGasto: ${money(r.spend, ccy)}\nConversões: ${num(r.conversions, 1)}`}</title></rect>
            {i % step === 0 && <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#8b90a3">{r.key.slice(8)}/{r.key.slice(5, 7)}</text>}
          </g>
        ))}
        <path d={line} fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {rows.map((r, i) => <circle key={r.key} cx={x(i)} cy={yC(r.conversions)} r="2.5" fill="#22d3ee" />)}
      </svg>
    </div>
  );
}

import type { Row } from "@/lib/report";
import { money, num } from "@/lib/format";

export function PerfTable({ rows, totals, ccy = "BRL", showPlatform = true }: { rows: Row[]; totals?: Row; ccy?: string; showPlatform?: boolean }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">Sem dados no período.</p>;
  const line = (r: Row, bold = false) => (
    <tr key={r.key} className={bold ? "font-semibold" : ""}>
      <td className="max-w-[340px] truncate" title={r.label}>
        {showPlatform && r.platform && <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${r.platform === "meta" ? "bg-blue-500/15 text-blue-500" : "bg-amber-500/15 text-amber-600"}`}>{r.platform}</span>}
        {r.label}
        {(r.campaign || r.account) && <div className="truncate text-xs text-muted">{r.campaign ?? r.account}</div>}
      </td>
      <td className="n">{money(r.spend, ccy)}</td><td className="n">{num(r.impressions)}</td><td className="n">{num(r.clicks)}</td>
      <td className="n">{r.ctr == null ? "—" : `${num(r.ctr, 2)}%`}</td><td className="n">{money(r.cpc, ccy)}</td><td className="n">{money(r.cpm, ccy)}</td>
      <td className="n">{num(r.conversions, 1)}</td><td className="n">{money(r.cpa, ccy)}</td><td className="n">{num(r.leads)}</td><td className="n">{num(r.messages)}</td>
      <td className="n">{money(r.conversionValue, ccy)}</td><td className="n">{r.roas == null ? "—" : `${num(r.roas, 2)}x`}</td>
    </tr>
  );
  return (
    <div className="overflow-x-auto">
      <table className="t">
        <thead><tr><th>Nome</th><th className="n">Gasto</th><th className="n">Impr.</th><th className="n">Cliques</th><th className="n">CTR</th><th className="n">CPC</th><th className="n">CPM</th><th className="n">Conv.</th><th className="n">CPA</th><th className="n">Leads</th><th className="n">Conversas</th><th className="n">Valor</th><th className="n">ROAS</th></tr></thead>
        <tbody>{rows.map((r) => line(r))}{totals && line(totals, true)}</tbody>
      </table>
    </div>
  );
}

export function Bars({ rows, ccy = "BRL" }: { rows: Row[]; ccy?: string }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.spend), 1);
  return (
    <div className="flex h-40 items-end gap-1">
      {rows.map((r) => (
        <div key={r.key} className="group relative flex h-full flex-1 flex-col justify-end" title={`${r.key}: ${money(r.spend, ccy)} · ${num(r.conversions, 1)} conv.`}>
          <div className="rounded-t bg-brand/80 group-hover:bg-brand" style={{ height: `${Math.max(2, (r.spend / max) * 100)}%` }} />
          {rows.length <= 31 && <div className="mt-1 text-center text-[10px] text-muted">{r.key.slice(8)}</div>}
        </div>
      ))}
    </div>
  );
}

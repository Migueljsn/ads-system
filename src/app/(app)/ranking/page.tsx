import Link from "next/link";
import { Trophy, Clock, AlertTriangle, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { syncTeamTasks } from "@/app/(app)/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/perf-table";
import { dayBR, daysAgo } from "@/lib/dates";
import { money, num, when } from "@/lib/format";
import { type SP } from "@/lib/params";
import { ranking, taskImpact } from "@/lib/tasks";

const PERIODS = { semana: "Esta semana", mes: "Este mês", "30d": "Últimos 30 dias" } as const;
function period(p: string | undefined) {
  const today = dayBR();
  if (p === "mes") return { since: `${today.slice(0, 7)}-01`, until: today };
  if (p === "30d") return { since: daysAgo(29), until: today };
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // segunda = 0
  return { since: daysAgo(dow), until: today };
}
// medalha em CSS (emoji vira um quadrado em TVs sem fonte de emoji)
const MEDAL_COLORS = [
  ["#fde68a", "#d97706"],
  ["#e5e7eb", "#6b7280"],
  ["#fed7aa", "#b45309"],
];
function Medal({ i, size = 28 }: { i: number; size?: number }) {
  const c = MEDAL_COLORS[i];
  if (!c) return <span className="tabular-nums">{i + 1}</span>;
  return (
    <span title={`${i + 1}º lugar`} className="inline-grid shrink-0 place-items-center rounded-full font-bold text-black/80"
      style={{ width: size, height: size, fontSize: size * 0.5, background: `radial-gradient(circle at 35% 30%, ${c[0]}, ${c[1]})`, boxShadow: `0 0 0 2px ${c[1]}55` }}>
      {i + 1}
    </span>
  );
}

export default async function Ranking({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const p = (sp.p as keyof typeof PERIODS) in PERIODS ? (sp.p as keyof typeof PERIODS) : "semana";
  const { since, until } = period(p);
  const [rk, impact] = await Promise.all([ranking(since, until), taskImpact({ since: daysAgo(29), until: dayBR() })]);
  const Delta = ({ v, good }: { v: number | null; good: boolean }) => v == null ? <span className="text-muted">—</span> : (
    <span className={`inline-flex items-center gap-0.5 ${(v > 0) === good ? "text-good" : v === 0 ? "text-muted" : "text-bad"}`}>{v > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{num(Math.abs(v), 1)}%</span>);
  return (
    <>
      <PageHeader title="Ranking da equipe" subtitle={<>{since.split("-").reverse().join("/")} — {until.split("-").reverse().join("/")} · tarefas concluídas no ClickUp</>}
        right={<span className="text-xs text-muted">ClickUp sincronizado {when(rk.sincronizadoEm as string | null)}</span>} />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {Object.entries(PERIODS).map(([k, label]) => <Link key={k} href={`/ranking?p=${k}`} className={`badge border px-3 py-1.5 ${k === p ? "border-brand bg-brand/15 text-ink" : "border-line text-muted hover:text-ink"}`}>{label}</Link>)}
        <div className="ml-auto"><ActionForm action={syncTeamTasks} submit="Sincronizar ClickUp agora"><span /></ActionForm></div>
      </div>
      {!rk.ranking.length ? <Empty text="Nenhuma tarefa concluída no período (ou o ClickUp ainda não foi sincronizado)." /> : (
        <>
          <div className="mb-6 grid gap-3 md:grid-cols-3">
            {rk.ranking.slice(0, 3).map((r, i) => (
              <div key={r.id} className={`card relative overflow-hidden ${i === 0 ? "border-brand/50 bg-gradient-to-br from-brand/20 to-transparent" : ""}`}>
                <div className="flex items-center justify-between"><Medal i={i} size={40} /><span className="text-3xl font-bold tabular-nums">{num(r.pontos)}<span className="ml-1 text-sm font-normal text-muted">pts</span></span></div>
                <div className="mt-2 text-lg font-semibold">{r.nome}</div>
                <div className="mt-1 text-xs text-muted">{r.entregas} entregas · {r.pctNoPrazo == null ? "sem prazo" : `${r.pctNoPrazo}% no prazo`}{r.atrasadasAbertas ? ` · ${r.atrasadasAbertas} atrasadas` : ""}</div>
              </div>
            ))}
          </div>
          <div className="card mb-6 overflow-x-auto">
            <div className="card-title flex items-center gap-2"><Trophy size={16} className="text-brand" />Classificação</div>
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-xs text-muted"><tr><th className="py-2 pr-3">#</th><th className="pr-3">Pessoa</th><th className="pr-3 text-right">Pontos</th><th className="pr-3 text-right">Entregas</th><th className="pr-3 text-right"><Clock size={12} className="inline" /> No prazo</th><th className="pr-3 text-right"><AlertTriangle size={12} className="inline" /> Atrasadas abertas</th><th className="pr-3">Áreas</th><th>Últimas entregas</th></tr></thead>
              <tbody>{rk.ranking.map((r, i) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="py-2 pr-3"><Medal i={i} size={24} /></td><td className="pr-3 font-medium">{r.nome}</td><td className="pr-3 text-right font-semibold">{num(r.pontos)}</td><td className="pr-3 text-right">{r.entregas}</td>
                  <td className="pr-3 text-right">{r.pctNoPrazo == null ? "—" : `${r.pctNoPrazo}%`}</td><td className={`pr-3 text-right ${r.atrasadasAbertas ? "text-bad" : ""}`}>{r.atrasadasAbertas}</td>
                  <td className="pr-3 text-xs text-muted">{Object.entries(r.porArea).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} (${n})`).join(" · ")}</td>
                  <td className="text-xs">{r.ultimas.map((u) => <div key={u.url}><a href={u.url} target="_blank" rel="noreferrer" className="hover:text-brand">{u.tarefa}</a> <span className="text-muted">+{u.pontos}</span></div>)}</td>
                </tr>))}</tbody>
            </table>
            <p className="mt-3 text-xs text-muted">Pontuação: {rk.regras.join(" · ")}.</p>
          </div>
        </>
      )}
      <div className="card overflow-x-auto">
        <div className="card-title">O que cada entrega mudou no cliente <span className="text-xs font-normal text-muted">(últimos 30 dias · {impact.janelaDias} dias antes × depois)</span></div>
        {!impact.tarefas.length ? <Empty text="Nenhuma entrega ligada a cliente no período." /> : (
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-xs text-muted"><tr><th className="py-2 pr-3">Entrega</th><th className="pr-3">Cliente</th><th className="pr-3">Quem</th><th className="pr-3 text-right">Leads antes → depois</th><th className="pr-3 text-right">CPL antes → depois</th><th className="pr-3 text-right">Vendas</th><th className="text-right">Faturamento</th></tr></thead>
            <tbody>{impact.tarefas.map((t) => (
              <tr key={t.url} className="border-t border-line">
                <td className="py-2 pr-3"><a href={t.url} target="_blank" rel="noreferrer" className="hover:text-brand">{t.tarefa}</a><div className="text-xs text-muted">{t.concluidaEm.split("-").reverse().join("/")}{!t.completo && ` · parcial: ${t.diasDepois}×${t.diasDepois} dias (completa em ${impact.janelaDias})`}</div></td>
                <td className="pr-3">{t.cliente}</td><td className="pr-3 text-xs">{t.responsaveis.join(", ")}</td>
                <td className="pr-3 text-right">{t.antes.leads} → {t.depois.leads} <Delta v={t.variacao.leads} good /></td>
                <td className="pr-3 text-right">{money(t.antes.cpl)} → {money(t.depois.cpl)} <Delta v={t.variacao.cpl} good={false} /></td>
                <td className="pr-3 text-right">{t.antes.vendas} → {t.depois.vendas} <Delta v={t.variacao.vendas} good /></td>
                <td className="text-right">{money(t.antes.faturamento)} → {money(t.depois.faturamento)} <Delta v={t.variacao.faturamento} good /></td>
              </tr>))}</tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-muted">{impact.observacao ?? ""}</p>
      </div>
    </>
  );
}

import Link from "next/link";
import { AlertTriangle, Clock, Users } from "lucide-react";
import { syncTeamTasks } from "@/app/(app)/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/perf-table";
import { dayBR, daysAgo } from "@/lib/dates";
import { num } from "@/lib/format";
import { hoursReport } from "@/lib/hours";
import { type SP } from "@/lib/params";

const PERIODS = { semana: "Esta semana", passada: "Semana passada", mes: "Este mês", "30d": "Últimos 30 dias" } as const;
function period(p: string | undefined) {
  const today = dayBR();
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // segunda = 0
  if (p === "mes") return { since: `${today.slice(0, 7)}-01`, until: today };
  if (p === "30d") return { since: daysAgo(29), until: today };
  if (p === "passada") return { since: daysAgo(dow + 7), until: daysAgo(dow + 1) };
  return { since: daysAgo(dow), until: today };
}
const h = (n: number) => `${num(n, 1)}h`;
const br = (d: string) => d.split("-").reverse().slice(0, 2).join("/");

export default async function Horas({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const p = (sp.p as keyof typeof PERIODS) in PERIODS ? (sp.p as keyof typeof PERIODS) : "semana";
  const { since, until } = period(p);
  const r = await hoursReport(since, until);
  const max = Math.max(1, ...r.pessoas.map((x) => x.horas));
  return (
    <>
      <PageHeader title="Horas da equipe" subtitle={<>{br(since)} — {br(until)} · registros de tempo do ClickUp, atribuídos ao responsável da tarefa</>} />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {Object.entries(PERIODS).map(([k, label]) => <Link key={k} href={`/horas?p=${k}`} className={`badge border px-3 py-1.5 ${k === p ? "border-brand bg-brand/15 text-ink" : "border-line text-muted hover:text-ink"}`}>{label}</Link>)}
        <div className="ml-auto"><ActionForm action={syncTeamTasks} submit="Sincronizar ClickUp agora"><span /></ActionForm></div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="card"><div className="text-xs text-muted">Horas registradas</div><div className="mt-1 text-3xl font-bold tabular-nums">{h(r.totalHoras)}</div><div className="text-xs text-muted">{r.registros} registros</div></div>
        <div className={`card ${r.cobertura.pct != null && r.cobertura.pct < 80 ? "border-bad/40" : ""}`}><div className="text-xs text-muted">Concluídas com tempo lançado</div><div className={`mt-1 text-3xl font-bold tabular-nums ${r.cobertura.pct != null && r.cobertura.pct < 80 ? "text-bad" : "text-good"}`}>{r.cobertura.pct == null ? "—" : `${r.cobertura.pct}%`}</div><div className="text-xs text-muted">{r.cobertura.comTempo} de {r.cobertura.concluidas} tarefas · meta 100%</div></div>
        <div className="card"><div className="text-xs text-muted">Média por entrega com tempo</div><div className="mt-1 text-3xl font-bold tabular-nums">{r.cobertura.comTempo ? h(r.totalHoras / r.cobertura.comTempo) : "—"}</div><div className="text-xs text-muted">horas do período ÷ entregas com tempo</div></div>
      </div>

      <div className="card mb-6 overflow-x-auto">
        <div className="card-title flex items-center gap-2"><Users size={16} className="text-brand" />Por pessoa</div>
        {!r.pessoas.length ? <Empty text="Nenhum registro de tempo nem tarefa concluída no período." /> : (
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-xs text-muted"><tr><th className="py-2 pr-3">Pessoa</th><th className="pr-3">Horas</th><th className="pr-3 text-right">Concluídas</th><th className="pr-3 text-right">Com tempo</th><th className="pr-3 text-right">Cobertura</th><th className="pr-3">Por cliente</th><th>Por dia</th></tr></thead>
            <tbody>{r.pessoas.map((x) => (
              <tr key={x.nome} className="border-t border-line align-top">
                <td className="py-2 pr-3 font-medium">{x.nome}</td>
                <td className="pr-3"><div className="flex items-center gap-2"><div className="h-2 rounded bg-brand" style={{ width: `${Math.max(2, (x.horas / max) * 120)}px` }} /><span className="font-semibold">{h(x.horas)}</span></div></td>
                <td className="pr-3 text-right">{x.concluidas}</td><td className="pr-3 text-right">{x.concluidasComTempo}</td>
                <td className={`pr-3 text-right font-semibold ${x.coberturaPct == null ? "text-muted" : x.coberturaPct < 80 ? "text-bad" : "text-good"}`}>{x.coberturaPct == null ? "—" : `${x.coberturaPct}%`}</td>
                <td className="pr-3 text-xs text-muted">{x.porCliente.map((c) => `${c.cliente} ${h(c.horas)}`).join(" · ") || "—"}</td>
                <td className="text-xs text-muted">{x.porDia.map((d) => `${br(d.dia)} ${h(d.horas)}`).join(" · ") || "—"}</td>
              </tr>))}</tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-muted">{r.regra}</p>
      </div>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <div className="card overflow-x-auto">
          <div className="card-title flex items-center gap-2"><Clock size={16} className="text-brand" />Por cliente</div>
          {!r.porCliente.length ? <Empty text="Sem horas no período." /> : (
            <table className="w-full text-sm tabular-nums"><tbody>{r.porCliente.map((c) => <tr key={c.nome} className="border-t border-line"><td className="py-2 pr-3">{c.nome}</td><td className="text-right font-semibold">{h(c.horas)}</td></tr>)}</tbody></table>
          )}
        </div>
        <div className="card overflow-x-auto">
          <div className="card-title">Tarefas que mais consumiram tempo</div>
          {!r.topTarefas.length ? <Empty text="Sem horas no período." /> : (
            <table className="w-full text-sm tabular-nums"><tbody>{r.topTarefas.map((t, i) => (
              <tr key={i} className="border-t border-line"><td className="py-2 pr-3">{t.url ? <a href={t.url} target="_blank" rel="noreferrer" className="hover:text-brand">{t.tarefa}</a> : t.tarefa}<div className="text-xs text-muted">{t.cliente} · {t.responsaveis.join(", ")}</div></td><td className="text-right font-semibold">{h(t.horas)}</td></tr>))}</tbody></table>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="card-title flex items-center gap-2"><AlertTriangle size={16} className="text-bad" />Concluídas sem tempo lançado <span className="text-xs font-normal text-muted">(cobrar na daily)</span></div>
        {!r.pessoas.some((x) => x.semTempo.length) ? <Empty text="Todas as tarefas concluídas no período têm tempo lançado. 🎉" /> : (
          <div className="grid gap-4 md:grid-cols-2">{r.pessoas.filter((x) => x.semTempo.length).map((x) => (
            <div key={x.nome}><div className="mb-1 text-sm font-semibold">{x.nome} <span className="font-normal text-muted">({x.semTempo.length})</span></div>
              <ul className="space-y-1 text-xs">{x.semTempo.slice(0, 15).map((t) => <li key={t.url}><a href={t.url} target="_blank" rel="noreferrer" className="hover:text-brand">{t.tarefa}</a> <span className="text-muted">· {br(t.concluidaEm)}</span></li>)}</ul>
              {x.semTempo.length > 15 && <div className="mt-1 text-xs text-muted">+{x.semTempo.length - 15} tarefas</div>}
            </div>))}</div>
        )}
        <p className="mt-3 text-xs text-muted">{r.cobertura.obs}</p>
      </div>
    </>
  );
}

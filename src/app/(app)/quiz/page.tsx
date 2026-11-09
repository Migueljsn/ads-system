import { Filters } from "@/components/filters";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/perf-table";
import { SuggestionBadge, SuggestionList } from "@/components/suggestions";
import { money, num } from "@/lib/format";
import { filtersFrom, type SP } from "@/lib/params";
import { quizEnabled, quizResults } from "@/lib/quiz";
import { suggestions } from "@/lib/suggestions";

const QUIZ_TIPOS = new Set(["abandono", "quizcrm", "quizparado"]);
const p = (n: number | null) => (n == null ? "—" : `${num(n, 1)}%`);
const d = (s: string | null) => (s ? s.split("-").reverse().join("/") : "—");

export default async function Quiz({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const f = filtersFrom(sp);
  if (!quizEnabled()) return (<><PageHeader title="Quizzes" /><Empty text="Defina QUIZ_DATABASE_URL para ligar o QuizzBuilder." /></>);
  const [res, sug] = await Promise.all([quizResults({ since: f.since, until: f.until, clientId: f.clientId }), suggestions({ since: f.since, until: f.until, clientId: f.clientId })]);
  const qs = sug.filter((s) => QUIZ_TIPOS.has(s.tipo));
  const rows = res.clientes.flatMap((c) => c.quizzes.map((q) => ({ c, q })));
  return (
    <>
      <PageHeader title="Quizzes" subtitle={<>{d(f.since)} — {d(f.until)} · visitantes, leads, CPL e funil dos quizzes do QuizzBuilder</>} />
      <Filters sp={sp} path="/quiz" />
      <SuggestionList items={qs} />
      <div className="card mb-6 overflow-x-auto">
        <div className="card-title">Por quiz</div>
        {rows.length === 0 ? <Empty text="Nenhum quiz com visitas ou leads no período." /> : (
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-xs text-muted"><tr>
              <th className="py-2 pr-3">Cliente · quiz</th><th className="pr-3 text-right">Visitantes</th><th className="pr-3 text-right">Leads</th><th className="pr-3 text-right">Conversão</th>
              <th className="pr-3 text-right">Gasto</th><th className="pr-3 text-right">CPL do quiz</th><th className="pr-3 text-right">Leads c/ campanha</th><th className="text-right">Último lead</th>
            </tr></thead>
            <tbody>{rows.map(({ c, q }) => (
              <tr key={q.slug} className="border-t border-line">
                <td className="py-2 pr-3"><span className="text-muted">{c.cliente} · </span><span className="font-medium">{q.quiz}</span>{qs.filter((s) => s.key.includes(`:${q.slug}:`)).map((s) => <SuggestionBadge key={s.key} s={s} />)}</td>
                <td className="pr-3 text-right">{num(q.visitantes)}</td><td className="pr-3 text-right">{num(q.leads)}</td><td className="pr-3 text-right">{p(q.conversao)}</td>
                <td className="pr-3 text-right">{money(q.gasto)}</td><td className="pr-3 text-right">{money(q.cplQuiz)}</td>
                <td className={`pr-3 text-right ${q.leadsComCampanhaPct != null && q.leadsComCampanhaPct < 50 ? "text-bad" : ""}`}>{p(q.leadsComCampanhaPct)}</td><td className="text-right">{d(q.ultimoLead)}</td>
              </tr>))}</tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-muted">{res.observacao}</p>
      </div>
      {rows.map(({ c, q }) => (
        <div key={q.slug} className="mb-4 grid gap-4 lg:grid-cols-2">
          <div className="card">
            <div className="card-title">{c.cliente} · {q.quiz} · funil</div>
            {q.funil.map((s) => {
              const w = q.funil[0]?.sessoes ? Math.max(2, (s.sessoes / q.funil[0].sessoes) * 100) : 0;
              const bad = (s.queda ?? 0) >= 40;
              return (
                <div key={`${s.etapa}-${s.nome}`} className="border-t border-line py-1.5 text-sm first:border-0">
                  <div className="flex justify-between gap-3"><span className="truncate">{s.etapa}. {s.nome}{s.formulario ? <span className="ml-1 text-xs text-muted">(formulário)</span> : null}</span>
                    <span className="shrink-0 tabular-nums">{num(s.sessoes)}{s.queda != null && <span className={`ml-2 text-xs ${bad ? "text-bad" : "text-muted"}`}>−{num(s.queda, 1)}%</span>}</span></div>
                  <div className="mt-1 h-1.5 rounded bg-line"><div className={`h-1.5 rounded ${bad ? "bg-bad" : "bg-brand"}`} style={{ width: `${w}%` }} /></div>
                </div>
              );
            })}
            {q.campanhas.length > 0 && <div className="mt-3 text-xs text-muted">Campanhas: {q.campanhas.slice(0, 3).map((r) => `${r.campanha} — ${num(r.leadsQuiz)} leads, CPL ${money(r.cplQuiz)}`).join(" · ")}</div>}
          </div>
          <div className="card">
            <div className="card-title">Perfil dos leads (respostas)</div>
            {q.perguntas.length === 0 ? <p className="text-sm text-muted">Sem respostas de múltipla escolha no período.</p> : q.perguntas.slice(0, 6).map((g) => (
              <div key={g.pergunta} className="border-t border-line py-2 text-sm first:border-0">
                <div className="mb-1 font-medium">{g.pergunta}</div>
                {g.respostas.map((r) => <div key={r.resposta} className="flex justify-between text-muted"><span className="truncate pr-3">{r.resposta}</span><span className="shrink-0 tabular-nums">{p(r.pct)} ({num(r.leads)})</span></div>)}
              </div>
            ))}
          </div>
        </div>
      ))}
      {res.clientes.some((c) => c.semAtividade.length) && (
        <div className="card">
          <div className="card-title">Publicados sem atividade no período</div>
          {res.clientes.flatMap((c) => c.semAtividade.map((q) => <div key={c.cliente + q.quiz} className="flex justify-between border-t border-line py-1.5 text-sm first:border-0"><span><span className="text-muted">{c.cliente} · </span>{q.quiz}</span><span className="text-muted">último lead {d(q.ultimoLead)}</span></div>))}
        </div>
      )}
    </>
  );
}

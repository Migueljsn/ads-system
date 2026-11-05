import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Chat } from "@/components/chat";
import { aiEnabled, AI_MODEL } from "@/lib/ai";
import { when } from "@/lib/format";
import { db } from "@/lib/supabase/server";
import { runAnalysis } from "../actions";

export default async function AI() {
  const [{ data: clients }, { data: reports }] = await Promise.all([
    db().from("clients").select("id, name").order("name"),
    db().from("ai_reports").select("id, since, until, content, created_at, created_by, clickup_task_id, clients(name)").order("created_at", { ascending: false }).limit(10),
  ]);
  if (!aiEnabled())
    return (
      <div className="card">
        <h1 className="mb-2 text-xl font-bold">Assistente IA</h1>
        <p className="text-sm">A IA interna está desligada: defina <code>ANTHROPIC_API_KEY</code> nas variáveis do EasyPanel. Enquanto isso, use o <a href="/mcp" className="text-brand underline">servidor MCP</a> com o Claude — ele tem acesso às mesmas ferramentas.</p>
      </div>
    );
  return (
    <>
      <PageHeader title="Assistente IA" subtitle={<>Pergunte sobre suas campanhas ou gere relatórios · modelo {AI_MODEL}</>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card"><h2 className="card-title">Pergunte sobre suas campanhas</h2><Chat /></div>
        <div className="card">
          <h2 className="card-title">Relatório de análise</h2>
          <ActionForm action={runAnalysis} submit="Gerar análise">
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">Período</label><select name="days" className="input"><option value="1">Hoje</option><option value="7">7 dias</option><option value="14">14 dias</option><option value="30">30 dias</option></select></div>
              <div><label className="label">Cliente</label><select name="client" className="input"><option value="">Todos</option>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="clickup" /> criar tarefa no ClickUp com o relatório</label>
          </ActionForm>
        </div>
      </div>
      <h2 className="card-title mt-8">Relatórios anteriores</h2>
      <div className="space-y-3">
        {(reports ?? []).map((r) => (
          <details key={r.id} className="card">
            <summary className="cursor-pointer text-sm">{(r.clients as unknown as { name: string } | null)?.name ?? "Todas as contas"} · {r.since} → {r.until} <span className="text-xs text-muted">· {when(r.created_at)} por {r.created_by}{r.clickup_task_id ? " · no ClickUp" : ""}</span></summary>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{r.content}</div>
          </details>
        ))}
        {!reports?.length && <p className="text-sm text-muted">Nenhum relatório ainda.</p>}
      </div>
    </>
  );
}

import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, isStepCount, tool } from "ai";
import { commentTask, createTask, taskUrl } from "./clickup";
import { compare, performance } from "./report";
import { db } from "./supabase/server";
import { suggestions } from "./suggestions";
import { crmResults, trackingEnabled } from "./tracking";

export const AI_MODEL = process.env.AI_MODEL || "claude-sonnet-5-5";
export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

const SYSTEM = `Você é um gestor de tráfego sênior da Fonil Group analisando Meta Ads e Google Ads.
Responda em português do Brasil, direto e acionável. Use números do dado fornecido (nunca invente).
Estruture: 1) Resumo executivo (3 linhas), 2) O que melhorou/piorou vs período anterior, 3) Alertas (gasto sem conversão, CPA subindo, CTR baixo, campanhas com gasto alto e ROAS < 1), 4) Recomendações priorizadas (pausar, escalar, testar criativo, ajustar orçamento), com o nome exato da campanha.
Valores monetários estão na moeda da conta (normalmente BRL).
Quando houver "crm" nos dados, use-o como verdade de negócio: leads e vendas reais do CRM, CPL real, custo por venda e ROAS real (faturamento/gasto). Aponte divergências entre conversões da plataforma e leads do CRM e baixo % de leads com campanha identificada (problema de tracking/UTM).`;

/** relatório de IA do período (todas as contas ou de um cliente); opcionalmente vira tarefa no ClickUp */
export async function analyze(opts: { since: string; until: string; clientId?: string; sendToClickUp?: boolean; by: string }) {
  if (!aiEnabled()) throw new Error("IA desativada: defina ANTHROPIC_API_KEY");
  const f = { since: opts.since, until: opts.until, clientId: opts.clientId };
  const [cmp, campaigns, daily, client, crm] = await Promise.all([
    compare(f, "platform"),
    performance(f, "campaign"),
    performance(f, "day"),
    opts.clientId ? db().from("clients").select("name, clickup_list_id, clickup_report_task_id, monthly_budget, notes").eq("id", opts.clientId).maybeSingle().then((r) => r.data) : null,
    trackingEnabled() ? crmResults(f).catch((e) => ({ erro: String(e) })) : null,
  ]);
  const sugestoes = trackingEnabled() ? await suggestions({ clientId: opts.clientId }).catch(() => []) : [];
  if (!campaigns.rows.length) return { content: "Sem dados no período. Conecte contas e rode a sincronização.", task: null };
  const data = {
    cliente: client?.name ?? "Todas as contas", periodo: f, orcamentoMensal: client?.monthly_budget ?? null, notas: client?.notes ?? null,
    totais: cmp.current.totals, porPlataforma: cmp.current.rows, periodoAnterior: cmp.previous, variacaoPct: cmp.change,
    campanhas: campaigns.rows.slice(0, 60), diario: daily.rows.map(({ key, spend, conversions, clicks, conversionValue }) => ({ dia: key, spend, conversions, clicks, conversionValue })),
    crm,
    sugestoesDoSistema: sugestoes.map(({ tipo, severidade, titulo, detalhe }) => ({ tipo, severidade, titulo, detalhe })),
  };
  const { text } = await generateText({ model: anthropic(AI_MODEL), system: SYSTEM, prompt: `Dados (JSON):\n${JSON.stringify(data)}` });
  let task: { id: string; url: string } | null = null;
  const listId = client?.clickup_list_id ?? (await db().from("settings").select("value").eq("key", "clickup_default_list").maybeSingle()).data?.value;
  const title = `📊 Relatório de tráfego — ${data.cliente} — ${f.since === f.until ? f.since : `${f.since} a ${f.until}`}`;
  if (opts.sendToClickUp && client?.clickup_report_task_id) {
    // padrão da equipe: relatório como comentário na tarefa do cliente (Gestão de Clientes), sem criar tarefa nova por dia
    await commentTask(client.clickup_report_task_id, `${title}\n\n${text}`);
    task = { id: client.clickup_report_task_id, url: taskUrl(client.clickup_report_task_id) };
  } else if (opts.sendToClickUp && listId) {
    task = await createTask({ listId: String(listId), name: title, description: text, clientId: opts.clientId ?? null, source: "ai", by: opts.by, tags: ["relatorio-ia"] });
  }
  await db().from("ai_reports").insert({ client_id: opts.clientId ?? null, since: f.since, until: f.until, model: AI_MODEL, content: text, clickup_task_id: task?.id ?? null, created_by: opts.by });
  return { content: text, task };
}

/** chat com acesso às ferramentas (leitura sempre; escrita só se o usuário permitir) */
export async function chat(messages: { role: "user" | "assistant"; content: string }[], opts: { by: string; allowWrite: boolean }) {
  if (!aiEnabled()) throw new Error("IA desativada: defina ANTHROPIC_API_KEY");
  const { tools: registry, runTool } = await import("./tools");
  const ctx = { by: opts.by, scopes: opts.allowWrite ? ["read", "write"] : ["read"], source: "ai" as const };
  const aiTools = Object.fromEntries(
    registry.filter((t) => t.name !== "ai_analysis" && (opts.allowWrite || t.scope === "read")).map((t) => [
      t.name,
      tool({ description: t.description, inputSchema: t.input, execute: async (input: unknown) => { try { return await runTool(t.name, input, ctx); } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; } } }),
    ]),
  );
  const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const { text, steps } = await generateText({
    model: anthropic(AI_MODEL),
    system: `${SYSTEM}\nHoje é ${today}. Use as ferramentas para buscar dados antes de responder. ${opts.allowWrite ? "Ações de escrita (pausar, orçamento, ClickUp) estão liberadas: confirme o que fez." : "Você está em modo somente leitura: sugira ações, não execute."}`,
    messages,
    tools: aiTools,
    stopWhen: isStepCount(12),
  });
  return { text, toolCalls: steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)) };
}

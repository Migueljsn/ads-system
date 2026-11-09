import "server-only";
import { z } from "zod";
import * as clickup from "./clickup";
import { range } from "./dates";
import * as google from "./google";
import * as meta from "./meta";
import { compare, lastRuns, listAccounts, performance } from "./report";
import { db } from "./supabase/server";
import { syncAll } from "./sync";
import { crmPipeline, crmResults } from "./tracking";

/*
 * Registro único das ferramentas do sistema. O mesmo conjunto é exposto:
 *  - no servidor MCP (/api/mcp) para Claude/Cursor/n8n etc.;
 *  - na API REST (/api/v1/tools/{nome});
 *  - para a IA interna (chat e relatório).
 * scope "write" exige chave com permissão de escrita (ações que mexem em campanhas, ClickUp e sincronização).
 */
export type Ctx = { by: string; scopes: string[]; source: "mcp" | "api" | "ai" | "app" };
type Tool<S extends z.ZodType> = { name: string; title: string; description: string; scope: "read" | "write"; input: S; run: (input: z.infer<S>, ctx: Ctx) => Promise<unknown> };
const def = <S extends z.ZodType>(t: Tool<S>) => t;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("data YYYY-MM-DD (fuso de Brasília)");
const platform = z.enum(["meta", "google"]);
const periodFilters = {
  since: day.optional().describe("início (padrão: 7 dias atrás)"),
  until: day.optional().describe("fim (padrão: hoje)"),
  days: z.number().int().min(1).max(365).optional().describe("atalho: últimos N dias (ignorado se since vier)"),
  platform: platform.optional(),
  clientId: z.string().uuid().optional().describe("id do cliente (list_clients)"),
  accountId: z.string().optional().describe("act_123 (Meta) ou 1234567890 (Google)"),
  campaignId: z.string().optional(),
  search: z.string().optional().describe("trecho do nome da campanha"),
};
const filters = (i: { since?: string; until?: string; days?: number; platform?: "meta" | "google"; clientId?: string; accountId?: string; campaignId?: string; search?: string }) => ({
  ...range(i.since, i.until, i.days ?? 7), platform: i.platform, clientId: i.clientId, accountId: i.accountId, campaignId: i.campaignId, search: i.search,
});

async function listFor(input: { listId?: string; clientId?: string }) {
  if (input.listId) return input.listId;
  if (input.clientId) {
    const { data } = await db().from("clients").select("clickup_list_id").eq("id", input.clientId).maybeSingle();
    if (data?.clickup_list_id) return data.clickup_list_id as string;
  }
  const { data } = await db().from("settings").select("value").eq("key", "clickup_default_list").maybeSingle();
  if (data?.value) return String(data.value);
  throw new Error("informe listId (clickup_lists) ou um cliente com lista do ClickUp configurada");
}

export const tools = [
  def({ name: "list_clients", title: "Listar clientes", scope: "read", description: "Clientes da agência com id, lista do ClickUp e orçamento mensal.", input: z.object({}),
    run: async () => (await db().from("clients").select("id, name, slug, tracking_slug, clickup_list_id, monthly_budget, notes, active").order("name")).data }),
  def({ name: "list_accounts", title: "Listar contas de anúncio", scope: "read", description: "Contas de anúncio conectadas (Meta e Google), cliente dono, moeda, status e último sync.", input: z.object({}),
    run: () => listAccounts() }),
  def({ name: "get_performance", title: "Desempenho agregado", scope: "read",
    description: "Métricas (gasto, impressões, cliques, conversões, valor, leads, conversas, CTR, CPC, CPM, CPA, ROAS) agrupadas por platform|client|account|campaign|group|ad|day, a partir dos dados sincronizados. Valores na moeda de cada conta.",
    input: z.object({ ...periodFilters, groupBy: z.enum(["platform", "client", "account", "campaign", "group", "ad", "day"]).default("campaign"), limit: z.number().int().min(1).max(500).default(50) }),
    run: async (i) => { const r = await performance(filters(i), i.groupBy); return { ...r, rows: r.rows.slice(0, i.limit), totalRows: r.rows.length }; } }),
  def({ name: "compare_periods", title: "Comparar com período anterior", scope: "read", description: "Totais do período × período anterior de mesmo tamanho, com variação % de cada métrica.",
    input: z.object({ ...periodFilters, groupBy: z.enum(["platform", "client", "account", "campaign"]).default("platform") }),
    run: (i) => compare(filters(i), i.groupBy) }),
  def({ name: "sync_status", title: "Status da sincronização", scope: "read", description: "Últimas execuções de sincronização com Meta e Google (status, linhas, erros).", input: z.object({}),
    run: () => lastRuns() }),
  def({ name: "sync_now", title: "Sincronizar agora", scope: "write", description: "Puxa agora os dados da Meta e/ou Google para o banco (padrão: últimos 3 dias; até 365 para histórico).",
    input: z.object({ days: z.number().int().min(1).max(365).default(3), platform: platform.optional() }),
    run: (i, ctx) => syncAll({ days: i.days, platform: i.platform, trigger: ctx.source }) }),
  def({ name: "meta_campaigns_live", title: "Campanhas Meta (ao vivo)", scope: "read", description: "Campanhas da conta Meta direto da API: status, objetivo e orçamento (centavos da moeda).",
    input: z.object({ accountId: z.string().describe("act_123") }), run: (i) => meta.liveCampaigns(i.accountId) }),
  def({ name: "meta_adsets_live", title: "Conjuntos Meta (ao vivo)", scope: "read", description: "Conjuntos de anúncio da conta (ou de uma campanha) direto da API.",
    input: z.object({ accountId: z.string(), campaignId: z.string().optional() }), run: (i) => meta.liveAdsets(i.accountId, i.campaignId) }),
  def({ name: "meta_account_balance", title: "Saldo/status da conta Meta", scope: "read", description: "Status, gasto total, saldo não cobrado, limite e forma de pagamento da conta Meta.",
    input: z.object({ accountId: z.string() }), run: (i) => meta.accountBalance(i.accountId) }),
  def({ name: "google_campaigns_live", title: "Campanhas Google (ao vivo)", scope: "read", description: "Campanhas da conta Google Ads direto da API: status, tipo, lance e orçamento diário.",
    input: z.object({ accountId: z.string().describe("customer id, só números") }), run: (i) => google.liveGoogleCampaigns(i.accountId) }),
  def({ name: "set_status", title: "Pausar/ativar", scope: "write", description: "Pausa ou ativa uma campanha (Google) ou campanha/conjunto/anúncio (Meta). Ação real na plataforma.",
    input: z.object({ platform, accountId: z.string(), objectId: z.string().describe("id da campanha/conjunto/anúncio"), status: z.enum(["active", "paused"]) }),
    run: (i) => i.platform === "meta" ? meta.setStatus(i.accountId, i.objectId, i.status === "active" ? "ACTIVE" : "PAUSED") : google.setGoogleCampaignStatus(i.accountId, i.objectId, i.status === "active" ? "ENABLED" : "PAUSED") }),
  def({ name: "set_daily_budget", title: "Alterar orçamento diário", scope: "write", description: "Altera o orçamento diário (valor na moeda da conta, ex.: 150.5) de campanha/conjunto (Meta) ou campanha (Google). Ação real na plataforma.",
    input: z.object({ platform, accountId: z.string(), objectId: z.string(), amount: z.number().positive() }),
    run: (i) => i.platform === "meta" ? meta.setDailyBudget(i.accountId, i.objectId, i.amount) : google.setGoogleCampaignBudget(i.accountId, i.objectId, i.amount) }),
  def({ name: "crm_results", title: "Resultado no CRM (leads, vendas, ROAS real)", scope: "read",
    description: "Cruza o gasto em anúncios com o CRM/tracking da Fonil: leads, vendas, faturamento, recompras, CPL, custo por venda, ROAS real e taxa de conversão, por cliente e por campanha, além do % de leads com campanha identificada e leads por origem.",
    input: z.object({ since: day.optional(), until: day.optional(), days: z.number().int().min(1).max(365).optional(), clientId: z.string().uuid().optional() }),
    run: (i) => crmResults({ ...range(i.since, i.until, i.days ?? 30), clientId: i.clientId }) }),
  def({ name: "crm_pipeline", title: "Funil do CRM", scope: "read", description: "Leads abertos por etapa do funil (agora) e motivos de perda no período, por cliente.",
    input: z.object({ since: day.optional(), until: day.optional(), days: z.number().int().min(1).max(365).optional(), clientId: z.string().uuid().optional() }),
    run: (i) => crmPipeline({ ...range(i.since, i.until, i.days ?? 30), clientId: i.clientId }) }),
  def({ name: "clickup_lists", title: "Listas do ClickUp", scope: "read", description: "Todas as listas do workspace do ClickUp (id e caminho espaço/pasta/lista).", input: z.object({}),
    run: () => clickup.allLists() }),
  def({ name: "clickup_tasks", title: "Tarefas do ClickUp", scope: "read", description: "Tarefas abertas de uma lista do ClickUp (ou da lista do cliente).",
    input: z.object({ listId: z.string().optional(), clientId: z.string().uuid().optional(), includeClosed: z.boolean().default(false) }),
    run: async (i) => clickup.listTasks(await listFor(i), i.includeClosed) }),
  def({ name: "clickup_members", title: "Membros do ClickUp", scope: "read", description: "Membros do workspace do ClickUp (id e nome), para usar em assignees.", input: z.object({}),
    run: () => clickup.members() }),
  def({ name: "clickup_create_task", title: "Criar tarefa no ClickUp", scope: "write", description: "Cria tarefa no ClickUp (na lista informada ou na do cliente). Descrição em markdown. priority: 1 urgente … 4 baixa. Sem assignees, usa o responsável padrão das configurações. Padrão de nome da Fonil: \"Área | Ação\" (Estratégia, Páginas e CRM, Tráfego pago, Audiovisual, Comercial…).",
    input: z.object({ name: z.string().min(3), description: z.string().optional(), listId: z.string().optional(), clientId: z.string().uuid().optional(), priority: z.number().int().min(1).max(4).optional(), dueDate: day.optional().describe("prazo YYYY-MM-DD (vence às 18h de Brasília)"), tags: z.array(z.string()).optional(), assignees: z.array(z.number().int()).optional().describe("ids de clickup_members"), status: z.string().optional().describe("ex.: backlog, a fazer (padrão: primeiro status da lista)") }),
    run: async (i, ctx) => clickup.createTask({ ...i, priority: i.priority as 1 | 2 | 3 | 4 | undefined, listId: await listFor(i), source: ctx.source, by: ctx.by }) }),
  def({ name: "ai_analysis", title: "Análise de IA", scope: "write", description: "Gera análise em português (diagnóstico, alertas e recomendações) do período, opcionalmente por cliente, e pode criar tarefa no ClickUp com o relatório.",
    input: z.object({ since: day.optional(), until: day.optional(), days: z.number().int().min(1).max(90).optional(), clientId: z.string().uuid().optional(), sendToClickUp: z.boolean().default(false) }),
    run: async (i, ctx) => { const { analyze } = await import("./ai"); return analyze({ ...range(i.since, i.until, i.days ?? 7), clientId: i.clientId, sendToClickUp: i.sendToClickUp, by: ctx.by }); } }),
] as const;

export type AnyTool = (typeof tools)[number];
export const findTool = (name: string) => tools.find((t) => t.name === name) as Tool<z.ZodType> | undefined;

export async function runTool(name: string, rawInput: unknown, ctx: Ctx) {
  const t = findTool(name);
  if (!t) throw new ToolError(404, `ferramenta desconhecida: ${name}`);
  if (t.scope === "write" && !ctx.scopes.includes("write")) throw new ToolError(403, `"${name}" exige chave com permissão de escrita`);
  const parsed = t.input.safeParse(rawInput ?? {});
  if (!parsed.success) throw new ToolError(400, z.prettifyError(parsed.error));
  return t.run(parsed.data, ctx);
}
export class ToolError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

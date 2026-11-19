import "server-only";
import { addChecklist, createTask } from "./clickup";
import { dayBR, daysAgo } from "./dates";
import { money as brl } from "./format";
import { performance } from "./report";
import { db } from "./supabase/server";
import { crmResults } from "./tracking";

/** rituais do Playbook de Comunicação com Clientes (seg = Direção, qua = Valor, sex = Resultado) */
const RITUALS: Record<number, { day: string; label: string; question: string; goal: string; steps: string[] }> = {
  1: { day: "segunda", label: "Direção", question: "\"O que vamos fazer\"", goal: "Abrir a semana com as prioridades do projeto, o que será trabalhado (criativos, otimizações, CRM, recompras) e as pendências que precisamos do cliente.",
    steps: ["Verificar os principais acontecimentos do projeto", "Definir as prioridades da semana", "Preencher o Prompt de Segunda", "Revisar a mensagem gerada", "Enviar no grupo do cliente"] },
  3: { day: "quarta", label: "Valor", question: "\"O que aprendemos\"", goal: "Compartilhar UM insight estratégico seguindo Observação → Interpretação → Ação (criativos e copy, comportamento dos leads, comercial e CRM, estratégia e mercado).",
    steps: ["Analisar campanhas, comercial ou criativos", "Identificar UM aprendizado relevante", "Preencher o Prompt de Quarta", "Transformar em insight simples", "Enviar no grupo do cliente"] },
  5: { day: "sexta", label: "Resultado", question: "\"O que aconteceu\"", goal: "Fechar a semana conectando tráfego, CRM e comercial numa leitura executiva simples, com um avanço, problemas com ação e o próximo passo.",
    steps: ["Conferir os dados de tráfego (abaixo / Meta Ads)", "Conferir os dados do CRM (abaixo)", "Listar as ações realizadas na semana", "Preencher o Prompt de Sexta", "Conferir os números antes de enviar", "Enviar o fechamento semanal"] },
};

type Cfg = { enabled: boolean; assignee: number | null; listId: string | null; playbookUrl: string | null; days: number[] };

async function config(): Promise<Cfg> {
  const { data } = await db().from("settings").select("key, value").like("key", "touchpoint_%");
  const v = new Map((data ?? []).map((r) => [r.key as string, r.value]));
  return {
    enabled: v.get("touchpoint_enabled") === true,
    assignee: Number(v.get("touchpoint_assignee")) || null,
    listId: (v.get("touchpoint_list_id") as string) ?? null,
    playbookUrl: (v.get("touchpoint_playbook_url") as string) ?? null,
    days: (v.get("touchpoint_days") as number[]) ?? [1, 3, 5],
  };
}

/**
 * Rituais de comunicação com os clientes ativos (Playbook: seg Direção, qua Valor, sex Resultado):
 * cria no ClickUp a tarefa do ritual do dia para o responsável configurado, com checklist por
 * cliente ativo, os passos do ritual e os números dos últimos 7 dias de cada cliente.
 */
export async function createTouchpointTask(opts: { force?: boolean; dryRun?: boolean; weekday?: number; by?: string } = {}) {
  const cfg = await config();
  if (!cfg.enabled && !opts.force) return { skipped: "rotina de interação desligada (touchpoint_enabled)" };
  if (!cfg.listId) return { skipped: "sem lista configurada (touchpoint_list_id)" };
  const today = dayBR();
  const weekday = opts.weekday ?? new Date(`${today}T12:00:00Z`).getUTCDay();
  if (!opts.force && !cfg.days.includes(weekday)) return { skipped: `hoje (${weekday}) não é dia de interação` };

  const { data: dup } = await db().from("clickup_tasks").select("url").eq("source", "touchpoint").gte("created_at", `${today}T03:00:00Z`).limit(1);
  if (dup?.length && !opts.force) return { skipped: "tarefa de hoje já criada", task: dup[0].url };

  const { data: clients } = await db().from("clients").select("id, name, tracking_slug").eq("active", true).order("name");
  if (!clients?.length) return { skipped: "nenhum cliente ativo" };

  const since = daysAgo(7), until = daysAgo(1);
  const crm = await crmResults({ since, until }).catch(() => null);
  const br = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
  const blocks: string[] = [];
  for (const c of clients) {
    const r = crm?.clientes.find((x) => x.clientId === c.id);
    if (r) {
      const ticket = r.vendas ? brl(r.faturamento / r.vendas) : "—";
      const vendas = r.vendasPossivelmenteNaoLancadas ? `nenhuma lançada no CRM desde ${br(r.ultimaVendaRegistrada ?? "")} (cobrar antes de citar vendas)` : `${r.vendas} · Faturamento: ${brl(r.faturamento)} · Ticket médio: ${ticket} · Recompras: ${r.recompras}`;
      blocks.push(`**${c.name}**\n* Tráfego: Investimento: ${brl(r.gasto)} | Leads no CRM: ${r.leads} | Custo por lead: ${r.cpl == null ? "—" : brl(r.cpl)}\n* CRM / comercial: Vendas: ${vendas}`);
    } else {
      const p = await performance({ since, until, clientId: c.id }, "platform");
      const spend = p.rows.reduce((t, x) => t + x.spend, 0), leads = p.rows.reduce((t, x) => t + x.leads + x.messages, 0);
      blocks.push(`**${c.name}**\n* Tráfego: Investimento: ${brl(spend)} | Leads (anúncio): ${leads} | Custo por lead: ${leads ? brl(spend / leads) : "—"}\n* CRM / comercial: sem CRM ligado no Fonil Ads`);
    }
  }

  const r = RITUALS[weekday] ?? RITUALS[1];
  const ddmm = br(today);
  const description = [
    `**Ritual de ${r.label}** — ${r.question}. ${r.goal}`,
    cfg.playbookUrl ? `\nPlaybook (regras e prompt completo): ${cfg.playbookUrl}` : "",
    "\n**Regras:** mensagem curta e humana, sempre \"nosso projeto com [cliente]\", sem inventar números, sem jargão e sem emojis em excesso. Revise antes de enviar.",
    "\n**Está feito quando:** a mensagem foi enviada no grupo de cada cliente do checklist e o texto enviado foi colado nos comentários desta tarefa.",
    `\n**Números da semana (${br(since)} a ${br(until)}, Fonil Ads):**`,
    ...blocks,
    weekday === 5 ? "\nCopie o bloco do cliente para o Prompt de Sexta e complete com as ações da semana e os próximos passos." : "\nUse os números só como contexto; o foco do ritual está acima.",
  ].join("\n");

  const name = `Atendimento | Ritual de ${r.day}: ${r.label} com os clientes (${ddmm})`;
  if (opts.dryRun) return { preview: { name, description, checklist: clients.map((c) => c.name), passos: r.steps } };
  const task = await createTask({
    listId: cfg.listId,
    name: `Atendimento | Ritual de ${r.day}: ${r.label} com os clientes (${ddmm})`,
    description,
    dueDate: today,
    assignees: cfg.assignee ? [cfg.assignee] : undefined,
    source: "touchpoint",
    by: opts.by ?? "cron",
  });
  await addChecklist(task.id, "Clientes (mensagem enviada no grupo)", clients.map((c) => c.name));
  await addChecklist(task.id, "Passos do ritual", r.steps);
  return { task: task.url, clients: clients.map((c) => c.name) };
}

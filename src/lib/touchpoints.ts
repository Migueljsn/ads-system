import "server-only";
import { addChecklist, createTask } from "./clickup";
import { dayBR, daysAgo } from "./dates";
import { money as brl } from "./format";
import { performance } from "./report";
import { db } from "./supabase/server";
import { crmResults } from "./tracking";

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
 * Rotina de interação com os clientes ativos (seg/qua/sex por padrão): cria no ClickUp
 * "Atendimento | Interação com os clientes ativos (dd/mm)" para o responsável configurado,
 * com um item de checklist por cliente ativo e os números dos últimos 7 dias de cada um.
 */
export async function createTouchpointTask(opts: { force?: boolean; by?: string } = {}) {
  const cfg = await config();
  if (!cfg.enabled && !opts.force) return { skipped: "rotina de interação desligada (touchpoint_enabled)" };
  if (!cfg.listId) return { skipped: "sem lista configurada (touchpoint_list_id)" };
  const today = dayBR();
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (!opts.force && !cfg.days.includes(weekday)) return { skipped: `hoje (${weekday}) não é dia de interação` };

  const { data: dup } = await db().from("clickup_tasks").select("url").eq("source", "touchpoint").gte("created_at", `${today}T03:00:00Z`).limit(1);
  if (dup?.length && !opts.force) return { skipped: "tarefa de hoje já criada", task: dup[0].url };

  const { data: clients } = await db().from("clients").select("id, name, tracking_slug").eq("active", true).order("name");
  if (!clients?.length) return { skipped: "nenhum cliente ativo" };

  const since = daysAgo(7), until = daysAgo(1);
  const crm = await crmResults({ since, until }).catch(() => null);
  const lines: string[] = [];
  for (const c of clients) {
    const r = crm?.clientes.find((x) => x.clientId === c.id);
    if (r) {
      const vendas = r.vendasPossivelmenteNaoLancadas ? `vendas não lançadas desde ${r.ultimaVendaRegistrada?.split("-").reverse().slice(0, 2).join("/")}` : `${r.vendas} vendas (${brl(r.faturamento)})`;
      lines.push(`**${c.name}:** ${brl(r.gasto)} investidos · ${r.leads} leads no CRM · CPL ${r.cpl == null ? "—" : brl(r.cpl)} · ${vendas}`);
    } else {
      const p = await performance({ since, until, clientId: c.id }, "platform");
      const spend = p.rows.reduce((t, x) => t + x.spend, 0), leads = p.rows.reduce((t, x) => t + x.leads + x.messages, 0);
      lines.push(`**${c.name}:** ${brl(spend)} investidos · ${leads} leads (anúncio)`);
    }
  }

  const ddmm = today.split("-").reverse().slice(0, 2).join("/");
  const description = [
    "Rotina de interação com os clientes ativos (segunda, quarta e sexta, 10h–12h), criada automaticamente pelo Fonil Ads.",
    cfg.playbookUrl ? `\nSiga o playbook de interação: ${cfg.playbookUrl}` : "",
    "\n**Está feito quando:** todos os itens do checklist estão marcados e o resumo de cada conversa está nos comentários desta tarefa (ou na tarefa do cliente).",
    `\n**Números dos últimos 7 dias (${since.split("-").reverse().slice(0, 2).join("/")} a ${until.split("-").reverse().slice(0, 2).join("/")}):**`,
    ...lines.map((l) => `* ${l}`),
  ].join("\n");

  const task = await createTask({
    listId: cfg.listId,
    name: `Atendimento | Interação com os clientes ativos (${ddmm})`,
    description,
    dueDate: today,
    assignees: cfg.assignee ? [cfg.assignee] : undefined,
    source: "touchpoint",
    by: opts.by ?? "cron",
  });
  await addChecklist(task.id, "Clientes", clients.map((c) => c.name));
  return { task: task.url, clients: clients.map((c) => c.name) };
}

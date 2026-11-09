import "server-only";
import { teams } from "./clickup";
import { dayBR, daysAgo } from "./dates";
import { performance } from "./report";
import { db } from "./supabase/server";
import { crmDaily } from "./tracking";

/*
 * Espelho das tarefas do ClickUp no banco (team_tasks) para o ranking da equipe
 * e para medir o que cada entrega mudou nos números do cliente.
 */
const API = "https://api.clickup.com/api/v2";
async function cu<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: process.env.CLICKUP_API_TOKEN ?? "" }, cache: "no-store" });
  if (!res.ok) throw new Error(`ClickUp ${res.status}`);
  return res.json() as Promise<T>;
}
type CuTask = {
  id: string; name: string; url: string; status: { status: string; type: string }; priority: { id: string } | null;
  assignees: { id: number; username: string | null; email: string }[]; due_date: string | null; date_created: string; date_updated: string;
  date_done: string | null; date_closed: string | null; list: { id: string; name: string }; folder: { name: string; hidden?: boolean }; space: { id: string };
};

/** regra de pontos (exibida no painel) */
export const POINTS_RULES = [
  "Tarefa concluída: 10 pts",
  "Entregue até o prazo (tolerância de 1 dia): +5",
  "Prioridade urgente/alta: +5",
  "Rotina recorrente (Rotinas da Equipe): 2 pts",
  "Cancelada ou sem responsável: 0",
];
const ms = (s: string | null) => (s ? new Date(Number(s)).toISOString() : null);
/** fim do dia do prazo + 1 dia de tolerância (a entrega costuma ser registrada na daily do dia seguinte) */
const deadline = (iso: string) => Date.parse(`${dayBR(new Date(iso))}T23:59:59-03:00`) + 86400_000;

function score(t: { done: boolean; cancelled: boolean; routine: boolean; priority: number | null; onTime: boolean | null; assignees: unknown[] }) {
  if (!t.done || t.cancelled || !t.assignees.length) return 0;
  if (t.routine) return 2;
  return 10 + (t.onTime ? 5 : 0) + (t.priority && t.priority <= 2 ? 5 : 0);
}

/** puxa tarefas alteradas nos últimos N dias (todas as listas) e grava no espelho */
export async function syncClickUpTasks(days = 120) {
  const started = Date.now();
  const [{ data: clients }, ws] = await Promise.all([db().from("clients").select("id, name, clickup_list_id"), teams()]);
  const byList = new Map((clients ?? []).filter((c) => c.clickup_list_id).map((c) => [String(c.clickup_list_id), c.id as string]));
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const byName = (clients ?? []).map((c) => ({ id: c.id as string, n: norm(String(c.name)).replace(/ (cosmeticos|distribuidora)$/, "") }));
  let total = 0;
  for (const team of ws) {
    const spaces = new Map((await cu<{ spaces: { id: string; name: string }[] }>(`/team/${team.id}/space?archived=false`)).spaces.map((s) => [s.id, s.name]));
    const since = Date.now() - days * 86400_000;
    for (let page = 0; page < 50; page++) {
      const r = await cu<{ tasks: CuTask[]; last_page?: boolean }>(`/team/${team.id}/task?page=${page}&include_closed=true&subtasks=true&order_by=updated&date_updated_gt=${since}`);
      const rows = r.tasks.map((t) => {
        const doneAt = ms(t.date_done ?? t.date_closed);
        const cancelled = /cancel/i.test(t.status.status);
        const done = !cancelled && (t.status.type === "done" || t.status.type === "closed") && !!doneAt;
        const due = ms(t.due_date);
        const onTime = done && due ? Date.parse(doneAt!) <= deadline(due) : null;
        const priority = t.priority ? Number(t.priority.id) : null;
        const routine = /rotina/i.test(t.folder?.name ?? "");
        const assignees = t.assignees.map((a) => ({ id: a.id, name: a.username || a.email }));
        // cliente: lista do cliente; senão, nome do cliente na lista ou na tarefa (ex.: Gestão de Clientes)
        const hay = norm(`${t.list.name} ${t.name}`);
        const client_id = byList.get(t.list.id) ?? byName.find((c) => c.n.length > 2 && hay.includes(c.n))?.id ?? null;
        return {
          id: t.id, name: t.name, status: t.status.status, status_type: t.status.type, done, cancelled,
          list_id: t.list.id, list_name: t.list.name, folder_name: t.folder?.hidden ? null : t.folder?.name ?? null, space_name: spaces.get(t.space.id) ?? null,
          client_id, area: t.name.includes("|") ? t.name.split("|")[0].trim() : null, assignees, priority,
          due_date: due, date_created: ms(t.date_created), date_done: done ? doneAt : null, date_updated: ms(t.date_updated),
          on_time: onTime, points: score({ done, cancelled, routine, priority, onTime, assignees }), url: t.url, synced_at: new Date().toISOString(),
        };
      });
      if (rows.length) {
        const { error } = await db().from("team_tasks").upsert(rows);
        if (error) throw new Error(error.message);
      }
      total += rows.length;
      if (r.last_page !== false || !r.tasks.length) break;
    }
  }
  await db().from("settings").upsert({ key: "clickup_synced_at", value: new Date().toISOString() });
  return { tasks: total, ms: Date.now() - started };
}

type TaskRow = { id: string; name: string; area: string | null; client_id: string | null; assignees: { id: number; name: string }[]; points: number; on_time: boolean | null; date_done: string | null; due_date: string | null; done: boolean; url: string };

/** ranking por pessoa no período (pontos, entregas, % no prazo, atrasadas abertas) */
export async function ranking(since: string, until: string) {
  const from = `${since}T00:00:00-03:00`, to = `${until}T23:59:59-03:00`;
  const [{ data: done }, { data: open }, { data: clients }, { data: synced }] = await Promise.all([
    db().from("team_tasks").select("id, name, area, client_id, assignees, points, on_time, date_done, due_date, done, url").eq("done", true).gte("date_done", from).lte("date_done", to).limit(5000),
    db().from("team_tasks").select("assignees, due_date").eq("done", false).eq("cancelled", false).lt("due_date", `${dayBR()}T00:00:00-03:00`).limit(5000),
    db().from("clients").select("id, name"),
    db().from("settings").select("value").eq("key", "clickup_synced_at").maybeSingle(),
  ]);
  const cname = new Map((clients ?? []).map((c) => [c.id as string, c.name as string]));
  const people = new Map<number, { id: number; nome: string; pontos: number; entregas: number; noPrazo: number; comPrazo: number; atrasadasAbertas: number; porArea: Record<string, number>; porCliente: Record<string, number>; ultimas: { tarefa: string; pontos: number; quando: string; url: string }[] }>();
  // a mesma pessoa pode ter mais de um usuário no ClickUp: agrupa pelo nome
  const pkey = (a: { name: string }) => a.name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  const ids = new Map<string, number>();
  const get = (a: { id: number; name: string }) => {
    const k = pkey(a);
    if (!ids.has(k)) ids.set(k, ids.size + 1);
    const id = ids.get(k)!;
    let p = people.get(id);
    if (!p) people.set(id, (p = { id, nome: a.name, pontos: 0, entregas: 0, noPrazo: 0, comPrazo: 0, atrasadasAbertas: 0, porArea: {}, porCliente: {}, ultimas: [] }));
    return p;
  };
  for (const t of (done ?? []) as TaskRow[]) for (const a of uniq(t.assignees)) {
    const p = get(a);
    p.pontos += t.points; p.entregas += 1;
    if (t.due_date) { p.comPrazo += 1; if (t.on_time) p.noPrazo += 1; }
    const area = t.area ?? "Outros"; p.porArea[area] = (p.porArea[area] ?? 0) + 1;
    if (t.client_id) { const c = cname.get(t.client_id) ?? "?"; p.porCliente[c] = (p.porCliente[c] ?? 0) + 1; }
    p.ultimas.push({ tarefa: t.name, pontos: t.points, quando: t.date_done!, url: t.url });
  }
  for (const t of (open ?? []) as { assignees: { id: number; name: string }[] }[]) for (const a of uniq(t.assignees)) get(a).atrasadasAbertas += 1;
  function uniq(list: { id: number; name: string }[]) {
    const seen = new Set<string>();
    return list.filter((a) => !seen.has(pkey(a)) && !!seen.add(pkey(a)));
  }
  const rows = [...people.values()]
    .map((p) => ({ ...p, pctNoPrazo: p.comPrazo ? Math.round((p.noPrazo / p.comPrazo) * 100) : null, ultimas: p.ultimas.sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 5) }))
    .sort((a, b) => b.pontos - a.pontos || b.entregas - a.entregas);
  return { periodo: { since, until }, regras: POINTS_RULES, sincronizadoEm: synced?.value ?? null, ranking: rows };
}

const IMPACT_AREAS = ["Tráfego pago", "Páginas e CRM", "Audiovisual", "Estratégia", "Integração", "Comercial"];
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** para cada entrega ligada a um cliente: números do cliente 7 dias antes × 7 dias depois */
export async function taskImpact(opts: { since?: string; until?: string; clientId?: string; window?: number }) {
  const w = opts.window ?? 7;
  const since = opts.since ?? daysAgo(30), until = opts.until ?? dayBR();
  let q = db().from("team_tasks").select("id, name, area, client_id, assignees, points, date_done, url").eq("done", true).not("client_id", "is", null)
    .gte("date_done", `${since}T00:00:00-03:00`).lte("date_done", `${until}T23:59:59-03:00`).order("date_done", { ascending: false }).limit(200);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const tasks = ((await q).data ?? []) as TaskRow[];
  const relevant = tasks.filter((t) => !t.area || IMPACT_AREAS.includes(t.area));
  if (!relevant.length) return { periodo: { since, until }, janelaDias: w, tarefas: [] };
  const ids = [...new Set(relevant.map((t) => t.client_id!))];
  const { data: clients } = await db().from("clients").select("id, name, tracking_slug").in("id", ids);
  const from = addDays(since, -w), to = dayBR();
  const crm = await crmDaily((clients ?? []).map((c) => c.tracking_slug).filter(Boolean) as string[], from, to);
  const spendBy = new Map<string, Map<string, number>>();
  await Promise.all(ids.map(async (id) => spendBy.set(id, new Map((await performance({ since: from, until: to, clientId: id }, "day")).rows.map((r) => [r.key, r.spend])))));
  const today = dayBR();
  const sumWin = (clientId: string, slug: string | null, a: string, b: string) => {
    let spend = 0, leads = 0, sales = 0, revenue = 0;
    for (const [d, v] of spendBy.get(clientId) ?? []) if (d >= a && d <= b) spend += v;
    for (const r of crm) if (r.client_slug === slug && r.day >= a && r.day <= b) { leads += r.leads; sales += r.sales; revenue += r.revenue; }
    const round = (n: number) => Math.round(n * 100) / 100;
    return { gasto: round(spend), leads, cpl: spend > 0 && leads ? round(spend / leads) : null, vendas: sales, faturamento: round(revenue) };
  };
  const delta = (a: number | null, b: number | null) => (a == null || b == null || a === 0 ? null : Math.round(((b - a) / a) * 1000) / 10);
  return {
    periodo: { since, until }, janelaDias: w,
    observacao: "Compara o cliente inteiro antes × depois da entrega. Mostra relação provável, não prova de causa (outras ações e sazonalidade também influenciam).",
    tarefas: relevant.map((t) => {
      const c = (clients ?? []).find((x) => x.id === t.client_id);
      const d = dayBR(new Date(t.date_done!));
      const before = sumWin(t.client_id!, c?.tracking_slug ?? null, addDays(d, -w), addDays(d, -1));
      const afterEnd = addDays(d, w) < today ? addDays(d, w) : today;
      const after = sumWin(t.client_id!, c?.tracking_slug ?? null, addDays(d, 1), afterEnd);
      const elapsed = Math.max(0, Math.round((Date.parse(afterEnd) - Date.parse(d)) / 86400_000));
      return {
        tarefa: t.name, url: t.url, cliente: c?.name ?? null, area: t.area, responsaveis: t.assignees.map((a) => a.name), concluidaEm: d,
        diasDepois: elapsed, completo: elapsed >= w, antes: before, depois: after,
        variacao: { leads: delta(before.leads, after.leads), cpl: delta(before.cpl, after.cpl), vendas: delta(before.vendas, after.vendas), faturamento: delta(before.faturamento, after.faturamento) },
      };
    }),
  };
}

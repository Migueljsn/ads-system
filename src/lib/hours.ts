import "server-only";
import { teams } from "./clickup";
import { db } from "./supabase/server";

/*
 * Horas trabalhadas por pessoa, a partir dos registros de tempo do ClickUp.
 * O time usa uma conta compartilhada (Fonil Company) para economizar licenças: quem
 * aparece no registro de tempo é sempre essa conta. Por isso a hora vai para o
 * RESPONSÁVEL da tarefa (dividida igualmente se houver mais de um).
 */
const API = "https://api.clickup.com/api/v2";
async function cu<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: process.env.CLICKUP_API_TOKEN ?? "" }, cache: "no-store" });
  if (!res.ok) throw new Error(`ClickUp ${res.status}`);
  return res.json() as Promise<T>;
}
type Entry = { id: string; start: string; end: string | null; duration: string; task: { id: string; name: string } | null; user: { username: string | null } };
type Task = { id: string; name: string; url: string; area: string | null; client_id: string | null; assignees: { id: number; name: string }[]; done: boolean; date_done: string | null; folder_name: string | null };

const H = (ms: number) => Math.round((ms / 3_600_000) * 100) / 100;
const pkey = (n: string) => n.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
const firstName = (n: string) => n.split(" ")[0];

async function entries(fromMs: number, toMs: number) {
  const out: Entry[] = [];
  for (const t of await teams()) {
    const r = await cu<{ data: Entry[] }>(`/team/${t.id}/time_entries?start_date=${fromMs}&end_date=${toMs}&include_task_tags=false`);
    out.push(...r.data);
  }
  return out;
}

export async function hoursReport(since: string, until: string) {
  const from = Date.parse(`${since}T00:00:00-03:00`), to = Date.parse(`${until}T23:59:59-03:00`);
  // janela maior para saber se as tarefas concluídas no período têm tempo (o tempo pode ter sido lançado antes)
  const [list, wide, { data: clients }, { data: doneRows }] = await Promise.all([
    entries(from, to),
    entries(from - 60 * 86400_000, to),
    db().from("clients").select("id, name"),
    db().from("team_tasks").select("id, name, url, area, client_id, assignees, done, date_done, folder_name").eq("done", true)
      .gte("date_done", new Date(from).toISOString()).lte("date_done", new Date(to).toISOString()).limit(5000),
  ]);
  const cname = new Map((clients ?? []).map((c) => [c.id as string, c.name as string]));
  const taskIds = [...new Set(list.map((e) => e.task?.id).filter(Boolean))] as string[];
  const { data: tRows } = taskIds.length ? await db().from("team_tasks").select("id, name, url, area, client_id, assignees, done, date_done, folder_name").in("id", taskIds) : { data: [] };
  const tasks = new Map(((tRows ?? []) as Task[]).map((t) => [t.id, t]));

  type P = { nome: string; ms: number; registros: number; tarefas: Set<string>; porCliente: Record<string, number>; porDia: Record<string, number> };
  const people = new Map<string, P>();
  const person = (nome: string) => {
    const k = pkey(nome);
    let p = people.get(k);
    if (!p) people.set(k, (p = { nome, ms: 0, registros: 0, tarefas: new Set(), porCliente: {}, porDia: {} }));
    return p;
  };
  const byClient: Record<string, number> = {}, byArea: Record<string, number> = {};
  const byTask = new Map<string, { tarefa: string; url: string | null; responsaveis: string[]; cliente: string | null; ms: number }>();
  let total = 0;

  for (const e of list) {
    const dur = Number(e.duration) >= 0 ? Number(e.duration) : Date.now() - Number(e.start); // timer rodando: duração negativa
    total += dur;
    const t = e.task ? tasks.get(e.task.id) : undefined;
    const seen = new Set<string>();
    const resp = (t?.assignees ?? []).filter((a) => !seen.has(pkey(a.name)) && !!seen.add(pkey(a.name))).map((a) => a.name);
    const owners = resp.length ? resp : ["Sem responsável"];
    const share = dur / owners.length;
    const client = t?.client_id ? cname.get(t.client_id) ?? "?" : t ? "Interno (Fonil)" : "Sem tarefa";
    const day = new Date(Number(e.start) - 3 * 3600_000).toISOString().slice(0, 10);
    for (const o of owners) {
      const p = person(o);
      p.ms += share; p.registros += 1; if (e.task) p.tarefas.add(e.task.id);
      p.porCliente[client] = (p.porCliente[client] ?? 0) + share;
      p.porDia[day] = (p.porDia[day] ?? 0) + share;
    }
    byClient[client] = (byClient[client] ?? 0) + dur;
    const area = t?.area ?? (e.task ? "Outros" : "Sem tarefa");
    byArea[area] = (byArea[area] ?? 0) + dur;
    const key = e.task?.id ?? "-";
    const bt = byTask.get(key) ?? { tarefa: t?.name ?? e.task?.name ?? "(sem tarefa)", url: t?.url ?? (e.task ? `https://app.clickup.com/t/${e.task.id}` : null), responsaveis: owners, cliente: client, ms: 0 };
    bt.ms += dur; byTask.set(key, bt);
  }

  // cobertura: tarefas concluídas no período (fora as rotinas) que têm algum tempo lançado
  const withTime = new Set(wide.map((e) => e.task?.id).filter(Boolean) as string[]);
  const cov = new Map<string, { nome: string; concluidas: number; comTempo: number; semTempo: { tarefa: string; url: string; concluidaEm: string }[] }>();
  for (const t of ((doneRows ?? []) as Task[]).filter((t) => !/rotina/i.test(t.folder_name ?? ""))) {
    const seen = new Set<string>();
    for (const a of t.assignees.filter((a) => !seen.has(pkey(a.name)) && !!seen.add(pkey(a.name)))) {
      const k = pkey(a.name);
      const c = cov.get(k) ?? { nome: a.name, concluidas: 0, comTempo: 0, semTempo: [] };
      c.concluidas += 1;
      if (withTime.has(t.id)) c.comTempo += 1;
      else c.semTempo.push({ tarefa: t.name, url: t.url, concluidaEm: (t.date_done ?? "").slice(0, 10) });
      cov.set(k, c);
    }
  }
  const allDone = [...cov.values()].reduce((s, c) => s + c.concluidas, 0), allWith = [...cov.values()].reduce((s, c) => s + c.comTempo, 0);
  const names = new Set([...people.keys(), ...cov.keys()]);
  const pessoas = [...names].map((k) => {
    const p = people.get(k), c = cov.get(k);
    return {
      nome: firstName(p?.nome ?? c!.nome),
      horas: H(p?.ms ?? 0), registros: p?.registros ?? 0, tarefasComTempo: p?.tarefas.size ?? 0,
      concluidas: c?.concluidas ?? 0, concluidasComTempo: c?.comTempo ?? 0,
      coberturaPct: c?.concluidas ? Math.round((c.comTempo / c.concluidas) * 100) : null,
      porCliente: Object.entries(p?.porCliente ?? {}).map(([cliente, ms]) => ({ cliente, horas: H(ms) })).sort((a, b) => b.horas - a.horas),
      porDia: Object.entries(p?.porDia ?? {}).map(([dia, ms]) => ({ dia, horas: H(ms) })).sort((a, b) => a.dia.localeCompare(b.dia)),
      semTempo: (c?.semTempo ?? []).sort((a, b) => b.concluidaEm.localeCompare(a.concluidaEm)),
    };
  }).sort((a, b) => b.horas - a.horas || b.concluidas - a.concluidas);

  const sortH = (o: Record<string, number>) => Object.entries(o).map(([k, ms]) => ({ nome: k, horas: H(ms) })).sort((a, b) => b.horas - a.horas);
  return {
    periodo: { since, until },
    regra: "Todos usam a conta compartilhada Fonil Company, então a hora de cada registro vai para o responsável da tarefa (dividida igualmente entre os responsáveis). Registros sem tarefa ou em tarefa sem responsável aparecem separados.",
    totalHoras: H(total), registros: list.length,
    cobertura: { concluidas: allDone, comTempo: allWith, pct: allDone ? Math.round((allWith / allDone) * 100) : null, obs: "Tarefas concluídas no período, fora as rotinas recorrentes, com tempo lançado nos 60 dias anteriores." },
    pessoas,
    porCliente: sortH(byClient),
    porArea: sortH(byArea),
    topTarefas: [...byTask.values()].map((t) => ({ ...t, horas: H(t.ms), ms: undefined })).sort((a, b) => b.horas - a.horas).slice(0, 15),
  };
}

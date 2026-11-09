import "server-only";
import { db } from "./supabase/server";

const API = "https://api.clickup.com/api/v2";
async function cu<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) throw new Error("CLICKUP_API_TOKEN não definido");
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: { authorization: token, "content-type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { err?: string };
  if (!res.ok) throw new Error(`ClickUp: ${json.err ?? res.status}`);
  return json;
}

type Team = { id: string; name: string; members: { user: { id: number; username: string | null; email: string } }[] };
export const teams = () => cu<{ teams: Team[] }>("/team").then((r) => r.teams);

/** membros do workspace (para escolher o responsável padrão) */
export async function members() {
  const out: { id: number; name: string }[] = [];
  for (const t of await teams()) for (const m of t.members) out.push({ id: m.user.id, name: m.user.username || m.user.email });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** prazo YYYY-MM-DD → 18h de Brasília (meia-noite UTC aparecia como o dia anterior no ClickUp) */
export const dueMs = (day: string) => Date.parse(`${day}T18:00:00-03:00`);

/** aceita id da tarefa ou link (app.clickup.com/t/<id> ou /t/<workspace>/<id>) */
export function parseTaskId(input: string | null | undefined) {
  const s = (input ?? "").trim();
  if (!s) return null;
  const m = s.match(/\/t\/(?:\d+\/)?([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/);
  return m ? m[1] : /^[A-Za-z0-9_-]+$/.test(s) ? s : null;
}
export const taskUrl = (id: string) => `https://app.clickup.com/t/${id}`;

async function defaultAssignee() {
  const { data } = await db().from("settings").select("value").eq("key", "clickup_default_assignee").maybeSingle();
  const id = Number(data?.value);
  return Number.isFinite(id) && id > 0 ? [id] : [];
}
export const spaces = (teamId: string) => cu<{ spaces: { id: string; name: string }[] }>(`/team/${teamId}/space?archived=false`).then((r) => r.spaces);
export async function lists(spaceId: string) {
  const [folders, loose] = await Promise.all([
    cu<{ folders: { id: string; name: string; lists: { id: string; name: string }[] }[] }>(`/space/${spaceId}/folder?archived=false`),
    cu<{ lists: { id: string; name: string }[] }>(`/space/${spaceId}/list?archived=false`),
  ]);
  return [...loose.lists.map((l) => ({ id: l.id, name: l.name })), ...folders.folders.flatMap((f) => f.lists.map((l) => ({ id: l.id, name: `${f.name} / ${l.name}` })))];
}

/** todas as listas do workspace (para escolher no painel) */
export async function allLists() {
  const out: { id: string; name: string }[] = [];
  for (const t of await teams()) for (const s of await spaces(t.id)) for (const l of await lists(s.id)) out.push({ id: l.id, name: `${s.name} / ${l.name}` });
  return out;
}

export async function createTask(input: { listId: string; name: string; description?: string; priority?: 1 | 2 | 3 | 4; dueDate?: string; tags?: string[]; assignees?: number[]; status?: string; clientId?: string | null; source?: string; by?: string }) {
  const assignees = input.assignees?.length ? input.assignees : await defaultAssignee();
  const t = await cu<{ id: string; url: string; name: string }>(`/list/${input.listId}/task`, {
    method: "POST",
    body: {
      name: input.name.slice(0, 250),
      markdown_description: input.description,
      priority: input.priority,
      due_date: input.dueDate ? dueMs(input.dueDate) : undefined,
      due_date_time: input.dueDate ? false : undefined,
      tags: input.tags,
      assignees: assignees.length ? assignees : undefined,
      status: input.status || undefined, // vazio = primeiro status da lista
    },
  });
  await db().from("clickup_tasks").insert({ client_id: input.clientId ?? null, task_id: t.id, url: t.url, name: t.name, source: input.source ?? "manual", created_by: input.by ?? null });
  return t;
}

export const listTasks = (listId: string, includeClosed = false) =>
  cu<{ tasks: { id: string; name: string; status: { status: string }; url: string; due_date: string | null; assignees: { username: string }[] }[] }>(`/list/${listId}/task?include_closed=${includeClosed}&subtasks=true`)
    .then((r) => r.tasks.map((t) => ({ id: t.id, name: t.name, status: t.status.status, url: t.url, due: t.due_date ? new Date(Number(t.due_date)).toISOString().slice(0, 10) : null, assignees: t.assignees.map((a) => a.username) })));

export const commentTask = (taskId: string, text: string) => cu(`/task/${taskId}/comment`, { method: "POST", body: { comment_text: text } });

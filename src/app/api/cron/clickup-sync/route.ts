import { cronOk } from "@/lib/cron";
import { syncClickUpTasks } from "@/lib/tasks";

export const maxDuration = 120;

/** pg_cron a cada 30 min (migração 0005): espelho das tarefas do ClickUp alteradas nos últimos 3 dias */
export async function GET(req: Request) {
  if (!cronOk(req)) return new Response(null, { status: 401 });
  return Response.json(await syncClickUpTasks(3), { headers: { "cache-control": "no-store" } });
}

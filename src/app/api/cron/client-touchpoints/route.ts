import { cronOk } from "@/lib/cron";
import { createTouchpointTask } from "@/lib/touchpoints";

export const maxDuration = 120;

/** pg_cron seg/qua/sex às 08h BRT (migração 0006): tarefa de interação com os clientes ativos no ClickUp */
export async function GET(req: Request) {
  if (!cronOk(req)) return new Response(null, { status: 401 });
  const q = new URL(req.url).searchParams;
  const weekday = q.get("weekday") ? Number(q.get("weekday")) : undefined;
  return Response.json(await createTouchpointTask({ force: q.get("force") === "1", dryRun: q.get("dry") === "1", weekday }), { headers: { "cache-control": "no-store" } });
}

import { cronOk } from "@/lib/cron";
import { createTouchpointTask } from "@/lib/touchpoints";

export const maxDuration = 120;

/** pg_cron seg/qua/sex às 08h BRT (migração 0006): tarefa de interação com os clientes ativos no ClickUp */
export async function GET(req: Request) {
  if (!cronOk(req)) return new Response(null, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  return Response.json(await createTouchpointTask({ force }), { headers: { "cache-control": "no-store" } });
}

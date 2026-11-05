import { cronOk } from "@/lib/cron";
import { syncAll } from "@/lib/sync";

export const maxDuration = 300;

/** pg_cron de hora em hora (migração 0002): últimos 3 dias de Meta e Google */
export async function GET(req: Request) {
  if (!cronOk(req)) return new Response(null, { status: 401 });
  return Response.json(await syncAll({ days: 3, trigger: "cron" }), { headers: { "cache-control": "no-store" } });
}

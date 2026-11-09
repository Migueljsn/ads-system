import { cronOk } from "@/lib/cron";
import { syncAll } from "@/lib/sync";

export const maxDuration = 300;

/**
 * pg_cron de hora em hora (migração 0002): últimos 3 dias de Meta e Google.
 * Uma vez por dia (04h BRT) busca 8 dias: o Meta revisa conversões por até 7 dias
 * (janela de clique) e sem isso os dias antigos ficam com leads a menos.
 */
export async function GET(req: Request) {
  if (!cronOk(req)) return new Response(null, { status: 401 });
  const hourBR = (new Date().getUTCHours() + 21) % 24;
  return Response.json(await syncAll({ days: hourBR === 4 ? 8 : 3, trigger: "cron" }), { headers: { "cache-control": "no-store" } });
}

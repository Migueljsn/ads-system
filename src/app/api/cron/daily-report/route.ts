import { aiEnabled, analyze } from "@/lib/ai";
import { cronOk } from "@/lib/cron";
import { daysAgo } from "@/lib/dates";
import { db } from "@/lib/supabase/server";

export const maxDuration = 300;

/** 08:00 BRT: relatório de IA de ontem (vs. anteontem) para cada cliente com relatório diário ligado → ClickUp */
export async function GET(req: Request) {
  if (!cronOk(req)) return new Response(null, { status: 401 });
  if (!aiEnabled()) return Response.json({ skipped: "sem ANTHROPIC_API_KEY" });
  const { data: flag } = await db().from("settings").select("value").eq("key", "daily_report_enabled").maybeSingle();
  if (flag?.value !== true) return Response.json({ skipped: "relatório diário desligado" });
  const { data: clients } = await db().from("clients").select("id, name").eq("active", true).not("clickup_list_id", "is", null);
  const out = [];
  for (const c of clients ?? []) {
    try {
      const r = await analyze({ since: daysAgo(1), until: daysAgo(1), clientId: c.id, sendToClickUp: true, by: "cron" });
      out.push({ client: c.name, task: r.task?.url ?? null });
    } catch (e) {
      out.push({ client: c.name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return Response.json({ reports: out });
}

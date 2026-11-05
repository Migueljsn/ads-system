import { ActionForm } from "@/components/action-form";
import { aiEnabled } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { allLists } from "@/lib/clickup";
import { adminEmails } from "@/lib/env";
import { db } from "@/lib/supabase/server";
import { saveSettings } from "../actions";

export default async function Config() {
  const user = await requireUser();
  const [{ data: rows }, lists] = await Promise.all([db().from("settings").select("key, value").in("key", ["team_emails", "clickup_default_list", "daily_report_enabled"]), allLists().catch(() => [] as { id: string; name: string }[])]);
  const s = Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]));
  const status = [
    ["Supabase", true], ["ClickUp", Boolean(process.env.CLICKUP_API_TOKEN) && lists.length > 0], ["IA (Anthropic)", aiEnabled()], ["E-mail (Resend)", Boolean(process.env.RESEND_API_KEY)],
    ["Google OAuth (opcional)", Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID)],
  ] as const;
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Configurações</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <ActionForm action={saveSettings}>
            <label className="label">Equipe com acesso (além dos admins: {adminEmails().join(", ")})</label>
            <textarea name="team" defaultValue={((s.team_emails as string[]) ?? []).join("\n")} className="input mb-3 h-24" placeholder="um e-mail por linha" disabled={!user.isAdmin} />
            <label className="label">Lista padrão do ClickUp (quando o cliente não tem lista)</label>
            <select name="clickup_default_list" defaultValue={(s.clickup_default_list as string) ?? ""} className="input mb-3"><option value="">—</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="daily_report" defaultChecked={s.daily_report_enabled === true} /> relatório diário de IA às 08h no ClickUp (clientes com lista)</label>
          </ActionForm>
        </div>
        <div className="card">
          <h2 className="mb-2 font-medium">Integrações</h2>
          {status.map(([n, ok]) => <div key={n} className="flex justify-between border-b border-line py-2 text-sm last:border-0"><span>{n}</span><span className={ok ? "text-emerald-500" : "text-muted"}>{ok ? "ok" : "não configurado"}</span></div>)}
          <p className="mt-3 text-xs text-muted">Sincronização automática: a cada hora (pg_cron do Supabase → /api/cron/sync).</p>
        </div>
      </div>
    </>
  );
}

import { ActionForm } from "@/components/action-form";
import { when } from "@/lib/format";
import { lastRuns, listAccounts } from "@/lib/report";
import { db } from "@/lib/supabase/server";
import { connectGoogle, connectMeta, reimportMeta, removeBm, removeGoogleAccount, syncNow, updateAccount } from "../actions";

export default async function Accounts() {
  const [accounts, runs, { data: bms }, { data: clients }] = await Promise.all([
    listAccounts(), lastRuns(),
    db().from("meta_bms").select("id, name, token_hint, last_sync_at, last_error").order("created_at"),
    db().from("clients").select("id, name").order("name"),
  ]);
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Contas de anúncio</h1>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-1 font-medium">Conectar Meta (Business Manager)</h2>
          <p className="mb-3 text-xs text-muted">BM → Configurações do negócio → Usuários do sistema → gere um token com <code>ads_read</code> (e <code>ads_management</code> para pausar/orçamento) e atribua as contas de anúncio ao usuário do sistema.</p>
          <ActionForm action={connectMeta} submit="Conectar e importar">
            <label className="label">ID do Business Manager</label><input name="id" className="input mb-2" placeholder="1234567890" required />
            <label className="label">Token do System User</label><textarea name="token" className="input h-20 font-mono text-xs" required />
          </ActionForm>
        </div>
        <div className="card">
          <h2 className="mb-1 font-medium">Conectar Google Ads</h2>
          <p className="mb-3 text-xs text-muted">Google Cloud → conta de serviço → chave JSON. Adicione o e-mail da conta de serviço como usuário na conta (ou na MCC) do Google Ads. Informe a MCC para importar todas as contas filhas.</p>
          <ActionForm action={connectGoogle} submit="Conectar">
            <div className="mb-2 grid grid-cols-2 gap-2">
              <div><label className="label">ID da conta (opcional se MCC)</label><input name="id" className="input" placeholder="123-456-7890" /></div>
              <div><label className="label">ID da MCC (opcional)</label><input name="mcc" className="input" placeholder="987-654-3210" /></div>
            </div>
            <label className="label">Chave JSON (arquivo ou colar)</label>
            <input type="file" name="keyFile" accept="application/json,.json" className="mb-2 block text-xs" />
            <textarea name="key" className="input h-16 font-mono text-xs" placeholder='{"type":"service_account",…}' />
          </ActionForm>
        </div>
      </div>

      <div className="card mb-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Contas ({accounts.length})</h2>
          <ActionForm action={syncNow} submit="Sincronizar agora" className="flex flex-wrap items-end gap-2">
            <select name="days" className="input w-auto"><option value="3">3 dias</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="365">1 ano</option></select>
            <select name="platform" className="input w-auto"><option value="">Meta + Google</option><option value="meta">Meta</option><option value="google">Google</option></select>
          </ActionForm>
        </div>
        <div className="overflow-x-auto">
          <table className="t">
            <thead><tr><th>Plataforma</th><th>Conta</th><th>ID</th><th>Cliente</th><th>Status</th><th>Último sync</th><th>Ativa</th><th /></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={`${a.platform}:${a.id}`}>
                  <td className="uppercase text-xs font-semibold">{a.platform}</td>
                  <td>{a.name}{a.last_error && <div className="max-w-xs truncate text-xs text-red-500" title={a.last_error}>{a.last_error}</div>}</td>
                  <td className="font-mono text-xs">{a.id}</td>
                  <td>
                    <form action={updateAccount} className="flex gap-1">
                      <input type="hidden" name="id" value={a.id} /><input type="hidden" name="platform" value={a.platform} />
                      <select name="client" defaultValue={a.client_id ?? ""} className="input w-40 py-1"><option value="">—</option>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                      <button className="btn-ghost py-1">ok</button>
                    </form>
                  </td>
                  <td className="text-xs">{"status" in a ? (a.status as string) : "—"}</td>
                  <td className="text-xs">{when(a.last_sync_at)}</td>
                  <td>
                    <form action={updateAccount}>
                      <input type="hidden" name="id" value={a.id} /><input type="hidden" name="platform" value={a.platform} /><input type="hidden" name="active" value={a.active ? "0" : "1"} />
                      <button className={`rounded-full px-2 py-0.5 text-xs ${a.active ? "bg-emerald-500/15 text-emerald-600" : "bg-black/10 text-muted"}`}>{a.active ? "sim" : "não"}</button>
                    </form>
                  </td>
                  <td>{a.platform === "google" && <form action={removeGoogleAccount}><input type="hidden" name="id" value={a.id} /><button className="text-xs text-red-500">remover</button></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!accounts.length && <p className="py-4 text-center text-sm text-muted">Nenhuma conta conectada.</p>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 font-medium">Business Managers</h2>
          {(bms ?? []).map((b) => (
            <div key={b.id} className="flex items-center justify-between border-b border-line py-2 text-sm last:border-0">
              <div>{b.name} <span className="font-mono text-xs text-muted">{b.id} · token …{b.token_hint}</span>{b.last_error && <div className="text-xs text-red-500">{b.last_error}</div>}</div>
              <div className="flex gap-2">
                <form action={reimportMeta}><input type="hidden" name="bm" value={b.id} /><button className="btn-ghost py-1 text-xs">reimportar contas</button></form>
                <form action={removeBm}><input type="hidden" name="bm" value={b.id} /><button className="text-xs text-red-500">remover</button></form>
              </div>
            </div>
          ))}
          {!bms?.length && <p className="text-sm text-muted">Nenhum BM.</p>}
        </div>
        <div className="card">
          <h2 className="mb-2 font-medium">Últimas sincronizações</h2>
          <table className="t"><tbody>
            {runs.map((r) => (
              <tr key={r.id}><td className="text-xs">{when(r.started_at)}</td><td className="text-xs uppercase">{r.provider}</td><td className="text-xs">{r.trigger}</td>
                <td className={`text-xs ${r.status === "success" ? "text-emerald-500" : r.status === "running" ? "text-muted" : "text-red-500"}`} title={r.error ?? ""}>{r.status}</td><td className="n text-xs">{r.rows} linhas</td></tr>
            ))}
          </tbody></table>
          {!runs.length && <p className="text-sm text-muted">Ainda não rodou. O cron roda a cada hora (minuto 17).</p>}
        </div>
      </div>
    </>
  );
}

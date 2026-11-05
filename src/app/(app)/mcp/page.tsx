import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { APP_URL } from "@/lib/env";
import { when } from "@/lib/format";
import { db } from "@/lib/supabase/server";
import { tools } from "@/lib/tools";
import { newApiKey, revokeApiKey } from "../actions";

export default async function ApiPage() {
  const { data: keys } = await db().from("api_keys").select("id, name, prefix, scopes, created_at, last_used_at, revoked_at, created_by").order("created_at", { ascending: false });
  const mcp = `${APP_URL}/api/mcp`;
  const code = "rounded-lg border border-line bg-black/5 p-3 text-xs overflow-x-auto dark:bg-white/5";
  return (
    <>
      <PageHeader title="API & MCP" subtitle="Conecte o Claude, Cursor, n8n e outras ferramentas aos seus dados de anúncios." />
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="card-title">Nova chave</h2>
          <ActionForm action={newApiKey} submit="Criar chave">
            <label className="label">Nome (quem vai usar)</label><input name="name" className="input mb-2" placeholder="Claude Desktop do Miguel" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="write" /> permitir escrita (pausar, orçamento, ClickUp, sync)</label>
          </ActionForm>
        </div>
        <div className="card overflow-x-auto">
          <h2 className="card-title">Chaves</h2>
          <table className="t"><tbody>
            {(keys ?? []).map((k) => (
              <tr key={k.id} className={k.revoked_at ? "opacity-40" : ""}>
                <td>{k.name}<div className="font-mono text-[10px] text-muted">{k.prefix}…</div></td><td className="text-xs">{k.scopes.join("+")}</td><td className="text-xs">uso: {when(k.last_used_at)}</td>
                <td>{!k.revoked_at && <form action={revokeApiKey}><input type="hidden" name="id" value={k.id} /><button className="text-xs text-bad">revogar</button></form>}</td>
              </tr>
            ))}
          </tbody></table>
          {!keys?.length && <p className="text-sm text-muted">Nenhuma chave.</p>}
        </div>
      </div>

      <div className="card mb-4 space-y-3 text-sm">
        <h2 className="card-title">Conectar ao Claude (MCP)</h2>
        <p>Claude Code:</p>
        <pre className={code}>{`claude mcp add --transport http fonil-ads ${mcp} --header "Authorization: Bearer fads_SUA_CHAVE"`}</pre>
        <p>Claude Desktop / Cursor (<code>claude_desktop_config.json</code> / <code>mcp.json</code>):</p>
        <pre className={code}>{JSON.stringify({ mcpServers: { "fonil-ads": { command: "npx", args: ["-y", "mcp-remote", mcp, "--header", "Authorization: Bearer fads_SUA_CHAVE"] } } }, null, 2)}</pre>
        <p>claude.ai (Conectores personalizados) ou clientes sem cabeçalho: use a chave no caminho — <code>{mcp}/fads_SUA_CHAVE</code></p>
      </div>

      <div className="card mb-4 space-y-3 text-sm">
        <h2 className="card-title">API REST</h2>
        <p>Autenticação: <code>Authorization: Bearer fads_…</code>. Toda ferramenta do MCP também é um endpoint:</p>
        <pre className={code}>{`GET  ${APP_URL}/api/v1/tools/_list                      # catálogo + JSON Schema
GET  ${APP_URL}/api/v1/performance?days=30&groupBy=campaign&platform=meta
GET  ${APP_URL}/api/v1/accounts
GET  ${APP_URL}/api/v1/clients
POST ${APP_URL}/api/v1/sync            {"days":3}
POST ${APP_URL}/api/v1/tools/{nome}    {…parâmetros…}`}</pre>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="card-title">Ferramentas ({tools.length})</h2>
        <table className="t"><tbody>
          {tools.map((t) => <tr key={t.name}><td className="font-mono text-xs">{t.name}</td><td className="text-xs">{t.scope}</td><td className="whitespace-normal text-xs text-muted">{t.description}</td></tr>)}
        </tbody></table>
      </div>
    </>
  );
}

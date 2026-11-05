import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyApiKey } from "@/lib/auth";
import { runTool, tools } from "@/lib/tools";

export const maxDuration = 300;

/*
 * Servidor MCP (Streamable HTTP). Autenticação: chave fads_… no cabeçalho
 *   Authorization: Bearer fads_…   (Claude Code, Cursor, mcp-remote, n8n)
 * ou no caminho /api/mcp/fads_… (para clientes que não mandam cabeçalho, ex.: conector do claude.ai).
 */
const mcp = createMcpHandler(
  (server) => {
    for (const t of tools) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (server.registerTool as any).call(
        server,
        t.name,
        { title: t.title, description: `${t.description}${t.scope === "write" ? " [escrita]" : ""}`, inputSchema: t.input as never },
        async (input: unknown, ctx: { http?: { authInfo?: { clientId?: string; scopes?: string[] } } }) => {
          const auth = ctx.http?.authInfo;
          try {
            const out = await runTool(t.name, input, { by: `mcp:${auth?.clientId ?? "?"}`, scopes: auth?.scopes ?? [], source: "mcp" });
            return { content: [{ type: "text" as const, text: typeof out === "string" ? out : JSON.stringify(out, null, 2) }] };
          } catch (e) {
            return { isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }] };
          }
        },
      );
    }
  },
  { serverInfo: { name: "fonil-ads", version: "1.0.0" } },
);

const handler = withMcpAuth(
  mcp,
  async (req, token) => {
    const fromPath = new URL(req.url).pathname.split("/").find((p) => p.startsWith("fads_"));
    const key = await verifyApiKey(token ?? fromPath);
    return key ? { token: key.id, clientId: key.name, scopes: key.scopes } : undefined;
  },
  { required: true },
);

export { handler as GET, handler as POST, handler as DELETE };

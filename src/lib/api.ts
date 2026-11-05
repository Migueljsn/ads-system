import "server-only";
import { bearer, verifyApiKey } from "./auth";
import { runTool, ToolError, type Ctx } from "./tools";

/** envolve uma rota REST: autentica a chave, roda e devolve JSON com erros padronizados */
export function api(fn: (req: Request, ctx: Ctx, params: Record<string, string>) => Promise<unknown>) {
  return async (req: Request, { params }: { params: Promise<Record<string, string>> }) => {
    const key = await verifyApiKey(bearer(req));
    if (!key) return Response.json({ error: "chave de API ausente ou inválida (Authorization: Bearer fads_…)" }, { status: 401 });
    try {
      const out = await fn(req, { by: `api:${key.name}`, scopes: key.scopes, source: "api" }, await params);
      return Response.json(out, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      const status = e instanceof ToolError ? e.status : 500;
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status });
    }
  };
}

export const queryInput = (req: Request) => {
  const o: Record<string, unknown> = {};
  for (const [k, v] of new URL(req.url).searchParams) o[k] = /^\d+$/.test(v) && !["accountId", "campaignId", "objectId", "listId"].includes(k) ? Number(v) : v === "true" ? true : v === "false" ? false : v;
  return o;
};
export const call = (name: string, input: unknown, ctx: Ctx) => runTool(name, input, ctx);

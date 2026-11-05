import { api, call, queryInput } from "@/lib/api";
import { tools } from "@/lib/tools";
import { z } from "zod";

export const maxDuration = 300;

/** GET /api/v1/tools/{nome}?param=… (leitura) · POST /api/v1/tools/{nome} com JSON (qualquer ferramenta) */
export const GET = api(async (req, ctx, p) => {
  if (p.name === "_list") return tools.map((t) => ({ name: t.name, title: t.title, description: t.description, scope: t.scope, input: z.toJSONSchema(t.input) }));
  return call(p.name, queryInput(req), ctx);
});
export const POST = api(async (req, ctx, p) => call(p.name, await req.json().catch(() => ({})), ctx));

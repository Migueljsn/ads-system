import "server-only";
import { redirect } from "next/navigation";
import { randomToken, sha256 } from "./crypto";
import { adminEmails } from "./env";
import { db, supabaseUser } from "./supabase/server";

export async function allowedEmails() {
  const { data } = await db().from("settings").select("value").eq("key", "team_emails").maybeSingle();
  const extra = Array.isArray(data?.value) ? (data.value as string[]) : [];
  return new Set([...adminEmails(), ...extra.map((e) => e.toLowerCase())]);
}

/** usuário logado e autorizado (painel); senão manda pro login */
export async function requireUser() {
  const sb = await supabaseUser();
  const { data } = await sb.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) redirect("/login");
  if (!(await allowedEmails()).has(email)) redirect("/login?e=forbidden");
  return { email, isAdmin: adminEmails().includes(email) };
}

/* ---------- chaves de API (REST e MCP) ---------- */
export const KEY_PREFIX = "fads_";

export async function createApiKey(name: string, scopes: string[], by: string) {
  const key = `${KEY_PREFIX}${randomToken(32)}`;
  const { error } = await db().from("api_keys").insert({ name, prefix: key.slice(0, 12), key_hash: sha256(key), scopes, created_by: by });
  if (error) throw new Error(error.message);
  return key;
}

export async function verifyApiKey(key: string | null | undefined) {
  if (!key || !key.startsWith(KEY_PREFIX)) return null;
  const { data } = await db().from("api_keys").select("id, name, scopes, revoked_at").eq("key_hash", sha256(key)).maybeSingle();
  if (!data || data.revoked_at) return null;
  void db().from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {});
  return { id: data.id as string, name: data.name as string, scopes: data.scopes as string[] };
}

export const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || req.headers.get("x-api-key") || null;

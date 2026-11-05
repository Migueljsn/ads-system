// Cria uma chave de API pelo terminal. Uso: node --env-file=.env.local scripts/create-key.mjs "nome" [write]
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const [name = "cli", write] = process.argv.slice(2);
const key = `fads_${randomBytes(32).toString("base64url")}`;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { error } = await sb.from("api_keys").insert({ name, prefix: key.slice(0, 12), key_hash: createHash("sha256").update(key).digest("hex"), scopes: write ? ["read", "write"] : ["read"], created_by: "cli" });
if (error) throw error;
console.log(key);

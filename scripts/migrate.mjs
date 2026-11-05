// Aplica supabase/migrations/*.sql pela Management API do Supabase.
// Uso: SUPABASE_ACCESS_TOKEN=... node scripts/migrate.mjs   (token pessoal: supabase.com/dashboard/account/tokens)
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

process.loadEnvFile?.(".env.local");
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
if (!token) throw new Error("defina SUPABASE_ACCESS_TOKEN");
const q = async (query) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
};
await q("create table if not exists public._migrations (name text primary key, applied_at timestamptz default now()); alter table public._migrations enable row level security;");
const done = new Set((await q("select name from public._migrations")).map((r) => r.name));
const dir = path.join(process.cwd(), "supabase", "migrations");
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(file)) continue;
  process.stdout.write(`→ ${file} … `);
  const sql = readFileSync(path.join(dir, file), "utf8");
  await q(`begin;\n${sql}\ninsert into public._migrations (name) values ('${file}');\ncommit;`);
  console.log("ok");
}

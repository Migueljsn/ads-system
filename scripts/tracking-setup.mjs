// Prepara o acesso de leitura do Fonil Ads ao banco do tracking (Fonil CRM).
// 1) aplica supabase/tracking/*.sql no projeto do tracking pela Management API;
// 2) cria/atualiza o usuário fads_reader (só SELECT no schema fads) com senha aleatória;
// 3) grava TRACKING_DATABASE_URL no .env.local (a senha nunca é impressa).
// Uso: node scripts/tracking-setup.mjs [--rotate]
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";

process.loadEnvFile?.(".env.local");
const REF = process.env.TRACKING_SUPABASE_REF || "oifwaymkjhlpxgtafotk";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error("defina SUPABASE_ACCESS_TOKEN no .env.local");
const api = async (p, init = {}) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}${p}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${p} -> ${res.status} ${JSON.stringify(body)?.slice(0, 300)}`);
  return body;
};
const q = (query) => api("/database/query", { method: "POST", body: JSON.stringify({ query }) });

const dir = path.join(process.cwd(), "supabase", "tracking");
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  await q(readFileSync(path.join(dir, f), "utf8"));
  console.log(`views: ${f} ok`);
}

const envFile = ".env.local";
const env = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const has = /^TRACKING_DATABASE_URL=/m.test(env);
if (!has || process.argv.includes("--rotate")) {
  const pw = randomBytes(24).toString("hex");
  await q(`do $$ begin
    if not exists (select from pg_roles where rolname = 'fads_reader') then create role fads_reader login password '${pw}';
    else alter role fads_reader with login password '${pw}'; end if; end $$;
    alter role fads_reader set statement_timeout = '20s';
    grant usage on schema fads to fads_reader;
    grant select on all tables in schema fads to fads_reader;`);
  const pooler = await api("/config/database/pooler");
  const p = (Array.isArray(pooler) ? pooler : [pooler]).find((x) => x.database_type === "PRIMARY") ?? pooler[0];
  const url = `postgresql://fads_reader.${REF}:${pw}@${p.db_host}:5432/postgres`;
  const line = `TRACKING_DATABASE_URL=${url}`;
  writeFileSync(envFile, has ? env.replace(/^TRACKING_DATABASE_URL=.*$/m, line) : `${env.replace(/\n?$/, "\n")}${line}\n`);
  process.env.TRACKING_DATABASE_URL = url;
  console.log(`usuário fads_reader ${has ? "com senha nova" : "criado"}; TRACKING_DATABASE_URL gravada no .env.local (host ${p.db_host})`);
} else {
  await q(`grant select on all tables in schema fads to fads_reader;`);
  console.log("TRACKING_DATABASE_URL já existe (use --rotate para trocar a senha)");
}

// teste com o próprio usuário de leitura
const c = new pg.Client({ connectionString: process.env.TRACKING_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`select (select sum(leads) from fads.lead_daily) leads, (select sum(sales) from fads.sale_daily) sales, (select count(*) from fads.pipeline_now) stages`);
console.log("teste de leitura:", r.rows[0]);
const deny = await c.query(`select count(*) from public."ClientSettings"`).then(() => "ERRO: conseguiu ler ClientSettings", (e) => `bloqueado ok (${e.code})`);
console.log("acesso a ClientSettings:", deny);
await c.end();

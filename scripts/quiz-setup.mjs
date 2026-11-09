// QuizzBuilder (Neon) read-only access for Fonil Ads.
//   node scripts/quiz-setup.mjs init   → new random password; writes QUIZ_DATABASE_URL
//        to .env.local and a role SQL (SCRAM verifier only, never the password)
//        to the path given as 2nd arg. Run that SQL + supabase/quiz/0001_fads_views.sql
//        in the Neon SQL editor.
//   node scripts/quiz-setup.mjs test   → checks the views and that base tables are blocked.
import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";

const HOST = "ep-weathered-night-acac1dmi-pooler.sa-east-1.aws.neon.tech";
const ROLE = "fads_reader";
const mode = process.argv[2];

function scram(password) {
  const salt = crypto.randomBytes(16), iter = 4096;
  const salted = crypto.pbkdf2Sync(password, salt, iter, 32, "sha256");
  const hmac = (k, m) => crypto.createHmac("sha256", k).update(m).digest();
  const stored = crypto.createHash("sha256").update(hmac(salted, "Client Key")).digest();
  const server = hmac(salted, "Server Key");
  return `SCRAM-SHA-256$${iter}:${salt.toString("base64")}$${stored.toString("base64")}:${server.toString("base64")}`;
}

if (mode === "init") {
  const out = process.argv[3];
  const pw = crypto.randomBytes(24).toString("base64url");
  const url = `postgresql://${ROLE}:${pw}@${HOST}/neondb?sslmode=require`;
  let env = fs.readFileSync(".env.local", "utf8").replace(/^QUIZ_DATABASE_URL=.*\n?/m, "");
  if (!env.endsWith("\n")) env += "\n";
  fs.writeFileSync(".env.local", env + `QUIZ_DATABASE_URL=${url}\n`);
  const v = scram(pw);
  fs.writeFileSync(out, `do $$ begin
  if not exists (select 1 from pg_roles where rolname = '${ROLE}') then
    create role ${ROLE} login password '${v}';
  else
    alter role ${ROLE} login password '${v}';
  end if;
end $$;
alter role ${ROLE} set statement_timeout = '20s';
alter role ${ROLE} set default_transaction_read_only = on;
grant usage on schema fads to ${ROLE};
grant select on all tables in schema fads to ${ROLE};
revoke all on all tables in schema public from ${ROLE};
`);
  console.log("ok: QUIZ_DATABASE_URL written; role SQL at", out);
} else if (mode === "test") {
  process.loadEnvFile(".env.local");
  const c = new pg.Client({ connectionString: process.env.QUIZ_DATABASE_URL });
  await c.connect();
  for (const v of ["quizzes", "quiz_lead_daily", "quiz_profile_daily", "quiz_step_daily", "quiz_answer_daily"]) {
    const r = await c.query(`select count(*)::int n from fads.${v}`);
    console.log(v, r.rows[0].n);
  }
  for (const t of ["leads", "user_profiles", "quizzes"]) {
    try { await c.query(`select 1 from public.${t} limit 1`); console.log("WARNING: can read", t); }
    catch (e) { console.log(t, "blocked", e.code); }
  }
  await c.end();
} else console.log("usage: init <out.sql> | test");

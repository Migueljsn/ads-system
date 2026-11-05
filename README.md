# Fonil Ads

Meta Ads + Google Ads → Supabase, com painel, **API REST**, **servidor MCP** (Claude/Cursor), **IA** (Claude) e **ClickUp**.
Lógica de anúncios baseada no `shortdrama` (System User da Meta + conta de serviço do Google, sync horário).

- Painel: https://trafego.fonilgroup.com.br (login por código no e-mail)
- MCP: `https://trafego.fonilgroup.com.br/api/mcp` (Authorization: Bearer fads_…) — chaves em **API & MCP**
- REST: `/api/v1/tools/_list`, `/api/v1/performance`, `/api/v1/accounts`, `/api/v1/clients`, `/api/v1/sync`, `/api/v1/tools/{nome}`

## Stack
Next.js 16 (standalone, Docker) no EasyPanel · Supabase (Postgres + Auth + pg_cron) · Resend (e-mail) · ClickUp API · Anthropic.

## Estrutura
- `src/lib/meta.ts`, `src/lib/google.ts` — integração, sync e ações ao vivo
- `src/lib/report.ts` — métricas unificadas (view `ads_daily_unified`)
- `src/lib/tools.ts` — registro único de ferramentas (MCP + REST + IA)
- `src/lib/ai.ts` — análise e chat com ferramentas
- `src/lib/clickup.ts` — listas/tarefas
- `supabase/migrations` — schema e cron (`scripts/migrate.mjs` com SUPABASE_ACCESS_TOKEN)

## Local
```bash
cp .env.example .env.local   # preencha
npm i && npm run dev
node --env-file=.env.local scripts/create-key.mjs "meu-nome" write   # chave de API pelo terminal
```

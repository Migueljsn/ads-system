-- Ads System (Fonil): Meta + Google Ads → Supabase, exposto por painel, API REST e MCP.
-- Tudo acessado só pelo service role (RLS ligado, sem policies). Tokens criptografados pelo app (AES-256-GCM).
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

-- clientes da agência (cada conta de anúncio pode pertencer a um cliente)
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  clickup_list_id text,            -- lista do ClickUp onde caem tarefas/relatórios desse cliente
  notes text,
  monthly_budget numeric(14,2),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

/* ---------- Meta ---------- */
create table if not exists public.meta_bms (
  id text primary key,
  name text not null,
  token_enc text not null,
  token_hint text,
  active boolean not null default true,
  last_sync_at timestamptz,
  last_error text,
  created_by text,
  created_at timestamptz not null default now()
);
create table if not exists public.meta_ad_accounts (
  id text primary key,                 -- act_123
  bm_id text not null references public.meta_bms (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  name text not null,
  currency text,
  timezone text,
  status text,
  active boolean not null default true,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create table if not exists public.meta_ad_daily (
  account_id text not null references public.meta_ad_accounts (id) on delete cascade,
  date date not null,
  campaign_id text not null,
  campaign_name text,
  campaign_objective text,
  adset_id text not null,
  adset_name text,
  ad_id text not null,
  ad_name text,
  spend numeric(14,2) not null default 0,
  currency text,
  impressions bigint not null default 0,
  reach bigint,
  clicks bigint not null default 0,
  link_clicks bigint not null default 0,
  purchases numeric(14,2) not null default 0,
  purchase_value numeric(14,2) not null default 0,
  leads numeric(14,2) not null default 0,
  messages numeric(14,2) not null default 0,     -- conversas iniciadas (WhatsApp/Direct)
  actions jsonb,                                  -- todas as ações cruas da Meta
  synced_at timestamptz not null default now(),
  primary key (account_id, date, ad_id)
);
create index if not exists meta_ad_daily_date_idx on public.meta_ad_daily (date);
create index if not exists meta_ad_daily_campaign_idx on public.meta_ad_daily (campaign_id);

/* ---------- Google ---------- */
create table if not exists public.google_ads_accounts (
  id text primary key,                 -- customer id, só números
  client_id uuid references public.clients (id) on delete set null,
  login_customer_id text,              -- MCC, quando o acesso vem pela conta gerente
  name text not null,
  currency text,
  timezone text,
  auth_type text not null default 'service_account', -- service_account | oauth
  sa_email text,
  key_enc text not null,               -- JSON da conta de serviço OU refresh token OAuth, criptografado
  active boolean not null default true,
  last_sync_at timestamptz,
  last_error text,
  created_by text,
  created_at timestamptz not null default now()
);
create table if not exists public.google_ads_daily (
  account_id text not null references public.google_ads_accounts (id) on delete cascade,
  date date not null,
  campaign_id text not null,
  campaign_name text,
  campaign_type text,
  ad_group_id text not null,           -- '-' = gasto fora de grupos (PMax)
  ad_group_name text,
  cost numeric(14,2) not null default 0,
  currency text,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  conversions numeric(14,2) not null default 0,
  conversions_value numeric(14,2) not null default 0,
  synced_at timestamptz not null default now(),
  primary key (account_id, date, campaign_id, ad_group_id)
);
create index if not exists google_ads_daily_date_idx on public.google_ads_daily (date);

/* ---------- visão unificada ---------- */
create or replace view public.ads_daily_unified as
  select 'meta'::text as platform, m.account_id, a.name as account_name, a.client_id, m.date,
         m.campaign_id, m.campaign_name, m.adset_id as group_id, m.adset_name as group_name,
         m.ad_id, m.ad_name, m.spend, m.currency, m.impressions, m.clicks,
         (m.purchases + m.leads + m.messages) as conversions, m.purchase_value as conversion_value,
         m.leads, m.messages, m.purchases
    from public.meta_ad_daily m join public.meta_ad_accounts a on a.id = m.account_id
  union all
  select 'google', g.account_id, a.name, a.client_id, g.date,
         g.campaign_id, g.campaign_name, g.ad_group_id, g.ad_group_name,
         null, null, g.cost, g.currency, g.impressions, g.clicks,
         g.conversions, g.conversions_value, 0, 0, 0
    from public.google_ads_daily g join public.google_ads_accounts a on a.id = g.account_id;

create table if not exists public.sync_runs (
  id bigint generated always as identity primary key,
  provider text not null,              -- meta | google
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  trigger text not null default 'cron',
  accounts_ok int not null default 0,
  accounts_failed int not null default 0,
  rows int not null default 0,
  error text
);

/* ---------- acesso por API / MCP ---------- */
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  prefix text not null,                -- primeiros caracteres, para reconhecer
  key_hash text not null unique,       -- sha256 da chave
  scopes text[] not null default '{read}',  -- read | write
  created_by text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

/* ---------- IA e ClickUp ---------- */
create table if not exists public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete cascade,
  since date not null,
  until date not null,
  model text,
  content text not null,
  clickup_task_id text,
  created_by text,
  created_at timestamptz not null default now()
);
create table if not exists public.clickup_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete set null,
  task_id text not null,
  url text,
  name text not null,
  source text not null default 'manual',   -- manual | ai | alert | mcp | api
  created_by text,
  created_at timestamptz not null default now()
);

alter table public.settings enable row level security;
alter table public.clients enable row level security;
alter table public.meta_bms enable row level security;
alter table public.meta_ad_accounts enable row level security;
alter table public.meta_ad_daily enable row level security;
alter table public.google_ads_accounts enable row level security;
alter table public.google_ads_daily enable row level security;
alter table public.sync_runs enable row level security;
alter table public.api_keys enable row level security;
alter table public.ai_reports enable row level security;
alter table public.clickup_tasks enable row level security;
revoke all on public.ads_daily_unified from anon, authenticated;

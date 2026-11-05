import "server-only";
import { decrypt, encrypt } from "./crypto";
import { db } from "./supabase/server";

/*
 * Meta Marketing API (baseado no shortdrama/lib/meta-ads):
 *  - token do System User do BM criptografado no banco; vai no cabeçalho Authorization, nunca na URL;
 *  - sync horário (pg_cron) dos últimos 3 dias, por anúncio/dia; métricas de compra, lead e conversa.
 */
const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION || "v21.0"}`;

export class MetaError extends Error {
  constructor(message: string, public status: number, public code?: number) {
    super(message);
  }
}

async function graph<T>(path: string, token: string, params: Record<string, string> = {}, init?: { method?: string; body?: Record<string, string> }): Promise<T> {
  const url = path.startsWith("https://") ? new URL(path) : new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, ...(init?.body ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body: init?.body ? new URLSearchParams(init.body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_user_msg?: string } };
  if (!res.ok) throw new MetaError(json.error?.error_user_msg ?? json.error?.message ?? `Meta HTTP ${res.status}`, res.status, json.error?.code);
  return json as T;
}
async function graphAll<T>(path: string, token: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let page = await graph<{ data: T[]; paging?: { next?: string } }>(path, token, params);
  out.push(...page.data);
  for (let i = 0; page.paging?.next && i < 200; i++) {
    const next = new URL(page.paging.next);
    next.searchParams.delete("access_token");
    page = await graph<{ data: T[]; paging?: { next?: string } }>(next.toString(), token);
    out.push(...page.data);
  }
  return out;
}

const STATUS: Record<number, string> = { 1: "ativa", 2: "desativada", 3: "pendente de pagamento", 7: "em análise de risco", 8: "pendente de acerto", 9: "em período de carência", 100: "fechamento pendente", 101: "fechada" };

export async function checkBm(bmId: string, token: string) {
  const bm = await graph<{ id: string; name: string }>(`/${bmId}`, token, { fields: "id,name" });
  return bm.name;
}

export async function listBmAccounts(bmId: string, token: string) {
  const fields = { fields: "id,name,currency,timezone_name,account_status", limit: "200" };
  type A = { id: string; name: string; currency: string; timezone_name: string; account_status: number };
  const [owned, client] = await Promise.all([
    graphAll<A>(`/${bmId}/owned_ad_accounts`, token, fields),
    graphAll<A>(`/${bmId}/client_ad_accounts`, token, fields).catch(() => [] as A[]),
  ]);
  const seen = new Map<string, A>();
  for (const a of [...owned, ...client]) seen.set(a.id, a);
  return [...seen.values()].map((a) => ({ id: a.id, name: a.name, currency: a.currency, timezone: a.timezone_name, status: STATUS[a.account_status] ?? String(a.account_status) }));
}

export async function saveBm(input: { id: string; name: string; token: string; by: string }) {
  const { error } = await db().from("meta_bms").upsert({ id: input.id, name: input.name, token_enc: encrypt(input.token), token_hint: input.token.slice(-4), active: true, created_by: input.by, last_error: null });
  if (error) throw new Error(error.message);
}

export async function bmToken(bmId: string) {
  const { data } = await db().from("meta_bms").select("token_enc").eq("id", bmId).maybeSingle();
  return data ? decrypt(data.token_enc as string) : null;
}

/** token da conta (via BM dona dela) */
export async function accountToken(accountId: string) {
  const { data } = await db().from("meta_ad_accounts").select("bm_id").eq("id", accountId).maybeSingle();
  if (!data) throw new Error(`conta Meta ${accountId} não cadastrada`);
  const t = await bmToken(data.bm_id as string);
  if (!t) throw new Error("BM sem token");
  return t;
}

/** importa (ou atualiza) as contas de anúncio do BM; novas entram ativas */
export async function importAccounts(bmId: string) {
  const token = await bmToken(bmId);
  if (!token) throw new Error("BM sem token");
  const accounts = await listBmAccounts(bmId, token);
  const { data: existing } = await db().from("meta_ad_accounts").select("id").in("id", accounts.map((a) => a.id));
  const known = new Set((existing ?? []).map((e) => e.id));
  for (const a of accounts) {
    const row = { id: a.id, bm_id: bmId, name: a.name, currency: a.currency, timezone: a.timezone, status: a.status };
    if (known.has(a.id)) await db().from("meta_ad_accounts").update(row).eq("id", a.id);
    else await db().from("meta_ad_accounts").insert({ ...row, active: true });
  }
  return accounts.length;
}

type Action = { action_type: string; value: string };
type Insight = {
  date_start: string;
  campaign_id: string; campaign_name?: string; objective?: string; adset_id: string; adset_name?: string; ad_id: string; ad_name?: string;
  spend?: string; impressions?: string; clicks?: string; inline_link_clicks?: string; reach?: string;
  actions?: Action[]; action_values?: Action[];
};
const first = (list: Action[] | undefined, types: string[]) => {
  for (const t of types) {
    const f = list?.find((a) => a.action_type === t);
    if (f) return Number(f.value) || 0;
  }
  return 0;
};
const PURCHASE = ["omni_purchase", "offsite_conversion.fb_pixel_purchase", "purchase"];
const LEAD = ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped", "leadgen_grouped"];
const MESSAGE = ["onsite_conversion.messaging_conversation_started_7d"];

/** sincroniza gasto por anúncio/dia das contas ativas (ou de uma só) no intervalo YYYY-MM-DD */
export async function syncMeta(opts: { since: string; until: string; trigger: string; accountId?: string }) {
  const sb = db();
  const { data: run } = await sb.from("sync_runs").insert({ provider: "meta", trigger: opts.trigger }).select("id").single();
  let q = sb.from("meta_ad_accounts").select("id, bm_id, currency").eq("active", true);
  if (opts.accountId) q = q.eq("id", opts.accountId);
  const [{ data: bms }, { data: accounts }] = await Promise.all([sb.from("meta_bms").select("id, token_enc").eq("active", true), q]);
  const tokens = new Map((bms ?? []).map((b) => [b.id as string, decrypt(b.token_enc as string)]));
  let ok = 0, failed = 0, rows = 0;
  const errors: string[] = [];
  for (const acc of accounts ?? []) {
    const token = tokens.get(acc.bm_id as string);
    if (!token) continue;
    try {
      const data = await graphAll<Insight>(`/${acc.id}/insights`, token, {
        level: "ad",
        time_increment: "1",
        time_range: JSON.stringify({ since: opts.since, until: opts.until }),
        fields: "campaign_id,campaign_name,objective,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,inline_link_clicks,reach,actions,action_values",
        limit: "500",
      });
      const now = new Date().toISOString();
      const out = data.map((r) => ({
        account_id: acc.id,
        date: r.date_start,
        campaign_id: r.campaign_id,
        campaign_name: r.campaign_name ?? null,
        campaign_objective: r.objective ?? null,
        adset_id: r.adset_id,
        adset_name: r.adset_name ?? null,
        ad_id: r.ad_id,
        ad_name: r.ad_name ?? null,
        spend: Number(r.spend ?? 0),
        currency: (acc.currency as string | null) ?? "BRL",
        impressions: Number(r.impressions ?? 0),
        reach: r.reach ? Number(r.reach) : null,
        clicks: Number(r.clicks ?? 0),
        link_clicks: Number(r.inline_link_clicks ?? 0),
        purchases: first(r.actions, PURCHASE),
        purchase_value: first(r.action_values, PURCHASE),
        leads: first(r.actions, LEAD),
        messages: first(r.actions, MESSAGE),
        actions: r.actions ?? null,
        synced_at: now,
      }));
      await sb.from("meta_ad_daily").delete().eq("account_id", acc.id).gte("date", opts.since).lte("date", opts.until);
      for (let i = 0; i < out.length; i += 500) {
        const { error } = await sb.from("meta_ad_daily").upsert(out.slice(i, i + 500));
        if (error) throw new Error(error.message);
      }
      rows += out.length;
      ok++;
      await sb.from("meta_ad_accounts").update({ last_sync_at: now, last_error: null }).eq("id", acc.id);
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${acc.id}: ${msg}`);
      await sb.from("meta_ad_accounts").update({ last_error: msg.slice(0, 300) }).eq("id", acc.id);
    }
  }
  for (const id of tokens.keys()) await sb.from("meta_bms").update({ last_sync_at: new Date().toISOString() }).eq("id", id);
  const status = failed && !ok ? "error" : failed ? "partial" : "success";
  if (run) await sb.from("sync_runs").update({ finished_at: new Date().toISOString(), status, accounts_ok: ok, accounts_failed: failed, rows, error: errors.join(" | ").slice(0, 1000) || null }).eq("id", run.id);
  return { provider: "meta", status, ok, failed, rows, errors };
}

/* ---------- ao vivo (consulta e ações; usados pela IA/MCP) ---------- */

export async function liveCampaigns(accountId: string) {
  const token = await accountToken(accountId);
  return graphAll<{ id: string; name: string; status: string; effective_status: string; objective?: string; daily_budget?: string; lifetime_budget?: string }>(
    `/${accountId}/campaigns`, token, { fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget", limit: "200" },
  );
}

export async function liveAdsets(accountId: string, campaignId?: string) {
  const token = await accountToken(accountId);
  return graphAll<{ id: string; name: string; campaign_id: string; status: string; effective_status: string; daily_budget?: string; lifetime_budget?: string; optimization_goal?: string }>(
    `/${campaignId ?? accountId}/adsets`, token, { fields: "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal", limit: "200" },
  );
}

export async function accountBalance(accountId: string) {
  const token = await accountToken(accountId);
  const info = await graph<{ amount_spent?: string; balance?: string; currency?: string; spend_cap?: string; account_status?: number; disable_reason?: number; funding_source_details?: { display_string?: string } }>(
    `/${accountId}`, token, { fields: "amount_spent,balance,currency,spend_cap,account_status,disable_reason,funding_source_details" },
  );
  return {
    currency: info.currency,
    status: info.account_status ? STATUS[info.account_status] ?? String(info.account_status) : null,
    amountSpentLifetime: info.amount_spent ? Number(info.amount_spent) / 100 : null,
    unbilledBalance: info.balance ? Number(info.balance) / 100 : null,
    spendCap: info.spend_cap ? Number(info.spend_cap) / 100 : null,
    paymentMethod: info.funding_source_details?.display_string ?? null,
  };
}

/** pausa/ativa campanha, conjunto ou anúncio */
export async function setStatus(accountId: string, objectId: string, status: "ACTIVE" | "PAUSED") {
  const token = await accountToken(accountId);
  return graph<{ success: boolean }>(`/${objectId}`, token, {}, { method: "POST", body: { status } });
}

/** muda orçamento diário (valor na moeda da conta, ex.: 150.00) de campanha (CBO) ou conjunto */
export async function setDailyBudget(accountId: string, objectId: string, amount: number) {
  const token = await accountToken(accountId);
  return graph<{ success: boolean }>(`/${objectId}`, token, {}, { method: "POST", body: { daily_budget: String(Math.round(amount * 100)) } });
}

import "server-only";
import { createSign } from "node:crypto";
import { decrypt, encrypt } from "./crypto";
import { db } from "./supabase/server";

/*
 * Google Ads API (baseado no shortdrama/lib/google-ads):
 *  - acesso por conta de serviço adicionada como usuária da conta (ou da MCC) — sem OAuth que expira;
 *    alternativa: refresh token OAuth (GOOGLE_OAUTH_CLIENT_ID/SECRET). Credencial criptografada no banco;
 *  - developer-token só é enviado se GOOGLE_ADS_DEVELOPER_TOKEN estiver definido;
 *  - sync horário dos últimos 3 dias por grupo de anúncio/dia.
 */
const API = `https://googleads.googleapis.com/${process.env.GOOGLE_ADS_API_VERSION || "v26"}`;

type ServiceAccount = { client_email: string; private_key: string };
type Cred = { kind: "service_account"; sa: ServiceAccount } | { kind: "oauth"; refreshToken: string };

export function parseServiceAccount(raw: string): ServiceAccount | null {
  try {
    const j = JSON.parse(raw) as Partial<ServiceAccount> & { type?: string };
    return j.type === "service_account" && j.client_email && j.private_key?.includes("PRIVATE KEY") ? { client_email: j.client_email, private_key: j.private_key } : null;
  } catch {
    return null;
  }
}

const cache = new Map<string, { token: string; until: number }>();
async function accessToken(cred: Cred) {
  const id = cred.kind === "service_account" ? cred.sa.client_email : cred.refreshToken.slice(-12);
  const hit = cache.get(id);
  if (hit && hit.until > Date.now()) return hit.token;
  let body: URLSearchParams;
  if (cred.kind === "service_account") {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: cred.sa.client_email, scope: "https://www.googleapis.com/auth/adwords", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
    const sig = createSign("RSA-SHA256").update(unsigned).sign(cred.sa.private_key, "base64url");
    body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` });
  } else {
    body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: cred.refreshToken, client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "" });
  }
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string };
  if (!json.access_token) throw new Error(`Google recusou a credencial: ${json.error_description ?? json.error ?? res.status}`);
  cache.set(id, { token: json.access_token, until: Date.now() + 55 * 60_000 });
  return json.access_token;
}

async function headers(cred: Cred, loginCustomerId?: string | null) {
  return {
    authorization: `Bearer ${await accessToken(cred)}`,
    "content-type": "application/json",
    ...(process.env.GOOGLE_ADS_DEVELOPER_TOKEN ? { "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN } : {}),
    ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
  };
}

type GErr = { error?: { message?: string; details?: { errors?: { message?: string }[] }[] } };
const gErr = (json: GErr, status: number) => json.error?.details?.[0]?.errors?.[0]?.message ?? json.error?.message ?? `Google Ads HTTP ${status}`;

/** consulta GAQL com paginação */
export async function gaql<T>(customerId: string, cred: Cred, query: string, loginCustomerId?: string | null): Promise<T[]> {
  const h = await headers(cred, loginCustomerId);
  const out: T[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 100; i++) {
    const res = await fetch(`${API}/customers/${customerId}/googleAds:search`, { method: "POST", headers: h, body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }), cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as GErr & { results?: T[]; nextPageToken?: string };
    if (!res.ok) throw new Error(gErr(json, res.status));
    out.push(...(json.results ?? []));
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

export function credFromInput(raw: string): Cred | null {
  const sa = parseServiceAccount(raw);
  if (sa) return { kind: "service_account", sa };
  if (/^1\/\/[\w-]+/.test(raw)) return { kind: "oauth", refreshToken: raw };
  return null;
}

export async function checkGoogleAccount(customerId: string, cred: Cred, loginCustomerId?: string | null) {
  type R = { customer: { descriptiveName?: string; currencyCode?: string; timeZone?: string } };
  const [r] = await gaql<R>(customerId, cred, "SELECT customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer", loginCustomerId);
  return { name: r?.customer.descriptiveName || customerId, currency: r?.customer.currencyCode ?? "BRL", timezone: r?.customer.timeZone ?? null };
}

/** contas filhas de uma MCC (para importar várias de uma vez) */
export async function listClientAccounts(mccId: string, cred: Cred) {
  type R = { customerClient: { id: string; descriptiveName?: string; currencyCode?: string; timeZone?: string; manager?: boolean; status?: string } };
  const rows = await gaql<R>(mccId, cred, "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.manager, customer_client.status FROM customer_client WHERE customer_client.level <= 1", mccId);
  return rows.map((r) => r.customerClient).filter((c) => !c.manager && c.status !== "CANCELED");
}

export async function saveGoogleAccount(input: { id: string; name: string; currency: string; timezone: string | null; raw: string; cred: Cred; loginCustomerId?: string | null; by: string }) {
  const { error } = await db().from("google_ads_accounts").upsert({
    id: input.id,
    name: input.name,
    currency: input.currency,
    timezone: input.timezone,
    login_customer_id: input.loginCustomerId || null,
    auth_type: input.cred.kind,
    sa_email: input.cred.kind === "service_account" ? input.cred.sa.client_email : null,
    key_enc: encrypt(input.raw),
    active: true,
    created_by: input.by,
    last_error: null,
  });
  if (error) throw new Error(error.message);
}

async function accountCred(id: string) {
  const { data } = await db().from("google_ads_accounts").select("key_enc, login_customer_id").eq("id", id).maybeSingle();
  if (!data) throw new Error(`conta Google ${id} não cadastrada`);
  const cred = credFromInput(decrypt(data.key_enc as string));
  if (!cred) throw new Error("credencial inválida");
  return { cred, login: data.login_customer_id as string | null };
}

type Metrics = { costMicros?: string; impressions?: string; clicks?: string; conversions?: number; conversionsValue?: number };
type CampaignRow = { segments: { date: string }; campaign: { id: string; name?: string; advertisingChannelType?: string }; metrics: Metrics };
type AdGroupRow = CampaignRow & { adGroup: { id: string; name?: string } };
const METRICS = "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value";

export async function syncGoogle(opts: { since: string; until: string; trigger: string; accountId?: string }) {
  const sb = db();
  const { data: run } = await sb.from("sync_runs").insert({ provider: "google", trigger: opts.trigger }).select("id").single();
  let q = sb.from("google_ads_accounts").select("id, currency").eq("active", true);
  if (opts.accountId) q = q.eq("id", opts.accountId);
  const { data: accounts } = await q;
  let ok = 0, failed = 0, rows = 0;
  const errors: string[] = [];
  const range = `segments.date BETWEEN '${opts.since}' AND '${opts.until}'`;
  for (const acc of accounts ?? []) {
    try {
      const { cred, login } = await accountCred(acc.id as string);
      const [campaigns, groups] = await Promise.all([
        gaql<CampaignRow>(acc.id as string, cred, `SELECT segments.date, campaign.id, campaign.name, campaign.advertising_channel_type, ${METRICS} FROM campaign WHERE ${range}`, login),
        gaql<AdGroupRow>(acc.id as string, cred, `SELECT segments.date, campaign.id, campaign.name, campaign.advertising_channel_type, ad_group.id, ad_group.name, ${METRICS} FROM ad_group WHERE ${range}`, login),
      ]);
      const currency = (acc.currency as string | null) ?? "BRL";
      const now = new Date().toISOString();
      const n = (v: string | number | undefined) => Number(v ?? 0) || 0;
      type M = { micros: number; impressions: number; clicks: number; conversions: number; value: number };
      const toRow = (r: CampaignRow, group: { id: string; name: string | null }, m: M) => ({
        account_id: acc.id, date: r.segments.date, campaign_id: r.campaign.id, campaign_name: r.campaign.name ?? null,
        campaign_type: r.campaign.advertisingChannelType ?? null, ad_group_id: group.id, ad_group_name: group.name,
        cost: m.micros / 1e6, currency, impressions: m.impressions, clicks: m.clicks, conversions: m.conversions, conversions_value: m.value, synced_at: now,
      });
      const out = [];
      const inGroups = new Map<string, M>();
      for (const g of groups) {
        const m = { micros: n(g.metrics.costMicros), impressions: n(g.metrics.impressions), clicks: n(g.metrics.clicks), conversions: n(g.metrics.conversions), value: n(g.metrics.conversionsValue) };
        out.push(toRow(g, { id: g.adGroup.id, name: g.adGroup.name ?? null }, m));
        const k = `${g.segments.date}|${g.campaign.id}`;
        const t = inGroups.get(k) ?? { micros: 0, impressions: 0, clicks: 0, conversions: 0, value: 0 };
        inGroups.set(k, { micros: t.micros + m.micros, impressions: t.impressions + m.impressions, clicks: t.clicks + m.clicks, conversions: t.conversions + m.conversions, value: t.value + m.value });
      }
      // o que a campanha gastou fora de grupos (Performance Max) vira a linha "-"
      for (const c of campaigns) {
        const t = inGroups.get(`${c.segments.date}|${c.campaign.id}`) ?? { micros: 0, impressions: 0, clicks: 0, conversions: 0, value: 0 };
        const rest = {
          micros: Math.max(0, n(c.metrics.costMicros) - t.micros), impressions: Math.max(0, n(c.metrics.impressions) - t.impressions),
          clicks: Math.max(0, n(c.metrics.clicks) - t.clicks), conversions: Math.max(0, n(c.metrics.conversions) - t.conversions),
          value: Math.max(0, n(c.metrics.conversionsValue) - t.value),
        };
        if (rest.micros || rest.impressions || rest.clicks || rest.conversions) out.push(toRow(c, { id: "-", name: null }, rest));
      }
      const { error: clearError } = await sb.from("google_ads_daily").delete().eq("account_id", acc.id).gte("date", opts.since).lte("date", opts.until);
      if (clearError) throw new Error(clearError.message);
      for (let i = 0; i < out.length; i += 500) {
        const { error } = await sb.from("google_ads_daily").upsert(out.slice(i, i + 500));
        if (error) throw new Error(error.message);
      }
      rows += out.length;
      ok++;
      await sb.from("google_ads_accounts").update({ last_sync_at: now, last_error: null }).eq("id", acc.id);
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${acc.id}: ${msg}`);
      await sb.from("google_ads_accounts").update({ last_error: msg.slice(0, 300) }).eq("id", acc.id);
    }
  }
  const status = failed && !ok ? "error" : failed ? "partial" : "success";
  if (run) await sb.from("sync_runs").update({ finished_at: new Date().toISOString(), status, accounts_ok: ok, accounts_failed: failed, rows, error: errors.join(" | ").slice(0, 1000) || null }).eq("id", run.id);
  return { provider: "google", status, ok, failed, rows, errors };
}

/* ---------- ao vivo ---------- */
export async function liveGoogleCampaigns(customerId: string) {
  const { cred, login } = await accountCred(customerId);
  type R = { campaign: { id: string; name: string; status: string; advertisingChannelType?: string; biddingStrategyType?: string }; campaignBudget?: { amountMicros?: string; resourceName?: string } };
  const rows = await gaql<R>(customerId, cred, "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign_budget.amount_micros, campaign_budget.resource_name FROM campaign WHERE campaign.status != 'REMOVED'", login);
  return rows.map((r) => ({ id: r.campaign.id, name: r.campaign.name, status: r.campaign.status, type: r.campaign.advertisingChannelType, bidding: r.campaign.biddingStrategyType, dailyBudget: r.campaignBudget?.amountMicros ? Number(r.campaignBudget.amountMicros) / 1e6 : null, budgetResource: r.campaignBudget?.resourceName }));
}

async function mutate(customerId: string, service: string, operations: unknown[]) {
  const { cred, login } = await accountCred(customerId);
  const res = await fetch(`${API}/customers/${customerId}/${service}:mutate`, { method: "POST", headers: await headers(cred, login), body: JSON.stringify({ operations }), cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as GErr;
  if (!res.ok) throw new Error(gErr(json, res.status));
  return json;
}

export async function setGoogleCampaignStatus(customerId: string, campaignId: string, status: "ENABLED" | "PAUSED") {
  return mutate(customerId, "campaigns", [{ update: { resourceName: `customers/${customerId}/campaigns/${campaignId}`, status }, updateMask: "status" }]);
}

export async function setGoogleCampaignBudget(customerId: string, campaignId: string, amount: number) {
  const c = (await liveGoogleCampaigns(customerId)).find((x) => x.id === campaignId);
  if (!c?.budgetResource) throw new Error("campanha/orçamento não encontrado");
  return mutate(customerId, "campaignBudgets", [{ update: { resourceName: c.budgetResource, amountMicros: String(Math.round(amount * 1e6)) }, updateMask: "amount_micros" }]);
}

import "server-only";
import { db } from "./supabase/server";

export type Platform = "meta" | "google";
export type GroupBy = "platform" | "client" | "account" | "campaign" | "group" | "ad" | "day";
export interface Filters { since: string; until: string; platform?: Platform; clientId?: string; accountId?: string; campaignId?: string; search?: string }

type Raw = {
  platform: Platform; account_id: string; account_name: string; client_id: string | null; date: string;
  campaign_id: string; campaign_name: string | null; group_id: string; group_name: string | null; ad_id: string | null; ad_name: string | null;
  spend: number; currency: string | null; impressions: number; clicks: number; conversions: number; conversion_value: number; leads: number; messages: number; purchases: number;
};

export interface Row {
  key: string; label: string; platform?: string; account?: string; campaign?: string;
  spend: number; impressions: number; clicks: number; conversions: number; conversionValue: number; leads: number; messages: number; purchases: number;
  ctr: number | null; cpc: number | null; cpm: number | null; cpa: number | null; roas: number | null;
}

/** linhas cruas do período (paginado: o PostgREST devolve até 1000 por vez) */
export async function rawRows(f: Filters): Promise<Raw[]> {
  const out: Raw[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    let q = db().from("ads_daily_unified").select("*").gte("date", f.since).lte("date", f.until).order("date").range(from, from + 999);
    if (f.platform) q = q.eq("platform", f.platform);
    if (f.clientId) q = q.eq("client_id", f.clientId);
    if (f.accountId) q = q.eq("account_id", f.accountId);
    if (f.campaignId) q = q.eq("campaign_id", f.campaignId);
    if (f.search) q = q.ilike("campaign_name", `%${f.search}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Raw[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const derive = (r: Omit<Row, "ctr" | "cpc" | "cpm" | "cpa" | "roas">): Row => ({
  ...r,
  spend: round(r.spend), conversionValue: round(r.conversionValue),
  ctr: r.impressions ? round((r.clicks / r.impressions) * 100) : null,
  cpc: r.clicks ? round(r.spend / r.clicks) : null,
  cpm: r.impressions ? round((r.spend / r.impressions) * 1000) : null,
  cpa: r.conversions ? round(r.spend / r.conversions) : null,
  roas: r.spend && r.conversionValue ? round(r.conversionValue / r.spend) : null,
});
const round = (n: number) => Math.round(n * 100) / 100;

export async function performance(f: Filters, groupBy: GroupBy = "campaign") {
  const raw = await rawRows(f);
  const clients = groupBy === "client" ? new Map(((await db().from("clients").select("id, name")).data ?? []).map((c) => [c.id as string, c.name as string])) : null;
  const map = new Map<string, Omit<Row, "ctr" | "cpc" | "cpm" | "cpa" | "roas">>();
  for (const r of raw) {
    const [key, label] =
      groupBy === "platform" ? [r.platform, r.platform === "meta" ? "Meta Ads" : "Google Ads"]
      : groupBy === "client" ? [r.client_id ?? "-", r.client_id ? clients!.get(r.client_id) ?? r.client_id : "Sem cliente"]
      : groupBy === "account" ? [`${r.platform}:${r.account_id}`, r.account_name]
      : groupBy === "campaign" ? [`${r.platform}:${r.campaign_id}`, r.campaign_name ?? r.campaign_id]
      : groupBy === "group" ? [`${r.platform}:${r.group_id}:${r.campaign_id}`, r.group_name ?? (r.group_id === "-" ? "(sem grupo)" : r.group_id)]
      : groupBy === "ad" ? [`${r.platform}:${r.ad_id ?? r.group_id}`, r.ad_name ?? r.group_name ?? r.ad_id ?? "-"]
      : [r.date, r.date];
    let a = map.get(key);
    if (!a) {
      a = { key, label, platform: ["platform", "client", "day"].includes(groupBy) ? undefined : r.platform, account: ["campaign", "group", "ad"].includes(groupBy) ? r.account_name : undefined, campaign: ["group", "ad"].includes(groupBy) ? r.campaign_name ?? undefined : undefined, spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0, leads: 0, messages: 0, purchases: 0 };
      map.set(key, a);
    }
    a.spend += Number(r.spend); a.impressions += Number(r.impressions); a.clicks += Number(r.clicks); a.conversions += Number(r.conversions);
    a.conversionValue += Number(r.conversion_value); a.leads += Number(r.leads); a.messages += Number(r.messages); a.purchases += Number(r.purchases);
  }
  const rows = [...map.values()].map(derive).sort((a, b) => (groupBy === "day" ? a.key.localeCompare(b.key) : b.spend - a.spend));
  const t = rows.reduce((t, r) => ({ ...t, spend: t.spend + r.spend, impressions: t.impressions + r.impressions, clicks: t.clicks + r.clicks, conversions: t.conversions + r.conversions, conversionValue: t.conversionValue + r.conversionValue, leads: t.leads + r.leads, messages: t.messages + r.messages, purchases: t.purchases + r.purchases }),
    { key: "total", label: "Total", spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0, leads: 0, messages: 0, purchases: 0 });
  return { filters: f, groupBy, rows, totals: derive(t), currencies: [...new Set(raw.map((r) => r.currency ?? "BRL"))] };
}

/** período atual × período anterior de mesmo tamanho */
export async function compare(f: Filters, groupBy: GroupBy = "platform") {
  const len = Math.round((Date.parse(f.until) - Date.parse(f.since)) / 86400_000) + 1;
  const prevUntil = new Date(Date.parse(f.since) - 86400_000).toISOString().slice(0, 10);
  const prevSince = new Date(Date.parse(f.since) - len * 86400_000).toISOString().slice(0, 10);
  const [cur, prev] = await Promise.all([performance(f, groupBy), performance({ ...f, since: prevSince, until: prevUntil }, groupBy)]);
  const pct = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : round(((a - b) / b) * 100));
  const keys = ["spend", "impressions", "clicks", "conversions", "conversionValue", "ctr", "cpc", "cpm", "cpa", "roas"] as const;
  return {
    current: cur, previous: { since: prevSince, until: prevUntil, totals: prev.totals },
    change: Object.fromEntries(keys.map((k) => [k, pct(cur.totals[k], prev.totals[k])])),
  };
}

export async function listAccounts() {
  const [{ data: meta }, { data: google }, { data: clients }] = await Promise.all([
    db().from("meta_ad_accounts").select("id, name, currency, status, active, client_id, last_sync_at, last_error, bm_id").order("name"),
    db().from("google_ads_accounts").select("id, name, currency, active, client_id, last_sync_at, last_error, login_customer_id, auth_type").order("name"),
    db().from("clients").select("id, name"),
  ]);
  const cname = new Map((clients ?? []).map((c) => [c.id, c.name]));
  return [
    ...(meta ?? []).map((a) => ({ platform: "meta" as const, ...a, client: a.client_id ? cname.get(a.client_id) ?? null : null })),
    ...(google ?? []).map((a) => ({ platform: "google" as const, ...a, client: a.client_id ? cname.get(a.client_id) ?? null : null })),
  ];
}

export async function lastRuns() {
  const { data } = await db().from("sync_runs").select("*").order("id", { ascending: false }).limit(10);
  return data ?? [];
}

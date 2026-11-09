import "server-only";
import pg from "pg";
import { performance } from "./report";
import { db } from "./supabase/server";

/*
 * Leitura do tracking (Fonil CRM) pelas views agregadas do schema "fads" (sem dados pessoais).
 * Conexão: TRACKING_DATABASE_URL (usuário fads_reader, só SELECT). Ver scripts/tracking-setup.mjs.
 */
let pool: pg.Pool | null = null;
export const trackingEnabled = () => Boolean(process.env.TRACKING_DATABASE_URL);
function conn() {
  if (!trackingEnabled()) throw new Error("tracking desligado: defina TRACKING_DATABASE_URL");
  pool ??= new pg.Pool({ connectionString: process.env.TRACKING_DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30_000 });
  return pool;
}
const query = async <T>(sql: string, params: unknown[]) => (await conn().query(sql, params)).rows as T[];

type Agg = { client_slug: string; source: string; meta_campaign_id: string | null; utm_campaign: string | null; utm_source: string | null; has_gclid: boolean; leads?: number; leads_sold?: number; leads_lost?: number; sales?: number; revenue?: string; repeat_sales?: number };
const round = (n: number) => Math.round(n * 100) / 100;
const div = (a: number, b: number) => (b ? round(a / b) : null);
/** custo por algo: sem gasto não há custo (evita mostrar R$ 0) */
const cost = (spend: number, n: number) => (spend > 0 ? div(spend, n) : null);
const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

async function clientMap(clientId?: string) {
  let q = db().from("clients").select("id, name, slug, tracking_slug").eq("active", true);
  if (clientId) q = q.eq("id", clientId);
  const { data } = await q;
  return (data ?? []).filter((c) => c.tracking_slug).map((c) => ({ id: c.id as string, name: c.name as string, tslug: c.tracking_slug as string }));
}

/** leads, vendas e faturamento do CRM no período, cruzados com o gasto em anúncios (por cliente e por campanha) */
export async function crmResults(opts: { since: string; until: string; clientId?: string }) {
  const clients = await clientMap(opts.clientId);
  if (!clients.length) return { periodo: opts, clientes: [], aviso: "nenhum cliente com tracking_slug" };
  const slugs = clients.map((c) => c.tslug);
  const where = `client_slug = any($1) and day between $2 and $3`;
  const group = `client_slug, source, meta_campaign_id, utm_campaign, utm_source, has_gclid`;
  const [leads, sales, perClient] = await Promise.all([
    query<Agg>(`select ${group}, sum(leads)::int leads, sum(leads_sold)::int leads_sold, sum(leads_lost)::int leads_lost from fads.lead_daily where ${where} group by ${group}`, [slugs, opts.since, opts.until]),
    query<Agg>(`select ${group}, sum(sales)::int sales, sum(revenue) revenue, sum(repeat_sales)::int repeat_sales from fads.sale_daily where ${where} group by ${group}`, [slugs, opts.since, opts.until]),
    Promise.all(clients.map((c) => performance({ since: opts.since, until: opts.until, clientId: c.id }, "campaign").then((p) => [c.id, p.rows] as const))).then((x) => new Map(x)),
  ]);

  return {
    periodo: opts,
    clientes: clients.map((c) => {
      const L = leads.filter((r) => r.client_slug === c.tslug);
      const S = sales.filter((r) => r.client_slug === c.tslug);
      const C = perClient.get(c.id) ?? [];
      const sum = (rows: Agg[], k: keyof Agg) => rows.reduce((t, r) => t + Number(r[k] ?? 0), 0);
      const campaigns = C.map((r) => {
        const id = r.key.split(":")[1];
        // casa lead com campanha pelo id do Meta (meta_campaign_id) ou pelo nome = utm_campaign
        const match = (x: Agg) => x.meta_campaign_id === id || (!!x.utm_campaign && norm(x.utm_campaign) === norm(r.label));
        const l = sum(L.filter(match), "leads"), s = sum(S.filter(match), "sales"), rev = round(sum(S.filter(match), "revenue"));
        return { campanha: r.label, plataforma: r.platform, gasto: r.spend, leadsAnuncio: r.leads + r.messages, leadsCRM: l, vendas: s, faturamento: rev, cplCRM: cost(r.spend, l), custoPorVenda: cost(r.spend, s), roasReal: div(rev, r.spend) };
      });
      const spend = round(C.reduce((t, r) => t + r.spend, 0));
      const totalLeads = sum(L, "leads"), totalSales = sum(S, "sales"), revenue = round(sum(S, "revenue"));
      const attributed = sum(L.filter((x) => x.meta_campaign_id || x.utm_campaign || x.has_gclid), "leads");
      const bySource = Object.entries(L.reduce<Record<string, number>>((o, r) => ({ ...o, [r.source]: (o[r.source] ?? 0) + Number(r.leads) }), {})).map(([origem, leads]) => ({ origem, leads }));
      return {
        cliente: c.name, clientId: c.id,
        gasto: spend, leads: totalLeads, leadsVendidos: sum(L, "leads_sold"), leadsPerdidos: sum(L, "leads_lost"),
        vendas: totalSales, recompras: sum(S, "repeat_sales"), faturamento: revenue,
        cpl: cost(spend, totalLeads), custoPorVenda: cost(spend, totalSales), roas: spend > 0 ? div(revenue, spend) : null, taxaConversao: totalLeads ? round((totalSales / totalLeads) * 100) : null,
        leadsComCampanhaPct: totalLeads ? round((attributed / totalLeads) * 100) : null,
        porOrigem: bySource,
        campanhas: campaigns.sort((a, b) => b.gasto - a.gasto),
      };
    }),
    observacao: "Vendas contadas pela data da venda; leads pela data de captura. Custo por venda e ROAS cruzam gasto do período com vendas do período (pode haver defasagem).",
  };
}

/** funil atual (leads abertos por etapa) e motivos de perda do período */
export async function crmPipeline(opts: { since: string; until: string; clientId?: string }) {
  const clients = await clientMap(opts.clientId);
  const slugs = clients.map((c) => c.tslug);
  const [stages, losses] = await Promise.all([
    query<{ client_slug: string; stage: string; position: number; leads: number }>(`select * from fads.pipeline_now where client_slug = any($1) order by client_slug, position`, [slugs]),
    query<{ client_slug: string; reason: string; leads: number }>(`select client_slug, reason, sum(leads)::int leads from fads.loss_daily where client_slug = any($1) and day between $2 and $3 group by 1, 2 order by 3 desc`, [slugs, opts.since, opts.until]),
  ]);
  return clients.map((c) => ({
    cliente: c.name, clientId: c.id,
    funil: stages.filter((s) => s.client_slug === c.tslug).map(({ stage, leads }) => ({ etapa: stage, leads })),
    motivosDePerda: losses.filter((l) => l.client_slug === c.tslug).map(({ reason, leads }) => ({ motivo: reason, leads })),
  }));
}

/** série diária do CRM por cliente (leads, vendas, faturamento) — base do impacto das tarefas */
export async function crmDaily(trackingSlugs: string[], since: string, until: string) {
  if (!trackingEnabled() || !trackingSlugs.length) return [];
  return query<{ client_slug: string; day: string; leads: number; sales: number; revenue: number }>(
    `select coalesce(l.client_slug, s.client_slug) client_slug, to_char(coalesce(l.day, s.day), 'YYYY-MM-DD') as day,
            coalesce(l.leads, 0)::int leads, coalesce(s.sales, 0)::int sales, coalesce(s.revenue, 0)::float8 revenue
       from (select client_slug, day, sum(leads) leads from fads.lead_daily where client_slug = any($1) and day between $2 and $3 group by 1, 2) l
       full join (select client_slug, day, sum(sales) sales, sum(revenue) revenue from fads.sale_daily where client_slug = any($1) and day between $2 and $3 group by 1, 2) s
         on s.client_slug = l.client_slug and s.day = l.day`,
    [trackingSlugs, since, until],
  );
}

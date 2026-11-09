import "server-only";
import { daysAgo, dayBR } from "./dates";
import { db } from "./supabase/server";
import { crmResults, trackingEnabled } from "./tracking";

/*
 * Sugestões acionáveis (regras determinísticas sobre gasto × CRM). Cada uma tem chave estável:
 * dispensar ou transformar em tarefa grava em suggestion_actions e ela some por 14 dias.
 */
export type Suggestion = {
  key: string; tipo: "pausar" | "escalar" | "cpl" | "crm" | "tracking" | "vincular";
  severidade: "alta" | "media" | "baixa"; titulo: string; detalhe: string;
  cliente: string; clientId: string; campanha?: string; area: string;
};
export const SUGGESTION_LABEL: Record<Suggestion["tipo"], string> = {
  pausar: "Avaliar pausar", escalar: "Escalar", cpl: "CPL alto", crm: "Leads não chegam no CRM", tracking: "Corrigir UTMs", vincular: "Vincular conta",
};
const brl = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const order = { alta: 0, media: 1, baixa: 2 };

export async function suggestions(opts: { since?: string; until?: string; clientId?: string; includeHandled?: boolean } = {}) {
  if (!trackingEnabled()) return [];
  const since = opts.since ?? daysAgo(29), until = opts.until ?? dayBR();
  const res = await crmResults({ since, until, clientId: opts.clientId });
  const out: Suggestion[] = [];
  const periodo = `${since.split("-").reverse().join("/")} a ${until.split("-").reverse().join("/")}`;
  for (const c of res.clientes) {
    const base = { cliente: c.cliente, clientId: c.clientId };
    if (c.leads >= 10 && c.gasto === 0)
      out.push({ ...base, key: `vincular:${c.clientId}`, tipo: "vincular", severidade: "media", area: "Integração", titulo: `${c.cliente}: ${c.leads} leads no CRM e nenhum gasto vinculado`, detalhe: `Vincule a conta de anúncio do cliente em Contas para medir CPL e ROAS reais (${periodo}).` });
    if (c.leads >= 10 && c.leadsComCampanhaPct != null && c.leadsComCampanhaPct < 50)
      out.push({ ...base, key: `tracking:${c.clientId}`, tipo: "tracking", severidade: "alta", area: "Páginas e CRM", titulo: `${c.cliente}: só ${c.leadsComCampanhaPct}% dos leads com campanha identificada`, detalhe: `Sem UTM/ID de campanha não dá para saber qual anúncio vende. Revisar parâmetros de URL dos anúncios e repasse nas páginas/quiz (${periodo}).` });
    const attributionOk = (c.leadsComCampanhaPct ?? 0) >= 30;
    const camps = c.campanhas;
    const cSpend = camps.reduce((t, r) => t + r.gasto, 0), cRev = camps.reduce((t, r) => t + r.faturamento, 0), cLeads = camps.reduce((t, r) => t + r.leadsCRM, 0);
    const avgRoas = cSpend ? cRev / cSpend : null, avgCpl = cLeads ? cSpend / cLeads : null;
    for (const r of camps) {
      const k = (t: string) => `${t}:${c.clientId}:${r.campanha}`;
      const camp = { ...base, campanha: r.campanha, area: "Tráfego pago" };
      if (attributionOk && r.leadsCRM === 0 && r.gasto >= Math.max(150, 3 * (avgCpl ?? 0)))
        out.push({ ...camp, key: k("pausar"), tipo: "pausar", severidade: "alta", titulo: `${r.campanha}: ${brl(r.gasto)} sem nenhum lead no CRM`, detalhe: `${c.cliente} · ${periodo}. Plataforma reportou ${r.leadsAnuncio} resultados. Avaliar pausar ou mudar o objetivo; CPL real médio do cliente: ${brl(avgCpl ? Math.round(avgCpl * 100) / 100 : null)}.` });
      else if (attributionOk && r.cplCRM != null && avgCpl && r.gasto >= 100 && r.cplCRM > 1.5 * avgCpl)
        out.push({ ...camp, key: k("cpl"), tipo: "cpl", severidade: "media", titulo: `${r.campanha}: CPL real ${brl(r.cplCRM)} (média do cliente ${brl(Math.round(avgCpl * 100) / 100)})`, detalhe: `${c.cliente} · ${periodo}. Testar novos criativos/públicos ou realocar verba para as campanhas com CPL menor.` });
      if (r.vendas >= 2 && r.roasReal != null && r.roasReal >= 3 && avgRoas && r.roasReal >= 1.3 * avgRoas)
        out.push({ ...camp, key: k("escalar"), tipo: "escalar", severidade: "media", titulo: `${r.campanha}: ROAS real ${r.roasReal}x com ${r.vendas} vendas`, detalhe: `${c.cliente} · ${periodo}. Acima da média do cliente (${Math.round(avgRoas * 10) / 10}x). Avaliar aumentar o orçamento aos poucos (20–30%).` });
      if (r.leadsAnuncio >= 20 && r.leadsCRM / r.leadsAnuncio < 0.6)
        out.push({ ...camp, key: k("crm"), tipo: "crm", severidade: "media", area: "Páginas e CRM", titulo: `${r.campanha}: ${r.leadsAnuncio} leads na plataforma, ${r.leadsCRM} no CRM`, detalhe: `${c.cliente} · ${periodo}. ${Math.round((1 - r.leadsCRM / r.leadsAnuncio) * 100)}% não chegam (ou chegam sem a campanha). Conferir formulário/quiz → CRM e parâmetros de URL.` });
    }
  }
  if (opts.includeHandled) return out.sort((a, b) => order[a.severidade] - order[b.severidade]);
  const { data: handled } = await db().from("suggestion_actions").select("key").gte("created_at", new Date(Date.now() - 14 * 86400_000).toISOString());
  const skip = new Set((handled ?? []).map((h) => h.key as string));
  return out.filter((s) => !skip.has(s.key)).sort((a, b) => order[a.severidade] - order[b.severidade]);
}

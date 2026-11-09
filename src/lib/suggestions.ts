import "server-only";
import { daysAgo, dayBR } from "./dates";
import { db } from "./supabase/server";
import { quizEnabled, quizResults } from "./quiz";
import { crmResults, trackingEnabled } from "./tracking";

/*
 * Sugestões acionáveis (regras determinísticas sobre gasto × CRM). Cada uma tem chave estável:
 * dispensar ou transformar em tarefa grava em suggestion_actions e ela some por 14 dias.
 */
export type Suggestion = {
  key: string; tipo: "pausar" | "escalar" | "cpl" | "crm" | "tracking" | "vincular" | "vendas" | "abandono" | "quizcrm" | "quizparado";
  severidade: "alta" | "media" | "baixa"; titulo: string; detalhe: string;
  cliente: string; clientId: string; campanha?: string; area: string;
};
export const SUGGESTION_LABEL: Record<Suggestion["tipo"], string> = {
  pausar: "Avaliar pausar", escalar: "Escalar", cpl: "CPL alto", crm: "Leads não chegam no CRM", tracking: "Corrigir UTMs", vincular: "Vincular conta", vendas: "Lançar vendas",
  abandono: "Abandono no quiz", quizcrm: "Quiz → CRM", quizparado: "Quiz sem leads",
};
const brl = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const order = { alta: 0, media: 1, baixa: 2 };

export async function suggestions(opts: { since?: string; until?: string; clientId?: string; includeHandled?: boolean } = {}) {
  if (!trackingEnabled() && !quizEnabled()) return [];
  const since = opts.since ?? daysAgo(29), until = opts.until ?? dayBR();
  const [res, quiz] = await Promise.all([
    trackingEnabled() ? crmResults({ since, until, clientId: opts.clientId }) : { clientes: [] },
    quizEnabled() ? quizResults({ since, until, clientId: opts.clientId }).catch(() => ({ clientes: [] })) : { clientes: [] },
  ]);
  const out: Suggestion[] = [];
  const periodo = `${since.split("-").reverse().join("/")} a ${until.split("-").reverse().join("/")}`;
  for (const c of res.clientes) {
    const base = { cliente: c.cliente, clientId: c.clientId };
    if (c.leads >= 10 && c.gasto === 0)
      out.push({ ...base, key: `vincular:${c.clientId}`, tipo: "vincular", severidade: "media", area: "Integração", titulo: `${c.cliente}: ${c.leads} leads no CRM e nenhum gasto vinculado`, detalhe: `Vincule a conta de anúncio do cliente em Contas para medir CPL e ROAS reais (${periodo}).` });
    if (c.leads >= 10 && c.leadsComCampanhaPct != null && c.leadsComCampanhaPct < 50)
      out.push({ ...base, key: `tracking:${c.clientId}`, tipo: "tracking", severidade: "alta", area: "Páginas e CRM", titulo: `${c.cliente}: só ${c.leadsComCampanhaPct}% dos leads com campanha identificada`, detalhe: `Sem UTM/ID de campanha não dá para saber qual anúncio vende. Revisar parâmetros de URL dos anúncios e repasse nas páginas/quiz (${periodo}).` });
    if (c.vendasPossivelmenteNaoLancadas && c.leads > 0)
      out.push({ ...base, key: `vendas:${c.clientId}:${c.ultimaVendaRegistrada}`, tipo: "vendas", severidade: "alta", area: "Comercial", titulo: `${c.cliente}: nenhuma venda lançada no CRM desde ${c.ultimaVendaRegistrada!.split("-").reverse().join("/")}`, detalhe: `${c.leads} leads no período e 0 vendas registradas. Sem as vendas, custo por venda e ROAS real ficam zerados e as análises erram. Lançar as vendas no Fonil CRM.` });
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
  const fmt = (d: string) => d.split("-").reverse().join("/");
  for (const q of quiz.clientes) {
    const base = { cliente: q.cliente, clientId: q.clientId, area: "Páginas e CRM" };
    const quizLeads = q.quizzes.reduce((t, z) => t + z.leads, 0);
    const crm = res.clientes.find((c) => c.clientId === q.clientId);
    if (crm && quizLeads >= 20 && crm.leads < 0.6 * quizLeads)
      out.push({ ...base, key: `quizcrm:${q.clientId}`, tipo: "quizcrm", severidade: "alta", titulo: `${q.cliente}: ${quizLeads} leads no quiz, ${crm.leads} no CRM`, detalhe: `${Math.round((1 - crm.leads / quizLeads) * 100)}% dos leads do quiz não chegam no Fonil CRM (${periodo}). Conferir a integração/webhook do quiz com o CRM.` });
    const stale = new Date(new Date(`${until}T12:00:00Z`).getTime() - 3 * 86400_000).toISOString().slice(0, 10);
    if (q.gastoCliente >= 100 && q.ultimoLeadQuiz && q.ultimoLeadQuiz < stale)
      out.push({ ...base, key: `quizparado:${q.clientId}:${q.ultimoLeadQuiz}`, tipo: "quizparado", severidade: "media", titulo: `${q.cliente}: quiz sem leads desde ${fmt(q.ultimoLeadQuiz)}`, detalhe: `${brl(q.gastoCliente)} em anúncios no período e nenhum lead nos quizzes. Se o quiz ainda é o destino dos anúncios, conferir se a página está no ar e o formulário funcionando.` });
    for (const z of q.quizzes) {
      const worst = z.funil.map((f, i) => ({ ...f, antes: i ? z.funil[i - 1].sessoes : 0 })).filter((f) => f.antes >= 100 && (f.queda ?? 0) >= 40).sort((a, b) => (b.queda ?? 0) - (a.queda ?? 0))[0];
      if (worst)
        out.push({ ...base, key: `abandono:${q.clientId}:${z.slug}:${worst.etapa}`, tipo: "abandono", severidade: "media", titulo: `${z.quiz}: ${Math.round(worst.queda ?? 0)}% abandonam na etapa ${worst.etapa}`, detalhe: `"${worst.nome}" (${worst.antes} → ${worst.sessoes} sessões, ${periodo}). Testar simplificar essa etapa, mudar a ordem das perguntas ou o criativo que leva ao quiz. Conversão total do quiz: ${z.conversao == null ? "—" : z.conversao.toLocaleString("pt-BR")}%.` });
    }
  }
  if (opts.includeHandled) return out.sort((a, b) => order[a.severidade] - order[b.severidade]);
  const { data: handled } = await db().from("suggestion_actions").select("key").gte("created_at", new Date(Date.now() - 14 * 86400_000).toISOString());
  const skip = new Set((handled ?? []).map((h) => h.key as string));
  return out.filter((s) => !skip.has(s.key)).sort((a, b) => order[a.severidade] - order[b.severidade]);
}

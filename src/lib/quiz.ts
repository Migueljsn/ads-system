import "server-only";
import pg from "pg";
import { performance } from "./report";
import { db } from "./supabase/server";

/*
 * Leitura do QuizzBuilder (Neon "bystep") pelas views agregadas do schema "fads" (sem dados pessoais,
 * só quizzes da conta da Fonil). Conexão: QUIZ_DATABASE_URL (usuário fads_reader, só SELECT).
 * Ver scripts/quiz-setup.mjs e supabase/quiz/0001_fads_views.sql.
 * Vínculo cliente ↔ quiz: nome do projeto no QuizzBuilder = nome, slug ou tracking_slug do cliente.
 */
let pool: pg.Pool | null = null;
export const quizEnabled = () => Boolean(process.env.QUIZ_DATABASE_URL);
function conn() {
  if (!quizEnabled()) throw new Error("quiz desligado: defina QUIZ_DATABASE_URL");
  pool ??= new pg.Pool({ connectionString: process.env.QUIZ_DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30_000 });
  return pool;
}
const query = async <T>(sql: string, params: unknown[] = []) => (await conn().query(sql, params)).rows as T[];

const round = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, b: number) => (b ? round((a / b) * 100) : null);
const cost = (spend: number, n: number) => (spend > 0 && n ? round(spend / n) : null);
const key = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** ids de campanha só valem se forem numéricos (ignora placeholders como {{campaign.id}}) */
const validId = (s: string | null) => (s && /^\d{6,}$/.test(s) ? s : null);

type QuizRow = { quiz_id: string; quiz_name: string; slug: string; status: string; project_name: string | null };
type LeadRow = { quiz_id: string; campaign_id: string | null; utm_campaign: string | null; utm_source: string | null; leads: number; leads_identified: number };
type StepRow = { quiz_id: string; step_id: string; step_order: number; step_label: string | null; has_lead_form: boolean; sessions: number };
type AnswerRow = { quiz_id: string; question: string; answer: string; leads: number };

async function clientsWithQuizzes(clientId?: string) {
  let q = db().from("clients").select("id, name, slug, tracking_slug").eq("active", true);
  if (clientId) q = q.eq("id", clientId);
  const [{ data }, quizzes] = await Promise.all([q, query<QuizRow>(`select quiz_id, quiz_name, slug, status, project_name from fads.quizzes`)]);
  return (data ?? []).map((c) => {
    const keys = new Set([key(c.name), key(c.slug), key(c.tracking_slug)].filter(Boolean));
    return { id: c.id as string, name: c.name as string, quizzes: quizzes.filter((z) => keys.has(key(z.project_name))) };
  }).filter((c) => c.quizzes.length);
}

/** visitantes, leads, conversão, CPL do quiz, funil por etapa e respostas mais comuns, por cliente e quiz */
export async function quizResults(opts: { since: string; until: string; clientId?: string }) {
  const clients = await clientsWithQuizzes(opts.clientId);
  if (!clients.length) return { periodo: opts, clientes: [], aviso: "nenhum cliente com quiz (nome do projeto no QuizzBuilder deve ser igual ao do cliente)" };
  const ids = clients.flatMap((c) => c.quizzes.map((z) => z.quiz_id));
  const p = [ids, opts.since, opts.until];
  const where = `quiz_id = any($1) and day between $2 and $3`;
  const [leads, steps, answers, lastLead, spendByClient] = await Promise.all([
    query<LeadRow>(`select quiz_id, campaign_id, utm_campaign, utm_source, sum(leads)::int leads, sum(leads_identified)::int leads_identified from fads.quiz_lead_daily where ${where} group by 1,2,3,4`, p),
    query<StepRow>(`select quiz_id, step_id, step_order, step_label, has_lead_form, sum(sessions)::int sessions from fads.quiz_step_daily where ${where} group by 1,2,3,4,5 order by quiz_id, step_order`, p),
    query<AnswerRow>(`select quiz_id, question, answer, sum(leads)::int leads from fads.quiz_answer_daily where ${where} group by 1,2,3 order by leads desc`, p),
    query<{ quiz_id: string; day: string }>(`select quiz_id, to_char(max(day), 'YYYY-MM-DD') as day from fads.quiz_lead_daily where quiz_id = any($1) group by 1`, [ids]).then((r) => new Map(r.map((x) => [x.quiz_id, x.day]))),
    Promise.all(clients.map((c) => performance({ since: opts.since, until: opts.until, clientId: c.id }, "campaign").then((r) => [c.id, r.rows] as const))).then((x) => new Map(x)),
  ]);

  return {
    periodo: opts,
    clientes: clients.map((c) => {
      const camps = spendByClient.get(c.id) ?? [];
      const quizzes = c.quizzes.map((z) => {
        const L = leads.filter((r) => r.quiz_id === z.quiz_id);
        const S = steps.filter((r) => r.quiz_id === z.quiz_id);
        const total = L.reduce((t, r) => t + r.leads, 0), identified = L.reduce((t, r) => t + r.leads_identified, 0);
        const visitors = S.length ? Math.max(...S.filter((s) => s.step_order === S[0].step_order).map((s) => s.sessions), 0) : 0;
        // campanhas que mandaram leads para este quiz (pelo id da campanha no Meta), com o gasto do período
        const byCamp = new Map<string, number>();
        for (const r of L) { const id = validId(r.campaign_id); if (id) byCamp.set(id, (byCamp.get(id) ?? 0) + r.leads_identified); }
        const campanhas = [...byCamp].map(([id, n]) => {
          const cr = camps.find((x) => x.key.split(":")[1] === id);
          return { campanha: cr?.label ?? `campanha ${id}`, campaignId: id, gasto: cr?.spend ?? 0, leadsQuiz: n, cplQuiz: cost(cr?.spend ?? 0, n) };
        }).sort((a, b) => b.leadsQuiz - a.leadsQuiz);
        const gasto = round(campanhas.reduce((t, r) => t + r.gasto, 0));
        const attributed = L.filter((r) => validId(r.campaign_id) || r.utm_campaign).reduce((t, r) => t + r.leads_identified, 0);
        // funil: etapas na ordem; queda = % que não seguiu da etapa anterior
        const funil = S.map((s, i) => ({ etapa: s.step_order + 1, nome: s.step_label ?? `Etapa ${s.step_order + 1}`, formulario: s.has_lead_form, sessoes: s.sessions, queda: i ? pct(Math.max(S[i - 1].sessions - s.sessions, 0), S[i - 1].sessions) : null }));
        const perguntas = Object.entries(answers.filter((a) => a.quiz_id === z.quiz_id).reduce<Record<string, { resposta: string; leads: number }[]>>((o, a) => ({ ...o, [a.question]: [...(o[a.question] ?? []), { resposta: a.answer, leads: a.leads }] }), {}))
          .map(([pergunta, rs]) => ({ pergunta, respostas: rs.slice(0, 4).map((r) => ({ ...r, pct: pct(r.leads, rs.reduce((t, x) => t + x.leads, 0)) })) }));
        return {
          quiz: z.quiz_name, slug: z.slug, publicado: z.status === "published", ultimoLead: lastLead.get(z.quiz_id) ?? null,
          visitantes: visitors, leads: identified, respostasSemContato: total - identified, conversao: pct(identified, visitors),
          gasto, cplQuiz: cost(gasto, attributed), leadsComCampanhaPct: pct(attributed, identified),
          campanhas, funil, perguntas,
        };
      });
      const active = quizzes.filter((q) => q.visitantes > 1 || q.leads > 0);
      return {
        cliente: c.name, clientId: c.id, gastoCliente: round(camps.reduce((t, r) => t + r.spend, 0)),
        ultimoLeadQuiz: quizzes.map((q) => q.ultimoLead).filter(Boolean).sort().pop() ?? null,
        quizzes: active,
        semAtividade: quizzes.filter((q) => q.publicado && !active.includes(q)).map((q) => ({ quiz: q.quiz, ultimoLead: q.ultimoLead })),
      };
    }),
    observacao: "Leads = quem preencheu o formulário de contato; visitantes = sessões na primeira etapa. CPL do quiz usa o gasto das campanhas que trouxeram leads para o quiz (pelo campaign_id da UTM).",
  };
}

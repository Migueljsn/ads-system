import { DoorOpen, CircleAlert, Lightbulb, PauseCircle, Rocket, Link2, Radar, Receipt, TrendingDown, X, ListPlus } from "lucide-react";
import { dismissSuggestion, suggestionToTask } from "@/app/(app)/actions";
import { SUGGESTION_LABEL, type Suggestion } from "@/lib/suggestions";

const ICON = { pausar: PauseCircle, escalar: Rocket, cpl: TrendingDown, crm: Radar, tracking: Radar, vincular: Link2, vendas: Receipt, abandono: DoorOpen, quizcrm: Radar, quizparado: CircleAlert };
const TONE = { alta: "border-bad/40 bg-bad/10 text-bad", media: "border-google/40 bg-google/10 text-google", baixa: "border-line bg-white/5 text-muted" };
const GOOD = "border-good/40 bg-good/10 text-good";
const tone = (s: Suggestion) => (s.tipo === "escalar" ? GOOD : TONE[s.severidade]);

/** balãozinho compacto (ao lado da campanha); o detalhe aparece ao passar o mouse */
export function SuggestionBadge({ s }: { s: Suggestion }) {
  const Icon = ICON[s.tipo];
  return (
    <span title={`${s.titulo}\n\n${s.detalhe}`} className={`badge ml-2 cursor-help border px-2 py-0.5 text-[11px] font-medium ${tone(s)}`}>
      <Icon size={12} />{SUGGESTION_LABEL[s.tipo]}
    </span>
  );
}

/** cartão com a lista de sugestões e as ações (virar tarefa no ClickUp / dispensar por 14 dias) */
export function SuggestionList({ items, limit, title = "Sugestões" }: { items: Suggestion[]; limit?: number; title?: string }) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <div className="card mb-6">
      <div className="card-title flex items-center gap-2"><Lightbulb size={16} className="text-brand" />{title}<span className="text-xs font-normal text-muted">({items.length})</span></div>
      {!shown.length && <p className="text-sm text-muted">Nada pendente.</p>}
      <ul className="space-y-2">
        {shown.map((s) => {
          const Icon = ICON[s.tipo];
          return (
            <li key={s.key} className={`flex flex-wrap items-start gap-3 rounded-xl border p-3 ${tone(s)}`}>
              <Icon size={18} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1 text-ink">
                <div className="text-sm font-medium">{s.titulo}</div>
                <div className="mt-0.5 text-xs text-muted">{s.detalhe}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                <form action={suggestionToTask}><input type="hidden" name="key" value={s.key} />
                  <button className="badge border border-line bg-white/5 px-2 py-1 text-xs text-ink hover:bg-white/10" title="Criar tarefa no ClickUp (lista do cliente, prazo amanhã)"><ListPlus size={13} />Virar tarefa</button></form>
                <form action={dismissSuggestion}><input type="hidden" name="key" value={s.key} />
                  <button className="badge border border-line bg-white/5 px-2 py-1 text-xs text-muted hover:bg-white/10" title="Dispensar por 14 dias"><X size={13} /></button></form>
              </div>
            </li>
          );
        })}
      </ul>
      {limit && items.length > limit && <a href="/crm" className="mt-3 inline-block text-sm text-brand hover:underline">Ver todas ({items.length}) →</a>}
    </div>
  );
}

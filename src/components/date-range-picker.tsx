"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

/* Seletor de período em um único calendário (mesmo comportamento do Fonil CRM):
   1º clique = início, 2º clique = fim, "Aplicar" grava ?since=&until= na URL. */
const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const short = (s: string) => parse(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
function monthDays(y: number, m: number) {
  const out: Date[] = [];
  for (const d = new Date(y, m, 1); d.getMonth() === m; d.setDate(d.getDate() + 1)) out.push(new Date(d));
  return out;
}

export function DateRangePicker({ since, until }: { since?: string; until?: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const today = new Date();
  const todayYmd = ymd(today);
  const base = since ? parse(since) : today;
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() });
  const [start, setStart] = useState<string | null>(since ?? null);
  const [end, setEnd] = useState<string | null>(until ?? null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      const panel = document.getElementById("fads-drp");
      if (panel && !panel.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", outside);
    window.addEventListener("scroll", close, { passive: true });
    return () => { document.removeEventListener("mousedown", outside); window.removeEventListener("scroll", close); };
  }, [open]);

  function show() {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    setStart(since ?? null); setEnd(until ?? null); // reabre com o período atual
    setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - 300)) });
    setOpen(true);
  }
  function go(range: { since: string; until: string } | null) {
    const q = new URLSearchParams(params.toString());
    q.delete("days");
    if (range) { q.set("since", range.since); q.set("until", range.until); } else { q.delete("since"); q.delete("until"); }
    router.push(`${path}?${q}`);
    setOpen(false);
  }
  function pick(d: string) {
    if (!start || end) { setStart(d); setEnd(null); }
    else if (d < start) { setEnd(start); setStart(d); }
    else setEnd(d);
  }
  const cls = (d: string) => {
    if (d === start || d === end) return "bg-brand text-white font-bold";
    const inRange = start && end && d > start && d < end;
    const inHover = start && !end && hover && d > start && d <= hover;
    if (inRange || inHover) return "bg-brand/20 text-ink";
    if (d === todayYmd) return "border border-brand/60 text-brand";
    return "text-ink hover:bg-white/[0.06]";
  };
  const days = monthDays(view.y, view.m);
  const pad = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const has = !!(since && until);

  return (
    <>
      <button ref={trigger} type="button" onClick={open ? () => setOpen(false) : show}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition ${has ? "bg-brand text-white shadow shadow-brand/30" : "text-muted hover:text-ink"}`}>
        <Calendar size={14} />
        {has ? `${short(since!)} → ${short(until!)}` : "Personalizado"}
        {has && <span role="button" aria-label="Limpar período" onClick={(e) => { e.stopPropagation(); go(null); }} className="ml-0.5 opacity-70 hover:opacity-100"><X size={13} /></span>}
      </button>
      {open && pos && createPortal(
        <div id="fads-drp" style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }} className="w-72 rounded-2xl border border-line bg-panel p-4 shadow-2xl shadow-black/50">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => setView((v) => ({ m: v.m ? v.m - 1 : 11, y: v.m ? v.y : v.y - 1 }))} className="rounded-lg p-1.5 text-muted hover:bg-white/[0.06]"><ChevronLeft size={14} /></button>
            <span className="text-sm font-semibold">{MONTHS[view.m]} {view.y}</span>
            <button type="button" onClick={() => setView((v) => ({ m: v.m === 11 ? 0 : v.m + 1, y: v.m === 11 ? v.y + 1 : v.y }))} className="rounded-lg p-1.5 text-muted hover:bg-white/[0.06]"><ChevronRight size={14} /></button>
          </div>
          <div className="mb-1 grid grid-cols-7">{DAYS.map((l) => <div key={l} className="py-1 text-center text-[10px] font-semibold text-muted">{l}</div>)}</div>
          <div className="grid grid-cols-7 gap-px">
            {Array.from({ length: pad }).map((_, i) => <div key={`p${i}`} />)}
            {days.map((day) => {
              const d = ymd(day);
              return (
                <button key={d} type="button" disabled={d > todayYmd} onClick={() => pick(d)} onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(null)}
                  className={`rounded-lg py-1.5 text-center text-xs transition disabled:cursor-not-allowed disabled:opacity-30 ${cls(d)}`}>{day.getDate()}</button>
              );
            })}
          </div>
          <p className="mt-3 text-center text-[11px] text-muted">{!start ? "Clique para definir o início" : !end ? "Clique para definir o fim" : `${short(start)} → ${short(end)}`}</p>
          <div className="mt-3 flex gap-2 border-t border-line pt-3">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-line py-2 text-xs font-medium text-muted hover:bg-white/[0.05]">Cancelar</button>
            <button type="button" disabled={!(start && end)} onClick={() => go({ since: start!, until: end! })} className="flex-1 rounded-xl bg-brand py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Aplicar</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

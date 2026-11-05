"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, Mail, PlugZap, ShieldCheck, TrendingUp } from "lucide-react";
import { Logo } from "@/components/logo";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { sendCode } from "./actions";

const LEN = 6;

function explain(message: string) {
  if (/expired|invalid/i.test(message)) return "Código inválido ou expirado. Use o código do e-mail mais recente ou peça outro.";
  if (/rate limit|security purposes|seconds/i.test(message)) return "Muitas tentativas. Aguarde 1 minuto e tente de novo.";
  return message;
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(""));
  const [step, setStep] = useState<"email" | "code">("email");
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const e = new URLSearchParams(location.search).get("e");
    if (e === "forbidden") setMsg({ text: "Esse e-mail não tem acesso ao painel." });
    if (e === "link") setMsg({ text: "Esse link expirou ou já foi usado. Peça um novo código." });
  }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function request(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const r = await sendCode(email);
    setBusy(false);
    if (r.ok || r.rateLimited) {
      setStep("code");
      setDigits(Array(LEN).fill(""));
      setCooldown(60);
      setTimeout(() => boxes.current[0]?.focus(), 50);
    }
    setMsg({ text: r.message, ok: r.ok });
  }

  async function verify(code: string) {
    if (busy || code.length !== LEN) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabaseBrowser().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: "email" });
    if (error) {
      setBusy(false);
      setMsg({ text: explain(error.message) });
      setDigits(Array(LEN).fill(""));
      boxes.current[0]?.focus();
    } else location.href = "/";
  }

  function setDigit(i: number, v: string) {
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) {
      // colou o código inteiro
      const all = clean.slice(0, LEN).split("");
      const next = Array(LEN).fill("").map((_, k) => all[k] ?? "");
      setDigits(next);
      boxes.current[Math.min(all.length, LEN - 1)]?.focus();
      if (all.length === LEN) verify(all.join(""));
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < LEN - 1) boxes.current[i + 1]?.focus();
    if (next.every(Boolean)) verify(next.join(""));
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* lado da marca */}
      <section className="relative hidden overflow-hidden border-r border-line lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -top-40 -left-40 size-[520px] rounded-full bg-brand/25 blur-[120px]" />
        <div className="pointer-events-none absolute -right-32 -bottom-40 size-[460px] rounded-full bg-brand-2/15 blur-[120px]" />
        <Logo size={36} />
        <div className="relative max-w-md">
          <h2 className="text-4xl leading-tight font-bold tracking-tight">Seus anúncios da Meta e do Google <span className="bg-gradient-to-r from-brand to-brand-2 bg-clip-text text-transparent">num só lugar</span>, com IA.</h2>
          <ul className="mt-8 space-y-4 text-sm text-muted">
            {[
              [TrendingUp, "Gasto, conversões, CPA e ROAS de todas as contas, atualizados a cada hora"],
              [Bot, "Assistente de IA que analisa campanhas e sugere o que pausar ou escalar"],
              [PlugZap, "API e servidor MCP para conectar o Claude, n8n e outras ferramentas"],
              [ShieldCheck, "Relatórios e tarefas direto no ClickUp de cada cliente"],
            ].map(([Icon, t], i) => {
              const I = Icon as typeof TrendingUp;
              return <li key={i} className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-white/[0.04]"><I size={16} className="text-brand" /></span><span className="pt-1.5">{t as string}</span></li>;
            })}
          </ul>
        </div>
        <p className="relative text-xs text-muted">© Fonil Group</p>
      </section>

      {/* formulário */}
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo size={36} /></div>
          {step === "email" ? (
            <form onSubmit={request}>
              <h1 className="text-2xl font-bold tracking-tight">Entrar</h1>
              <p className="mt-1 mb-6 text-sm text-muted">Enviaremos um código de 6 dígitos para o seu e-mail.</p>
              <label className="label">E-mail</label>
              <div className="relative">
                <Mail size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                <input className="input !py-3 !pl-10" type="email" required autoFocus autoComplete="email" placeholder="voce@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <button className="btn mt-4 w-full py-3" disabled={busy}>{busy ? "Enviando…" : "Receber código"}</button>
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); verify(digits.join("")); }}>
              <button type="button" onClick={() => { setStep("email"); setMsg(null); }} className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> trocar e-mail</button>
              <h1 className="text-2xl font-bold tracking-tight">Digite o código</h1>
              <p className="mt-1 mb-6 text-sm text-muted">Enviado para <span className="text-ink">{email}</span>. Você também pode clicar no botão do e-mail — funciona em qualquer navegador.</p>
              <div className="flex justify-between gap-2">
                {digits.map((d, i) => (
                  <input key={i} ref={(el) => { boxes.current[i] = el; }} value={d} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={i === 0 ? LEN : 1}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) boxes.current[i - 1]?.focus(); }}
                    className="size-12 rounded-xl border border-line bg-white/[0.04] text-center text-xl font-semibold outline-none transition focus:border-brand/70 focus:ring-4 focus:ring-brand/20" />
                ))}
              </div>
              <button className="btn mt-5 w-full py-3" disabled={busy || digits.some((d) => !d)}>{busy ? "Entrando…" : "Entrar"}</button>
              <button type="button" disabled={cooldown > 0 || busy} onClick={() => request()} className="mt-4 w-full text-center text-sm text-muted hover:text-ink disabled:opacity-50">
                {cooldown > 0 ? `Reenviar código em ${cooldown}s` : "Reenviar código"}
              </button>
            </form>
          )}
          {msg && <div className={`mt-4 rounded-xl border px-3 py-2.5 text-sm ${msg.ok ? "border-good/30 bg-good/10 text-good" : "border-bad/30 bg-bad/10 text-bad"}`}>{msg.text}</div>}
        </div>
      </section>
    </main>
  );
}

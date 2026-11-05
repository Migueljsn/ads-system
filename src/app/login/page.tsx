"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** traduz os erros do Supabase Auth que aparecem no login */
function explain(message: string, status?: number) {
  if (status === 429 || /rate limit|security purposes|after \d+ seconds/i.test(message))
    return "Um código já foi enviado há menos de 1 minuto. Use o último código recebido ou aguarde 60 s para pedir outro.";
  if (/expired|invalid/i.test(message)) return "Código inválido ou expirado. Peça um novo código.";
  if (/sending/i.test(message)) return "Não foi possível enviar o e-mail agora. Tente de novo em instantes.";
  return message;
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const e = new URLSearchParams(location.search).get("e");
    if (e === "forbidden") setMsg({ text: "Esse e-mail não tem acesso ao painel. Peça a um administrador para liberar." });
    if (e === "link") setMsg({ text: "O link do e-mail precisa ser aberto no mesmo navegador. Digite o código de 6 dígitos." });
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const addr = email.trim().toLowerCase();
    setEmail(addr);
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email: addr, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    setBusy(false);
    if (!error) {
      setStep("code");
      setMsg({ text: "Código enviado. Confira também Spam e Promoções.", ok: true });
    } else if (error.status === 429 || /rate limit|security purposes/i.test(error.message)) {
      // já existe um código válido recente: deixa digitar
      setStep("code");
      setMsg({ text: explain(error.message, error.status) });
    } else setMsg({ text: explain(error.message, error.status) });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabaseBrowser().auth.verifyOtp({ email, token: code.replace(/\D/g, ""), type: "email" });
    if (error) {
      setBusy(false);
      setMsg({ text: explain(error.message, error.status) });
    } else location.href = "/";
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-lg font-semibold">Fonil Ads</h1>
        <p className="mb-4 text-sm text-muted">Meta + Google Ads com IA</p>
        {step === "email" ? (
          <form onSubmit={send} className="space-y-3">
            <input className="input" type="email" required autoComplete="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn w-full justify-center" disabled={busy}>{busy ? "Enviando…" : "Receber código"}</button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <p className="text-sm">Digite o código de 6 dígitos enviado para <b>{email}</b>.</p>
            <input className="input text-center text-lg tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn w-full justify-center" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
            <button type="button" className="text-xs text-muted underline" onClick={() => { setStep("email"); setMsg(null); setCode(""); }}>trocar e-mail / pedir novo código</button>
          </form>
        )}
        {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</p>}
      </div>
    </main>
  );
}

"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [msg, setMsg] = useState<string | null>(typeof window !== "undefined" && location.search.includes("forbidden") ? "Esse e-mail não tem acesso." : null);
  const [busy, setBusy] = useState(false);
  const sb = supabaseBrowser();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    setBusy(false);
    if (error) setMsg(error.message);
    else setStep("code");
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await sb.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setMsg(error.message);
    else location.href = "/";
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-lg font-semibold">Fonil Ads</h1>
        <p className="mb-4 text-sm text-muted">Meta + Google Ads com IA</p>
        {step === "email" ? (
          <form onSubmit={send} className="space-y-3">
            <input className="input" type="email" required placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn w-full justify-center" disabled={busy}>{busy ? "Enviando…" : "Receber código"}</button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <p className="text-sm">Enviamos um código para <b>{email}</b> (ou clique no link do e-mail).</p>
            <input className="input text-center tracking-widest" inputMode="numeric" required placeholder="código" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn w-full justify-center" disabled={busy}>Entrar</button>
            <button type="button" className="text-xs text-muted underline" onClick={() => setStep("email")}>trocar e-mail</button>
          </form>
        )}
        {msg && <p className="mt-3 text-sm text-red-500">{msg}</p>}
      </div>
    </main>
  );
}

"use server";

import { createClient } from "@supabase/supabase-js";
import { allowedEmails } from "@/lib/auth";
import { APP_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

/*
 * O pedido do código sai do servidor com o fluxo "implicit" (sem PKCE): o link do e-mail volta com a sessão no
 * fragmento (#access_token=…) e funciona em qualquer navegador/celular — não depende de um cookie do navegador que pediu.
 */
export async function sendCode(raw: string): Promise<{ ok: boolean; message: string; rateLimited?: boolean }> {
  const email = raw.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: "E-mail inválido." };
  if (!(await allowedEmails()).has(email)) return { ok: false, message: "Esse e-mail não tem acesso ao painel. Peça a um administrador para liberar." };
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${APP_URL}/auth/confirm`, shouldCreateUser: true } });
  if (!error) return { ok: true, message: "Código enviado! Confira a caixa de entrada (e Spam/Promoções)." };
  if (error.status === 429 || /rate limit|security purposes|seconds/i.test(error.message))
    return { ok: false, rateLimited: true, message: "Já enviamos um código há menos de 1 minuto. Use o código do e-mail mais recente ou aguarde para pedir outro." };
  return { ok: false, message: `Não foi possível enviar: ${error.message}` };
}

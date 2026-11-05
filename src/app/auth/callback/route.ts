import { NextResponse } from "next/server";
import { supabaseUser } from "@/lib/supabase/server";

/** link do e-mail: troca o código pela sessão; aberto em outro navegador, a troca falha (PKCE) e pede o código de 6 dígitos */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.APP_URL ?? url.origin;
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await (await supabaseUser()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", base));
  }
  return NextResponse.redirect(new URL("/login?e=link", base));
}

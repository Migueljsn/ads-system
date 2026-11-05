import { NextResponse } from "next/server";
import { supabaseUser } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) await (await supabaseUser()).auth.exchangeCodeForSession(code);
  const base = process.env.APP_URL ?? url.origin;
  return NextResponse.redirect(new URL("/", base));
}

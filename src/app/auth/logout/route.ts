import { NextResponse } from "next/server";
import { supabaseUser } from "@/lib/supabase/server";

export async function POST(req: Request) {
  await (await supabaseUser()).auth.signOut();
  return NextResponse.redirect(new URL("/login", process.env.APP_URL ?? req.url), 303);
}

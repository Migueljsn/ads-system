import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** renova a sessão do Supabase e manda quem não está logado para /login (APIs têm autenticação própria) */
export async function proxy(req: NextRequest) {
  // o antigo ads.fonilgroup.com.br é bloqueado por bloqueadores de anúncio: manda para o domínio oficial
  const official = process.env.APP_URL ? new URL(process.env.APP_URL).host : null;
  if (official && req.headers.get("host")?.startsWith("ads.") && req.headers.get("host") !== official) {
    return NextResponse.redirect(new URL(req.nextUrl.pathname + req.nextUrl.search, process.env.APP_URL), 308);
  }
  // modo TV: ?tv=1 liga e ?tv=0 desliga (fica salvo num cookie por 1 ano)
  const tv = req.nextUrl.searchParams.get("tv");
  if (tv === "1" || tv === "0") {
    const clean = req.nextUrl.clone();
    clean.searchParams.delete("tv");
    const r = NextResponse.redirect(clean);
    r.cookies.set("tv", tv, { path: "/", maxAge: 31536000, sameSite: "lax" });
    return r;
  }
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await sb.auth.getUser();
  const open = req.nextUrl.pathname.startsWith("/login") || req.nextUrl.pathname.startsWith("/auth");
  if (!data.user && !open) return NextResponse.redirect(new URL("/login", req.url));
  return res;
}

export const config = { matcher: ["/((?!api/|_next/|favicon.ico|.*\\.(?:png|svg|ico|txt)$).*)"] };

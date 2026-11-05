import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../env";

/** cliente com a sessão do usuário (só para autenticação) */
export async function supabaseUser() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Component: o proxy renova a sessão
        }
      },
    },
  });
}

/** cliente de serviço (ignora RLS) — todo acesso a dados passa por aqui, depois de checar quem pede */
export function db() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) throw new Error("Supabase não configurado (SUPABASE_SERVICE_ROLE_KEY)");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

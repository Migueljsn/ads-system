"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** destino do link do e-mail: lê a sessão do fragmento (#access_token=…) e grava nos cookies */
export default function Confirm() {
  const [msg, setMsg] = useState("Entrando…");
  useEffect(() => {
    (async () => {
      const hash = new URLSearchParams(location.hash.slice(1));
      const query = new URLSearchParams(location.search);
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        const { error } = await supabaseBrowser().auth.setSession({ access_token, refresh_token });
        if (!error) return void location.replace("/");
        return setMsg(`Não foi possível entrar: ${error.message}`);
      }
      if (query.get("code")) return void location.replace(`/auth/callback${location.search}`);
      const err = hash.get("error_description") || query.get("error_description");
      setMsg(err ? `Link inválido ou expirado (${err}). Peça um novo código.` : "Link inválido. Peça um novo código.");
    })();
  }, []);
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="card max-w-sm text-center">
        <p className="text-sm">{msg}</p>
        {msg !== "Entrando…" && <a href="/login" className="btn mt-4 justify-center">Voltar ao login</a>}
      </div>
    </main>
  );
}

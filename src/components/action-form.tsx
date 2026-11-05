"use client";
import { useActionState } from "react";
import type { Result } from "@/app/(app)/actions";

export function ActionForm({ action, children, className, submit = "Salvar" }: { action: (s: Result, f: FormData) => Promise<Result>; children: React.ReactNode; className?: string; submit?: string }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className={className}>
      {children}
      <div className="mt-3 flex items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Aguarde…" : submit}</button>
        {state && <span className={`text-sm ${state.ok ? "text-emerald-500" : "text-red-500"}`}>{state.message}</span>}
      </div>
      {state?.secret && (
        <pre className="mt-3 overflow-x-auto rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs select-all">{state.secret}</pre>
      )}
    </form>
  );
}

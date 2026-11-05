"use client";
import { useState, useTransition } from "react";
import { askAi } from "@/app/(app)/actions";

type Msg = { role: "user" | "assistant"; content: string; tools?: string[] };

export function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [write, setWrite] = useState(false);
  const [pending, start] = useTransition();
  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const next = [...msgs, { role: "user" as const, content: text.trim() }];
    setMsgs(next);
    setText("");
    start(async () => {
      const r = await askAi(next.map(({ role, content }) => ({ role, content })), write);
      setMsgs([...next, { role: "assistant", content: r.text, tools: r.toolCalls }]);
    });
  }
  return (
    <div>
      <div className="mb-3 max-h-[480px] space-y-3 overflow-y-auto">
        {!msgs.length && <p className="text-sm text-muted">Ex.: “Quais campanhas tiveram CPA acima de R$ 50 nos últimos 7 dias?” · “Compare Meta x Google este mês” · “Crie uma tarefa no ClickUp para revisar os criativos do cliente X”.</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`rounded-lg p-3 text-sm whitespace-pre-wrap ${m.role === "user" ? "ml-8 bg-brand/10" : "mr-8 border border-line"}`}>
            {m.content}
            {m.tools?.length ? <div className="mt-2 text-[10px] text-muted">ferramentas: {m.tools.join(", ")}</div> : null}
          </div>
        ))}
        {pending && <div className="text-sm text-muted">Analisando…</div>}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Pergunte algo…" />
        <button className="btn" disabled={pending}>Enviar</button>
      </form>
      <label className="mt-2 flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} /> permitir ações (pausar, orçamento, ClickUp, sync)</label>
    </div>
  );
}

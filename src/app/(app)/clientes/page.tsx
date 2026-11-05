import { ActionForm } from "@/components/action-form";
import { allLists } from "@/lib/clickup";
import { money } from "@/lib/format";
import { db } from "@/lib/supabase/server";
import { removeClient, saveClient } from "../actions";

export default async function Clients({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const [{ data: clients }, lists] = await Promise.all([db().from("clients").select("*").order("name"), allLists().catch(() => [] as { id: string; name: string }[])]);
  const editing = (clients ?? []).find((c) => c.id === edit);
  const listName = new Map(lists.map((l) => [l.id, l.name]));
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Clientes</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2 overflow-x-auto">
          <table className="t">
            <thead><tr><th>Cliente</th><th>Lista do ClickUp</th><th className="n">Orçamento/mês</th><th /></tr></thead>
            <tbody>
              {(clients ?? []).map((c) => (
                <tr key={c.id}>
                  <td>{c.name}<div className="font-mono text-[10px] text-muted">{c.id}</div></td>
                  <td className="text-xs">{c.clickup_list_id ? listName.get(c.clickup_list_id) ?? c.clickup_list_id : "—"}</td>
                  <td className="n">{money(c.monthly_budget)}</td>
                  <td className="flex gap-2"><a href={`/clientes?edit=${c.id}`} className="text-xs text-brand">editar</a><a href={`/?client=${c.id}`} className="text-xs text-brand">painel</a>
                    <form action={removeClient}><input type="hidden" name="id" value={c.id} /><button className="text-xs text-red-500">excluir</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!clients?.length && <p className="py-4 text-center text-sm text-muted">Nenhum cliente. Crie ao lado e vincule as contas em “Contas”.</p>}
        </div>
        <div className="card">
          <h2 className="mb-2 font-medium">{editing ? "Editar cliente" : "Novo cliente"}</h2>
          <ActionForm action={saveClient} key={editing?.id ?? "new"}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <label className="label">Nome</label><input name="name" defaultValue={editing?.name} className="input mb-2" required />
            <label className="label">Lista do ClickUp (relatórios e tarefas)</label>
            <select name="clickup_list_id" defaultValue={editing?.clickup_list_id ?? ""} className="input mb-2"><option value="">—</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            <label className="label">Orçamento mensal</label><input name="monthly_budget" defaultValue={editing?.monthly_budget ?? ""} className="input mb-2" inputMode="decimal" />
            <label className="label">Notas para a IA (meta de CPA, oferta, público…)</label><textarea name="notes" defaultValue={editing?.notes ?? ""} className="input h-20" />
          </ActionForm>
        </div>
      </div>
    </>
  );
}

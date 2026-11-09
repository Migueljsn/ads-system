import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { allLists, taskUrl } from "@/lib/clickup";
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
      <PageHeader title="Clientes" subtitle="Agrupe contas por cliente e defina a lista do ClickUp de cada um." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2 overflow-x-auto">
          <table className="t">
            <thead><tr><th>Cliente</th><th>ClickUp</th><th className="n">Orçamento/mês</th><th /></tr></thead>
            <tbody>
              {(clients ?? []).map((c) => (
                <tr key={c.id}>
                  <td>{c.name}<div className="font-mono text-[10px] text-muted">{c.id}</div></td>
                  <td className="text-xs">{c.clickup_list_id ? listName.get(c.clickup_list_id) ?? c.clickup_list_id : "—"}
                    {c.clickup_report_task_id && <div><a href={taskUrl(c.clickup_report_task_id)} target="_blank" rel="noreferrer" className="text-brand">tarefa de relatórios</a></div>}</td>
                  <td className="n">{money(c.monthly_budget)}</td>
                  <td className="flex gap-2"><a href={`/clientes?edit=${c.id}`} className="text-xs text-brand">editar</a><a href={`/?client=${c.id}`} className="text-xs text-brand">painel</a>
                    <form action={removeClient}><input type="hidden" name="id" value={c.id} /><button className="text-xs text-bad">excluir</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!clients?.length && <p className="py-4 text-center text-sm text-muted">Nenhum cliente. Crie ao lado e vincule as contas em “Contas”.</p>}
        </div>
        <div className="card">
          <h2 className="card-title">{editing ? "Editar cliente" : "Novo cliente"}</h2>
          <ActionForm action={saveClient} key={editing?.id ?? "new"}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <label className="label">Nome</label><input name="name" defaultValue={editing?.name} className="input mb-2" required />
            <label className="label">Lista do ClickUp (relatórios e tarefas)</label>
            <select name="clickup_list_id" defaultValue={editing?.clickup_list_id ?? ""} className="input mb-2"><option value="">—</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            <label className="label">Tarefa de relatórios do ClickUp (link ou id; o relatório de IA vira comentário nela)</label>
            <input name="clickup_report_task" defaultValue={editing?.clickup_report_task_id ? taskUrl(editing.clickup_report_task_id) : ""} className="input mb-2" placeholder="https://app.clickup.com/t/…" />
            <label className="label">Cliente no Fonil CRM (slug do tracking, ex.: rio-piranhas)</label>
            <input name="tracking_slug" defaultValue={editing?.tracking_slug ?? ""} className="input mb-2" placeholder="rio-piranhas" />
            <label className="label">Orçamento mensal</label><input name="monthly_budget" defaultValue={editing?.monthly_budget ?? ""} className="input mb-2" inputMode="decimal" />
            <label className="label">Notas para a IA (meta de CPA, oferta, público…)</label><textarea name="notes" defaultValue={editing?.notes ?? ""} className="input h-20" />
          </ActionForm>
        </div>
      </div>
    </>
  );
}

import { db } from "@/lib/supabase/server";

/** filtros por GET (período, plataforma, cliente) — funciona sem JS */
export async function Filters({ sp, extra }: { sp: Record<string, string | undefined>; extra?: React.ReactNode }) {
  const { data: clients } = await db().from("clients").select("id, name").order("name");
  return (
    <form className="mb-4 flex flex-wrap items-end gap-2">
      <div><label className="label">Período</label>
        <select name="days" defaultValue={sp.since ? "" : sp.days ?? "7"} className="input">
          <option value="1">Hoje</option><option value="2">Ontem e hoje</option><option value="7">7 dias</option><option value="14">14 dias</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="">Personalizado</option>
        </select></div>
      <div><label className="label">De</label><input type="date" name="since" defaultValue={sp.since} className="input" /></div>
      <div><label className="label">Até</label><input type="date" name="until" defaultValue={sp.until} className="input" /></div>
      <div><label className="label">Plataforma</label>
        <select name="platform" defaultValue={sp.platform ?? ""} className="input"><option value="">Todas</option><option value="meta">Meta</option><option value="google">Google</option></select></div>
      <div><label className="label">Cliente</label>
        <select name="client" defaultValue={sp.client ?? ""} className="input"><option value="">Todos</option>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      {extra}
      <button className="btn">Aplicar</button>
    </form>
  );
}

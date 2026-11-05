"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, createApiKey } from "@/lib/auth";
import { checkGoogleAccount, credFromInput, listClientAccounts, saveGoogleAccount, syncGoogle } from "@/lib/google";
import { checkBm, importAccounts, saveBm, syncMeta } from "@/lib/meta";
import { daysAgo, dayBR } from "@/lib/dates";
import { db } from "@/lib/supabase/server";
import { syncAll } from "@/lib/sync";

export type Result = { ok: boolean; message: string; secret?: string } | null;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ---------- Meta ---------- */
export async function connectMeta(_: Result, form: FormData): Promise<Result> {
  const user = await requireUser();
  const input = z.object({ id: z.string().trim().regex(/^\d{5,25}$/), token: z.string().trim().min(40).max(1000) }).safeParse({ id: form.get("id"), token: form.get("token") });
  if (!input.success) return { ok: false, message: "Confira o ID do BM (só números) e o token do System User." };
  try {
    const name = await checkBm(input.data.id, input.data.token);
    await saveBm({ id: input.data.id, name, token: input.data.token, by: user.email });
    const n = await importAccounts(input.data.id);
    const r = await syncMeta({ since: daysAgo(29), until: dayBR(), trigger: "manual" }).catch(() => null);
    revalidatePath("/", "layout");
    return { ok: true, message: `BM “${name}” conectado: ${n} contas importadas${r ? `, ${r.rows} linhas dos últimos 30 dias` : ""}.` };
  } catch (e) {
    return { ok: false, message: `A Meta recusou: ${msg(e)}` };
  }
}

export async function reimportMeta(form: FormData) {
  await requireUser();
  await importAccounts(String(form.get("bm")));
  revalidatePath("/contas");
}

export async function removeBm(form: FormData) {
  await requireUser();
  await db().from("meta_bms").delete().eq("id", String(form.get("bm")));
  revalidatePath("/contas");
}

/* ---------- Google ---------- */
export async function connectGoogle(_: Result, form: FormData): Promise<Result> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "").replace(/\D/g, "");
  const mcc = String(form.get("mcc") ?? "").replace(/\D/g, "") || null;
  const file = form.get("keyFile");
  const raw = (file instanceof File && file.size ? await file.text() : String(form.get("key") ?? "")).trim();
  const cred = credFromInput(raw);
  if (!cred) return { ok: false, message: "Envie a chave JSON da conta de serviço (ou um refresh token OAuth 1//…)." };
  if (!id && !mcc) return { ok: false, message: "Informe o ID da conta (10 dígitos) ou o da MCC para importar todas." };
  try {
    const ids = id ? [id] : (await listClientAccounts(mcc!, cred)).map((c) => c.id);
    const names: string[] = [];
    for (const cid of ids) {
      const info = await checkGoogleAccount(cid, cred, mcc);
      await saveGoogleAccount({ id: cid, ...info, raw, cred, loginCustomerId: mcc, by: user.email });
      names.push(info.name);
    }
    const r = await syncGoogle({ since: daysAgo(29), until: dayBR(), trigger: "manual" }).catch(() => null);
    revalidatePath("/", "layout");
    return { ok: true, message: `${names.length} conta(s) conectada(s): ${names.join(", ")}${r ? ` · ${r.rows} linhas sincronizadas` : ""}.` };
  } catch (e) {
    return { ok: false, message: `O Google recusou: ${msg(e)}` };
  }
}

/* ---------- contas (comum) ---------- */
export async function updateAccount(form: FormData) {
  await requireUser();
  const table = form.get("platform") === "google" ? "google_ads_accounts" : "meta_ad_accounts";
  const patch: Record<string, unknown> = {};
  if (form.has("active")) patch.active = form.get("active") === "1";
  if (form.has("client")) patch.client_id = String(form.get("client")) || null;
  await db().from(table).update(patch).eq("id", String(form.get("id")));
  revalidatePath("/contas");
}

export async function removeGoogleAccount(form: FormData) {
  await requireUser();
  await db().from("google_ads_accounts").delete().eq("id", String(form.get("id")));
  revalidatePath("/contas");
}

export async function syncNow(_: Result, form: FormData): Promise<Result> {
  await requireUser();
  const days = Math.min(365, Math.max(1, Number(form.get("days")) || 3));
  const platform = (String(form.get("platform") ?? "") || undefined) as "meta" | "google" | undefined;
  const r = await syncAll({ days, platform, trigger: "manual" });
  revalidatePath("/", "layout");
  const parts = r.results.map((x) => {
    const y = x as { provider: string; ok?: number; rows?: number; errors?: string[] };
    return `${y.provider}: ${y.rows != null ? `${y.ok} contas, ${y.rows} linhas` : "erro"}${y.errors?.length ? ` (${y.errors[0]})` : ""}`;
  });
  return { ok: r.results.every((x) => x.status !== "error"), message: parts.join(" · ") };
}

/* ---------- clientes ---------- */
const slugify = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function saveClient(_: Result, form: FormData): Promise<Result> {
  await requireUser();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2) return { ok: false, message: "Nome obrigatório." };
  const row = {
    name,
    clickup_list_id: String(form.get("clickup_list_id") ?? "") || null,
    monthly_budget: form.get("monthly_budget") ? Number(String(form.get("monthly_budget")).replace(",", ".")) : null,
    notes: String(form.get("notes") ?? "") || null,
  };
  const { error } = id ? await db().from("clients").update(row).eq("id", id) : await db().from("clients").insert({ ...row, slug: `${slugify(name)}-${Date.now().toString(36).slice(-4)}` });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: id ? "Cliente atualizado." : "Cliente criado." };
}

export async function removeClient(form: FormData) {
  await requireUser();
  await db().from("clients").delete().eq("id", String(form.get("id")));
  revalidatePath("/clientes");
}

/* ---------- API keys ---------- */
export async function newApiKey(_: Result, form: FormData): Promise<Result> {
  const user = await requireUser();
  const name = String(form.get("name") ?? "").trim() || "sem nome";
  const scopes = form.get("write") === "on" ? ["read", "write"] : ["read"];
  const key = await createApiKey(name, scopes, user.email);
  revalidatePath("/mcp");
  return { ok: true, message: "Chave criada. Copie agora — ela não aparece de novo.", secret: key };
}

export async function revokeApiKey(form: FormData) {
  await requireUser();
  await db().from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", String(form.get("id")));
  revalidatePath("/mcp");
}

/* ---------- configurações ---------- */
export async function saveSettings(_: Result, form: FormData): Promise<Result> {
  const user = await requireUser();
  if (!user.isAdmin) return { ok: false, message: "Só administradores (ADMIN_EMAILS) mudam configurações." };
  const team = String(form.get("team") ?? "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /@/.test(e));
  const now = new Date().toISOString();
  await db().from("settings").upsert([
    { key: "team_emails", value: team, updated_at: now },
    { key: "clickup_default_list", value: String(form.get("clickup_default_list") ?? "") || null, updated_at: now },
    { key: "daily_report_enabled", value: form.get("daily_report") === "on", updated_at: now },
  ]);
  revalidatePath("/config");
  return { ok: true, message: "Configurações salvas." };
}

/* ---------- IA ---------- */
export async function runAnalysis(_: Result, form: FormData): Promise<Result> {
  const user = await requireUser();
  const { analyze } = await import("@/lib/ai");
  const days = Number(form.get("days")) || 7;
  try {
    const r = await analyze({ since: daysAgo(days - 1), until: dayBR(), clientId: String(form.get("client") ?? "") || undefined, sendToClickUp: form.get("clickup") === "on", by: user.email });
    revalidatePath("/ia");
    return { ok: true, message: r.task ? `Relatório gerado e enviado ao ClickUp: ${r.task.url}` : "Relatório gerado." };
  } catch (e) {
    return { ok: false, message: msg(e) };
  }
}

export async function askAi(history: { role: "user" | "assistant"; content: string }[], allowWrite: boolean) {
  const user = await requireUser();
  const { chat } = await import("@/lib/ai");
  try {
    return await chat(history, { by: user.email, allowWrite });
  } catch (e) {
    return { text: `Erro: ${msg(e)}`, toolCalls: [] };
  }
}

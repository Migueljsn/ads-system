import "server-only";
import { daysAgo, dayBR } from "./dates";
import { syncGoogle } from "./google";
import { syncMeta } from "./meta";

export async function syncAll(opts: { days?: number; since?: string; until?: string; trigger: string; platform?: "meta" | "google" }) {
  const days = Math.min(365, Math.max(1, opts.days ?? 3));
  const since = opts.since ?? daysAgo(days - 1);
  const until = opts.until ?? dayBR();
  const out = [];
  if (opts.platform !== "google") out.push(await syncMeta({ since, until, trigger: opts.trigger }).catch((e) => ({ provider: "meta", status: "error", errors: [String(e?.message ?? e)] })));
  if (opts.platform !== "meta") out.push(await syncGoogle({ since, until, trigger: opts.trigger }).catch((e) => ({ provider: "google", status: "error", errors: [String(e?.message ?? e)] })));
  return { since, until, results: out };
}

import { range } from "./dates";
import type { Filters, Platform } from "./report";

export type SP = Promise<Record<string, string | undefined>>;
export function filtersFrom(sp: Record<string, string | undefined>): Filters {
  const days = Number(sp.days) || 7;
  return { ...range(sp.since || null, sp.until || null, days), platform: (sp.platform as Platform) || undefined, clientId: sp.client || undefined, search: sp.q || undefined };
}

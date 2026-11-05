/** datas no fuso de Brasília (YYYY-MM-DD) */
export const dayBR = (d: Date = new Date()) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
export const daysAgo = (n: number) => dayBR(new Date(Date.now() - n * 86400_000));
export const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
/** intervalo padrão: últimos N dias incluindo hoje */
export function range(since?: string | null, until?: string | null, days = 7) {
  const u = isDay(until) ? until : dayBR();
  const s = isDay(since) ? since : daysAgo(days - 1);
  return { since: s, until: u };
}

export const money = (n: number | null | undefined, ccy = "BRL") => (n == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: ccy, maximumFractionDigits: 2 }).format(n));
export const num = (n: number | null | undefined, d = 0) => (n == null ? "—" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: d }).format(n));
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${num(n, 1)}%`);
export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "nunca");

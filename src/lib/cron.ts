import "server-only";
import { timingSafeEqual } from "node:crypto";

export function cronOk(req: Request) {
  const want = Buffer.from(process.env.CRON_SECRET ?? "");
  const got = Buffer.from(req.headers.get("x-cron-token") ?? "");
  return want.length >= 16 && want.length === got.length && timingSafeEqual(want, got);
}

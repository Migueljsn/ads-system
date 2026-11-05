import { api, call } from "@/lib/api";
export const maxDuration = 300;
export const POST = api(async (req, ctx) => call("sync_now", await req.json().catch(() => ({})), ctx));

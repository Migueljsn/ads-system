import { api, call } from "@/lib/api";
export const GET = api((_req, ctx) => call("list_accounts", {}, ctx));

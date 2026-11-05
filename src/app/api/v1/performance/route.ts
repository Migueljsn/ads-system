import { api, call, queryInput } from "@/lib/api";
export const GET = api((req, ctx) => call("get_performance", queryInput(req), ctx));

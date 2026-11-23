import "server-only";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { boundedQuery } from "@/lib/email/queue/runtime-limits";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchOnePush } from "./notifications-provider";

const ticket = z.strictObject({runId: z.uuid(), ticket: z.uuid(), readyAtMs: z.number().int().positive()});
type Ticket = z.infer<typeof ticket>;

async function tickRpc(op: "admit" | "finish" | "stop", entry: Ticket): Promise<unknown> {
  const {data, error} = await boundedQuery(createAdminClient().rpc("erp_notification_tick", {
    p_op: op, p_run: entry.runId, p_ticket: entry.ticket,
  }));
  if (error) throw Error("Notification scheduler unavailable");
  return data;
}

type Dependencies = {
  enabled?: boolean;
  rpc?: typeof tickRpc;
  dispatch?: typeof dispatchOnePush;
  now?: () => number;
  wait?: (ms: number) => Promise<unknown>;
};

export async function processNotificationTick(input: unknown, deps: Dependencies = {}) {
  const enabled = deps.enabled ?? process.env.ERP_COMM_NOTIFICATION_SCHEDULER_ENABLED === "true";
  if (!enabled) return {state: "disabled"};
  const parsed = ticket.safeParse(input);
  if (!parsed.success) return {state: "invalid"};
  const entry = parsed.data;
  const now = deps.now ?? Date.now;
  const delay = entry.readyAtMs - now();
  if (delay > 20_100 || delay < -45_000) return {state: "stale"};
  if (delay > 0) await (deps.wait ?? sleep)(delay);
  if (now() - entry.readyAtMs >= 45_000) return {state: "stale"};
  const rpc = deps.rpc ?? tickRpc;
  const admitted = z.strictObject({pushEnabled: z.boolean(), workUntilMs: z.number().int().positive()}).safeParse(await rpc("admit", entry));
  if (!admitted.success) return {state: "inactive"};
  const hardEnd = Math.min(entry.readyAtMs + 45_000, admitted.data.workUntilMs);
  if (hardEnd <= now() + 12_000) {
    if (now() + 5_000 < hardEnd) await rpc("stop", entry);
    return {state: "stopped"};
  }
  if (admitted.data.pushEnabled) {
    const dispatch = deps.dispatch ?? dispatchOnePush;
    const results = await Promise.allSettled(Array.from({length: 8}, () => dispatch({hardEnd})));
    if (results.some(result => result.status === "rejected")) {
      if (now() + 5_000 < hardEnd) await rpc("stop", entry);
      return {state: "unconfirmed"};
    }
  }
  if (now() + 5_000 >= hardEnd) return {state: "stopped"};
  const next = await rpc("finish", entry);
  return {state: next === true ? "queued" : "stopped"};
}

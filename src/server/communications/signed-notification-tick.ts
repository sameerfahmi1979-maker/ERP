import "server-only";
import { createHash, createPublicKey, verify } from "node:crypto";
import { z } from "zod";
import { boundedQuery } from "@/lib/email/queue/runtime-limits";
import { createAdminClient } from "@/lib/supabase/admin";
import { communicationFeatureEnabled } from "./providers/config";
import { dispatchOnePush } from "./notifications-provider";

const minuteMs = 60_000;
const claimWindowMs = 15_000;
const tickWorkMs = 45_000;
const dispatchMinimumMs = 22_000;
const completionReserveMs = 5_000;
const pilotEnd = Date.parse("2026-11-30T19:59:00Z");
type Env = Readonly<Record<string, string | undefined>>;

const schema = z.strictObject({
  v: z.literal(1),
  purpose: z.literal("erp-communication-notification-tick"),
  intent: z.literal("dispatch-notifications"),
  planId: z.uuid(),
  deploymentId: z.uuid(),
  poolId: z.uuid(),
  allocationId: z.uuid(),
  startsAt: z.iso.datetime(),
  until: z.iso.datetime(),
  maxTicks: z.number().int().min(1).max(120),
  maxPhysicalStarts: z.number().int().min(1).max(16),
  maxClaims: z.literal(1),
  calendarEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  nonce: z.uuid(),
  ordinal: z.number().int().min(1).max(120),
  scheduledAt: z.iso.datetime(),
});
const admission = z.strictObject({
  pushEnabled: z.boolean(),
  workUntilMs: z.number().int().positive(),
});
export type SignedNotificationTick = z.infer<typeof schema>;

function canonicalBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw Error("Invalid capability encoding");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value) throw Error("Invalid capability encoding");
  return bytes;
}

export function readSignedNotificationTick(
  token: string, nonce: string, env: Env = process.env, now = Date.now(),
): SignedNotificationTick | null {
  try {
    if (env.ERP_COMM_NOTIFICATION_SCHEDULER_ENABLED !== "true" || !token || token.length > 4096) return null;
    const parts = token.split(".");
    const raw = env.ERP_COMM_WORKER_BOOT_PUBLIC_KEY;
    if (parts.length !== 2 || !raw || raw.length > 256) return null;
    const publicDer = Buffer.from(raw, "base64");
    if (publicDer.toString("base64") !== raw) return null;
    const body = canonicalBase64Url(parts[0]);
    const signature = canonicalBase64Url(parts[1]);
    const key = createPublicKey({ key: publicDer, format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ed25519" || signature.length !== 64 || !verify(null, body, key, signature)) return null;

    const grant = schema.parse(JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(body)));
    const start = Date.parse(grant.startsAt);
    const until = Date.parse(grant.until);
    const scheduled = start + (grant.ordinal - 1) * minuteMs;
    if (grant.planId !== env.ERP_COMM_NOTIFICATION_PLAN_ID || grant.deploymentId !== env.RAILWAY_DEPLOYMENT_ID ||
        grant.until !== env.ERP_COMM_NOTIFICATION_UNTIL || start % minuteMs !== 0 || until > pilotEnd ||
        grant.maxTicks !== (until - start) / minuteMs || grant.ordinal > grant.maxTicks || grant.nonce !== nonce ||
        grant.scheduledAt !== new Date(scheduled).toISOString() || now < scheduled || now >= scheduled + claimWindowMs) {
      return null;
    }
    return grant;
  } catch {
    return null;
  }
}

async function claim(grant: SignedNotificationTick, nonce: string, tokenHash: string, env: Env): Promise<unknown> {
  const { data, error } = await boundedQuery(createAdminClient().rpc("erp_comm_notification_tick_claim", {
    p_plan: grant.planId, p_nonce: nonce, p_deployment: grant.deploymentId, p_pool: grant.poolId,
    p_allocation: grant.allocationId, p_until: grant.until, p_token_sha256: tokenHash,
    p_ordinary: communicationFeatureEnabled("push", env), p_control: env.ERP_COMM_CONTROL_PUSH_ENABLED === "true",
  }));
  if (error) throw Error("Notification tick unavailable");
  return data;
}

async function finish(grant: SignedNotificationTick, nonce: string, success: boolean) {
  const { data, error } = await boundedQuery(createAdminClient().rpc("erp_comm_notification_tick_finish", {
    p_plan: grant.planId, p_nonce: nonce, p_success: success,
  }));
  return !error && data === true;
}

const shared = globalThis as typeof globalThis & { __erpSignedNotificationNonces?: Set<string> };
const seen = shared.__erpSignedNotificationNonces ??= new Set<string>();
type Dependencies = { claim?: typeof claim; finish?: typeof finish; dispatch?: typeof dispatchOnePush; now?: () => number; seen?: Set<string> };

/** Remember even an uncertain claim. The database serializes the separately funded process probes. */
export async function runSignedNotificationTick(
  token: string, nonce: string, env: Env = process.env, deps: Dependencies = {},
): Promise<"invalid" | "held" | "processed"> {
  const now = deps.now ?? Date.now;
  const grant = readSignedNotificationTick(token, nonce, env, now());
  if (!grant) return "invalid";
  const used = deps.seen ?? seen;
  const id = grant.planId + "/" + nonce;
  if (used.has(id)) return "held";
  used.add(id);

  try {
    const hash = createHash("sha256").update(token, "utf8").digest("hex");
    const result = admission.safeParse(await (deps.claim ?? claim)(grant, nonce, hash, env));
    if (!result.success || result.data.pushEnabled !== grant.pushEnabled) return "held";
    const hardEnd = Math.min(result.data.workUntilMs, Date.parse(grant.scheduledAt) + tickWorkMs, Date.parse(grant.until));
    const dispatchEnd = hardEnd - completionReserveMs;
    let success = true;
    if (grant.pushEnabled) {
      if (now() + dispatchMinimumMs >= dispatchEnd) return "held";
      try {
        const outcome = await (deps.dispatch ?? dispatchOnePush)({ hardEnd: dispatchEnd });
        success = ["idle", "accepted", "suppressed", "invalidToken"].includes(outcome.state);
      } catch {
        success = false;
      }
    }
    if (now() + completionReserveMs >= hardEnd) return "held";
    const confirmed = await (deps.finish ?? finish)(grant, nonce, success);
    return success && confirmed ? "processed" : "held";
  } catch {
    return "held";
  }
}

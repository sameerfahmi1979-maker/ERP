import "server-only";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { CommunicationHttpError, rpcFailure } from "./http";
import { boundedChatStorage } from "./media-storage";
import type { SignedWorkerBoot } from "./worker-boot-ticket";

const utc = z.iso.datetime({ offset: true });
const job = z.object({
  uploadId: z.uuid(), bucket: z.literal("erp-chat-media"), path: z.uuid(), attemptId: z.uuid(), leaseUntil: utc,
});
const claim = z.object({ coveredUntil: utc, job: job.nullable() });
const rpcMs = 5000, storageMs = 60000, busyMs = 2 * rpcMs + storageMs, idleMs = 30000;
const unavailable = () => new CommunicationHttpError("temporarily_unavailable");
type Plan = SignedWorkerBoot;

function timeLeft(until: number) {
  const remaining = Math.floor(until - Date.now());
  if (!Number.isFinite(remaining) || remaining <= 0) throw unavailable();
  return remaining;
}

async function timedRpc(name: string, args: Record<string, unknown>, until: number, cycle?: AbortSignal): Promise<unknown> {
  const deadline = AbortSignal.timeout(Math.min(rpcMs, timeLeft(until)));
  const signal = cycle ? AbortSignal.any([cycle, deadline]) : deadline;
  signal.throwIfAborted();
  const { data, error } = await createAdminClient().rpc(name, args).abortSignal(signal);
  signal.throwIfAborted();
  timeLeft(until);
  if (error) rpcFailure(error);
  return data;
}

async function openBoot(plan: Plan) {
  const result = await timedRpc("erp_chat_stage_boot", {
    p_worker: plan.worker, p_boot: plan.boot, p_until: new Date(plan.until).toISOString(), p_max_polls: plan.maxPolls,
  }, Math.min(plan.until, plan.registerBy));
  return Date.parse(utc.parse(result));
}

function isAbsent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const error = value as { status?: unknown; statusCode?: unknown; message?: unknown };
  return error.statusCode === "NoSuchKey" || ((error.statusCode === "404" || error.status === 404) &&
    (error.message === "Object not found" || error.message === "The object does not exist"));
}

/** The prepaid SQL model allows 5s for the claim, 60s for deletion and its check, and 5s for final confirmation. */
export async function sweepChatStage(plan: Plan): Promise<number> {
  if (timeLeft(plan.until) <= busyMs) throw unavailable();
  const attempt = randomUUID(), cycle = AbortSignal.timeout(busyMs), cycleEnd = Date.now() + busyMs;
  const result = claim.parse(await timedRpc("erp_chat_stage_claim", {
    p_worker: plan.worker, p_boot: plan.boot, p_attempt: attempt, p_until: new Date(plan.until).toISOString(),
  }, Math.min(plan.until, cycleEnd), cycle));
  const coveredUntil = Math.min(plan.until, Date.parse(result.coveredUntil)), entry = result.job;
  timeLeft(coveredUntil);
  if (!entry) return coveredUntil;
  if (entry.uploadId !== entry.path || entry.attemptId !== attempt) throw new CommunicationHttpError("conflict");

  const deadline = Math.min(cycleEnd, coveredUntil, Date.parse(entry.leaseUntil));
  const transferMs = Math.min(storageMs, timeLeft(deadline) - rpcMs);
  if (transferMs <= 0) throw unavailable();
  const signal = AbortSignal.any([cycle, AbortSignal.timeout(transferMs)]);
  const bucket = boundedChatStorage(signal).from(entry.bucket);
  let absent = false;
  try {
    const removal = await bucket.remove([entry.path]);
    if ((!removal.error || isAbsent(removal.error)) && !signal.aborted && timeLeft(deadline) > rpcMs) {
      const check = await bucket.info(entry.path);
      absent = !signal.aborted && isAbsent(check.error);
    }
  } finally {
    // An expired cycle cannot buy another RPC. A funded standby may recover the durable claim.
    const finish = await timedRpc("erp_chat_stage_finish", { p_upload: entry.uploadId, p_attempt: attempt, p_absent: absent }, deadline, cycle);
    if (!absent || !z.object({ confirmed: z.literal(true) }).safeParse(finish).success) throw unavailable();
  }
  return coveredUntil;
}

const runtime = { open: openBoot, poll: sweepChatStage, sleep: (ms: number): Promise<void> => delay(ms, undefined, { ref: false }) };

/** A declined/ambiguous poll stops this boot. A paid standby recovers the SQL lease. */
export async function runChatStagePolls(plan: Plan, initialCutoff: number, deps = runtime) {
  let cutoff = Math.min(plan.until, initialCutoff);
  for (let remaining = plan.maxPolls; remaining > 0 && cutoff - Date.now() > busyMs; remaining--) {
    cutoff = Math.min(cutoff, await deps.poll({ ...plan, until: cutoff }));
    if (remaining === 1 || cutoff - Date.now() <= idleMs + busyMs) break;
    await deps.sleep(idleMs);
  }
}

/** Called only by the authenticated, once-per-process worker-launch handler. */
export async function launchChatStageWorker(plan: Plan, deps = runtime): Promise<boolean> {
  if (plan.kind !== "chat_stage" || plan.until - Date.now() <= busyMs + rpcMs || plan.registerBy - Date.now() <= rpcMs) return false;
  try {
    const coveredUntil = await deps.open(plan);
    if (!Number.isFinite(coveredUntil) || Math.min(plan.until, coveredUntil) - Date.now() <= busyMs) return false;
    void runChatStagePolls(plan, coveredUntil, deps).catch(() => {});
    return true;
  } catch { return false; }
}

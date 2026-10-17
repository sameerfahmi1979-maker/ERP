import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { currentJobClaim, runWithJobClaim, type JobClaim } from "./claim-scope";
import { getDmsAiJobHandler } from "./job-registry";
import { validateJobInput, type EnqueueDmsAiJobInput, type DmsAiJobQueueRow, type DmsAiJobHandlerResult } from "./job-types";

export interface EnqueueResult { success: boolean; jobId?: number; skipped?: boolean; error?: string }
export interface ProcessResult { processed: number; completed: number; failed: number; retryScheduled: number; durationMs: number }
export function sanitizeJobError(error: unknown): { code: string; message: string } {
  const msg = error instanceof Error ? error.message : "";
  if (/timeout|ETIMEDOUT/i.test(msg)) return { code: "provider_timeout", message: "Request timed out." };
  if (/rate.?limit|429/i.test(msg)) return { code: "provider_rate_limit", message: "Rate limit reached." };
  if (/unavailable|503|502/i.test(msg)) return { code: "provider_unavailable", message: "Provider unavailable." };
  if (/network|ECONNREFUSED/i.test(msg)) return { code: "network_error", message: "Network error." };
  return { code: "unexpected", message: "AI job did not complete. Review the safe attempt code." };
}
const enqueueReceipt = z.object({ success: z.literal(true), jobId: z.number().int().positive(), skipped: z.boolean() });
export async function enqueueDmsAiJob(input: EnqueueDmsAiJobInput): Promise<EnqueueResult> {
  try {
    const value = validateJobInput(input);
    const parent = currentJobClaim();
    const db = parent ? createAdminClient() : await createClient();
    const { data, error } = parent
      ? await db.rpc("f07_ai_worker", { p_action: "enqueue_child", p_data: { parentId: parent.jobId, parentToken: parent.token, input: value } })
      : await db.rpc("f07_ai_job_control", { p_action: "enqueue", p_data: value });
    const receipt = enqueueReceipt.safeParse(data);
    return !error && receipt.success ? receipt.data : { success: false, error: "AI job admission not confirmed. Retry the same operation identity." };
  } catch { return { success: false, error: "AI job admission not confirmed. Check the input and retry the same operation identity." }; }
}
export async function enqueueUniqueDmsAiJob(input: EnqueueDmsAiJobInput & { idempotencyKey: string }): Promise<EnqueueResult> {
  if (!input.idempotencyKey) return { success: false, error: "A stable operation identity is required." };
  return enqueueDmsAiJob(input);
}
const claimSchema = z.object({
  token: z.uuid(),
  job: z.object({ id: z.number().int().positive(), job_type: z.string(), payload_json: z.record(z.string(), z.unknown()),
    attempt_count: z.number().int().positive(), max_attempts: z.number().int().min(1).max(3), locked_by: z.string() }).passthrough(),
});
const settled = z.object({ success: z.literal(true), jobId: z.number().int().positive(), attemptNumber: z.number().int().positive(),
  status: z.enum(["completed", "failed", "retry_scheduled"]) });
type ClaimedJob = Pick<DmsAiJobQueueRow, "id" | "job_type" | "payload_json" | "attempt_count" | "max_attempts" | "locked_by">;
export async function runDmsAiJob(job: ClaimedJob, claim: JobClaim): Promise<string | null> {
  if (job.id !== claim.jobId || job.locked_by !== claim.workerId || job.attempt_count !== claim.attemptNumber) return null;
  const db = createAdminClient();
  let result: DmsAiJobHandlerResult;
  try {
    // No provider execution if the claim/source/actor has already expired.
    const checked = await db.rpc("f07_ai_worker", { p_action: "assert", p_data: { jobId: job.id, token: claim.token } });
    if (checked.error || checked.data?.success !== true) return null;
    result = await runWithJobClaim(claim, async () => {
      const handler = getDmsAiJobHandler(job.job_type);
      if (!handler) return { success: false, errorCode: "handler_not_found", retryable: false };
      let outcome: DmsAiJobHandlerResult;
      try { outcome = await handler.handle(job.payload_json, { ...claim }); }
      catch (error) { outcome = { success: false, errorCode: sanitizeJobError(error).code, retryable: true }; }
      const scope = currentJobClaim();
      return scope?.failed ? { success: false, errorCode: "publication_rejected", retryable: !scope.uncertainWrite } : outcome;
    });
  } catch (error) { result = { success: false, errorCode: sanitizeJobError(error).code, retryable: true }; }
  try {
    // Outside the handler scope: settling a failed poisoned attempt remains
    // possible. The DB owns counts, backoff, history and terminal review atomically.
    const { data, error } = await db.rpc("f07_ai_worker", { p_action: "settle", p_data: {
      jobId: job.id, token: claim.token, success: result.success, errorCode: result.errorCode, retryable: result.retryable === true,
    } });
    const receipt = settled.safeParse(data);
    if (error || !receipt.success || receipt.data.jobId !== job.id || receipt.data.attemptNumber !== claim.attemptNumber) return null;
    return receipt.data.status;
  } catch { return null; } // Leave the claim for bounded recovery; never pretend success.
}
export async function processNextDmsAiJobs(input: { limit: number; workerId: string }): Promise<ProcessResult> {
  const at = Date.now();
  const totals: ProcessResult = { processed: 0, completed: 0, failed: 0, retryScheduled: 0, durationMs: 0 };
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50 || !input.workerId.trim() || input.workerId.length > 64) return totals;
  const db = createAdminClient();
  try {
    const recovered = await db.rpc("f07_ai_worker", { p_action: "recover", p_data: {} });
    if (recovered.error || recovered.data?.success !== true) throw new Error("Recovery unavailable");
    // Claim just in time, not a batch whose leases expire while earlier jobs run.
    for (let i = 0; i < input.limit; i++) {
      const { data, error } = await db.rpc("f07_ai_worker", { p_action: "claim", p_data: { workerId: input.workerId, limit: 1 } });
      const parsed = z.array(claimSchema).max(1).safeParse(data);
      if (error || !parsed.success) throw new Error("Claim unavailable");
      const row = parsed.data[0];
      if (!row) break;
      totals.processed++;
      const status = await runDmsAiJob(row.job, { jobId: row.job.id, token: row.token, workerId: input.workerId, attemptNumber: row.job.attempt_count });
      if (status === "completed") totals.completed++;
      else if (status === "failed") totals.failed++;
      else if (status === "retry_scheduled") totals.retryScheduled++;
      else break; // Ambiguous settlement is not an accepted outcome.
    }
  } catch { logger.warn("[job-runner] processing stopped; consult safe job history"); }
  return { ...totals, durationMs: Date.now() - at };
}

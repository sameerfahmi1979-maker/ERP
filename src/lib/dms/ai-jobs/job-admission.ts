import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { currentJobClaim } from "./claim-scope";
import { validateJobInput, type EnqueueDmsAiJobInput } from "./job-types";

export interface EnqueueResult {
  success: boolean;
  jobId?: number;
  skipped?: boolean;
  error?: string;
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

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { employeeDate, employeeId, isDefiniteEmployeeRejection } from "@/lib/hr/employee-contract";
import { getAuthContext } from "@/lib/rbac/check";
import { canUseApplication } from "@/lib/rbac/scope";
import { createClient } from "@/lib/supabase/server";

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const kind = z.enum(["confirm", "transfer", "end", "rehire"]);
const reason = z.string().trim().min(1).max(1500);
const proposal = z.object({
  employee: employeeId, revision: employeeId, kind, effectiveDate: employeeDate,
  company: employeeId.nullable(), branch: employeeId.nullable(), contractualStart: employeeDate.nullable(),
  exitCase: employeeId.nullable(), reason, operation: z.string().uuid(),
}).strict();
const decision = z.object({
  change: employeeId, digest, step: z.enum(["source", "destination", "apply"]),
  reason, operation: z.string().uuid(),
}).strict();

const changeFacts = z.object({
  id: employeeId, employee_id: employeeId, source_revision: z.string().regex(/^[1-9]\d*$/),
  kind, effective_on: employeeDate, source_company: employeeId, source_branch: employeeId.nullable(),
  destination_company: employeeId, destination_branch: employeeId.nullable(), contractual_start: employeeDate.nullable(),
  reason, digest, applied: z.boolean(), source_accepted: z.boolean(), destination_accepted: z.boolean(),
}).strict();
const receipt = z.object({ id: employeeId, digest, status: z.enum(["proposed", "accepted", "applied"]), replayed: z.boolean(),
  side: z.enum(["source", "destination"]).optional(), employee_id: employeeId.optional(), revision: z.string().optional(),
}).strict();
type EmploymentMutationResult =
  | { data: z.infer<typeof receipt>; error?: undefined; uncertain?: undefined }
  | { data?: undefined; error: string; uncertain: boolean };

export async function readEmploymentChange(change: number) {
  if (!employeeId.safeParse(change).success) return null;
  try {
    if (!canUseApplication(await getAuthContext())) return null;
    const db = await createClient();
    const reply = await db.rpc("t03_read_employment_change", { p_change: change });
    const parsed = changeFacts.safeParse(reply.data);
    return !reply.error && parsed.success && parsed.data.id === change ? parsed.data : null;
  } catch {
    return null;
  }
}

async function runEmploymentChange(rpc: string, input: Record<string, unknown>, expected?: { id: number; digest: string }): Promise<EmploymentMutationResult> {
  try {
    if (!canUseApplication(await getAuthContext())) return { error: "Current HR access is required.", uncertain: false };
    const db = await createClient();
    const result = await db.rpc(rpc, input);
    if (result.error?.code === "42501") return { error: "You do not have current authority for this employment change.", uncertain: false };
    if (result.error?.code === "P0409") return { error: "The reviewed record changed. Reopen it before continuing.", uncertain: false };
    if (isDefiniteEmployeeRejection(result.error?.code)) return { error: "The employment change was declined. Check the dates, exit evidence and required acceptances.", uncertain: false };
    const saved = receipt.safeParse(result.data);
    if (!saved.success || result.error || (expected && (saved.data.id !== expected.id || saved.data.digest !== expected.digest))) {
      return { error: "The outcome is unconfirmed. Retry the same request.", uncertain: true };
    }
    try { revalidatePath("/admin/hr/employees"); } catch { /* Committed receipt remains authoritative. */ }
    return { data: saved.data };
  } catch {
    return { error: "The outcome is unconfirmed. Retry the same request.", uncertain: true };
  }
}

export async function proposeEmploymentChange(input: unknown): Promise<EmploymentMutationResult> {
  const parsed = proposal.safeParse(input);
  if (!parsed.success) return { error: "Enter the required employment change facts.", uncertain: false };
  const p = parsed.data;
  return runEmploymentChange("t03_propose_employment_change", {
    p_employee: p.employee, p_revision: p.revision, p_kind: p.kind, p_effective: p.effectiveDate,
    p_company: p.company, p_branch: p.branch, p_contract: p.contractualStart, p_eos: p.exitCase,
    p_reason: p.reason, p_operation: p.operation,
  });
}

export async function decideEmploymentChange(input: unknown): Promise<EmploymentMutationResult> {
  const parsed = decision.safeParse(input);
  if (!parsed.success) return { error: "Enter a reason for the reviewed decision.", uncertain: false };
  const p = parsed.data;
  return runEmploymentChange("t03_decide_employment_change", {
    p_change: p.change, p_digest: p.digest, p_step: p.step, p_reason: p.reason, p_operation: p.operation,
  }, { id: p.change, digest: p.digest });
}

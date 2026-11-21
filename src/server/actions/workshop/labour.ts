"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fleetId } from "@/lib/fleet/asset-contract";
import { logger } from "@/lib/logger";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { jobWorkRequest, labourHrQueue, labourPayroll, labourPreview, labourReviewScopes, labourWorkspace,
  outsideWorkspace, workshopJobIndex } from "@/lib/workshop/labour-contract";

async function read<T>(rpc: string, params: Record<string, unknown>, shape: z.ZodType<T>) {
  try {
    if (!canUseApplication(await getAuthContext())) return null;
    const { data, error } = await (await createClient()).rpc(rpc, params, { get: true });
    if (error) {
      logger.warn("Workshop workload read failed", { rpc, code: error.code });
      return null;
    }
    const parsed = shape.safeParse(data);
    if (!parsed.success && data !== null) logger.warn("Workshop workload read validation failed", { rpc });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function listWorkshopWork(before?: number) {
  if (!fleetId.optional().safeParse(before).success) return null;
  return read("t12_job_work_index", { p_before: before }, workshopJobIndex);
}
export async function readWorkshopLabour(job: number) {
  if (!fleetId.safeParse(job).success) return null;
  return read("t12_labour_workspace", { p_job: job }, labourWorkspace);
}
export async function readWorkshopOutside(job: number) {
  if (!fleetId.safeParse(job).success) return null;
  return read("t12_outside_workspace", { p_job: job }, outsideWorkspace);
}
export async function readLabourPreview(assignment: number, from: string, until: string) {
  if (!fleetId.safeParse(assignment).success || !z.iso.datetime({ offset: true }).safeParse(from).success ||
      !z.iso.datetime({ offset: true }).safeParse(until).success) return null;
  return read("t12_labour_preview", { p_assignment: assignment, p_from: from, p_to: until }, labourPreview);
}
export async function listWorkshopReviewScopes(mode: "hr" | "accounts") {
  if (mode !== "hr" && mode !== "accounts") return null;
  return read("t12_labour_review_scopes", { p_mode: mode }, labourReviewScopes);
}
export async function readWorkshopHrQueue(branch: number, before?: number) {
  if (!fleetId.safeParse(branch).success || !fleetId.optional().safeParse(before).success) return null;
  return read("t12_labour_hr_queue", { p_branch: branch, p_before: before }, labourHrQueue);
}
export async function readWorkshopPayroll(branch: number, through: string, cutoff: string, before?: number) {
  if (!fleetId.safeParse(branch).success || !z.iso.date().safeParse(through).success ||
      !z.iso.datetime({ offset: true }).safeParse(cutoff).success || !fleetId.optional().safeParse(before).success) return null;
  return read("t12_labour_payroll", { p_branch: branch, p_through: through, p_cutoff: cutoff, p_before: before }, labourPayroll);
}

export async function saveJobWork(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = jobWorkRequest.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check all required fields before saving." };
  try {
    if (!canUseApplication(await getAuthContext())) return { ok: false, error: "Sign in again to continue." };
    const { nonce, parent, family, action, data } = parsed.data;
    const route = {
      labour: { rpc: "t12_labour_command", key: "p_job" },
      rate: { rpc: "t12_labour_rate", key: "p_branch" },
      outside: { rpc: "t12_outside_work", key: "p_job" },
      hr: { rpc: "t12_labour_hr", key: "p_version" },
      correction: { rpc: "t12_labour_correction", key: "p_claim" },
    }[family];
    const request = { p_operation: nonce, [route.key]: parent,
      ...(family === "hr" ? { p_digest: data.digest, p_reason: data.reason } : { p_action: action, p_data: data }) };
    const { error } = await (await createClient()).rpc(route.rpc, request);
    if (error) {
      if (["PT409", "42501", "22023", "P0409"].includes(error.code)) return { ok: false, error: error.message };
      if (["23505", "23P01", "22007", "22008", "22P02"].includes(error.code)) return { ok: false, error: "Check the date, reference or conflicting allocation." };
      logger.warn("Workshop workload save failed", { family, action, code: error.code });
      return { ok: false, error: "The save could not be confirmed. Retry with the same details." };
    }
    revalidatePath("/modules/workshop");
    revalidatePath("/admin/hr/operations/workshop-labour");
    revalidatePath("/admin/hr/payroll/workshop");
    return { ok: true };
  } catch {
    return { ok: false, error: "The save could not be confirmed. Retry with the same details." };
  }
}

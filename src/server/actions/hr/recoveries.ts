
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fleetId } from "@/lib/fleet/asset-contract";
import {
  recoveryInputs, recoveryMonth, recoveryRequest, recoveryScopes, recoveryWorkspace, type RecoveryAction,
} from "@/lib/hr/recovery-contract";
import { logger } from "@/lib/logger";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";

const route = "/admin/hr/operations/recoveries";

async function read<T>(rpc: string, params: Record<string, unknown>, shape: z.ZodType<T>) {
  try {
    if (!canUseApplication(await getAuthContext())) return null;
    const { data, error } = await (await createClient()).rpc(rpc, params);
    if (error) {
      logger.warn("Recovery records could not be read", { rpc, code: error.code });
      return null;
    }
    const parsed = shape.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function listRecoveryScopes() {
  return read("t13_recovery_scopes", {}, recoveryScopes);
}

export async function readRecoveryWorkspace(branch: number, month: string, caseId?: number, before?: number) {
  if (!fleetId.safeParse(branch).success || !recoveryMonth.safeParse(month).success ||
      !fleetId.optional().safeParse(caseId).success || !fleetId.optional().safeParse(before).success) return null;
  return read("t13_recovery_workspace", { p_branch: branch, p_month: month, p_case: caseId, p_before: before }, recoveryWorkspace);
}

export async function saveRecovery(action: RecoveryAction, target: number, nonce: string, form: FormData):
  Promise<{ ok: true } | { ok: false; error: string }> {
  const header = recoveryRequest.safeParse({ nonce, target, reason: form.get("reason"), basis: form.get("basis") });
  if (!header.success || !Object.hasOwn(recoveryInputs, action)) return { ok: false, error: "Enter a reason and check the selected record." };
  const fields: Record<string, unknown> = {};
  for (const [key, value] of form) {
    if (value !== "" && typeof value === "string") fields[key] = value;
  }
  for (const group of ["evidence", "notice", "response_evidence"]) {
    const formValue = form.get(group);
    if (typeof formValue !== "string" || !formValue) continue;
    const [document, version, file] = formValue.split("/");
    fields[group] = { document, version, file };
  }
  if (action === "prepare-policy") fields.allow_deduct_correct = fields.allow_deduct_correct === "on";
  if (action === "propose-schedule") {
    const amounts = form.getAll("amount");
    fields.instalments = form.getAll("month").map((value, index) => ({
      month: value + "-01", amount: amounts[index],
    }));
  }
  if (action === "propose-refund") fields.month = form.get("month") + "-01";
  const parsed = recoveryInputs[action].safeParse(fields);
  if (!parsed.success) return { ok: false, error: "Check the amounts, dates and evidence references." };
  try {
    if (!canUseApplication(await getAuthContext())) return { ok: false, error: "Sign in again to continue." };
    const { reason, basis } = header.data;
    let rpc = "t13_recovery_command";
    let params: Record<string, unknown> = { p_operation: nonce, p_target: target, p_action: action, p_data: { ...parsed.data, reason, basis } };
    if (action === "allocate") {
      const input = recoveryInputs.allocate.parse(parsed.data);
      rpc = "t13_recovery_allocate";
      params = { p_operation: nonce, p_receipt: input.receipt, p_pin: input.pin, p_schedule: input.schedule,
        p_month: input.month, p_line: input.line, p_amount: input.amount, p_reason: reason };
    }
    if (action === "reverse") {
      const input = recoveryInputs.reverse.parse(parsed.data);
      rpc = "t13_recovery_reverse";
      params = { p_operation: nonce, p_allocation: input.allocation, p_amount: input.amount, p_reason: reason };
    }
    const { error } = await (await createClient()).rpc(rpc, params);
    if (error) {
      if (["PT409", "42501", "22023", "55000", "P0409"].includes(error.code)) return { ok: false, error: error.message };
      if (["23505", "23514", "23P01", "22007", "22008", "22P02"].includes(error.code)) {
        return { ok: false, error: "Check the dates, evidence and references for a conflict or an existing record." };
      }
      logger.warn("Recovery save could not be confirmed", { rpc, action, code: error.code });
      return { ok: false, error: "The save could not be confirmed. Retry with the same details." };
    }
    revalidatePath(route);
    return { ok: true };
  } catch {
    return { ok: false, error: "The save could not be confirmed. Retry with the same details." };
  }
}

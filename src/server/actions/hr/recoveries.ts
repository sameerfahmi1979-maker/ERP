
"use server";

import type { OperationsCommandResult } from "@/lib/operations/command-result";
import { refreshOperationsPaths } from "@/server/operations/revalidate-command-paths";
import { z } from "zod";
import { fleetId } from "@/lib/fleet/asset-contract";
import {
  recoveryInputs, recoveryMonth, recoveryRequest, recoveryScopes, recoveryWorkspace, type RecoveryAction,
} from "@/lib/hr/recovery-contract";
import { logger } from "@/lib/logger";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";

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

const recoveryReceipt = z.object({ id: fleetId, replayed: z.boolean() });
const commandReceipt = recoveryReceipt.extend({ target: fleetId, action: z.string() });
const settlementReceipt = recoveryReceipt.extend({ pin_id: fleetId, receipt_id: fleetId, amount: z.number().positive() });
const allocationReceipt = settlementReceipt.extend({ unallocated: z.number().nonnegative() });
const reversalReceipt = settlementReceipt.extend({ reverses_allocation_id: fleetId });
type RecoveryReceipt = z.infer<typeof commandReceipt | typeof allocationReceipt | typeof reversalReceipt>;

export async function saveRecovery(action: RecoveryAction, target: number, nonce: string, form: FormData):
  Promise<OperationsCommandResult<RecoveryReceipt>> {
  const header = recoveryRequest.safeParse({ nonce, target, reason: form.get("reason"), basis: form.get("basis") });
  if (!header.success || !Object.hasOwn(recoveryInputs, action)) return { ok: false, uncertain: false, error: "Enter a reason and check the selected record." };
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
  const { reason, basis } = header.data;
  const invalid = { ok: false, uncertain: false, error: "Check the amounts, dates and evidence references." } as const;
  let rpc: string;
  let params: Record<string, unknown>;
  if (action === "allocate") {
    const parsed = recoveryInputs.allocate.safeParse(fields);
    if (!parsed.success) return invalid;
    const input = parsed.data;
    rpc = "t13_recovery_allocate";
    params = { p_operation: nonce, p_receipt: input.receipt, p_pin: input.pin, p_schedule: input.schedule,
      p_month: input.month, p_line: input.line, p_amount: input.amount, p_reason: reason };
  } else if (action === "reverse") {
    const parsed = recoveryInputs.reverse.safeParse(fields);
    if (!parsed.success) return invalid;
    const input = parsed.data;
    rpc = "t13_recovery_reverse";
    params = { p_operation: nonce, p_allocation: input.allocation, p_amount: input.amount, p_reason: reason };
  } else {
    const parsed = recoveryInputs[action].safeParse(fields);
    if (!parsed.success) return invalid;
    rpc = "t13_recovery_command";
    params = { p_operation: nonce, p_target: target, p_action: action, p_data: { ...parsed.data, reason, basis } };
  }
  let dispatched = false;
  try {
    if (!canUseApplication(await getAuthContext())) return { ok: false, uncertain: false, error: "Sign in again to continue." };
    const client = await createClient();
    dispatched = true;
    const { data, error } = await client.rpc(rpc, params);
    if (error) {
      if (["PT409", "42501", "22023", "55000", "P0409"].includes(error.code)) return { ok: false, uncertain: false, error: error.message };
      if (["23505", "23514", "23P01", "22007", "22008", "22P02"].includes(error.code)) {
        return { ok: false, uncertain: false, error: "Check the dates, evidence and references for a conflict or an existing record." };
      }
      logger.warn("Recovery save could not be confirmed", { rpc, action, code: error.code });
      return { ok: false, uncertain: true, error: "The save could not be confirmed. Retry with the same details." };
    }
    const shape = action === "allocate" ? allocationReceipt : action === "reverse" ? reversalReceipt : commandReceipt;
    const result = shape.safeParse(data);
    const receipt = result.data;
    if (!receipt ||
      ("target" in receipt && (receipt.target !== target || receipt.action !== action)) ||
      ("unallocated" in receipt && (receipt.pin_id !== params.p_pin || receipt.receipt_id !== params.p_receipt || receipt.amount !== Number(params.p_amount))) ||
      ("reverses_allocation_id" in receipt && (receipt.reverses_allocation_id !== params.p_allocation || receipt.amount !== Number(params.p_amount)))) {
      return { ok: false, uncertain: true, error: "The save could not be confirmed. Retry with the same details." };
    }
    return { ok: true, receipt, ...refreshOperationsPaths({ kind: "recovery" }) };
  } catch {
    return { ok: false, uncertain: dispatched, error: dispatched ? "The save could not be confirmed. Retry with the same details." : "The save could not start. Try again." };
  }
}

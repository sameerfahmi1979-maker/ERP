"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { payrollApprovalsPath } from "@/lib/hr/payroll/approval-contract";
import {
  payrollEvidenceOptions, payrollEvidenceQuery, payrollSettlementPath, payrollSettlementQuery, payrollSettlementReceipt,
  payrollSettlementRequest, payrollSettlementScopes, payrollSettlementWorkspace, type PayrollSettlementAction,
  type PayrollSettlementCommandResult,
} from "@/lib/hr/payroll/settlement-contract";
import { logger } from "@/lib/logger";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";

const unconfirmed: PayrollSettlementCommandResult = {
  ok: false, error: "The outcome could not be confirmed. Retry the same request.", uncertain: true,
};

async function read<T>(rpc: string, parameters: Record<string, unknown>, schema: z.ZodType<T>) {
  try {
    if (!canUseApplication(await getAuthContext())) return null;
    const { data, error } = await (await createClient()).rpc(rpc, parameters);
    if (error) {
      logger.warn("Payroll settlement read failed", { rpc, code: error.code });
      return null;
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      logger.warn("Payroll settlement response could not be read", { rpc });
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export async function listPayrollSettlementScopes() {
  return read("t16_payroll_scopes", {}, payrollSettlementScopes);
}

export async function readPayrollSettlement(input: unknown) {
  const parsed = payrollSettlementQuery.safeParse(input);
  if (!parsed.success) return null;
  const { company, branch, month, after, review } = parsed.data;
  return read("t16_payroll_workspace", {
    p_company: company, p_branch: branch, p_month: month,
    ...(after !== undefined && { p_after: after }),
    ...(review !== undefined && { p_selected_review: review }),
  }, payrollSettlementWorkspace);
}

export async function listPayrollEvidenceOptions(input: unknown) {
  const parsed = payrollEvidenceQuery.safeParse(input);
  if (!parsed.success) return null;
  const { company, branch, search } = parsed.data;
  return read("t16_payroll_evidence_options", { p_company: company, p_branch: branch, p_search: search }, payrollEvidenceOptions);
}

function commandError(code: string, action: PayrollSettlementAction): PayrollSettlementCommandResult | null {
  if (code === "42501") return {
    ok: false, error: "You need settlement access for this employer and branch.", uncertain: false,
  };
  if (code === "40001" || code === "55P03" || code === "40P01") return {
    ok: false, error: "Another payroll change is in progress. Retry the same request.", uncertain: true,
  };
  if (["PT409", "P0409", "23505", "23P01", "55000"].includes(code)) return {
    ok: false,
    error: action === "issue"
      ? "Review the current payroll approval, establishment format and employee WPS readiness before preparing files."
      : "Check the current payroll status, evidence and amounts. Reload if the payroll has changed.",
    uncertain: false,
  };
  if (["22023", "22007", "22008", "22P02", "23514"].includes(code)) return {
    ok: false, error: "Check the required details, evidence and exact amounts.", uncertain: false,
  };
  return null;
}

export async function savePayrollSettlementCommand(input: unknown): Promise<PayrollSettlementCommandResult> {
  const parsed = payrollSettlementRequest.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the required details and exact amounts.", uncertain: false };
  const { action, company, branch, operation, data } = parsed.data;
  const paymentAction = action === "receipt" || action === "allocate" || action === "reverse";
  try {
    if (!canUseApplication(await getAuthContext())) return {
      ok: false, error: "Sign in again to continue.", uncertain: false,
    };
    const { data: raw, error } = await (await createClient()).rpc(
      paymentAction ? "t16_payroll_payment_command" : "t16_wps_issue_command",
      { p_operation: operation, p_company: company, p_branch: branch, p_action: action, p_data: data },
    );
    if (error) {
      const known = commandError(error.code, action);
      if (known) return known;
      logger.warn("Payroll settlement operation could not be confirmed", { action, code: error.code });
      return unconfirmed;
    }
    const receipt = payrollSettlementReceipt.safeParse(raw);
    if (!receipt.success || ("batch" in data && receipt.data.batch !== data.batch) ||
        (paymentAction && !receipt.data.payment) || ("payment" in data && receipt.data.payment !== data.payment)) {
      logger.warn("Payroll settlement receipt could not be confirmed", { action });
      return unconfirmed;
    }
    revalidatePath(payrollSettlementPath);
    revalidatePath(payrollApprovalsPath);
    return { ok: true };
  } catch {
    return unconfirmed;
  }
}

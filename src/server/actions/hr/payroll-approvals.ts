"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import {
  payrollApprovalsPath, payrollReviewCommandHeader, payrollReviewQuery, payrollReviewReceipt, payrollReviewScopes,
  payrollReviewWorkspace, parsePayrollReviewCommand, type PayrollReviewQuery,
} from "@/lib/hr/payroll/approval-contract";
import { payrollRunsPath } from "@/lib/hr/payroll/run-contract";
import { logger } from "@/lib/logger";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";

type Failure = { ok: false; error: string; uncertain: boolean };
type CommandResult = { ok: true } & z.infer<typeof payrollReviewReceipt> | Failure;
const uncertain: Failure = {
  ok: false, error: "The decision could not be confirmed. Retry with the same details.", uncertain: true,
};

async function read<T>(rpc: string, parameters: Record<string, unknown>, schema: z.ZodType<T>) {
  try {
    if (!canUseApplication(await getAuthContext())) return null;
    // The read RPCs recheck the session and acquire payroll scope locks.
    const { data, error } = await (await createClient()).rpc(rpc, parameters);
    if (error) {
      logger.warn("Payroll approval read failed", { rpc, code: error.code });
      return null;
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      logger.warn("Payroll approval response could not be read", { rpc });
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export async function listPayrollReviewScopes() {
  return read("t15_payroll_review_scopes", {}, payrollReviewScopes);
}

export async function readPayrollReview(input: PayrollReviewQuery) {
  const parsed = payrollReviewQuery.safeParse(input);
  if (!parsed.success) return null;
  const { company, branch, month, review, employee, before } = parsed.data;
  return read("t15_payroll_review_workspace", {
    p_company: company, p_branch: branch, p_month: month,
    ...(review !== undefined && { p_review: review }),
    ...(employee !== undefined && { p_employee: employee }),
    ...(before !== undefined && { p_before: before }),
  }, payrollReviewWorkspace);
}

function commandFailure(code: string): Failure | null {
  if (code === "42501") return {
    ok: false, error: "This decision requires an authorized reviewer for the selected employer and branch.", uncertain: false,
  };
  if (["PT409", "P0409", "23505", "23P01", "55000"].includes(code)) return {
    ok: false, error: "The payroll version or a related decision changed. Reload the workspace and review the current status.", uncertain: false,
  };
  if (["22023", "22007", "22008", "22P02", "23514"].includes(code)) return {
    ok: false, error: "Check the exact version, required reason and any exception acknowledgment.", uncertain: false,
  };
  return null;
}

export async function savePayrollReviewCommand(
  action: string,
  company: number,
  branch: number,
  operation: string,
  form: FormData,
): Promise<CommandResult> {
  const header = payrollReviewCommandHeader.safeParse({ company, branch, operation });
  const fields = form instanceof FormData ? parsePayrollReviewCommand(action, form) : null;
  if (!header.success || !fields) return {
    ok: false, error: "Check the version and enter the required reason.", uncertain: false,
  };
  try {
    if (!canUseApplication(await getAuthContext())) return {
      ok: false, error: "Sign in again to continue.", uncertain: false,
    };
    const { data, error } = await (await createClient()).rpc("t15_payroll_review_command", {
      p_operation: operation, p_company: company, p_branch: branch, p_action: action, p_data: fields,
    });
    if (error) {
      const failure = commandFailure(error.code);
      if (failure) return failure;
      logger.warn("Payroll approval could not be confirmed", { action, code: error.code });
      return uncertain;
    }
    const receipt = payrollReviewReceipt.safeParse(data);
    if (!receipt.success || ("review" in fields && receipt.data.review !== fields.review)) {
      logger.warn("Payroll approval receipt could not be read", { action });
      return uncertain;
    }
    revalidatePath(payrollApprovalsPath);
    revalidatePath(payrollRunsPath);
    return { ok: true, ...receipt.data };
  } catch {
    return uncertain;
  }
}

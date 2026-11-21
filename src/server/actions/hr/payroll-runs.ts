"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import {
  parsePayrollCommand, payrollCommandHeader, payrollQuery, payrollRunsPath, payrollScopes, payrollWorkspace,
  type PayrollAction, type PayrollQuery,
} from "@/lib/hr/payroll/run-contract";
import { logger } from "@/lib/logger";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";

type CommandResult = { ok: true } | { ok: false; error: string; uncertain: boolean };

async function read<T>(rpc: string, params: Record<string, unknown>, shape: z.ZodType<T>) {
  try {
    if (!canUseApplication(await getAuthContext())) return null;
    // These protected reads acquire scope locks and use a transaction with POST.
    const { data, error } = await (await createClient()).rpc(rpc, params);
    if (error) {
      logger.warn("Payroll run read failed", { rpc, code: error.code });
      return null;
    }
    const parsed = shape.safeParse(data);
    if (!parsed.success) {
      logger.warn("Payroll run response could not be read", { rpc });
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export async function listPayrollRunScopes() {
  return read("t14_payroll_scopes", {}, payrollScopes);
}

export async function readPayrollRun(input: PayrollQuery) {
  const parsed = payrollQuery.safeParse(input);
  if (!parsed.success) return null;
  const { company, branch, month, version, employee, before } = parsed.data;
  return read("t14_payroll_workspace", {
    p_company: company, p_branch: branch, p_month: month,
    ...(version !== undefined && { p_version: version }),
    ...(employee !== undefined && { p_employee: employee }),
    ...(before !== undefined && { p_before: before }),
  }, payrollWorkspace);
}

const uncertain: CommandResult = {
  ok: false, error: "The save could not be confirmed. Try again with the same details.", uncertain: true,
};

function commandFailure(code: string, action: PayrollAction): CommandResult | null {
  if (code === "42501") return {
    ok: false, uncertain: false,
    error: ["approve-rule", "verify-adjustment", "reject-adjustment"].includes(action)
      ? "An independent reviewer with permission in the selected employer and branch must record this decision."
      : "This action needs permission in the selected employer and branch.",
  };
  if (["PT409", "P0409", "23505", "23P01", "55000"].includes(code)) return {
    ok: false, error: "The draft, decision or effective dates conflict with a saved record. Reload and review the current data.", uncertain: false,
  };
  if (["22023", "22007", "22008", "22P02", "23514"].includes(code)) return {
    ok: false, error: "Check the dates, amounts and source evidence before continuing.", uncertain: false,
  };
  return null;
}

export async function savePayrollCommand(
  action: PayrollAction,
  company: number,
  branch: number,
  operation: string,
  form: FormData,
): Promise<CommandResult> {
  const header = payrollCommandHeader.safeParse({ company, branch, operation });
  const fields = form instanceof FormData ? parsePayrollCommand(action, form) : null;
  if (!header.success || !fields) return {
    ok: false, error: "Check the required details, dates and source evidence.", uncertain: false,
  };
  try {
    if (!canUseApplication(await getAuthContext())) return {
      ok: false, error: "Sign in again to continue.", uncertain: false,
    };
    const { error } = await (await createClient()).rpc("t14_payroll_command", {
      p_operation: operation, p_company: company, p_branch: branch, p_action: action, p_data: fields,
    });
    if (error) {
      const failure = commandFailure(error.code, action);
      if (failure) return failure;
      logger.warn("Payroll command could not be confirmed", { action, code: error.code });
      return uncertain;
    }
    revalidatePath(payrollRunsPath);
    return { ok: true };
  } catch {
    return uncertain;
  }
}

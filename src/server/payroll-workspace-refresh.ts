import { revalidatePath } from "next/cache";
import { payrollApprovalsPath } from "@/lib/hr/payroll/approval-contract";
import { payrollRunsPath } from "@/lib/hr/payroll/run-contract";
import { payrollSettlementPath } from "@/lib/hr/payroll/settlement-contract";
import { exitPath } from "@/features/hr/exit-settlement/exit-settlement-contract";
import { logger } from "@/lib/logger";

const paths = {
  runs: [payrollRunsPath],
  approvals: [payrollApprovalsPath, payrollRunsPath],
  settlement: [payrollSettlementPath, payrollApprovalsPath],
  payslips: ["/admin/hr/payroll/payslips"],
  exit: [exitPath, "/admin/hr/actions/eos"],
};

export type PayrollRefreshTarget = keyof typeof paths;

export function isPayrollRefreshTarget(value: unknown): value is PayrollRefreshTarget {
  return typeof value === "string" && Object.hasOwn(paths, value);
}

export function invalidatePayrollWorkspace(target: PayrollRefreshTarget): { refreshRequired?: true } {
  let refreshRequired = false;
  for (const path of paths[target]) {
    try {
      revalidatePath(path);
    } catch {
      refreshRequired = true;
      logger.warn("Payroll workspace refresh failed", { path });
    }
  }
  return refreshRequired ? { refreshRequired: true } : {};
}

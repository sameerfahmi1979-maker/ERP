"use server";

import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { invalidatePayrollWorkspace, isPayrollRefreshTarget } from "@/server/payroll-workspace-refresh";

export async function refreshPayrollWorkspace(target: unknown): Promise<boolean> {
  if (!isPayrollRefreshTarget(target) || !canUseApplication(await getAuthContext())) return false;
  return !invalidatePayrollWorkspace(target).refreshRequired;
}

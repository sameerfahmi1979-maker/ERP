import type { AuthContext } from "@/lib/rbac/check";
import { canUseApplication } from "@/lib/rbac/scope";
import type { WorkQueueScope } from "./work-queue-contract";

export const operationsOverviewRoutes = {
  "/modules/fleet": { area: "fleet", title: "Fleet management", totalLabel: "Registered assets", pendingLabel: "Active assets", companyOnly: false },
  "/modules/fleet/operations": { area: "dispatch", title: "Dispatch, trips and rentals", totalLabel: "Operation orders", pendingLabel: "Open orders", companyOnly: false },
  "/modules/fleet/fines": { area: "fines", title: "Fines and incidents", totalLabel: "Recorded cases", pendingLabel: null, companyOnly: false },
  "/modules/fleet/allowances": { area: "allowances", title: "Trip allowances and delivery proof", totalLabel: "Allowance evidence versions", pendingLabel: null, companyOnly: false },
  "/modules/fleet/allowance-rates": { area: "allowance-rates", title: "Trip allowance rates", totalLabel: "Rate versions", pendingLabel: "Versions awaiting approval", companyOnly: true },
  "/modules/fleet/fuel": { area: "fuel", title: "Manual fuel vouchers", totalLabel: "Vouchers", pendingLabel: "Awaiting verification", companyOnly: false },
  "/modules/workshop": { area: "workshop", title: "Workshop", totalLabel: "Assessments", pendingLabel: "Awaiting assessment", companyOnly: false },
  "/modules/workshop/job-work": { area: "job-work", title: "Workshop job work", totalLabel: "Job card cycles", pendingLabel: "Open job card cycles", companyOnly: false },
  "/modules/inventory": { area: "inventory", title: "Inventory", totalLabel: "Stock layers", pendingLabel: "Pending stock reviews", companyOnly: false },
  "/modules/procurement": { area: "procurement", title: "Procurement", totalLabel: "Purchase lines", pendingLabel: "Awaiting purchase approval", companyOnly: false },
  "/admin/hr/operations/workshop-labour": { area: "workshop-time", title: "Workshop time review", totalLabel: "Signed labour versions", pendingLabel: null, companyOnly: false },
  "/admin/hr/operations/workshop-referrals": { area: "workshop-referrals", title: "Workshop referrals", totalLabel: "Recorded referrals", pendingLabel: null, companyOnly: false },
} as const;

export type OperationsOverviewRoute = keyof typeof operationsOverviewRoutes;
export type OperationsOverviewArea = typeof operationsOverviewRoutes[OperationsOverviewRoute]["area"];

export function operationsOverviewAdmission(
  actor: AuthContext,
  canOperate: boolean,
  requestedScope: string | string[] | undefined,
): "operation" | "overview" | "denied" {
  if (!canUseApplication(actor)) return "denied";
  const administrator = actor.roleAssignments?.some(assignment =>
    assignment.roleCode === "system_admin" && assignment.ownerCompanyId === null && assignment.branchId === null);
  if (administrator) {
    const hasOperatingAssignment = actor.roleAssignments?.some(assignment =>
      assignment.ownerCompanyId !== null &&
      !["system_admin", "group_admin", "company_admin", "branch_admin"].includes(assignment.roleCode));
    if (!canOperate || !hasOperatingAssignment || requestedScope !== undefined) return "overview";
  }
  return canOperate ? "operation" : "denied";
}

export function operationsOverviewScopeValue(scope: WorkQueueScope): string {
  return `${scope.company}.${scope.branch ?? 0}`;
}

export function operationsOverviewScope(
  scopes: WorkQueueScope[],
  requested: string | string[] | undefined,
  companyOnly: boolean,
): WorkQueueScope | undefined {
  if (typeof requested !== "string") return undefined;
  return scopes.find(scope =>
    (scope.branch === null) === companyOnly && operationsOverviewScopeValue(scope) === requested);
}


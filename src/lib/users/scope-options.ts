import type { OwnerCompany, Branch } from "@/types/domain";
import type { AuthContext } from "@/lib/rbac/check";
import { canUseApplication, isGlobalAdmin } from "@/lib/rbac/scope";

export type UserCompanyOption = Pick<OwnerCompany, "id" | "legal_name_en" | "company_code">;
export type UserBranchOption = Pick<Branch, "id" | "owner_company_id" | "branch_name_en" | "branch_code">;

const capabilities = new Set(["users.view", "users.create", "users.update", "users.roles.assign"]);
// Only minimal option labels. This never authorizes a profile change or role grant.
export function userScopeOptionFilter(ctx: AuthContext) {
  if (!canUseApplication(ctx)) return { global: false, companyIds: [], branchCompanies: [], branchIds: [] };
  const assignments = ctx.roleAssignments?.filter(a => a.permissionCodes.some(c => capabilities.has(c))) ?? [];
  const validId = (n: number | null): n is number => n !== null && Number.isSafeInteger(n) && n > 0;
  return {
    global: isGlobalAdmin(ctx) || assignments.some(a => a.ownerCompanyId === null && a.branchId === null),
    companyIds: [...new Set(assignments.map(a => a.ownerCompanyId).filter(validId))],
    branchCompanies: [...new Set(assignments.filter(a => a.branchId === null).map(a => a.ownerCompanyId).filter(validId))],
    branchIds: [...new Set(assignments.filter(a => validId(a.ownerCompanyId)).map(a => a.branchId).filter(validId))],
  };
}

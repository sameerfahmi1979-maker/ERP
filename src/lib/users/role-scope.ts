export type RoleScopeKind = "global" | "company" | "branch";

export function resolveRoleScope(
  ownerCompanyId: number | null | undefined,
  branchId: number | null | undefined,
): RoleScopeKind {
  if (branchId) return "branch";
  if (ownerCompanyId) return "company";
  return "global";
}

export function formatRoleScopeLabel(
  scope: RoleScopeKind,
  companyName?: string | null,
  branchName?: string | null,
): string {
  if (scope === "branch") return branchName ? `Branch: ${branchName}` : "Branch";
  if (scope === "company") return companyName ? `Company: ${companyName}` : "Company";
  return "Global";
}

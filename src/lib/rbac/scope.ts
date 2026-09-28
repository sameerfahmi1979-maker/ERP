import type { AuthContext } from "./check";

// Pure display helpers. Server actions and database policies remain authoritative.
export function canUseApplication(ctx: AuthContext): boolean {
  return ctx.isAccountActive && !!ctx.profile && ctx.profile.must_change_password !== true;
}
export function isGlobalAdmin(ctx: AuthContext): boolean {
  return canUseApplication(ctx) && !!ctx.roleAssignments?.some(a => a.ownerCompanyId === null && a.branchId === null && ["system_admin", "group_admin"].includes(a.roleCode));
}
export function hasRole(ctx: AuthContext, code: string): boolean {
  if (["system_admin", "group_admin"].includes(code)) return isGlobalAdmin(ctx) && ctx.roleCodes.includes(code);
  return canUseApplication(ctx) && ctx.roleCodes.includes(code);
}
export function hasPermission(ctx: AuthContext, code: string): boolean {
  return canUseApplication(ctx) && (ctx.permissionCodes.includes(code) || isGlobalAdmin(ctx));
}
export function hasGlobalPermission(ctx: AuthContext, code: string): boolean {
  return canUseApplication(ctx) && (isGlobalAdmin(ctx) || !!ctx.globalPermissionCodes?.includes(code));
}
export function hasPermissionInScope(ctx: AuthContext, code: string, companyId: number, branchId: number | null = null): boolean {
  if (!canUseApplication(ctx) || !Number.isSafeInteger(companyId) || companyId <= 0) return false;
  return isGlobalAdmin(ctx) || !!ctx.roleAssignments?.some(a => a.permissionCodes.includes(code) &&
    ((a.ownerCompanyId === null && a.branchId === null) ||
      (a.ownerCompanyId === companyId && (a.branchId === null || (branchId !== null && a.branchId === branchId)))));
}

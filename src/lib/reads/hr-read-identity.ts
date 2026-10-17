import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
/** Coarse route admission only; never substitutes for native subject authority. */
export function hasHrReadCapability(ctx:AuthContext,code:string):boolean {
  return [code,`${code}.self`,`${code}.team`].some(permission=>hasPermission(ctx,permission));
}
/** Memory-cache partition only. Live server authorization remains authoritative. */
export function hrReadIdentity(ctx: AuthContext): string {
  const assignments = (ctx.roleAssignments ?? []).map(a => ({
    roleId: a.roleId, roleCode: a.roleCode, ownerCompanyId: a.ownerCompanyId,
    branchId: a.branchId, permissionCodes: [...a.permissionCodes].sort(),
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify([ctx.profile?.id ?? null, ctx.profile?.auth_user_id ?? null,
    ctx.accountStatus, ctx.isAccountActive, ctx.profile?.must_change_password === true,
    ctx.profile?.owner_company_id ?? null, ctx.profile?.branch_id ?? null,
    ctx.profile?.updated_at ?? null, [...ctx.roleCodes].sort(),
    [...ctx.permissionCodes].sort(), [...(ctx.globalPermissionCodes ?? [])].sort(), assignments]);
}

import "server-only";
import { createHash } from "node:crypto";
import type { AuthContext } from "@/lib/rbac/check";
/** Opaque UX cache generation, NEVER an access grant or cached authorization. */
export function readScopeVersion(ctx:AuthContext):string {
  const roles=(ctx.roleAssignments??[]).map(a=>({...a,permissionCodes:[...a.permissionCodes].sort()})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash("sha256").update(JSON.stringify([ctx.profile?.auth_user_id,ctx.accountStatus,ctx.isAccountActive,ctx.profile?.must_change_password,ctx.profile?.owner_company_id,ctx.profile?.branch_id,ctx.profile?.updated_at,roles,[...ctx.permissionCodes].sort(),[...(ctx.globalPermissionCodes??[])].sort(),[...ctx.roleCodes].sort()])).digest("hex");
}

import type {AuthContext} from '@/lib/rbac/check';
import {hasGlobalPermission,hasPermission,hasPermissionInScope} from '@/lib/rbac/scope';
const manageCodes=['common_md.manage','common_md.departments.manage'];
export function canOpenDepartmentEditor(ctx:AuthContext){return manageCodes.some(code=>hasPermission(ctx,code));}
export function canManageDepartment(ctx:AuthContext,companyId:number,branchId:number|null){
 return manageCodes.some(code=>hasPermissionInScope(ctx,code,companyId,branchId));
}
// A branch-only manager must be able to choose its company before choosing the
// permitted branch. This is not authority to save company-wide ownership.
export function canChooseDepartmentCompany(ctx:AuthContext,companyId:number){
 return canOpenDepartmentEditor(ctx)&&manageCodes.some(code=>hasGlobalPermission(ctx,code)||ctx.roleAssignments?.some(a=>a.ownerCompanyId===companyId&&a.permissionCodes.includes(code)));
}

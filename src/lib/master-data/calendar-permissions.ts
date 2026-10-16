import type {AuthContext} from '@/lib/rbac/check';
import {hasGlobalPermission,hasPermissionInScope} from '@/lib/rbac/scope';
const manageCodes=['common_md.manage','common_md.work_calendars.manage'];
/** Editor admission needs at least one company-wide destination, not an any-scope capability. */
export function canOpenCalendarEditor(ctx:AuthContext){
 return canManageCalendar(ctx,null)||!!ctx.roleAssignments?.some(assignment=>
  assignment.ownerCompanyId!==null&&assignment.branchId===null&&canManageCalendar(ctx,assignment.ownerCompanyId));
}
/** Company-wide calendars cannot be managed by a branch-only assignment. */
export function canManageCalendar(ctx:AuthContext,companyId:number|null){
 return manageCodes.some(code=>companyId===null?hasGlobalPermission(ctx,code):hasPermissionInScope(ctx,code,companyId));
}

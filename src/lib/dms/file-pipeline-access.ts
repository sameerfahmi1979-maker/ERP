import type { AuthContext } from '@/lib/rbac/check';
import { canUseApplication } from '@/lib/rbac/scope';
import { assignmentScopeError } from '@/lib/rbac/administrator-policy';

const roles = new Set(['system_admin', 'group_admin', 'company_admin', 'branch_admin', 'dms_admin', 'dms_manager']);
const capabilities = ['dms.documents.ai.run', 'dms.documents.review_ai', 'dms.admin'];
/** Display gate only. The database rechecks the actual document and current authority. */
export function canRunDmsFilePipeline(ctx: AuthContext, companyId?: number | null, branchId: number | null = null): boolean {
  return canUseApplication(ctx) && !!ctx.roleAssignments?.some(a => {
    if (!roles.has(a.roleCode) || assignmentScopeError(a.roleCode, a.ownerCompanyId, a.branchId)) return false;
    if (['system_admin', 'group_admin'].includes(a.roleCode)) return true;
    // Role and capability must come from the SAME assignment; never mix companies/roles.
    if (!capabilities.some(code => a.permissionCodes.includes(code))) return false;
    if (companyId === undefined) return true;
    return companyId !== null && ((a.ownerCompanyId === null && a.branchId === null) ||
      (a.ownerCompanyId === companyId && (a.branchId === null || a.branchId === branchId)));
  });
}

import type { AuthContext } from "@/lib/rbac/check";
import { hasGlobalPermission, hasPermissionInScope, isGlobalAdmin } from "@/lib/rbac/scope";

export type ApprovalNotificationSubject = { owning_company_id: number | null; owning_branch_id: number | null; confidentiality_level: string };
/** Notification admission only. The destination still performs full F03 document/linked-subject checks. */
export function eligibleApprovalRecipient(ctx: AuthContext, doc: ApprovalNotificationSubject, requiredRole: string | null, needsAction: boolean): boolean {
  const permitted = (code: string) => doc.owning_company_id === null ? hasGlobalPermission(ctx, code) : hasPermissionInScope(ctx, code, doc.owning_company_id, doc.owning_branch_id);
  if (isGlobalAdmin(ctx)) return true;
  if (!['internal','company','hr','finance','legal','executive'].includes(doc.confidentiality_level)) return false;
  if (!permitted('dms.documents.view') && !permitted('dms.admin')) return false;
  if (!['internal','company'].includes(doc.confidentiality_level) && !permitted('dms.documents.view.'+doc.confidentiality_level)) return false;
  if (!needsAction) return true;
  if (permitted('dms.admin') || permitted('dms.approvals.admin')) return true;
  if (!permitted('dms.approvals.act') && !permitted('dms.documents.approve')) return false;
  return !requiredRole || !!ctx.roleAssignments?.some(a=>a.roleCode===requiredRole && (
    (a.ownerCompanyId===null && a.branchId===null) || (a.ownerCompanyId===doc.owning_company_id && (a.branchId===null || a.branchId===doc.owning_branch_id))));
}

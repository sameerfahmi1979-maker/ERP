import type {AuthContext} from '@/lib/rbac/check';
import {isGlobalAdmin} from '@/lib/rbac/scope';

/** Query-planning superset only. Never authorization: ordinary RLS still decides
 * every row. Linked documents are always retained because their current access
 * can differ from the upload's immutable original company/branch. */
export function inboxCandidateFilter(ctx:AuthContext):string|null {
 if(!ctx.profile||!Number.isSafeInteger(ctx.profile.id)||ctx.profile.id<=0||!Array.isArray(ctx.roleAssignments)||isGlobalAdmin(ctx))return null;
 const clauses=new Set([`uploaded_by.eq.${ctx.profile.id}`,'document_id.not.is.null']);
 for(const assignment of ctx.roleAssignments){
  if(!Array.isArray(assignment.permissionCodes))return null;
  if(!assignment.permissionCodes.some(p=>p==='dms.documents.review_ai'||p==='dms.admin'))continue;
  const c=assignment.ownerCompanyId,b=assignment.branchId;
  if(c===null&&b===null)return null;
  if(c===null||!Number.isSafeInteger(c)||c<=0||(b!==null&&(!Number.isSafeInteger(b)||b<=0)))return null;
  clauses.add(b===null?`owning_company_id.eq.${c}`:`and(owning_company_id.eq.${c},owning_branch_id.eq.${b})`);
 }
 // Fall back to ordinary RLS rather than truncate an unusually large scope.
 return clauses.size>32?null:[...clauses].join(',');
}

import type {AuthContext} from '@/lib/rbac/check';
import type {ReportDataResult} from './types';
export function collectedCompanyIds(data: ReportDataResult): number[] {
 const meta=data.meta?.ownerCompanyIds;
 const ids=[...(Array.isArray(meta)?meta:[]),...data.rows.map(row=>row.owner_company_id).filter(v=>v!==undefined&&v!==null&&v!==0)];
 if(ids.some(v=>!Number.isSafeInteger(v)||Number(v)<=0))throw Error('The report company identity could not be verified. No output was produced.');
 return [...new Set(ids as number[])].sort((a,b)=>a-b);
}
export function reportAuthorityIdentity(ctx:AuthContext):string{
 return JSON.stringify([ctx.profile?.id,ctx.isAccountActive,ctx.profile?.owner_company_id,ctx.profile?.branch_id,
  [...ctx.permissionCodes].sort(),[...(ctx.roleAssignments??[])].map(a=>[a.roleCode,a.ownerCompanyId,a.branchId,[...a.permissionCodes].sort()]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
}

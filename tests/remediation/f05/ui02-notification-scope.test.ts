import { expect, it } from 'vitest';
import { eligibleApprovalRecipient } from '@/lib/dms/approval-notification-recipient';
import type { AuthContext } from '@/lib/rbac/check';
const doc={owning_company_id:1,owning_branch_id:2,confidentiality_level:'internal'};
function actor(company=1,branch:number|null=2):AuthContext {
  return {profile:{id:1,must_change_password:false} as AuthContext['profile'],email:null,accountStatus:'active',isAccountActive:true,
    roleCodes:['reviewer'],permissionCodes:['dms.documents.view','dms.approvals.act'],globalPermissionCodes:[],
    roleAssignments:[{roleId:1,roleCode:'reviewer',ownerCompanyId:company,branchId:branch,permissionCodes:['dms.documents.view','dms.approvals.act']}]};
}
it('notifies an active scoped required-role reviewer',()=>expect(eligibleApprovalRecipient(actor(),doc,'reviewer',true)).toBe(true));
it.each([[2,2],[1,3]])('does not notify a different company/branch (%s/%s)',(c,b)=>expect(eligibleApprovalRecipient(actor(c,b),doc,'reviewer',true)).toBe(false));
it('does not borrow a required role from a different assignment scope',()=>{const ctx=actor();ctx.roleAssignments!.push({roleId:2,roleCode:'final',ownerCompanyId:2,branchId:null,permissionCodes:[]});expect(eligibleApprovalRecipient(ctx,doc,'final',true)).toBe(false);});
it('inactive and password-setup accounts receive no business notifications',()=>{expect(eligibleApprovalRecipient({...actor(),isAccountActive:false},doc,null,false)).toBe(false);const ctx=actor();ctx.profile!.must_change_password=true;expect(eligibleApprovalRecipient(ctx,doc,null,false)).toBe(false);});
it('confidentiality and global-document boundaries fail closed',()=>{expect(eligibleApprovalRecipient(actor(),{...doc,confidentiality_level:'hr'},null,false)).toBe(false);expect(eligibleApprovalRecipient(actor(),{...doc,owning_company_id:null},null,false)).toBe(false);});
it('a view-only participant receives updates but not review requests',()=>{const ctx=actor();ctx.roleAssignments![0].permissionCodes=['dms.documents.view'];expect(eligibleApprovalRecipient(ctx,doc,null,false)).toBe(true);expect(eligibleApprovalRecipient(ctx,doc,null,true)).toBe(false);});

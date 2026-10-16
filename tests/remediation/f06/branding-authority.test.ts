import {expect,it} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
import {canAccessBrandingAssetUrl,canManageAppBranding} from '@/lib/branding/asset-permissions';
const assignment=(company:number|null,branch:number|null,codes:string[])=>({roleCode:'synthetic_branding',ownerCompanyId:company,branchId:branch,permissionCodes:codes});
const ctx=(assignments:ReturnType<typeof assignment>[])=>({isAccountActive:true,profile:{id:1,must_change_password:false},permissionCodes:[...new Set(assignments.flatMap(a=>a.permissionCodes))],globalPermissionCodes:assignments.filter(a=>a.ownerCompanyId===null&&a.branchId===null).flatMap(a=>a.permissionCodes),roleCodes:['synthetic_branding'],roleAssignments:assignments}) as unknown as AuthContext;
const asset=(company:number|null,type:'report_logo'|'stamp'|'signature'='report_logo')=>({asset_scope:'report' as const,asset_type:type,owner_company_id:company});
it('company A report authority cannot sign an asset belonging to company B',()=>{
 const actor=ctx([assignment(1,null,['reports.view','reports.sign'])]);expect(canAccessBrandingAssetUrl(actor,asset(2,'signature'))).toBe(false);
});
it('company A may preview its own non-sensitive branding',()=>{
 expect(canAccessBrandingAssetUrl(ctx([assignment(1,null,['reports.view'])]),asset(1))).toBe(true);
});
it('combined roles cannot borrow another company signing grant',()=>{
 expect(canAccessBrandingAssetUrl(ctx([assignment(1,null,['reports.view']),assignment(2,null,['reports.sign'])]),asset(1,'stamp'))).toBe(false);
});
it('branch-only authority is not company-wide branding authority',()=>{
 expect(canAccessBrandingAssetUrl(ctx([assignment(1,1,['reports.view','reports.sign'])]),asset(1,'signature'))).toBe(false);
});
it('company authority cannot manage ERP-wide application branding',()=>{
 expect(canManageAppBranding(ctx([assignment(1,null,['branding.app.manage'])]))).toBe(false);
});
it('global report signing may preview company stamps with report visibility',()=>{
 expect(canAccessBrandingAssetUrl(ctx([assignment(null,null,['reports.view','reports.sign'])]),asset(2,'stamp'))).toBe(true);
});
it('report management does not itself grant signature access',()=>{
 expect(canAccessBrandingAssetUrl(ctx([assignment(1,null,['reports.manage'])]),asset(1,'signature'))).toBe(false);
});
it('unowned group branding needs global authority, not a random company grant',()=>{
 expect(canAccessBrandingAssetUrl(ctx([assignment(1,null,['reports.view'])]),asset(null))).toBe(false);
});
it('inactive principals and unresolved password setup remain denied',()=>{
 const actor=ctx([assignment(null,null,['reports.view','reports.sign'])]);actor.isAccountActive=false;expect(canAccessBrandingAssetUrl(actor,asset(1))).toBe(false);
 actor.isAccountActive=true;actor.profile!.must_change_password=true;expect(canAccessBrandingAssetUrl(actor,asset(1))).toBe(false);
});

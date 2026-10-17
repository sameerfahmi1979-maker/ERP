import {expect,it} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
import {canManageCalendar,canOpenCalendarEditor} from '@/lib/master-data/calendar-permissions';
const code='common_md.work_calendars.manage';
const actor=(company:number|null,branch:number|null=null)=>({profile:{id:1},isAccountActive:true,permissionCodes:[code],globalPermissionCodes:company===null?[code]:[],roleCodes:[],roleAssignments:[{roleCode:'synthetic_manager',ownerCompanyId:company,branchId:branch,permissionCodes:[code]}]} as unknown as AuthContext);
it('company manager sees editor but cannot change global or another company calendars',()=>{
 const ctx=actor(1);expect(canOpenCalendarEditor(ctx)).toBe(true);expect(canManageCalendar(ctx,1)).toBe(true);expect(canManageCalendar(ctx,2)).toBe(false);expect(canManageCalendar(ctx,null)).toBe(false);
});
it('branch-only management cannot open an editor or widen to a company-wide calendar',()=>{expect(canOpenCalendarEditor(actor(1,10))).toBe(false);expect(canManageCalendar(actor(1,10),1)).toBe(false);});
it('global catalogue manager covers global and company calendars',()=>{expect(canManageCalendar(actor(null),null)).toBe(true);expect(canManageCalendar(actor(null),2)).toBe(true);});
it('inactive or no-capability account cannot edit',()=>{
 expect(canOpenCalendarEditor({...actor(null),isAccountActive:false})).toBe(false);
 expect(canManageCalendar({...actor(null),isAccountActive:false},1)).toBe(false);
 expect(canOpenCalendarEditor({...actor(null),permissionCodes:[],globalPermissionCodes:[],roleAssignments:[]})).toBe(false);
});
it.each(['common_md.manage',code])('%s must belong to a company-wide assignment, not a separate reader role',permission=>{
 const ctx={...actor(1,10),permissionCodes:[permission,'common_md.work_calendars.view'],roleAssignments:[
  {roleId:1,roleCode:'branch_manager',ownerCompanyId:1,branchId:10,permissionCodes:[permission]},
  {roleId:2,roleCode:'company_reader',ownerCompanyId:1,branchId:null,permissionCodes:['common_md.work_calendars.view']},
 ]};
 expect(canOpenCalendarEditor(ctx)).toBe(false);expect(canManageCalendar(ctx,1)).toBe(false);
});
it.each(['common_md.manage',code])('%s company-wide assignment admits only its own company in a combined role context',permission=>{
 const ctx={...actor(1,10),permissionCodes:[code,permission],roleAssignments:[...actor(1,10).roleAssignments!,
  {roleId:2,roleCode:'other_company_manager',ownerCompanyId:2,branchId:null,permissionCodes:[permission]},
 ]};
 expect(canOpenCalendarEditor(ctx)).toBe(true);expect(canManageCalendar(ctx,1)).toBe(false);expect(canManageCalendar(ctx,2)).toBe(true);expect(canManageCalendar(ctx,null)).toBe(false);
});
it('flat legacy capabilities without scoped assignments cannot admit the editor',()=>{
 expect(canOpenCalendarEditor({...actor(1),roleAssignments:undefined})).toBe(false);
});
it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1])('invalid company scope %s does not admit the editor',company=>{
 expect(canOpenCalendarEditor(actor(company))).toBe(false);
});
it('branch-scoped administrator label does not become global editor authority',()=>{
 const ctx={...actor(1,10),permissionCodes:[],globalPermissionCodes:[],roleCodes:['system_admin'],roleAssignments:[{roleId:1,roleCode:'system_admin',ownerCompanyId:1,branchId:10,permissionCodes:[]}]};
 expect(canOpenCalendarEditor(ctx)).toBe(false);
});
it('forced-password-change or absent principal cannot open the editor',()=>{
 expect(canOpenCalendarEditor({...actor(null),profile:{...actor(null).profile!,must_change_password:true}})).toBe(false);
 expect(canOpenCalendarEditor({...actor(null),profile:null})).toBe(false);
});

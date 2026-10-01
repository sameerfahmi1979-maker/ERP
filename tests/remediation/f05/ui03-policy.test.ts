import { describe, expect, it } from 'vitest';
import { scheduleUiAccess, canEditSchedule, canDeliverSchedule, scheduleCreationMatches } from '@/lib/report-center/schedule-ui-access';
import type { AuthContext } from '@/lib/rbac/check';
import { queueDeliveryDetails } from '@/lib/email/queue/ui-details';
import { filterLoadedRows } from '@/components/erp/table/loaded-list-view';
const delivery=['reports.run','reports.export','reports.email'];
const actor=(assignments:NonNullable<AuthContext['roleAssignments']>,globalPermissionCodes:string[]=[]):AuthContext=>({
  profile:{id:10,must_change_password:false} as AuthContext['profile'],email:null,roleCodes:[],permissionCodes:assignments.flatMap(a=>a.permissionCodes),
  roleAssignments:assignments,globalPermissionCodes,isAccountActive:true,accountStatus:'active',
});
const assignment=(company:number|null,branch:number|null,codes=delivery)=>({roleId:1,roleCode:'synthetic',ownerCompanyId:company,branchId:branch,permissionCodes:codes});
describe('schedule display scope mirrors F09 delivery boundaries',()=>{
  it('branch-only delivery cannot create a company-wide or global schedule',()=>{
    const a=scheduleUiAccess(actor([assignment(1,4)]));expect(a.deliveryCompanyIds).toEqual([]);expect(canDeliverSchedule(a,1)).toBe(false);expect(canDeliverSchedule(a,null)).toBe(false);
  });
  it('split roles in different companies do not combine into delivery access',()=>{
    expect(scheduleUiAccess(actor([assignment(1,null,['reports.run']),assignment(2,null,['reports.export','reports.email'])])).deliveryCompanyIds).toEqual([]);
  });
  it('same-company combined roles can complete the required capability set',()=>{
    expect(scheduleUiAccess(actor([assignment(1,null,['reports.run']),assignment(1,null,['reports.export','reports.email'])])).deliveryCompanyIds).toEqual([1]);
  });
  it('creator rights never replace delivery access',()=>{
    expect(canEditSchedule(scheduleUiAccess(actor([])),{created_by:10,owner_company_id:1})).toBe(false);
  });
  it('viewer with delivery cannot edit another creator without management',()=>{
    const a=scheduleUiAccess(actor([assignment(1,null)]));expect(canEditSchedule(a,{created_by:11,owner_company_id:1})).toBe(false);expect(canEditSchedule(a,{created_by:10,owner_company_id:1})).toBe(true);
  });
  it('scoped manager is restricted to its company',()=>{
    const a=scheduleUiAccess(actor([assignment(1,null,[...delivery,'reports.schedule.manage'])]));expect(canEditSchedule(a,{created_by:11,owner_company_id:1})).toBe(true);expect(canEditSchedule(a,{created_by:11,owner_company_id:2})).toBe(false);
  });
  it('inactive account and password-setup account are denied',()=>{
    const ctx=actor([assignment(null,null)],delivery);expect(scheduleUiAccess({...ctx,isAccountActive:false}).globalDelivery).toBe(false);
    expect(scheduleUiAccess({...ctx,profile:{...ctx.profile!,must_change_password:true}}).globalDelivery).toBe(false);
  });
  it('global delivery can choose company scope without a spurious company role',()=>{
    const a=scheduleUiAccess(actor([assignment(null,null)],delivery));expect(canDeliverSchedule(a,null)).toBe(true);expect(canDeliverSchedule(a,999)).toBe(true);
  });
});
describe('schedule request reconciliation',()=>{
  const payload={created_by:10,owner_company_id:1,recipient_to:['qa@example.invalid'],time_of_day:'07:00',filters_json:{a:1,b:2},next_run_at:'first'};
  it('normalizes database time and JSON key ordering, not recipient ordering or scope',()=>{
    expect(scheduleCreationMatches({...payload,time_of_day:'07:00:00',filters_json:{b:2,a:1},next_run_at:'later'},payload)).toBe(true);
    expect(scheduleCreationMatches({...payload,owner_company_id:2},payload)).toBe(false);
    expect(scheduleCreationMatches({...payload,recipient_to:['other@example.invalid']},payload)).toBe(false);
  });
  it('does not mistake a changed record for the original retry',()=>{
    expect(scheduleCreationMatches({...payload,filters_json:{a:2,b:2}},payload)).toBe(false);
    expect(scheduleCreationMatches({...payload,created_by:11},payload)).toBe(false);
  });
});
describe('delivery UI honesty and privacy',()=>{
  const item={status:'pending',lastError:null,attemptCount:0,maxAttempts:3};
  it('provider accepted never means inbox delivery',()=>{expect(queueDeliveryDetails({...item,status:'sent',deliveryState:'provider_accepted'})).toContain('not confirmation');});
  it('legacy sent and uncertain outcomes require explicit qualification',()=>{
    expect(queueDeliveryDetails({...item,status:'sent'})).toContain('not been independently verified');
    expect(queueDeliveryDetails({...item,status:'delivery_unknown'})).toContain('do not resend automatically');
  });
  it('never renders raw provider diagnostics',()=>{expect(queueDeliveryDetails({...item,lastError:'Authorization: PRIVATE_SECRET'})).not.toContain('PRIVATE_SECRET');});
  it('distinguishes capacity waits, cooldown and terminal failure',()=>{
    expect(queueDeliveryDetails({...item,lastError:'F09:provider_quota'})).toContain('capacity');
    expect(queueDeliveryDetails({...item,lastError:'F09:retry'})).toContain('cooldown');
    expect(queueDeliveryDetails({...item,status:'failed'})).toContain('no automatic resend');
  });
  it('loaded-list filters never introduce additional rows',()=>{
    const rows=[{name:'Allowed',count:2},{name:'Other',count:3}];expect(filterLoadedRows(rows,[{id:'name',label:'Name',path:'name'}],{name:'Allowed'},'')).toEqual([rows[0]]);
  });
});

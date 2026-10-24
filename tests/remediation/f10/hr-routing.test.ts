import {beforeEach,expect,it,vi} from 'vitest';
import {syntheticAuthContext} from '../../performance/fixtures/auth-context';
import type {AuthContext} from '@/lib/rbac/check';
const s=vi.hoisted(()=>({from:vi.fn(),context:vi.fn(),rows:{} as Record<string,Record<string,unknown>[]>,contexts:new Map<number,unknown>(),failed:''}));
vi.mock('@/lib/rbac/check',async original=>({...await original<typeof import('@/lib/rbac/check')>(),getAuthContextForProfileId:s.context}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:s.from})}));
import {createAdminClient} from '@/lib/supabase/admin';
import {resolveNotificationRecipients,NotificationRoutingHold,type NotificationEvent} from '@/server/notification-events';
const expiry='2026-10-25';
const event:NotificationEvent={id:1,event_key:'identity:31:2026-10-25:before7',source_table:'employee_identity_documents',source_id:31,event_type:'compliance_expiry_reminder',actor_id:11,lease_token:'b23ec154-aa22-44cc-8fee-2b954e9bf007',source_snapshot:{employee_id:7,expiry_date:expiry}};
function ctx(profile:number,employee:number,codes:string[],branch=2):AuthContext{
 codes=['notifications.view',...codes];
 return {...syntheticAuthContext(codes,{id:profile,owner_company_id:1,branch_id:2}),roleAssignments:[{roleId:profile,roleCode:employee===7?'employee':'manager',ownerCompanyId:1,branchId:branch,permissionCodes:codes}]};
}
const resolve=(e=event)=>resolveNotificationRecipients(e,createAdminClient());
beforeEach(()=>{
 vi.clearAllMocks();s.failed='';s.rows={
  employees:[{id:7,owner_company_id:1,branch_id:2,reporting_manager_id:8},{id:8,owner_company_id:1,branch_id:2,reporting_manager_id:null}],
  erp_user_employee_links:[{user_profile_id:11,employee_id:7},{user_profile_id:12,employee_id:8}],
  employee_identity_documents:[{id:31,employee_id:7,expiry_date:expiry,status:'active'}],
 };
 s.contexts=new Map([[11,ctx(11,7,['hr.employees.view.self','hr.compliance.view.self'])],[12,ctx(12,8,['hr.employees.view.team','hr.compliance.view.team'])]]);
 s.context.mockImplementation(async(id:number)=>s.contexts.get(id));
 s.from.mockImplementation((table:string)=>{
  const filters:((r:Record<string,unknown>)=>boolean)[]=[];let maximum=Infinity;
  const result=(single=false)=>{const rows=(s.rows[table]??[]).filter(r=>filters.every(f=>f(r))).slice(0,maximum);return {data:single?rows[0]??null:rows,error:table===s.failed?{message:'private outage'}:null};};
  const q:Record<string,unknown>={then:(fn:(r:unknown)=>unknown)=>Promise.resolve(result()).then(fn)};
  q.select=()=>q;q.is=()=>q;q.order=()=>q;q.eq=(key:string,value:unknown)=>{filters.push(r=>r[key]===value);return q;};q.in=(key:string,values:unknown[])=>{filters.push(r=>values.includes(r[key]));return q;};q.limit=(n:number)=>{maximum=n;return q;};q.maybeSingle=()=>Promise.resolve(result(true));return q;
 });
});
it('verified employee and direct manager receive independent identities, including the source actor',async()=>{
 expect(await resolve()).toEqual([11,12]);expect(s.context.mock.calls.map(x=>x[0])).toEqual([11,12]);
});
it('branch-only combined roles do not widen the manager assignment',async()=>{
 const wrong=ctx(12,8,['hr.employees.view.team','hr.compliance.view.team'],3);s.contexts.set(12,{...wrong,permissionCodes:[...wrong.permissionCodes,'hr.compliance.view'],roleAssignments:[...wrong.roleAssignments!,{roleId:90,roleCode:'other',ownerCompanyId:2,branchId:null,permissionCodes:['hr.compliance.view']}]});
 expect(await resolve()).toEqual([11]);
});
it('record creator is not used as an identity fallback',async()=>{
 const r=await resolve({...event,actor_id:999});expect(r).toEqual([11,12]);expect(s.context).not.toHaveBeenCalledWith(999);
});
it('missing employee link holds routing rather than silently completing the manager-only subset',async()=>{
 s.rows.erp_user_employee_links=[{user_profile_id:12,employee_id:8}];await expect(resolve()).rejects.toBeInstanceOf(NotificationRoutingHold);
});
it('missing recorded-manager account link holds routing for review',async()=>{
 s.rows.erp_user_employee_links=[{user_profile_id:11,employee_id:7}];await expect(resolve()).rejects.toBeInstanceOf(NotificationRoutingHold);
});
it('ambiguous account links hold rather than choosing the first returned identity',async()=>{
 s.rows.erp_user_employee_links.push({user_profile_id:13,employee_id:7});await expect(resolve()).rejects.toBeInstanceOf(NotificationRoutingHold);
});
it('profile transfer invalidates a stale employee link through the real shared F03 helper',async()=>{
 const transferred={...s.contexts.get(11) as AuthContext,profile:{...(s.contexts.get(11) as AuthContext).profile!,owner_company_id:2}};s.contexts.set(11,transferred);expect(await resolve()).toEqual([12]);
});
it('changed expiry cycle cannot deliver an old scheduled reminder',async()=>{
 s.rows.employee_identity_documents[0].expiry_date='2027-10-25';expect(await resolve()).toEqual([]);expect(s.context).not.toHaveBeenCalled();
});
it('medical expiry needs separate medical self/team permissions, not compliance alone',async()=>{
 s.rows.employee_medical_insurances=[{...s.rows.employee_identity_documents[0]}];expect(await resolve({...event,source_table:'employee_medical_insurances'})).toEqual([]);
 s.contexts.set(11,ctx(11,7,['hr.employees.view.self','hr.medical.view.self']));expect(await resolve({...event,source_table:'employee_medical_insurances'})).toEqual([11]);
});
it('mapping lookup outage is retryable, not a valid empty or guessed routing result',async()=>{
 s.failed='erp_user_employee_links';await expect(resolve()).rejects.toThrow('links unavailable');
});
it('inactive account is not admitted merely because its employee link exists',async()=>{
 s.contexts.set(11,{...s.contexts.get(11) as AuthContext,isAccountActive:false});expect(await resolve()).toEqual([12]);
});
it('HR source access alone cannot deliver to an account without notification access',async()=>{
 const original=s.contexts.get(11) as AuthContext;
 s.contexts.set(11,{...original,permissionCodes:original.permissionCodes.filter(c=>c!=='notifications.view'),roleAssignments:original.roleAssignments!.map(r=>({...r,permissionCodes:r.permissionCodes.filter(c=>c!=='notifications.view')}))});
 expect(await resolve()).toEqual([12]);
});
it('candidate-only qualification does not resolve every other employee or manager account',async()=>{
 expect(await resolveNotificationRecipients(event,createAdminClient(),undefined,{candidateIds:[12]})).toEqual([12]);
 expect(s.context.mock.calls.map(c=>c[0])).toEqual([12]);
});
it('discovery freezes stored identities without treating them as authorized recipients',async()=>{
 expect(await resolveNotificationRecipients(event,createAdminClient(),undefined,{discoverOnly:true})).toEqual([11,12]);expect(s.context).not.toHaveBeenCalled();
});
it('F12 joining uses verified employee/manager links and current recruitment scope only',async()=>{
 s.rows.employee_recruitment_links=[{candidate_id:9,employee_id:7}];s.rows.hr_candidates=[{id:9,candidate_id:9,requisition_id:19,joining_status:'in_progress'}];s.rows.hr_job_requisitions=[{id:19,owner_company_id:1,branch_id:2}];
 s.contexts.set(11,ctx(11,7,['hr.employees.view.self','hr.recruitment.view']));s.contexts.set(12,ctx(12,8,['hr.employees.view.team','hr.recruitment.view']));
 const joining:NotificationEvent={...event,source_table:'hr_candidates',source_id:9,event_type:'joining_changed',source_snapshot:{candidate_id:9,joining_status:'in_progress'}};
 expect(await resolve(joining)).toEqual([11,12]);s.rows.erp_user_employee_links=[];await expect(resolve(joining)).rejects.toBeInstanceOf(NotificationRoutingHold);
});
it('F12 stale joining status cannot route an old lifecycle snapshot',async()=>{
 s.rows.hr_candidates=[{id:9,candidate_id:9,requisition_id:19,joining_status:'completed'}];s.rows.hr_job_requisitions=[{id:19,owner_company_id:1,branch_id:2}];s.rows.employee_recruitment_links=[];
 expect(await resolve({...event,source_table:'hr_candidates',source_id:9,event_type:'joining_changed',source_snapshot:{candidate_id:9,joining_status:'in_progress'}})).toEqual([]);
});
it.each([['employee_pro_processes','hr.actions.view','process_status','draft'],['employee_assignments','hr.assignments.view','assignment_status','planned']] as const)('F12 %s requires fresh same-branch source permission and revision',async(table,cap,status,value)=>{
 s.rows[table]=[{id:41,employee_id:7,workspace_revision:2,[status]:value}];
 const e:NotificationEvent={...event,source_table:table,source_id:41,event_type:'workforce_changed',source_snapshot:{employee_id:7,workspace_revision:2,[status]:value}};
 expect(await resolve(e)).toEqual([]);
 s.contexts.set(11,ctx(11,7,['hr.employees.view.self',cap]));s.contexts.set(12,ctx(12,8,['hr.employees.view.team',cap]));expect(await resolve(e)).toEqual([11,12]);
 s.contexts.set(12,ctx(12,8,['hr.employees.view.team',cap],3));expect(await resolve(e)).toEqual([11]);
 s.rows[table][0].workspace_revision=3;expect(await resolve(e)).toEqual([]);
});
it('F12 workforce notices hold missing identity mappings and retry source outages',async()=>{
 s.rows.employee_pro_processes=[{id:41,employee_id:7,workspace_revision:2,process_status:'draft'}];const e:NotificationEvent={...event,source_table:'employee_pro_processes',source_id:41,event_type:'workforce_changed',source_snapshot:{employee_id:7,workspace_revision:2,process_status:'draft'}};
 s.rows.erp_user_employee_links=[];await expect(resolve(e)).rejects.toBeInstanceOf(NotificationRoutingHold);s.failed='employee_pro_processes';await expect(resolve(e)).rejects.toThrow();
});

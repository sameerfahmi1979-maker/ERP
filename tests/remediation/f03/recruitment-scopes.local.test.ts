import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createClient as sdk } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const state=vi.hoisted(()=>({client:null as any,admin:null as any}));
vi.mock('server-only',()=>({}));
vi.mock('next/cache',()=>({revalidatePath:()=>{}}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>withDocumentReadPolicy(state.client)}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>state.admin}));
vi.mock('@/server/actions/audit',()=>({logAudit:async()=>{}}));
import { archiveInterview, archiveOffer, createOffer, listCandidates, listGlobalInterviews, listGlobalOffers, listGlobalOnboardingTasks, updateCandidate } from '@/server/actions/hr/recruitment';
import { withDocumentReadPolicy } from '@/lib/supabase/document-read-policy';
const require=createRequire(import.meta.url),db=require('../f00/local-db.cjs'),api=require('../f00/local-client.cjs');
const run='f03_'+randomBytes(5).toString('hex'),actors:Record<string,any>={};
const ledger:any={run,target:'algt-f00-local',production_mutations:0,accounts:[],roles:[],permissions:[],records:[],cases:[],cleanup:false};
const save=()=>fs.writeFileSync(path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F03/RECRUITMENT_TEST_RECORDS.json'),JSON.stringify(ledger,null,2));
const passed=(name:string)=>{ledger.cases.push({name,status:'PASS'});save();};
const req:number[]=[],candidate:number[]=[],interview:number[]=[],offer:number[]=[],task:number[]=[];
async function insert(table:string,row:Record<string,unknown>){const r=await state.admin.from(table).insert(row).select('id').single();if(r.error)throw new Error(table+': '+r.error.message);ledger.records.push({table,id:r.data.id});save();return r.data.id as number;}
beforeAll(async()=>{
 db.assertDatabase();const c=api.keys();expect(c.API_URL).toBe('http://127.0.0.1:16421');
 state.admin=sdk(c.API_URL,c.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const codes=['hr.recruitment.view','hr.recruitment.manage','hr.employees.view','hr.payroll.view','hr.payroll.manage'];const ids:Record<string,number>={};
 for(const code of codes){const p=await state.admin.from('permissions').select('id').eq('permission_code',code).maybeSingle();if(p.error)throw p.error;
  if(p.data)ids[code]=p.data.id;else {ids[code]=await insert('permissions',{permission_code:code,permission_name:code,module_code:'hr',action_code:'view'});}}
 for(const name of ['branch','company','combined','employee','salary']){
  const role=await insert('roles',{role_code:run+'_'+name,role_name:run+' '+name,is_system_role:false});
  const caps=name==='salary'?codes:name==='employee'?['hr.employees.view']:name==='combined'?['hr.recruitment.view']:codes.slice(0,2);
  const rp=await state.admin.from('role_permissions').insert(caps.map(code=>({role_id:role,permission_id:ids[code]})));if(rp.error)throw rp.error;
  const email='f00-'+run+'-'+name+'@example.invalid',password=randomBytes(24).toString('base64url')+'aA9!';
  const a=await state.admin.auth.admin.createUser({email,password,email_confirm:true});if(a.error)throw a.error;
  ledger.accounts.push({authId:a.data.user!.id,email});save();
  const p=await state.admin.from('user_profiles').update({status:'active',must_change_password:false,owner_company_id:900101,branch_id:900201,full_name:run+' '+name}).eq('auth_user_id',a.data.user!.id).select('id').single();if(p.error)throw p.error;
  const u=await state.admin.from('user_roles').insert({user_profile_id:p.data.id,role_id:role,owner_company_id:900101,branch_id:name==='company'||name==='combined'?null:900201});if(u.error)throw u.error;
  const client=sdk(c.API_URL,c.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const login=await client.auth.signInWithPassword({email,password});if(login.error)throw login.error;
  actors[name]={client,id:p.data.id};
 }
 const extra=await insert('roles',{role_code:run+'_other',role_name:run+' other company',is_system_role:false});
 const rp=await state.admin.from('role_permissions').insert(['hr.recruitment.manage','hr.payroll.view','hr.payroll.manage'].map(code=>({role_id:extra,permission_id:ids[code]})));if(rp.error)throw rp.error;
 const ur=await state.admin.from('user_roles').insert({user_profile_id:actors.combined.id,role_id:extra,owner_company_id:900102,branch_id:900203});if(ur.error)throw ur.error;
 for(const [company,branch] of [[900101,900201],[900101,900202],[900102,900203]]){
  req.push(await insert('hr_job_requisitions',{requisition_title:run,owner_company_id:company,branch_id:branch,budgeted_salary_min:1000,budgeted_salary_max:5000}));
  candidate.push(await insert('hr_candidates',{full_name_en:run,requisition_id:req.at(-1),expected_salary:2345}));
  interview.push(await insert('hr_interviews',{candidate_id:candidate.at(-1),requisition_id:req.at(-1)}));
  offer.push(await insert('hr_offers',{candidate_id:candidate.at(-1),requisition_id:req.at(-1),owner_company_id:company,branch_id:branch,basic_salary:1234,gross_salary:2345}));
  task.push(await insert('hr_onboarding_tasks',{candidate_id:candidate.at(-1),task_title:run}));
 }
 candidate.push(await insert('hr_candidates',{full_name_en:run+' unassigned'}));
},60000);
afterAll(async()=>{
 const failures:string[]=[];
 for(const r of [...ledger.records].reverse().filter(r=>r.table.startsWith('hr_'))){
  const result=await state.admin.from(r.table).delete().eq('id',r.id);if(result.error)failures.push(r.table+' '+r.id+': '+result.error.message);
 }
 for(const a of ledger.accounts){const r=await state.admin.auth.admin.deleteUser(a.authId);if(r.error)failures.push('auth '+a.authId);}
 for(const r of [...ledger.records].reverse().filter(r=>!r.table.startsWith('hr_'))){
  if(r.table==='roles'){const rp=await state.admin.from('role_permissions').delete().eq('role_id',r.id);if(rp.error)failures.push('role permissions '+r.id);}
  const result=await state.admin.from(r.table).delete().eq('id',r.id);if(result.error)failures.push(r.table+' '+r.id+': '+result.error.message);
 }
 ledger.cleanup=failures.length===0;ledger.cleanupFailures=failures;save();expect(failures).toEqual([]);
},60000);
it('all recruitment roots and children enforce branch boundaries',async()=>{
 for(const [table,ids] of [['hr_job_requisitions',req],['hr_candidates',candidate],['hr_interviews',interview],['hr_offers',offer],['hr_onboarding_tasks',task]] as const){
  const r=await actors.branch.client.from(table).select('id').in('id',ids);expect(r.error,table).toBeNull();expect(r.data,table).toEqual([{id:ids[0]}]);
 }passed('five recruitment tables branch-positive sibling/company-negative');
});
it('company assignments include their branches but not another company or unscoped candidates',async()=>{
 const r=await actors.company.client.from('hr_candidates').select('id').in('id',candidate).order('id');expect(r.error).toBeNull();expect(r.data).toEqual(candidate.slice(0,2).map(id=>({id})));passed('company and orphan boundaries');
});
it('general employee access alone does not expose recruitment',async()=>{
 const r=await actors.employee.client.from('hr_candidates').select('id').in('id',candidate);expect(r.error).toBeNull();expect(r.data).toEqual([]);passed('no implicit recruitment access');
});
it('combined-role management cannot borrow another assignment company',async()=>{
 const denied=await actors.combined.client.from('hr_candidates').update({notes:run+' forbidden'}).eq('id',candidate[0]).select('id');expect(denied.error).toBeNull();expect(denied.data).toEqual([]);
 const allowed=await actors.combined.client.from('hr_candidates').update({notes:run+' allowed'}).eq('id',candidate[2]).select('id');expect(allowed.error).toBeNull();expect(allowed.data).toEqual([{id:candidate[2]}]);passed('combined-role no scope borrowing');
});
it('candidate reassignment and mismatched child links cannot escape branch scope',async()=>{
 const moved=await actors.branch.client.from('hr_candidates').update({requisition_id:req[1]}).eq('id',candidate[0]);expect(moved.error?.code).toBe('42501');
 const child=await actors.branch.client.from('hr_interviews').insert({candidate_id:candidate[0],requisition_id:req[1]});expect(child.error?.code).toBe('42501');
 const orphan=await actors.branch.client.from('hr_candidates').insert({full_name_en:run+' must fail'});expect(orphan.error?.code).toBe('42501');passed('candidate old/new scope and secondary requisition');
});
it('out-of-scope archive actions return failure rather than false success',async()=>{
 state.client=actors.branch.client;
 expect((await archiveInterview(interview[1])).success).toBe(false);expect((await archiveOffer(offer[1])).success).toBe(false);
 const r=await state.admin.from('hr_interviews').select('deleted_at').eq('id',interview[1]).single();expect(r.data.deleted_at).toBeNull();passed('server action zero-row mutation rejection');
});
it('real recruitment screen queries retain legitimate records',async()=>{
 state.client=actors.branch.client;
 for(const action of [listCandidates,listGlobalInterviews,listGlobalOffers,listGlobalOnboardingTasks]){const r=await action();expect(r.success,JSON.stringify(r)).toBe(true);expect(r.data!.rows.length).toBeGreaterThan(0);}
 passed('four real list action contracts');
});
it('salary projection masks all recruitment salary columns without losing allowed metadata',async()=>{
 for(const [table,id,field,value] of [['hr_candidates',candidate[0],'expected_salary',2345],['hr_job_requisitions',req[0],'budgeted_salary_min',1000],['hr_offers',offer[0],'basic_salary',1234]] as const){
  const denied=await actors.branch.client.from(table).select(field).eq('id',id);expect(denied.error?.code).toBe('42501');
  const masked=await withDocumentReadPolicy(actors.branch.client).from(table).select('id,'+field).eq('id',id).single();expect(masked.error).toBeNull();expect(masked.data[field]).toBeNull();
  const allowed=await withDocumentReadPolicy(actors.salary.client).from(table).select('id,'+field).eq('id',id).single();expect(allowed.error).toBeNull();expect(allowed.data[field]).toBe(value);
 }passed('salary direct-column denial, masked metadata, scoped positive');
});
it('combined roles cannot borrow salary access and predicates cannot reveal masked pay',async()=>{
 const masked=await withDocumentReadPolicy(actors.combined.client).from('hr_candidates').select('id,expected_salary').in('id',[candidate[0],candidate[2]]).order('id');expect(masked.error).toBeNull();expect(masked.data).toEqual([{id:candidate[0],expected_salary:null},{id:candidate[2],expected_salary:2345}]);
 const probe=await withDocumentReadPolicy(actors.branch.client).from('hr_candidates').select('id').eq('expected_salary',2345);expect(probe.error).toBeNull();expect(probe.data).toEqual([]);passed('salary no scope borrowing and masked predicate');
});
it('ordinary candidate edits preserve hidden salary; forged salary changes fail',async()=>{
 state.client=actors.branch.client;const ordinary=await updateCandidate(candidate[0],{notes:run+' ordinary'});expect(ordinary.success).toBe(true);
 const forged=await updateCandidate(candidate[0],{expected_salary:null});expect(forged.success).toBe(false);
 const unchanged=await state.admin.from('hr_candidates').select('expected_salary').eq('id',candidate[0]).single();expect(unchanged.data.expected_salary).toBe(2345);
 const allowed=await actors.salary.client.from('hr_candidates').update({expected_salary:2456}).eq('id',candidate[0]).select('id');expect(allowed.error).toBeNull();expect(allowed.data).toHaveLength(1);passed('salary authorized write / forged masked-null denied / ordinary edit');
});
it('candidate offer creation inherits the permitted company/branch',async()=>{
 state.client=actors.branch.client;const r=await createOffer(candidate[0],{offer_status:'draft',currency:'AED',notes:run});
 if(r.data?.id){ledger.records.push({table:'hr_offers',id:r.data.id});save();}
 expect(r.success,JSON.stringify(r)).toBe(true);const row=await state.admin.from('hr_offers').select('owner_company_id,branch_id').eq('id',r.data!.id).single();
 expect(row.data).toEqual({owner_company_id:900101,branch_id:900201});passed('new offer inherits requisition scope');
});

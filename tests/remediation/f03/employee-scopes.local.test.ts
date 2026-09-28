import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createClient as sdk } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const state=vi.hoisted(()=>({client:null as any,admin:null as any}));
vi.mock('server-only',()=>({}));
vi.mock('next/cache',()=>({revalidatePath:()=>{}}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>state.client}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>state.admin}));
import { createEmployeeMedicalRecord } from '@/server/actions/hr/compliance';
import { getAuthContext } from '@/lib/rbac/check';
import { createScopedReportReadClient } from '@/lib/report-center/scoped-read-client';
import { getLinkedEmployeeId } from '@/lib/rbac/employee-access';
import { employeeListFetcher } from '@/server/actions/reports/hr/employee-list-report';
import { withDocumentReadPolicy } from '@/lib/supabase/document-read-policy';
import { REPORT_FETCHERS } from '@/lib/report-center/report-fetchers';
const require=createRequire(import.meta.url),db=require('../f00/local-db.cjs'),api=require('../f00/local-client.cjs');
const dir=path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F03');
const run='f03_'+randomBytes(5).toString('hex');
const ledger:any={run,target:'algt-f00-local',production_mutations:0,accounts:[],roles:[],permissions:[],medical:[],insurance:[],dependents:[],lookups:[],cases:[],cleanup:false};
const actors:Record<string,{client:any,id:number,authId:string}>={};
const save=()=>fs.writeFileSync(path.join(dir,'EMPLOYEE_SCOPE_TEST_RECORDS.json'),JSON.stringify(ledger,null,2));
const passed=(name:string)=>{ledger.cases.push({name,status:'PASS'});save();};
let medicalType:number;
async function insert(table:string,row:Record<string,unknown>){const r=await state.admin.from(table).insert(row).select('id').single();if(r.error) throw new Error(table+': '+r.error.message);return r.data.id as number;}
beforeAll(async()=>{
 db.assertDatabase();const config=api.keys();expect(config.API_URL).toBe('http://127.0.0.1:16421');
 state.admin=sdk(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const codes=['hr.employees.view','hr.employees.view.self','hr.employees.view.team','hr.employees.update','hr.medical.view','hr.medical.manage','hr.payroll.view','hr.banking.view','hr.compliance.view','hr.compliance.manage','reports.run','hr.actions.view','hr.confidential.view','hr.recruitment.view','hr.assignments.view','hr.leave.view','hr.attendance.view','hr.eos.view'];
 const ids:Record<string,number>={};
 for(const code of codes){let r=await state.admin.from('permissions').select('id').eq('permission_code',code).maybeSingle();if(r.error)throw r.error;
  if(!r.data){ids[code]=await insert('permissions',{permission_code:code,permission_name:code,module_code:'hr',action_code:'view'});ledger.permissions.push(ids[code]);save();}else ids[code]=r.data.id;}
 const specs:[string,number,number,number|null,string[]][]=[
  ['self',900101,900201,900301,['hr.employees.view.self']],
  ['manager',900101,900201,900302,['hr.employees.view.team']],
  ['branch',900101,900201,null,['hr.employees.view','hr.employees.update','hr.medical.view','hr.medical.manage','hr.compliance.view','hr.compliance.manage']],
  ['company',900101,900201,null,['hr.employees.view','hr.employees.update','hr.compliance.view','hr.compliance.manage']],
  ['other',900102,900203,null,['hr.employees.view','hr.medical.view']],
  ['combined',900101,900201,null,['hr.employees.view']],
  ['report',900101,900201,null,codes.filter(c=>c!=='reports.run')],
 ];
 for(const [name,company,branch,employee,caps] of specs){
  caps.push('reports.run');
  const role=await insert('roles',{role_code:run+'_'+name,role_name:'F03 synthetic '+name,is_system_role:false});ledger.roles.push(role);save();
  const rp=await state.admin.from('role_permissions').insert(caps.map(code=>({role_id:role,permission_id:ids[code]})));if(rp.error)throw rp.error;
  const email='f00-'+run+'-'+name+'@example.invalid',password=randomBytes(24).toString('base64url')+'aA9!';
  const created=await state.admin.auth.admin.createUser({email,password,email_confirm:true});if(created.error)throw created.error;
  const authId=created.data.user!.id;ledger.accounts.push({name,authId,email});save();
  const p=await state.admin.from('user_profiles').update({status:'active',must_change_password:false,owner_company_id:company,branch_id:branch,full_name:'F03 synthetic '+name}).eq('auth_user_id',authId).select('id').single();if(p.error)throw p.error;
  Object.assign(ledger.accounts.at(-1),{profileId:p.data.id});save();
  const ur=await state.admin.from('user_roles').insert({user_profile_id:p.data.id,role_id:role,owner_company_id:company,branch_id:name==='company'||name==='combined'?null:branch});if(ur.error)throw ur.error;
  if(employee){const l=await state.admin.from('erp_user_employee_links').insert({user_profile_id:p.data.id,employee_id:employee});if(l.error)throw l.error;}
  const client=sdk(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const signed=await client.auth.signInWithPassword({email,password});if(signed.error)throw signed.error;
  actors[name]={client,id:p.data.id,authId};
 }
 const medicalRole=await insert('roles',{role_code:run+'_medical_b',role_name:'F03 medical B only',is_system_role:false});ledger.roles.push(medicalRole);save();
 const rp=await state.admin.from('role_permissions').insert(['hr.employees.view','hr.medical.view'].map(code=>({role_id:medicalRole,permission_id:ids[code]})));if(rp.error)throw rp.error;
 const assignment=await state.admin.from('user_roles').insert({user_profile_id:actors.combined.id,role_id:medicalRole,owner_company_id:900102,branch_id:900203}).select('id').single();if(assignment.error)throw assignment.error;ledger.combinedMedicalAssignment=assignment.data.id;
 medicalType=await insert('hr_medical_record_types',{code:run,name_en:'F03 synthetic medical type',requires_dms_document:false});ledger.lookups.push({table:'hr_medical_record_types',id:medicalType});save();
 for(const employee of [900301,900305,900307]){const id=await insert('employee_medical_records',{employee_id:employee,medical_record_type_id:medicalType,examination_date:'2026-01-01',result:'fit',notes:run+' synthetic only'});ledger.medical.push({id,employee});save();}
 const relation=await insert('hr_relationship_types',{code:run,name_en:'F03 synthetic relation'});ledger.lookups.push({table:'hr_relationship_types',id:relation});save();
 for(const employee of [900301,900305,900307]){
  const insurance=await insert('employee_medical_insurances',{employee_id:employee,insurance_provider:'Synthetic only',policy_number:run+'-'+employee,expiry_date:'2027-01-01'});ledger.insurance.push({id:insurance,employee});save();
  const dependent=await insert('employee_dependents',{employee_id:employee,dependent_name_en:run,relationship_type_id:relation,medical_insurance_provider:run+' medical'});ledger.dependents.push({id:dependent,employee});save();
 }
},60000);
afterAll(async()=>{
 const failures=[];
 for(const [table,records] of [['employee_medical_insurances',ledger.insurance],['employee_dependents',ledger.dependents]] as const)for(const r of records){const e=await state.admin.from(table).delete().eq('id',r.id);if(e.error)failures.push(table+' '+r.id);}
 for(const r of ledger.medical){const e=await state.admin.from('employee_medical_records').delete().eq('id',r.id);if(e.error)failures.push('medical '+r.id);}
 for(const a of ledger.accounts){const e=await state.admin.auth.admin.deleteUser(a.authId);if(e.error)failures.push('account '+a.authId);}
 for(const id of ledger.roles){await state.admin.from('role_permissions').delete().eq('role_id',id);const e=await state.admin.from('roles').delete().eq('id',id);if(e.error)failures.push('role '+id);}
 for(const r of ledger.lookups){const e=await state.admin.from(r.table).delete().eq('id',r.id);if(e.error)failures.push(r.table+' '+r.id);}
 for(const id of ledger.permissions){const e=await state.admin.from('permissions').delete().eq('id',id);if(e.error)failures.push('permission '+id);}
 ledger.cleanup=failures.length===0;ledger.cleanupFailures=failures;save();expect(failures).toEqual([]);
},60000);
async function visible(name:string){const r=await actors[name].client.from('employees').select('id').in('id',[900301,900302,900303,900304,900305,900306,900307]).order('id');expect(r.error).toBeNull();return r.data.map((x:any)=>x.id);}
it('self sees only the explicitly linked employee',async()=>{expect(await visible('self')).toEqual([900301]);passed('self only');});
it('direct manager sees direct reports, not own/unrelated/other-company employees',async()=>{expect(await visible('manager')).toEqual([900301]);passed('direct team only');});
it('branch HR gets its legitimate branch, not sibling branch or another company',async()=>{expect(await visible('branch')).toEqual([900301,900302,900303,900304,900306]);passed('branch positive and sibling/company negative');});
it('company HR sees both own-company branches but no other company',async()=>{expect(await visible('company')).toEqual([900301,900302,900303,900304,900305,900306]);passed('company positive and other-company negative');});
it('employee and manager basic visibility does not confer medical access',async()=>{for(const name of ['self','manager','company']){const r=await actors[name].client.from('employee_medical_records').select('id').in('id',ledger.medical.map((x:any)=>x.id));expect(r.error).toBeNull();expect(r.data).toEqual([]);}passed('medical separate capability');});
it('medical scope is applied to real child rows and does not combine across companies',async()=>{for(const [name,ids] of [['branch',[900301]],['other',[900307]],['combined',[900307]]] as const){const r=await actors[name].client.from('employee_medical_records').select('employee_id').in('id',ledger.medical.map((x:any)=>x.id));expect(r.error).toBeNull();expect(r.data.map((x:any)=>x.employee_id)).toEqual(ids);}passed('medical child positive/negative and combined roles');});
it('in-scope medical mutation works; sibling branch mutation cannot change rows',async()=>{const own=ledger.medical.find((x:any)=>x.employee===900301),sibling=ledger.medical.find((x:any)=>x.employee===900305);
 const ok=await actors.branch.client.from('employee_medical_records').update({notes:run+' updated'}).eq('id',own.id).select('id');expect(ok.error).toBeNull();expect(ok.data.length).toBe(1);
 const no=await actors.branch.client.from('employee_medical_records').update({notes:'not allowed'}).eq('id',sibling.id).select('id');expect(no.error).toBeNull();expect(no.data).toEqual([]);
 const verify=await state.admin.from('employee_medical_records').select('notes').eq('id',sibling.id).single();expect(verify.data.notes).toBe(run+' synthetic only');passed('medical mutation boundaries');});
it('HR action cannot use a server-key bypass for a sibling-branch medical record',async()=>{state.client=actors.branch.client;const r=await createEmployeeMedicalRecord(900305,{medical_record_type_id:medicalType,examination_date:'2026-01-01',result:'fit',fit_for_work:true});expect(r.success).toBe(false);passed('server action sibling denial');});
it('role revocation takes effect on an already issued session',async()=>{const r=await state.admin.from('user_roles').update({is_active:false}).eq('id',ledger.combinedMedicalAssignment);expect(r.error).toBeNull();const rows=await actors.combined.client.from('employee_medical_records').select('id').in('id',ledger.medical.map((x:any)=>x.id));expect(rows.error).toBeNull();expect(rows.data).toEqual([]);passed('immediate role revocation');});
it('report facade adds an unremovable branch/company filter and exposes no writes',async()=>{
 state.client=actors.branch.client;const ctx=await getAuthContext();const reader=await createScopedReportReadClient(ctx,'HR_EMPLOYEE_LIST');
 const rows=await reader.from('employees').select('id').in('id',[900301,900305,900307]);expect(rows.error).toBeNull();expect(rows.data).toEqual([{id:900301}]);
 expect(()=>reader.from('user_profiles')).toThrow('not authorized');
 expect(()=>reader.from('employees').delete()).toThrow('read-only');
 expect(()=>reader.from('employees').select('*')).toThrow('Sensitive employee');
 expect(()=>reader.from('employees').select('id,blood_group')).toThrow('Sensitive employee');
 expect(()=>reader.from('employees').select('id,employee_medical_records(result)')).toThrow('separately scoped');
 const result=await employeeListFetcher.fetch({owner_company_id:900102},ctx.permissionCodes,reader);expect(result.rows).toEqual([]);
 passed('report query immutable scope and closed read-only facade');
});
it('general compliance does not confer medical insurance access; scoped medical does',async()=>{
 const denied=await actors.company.client.from('employee_medical_insurances').select('id').in('id',ledger.insurance.map((x:any)=>x.id));expect(denied.error).toBeNull();expect(denied.data).toEqual([]);
 const allowed=await actors.branch.client.from('employee_medical_insurances').select('employee_id').in('id',ledger.insurance.map((x:any)=>x.id));expect(allowed.error).toBeNull();expect(allowed.data).toEqual([{employee_id:900301}]);passed('insurance requires scoped medical capability');
});
it('dependent projection masks medical fields for compliance-only users, including predicate probes',async()=>{
 const id=ledger.dependents[0].id;
 const raw=await actors.company.client.from('employee_dependents').select('medical_insurance_provider').eq('id',id);expect(raw.error?.code).toBe('42501');
 const client=withDocumentReadPolicy(actors.company.client);
 const visible=await client.from('employee_dependents').select('id,dependent_name_en,medical_insurance_provider').eq('id',id).single();expect(visible.error).toBeNull();expect(visible.data.dependent_name_en).toBe(run);expect(visible.data.medical_insurance_provider).toBeNull();
 const probe=await client.from('employee_dependents').select('id').eq('medical_insurance_provider',run+' medical');expect(probe.error).toBeNull();expect(probe.data).toEqual([]);
 const allowed=await withDocumentReadPolicy(actors.branch.client).from('employee_dependents').select('employee_id,medical_insurance_provider').in('id',ledger.dependents.map((x:any)=>x.id));expect(allowed.error).toBeNull();expect(allowed.data).toEqual([{employee_id:900301,medical_insurance_provider:run+' medical'}]);passed('dependent medical masking and scope');
});
it('compliance edits preserve hidden medical fields and cannot overwrite them',async()=>{
 const id=ledger.dependents[0].id;
 const ordinary=await actors.company.client.from('employee_dependents').update({notes:run+' ordinary'}).eq('id',id).select('id');expect(ordinary.error).toBeNull();expect(ordinary.data).toEqual([{id}]);
 const forged=await actors.company.client.from('employee_dependents').update({medical_insurance_provider:null}).eq('id',id);expect(forged.error?.code).toBe('42501');
 const unchanged=await state.admin.from('employee_dependents').select('medical_insurance_provider').eq('id',id).single();expect(unchanged.data.medical_insurance_provider).toBe(run+' medical');passed('dependent medical update denial / ordinary edit positive');
});
it('actual employee report fetcher returns legitimate branch records',async()=>{
 state.client=actors.branch.client;const ctx=await getAuthContext();const result=await employeeListFetcher.fetch({},ctx.permissionCodes,await createScopedReportReadClient(ctx,'HR_EMPLOYEE_LIST'));
 expect(result.rows).toHaveLength(5);expect(result.rows.every(r=>r.owner_company_id===900101)).toBe(true);passed('real report positive query');
});
it.each(Object.keys(REPORT_FETCHERS).filter(code=>code.startsWith('HR_')))('actual report schema contract: %s',async(code)=>{
 state.client=actors.report.client;const ctx=await getAuthContext();
 const result=await REPORT_FETCHERS[code].fetch({employee_id:900301},ctx.permissionCodes,await createScopedReportReadClient(ctx,code));
 expect(Array.isArray(result.rows)).toBe(true);passed('report schema contract '+code);
});
it.each([
 ['HR_ATTENDANCE_SUMMARY','employee_attendance_daily_summary',{attendance_date:'2026-01-02',attendance_type:'office',total_hours:8}],
 ['HR_ASSET_ISSUE_REPORT','employee_assets',{asset_type:'other',asset_description:'F03 populated synthetic asset'}],
 ['HR_PPE_ISSUE_REPORT','employee_ppe_issues',{ppe_item:'F03 populated synthetic PPE'}],
 ['HR_PRO_PROCESSES','employee_pro_processes',{process_title:'F03 populated synthetic process'}],
 ['HR_DISCIPLINARY_SUMMARY','employee_disciplinary_records',{disciplinary_type:'other',subject:'F03 populated synthetic subject'}],
 ['HR_EOS_CASES','employee_eos_cases',{eos_type:'other'}],
 ['HR_ASSIGNMENT_BY_SITE','employee_assignments',{effective_from:'2026-01-02'}],
] as const)('populated report %s includes legitimate children and excludes sibling subjects',async(code,table,fields)=>{
 const records:number[]=[];ledger.populatedReports??=[];
 const evidence:any={code,table,records,cleanup:false};ledger.populatedReports.push(evidence);save();
 try {
  for(const employee of [900301,900305,900307]){records.push(await insert(table,{employee_id:employee,...fields}));save();}
  state.client=actors.report.client;const ctx=await getAuthContext();
  const before=performance.now();const reader=await createScopedReportReadClient(ctx,code);
  const result=await REPORT_FETCHERS[code].fetch({},ctx.permissionCodes,reader);
  evidence.elapsed_ms=Math.round(performance.now()-before);evidence.rows=result.rows.length;save();
  const employee=await state.admin.from('employees').select('employee_code').eq('id',900301).single();expect(employee.error).toBeNull();
  expect(result.rows).toHaveLength(1);expect(result.rows[0].employee_code).toBe(employee.data.employee_code);
  const forced=await reader.from(table).select('employee_id').in('employee_id',[900305,900307]);expect(forced.data).toEqual([]);
  state.client=actors.company.client;const deniedCtx=await getAuthContext();
  const deniedReader=await createScopedReportReadClient(deniedCtx,code);const denied=await deniedReader.from(table).select('id').in('id',records);expect(denied.data).toEqual([]);
  passed('populated report positive / sibling subject denial / separate capability '+code);
 } finally {
  for(const id of records){const r=await state.admin.from(table).delete().eq('id',id);expect(r.error).toBeNull();}
  evidence.cleanup=true;save();
 }
});
it('a basic employee report permission cannot produce a salary certificate',async()=>{
 state.client=actors.company.client;const reader=await createScopedReportReadClient(await getAuthContext(),'HR_SALARY_CERT_WITH_AMOUNT');
 const r=await reader.from('employees').select('id');expect(r.error).toBeNull();expect(r.data).toEqual([]);passed('salary report requires separately scoped payroll');
});
it('report query preserves both self and direct-team grants in the same role',async()=>{
 const role=ledger.roles[1];const p=await state.admin.from('permissions').select('id').eq('permission_code','hr.employees.view.self').single();expect(p.error).toBeNull();
 const insert=await state.admin.from('role_permissions').insert({role_id:role,permission_id:p.data.id});expect(insert.error).toBeNull();
 try {state.client=actors.manager.client;const reader=await createScopedReportReadClient(await getAuthContext(),'HR_EMPLOYEE_LIST');const r=await reader.from('employees').select('id').order('id');expect(r.error).toBeNull();expect(r.data).toEqual([{id:900301},{id:900302}]);}
 finally {const removed=await state.admin.from('role_permissions').delete().eq('role_id',role).eq('permission_id',p.data.id);expect(removed.error).toBeNull();}
 passed('combined self and team positive report');
});
it('transferring an account invalidates its former self-service link in SQL and server checks',async()=>{
 const moved=await state.admin.from('user_profiles').update({branch_id:900202}).eq('id',actors.self.id);expect(moved.error).toBeNull();
 try {expect(await visible('self')).toEqual([]);state.client=actors.self.client;expect(await getLinkedEmployeeId(await getAuthContext())).toBeNull();}
 finally {const restored=await state.admin.from('user_profiles').update({branch_id:900201}).eq('id',actors.self.id);expect(restored.error).toBeNull();}
 passed('transferred identity cannot retain stale relationship access');
});
it('medical base column is inaccessible in direct employee queries while ordinary fields still work',async()=>{
 const restricted=await actors.self.client.from('employees').select('id,blood_group').eq('id',900301);expect(restricted.error).not.toBeNull();
 const plain=await actors.self.client.from('employees').select('id,full_name_en').eq('id',900301);expect(plain.error).toBeNull();expect(plain.data).toHaveLength(1);passed('medical column and ordinary employee field separation');
});
it('a free-text reference cannot create self access and direct link writes are denied',async()=>{const fake=await state.admin.from('user_profiles').update({employee_reference:'F00-EMP-900305'}).eq('id',actors.self.id);expect(fake.error).toBeNull();expect(await visible('self')).toEqual([900301]);
 const link=await actors.self.client.from('erp_user_employee_links').update({employee_id:900305}).eq('user_profile_id',actors.self.id);expect(!!link.error).toBe(true);passed('trusted identity link cannot be forged');});

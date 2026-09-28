import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { createClient as sdk } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { createRequire } from 'node:module';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const state=vi.hoisted(()=>({client:null as any,admin:null as any}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>state.client}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>state.admin}));
import { GET } from '@/app/api/output/file/route';
import { canAccessIssuedFile, issuedFileUrl } from '@/lib/output/issued-file-access';
const require=createRequire(import.meta.url),db=require('../f00/local-db.cjs'),api=require('../f00/local-client.cjs');
const run='f03_'+randomBytes(5).toString('hex');
const ledger:any={run,target:'algt-f00-local',production_mutations:0,accounts:[],roles:[],permissions:[],registry:[],documents:[],objects:[],cases:[],cleanup:false};
const actors:Record<string,any>={};let grant:number,config:any;
// Synthetic transport fixture, not a rendered business document or real company letterhead.
const bytes=Buffer.from('%PDF-1.4\n% F03 synthetic byte-transport test only\n%%EOF\n');
const save=()=>fs.writeFileSync(path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F03/ISSUED_FILE_TEST_RECORDS.json'),JSON.stringify(ledger,null,2));
const pass=(name:string)=>{ledger.cases.push({name,status:'PASS'});save();};
async function insert(table:string,row:any){const r=await state.admin.from(table).insert(row).select('id').single();if(r.error)throw new Error(table+': '+r.error.message);return r.data.id as number;}
beforeAll(async()=>{
 db.assertDatabase();config=api.keys();expect(config.API_URL).toBe('http://127.0.0.1:16421');
 state.admin=sdk(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const permissions:Record<string,number>={};
 for(const code of ['hr.employees.view','reports.view','reports.export','hr.payroll.view']) {
  const r=await state.admin.from('permissions').select('id').eq('permission_code',code).maybeSingle();if(r.error)throw r.error;
  permissions[code]=r.data?.id??await insert('permissions',{permission_code:code,permission_name:code,module_code:'reports',action_code:'view'});if(!r.data)ledger.permissions.push(permissions[code]);save();
 }
 for(const code of ['HR_EMPLOYMENT_LETTER','HR_SALARY_CERT_WITH_AMOUNT']) {
  const r=await state.admin.from('erp_report_registry').select('id').eq('report_code',code).maybeSingle();if(r.error)throw r.error;
  if(!r.data){const id=await insert('erp_report_registry',{report_code:code,report_name_en:'F03 local '+code,module_code:'HR',report_category:'letter',required_permissions:['hr.employees.view']});ledger.registry.push(id);save();}
 }
 for(const [name,caps] of [
  ['metadata',['hr.employees.view','reports.view']],
  ['download',['hr.employees.view','reports.view','reports.export','hr.payroll.view']],
  ['combined',['hr.employees.view','reports.view','reports.export']],
 ] as [string,string[]][]){
  const role=await insert('roles',{role_code:run+'_'+name,role_name:'F03 issued '+name,is_system_role:false});ledger.roles.push(role);save();
  const rp=await state.admin.from('role_permissions').insert(caps.map(code=>({role_id:role,permission_id:permissions[code]})));if(rp.error)throw rp.error;
  const email='f00-'+run+'-'+name+'@example.invalid',password=randomBytes(24).toString('base64url')+'aA9!';
  const u=await state.admin.auth.admin.createUser({email,password,email_confirm:true});if(u.error)throw u.error;
  ledger.accounts.push({name,authId:u.data.user.id,email});save();
  const p=await state.admin.from('user_profiles').update({status:'active',must_change_password:false,owner_company_id:900101,branch_id:900201,full_name:'F03 issued '+name}).eq('auth_user_id',u.data.user.id).select('id').single();if(p.error)throw p.error;
  const ur=await state.admin.from('user_roles').insert({user_profile_id:p.data.id,role_id:role,owner_company_id:900101,branch_id:900201}).select('id').single();if(ur.error)throw ur.error;if(name==='download')grant=ur.data.id;
  const client=sdk(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const s=await client.auth.signInWithPassword({email,password});if(s.error)throw s.error;actors[name]={client,id:p.data.id};
 }
 const role=await insert('roles',{role_code:run+'_salary_b',role_name:'F03 salary B only',is_system_role:false});ledger.roles.push(role);save();
 const rp=await state.admin.from('role_permissions').insert({role_id:role,permission_id:permissions['hr.payroll.view']});if(rp.error)throw rp.error;
 const ur=await state.admin.from('user_roles').insert({user_profile_id:actors.combined.id,role_id:role,owner_company_id:900102,branch_id:900203});if(ur.error)throw ur.error;
 for(const [employee,company,code] of [[900301,900101,'HR_EMPLOYMENT_LETTER'],[900301,900101,'HR_SALARY_CERT_WITH_AMOUNT'],[900305,900101,'HR_EMPLOYMENT_LETTER'],[900307,900102,'HR_EMPLOYMENT_LETTER']] as const){
  const object=run+'/'+ledger.documents.length+'.pdf';const up=await state.admin.storage.from('erp-generated-pdfs').upload(object,bytes,{contentType:'application/pdf'});if(up.error)throw up.error;ledger.objects.push(object);save();
  const id=await insert('erp_generated_pdf_documents',{template_key:code.toLowerCase(),output_code:code,source_record_type:'employee',source_record_id:employee,owner_company_id:company,storage_path:object,file_name:'F03 synthetic العربية.pdf',checksum:createHash('sha256').update(bytes).digest('hex'),renderer:'f03_synthetic',generated_by:actors.download.id,lifecycle_state:'issued',data_snapshot_json:{fixture:run}});
  ledger.documents.push(id);save();
 }
},60000);
afterAll(async()=>{
 const failures=[];
 if(state.admin){
 for(const object of ledger.objects){const r=await state.admin.storage.from('erp-generated-pdfs').remove([object]);if(r.error)failures.push('object '+object);}
 for(const id of ledger.documents){const r=await state.admin.from('erp_generated_pdf_documents').delete().eq('id',id);if(r.error)failures.push('document '+id);}
 for(const a of ledger.accounts){const r=await state.admin.auth.admin.deleteUser(a.authId);if(r.error)failures.push('account '+a.authId);}
 for(const id of ledger.roles){await state.admin.from('role_permissions').delete().eq('role_id',id);const r=await state.admin.from('roles').delete().eq('id',id);if(r.error)failures.push('role '+id);}
 for(const id of ledger.registry){const r=await state.admin.from('erp_report_registry').delete().eq('id',id);if(r.error)failures.push('registry '+id);}
 for(const id of ledger.permissions){const r=await state.admin.from('permissions').delete().eq('id',id);if(r.error)failures.push('permission '+id);}
 }
 ledger.cleanup=failures.length===0;ledger.cleanupFailures=failures;save();expect(failures).toEqual([]);
},60000);
const request=(id:number)=>new NextRequest('http://localhost'+issuedFileUrl(id));
it('history metadata and stored snapshots respect sensitive, branch and company scope',async()=>{
 for(const [name,indexes] of [['metadata',[0]],['download',[0,1]],['combined',[0]]] as const){const r=await actors[name].client.from('erp_generated_pdf_documents').select('id,data_snapshot_json').in('id',ledger.documents).order('id');expect(r.error).toBeNull();expect(r.data.map((d:any)=>d.id)).toEqual(indexes.map(i=>ledger.documents[i]));}
 pass('history and snapshots scoped by sensitivity/company/branch');
});
it('metadata access does not grant downloadable bytes',async()=>{state.client=actors.metadata.client;expect(await canAccessIssuedFile(ledger.documents[0],'download')).toBe(false);expect((await GET(request(ledger.documents[0]))).status).toBe(404);pass('separate export permission');});
it('authorized generated PDF returns exact bytes and safe headers',async()=>{state.client=actors.download.client;const r=await GET(request(ledger.documents[1]));expect(r.status).toBe(200);expect(Buffer.from(await r.arrayBuffer())).toEqual(bytes);expect(r.headers.get('Cache-Control')).toBe('private, no-store');expect(r.headers.get('Content-Disposition')).toContain("filename*=UTF-8''");pass('issued file bytes and headers');});
it('other branch, company and borrowed salary permission cannot download',async()=>{state.client=actors.download.client;for(const i of [2,3])expect((await GET(request(ledger.documents[i]))).status).toBe(404);state.client=actors.combined.client;expect((await GET(request(ledger.documents[1]))).status).toBe(404);pass('byte access boundaries and combined roles');});
it('revocation and expiry apply to a previously obtained URL',async()=>{state.client=actors.download.client;const id=ledger.documents[0];
 for(const patch of [{revoked_at:new Date().toISOString()},{expires_at:'2020-01-01T00:00:00Z'},{archived_at:new Date().toISOString()}]){
  const u=await state.admin.from('erp_generated_pdf_documents').update(patch).eq('id',id);expect(u.error).toBeNull();expect((await GET(request(id))).status).toBe(404);
  const restored=await state.admin.from('erp_generated_pdf_documents').update({revoked_at:null,expires_at:null,archived_at:null}).eq('id',id);expect(restored.error).toBeNull();
 }
 pass('revoked expired archived byte denial');
});
it('issued storage paths and snapshots cannot be overwritten by an authenticated actor',async()=>{const r=await actors.download.client.from('erp_generated_pdf_documents').update({storage_path:'different.pdf'}).eq('id',ledger.documents[0]);expect(r.error).not.toBeNull();pass('immutable client-owned output fields');});
it('removing a role blocks a previously obtained URL without JWT refresh',async()=>{const r=await state.admin.from('user_roles').update({is_active:false}).eq('id',grant);expect(r.error).toBeNull();state.client=actors.download.client;expect((await GET(request(ledger.documents[0]))).status).toBe(404);pass('immediate issued-file role revocation');});
it('anonymous callers cannot use the session-bound URL',async()=>{state.client=sdk(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});expect((await GET(request(ledger.documents[0]))).status).toBe(401);pass('anonymous byte denial');});

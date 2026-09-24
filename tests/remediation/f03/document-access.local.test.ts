import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { createClient as sdk } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const state=vi.hoisted(()=>({client:null as any,admin:null as any}));
vi.mock('server-only',()=>({}));
vi.mock('next/cache',()=>({revalidatePath:()=>{}}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>state.client}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>state.admin}));
import { GET } from '@/app/api/dms/file/route';
import { getDmsDocumentFileSignedUrl, adminDeleteDmsDocumentFile, adminHardDeleteDmsFile, adminListDmsFiles } from '@/server/actions/dms/document-files';
import { withDocumentReadPolicy } from '@/lib/supabase/document-read-policy';
import { attachUploadToExistingDocument } from '@/server/actions/dms/document-upload-attach';
import { getDmsDocument, updateDmsDocument } from '@/server/actions/dms/documents';
const require=createRequire(import.meta.url),db=require('../f00/local-db.cjs'),api=require('../f00/local-client.cjs');
const run='f03_'+randomBytes(5).toString('hex'),dir=path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F03');
const ledger:any={run,target:'algt-f00-local',production_mutations:0,accounts:[],roles:[],permissions:[],documents:[],lookups:[],objects:[],cases:[],cleanup:false};
const actors:Record<string,any>={};let files:number[]=[],config:any,downloadGrant:number;
// Valid one-pixel synthetic PNG, permitted by the existing bucket MIME allowlist.
const payload=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const save=()=>fs.writeFileSync(path.join(dir,'DOCUMENT_ACCESS_TEST_RECORDS.json'),JSON.stringify(ledger,null,2));
const pass=(name:string)=>{ledger.cases.push({name,status:'PASS'});save();};
async function insert(table:string,row:any){const r=await state.admin.from(table).insert(row).select('id').single();if(r.error)throw new Error(table+': '+r.error.message);return r.data.id as number;}
beforeAll(async()=>{
 db.assertDatabase();config=api.keys();expect(config.API_URL).toBe('http://127.0.0.1:16421');
 state.admin=sdk(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const ids:Record<string,number>={};
 for(const code of ['dms.documents.view','dms.documents.preview','dms.documents.download','dms.documents.edit','dms.documents.upload','dms.documents.view.hr','dms.admin','hr.employees.view','hr.medical.view','hr.compliance.view','hr.assignments.view','hr.actions.view','hr.confidential.view','hr.eos.view']){
  const r=await state.admin.from('permissions').select('id').eq('permission_code',code).maybeSingle();if(r.error)throw r.error;
  ids[code]=r.data?.id??await insert('permissions',{permission_code:code,permission_name:code,module_code:'dms',action_code:'view'});if(!r.data)ledger.permissions.push(ids[code]);save();
 }
 for(const [name,caps] of [
  ['metadata',['dms.documents.view']],
  ['preview',['dms.documents.view','dms.documents.preview','dms.documents.view.hr']],
  ['download',['dms.documents.view','dms.documents.preview','dms.documents.download','dms.documents.edit','dms.documents.upload','dms.documents.view.hr']],
  ['owner',['dms.documents.view','dms.documents.preview']],
 ['combined',['dms.documents.view','dms.documents.preview','dms.documents.view.hr','dms.documents.upload']],
  ['metadataEditor',['dms.documents.view','dms.documents.edit']],
  ['scopedAdmin',['dms.documents.view','dms.documents.preview','dms.admin','dms.documents.view.hr']],
 ] as [string,string[]][]){
  const role=await insert('roles',{role_code:run+'_'+name,role_name:'F03 synthetic DMS '+name,is_system_role:false});ledger.roles.push(role);save();
  const rp=await state.admin.from('role_permissions').insert(caps.map(code=>({role_id:role,permission_id:ids[code]})));if(rp.error)throw rp.error;
  const email='f00-'+run+'-'+name+'@example.invalid',password=randomBytes(24).toString('base64url')+'aA9!';
  const u=await state.admin.auth.admin.createUser({email,password,email_confirm:true});if(u.error)throw u.error;ledger.accounts.push({name,authId:u.data.user.id,email});save();
  const p=await state.admin.from('user_profiles').update({status:'active',must_change_password:false,owner_company_id:900101,branch_id:900201,full_name:'F03 synthetic DMS '+name}).eq('auth_user_id',u.data.user.id).select('id').single();if(p.error)throw p.error;
  const ur=await state.admin.from('user_roles').insert({user_profile_id:p.data.id,role_id:role,owner_company_id:900101,branch_id:900201}).select('id').single();if(ur.error)throw ur.error;if(name==='download')downloadGrant=ur.data.id;
  const client=sdk(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const s=await client.auth.signInWithPassword({email,password});if(s.error)throw s.error;actors[name]={client,id:p.data.id};
 }
 const rb=await insert('roles',{role_code:run+'_download_b',role_name:'F03 download B only',is_system_role:false});ledger.roles.push(rb);save();
 let r=await state.admin.from('role_permissions').insert(['dms.documents.download','dms.admin'].map(code=>({role_id:rb,permission_id:ids[code]})));if(r.error)throw r.error;
 r=await state.admin.from('user_roles').insert({user_profile_id:actors.combined.id,role_id:rb,owner_company_id:900102,branch_id:900203});if(r.error)throw r.error;
 const category=await insert('dms_document_categories',{category_code:run,name_en:'F03 synthetic category',is_system:false});ledger.lookups.push({table:'dms_document_categories',id:category});save();
 const type=await insert('dms_document_types',{type_code:run,name_en:'F03 synthetic type',category_id:category,is_system:false});ledger.lookups.unshift({table:'dms_document_types',id:type});save();
 // No new storage bucket or public exposure. Existing synthetic local bucket only.
 const bucket='dms-documents';const buckets=await state.admin.storage.listBuckets();if(buckets.error)throw buckets.error;if(!buckets.data.some((b:any)=>b.id===bucket&&!b.public))throw new Error('Expected private local DMS bucket');
 for(const [index,company,branch,level] of [[0,900101,900201,'internal'],[1,900101,900201,'hr'],[2,900101,900202,'hr'],[3,900102,900203,'hr']] as const){
  const doc=await insert('dms_documents',{document_no:run+'-'+index,title:'F03 synthetic document '+index,document_type_id:type,category_id:category,owning_company_id:company,owning_branch_id:branch,confidentiality_level:level,owner_user_id:actors.owner.id,created_by:actors.owner.id});ledger.documents.push(doc);save();
  const object=run+'/test-'+index+'.png';const up=await state.admin.storage.from(bucket).upload(object,payload,{contentType:'image/png'});if(up.error)throw up.error;ledger.objects.push({bucket,path:object});save();
  const file=await insert('dms_document_files',{document_id:doc,storage_bucket:bucket,storage_path:object,file_name:'F03 العربية.png',mime_type:'image/png',file_size_bytes:payload.length});files.push(file);save();
 }
},60000);
afterAll(async()=>{
 const failures=[];
 for(const o of ledger.objects){const r=await state.admin.storage.from(o.bucket).remove([o.path]);if(r.error)failures.push('object '+o.path);}
 for(const id of ledger.documents){const r=await state.admin.from('dms_documents').delete().eq('id',id);if(r.error)failures.push('document '+id);}
 for(const a of ledger.accounts){const r=await state.admin.auth.admin.deleteUser(a.authId);if(r.error)failures.push('account '+a.authId);}
 for(const id of ledger.roles){await state.admin.from('role_permissions').delete().eq('role_id',id);const r=await state.admin.from('roles').delete().eq('id',id);if(r.error)failures.push('role '+id);}
 for(const l of ledger.lookups){const r=await state.admin.from(l.table).delete().eq('id',l.id);if(r.error)failures.push(l.table+' '+l.id);}
 for(const id of ledger.permissions){const r=await state.admin.from('permissions').delete().eq('id',id);if(r.error)failures.push('permission '+id);}
 ledger.cleanup=failures.length===0;ledger.cleanupFailures=failures;ledger.files=files;save();expect(failures).toEqual([]);
},60000);
const request=(id:number,disposition='inline')=>new NextRequest(`http://localhost/api/dms/file?fileId=${id}&disposition=${disposition}`);
const evidenceSpecs:[string,string[],Record<string,unknown>,[string,string]?][]=[
 ['employee_access_cards',['hr.compliance.view'],{},['access_type_id','hr_access_card_types']],
 ['employee_assets',['hr.assignments.view'],{asset_type:'other',asset_description:'F03 synthetic only'}],
 ['employee_disciplinary_records',['hr.actions.view','hr.confidential.view'],{disciplinary_type:'other',subject:'F03 synthetic only'}],
 ['employee_eos_cases',['hr.eos.view'],{eos_type:'other'}],
 ['employee_hr_actions',['hr.actions.view'],{action_type:'other',action_title:'F03 synthetic only'}],
 ['employee_identity_documents',['hr.compliance.view'],{document_number:'F03 synthetic only'},['document_type_id','hr_identity_document_types']],
 ['employee_medical_records',['hr.medical.view'],{examination_date:'2026-01-01',result:'fit'},['medical_record_type_id','hr_medical_record_types']],
 ['employee_performance_records',['hr.actions.view','hr.confidential.view'],{review_type:'other'}],
 ['employee_ppe_issues',['hr.assignments.view'],{ppe_item:'F03 synthetic only'}],
 ['employee_pro_processes',['hr.actions.view'],{process_title:'F03 synthetic only'}],
 ['employee_training_certificates',['hr.compliance.view'],{},['training_type_id','hr_training_types']],
 ['employee_dependents',['hr.compliance.view'],{dependent_name_en:'F03 synthetic only'},['relationship_type_id','hr_relationship_types']],
 ['employee_document_links',['hr.medical.view'],{related_record_type:'medical_record'}],
 ['employee_document_links',['hr.medical.view'],{related_record_type:'medical_insurance'}],
];
it.each(evidenceSpecs)('linked evidence %s / %j requires subject and separate capability after reparenting',async(table,caps,fields,lookup)=>{
 const grants:number[]=[];let child:number|undefined,lookupId:number|undefined;
 ledger.linkedEvidence??=[];
 const item:any={table,deleted:false};ledger.linkedEvidence.push(item);save();
 try {
  const values={...fields};
  if(lookup){lookupId=await insert(lookup[1],{code:run+'-'+ledger.linkedEvidence.length,name_en:'F03 synthetic only'});values[lookup[0]]=lookupId;item.lookup={table:lookup[1],id:lookupId};save();}
  child=await insert(table,{...values,employee_id:900301,[table==='employee_pro_processes'?'related_document_id':'dms_document_id']:ledger.documents[0]});item.id=child;save();
  state.client=actors.preview.client;expect((await GET(request(files[0]))).status).toBe(404);
  for(const code of ['hr.employees.view',...caps]){
   const p=await state.admin.from('permissions').select('id').eq('permission_code',code).single();expect(p.error).toBeNull();
   grants.push(await insert('role_permissions',{role_id:ledger.roles[1],permission_id:p.data.id}));
  }
  const allowed=await GET(request(files[0]));expect(allowed.status).toBe(200);expect(Buffer.from(await allowed.arrayBuffer())).toEqual(payload);
  const moved=await state.admin.from(table).update({employee_id:900305}).eq('id',child);expect(moved.error).toBeNull();
  expect((await GET(request(files[0]))).status).toBe(404);
  const restored=await state.admin.from(table).update({employee_id:900301}).eq('id',child);expect(restored.error).toBeNull();
  const revoked=await state.admin.from('role_permissions').delete().eq('id',grants.pop());expect(revoked.error).toBeNull();
  expect((await GET(request(files[0]))).status).toBe(404);pass('linked evidence '+table+' '+String(fields.related_record_type??'direct'));
 } finally {
  if(child){const r=await state.admin.from(table).delete().eq('id',child);expect(r.error).toBeNull();item.deleted=true;}
  for(const id of grants){const r=await state.admin.from('role_permissions').delete().eq('id',id);expect(r.error).toBeNull();}
  if(lookup&&lookupId){const r=await state.admin.from(lookup[1]).delete().eq('id',lookupId);expect(r.error).toBeNull();item.lookup.deleted=true;}
  save();
 }
});
it('real metadata action saves an allowed record but never claims a foreign record changed',async()=>{
 state.client=withDocumentReadPolicy(actors.metadataEditor.client);
 const good=await updateDmsDocument({id:ledger.documents[0],description:'F03 accepted metadata'});expect(good.success).toBe(true);
 const read=await getDmsDocument(ledger.documents[0]);expect(read.success).toBe(true);expect(read.data?.description).toBe('F03 accepted metadata');
 const denied=await updateDmsDocument({id:ledger.documents[3],description:'F03 forbidden change'});expect(denied.success).toBe(false);
 const check=await state.admin.from('dms_documents').select('description').eq('id',ledger.documents[3]).single();expect(check.error).toBeNull();expect(check.data.description).not.toBe('F03 forbidden change');
 pass('real metadata action positive and forbidden no-op failure');
});
it('actual reviewed upload attachment stores bytes and survives protected-column projections',async()=>{
 const temp=run+'/reviewed.png';let session:number|undefined;
 ledger.attachment={temp,cleanup:false};save();
 try {
  const up=await state.admin.storage.from('dms-temp').upload(temp,payload,{contentType:'image/png'});expect(up.error).toBeNull();ledger.objects.push({bucket:'dms-temp',path:temp});save();
  session=await insert('dms_upload_sessions',{session_code:run+'-attach',original_filename:'F03 reviewed.png',mime_type:'image/png',file_size_bytes:payload.length,temp_storage_path:temp,uploaded_by:actors.download.id,status:'uploaded',intake_status:'review_pending'});ledger.attachment.sessionId=session;save();
  state.client=withDocumentReadPolicy(actors.download.client);
  const result=await attachUploadToExistingDocument({uploadSessionId:session,documentId:ledger.documents[0],allowDuplicate:false});
  // Capture any partially created final object before assertions, for cleanup.
  const type=await state.admin.from('dms_documents').select('document_type:dms_document_types(type_code)').eq('id',ledger.documents[0]).single();
  const finalPath=`900101/${new Date().getFullYear()}/${type.data.document_type.type_code}/${ledger.documents[0]}/v1/original.png`;
  ledger.objects.push({bucket:'dms-documents',path:finalPath});ledger.attachment.result=result;save();
  expect(result.success,result.error).toBe(true);
  const delivered=await GET(request(result.data!.fileId,'attachment'));expect(delivered.status).toBe(200);expect(Buffer.from(await delivered.arrayBuffer())).toEqual(payload);
  const row=await state.admin.from('dms_upload_sessions').select('status').eq('id',session).single();expect(row.data.status).toBe('completed');
  const duplicate=await attachUploadToExistingDocument({uploadSessionId:session,documentId:ledger.documents[0],allowDuplicate:false});expect(duplicate.success).toBe(false);
  pass('actual upload attach / bytes / projection / repeated attach denial');
 } finally {
  if(session){const r=await state.admin.from('dms_upload_sessions').delete().eq('id',session);expect(r.error).toBeNull();}
  if(ledger.attachment.result?.data?.fileId){const r=await state.admin.from('dms_document_files').delete().eq('id',ledger.attachment.result.data.fileId);expect(r.error).toBeNull();}
  ledger.attachment.cleanup=true;save();
 }
});
it('unlinked intake pins owner scope, rejects tampering and does not combine foreign AI authority',async()=>{
 let session:number|undefined,queue:number|undefined;
 ledger.intake={cleanup:false};save();
 try {
  const r=await actors.combined.client.from('dms_upload_sessions').insert({session_code:run+'-intake',original_filename:'synthetic.png',mime_type:'image/png',file_size_bytes:payload.length,temp_storage_path:run+'/no-object.png',uploaded_by:actors.combined.id,owning_company_id:900102,owning_branch_id:900203,status:'uploaded'}).select('id,owning_company_id,owning_branch_id').single();
  expect(r.error).toBeNull();session=r.data.id;ledger.intake.sessionId=session;save();
  expect(r.data.owning_company_id).toBe(900101);expect(r.data.owning_branch_id).toBe(900201);
  const outsider=await actors.download.client.from('dms_upload_sessions').select('id').eq('id',session);expect(outsider.error).toBeNull();expect(outsider.data).toEqual([]);
  const reviewer=await actors.scopedAdmin.client.from('dms_upload_sessions').select('id').eq('id',session);expect(reviewer.error).toBeNull();expect(reviewer.data).toHaveLength(1);
  for(const patch of [{uploaded_by:actors.download.id},{owning_branch_id:900202},{temp_storage_path:'foreign/secret.png'}]){
   const changed=await actors.combined.client.from('dms_upload_sessions').update(patch).eq('id',session);expect(changed.error?.code).toBe('42501');
  }
  queue=await insert('dms_review_queue',{upload_session_id:session,notes:run+' private intake'});ledger.intake.queueId=queue;save();
  const bad=await actors.combined.client.from('dms_review_queue').select('id').eq('id',queue);expect(bad.error).toBeNull();expect(bad.data).toEqual([]);
  const good=await actors.scopedAdmin.client.from('dms_review_queue').select('id').eq('id',queue);expect(good.error).toBeNull();expect(good.data).toHaveLength(1);
  pass('unlinked intake ownership / pinned scope / immutable storage / combined AI authority');
 } finally {
  if(queue){const r=await state.admin.from('dms_review_queue').delete().eq('id',queue);expect(r.error).toBeNull();}
  if(session){const r=await state.admin.from('dms_upload_sessions').delete().eq('id',session);expect(r.error).toBeNull();}
  ledger.intake.cleanup=true;save();
 }
});
it('direct insurance evidence cannot bypass medical permission or employee branch scope',async()=>{
 const id=await insert('employee_medical_insurances',{employee_id:900301,insurance_provider:'F03 synthetic only',policy_number:run+'-link',expiry_date:'2027-01-01',dms_document_id:ledger.documents[0]});
 ledger.directInsurance={id,deleted:false};save();
 const grants:number[]=[];
 try {
  state.client=actors.preview.client;expect((await GET(request(files[0]))).status).toBe(404);
  const role=ledger.roles[1];
  for(const code of ['hr.employees.view','hr.medical.view']){
   const p=await state.admin.from('permissions').select('id').eq('permission_code',code).single();expect(p.error).toBeNull();
   const grant=await state.admin.from('role_permissions').insert({role_id:role,permission_id:p.data.id}).select('id').single();expect(grant.error).toBeNull();grants.push(grant.data.id);
  }
  expect((await GET(request(files[0]))).status).toBe(200);
  const transfer=await state.admin.from('employee_medical_insurances').update({employee_id:900305}).eq('id',id);expect(transfer.error).toBeNull();
  expect((await GET(request(files[0]))).status).toBe(404);pass('direct HR evidence medical permission and sibling branch boundary');
 } finally {
  const removed=await state.admin.from('employee_medical_insurances').delete().eq('id',id);expect(removed.error).toBeNull();ledger.directInsurance.deleted=true;
  for(const grant of grants){const r=await state.admin.from('role_permissions').delete().eq('id',grant);expect(r.error).toBeNull();}save();
 }
});
it('metadata listing is allowed but file content is denied without preview/download',async()=>{
 state.client=actors.metadata.client;const docs=await state.client.from('dms_documents').select('id').in('id',ledger.documents);expect(docs.error).toBeNull();expect(docs.data.map((x:any)=>x.id)).toEqual([ledger.documents[0]]);
 expect((await GET(request(files[0]))).status).toBe(403);expect((await getDmsDocumentFileSignedUrl(files[0],'download')).success).toBe(false);pass('metadata vs bytes');
});
it('creator/owner is not a confidentiality bypass',async()=>{state.client=actors.owner.client;const r=await state.client.from('dms_documents').select('id').eq('id',ledger.documents[1]);expect(r.error).toBeNull();expect(r.data).toEqual([]);expect((await GET(request(files[1]))).status).toBe(404);pass('owner confidential denial');});
it('raw OCR, summary and search vectors cannot be read directly by metadata-only users',async()=>{
 const a=await state.admin.from('dms_documents').update({ai_summary:run+' secret summary'}).eq('id',ledger.documents[0]);expect(a.error).toBeNull();
 const b=await state.admin.from('dms_document_files').update({ocr_text:run+' secret OCR'}).eq('id',files[0]);expect(b.error).toBeNull();
 for(const columns of ['ai_summary','content_tsv','summary_embedding','*']){const r=await actors.metadata.client.from('dms_documents').select(columns).eq('id',ledger.documents[0]);expect(r.error?.code).toBe('42501');}
 const raw=await actors.metadata.client.from('dms_document_files').select('ocr_text').eq('id',files[0]);expect(raw.error?.code).toBe('42501');pass('direct confidential-column reads denied');
});
it('checked metadata projection retains joins, filtering and counts but masks content',async()=>{
 const client=withDocumentReadPolicy(actors.metadata.client);
 const rows=await client.from('dms_documents').select('id,title,ai_summary,document_type:dms_document_types(name_en)',{count:'exact'}).in('id',ledger.documents);
 expect(rows.error).toBeNull();expect(rows.count).toBe(1);expect(rows.data).toHaveLength(1);expect(rows.data[0].ai_summary).toBeNull();expect(rows.data[0].document_type.name_en).toBe('F03 synthetic type');
 const file=await client.from('dms_document_files').select('id,file_name,ocr_text').eq('id',files[0]).single();expect(file.error).toBeNull();expect(file.data.ocr_text).toBeNull();
 const guessed=await client.from('dms_documents').select('id').eq('ai_summary',run+' secret summary');expect(guessed.error).toBeNull();expect(guessed.data).toEqual([]);pass('masked projection including predicate denial');
});
it('checked content projection allows legitimate preview and excludes sibling company/branch',async()=>{
 const client=withDocumentReadPolicy(actors.preview.client);const rows=await client.from('dms_documents').select('id,ai_summary').in('id',ledger.documents).order('id');
 expect(rows.error).toBeNull();expect(rows.data).toHaveLength(2);expect(rows.data[0].ai_summary).toBe(run+' secret summary');
 const file=await client.from('dms_document_files').select('ocr_text').eq('id',files[0]).single();expect(file.error).toBeNull();expect(file.data.ocr_text).toBe(run+' secret OCR');pass('scoped content projection positive');
});
it('checked document pagination preserves exact counts and does not include foreign subjects',async()=>{
 const client=withDocumentReadPolicy(actors.preview.client);
 const query=()=>client.from('dms_documents').select('id',{count:'exact'}).in('id',ledger.documents).order('id');
 const a=await query().range(0,0),b=await query().range(1,1),c=await query().range(2,2);
 for(const r of [a,b,c]){expect(r.error).toBeNull();expect(r.count).toBe(2);}
 expect(a.data).toEqual([{id:ledger.documents[0]}]);expect(b.data).toEqual([{id:ledger.documents[1]}]);expect(c.data).toEqual([]);
 pass('checked projection offset pagination / exact count / foreign subject exclusion');
});
it('metadata edit cannot overwrite hidden OCR or summary, including write-only REST calls',async()=>{
 const client=actors.metadataEditor.client;
 for(const [table,id,patch] of [
  ['dms_documents',ledger.documents[0],{ai_summary:'forged hidden summary'}],
  ['dms_document_files',files[0],{ocr_text:'forged hidden OCR'}],
 ] as const){const r=await client.from(table).update(patch).eq('id',id);expect(r.error?.code).toBe('42501');}
 const doc=await state.admin.from('dms_documents').select('ai_summary').eq('id',ledger.documents[0]).single();
 expect(doc.data.ai_summary).toBe(run+' secret summary');pass('metadata-only derived content writes denied');
});
it('ordinary metadata edits preserve hidden content and report one actual changed row',async()=>{
 const r=await actors.metadataEditor.client.from('dms_documents').update({description:'F03 harmless metadata edit'}).eq('id',ledger.documents[0]).select('id').single();
 expect(r.error).toBeNull();expect(r.data.id).toBe(ledger.documents[0]);
 const d=await state.admin.from('dms_documents').select('ai_summary').eq('id',ledger.documents[0]).single();expect(d.data.ai_summary).toBe(run+' secret summary');pass('metadata edit preserves protected content');
});
it('a scoped content editor can maintain OCR and summary, but cannot forge the search index',async()=>{
 const client=actors.download.client;
 const d=await client.from('dms_documents').update({ai_summary:'F03 authorized summary'}).eq('id',ledger.documents[0]).select('id').single();expect(d.error).toBeNull();
 const f=await client.from('dms_document_files').update({ocr_text:'F03 authorized OCR'}).eq('id',files[0]).select('id').single();expect(f.error).toBeNull();
 const t=await client.from('dms_documents').update({content_tsv:"'forgedindex':1"}).eq('id',ledger.documents[0]);expect(t.error).toBeNull();
 const after=await state.admin.from('dms_documents').select('content_tsv').eq('id',ledger.documents[0]).single();expect(after.error).toBeNull();expect(after.data.content_tsv).not.toContain('forgedindex');
 expect(after.data.content_tsv).toContain('authorized');pass('scoped content edit positive / search vector derived');
});
it('file metadata cannot be repointed to another document or another storage object',async()=>{
 for(const patch of [{document_id:ledger.documents[1]},{storage_path:ledger.objects[1].path},{storage_bucket:'erp-generated-pdfs'}]){
  const r=await actors.download.client.from('dms_document_files').update(patch).eq('id',files[0]);expect(r.error?.code).toBe('42501');
 }
 pass('file binding immutable to human metadata edits');
});
it('new human uploads must bind to the canonical document/company path and return only allowed columns',async()=>{
 const base={document_id:ledger.documents[0],storage_bucket:'dms-documents',file_name:'F03 upload.png',mime_type:'image/png',file_size_bytes:payload.length};
 const invalid=await actors.download.client.from('dms_document_files').insert({...base,storage_path:`900102/2026/F03/${ledger.documents[3]}/v1/original.png`}).select('id');
 expect(invalid.error?.code).toBe('42501');
 const storagePath=`900101/2026/F03/${ledger.documents[0]}/v1/original.png`;
 const up=await state.admin.storage.from('dms-documents').upload(storagePath,payload,{contentType:'image/png'});expect(up.error).toBeNull();ledger.objects.push({bucket:'dms-documents',path:storagePath});save();
 const valid=await actors.download.client.from('dms_document_files').insert({...base,storage_path:storagePath}).select('id').single();expect(valid.error).toBeNull();
 expect(valid.data.id).toBeGreaterThan(0);
 const removed=await state.admin.from('dms_document_files').delete().eq('id',valid.data.id);expect(removed.error).toBeNull();pass('canonical upload positive / foreign pointer denied / minimal return');
});
it('revoking access during Storage I/O prevents the pending response from returning bytes',async()=>{
 const admin=state.admin,assignment=await admin.from('user_roles').select('id').eq('user_profile_id',actors.preview.id).single();expect(assignment.error).toBeNull();
 const storage=admin.storage;
 state.admin=new Proxy(admin,{get(target,key,receiver){
  if(key==='storage')return {from:(bucket:string)=>{const scoped=storage.from(bucket);return new Proxy(scoped,{get(b,k,r){
   if(k==='download')return async(object:string)=>{const result=await b.download(object);const revoked=await admin.from('user_roles').update({is_active:false}).eq('id',assignment.data.id);expect(revoked.error).toBeNull();return result;};
   const value=Reflect.get(b,k,r);return typeof value==='function'?value.bind(b):value;
  }});}};
  const value=Reflect.get(target,key,receiver);return typeof value==='function'?value.bind(target):value;
 }});
 try {state.client=actors.preview.client;expect((await GET(request(files[1]))).status).toBe(403);pass('post-storage revocation blocks in-flight byte response');}
 finally {state.admin=admin;const restored=await admin.from('user_roles').update({is_active:true}).eq('id',assignment.data.id);expect(restored.error).toBeNull();}
});
it('legitimate scoped preview returns actual bytes and Unicode-safe headers',async()=>{state.client=actors.preview.client;const r=await GET(request(files[1]));expect(r.status).toBe(200);expect(Buffer.from(await r.arrayBuffer())).toEqual(payload);expect(r.headers.get('Content-Disposition')).toContain("filename*=UTF-8''");expect(r.headers.get('Cache-Control')).toBe('private, no-store');pass('actual preview bytes / headers');});
it('preview does not imply download permission',async()=>{state.client=actors.preview.client;expect((await GET(request(files[1],'attachment'))).status).toBe(403);pass('separate download permission');});
it('sibling branch and other company files are denied by both row and byte paths',async()=>{state.client=actors.download.client;for(const i of [2,3]){expect((await GET(request(files[i],'attachment'))).status).toBe(404);expect((await getDmsDocumentFileSignedUrl(files[i],'download')).success).toBe(false);}pass('branch/company byte boundaries');});
it('combined roles cannot borrow a different company download grant',async()=>{state.client=actors.combined.client;expect((await GET(request(files[1],'attachment'))).status).toBe(403);pass('combined-role action scope');});
it('new URL is session-bound and requesting it is not logged as a download',async()=>{state.client=actors.download.client;const before=await state.admin.from('dms_document_events').select('id',{count:'exact',head:true}).eq('document_id',ledger.documents[1]);
 const r=await getDmsDocumentFileSignedUrl(files[1],'download');expect(r.success).toBe(true);expect(r.data?.signedUrl).toBe(`/api/dms/file?fileId=${files[1]}&disposition=attachment`);expect(r.data?.expiresIn).toBe(0);
 const after=await state.admin.from('dms_document_events').select('id',{count:'exact',head:true}).eq('document_id',ledger.documents[1]);expect(after.count).toBe(before.count);pass('authenticated URL / no fake delivery event');});
it('authorized download serves bytes and records server delivery',async()=>{state.client=actors.download.client;const r=await GET(request(files[1],'attachment'));expect(r.status).toBe(200);expect(Buffer.from(await r.arrayBuffer())).toEqual(payload);
 const events=await state.admin.from('dms_document_events').select('metadata_json').eq('document_id',ledger.documents[1]).eq('event_type','file_downloaded');expect(events.data.some((e:any)=>e.metadata_json.delivery==='server_response')).toBe(true);pass('download bytes / audit');});
it('changing an action or file identifier cannot bypass validation',async()=>{state.client=actors.download.client;expect((await GET(request(-1))).status).toBe(400);expect((await GET(request(files[1],'anything'))).status).toBe(400);expect((await getDmsDocumentFileSignedUrl(files[1],'anything' as any)).success).toBe(false);pass('invalid file/action denial');});
it('classification cannot be downgraded with ordinary edit permission',async()=>{state.client=actors.download.client;const r=await state.client.from('dms_documents').update({confidentiality_level:'internal'}).eq('id',ledger.documents[1]);expect(!!r.error).toBe(true);pass('classification protected');});
it('legacy semantic summary search respects checked content, not the browser admin flag',async()=>{
 const vector='['+Array.from({length:1536},(_,i)=>i===0?1:0).join(',')+']';
 for(const id of ledger.documents){const r=await state.admin.from('dms_documents').update({summary_embedding:vector,ai_summary:'F03 search '+id}).eq('id',id);expect(r.error).toBeNull();}
 for(const [name,expected] of [['metadata',[]],['preview',ledger.documents.slice(0,2)]] as const){
  const r=await actors[name].client.rpc('search_dms_documents_by_embedding',{p_query_embedding:vector,p_match_count:50,p_match_threshold:0.9,p_is_admin:true});
  expect(r.error).toBeNull();expect(r.data.map((d:any)=>d.document_id).sort((a:number,b:number)=>a-b)).toEqual([...expected].sort((a,b)=>a-b));
 }
 pass('semantic search checked projection / no caller admin bypass');
});
it('chunk search returns scoped confidential snippets only with content permission',async()=>{
 const vector='['+Array.from({length:1536},(_,i)=>i===0?1:0).join(',')+']';
 for(const id of ledger.documents){const r=await state.admin.from('dms_document_content_chunks').insert({document_id:id,chunk_index:0,chunk_text:'F03 synthetic snippet',chunk_hash:run+'-'+id,content_hash:run,char_count:21,embedding_status:'complete',embedding:vector});expect(r.error).toBeNull();}
 for(const flag of [false,true]) for(const [name,expected] of [['metadata',[]],['preview',ledger.documents.slice(0,2)]] as const){
  const r=await actors[name].client.rpc('search_dms_document_chunks_by_embedding',{p_query_embedding:vector,p_match_threshold:0.9,p_is_admin:flag});
  expect(r.error).toBeNull();expect(r.data.map((d:any)=>d.document_id).sort((a:number,b:number)=>a-b)).toEqual([...expected].sort((a,b)=>a-b));
 }
 pass('semantic chunk positive/negative and untrusted admin flags');
});
it('a combined role cannot use foreign DMS admin authority to remove local-company bytes',async()=>{
 state.client=actors.combined.client;
 expect((await adminDeleteDmsDocumentFile(files[0])).success).toBe(false);
 expect((await adminHardDeleteDmsFile(files[0])).success).toBe(false);
 const o=ledger.objects[0],r=await state.admin.storage.from(o.bucket).download(o.path);expect(r.error).toBeNull();expect(Buffer.from(await r.data.arrayBuffer())).toEqual(payload);
 pass('cross-assignment storage deletion denied before service operation');
});
it('scoped file administration lists its deleted files but no sibling branch or company',async()=>{
 const changed=await state.admin.from('dms_document_files').update({deleted_at:new Date().toISOString()}).in('id',files);expect(changed.error).toBeNull();
 try {
  state.client=withDocumentReadPolicy(actors.scopedAdmin.client);const r=await adminListDmsFiles({includeDeleted:true});expect(r.success).toBe(true);
  expect(r.data?.rows.map((f:any)=>f.id).sort((a:number,b:number)=>a-b)).toEqual(files.slice(0,2).sort((a,b)=>a-b));
  const noDeleted=await adminListDmsFiles({includeDeleted:false});expect(noDeleted.success).toBe(true);expect(noDeleted.data?.rows).toEqual([]);
  state.client=actors.combined.client;const denied=await adminListDmsFiles({includeDeleted:true});expect(denied.success).toBe(true);expect(denied.data?.rows).toEqual([]);
  pass('deleted file admin listing retains scoped boundaries');
 } finally {const r=await state.admin.from('dms_document_files').update({deleted_at:null}).in('id',files);expect(r.error).toBeNull();}
});
it('stored authenticated URLs stop working immediately after role revocation',async()=>{const r=await state.admin.from('user_roles').update({is_active:false}).eq('id',downloadGrant);expect(r.error).toBeNull();state.client=actors.download.client;expect((await GET(request(files[1],'attachment'))).status).toBe(403);pass('new-request immediate revocation');});
it('anonymous access to the authenticated endpoint is denied',async()=>{state.client=sdk(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});expect((await GET(request(files[1],'attachment'))).status).toBe(401);pass('anonymous denial');});
it('legacy signed bearer links reject tampering and expire (not immediate role revocation)',async()=>{const o=ledger.objects[1];const signed=await state.admin.storage.from(o.bucket).createSignedUrl(o.path,1);expect(signed.error).toBeNull();const url=new URL(signed.data.signedUrl);expect(url.origin).toBe(config.API_URL);
 const valid=await fetch(url);expect(valid.ok).toBe(true);const tampered=new URL(url);tampered.searchParams.set('token','invalid');expect((await fetch(tampered)).ok).toBe(false);
 await new Promise(resolve=>setTimeout(resolve,2200));expect((await fetch(url)).ok).toBe(false);pass('legacy bearer valid/tampered/expired; no retroactive revocation claim');});

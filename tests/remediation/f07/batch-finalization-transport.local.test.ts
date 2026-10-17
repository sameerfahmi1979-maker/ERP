// Owned real Data/Storage APIs, genuine PDF bytes, synthetic Auth bootstrap and
// provider output. No browser, live documents, worker or real AI invocation.
import {beforeAll,expect,it,vi} from 'vitest';import {createClient,type SupabaseClient} from '@supabase/supabase-js';import {createHash} from 'node:crypto';
import type {AiApprovalInput} from '@/lib/dms/numbered-ai-approval';
const s=vi.hoisted(()=>({user:null as unknown as SupabaseClient,admin:null as unknown as SupabaseClient,lost:false,session:0,document:0,analysis:0,
 finalUploads:0,failures:[] as Array<{path:string;code?:string;message?:string}>}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>s.user}));vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>s.admin}));
vi.mock('next/cache',()=>({revalidatePath:()=>undefined}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:7001,auth_user_id:'a7000000-0000-4000-8000-000000000001'},isAccountActive:true}),canUseApplication:()=>true,hasPermission:()=>true}));
import {verifyTemporaryUpload} from '@/server/dms-temp-upload-verification';
import {verifyAndAttestIntakeSource} from '@/server/dms-intake-source-attestation';
import {prepareExactIntakeReview,confirmExactIntakeReview} from '@/server/actions/dms/intake-review';
import {finalizeRetainedBatch} from '@/server/dms-retained-batch-finalization';
import {syntheticPdf} from './document-fixtures';
const pdf=syntheticPdf(),hash=createHash('sha256').update(pdf).digest('hex');
let path='';let request:AiApprovalInput;
beforeAll(async()=>{
 expect(process.env.F07_REVIEW_NATIVE).toBe('owned-local-only');const url=process.env.F07_REVIEW_URL!;expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
 const make=(token:string,inject=false)=>createClient(url,token,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`},fetch:async(input,init)=>{
  if(init?.method==='POST'&&String(input).includes('/storage/v1/object/dms-documents/'))s.finalUploads++;
  const r=await fetch(input,init);if(!r.ok&&String(input).includes('/rpc/')){const e=await r.clone().json();s.failures.push({path:new URL(String(input)).pathname,code:e.code,message:e.message});}
  if(inject&&s.lost&&r.ok&&String(input).includes('/rpc/approve_dms_ai_intake')){s.lost=false;await r.arrayBuffer();throw Error('Synthetic successful commit reply lost');}return r;
 }}});
 s.user=make(process.env.F07_REVIEW_USER_TOKEN!,true);s.admin=make(process.env.F07_REVIEW_SERVICE_TOKEN!);
 for(const bucket of ['dms-temp','dms-documents'])expect((await s.admin.storage.createBucket(bucket,{public:false})).error).toBeNull();
 const admission=await s.user.rpc('admit_dms_upload_batch',{p_operation:'d7000000-0000-4000-8000-000000000001',p_request:{version:1,context:{type:'company',id:7001},files:[{position:0,original_filename:'synthetic.pdf',mime_type:'application/pdf',file_size_bytes:pdf.length,sha256_hash:hash}],revision:null}});
 expect(admission.error).toBeNull();s.session=admission.data.receipt.members[0].id;
 const source=await s.user.from('dms_upload_sessions').select('temp_storage_path').eq('id',s.session).single();expect(source.error).toBeNull();path=source.data!.temp_storage_path;
 // This is a trusted byte upload to the exact admitted original path, not a
 // claim that the owner's native file picker or signed-upload UI was tested.
 expect((await s.admin.storage.from('dms-temp').upload(path,new Blob([pdf],{type:'application/pdf'}),{contentType:'application/pdf',upsert:false})).error).toBeNull();
 expect(await verifyTemporaryUpload(s.session)).toMatchObject({success:true});
});
it('retains actual parsed original bytes and Storage identity before analysis',async()=>{const r=await verifyAndAttestIntakeSource(s.user,s.admin,s.session);expect(r.bytes).toEqual(pdf);expect(r.proof.sha256).toBe(hash);});
it('creates one genuine numbered F06 batch draft from synthetic attested analysis',async()=>{
 const j=await s.user.from('dms_ai_extraction_jobs').insert({upload_session_id:s.session,job_type:'classify_extract',status:'pending',created_by:7001,provider:'SYNTHETIC_NO_PROVIDER_CALL'}).select('id').single();expect(j.error).toBeNull();
 expect((await s.user.from('dms_ai_extraction_jobs').update({status:'complete'}).eq('id',j.data!.id)).error).toBeNull();
 const expected={job_id:j.data!.id,upload_session_id:s.session,result_type:'combined',ai_status:'pending_review',suggested_document_type_id:7001,
  classification_confidence:'high',classification_score:0.99,classification_reason:'Synthetic only',extracted_fields_json:{},field_confidence_json:{},suggested_links_json:[],
  issue_date_suggestion:null,expiry_date_suggestion:'2027-01-01',suggested_title:'Synthetic batch draft',suggested_description:null,raw_response_json:{synthetic:true},raw_ocr_text:'Synthetic bounded byte evidence'};
 const a=await s.user.from('dms_ai_extraction_results').insert(expected).select('id').single();expect(a.error).toBeNull();s.analysis=a.data!.id;
 expect((await s.admin.rpc('f07_attest_intake_analysis',{p_session:s.session,p_actor:7001,p_auth_session:'b7000000-0000-4000-8000-000000000001',p_result:s.analysis,p_expected:expected})).error).toBeNull();
 expect((await s.user.from('dms_upload_sessions').update({ai_result_id:s.analysis,ai_job_id:j.data!.id,intake_status:'review_pending'}).eq('id',s.session)).error).toBeNull();
 const p=await s.user.rpc('prepare_recoverable_dms_batch_draft',{p_session:s.session});expect(p.error,JSON.stringify(s.failures)).toBeNull();
 const d=await s.user.rpc('create_numbered_dms_batch_draft',{p_operation:p.data.member.draft_operation_id,p_request:p.data.member.request});expect(d.error,JSON.stringify(s.failures)).toBeNull();s.document=d.data.documentId;
 expect((await s.user.rpc('create_numbered_dms_batch_draft',{p_operation:p.data.member.draft_operation_id,p_request:p.data.member.request})).data).toMatchObject({documentId:s.document,replayed:true});
 request={uploadSessionId:s.session,title:'Synthetic finalized batch',description:null,documentTypeId:7001,confidentialityLevel:'company',owningCompanyId:7001,owningBranchId:null,
  partyId:null,issueDate:null,expiryDate:'2027-01-01',metadataValues:[],tagIds:[],links:[],aiResultId:s.analysis,standardFileName:'F07-SYNTHETIC.pdf',allowDuplicate:false};
});
it('still requires explicit human confirmation for the exact file',async()=>{
 const denied=await finalizeRetainedBatch(s.user,s.admin,request,'F07-SYNTHETIC.pdf',7001);expect(denied).toMatchObject({success:false,uncertain:true});expect(s.finalUploads).toBe(0);
 const p=await prepareExactIntakeReview({sessionId:s.session,typeId:7001,expiryDate:'2027-01-01'});expect(p,JSON.stringify(s.failures)).toMatchObject({success:true,data:{requiresOverride:false}});if(!p.success)throw Error('No review');
 expect(await confirmExactIntakeReview({...p.data,confirmed:true,override:false,reasonText:null})).toEqual({success:true});
});
it('lost successful commit reply replays one version and never recopy/reprocesses',async()=>{
 s.lost=true;expect(await finalizeRetainedBatch(s.user,s.admin,request,'F07-SYNTHETIC.pdf',7001)).toMatchObject({success:false,uncertain:true});expect(s.lost,JSON.stringify(s.failures)).toBe(false);
 const uploads=s.finalUploads;expect(uploads).toBe(1);
 expect(await finalizeRetainedBatch(s.user,s.admin,request,'Different later name.pdf',7001),JSON.stringify(s.failures)).toMatchObject({success:true,replayed:true,data:{documentId:s.document}});expect(s.finalUploads).toBe(uploads);
});
it('retains exact final/original bytes and one canonical run/history',async()=>{
 const files=await s.admin.from('dms_document_files').select('id,storage_bucket,storage_path,sha256_hash').eq('document_id',s.document).is('deleted_at',null);expect(files.error).toBeNull();expect(files.data).toHaveLength(1);expect(files.data![0].sha256_hash).toBe(hash);
 const copy=await s.admin.storage.from(files.data![0].storage_bucket).download(files.data![0].storage_path);expect(copy.error).toBeNull();expect(Buffer.from(await copy.data!.arrayBuffer())).toEqual(pdf);
 const original=await s.admin.storage.from('dms-temp').download(path);expect(original.error).toBeNull();expect(Buffer.from(await original.data!.arrayBuffer())).toEqual(pdf);
 expect((await s.admin.from('dms_approve_runs').select('id,status').eq('upload_session_id',s.session)).data).toHaveLength(1);
 expect((await s.admin.from('dms_document_versions').select('id').eq('document_id',s.document)).data).toHaveLength(1);
 expect((await s.user.rpc('f07_recover_batch_finalization',{p_session:s.session})).data).toEqual(request);
});
it('changed retry wording cannot become a new successful finalization',async()=>{expect(await finalizeRetainedBatch(s.user,s.admin,{...request,title:'Changed retry'},'F07-SYNTHETIC.pdf',7001)).toMatchObject({success:false,uncertain:true});expect(s.finalUploads).toBe(1);});
it('current edit revocation blocks receipt replay and request discovery',async()=>{expect((await s.admin.from('role_permissions').delete().eq('role_id',7001).eq('permission_id',7003)).error).toBeNull();expect(await finalizeRetainedBatch(s.user,s.admin,request,'F07-SYNTHETIC.pdf',7001)).toMatchObject({success:false,uncertain:true});expect((await s.user.rpc('f07_recover_batch_finalization',{p_session:s.session})).error).toMatchObject({code:'42501'});expect(s.finalUploads).toBe(1);});

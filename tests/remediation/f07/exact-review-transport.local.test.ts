// Real owned Data/Storage APIs. Auth bootstrap and Next cache are offline ports.
// Provider output below is deliberately synthetic, never a real AI invocation.
import {beforeAll,expect,it,vi} from 'vitest';import {createClient,type SupabaseClient} from '@supabase/supabase-js';import {createHash} from 'node:crypto';
const s=vi.hoisted(()=>({user:null as unknown as SupabaseClient,admin:null as unknown as SupabaseClient,lost:false,losePrepare:false,session:0,failures:[] as Array<{path:string;code?:string;message?:string}>}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>s.user}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>s.admin}));
vi.mock('next/cache',()=>({revalidatePath:()=>undefined}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:7001,auth_user_id:'a7000000-0000-4000-8000-000000000001'},isAccountActive:true}),canUseApplication:()=>true,hasPermission:()=>true}));
import {admitSingleUpload} from '@/server/dms-single-upload-admission';
import {verifyTemporaryUpload} from '@/server/dms-temp-upload-verification';
import {verifyAndAttestIntakeSource} from '@/server/dms-intake-source-attestation';
import {prepareExactIntakeReview,confirmExactIntakeReview} from '@/server/actions/dms/intake-review';
import {attachVerifiedDocumentVersion} from '@/server/dms-version-attachment';
import {readOriginalAttachmentRequests} from '@/server/actions/dms/document-upload-attach';
import {syntheticPdf} from './document-fixtures';
vi.mock('@/server/actions/dms/standard-file-name',()=>({resolveStandardFileNameForExistingDocument:async()=> 'F07-SYNTHETIC-EXACT.pdf'}));
const pdf=syntheticPdf(),hash=createHash('sha256').update(pdf).digest('hex');
beforeAll(async()=>{
 expect(process.env.F07_REVIEW_NATIVE).toBe('owned-local-only');const url=process.env.F07_REVIEW_URL!;expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
 const make=(token:string,inject=false)=>createClient(url,token,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`},fetch:async(input,init)=>{
  const r=await fetch(input,init);if(!r.ok&&String(input).includes('/rpc/')){const error=await r.clone().json();s.failures.push({path:new URL(String(input)).pathname,code:error.code,message:error.message});}
  if(inject&&s.losePrepare&&r.ok&&String(input).includes('/rpc/f07_prepare_attachment')){s.losePrepare=false;await r.arrayBuffer();throw Error('Synthetic response loss after actual admission');}
  if(inject&&s.lost&&r.ok&&String(input).includes('/rpc/f07_finish_attachment')){s.lost=false;await r.arrayBuffer();throw Error('Synthetic response loss after actual commit');}return r;
 }}});
 s.user=make(process.env.F07_REVIEW_USER_TOKEN!,true);s.admin=make(process.env.F07_REVIEW_SERVICE_TOKEN!);
 for(const bucket of ['dms-temp','dms-documents']){const existing=await s.admin.storage.getBucket(bucket);if(existing.error)expect((await s.admin.storage.createBucket(bucket,{public:false})).error).toBeNull();else expect(existing.data).toMatchObject({id:bucket,public:false});}
 const r=await admitSingleUpload({original_filename:'exact-synthetic.pdf',mime_type:'application/pdf',file_size_bytes:pdf.length,sha256_hash:hash,context:{entityType:'company',entityId:7001}},
  {operationId:'f7000000-0000-4000-8000-000000000001',authUserId:'a7000000-0000-4000-8000-000000000001'});
 expect(r.success,r.error).toBe(true);if(!r.success||!r.data)throw Error('Missing synthetic admission');s.session=r.data.session.id;
 expect((await s.user.storage.from('dms-temp').uploadToSignedUrl(r.data.path,r.data.token,new Blob([pdf],{type:'application/pdf'}),{contentType:'application/pdf',upsert:false})).error).toBeNull();
 expect(await verifyTemporaryUpload(s.session)).toMatchObject({success:true});
});
let plan:Awaited<ReturnType<typeof prepareExactIntakeReview>>;
it('captures actual parsed original bytes and immutable Storage identity',async()=>{const r=await verifyAndAttestIntakeSource(s.user,s.admin,s.session);expect(r.proof.sha256).toBe(hash);expect(r.bytes).toEqual(pdf);expect(r.object.version).toBeTruthy();});
it('a review-pending marker cannot substitute for trusted provider evidence',async()=>{expect((await s.user.from('dms_upload_sessions').update({intake_status:'review_pending'}).eq('id',s.session)).error).toBeNull();plan=await prepareExactIntakeReview({sessionId:s.session,documentId:7001});expect(plan).toMatchObject({success:true,data:{requiresOverride:true,canOverride:false}});expect(await attachVerifiedDocumentVersion({uploadSessionId:s.session,documentId:7001})).toMatchObject({success:false,uncertain:false});});
it('binds a synthetic service-attested result to the actual original object',async()=>{
 const j=await s.user.from('dms_ai_extraction_jobs').insert({upload_session_id:s.session,job_type:'classify_extract',status:'pending',created_by:7001,provider:'SYNTHETIC_NO_PROVIDER_CALL'}).select('id').single();expect(j.error).toBeNull();
 expect((await s.user.from('dms_ai_extraction_jobs').update({status:'processing'}).eq('id',j.data!.id)).error).toBeNull();
 expect((await s.user.from('dms_ai_extraction_jobs').update({status:'complete'}).eq('id',j.data!.id)).error).toBeNull();
 const payload={job_id:j.data!.id,upload_session_id:s.session,result_type:'combined',ai_status:'pending_review',suggested_document_type_id:7001,
  classification_confidence:'high',classification_score:0.99,classification_reason:'Synthetic test only',extracted_fields_json:{},field_confidence_json:{},suggested_links_json:[],
  issue_date_suggestion:null,expiry_date_suggestion:'2027-01-01',suggested_title:'Synthetic only',suggested_description:null,raw_response_json:{synthetic:true},raw_ocr_text:'Synthetic controlled parser evidence'};
 const a=await s.user.from('dms_ai_extraction_results').insert(payload).select('id').single();expect(a.error).toBeNull();
 const proof=await s.admin.rpc('f07_attest_intake_analysis',{p_session:s.session,p_actor:7001,p_auth_session:'b7000000-0000-4000-8000-000000000001',p_result:a.data!.id,p_expected:payload});expect(proof.error).toBeNull();
 expect((await s.user.from('dms_upload_sessions').update({ai_result_id:a.data!.id,ai_job_id:j.data!.id,intake_status:'review_pending'}).eq('id',s.session)).error).toBeNull();
 plan=await prepareExactIntakeReview({sessionId:s.session,documentId:7001});expect(plan).toMatchObject({success:true,data:{requiresOverride:false}});
});
it('an eligible actual file still cannot attach without explicit confirmation',async()=>{expect(await attachVerifiedDocumentVersion({uploadSessionId:s.session,documentId:7001})).toMatchObject({success:false,uncertain:false});});
it('confirmation is explicit, idempotent and tied to destination type/date',async()=>{if(!plan.success)throw Error('No review');const input={...plan.data,confirmed:true,override:false,reasonText:null};expect(await confirmExactIntakeReview({...input,confirmed:false})).toMatchObject({success:false});expect(await confirmExactIntakeReview(input)).toEqual({success:true});expect(await confirmExactIntakeReview(input)).toEqual({success:true});});
it('an interrupted admission is discovered with unchanged original wording on reopen',async()=>{
 s.losePrepare=true;expect(await attachVerifiedDocumentVersion({uploadSessionId:s.session,documentId:7001,changeNotes:'F07 exact-source synthetic transition'})).toMatchObject({success:false,uncertain:true});expect(s.losePrepare).toBe(false);
 const r=await readOriginalAttachmentRequests({uploadSessionId:s.session});expect(r,JSON.stringify(s.failures)).toMatchObject({success:true,data:{pendingCount:1,totalCount:1,rows:[{uploadSessionId:s.session,documentId:7001,changeNotes:'F07 exact-source synthetic transition',versionLabel:null,completed:false,unavailable:false}]}});
});
it('post-commit response loss recovers one actual version and retained original bytes',async()=>{
 s.lost=true;const input={uploadSessionId:s.session,documentId:7001,changeNotes:'F07 exact-source synthetic transition'};
 expect(await attachVerifiedDocumentVersion(input),JSON.stringify(s.failures)).toMatchObject({success:false,uncertain:true});
 const recovered=await readOriginalAttachmentRequests({documentId:7001});expect(recovered).toMatchObject({success:true,data:{pendingCount:0,totalCount:1,rows:[{completed:true,changeNotes:input.changeNotes}]}});
 const originalRequest=recovered.data?.rows[0];if(!originalRequest||originalRequest.unavailable)throw Error('Original request missing');
 const r=await attachVerifiedDocumentVersion({uploadSessionId:originalRequest.uploadSessionId,documentId:originalRequest.documentId,changeNotes:originalRequest.changeNotes??undefined,versionLabel:originalRequest.versionLabel??undefined});expect(r,JSON.stringify(s.failures)).toMatchObject({success:true,data:{documentId:7001,uploadSessionId:s.session,replayed:true}});
 const files=await s.admin.from('dms_document_files').select('id,sha256_hash,storage_bucket,storage_path,version_id').eq('document_id',7001).is('deleted_at',null);expect(files.error).toBeNull();expect(files.data).toHaveLength(1);expect(files.data![0].sha256_hash).toBe(hash);
 const bytes=await s.admin.storage.from(files.data![0].storage_bucket).download(files.data![0].storage_path);expect(bytes.error).toBeNull();expect(Buffer.from(await bytes.data!.arrayBuffer())).toEqual(pdf);
 const original=await s.admin.from('dms_upload_sessions').select('temp_storage_path').eq('id',s.session).single();expect((await s.admin.storage.from('dms-temp').download(original.data!.temp_storage_path)).error).toBeNull();
});
it('current permission revocation still blocks a completed receipt and hides its wording',async()=>{expect((await s.admin.from('role_permissions').delete().eq('role_id',7001).eq('permission_id',7003)).error).toBeNull();expect(await attachVerifiedDocumentVersion({uploadSessionId:s.session,documentId:7001,changeNotes:'F07 exact-source synthetic transition'})).toMatchObject({success:false,uncertain:false});const r=await readOriginalAttachmentRequests({uploadSessionId:s.session});expect(r).toMatchObject({success:true,data:{rows:[{unavailable:true,completed:true}]}});expect(JSON.stringify(r)).not.toContain('F07 exact-source synthetic transition');});

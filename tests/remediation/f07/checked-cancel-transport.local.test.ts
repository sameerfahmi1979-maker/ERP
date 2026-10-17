// Actual owned local Data/Storage APIs; no browser, provider or email.
import {beforeAll,expect,it,vi} from 'vitest';import {createClient,type SupabaseClient} from '@supabase/supabase-js';import {createHash} from 'node:crypto';
const s=vi.hoisted(()=>({user:null as unknown as SupabaseClient,admin:null as unknown as SupabaseClient,session:0,path:'',lostCancel:false,losePrepare:false}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>s.user}));vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>s.admin}));vi.mock('next/cache',()=>({revalidatePath:()=>undefined}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:7001,auth_user_id:'a7000000-0000-4000-8000-000000000001'},isAccountActive:true}),canUseApplication:()=>true,hasPermission:()=>true}));
import {admitSingleUpload} from '@/server/dms-single-upload-admission';import {verifyTemporaryUpload} from '@/server/dms-temp-upload-verification';
import {prepareExactIntakeReview,confirmExactIntakeReview} from '@/server/actions/dms/intake-review';import {attachVerifiedDocumentVersion} from '@/server/dms-version-attachment';
import {readOriginalAttachmentRequests,cancelOriginalAttachmentRequest} from '@/server/actions/dms/document-upload-attach';import {syntheticPdf} from './document-fixtures';
const pdf=syntheticPdf('Synthetic cancellation retained source'),hash=createHash('sha256').update(pdf).digest('hex');let operationId:string;
beforeAll(async()=>{
 expect(process.env.F07_REVIEW_NATIVE).toBe('owned-local-only');const url=process.env.F07_REVIEW_URL!;expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
 const make=(token:string,inject=false)=>createClient(url,token,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`},fetch:async(input,init)=>{
  const r=await fetch(input,init);if(inject&&s.losePrepare&&r.ok&&String(input).includes('/rpc/f07_prepare_attachment')){s.losePrepare=false;await r.arrayBuffer();throw Error('Synthetic lost admission response');}
  if(inject&&s.lostCancel&&r.ok&&String(input).includes('/rpc/f07_discard_intake')){s.lostCancel=false;await r.arrayBuffer();throw Error('Synthetic lost cancellation response');}return r;
 }}});
 s.user=make(process.env.F07_REVIEW_USER_TOKEN!,true);s.admin=make(process.env.F07_REVIEW_SERVICE_TOKEN!);
 expect((await s.admin.storage.createBucket('dms-temp',{public:false})).error).toBeNull();
 const r=await admitSingleUpload({original_filename:'cancel-synthetic.pdf',mime_type:'application/pdf',file_size_bytes:pdf.length,sha256_hash:hash,context:{entityType:'company',entityId:7001}},
 {operationId:'f7000000-0000-4000-8000-000000000031',authUserId:'a7000000-0000-4000-8000-000000000001'});
 expect(r.success,r.error).toBe(true);if(!r.success||!r.data)throw Error('No synthetic source');s.session=r.data.session.id;s.path=r.data.path;
 expect((await s.user.storage.from('dms-temp').uploadToSignedUrl(s.path,r.data.token,new Blob([pdf],{type:'application/pdf'}),{contentType:'application/pdf',upsert:false})).error).toBeNull();expect(await verifyTemporaryUpload(s.session)).toMatchObject({success:true});
 expect((await s.user.from('dms_upload_sessions').update({intake_status:'review_pending'}).eq('id',s.session)).error).toBeNull();
});
it('binds an explicit scoped manual exception to the actual original bytes',async()=>{
 const plan=await prepareExactIntakeReview({sessionId:s.session,documentId:7001});expect(plan).toMatchObject({success:true,data:{requiresOverride:true,canOverride:true}});if(!plan.success)throw Error('No review');
 expect(await confirmExactIntakeReview({...plan.data,confirmed:true,override:true,reasonText:'Synthetic original file inspected; explicit manual classification without provider output'})).toEqual({success:true});
});
it('discovers an original request after its successful admission response is lost',async()=>{
 s.losePrepare=true;expect(await attachVerifiedDocumentVersion({uploadSessionId:s.session,documentId:7001,changeNotes:'Synthetic cancellation original'})).toMatchObject({success:false,uncertain:true});expect(s.losePrepare).toBe(false);
 const r=await readOriginalAttachmentRequests({uploadSessionId:s.session});expect(r).toMatchObject({success:true,data:{pendingCount:1,rows:[{completed:false,closed:false}]}});operationId=r.data!.rows[0].operationId;
});
it('reconciles lost successful cancellation without archiving the destination or deleting original bytes',async()=>{
 s.lostCancel=true;const input={uploadSessionId:s.session,documentId:7001,operationId};expect(await cancelOriginalAttachmentRequest(input)).toMatchObject({success:false});expect(s.lostCancel).toBe(false);
 expect(await readOriginalAttachmentRequests({uploadSessionId:s.session})).toMatchObject({success:true,data:{pendingCount:0,rows:[{completed:false,closed:true,operationId}]}});
 expect(await cancelOriginalAttachmentRequest(input)).toMatchObject({success:true,data:{cancelled:true,uploadSessionId:s.session,operationId}});
 const doc=await s.admin.from('dms_documents').select('status,is_archived,current_version_id').eq('id',7001).single();expect(doc.data).toMatchObject({status:'active',is_archived:false,current_version_id:null});
 expect((await s.admin.from('dms_document_files').select('id').eq('document_id',7001)).data).toHaveLength(0);
 const original=await s.admin.storage.from('dms-temp').download(s.path);expect(original.error).toBeNull();expect(Buffer.from(await original.data!.arrayBuffer())).toEqual(pdf);
});
it('cannot retry, rebind or resurrect a cancelled original through ordinary API writes',async()=>{
 expect(await attachVerifiedDocumentVersion({uploadSessionId:s.session,documentId:7001,changeNotes:'Synthetic cancellation original'})).toMatchObject({success:false,uncertain:false});
 expect((await s.user.from('dms_upload_sessions').update({status:'uploaded',intake_status:'review_pending'}).eq('id',s.session)).error).toMatchObject({code:'PT409'});
 expect(await cancelOriginalAttachmentRequest({uploadSessionId:s.session,documentId:7002,operationId})).toMatchObject({success:false});
});
it('current grant revocation hides closed private wording and prevents receipt replay',async()=>{
 expect((await s.admin.from('role_permissions').delete().eq('role_id',7001).eq('permission_id',7003)).error).toBeNull();
 const r=await readOriginalAttachmentRequests({uploadSessionId:s.session});expect(r).toMatchObject({success:true,data:{pendingCount:0,rows:[{unavailable:true,closed:true}]}});expect(JSON.stringify(r)).not.toContain('Synthetic cancellation original');
 expect(await cancelOriginalAttachmentRequest({uploadSessionId:s.session,documentId:7001,operationId})).toMatchObject({success:false});
});

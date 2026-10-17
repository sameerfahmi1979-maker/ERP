// Real, disposable local Data/Storage API. No browser, Auth service or provider.
import {beforeAll,expect,it,vi} from 'vitest';import {createClient,type SupabaseClient} from '@supabase/supabase-js';import {createHash} from 'node:crypto';
const s=vi.hoisted(()=>({user:null as unknown as SupabaseClient,admin:null as unknown as SupabaseClient,lost:false}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>s.user}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>s.admin}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:7001,auth_user_id:'a7000000-0000-4000-8000-000000000001'}}),hasPermission:()=>true}));
import {admitSingleUpload,acknowledgeSingleUpload} from '@/server/dms-single-upload-admission';
import {verifyTemporaryUpload} from '@/server/dms-temp-upload-verification';
import {discardRetainedIntake} from '@/server/dms-intake-discard';
const authUserId='a7000000-0000-4000-8000-000000000001';
import {syntheticPdf} from './document-fixtures';
const pdf=syntheticPdf();
const metadata=(name:string,bytes=pdf)=>({original_filename:name,mime_type:'application/pdf',file_size_bytes:bytes.length,sha256_hash:createHash('sha256').update(bytes).digest('hex')});
const contract=(n:number)=>({authUserId,operationId:`d7000000-0000-4000-8000-${String(n).padStart(12,'0')}`});
beforeAll(async()=>{
 expect(process.env.F07_SINGLE_NATIVE).toBe('owned-local-only');const url=process.env.F07_SINGLE_URL!;expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
 const make=(token:string,inject=false)=>createClient(url,token,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`},fetch:async(input,init)=>{
  const r=await fetch(input,init);if(inject&&s.lost&&String(input).includes('/rpc/f07_admit_single_upload')){s.lost=false;await r.arrayBuffer();throw Error('Synthetic lost response AFTER actual committed HTTP result');}return r;
 }}});
 s.user=make(process.env.F07_SINGLE_USER_TOKEN!,true);s.admin=make(process.env.F07_SINGLE_SERVICE_TOKEN!);
 expect((await s.admin.storage.createBucket('dms-temp',{public:false})).error).toBeNull();
});
it('composes admission, actual signed upload, byte verification and original-operation recovery',async()=>{
 const input=metadata('single-http.pdf');const r=await admitSingleUpload(input,contract(1));expect(r.success,r.error).toBe(true);if(!r.data)throw Error('Missing admission');
 const uploaded=await s.user.storage.from('dms-temp').uploadToSignedUrl(r.data.path,r.data.token,new Blob([pdf],{type:input.mime_type}),{contentType:input.mime_type,upsert:false});expect(uploaded.error).toBeNull();
 const verified=await verifyTemporaryUpload(r.data.session.id);expect(verified.success,verified.error).toBe(true);
 const recovered=await admitSingleUpload(input,contract(1));expect(recovered.success,recovered.error).toBe(true);expect(recovered.data?.uploadRequired).toBe(false);expect(recovered.data?.session.id).toBe(r.data.session.id);expect(recovered.data?.token).toBe('');
 const request={version:1 as const,...contract(1),metadata:input,context:null};
 expect(await acknowledgeSingleUpload(request,r.data.session.id)).toMatchObject({success:true});expect(await acknowledgeSingleUpload(request,r.data.session.id)).toMatchObject({success:true});
});
it('an actual committed admission with lost HTTP reply recovers exactly one session',async()=>{
 const input=metadata('lost-http.pdf');const before=await s.admin.from('dms_upload_sessions').select('id',{count:'exact',head:true});
 s.lost=true;expect(await admitSingleUpload(input,contract(2))).toMatchObject({success:false,uncertain:true});
 const retry=await admitSingleUpload(input,contract(2));expect(retry.success,retry.error).toBe(true);
 const after=await s.admin.from('dms_upload_sessions').select('id',{count:'exact',head:true});expect(after.count).toBe(before.count!+1);
 const again=await admitSingleUpload(input,contract(2));expect(again.data?.session.id).toBe(retry.data?.session.id);
});
it('simultaneous independent HTTP admissions never duplicate an operation',async()=>{
 const input=metadata('parallel-http.pdf');const before=await s.admin.from('dms_upload_sessions').select('id',{count:'exact',head:true});
 const pair=await Promise.all([admitSingleUpload(input,contract(3)),admitSingleUpload(input,contract(3))]);expect(pair.some(r=>r.success)).toBe(true);
 const after=await s.admin.from('dms_upload_sessions').select('id',{count:'exact',head:true});expect(after.count).toBe(before.count!+1);
 const recovered=await admitSingleUpload(input,contract(3));expect(recovered.success).toBe(true);for(const result of pair)if(result.success)expect(result.data?.session.id).toBe(recovered.data?.session.id);
});
it('the native boundary rejects a changed payload for the same operation',async()=>{const r=await admitSingleUpload(metadata('changed-http.pdf'),contract(3));expect(r.success).toBe(false);expect(r.uncertain).toBe(false);});
it('after a reload a fresh caller operation is redirected to the original unacknowledged upload',async()=>{
 const input=metadata('lost-http.pdf'),before=await s.admin.from('dms_upload_sessions').select('id',{count:'exact',head:true});
 const result=await admitSingleUpload(input,contract(99));expect(result.success).toBe(false);expect(result.recovery).toEqual({version:1,...contract(2),metadata:input,context:null});
 const after=await s.admin.from('dms_upload_sessions').select('id',{count:'exact',head:true});expect(after.count).toBe(before.count);
 const retry=await admitSingleUpload(input,{operationId:result.recovery!.operationId,authUserId});expect(retry.success).toBe(true);
});
it('an unverified upload cannot be acknowledged through the native API',async()=>{const input=metadata('unverified-http.pdf');const admitted=await admitSingleUpload(input,contract(10));expect(admitted.success).toBe(true);expect((await acknowledgeSingleUpload({version:1,...contract(10),metadata:input,context:null},admitted.data!.session.id)).success).toBe(false);});
it('actual Storage bytes with a forged PDF extension fail verification without creating a document',async()=>{
 const bytes=Buffer.from('<html>not a document</html>'),input=metadata('forged-http.pdf',bytes);const r=await admitSingleUpload(input,contract(4));expect(r.success,r.error).toBe(true);if(!r.data)throw Error('Missing admission');
 expect((await s.user.storage.from('dms-temp').uploadToSignedUrl(r.data.path,r.data.token,new Blob([bytes],{type:input.mime_type}),{contentType:input.mime_type,upsert:false})).error).toBeNull();
 expect((await verifyTemporaryUpload(r.data.session.id)).success).toBe(false);const row=await s.admin.from('dms_upload_sessions').select('status,document_id').eq('id',r.data.session.id).single();expect(row.data).toMatchObject({status:'uploading',document_id:null});
});
it('an exact original source cannot be rewritten through the API, even by the service client',async()=>{
 const r=await admitSingleUpload(metadata('immutable-http.pdf'),contract(5));expect(r.success).toBe(true);
 const changed=await s.admin.from('dms_upload_sessions').update({sha256_hash:'b'.repeat(64)}).eq('id',r.data!.session.id);expect(changed.error?.code).toBe('42501');
});
it('explicit branch origin survives real API serialization with actual scope',async()=>{const r=await admitSingleUpload({...metadata('branch-http.pdf'),context:{entityType:'branch',entityId:7001}},contract(6));expect(r.success,r.error).toBe(true);expect(r.data?.session).toMatchObject({origin_entity_type:'branch',origin_entity_id:7001,owning_company_id:7001,owning_branch_id:7001});});
it('atomic discard retains the object and makes admission replay unavailable',async()=>{
 const input=metadata('discard-http.pdf');const r=await admitSingleUpload(input,contract(7));expect(r.success).toBe(true);if(!r.data)throw Error('Missing admission');
 expect((await s.user.storage.from('dms-temp').uploadToSignedUrl(r.data.path,r.data.token,new Blob([pdf],{type:input.mime_type}),{contentType:input.mime_type,upsert:false})).error).toBeNull();
 expect((await discardRetainedIntake(s.user,{sessionId:r.data.session.id,documentId:null,reason:'Synthetic test cancellation'})).ok).toBe(true);
 expect((await s.admin.storage.from('dms-temp').info(r.data.path)).error).toBeNull();expect((await admitSingleUpload(input,contract(7))).success).toBe(false);
});
it('revoked scoped upload capability blocks recovery over the actual API',async()=>{
 const input=metadata('revoke-http.pdf');expect((await admitSingleUpload(input,contract(8))).success).toBe(true);
 expect((await s.admin.from('role_permissions').delete().eq('role_id',7001).eq('permission_id',7010)).error).toBeNull();
 expect((await admitSingleUpload(input,contract(8))).success).toBe(false);
});

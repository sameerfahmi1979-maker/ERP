import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),auth:vi.fn(),admin:vi.fn(),info:vi.fn(),sign:vi.fn(),verify:vi.fn(),from:vi.fn(),duplicate:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.rpc,from:m.from})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{m.admin();return {storage:{from:()=>({info:m.info,createSignedUploadUrl:m.sign})}};}}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.auth,hasPermission:()=>true}));
vi.mock('@/server/dms-temp-upload-verification',()=>({verifyTemporaryUpload:m.verify}));
import {admitSingleUpload,acknowledgeSingleUpload} from '@/server/dms-single-upload-admission';
const authUserId='a7000000-0000-4000-8000-000000000001',operationId='d7000000-0000-4000-8000-000000000001';
const metadata={original_filename:'synthetic.pdf',mime_type:'application/pdf',file_size_bytes:40,sha256_hash:'a'.repeat(64)};
const contract={operationId,authUserId};
const session={id:7010,session_code:'SYNTHETIC',uploaded_by:7001,temp_storage_path:'sessions/SYNTHETIC/synthetic.pdf',...metadata,
  status:'uploading',intake_status:'uploaded',document_id:null,expires_at:'2099-01-01T00:00:00Z',origin_entity_type:null,origin_entity_id:null,deleted_at:null,
  is_duplicate:false,duplicate_document_id:null,uploaded_at:'2026-10-17T00:00:00Z',completed_at:null,temp_cleaned_at:null,cleanup_error_message:null,error_message:null,
  created_at:'2026-10-17T00:00:00Z',updated_at:'2026-10-17T00:00:00Z',ai_result_id:null};
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({profile:{id:7001,auth_user_id:authUserId}});
 m.rpc.mockResolvedValue({data:{operationId,authUserId,session,replayed:false},error:null});
 m.info.mockResolvedValue({data:null,error:{status:404}});m.sign.mockResolvedValue({data:{path:session.temp_storage_path,token:'synthetic-capability',signedUrl:'http://127.0.0.1/synthetic'},error:null});
 const q={select:vi.fn(),eq:vi.fn(),is:vi.fn(),limit:vi.fn(),maybeSingle:m.duplicate};for(const k of ['select','eq','is','limit'] as const)q[k].mockReturnValue(q);m.from.mockReturnValue(q);m.duplicate.mockResolvedValue({data:null,error:null});
});
it('retains the exact caller operation before issuing a capability',async()=>{
 expect(await admitSingleUpload(metadata,contract)).toMatchObject({success:true,data:{uploadRequired:true,path:session.temp_storage_path}});
 expect(m.rpc).toHaveBeenCalledWith('f07_admit_single_upload',{p_request:{version:1,...contract,metadata,context:null}});
 expect(m.rpc.mock.invocationCallOrder[0]).toBeLessThan(m.admin.mock.invocationCallOrder[0]);expect(m.rpc).toHaveBeenCalledTimes(2);
});
it.each(['','application/octet-stream'])('normalizes fallback MIME %s before frozen admission',async mime_type=>{
 expect(await admitSingleUpload({...metadata,mime_type,sha256_hash:metadata.sha256_hash.toUpperCase()},contract)).toMatchObject({success:true});
 expect(m.rpc.mock.calls[0][1].p_request.metadata).toEqual(metadata);
});
it('no identity is generated if a caller omits its retained operation',async()=>{expect(await admitSingleUpload(metadata)).toMatchObject({success:false});expect(m.rpc).not.toHaveBeenCalled();expect(m.admin).not.toHaveBeenCalled();});
it('lost admission response remains uncertain and never signs a replacement',async()=>{m.rpc.mockRejectedValue(Error('lost after commit'));expect(await admitSingleUpload(metadata,contract)).toMatchObject({success:false,uncertain:true});expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.sign).not.toHaveBeenCalled();});
it('lost signing response recovers the same operation on retry',async()=>{m.sign.mockRejectedValueOnce(Error('lost')).mockResolvedValueOnce({data:{path:session.temp_storage_path,token:'second-ephemeral',signedUrl:'http://127.0.0.1/synthetic'},error:null});expect(await admitSingleUpload(metadata,contract)).toMatchObject({uncertain:true});expect(await admitSingleUpload(metadata,contract)).toMatchObject({success:true});expect(new Set(m.rpc.mock.calls.map(c=>JSON.stringify(c[1]))).size).toBe(1);});
it('an already-present file is verified rather than uploaded again',async()=>{m.info.mockResolvedValue({data:{id:'synthetic'},error:null});m.verify.mockResolvedValue({success:true,data:{...session,status:'uploaded'}});expect(await admitSingleUpload(metadata,contract)).toMatchObject({success:true,data:{uploadRequired:false,token:''}});expect(m.verify).toHaveBeenCalledWith(7010);expect(m.sign).not.toHaveBeenCalled();});
it.each([403,500])('unknown Storage status %s never authorizes overwrite',async status=>{m.info.mockResolvedValue({data:null,error:{status}});expect(await admitSingleUpload(metadata,contract)).toMatchObject({success:false,uncertain:true});expect(m.sign).not.toHaveBeenCalled();});
it('permission denial precedes all privileged Storage work',async()=>{m.rpc.mockResolvedValue({data:null,error:{code:'42501'}});expect(await admitSingleUpload(metadata,contract)).toMatchObject({success:false,uncertain:false});expect(m.admin).not.toHaveBeenCalled();});
it('account replacement while admission is in flight retires the result',async()=>{m.auth.mockResolvedValueOnce({profile:{id:7001,auth_user_id:authUserId}}).mockResolvedValue({profile:{id:7999,auth_user_id:operationId}});expect(await admitSingleUpload(metadata,contract)).toMatchObject({success:false});expect(m.admin).not.toHaveBeenCalled();});
it.each([{id:0},{temp_storage_path:'sessions/other/secret.pdf'},{sha256_hash:'b'.repeat(64)},{origin_entity_type:'employee',origin_entity_id:99},{expires_at:'invalid'}])('unverified receipt %j cannot issue a capability',async patch=>{m.rpc.mockResolvedValue({data:{operationId,authUserId,session:{...session,...patch},replayed:true},error:null});expect(await admitSingleUpload(metadata,contract)).toMatchObject({success:false});expect(m.sign).not.toHaveBeenCalled();});
it('changed session identity on the second read prevents signing',async()=>{m.rpc.mockResolvedValueOnce({data:{operationId,authUserId,session,replayed:false},error:null}).mockResolvedValueOnce({data:{operationId,authUserId,session:{...session,id:7999},replayed:true},error:null});expect(await admitSingleUpload(metadata,contract)).toMatchObject({success:false});expect(m.sign).not.toHaveBeenCalled();});
it('duplicate-read failure is visible and retains the original operation',async()=>{m.duplicate.mockResolvedValue({data:null,error:{code:'42501'}});expect(await admitSingleUpload(metadata,contract)).toMatchObject({success:false,uncertain:true});});
it('a reload discovers the exact original unacknowledged request before signing',async()=>{const recovery={version:1,...contract,operationId:'d7000000-0000-4000-8000-000000000002',metadata,context:null};m.rpc.mockResolvedValue({data:{recovery},error:null});expect(await admitSingleUpload(metadata,contract)).toMatchObject({success:false,uncertain:true,recovery});expect(m.admin).not.toHaveBeenCalled();});
it('recovery cannot substitute another owner, file or subject',async()=>{m.rpc.mockResolvedValue({data:{recovery:{version:1,...contract,metadata:{...metadata,sha256_hash:'b'.repeat(64)},context:null}},error:null});expect(await admitSingleUpload(metadata,contract)).toMatchObject({success:false});expect(m.admin).not.toHaveBeenCalled();});
it('acknowledgment checks the exact native receipt',async()=>{m.rpc.mockResolvedValue({data:{operationId,sessionId:session.id,acknowledged:true},error:null});expect(await acknowledgeSingleUpload({version:1,...contract,metadata,context:null},session.id)).toMatchObject({success:true});expect(m.rpc).toHaveBeenCalledWith('f07_acknowledge_single_upload',expect.objectContaining({p_session:session.id}));});
it('lost acknowledgment retains original recovery',async()=>{m.rpc.mockRejectedValue(Error('lost'));expect(await acknowledgeSingleUpload({version:1,...contract,metadata,context:null},session.id)).toMatchObject({success:false,uncertain:true});});

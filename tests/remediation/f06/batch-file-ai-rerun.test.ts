import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({client:vi.fn(),auth:vi.fn(),permission:vi.fn(),access:vi.fn(),files:[{id:9}],source:{document_id:4,sha256_hash:'a'.repeat(64),file_size_bytes:3,intake_status:'review_pending'},calls:[] as unknown[]}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.auth,hasPermission:m.permission}));
vi.mock('@/lib/dms/document-access',()=>({checkDocumentConfidentialityAccess:m.access}));
vi.mock('@/server/dms-file-pipeline-access',()=>({requireDmsFilePipelineAccess:async()=>null}));
import {getBatchDraftFileForAiRerun} from '@/server/actions/dms/batch-intake';
beforeEach(()=>{vi.clearAllMocks();m.calls=[];m.files=[{id:9}];m.source={document_id:4,sha256_hash:'a'.repeat(64),file_size_bytes:3,intake_status:'review_pending'};m.auth.mockResolvedValue({profile:{id:7,must_change_password:false},isAccountActive:true});m.permission.mockReturnValue(true);m.access.mockResolvedValue({allowed:true});
 m.client.mockResolvedValue({from:()=>{const q:any={select:()=>q,eq:(...args:unknown[])=>{m.calls.push(args);return q},is:()=>q,single:async()=>({data:m.source,error:null}),limit:async()=>({data:m.files,error:null})};return q}});
});
it('resolves only the original file bound to the batch member hash and size',async()=>{
 expect(await getBatchDraftFileForAiRerun(3)).toEqual({success:true,data:{documentId:4,fileId:9}});
 expect(m.calls).toContainEqual(['document_id',4]);expect(m.calls).toContainEqual(['sha256_hash','a'.repeat(64)]);expect(m.calls).toContainEqual(['file_size_bytes',3]);expect(m.calls).toContainEqual(['file_role','original']);
});
it('holds ambiguous originals instead of picking another version',async()=>{m.files=[{id:9},{id:10}];expect(await getBatchDraftFileForAiRerun(3)).toMatchObject({success:false,error:expect.stringContaining('ambiguous')});});
it('requires source transfer/draft creation and never starts initial intake',async()=>{m.source.document_id=null as unknown as number;expect(await getBatchDraftFileForAiRerun(3)).toMatchObject({success:false,error:expect.stringContaining('Recover the original')});});
it('requires both AI authority and current document access',async()=>{m.permission.mockReturnValue(false);expect(await getBatchDraftFileForAiRerun(3)).toMatchObject({success:false});m.permission.mockReturnValue(true);m.access.mockResolvedValue({allowed:false});expect(await getBatchDraftFileForAiRerun(3)).toMatchObject({success:false});});

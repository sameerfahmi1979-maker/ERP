import {beforeEach,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
const s=vi.hoisted(()=>({finalize:vi.fn(),orchestrate:vi.fn()}));
vi.mock('@/server/dms-retained-batch-finalization',()=>({finalizeRetainedBatch:s.finalize}));
vi.mock('@/lib/dms/orchestration/post-approve-orchestration',()=>({triggerDmsPostApproveOrchestration:s.orchestrate}));
import {runApproveAiIntakeSaga,type ApproveAiIntakeSagaInput} from '@/lib/dms/approve/approve-ai-intake';
const input:ApproveAiIntakeSagaInput={mode:'existing_batch_draft',uploadSessionId:44,sessionCode:'F07',tempStoragePath:'sessions/F07/file.pdf',originalFilename:'file.pdf',mimeType:'application/pdf',fileSizeBytes:3,sha256Hash:'a'.repeat(64),documentId:11,documentNo:'F07-11',title:'Synthetic',description:null,documentTypeId:1,categoryId:1,typeCode:'TEST',confidentialityLevel:'company',owningCompanyId:1,owningBranchId:null,partyId:null,issueDate:null,expiryDate:null,resolvedFileName:'synthetic.pdf',createFileVersion:true,metadataValues:[],tagIds:[],links:[],aiResultId:null,userId:7};
const client={} as SupabaseClient;
beforeEach(()=>{vi.resetAllMocks();s.finalize.mockResolvedValue({success:false,uncertain:true,error:'Retain the original request'});});
it('legacy compatibility delegates to the same retained protocol without new run/path allocation',async()=>{
 expect(await runApproveAiIntakeSaga(client,client,input)).toMatchObject({success:false,uncertain:true});
 expect(s.finalize).toHaveBeenCalledWith(client,client,expect.objectContaining({uploadSessionId:44,title:'Synthetic',owningCompanyId:1,owningBranchId:null,standardFileName:'synthetic.pdf'}),'synthetic.pdf',7);
 expect(s.orchestrate).not.toHaveBeenCalled();
});
it('receipt-only replay does not reprocess OCR or trigger orchestration',async()=>{
 s.finalize.mockResolvedValue({success:true,replayed:true,approveRunId:77,data:{documentId:11,documentNo:'F07-11'}});
 expect(await runApproveAiIntakeSaga(client,client,input)).toEqual({success:true,data:{documentId:11,documentNo:'F07-11'}});
 expect(s.orchestrate).not.toHaveBeenCalled();
});
it('single-file creation cannot enter the legacy batch compatibility path',async()=>{
 expect(await runApproveAiIntakeSaga(client,client,{...input,mode:'single_file_new_document'})).toMatchObject({success:false});
 expect(s.finalize).not.toHaveBeenCalled();
});

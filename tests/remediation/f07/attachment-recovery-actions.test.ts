import {beforeEach,expect,it,vi} from 'vitest';
const s=vi.hoisted(()=>({client:vi.fn(),rpc:vi.fn(),admin:vi.fn(),discard:vi.fn(),refresh:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:s.client}));vi.mock('@/lib/supabase/admin',()=>({createAdminClient:s.admin}));
vi.mock('@/server/dms-intake-discard',()=>({discardRetainedIntake:s.discard}));vi.mock('next/cache',()=>({revalidatePath:s.refresh}));
import {readOriginalAttachmentRequests,cancelOriginalAttachmentRequest} from '@/server/actions/dms/document-upload-attach';
const row={unavailable:false,uploadSessionId:7,documentId:8,operationId:'a7000000-0000-4000-8000-000000000001',completed:false,changeNotes:'Original notes',versionLabel:null,originalFilename:'Synthetic.pdf'};
const data={rows:[row],totalCount:1,pendingCount:1,page:1,pageSize:25};
beforeEach(()=>{vi.resetAllMocks();s.client.mockResolvedValue({rpc:s.rpc});s.rpc.mockResolvedValue({data,error:null});});
it('uses only the ordinary scoped connection and preserves exact wording',async()=>{expect(await readOriginalAttachmentRequests({uploadSessionId:7})).toEqual({success:true,data});expect(s.rpc).toHaveBeenCalledWith('f07_read_attachment_recovery',{p_session:7,p_document:null,p_page:1});expect(s.admin).not.toHaveBeenCalled();});
it.each([{}, {uploadSessionId:7,documentId:8},{uploadSessionId:0},{documentId:Number.MAX_SAFE_INTEGER+1},{uploadSessionId:7,page:0}])('invalid selector %j does not query the ledger',async input=>{expect((await readOriginalAttachmentRequests(input)).success).toBe(false);expect(s.client).not.toHaveBeenCalled();});
it('a denied read is not an empty successful recovery',async()=>{s.rpc.mockResolvedValue({data:null,error:{code:'42501',message:'PRIVATE'}});const r=await readOriginalAttachmentRequests({documentId:8});expect(r.success).toBe(false);expect(JSON.stringify(r)).not.toContain('PRIVATE');});
it.each([{...data,rows:[{...row,uploadSessionId:99}]},{...data,rows:[row,row]},{...data,pendingCount:0},{...data,page:2}])('malformed or foreign response is refused',async value=>{s.rpc.mockResolvedValue({data:value,error:null});expect((await readOriginalAttachmentRequests({uploadSessionId:7})).success).toBe(false);});
it('an inaccessible owned footprint remains explicit without private wording',async()=>{const footprint={unavailable:true,uploadSessionId:7,operationId:row.operationId,completed:false};s.rpc.mockResolvedValue({data:{...data,rows:[footprint]},error:null});expect(await readOriginalAttachmentRequests({documentId:8})).toEqual({success:true,data:{...data,rows:[footprint]}});});
const cancellation={uploadSessionId:7,documentId:8,operationId:row.operationId};
it('cancels the checked original source with a null destination so the document cannot be archived',async()=>{
 s.discard.mockResolvedValue({ok:true});expect(await cancelOriginalAttachmentRequest(cancellation)).toEqual({success:true,data:{cancelled:true,uploadSessionId:7,operationId:row.operationId}});
 expect(s.discard).toHaveBeenCalledExactlyOnceWith(expect.anything(),{sessionId:7,documentId:null,reason:expect.stringContaining('uncommitted attachment')});expect(s.admin).not.toHaveBeenCalled();
});
it.each([{...cancellation,documentId:9},{...cancellation,operationId:'a7000000-0000-4000-8000-000000000099'}])('never cancels a different original identity',async input=>{
 expect((await cancelOriginalAttachmentRequest(input)).success).toBe(false);expect(s.discard).not.toHaveBeenCalled();
});
it('completed attachments are not cancellable even by their original actor',async()=>{
 s.rpc.mockResolvedValue({data:{...data,pendingCount:0,rows:[{...row,completed:true}]},error:null});expect((await cancelOriginalAttachmentRequest(cancellation)).success).toBe(false);expect(s.discard).not.toHaveBeenCalled();
});
it('cancel receipt discovery replays without a second discard or any Storage call',async()=>{
 s.rpc.mockResolvedValue({data:{...data,pendingCount:0,rows:[{...row,closed:true}]},error:null});expect((await cancelOriginalAttachmentRequest(cancellation)).success).toBe(true);expect(s.discard).not.toHaveBeenCalled();expect(s.admin).not.toHaveBeenCalled();
});
it('an uncertain discard cannot be reported as cancellation success',async()=>{
 s.discard.mockResolvedValue({ok:false,uncertain:true});expect((await cancelOriginalAttachmentRequest(cancellation)).success).toBe(false);expect(s.refresh).not.toHaveBeenCalled();
});
it('a committed cancellation receipt survives cache refresh failure',async()=>{
 s.discard.mockResolvedValue({ok:true});s.refresh.mockImplementation(()=>{throw Error('PRIVATE');});const r=await cancelOriginalAttachmentRequest(cancellation);expect(r.success).toBe(true);expect(JSON.stringify(r)).not.toContain('PRIVATE');
});

import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),revalidate:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.rpc})}));
vi.mock('next/cache',()=>({revalidatePath:m.revalidate}));
import {readDocumentTypeChange,saveDocumentTypeChange} from '@/server/actions/dms/document-type-change';
import {restoreTypeChangeRequest} from '@/lib/dms/document-type-change';
const input={documentId:1,documentTypeId:2,snapshot:'a'.repeat(64),requestId:'00000000-0000-4000-8000-000000007001',values:[{definition_id:3,value_text:'Synthetic issuer'}],
 document:{title:'Synthetic',document_type_id:2,category_id:4,status:'active' as const,confidentiality_level:'internal' as const,owning_company_id:5,owning_branch_id:6,party_id:null,issue_date:null,expiry_date:null}};
beforeEach(()=>{vi.resetAllMocks();});
it('validates identities before querying',async()=>{expect((await readDocumentTypeChange(-1,2)).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
it('never falls back to a privileged catalog when review fails',async()=>{m.rpc.mockResolvedValue({error:{code:'42501'}});expect((await readDocumentTypeChange(1,2)).success).toBe(false);expect(m.rpc).toHaveBeenCalledOnce();});
it('rejects definition identities returned for another type',async()=>{
 m.rpc.mockResolvedValue({data:{documentId:1,documentTypeId:2,snapshot:input.snapshot,definitions:[{id:3,document_type_id:99,field_code:'issuer',field_label_en:'Issuer',field_type:'text',is_required:true}],values:[]}});
 expect((await readDocumentTypeChange(1,2)).success).toBe(false);
});
it('uses one authenticated transaction and checks exact receipt',async()=>{
 m.rpc.mockResolvedValue({data:{documentId:1,documentTypeId:2,requestId:input.requestId}});
 expect((await saveDocumentTypeChange(input)).success).toBe(true);
 expect(m.rpc).toHaveBeenCalledExactlyOnceWith('dms_type_change',{p_action:'save',p_data:input});expect(m.revalidate).toHaveBeenCalled();
});
it.each([{error:{code:'08006'}},{data:{documentId:99,documentTypeId:2,requestId:input.requestId}}])('retains uncertain or mismatched responses',async(result)=>{
 m.rpc.mockResolvedValue(result);expect((await saveDocumentTypeChange(input)).uncertain).toBe(true);expect(m.revalidate).not.toHaveBeenCalled();
});
it('does not let cache refresh failure turn a confirmed save into a failed save',async()=>{
 m.rpc.mockResolvedValue({data:{documentId:1,documentTypeId:2,requestId:input.requestId}});m.revalidate.mockImplementation(()=>{throw Error('Cache');});
 expect((await saveDocumentTypeChange(input)).success).toBe(true);
});
it('blocks extra header properties before reaching the database',async()=>{
 expect((await saveDocumentTypeChange({...input,document:{...input.document,approval_status:'approved'}})).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();
});
it('restores only a valid retained operation for the same document',()=>{
 expect(restoreTypeChangeRequest(JSON.stringify(input),1)).toEqual({pending:input,invalid:false});
 expect(restoreTypeChangeRequest(JSON.stringify(input),99).invalid).toBe(true);expect(restoreTypeChangeRequest('{bad',1).invalid).toBe(true);
});

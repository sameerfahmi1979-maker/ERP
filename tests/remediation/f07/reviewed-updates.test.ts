import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),admin:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.rpc})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.admin}));
import {z} from 'zod';
import {reviewedCall,readMetadataSnapshot,saveReviewedMetadata,prepareDmsUpdate,executeDmsUpdate,runDmsCorrection,applyReviewedAiMetadata} from '@/server/dms-reviewed-updates';
const hash='a'.repeat(64),requestId='c7000000-0000-4000-8000-000000000001';
beforeEach(()=>{vi.clearAllMocks();});
describe('checked mutation transport',()=>{
 it.each(['40003','08007','PGRST000','XX000','40001\n','42501suffix','',null,undefined,40001,{},['40001']])('unknown outcome remains uncertain: %j',async code=>{
  m.rpc.mockResolvedValue({error:{code,message:'PRIVATE',details:'PRIVATE'}});
  const r=await reviewedCall('f07_metadata_operation',{p_action:'save'},z.object({ok:z.literal(true)}));
  expect(r).toMatchObject({success:false,uncertain:true});expect(JSON.stringify(r)).not.toContain('PRIVATE');expect(m.rpc).toHaveBeenCalledOnce();expect(m.admin).not.toHaveBeenCalled();
 });
 it.each(['22023','22008','23505','42501','PT409','40001','40P01'])('known rollback is not uncertain: %s',async code=>{
  m.rpc.mockResolvedValue({error:{code}});expect(await reviewedCall('f07_dms_apply',{},z.unknown())).toMatchObject({success:false,uncertain:false});
 });
 it('network rejection is sanitized',async()=>{m.rpc.mockRejectedValue(Error('PRIVATE'));const r=await reviewedCall('f07_dms_apply',{},z.unknown());expect(r.uncertain).toBe(true);expect(JSON.stringify(r)).not.toContain('PRIVATE');});
 it('malformed receipt does not claim success',async()=>{m.rpc.mockResolvedValue({data:{ok:true,secret:'PRIVATE'}});expect(await reviewedCall('f07_dms_apply',{},z.object({ok:z.literal(true)}).strict())).toMatchObject({success:false,uncertain:true});});
});
describe('metadata snapshot and saved identity',()=>{
 it('requires the retained review before dispatch',async()=>{expect((await saveReviewedMetadata(1,[])).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
 it('rejects NaN and wrong typed column without a request',async()=>{expect((await saveReviewedMetadata(1,[{definition_id:1,value_number:NaN}],{requestId,snapshot:hash})).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
 it('retries the same full payload after a lost response',async()=>{
  const values=[{definition_id:1,value_text:'Full العربية '.repeat(300)}];
  m.rpc.mockRejectedValueOnce(Error('lost')).mockResolvedValueOnce({data:{documentId:1,savedCount:1,requestId,snapshot:hash}});
  expect((await saveReviewedMetadata(1,values,{requestId,snapshot:hash})).uncertain).toBe(true);
  expect((await saveReviewedMetadata(1,values,{requestId,snapshot:hash})).success).toBe(true);
  expect(m.rpc.mock.calls[0]).toEqual(m.rpc.mock.calls[1]);expect(m.rpc.mock.calls[0][1].p_data.values[0].value_text).toHaveLength(values[0].value_text.length);
 });
 it.each([{documentId:2,savedCount:1,requestId,snapshot:hash},{documentId:1,savedCount:2,requestId,snapshot:hash},{documentId:1,savedCount:1,requestId:'c7000000-0000-4000-8000-000000000002',snapshot:hash}])('rejects foreign or mismatched save receipt',async data=>{
  m.rpc.mockResolvedValue({data});expect((await saveReviewedMetadata(1,[{definition_id:1,value_text:'a'}],{requestId,snapshot:hash})).uncertain).toBe(true);
 });
 it('snapshot refuses cross-document hydrated rows',async()=>{m.rpc.mockResolvedValue({data:{documentId:1,snapshot:hash,sourceSnapshot:null,values:[{id:1,document_id:2,definition_id:1,value_text:'private',value_number:null,value_date:null,value_datetime:null,value_boolean:null,value_json:null}]}});expect((await readMetadataSnapshot(1)).success).toBe(false);});
 it('AI review requires a bound source snapshot',async()=>{m.rpc.mockResolvedValue({data:{documentId:1,snapshot:hash,sourceSnapshot:null,values:[]}});expect((await readMetadataSnapshot(1,5)).success).toBe(false);});
});
describe('reviewed ERP operations',()=>{
 it('legacy summary-only review cannot dispatch',async()=>{expect((await prepareDmsUpdate({documentId:1,items:[]} as never)).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
 it('refuses foreign run preparation receipt',async()=>{m.rpc.mockResolvedValue({data:{runId:1,runCode:'APPLY-other'}});expect((await prepareDmsUpdate({requestId,reviewedSnapshot:hash,documentId:1,items:[]} as never)).success).toBe(false);});
 const confirm={confirmedItemIds:[11],humanReviewConfirmed:true,replaceExistingConfirmed:true};
 const item={itemId:11,targetTable:'dms_documents',targetField:'description',targetRecordId:1,status:'applied',appliedValueSummary:'display',skipReason:null,failureReason:null};
 const receipt={runId:1,runCode:'APPLY-test',status:'completed',appliedCount:1,skippedCount:0,conflictCount:0,failedCount:0,items:[item],errorMessage:null};
 it('accepts exactly bound applied receipt',async()=>{m.rpc.mockResolvedValue({data:receipt});expect(await executeDmsUpdate(1,confirm)).toMatchObject({success:true,data:receipt});});
 it.each([{...receipt,runId:2},{...receipt,appliedCount:2},{...receipt,items:[{...item,itemId:12}]},{...receipt,items:[item,item]},{...receipt,items:[{...item,targetTable:'user_roles'}]}])('rejects misleading applied receipt',async data=>{m.rpc.mockResolvedValue({data});expect((await executeDmsUpdate(1,confirm)).uncertain).toBe(true);});
 it('duplicate selection never dispatches',async()=>{expect((await executeDmsUpdate(1,{...confirm,confirmedItemIds:[11,11]})).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
 it('correction replay retains proposal identity',async()=>{m.rpc.mockRejectedValueOnce(Error('lost')).mockResolvedValueOnce({data:{proposalId:8,status:'applied'}});const input={proposalId:8,humanReviewConfirmed:true,replaceExistingConfirmed:true};expect((await runDmsCorrection('apply',input)).uncertain).toBe(true);expect((await runDmsCorrection('apply',input)).success).toBe(true);expect(m.rpc.mock.calls[0]).toEqual(m.rpc.mock.calls[1]);});
 it('summary-only correction cannot dispatch',async()=>{expect((await runDmsCorrection('prepare',{requestId})).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
 it('AI metadata requires both target and source reviews',async()=>{expect((await applyReviewedAiMetadata({documentId:1,aiResultId:1,selections:[],confirmation:{}})).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
});

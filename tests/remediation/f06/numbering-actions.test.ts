// Action contract tests: database transport, auth and cache are explicit doubles.
// Actual allocation/permissions are covered separately by numbering-db.mjs.
import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn(),auth:vi.fn(),global:vi.fn(),any:vi.fn(),save:vi.fn(),invalidate:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:mock.rpc})}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:mock.auth,hasGlobalPermission:mock.global,hasPermission:mock.any}));
vi.mock('@/server/numbering-save',()=>({saveNumberingMutation:mock.save}));
vi.mock('next/cache',()=>({revalidatePath:mock.invalidate}));
vi.mock('@/lib/logger',()=>({logger:{error:vi.fn(),warn:vi.fn()}}));
import {generateNextReference,previewNextReference,updateNumberingRule,toggleNumberingRuleActive,toggleNumberingRuleLock} from '@/server/actions/numbering';
const operationId='97d69377-ee53-4233-a393-9c3eab126b79';
const input={operationId,ruleId:7};
const receipt={id:12,replayed:false,generated_reference_number:'TST-0001',generated_sequence_number:1,numbering_rule_id:7,sequence_state_id:4,generation_status:'consumed'};
const contract={operationId,revision:'2'};
beforeEach(()=>{vi.resetAllMocks();mock.auth.mockResolvedValue({profile:{id:42}});mock.global.mockReturnValue(true);mock.any.mockReturnValue(true);mock.rpc.mockResolvedValue({data:receipt,error:null});mock.save.mockResolvedValue({success:true,data:{id:7,revision:'3',changed:true,replayed:false}});});
it('preserves a complete allocation receipt and its retained operation',async()=>{
 expect(await generateNextReference(input)).toMatchObject({success:true,data:{id:12,generatedReferenceNumber:'TST-0001',replayed:false}});
 expect(mock.rpc).toHaveBeenCalledWith('allocate_numbering_reference',expect.objectContaining({p_operation:operationId,p_rule_id:7,p_status:'consumed'}));
});
it('does not confirm an allocation receipt for a different selected rule',async()=>{
 mock.rpc.mockResolvedValue({data:{...receipt,numbering_rule_id:8},error:null});
 expect(await generateNextReference(input)).toMatchObject({success:false,uncertain:true});
 expect(mock.invalidate).not.toHaveBeenCalled();
});
it('does not display a preview returned for a different selected rule',async()=>{
 mock.rpc.mockResolvedValue({data:{preview_reference_number:'OTHER-0001',document_prefix:'OTHER',sequence_number:1,format_template:'{DOC}-{SEQ}',rule_id:8},error:null});
 expect((await previewNextReference({ruleId:7})).success).toBe(false);
});
it('does not report failed allocation when cache invalidation fails after commit',async()=>{mock.invalidate.mockImplementation(()=>{throw Error('cache offline');});expect((await generateNextReference(input)).success).toBe(true);expect(mock.rpc).toHaveBeenCalledTimes(1);});
it.each(['update','active','lock'])('preserves committed %s receipt after invalidation failure',async(action)=>{
 mock.invalidate.mockImplementation(()=>{throw Error('cache offline');});
 const result=action==='update'?updateNumberingRule({id:7,rule_name:'Renamed'},contract):action==='active'?toggleNumberingRuleActive(7,false,contract):toggleNumberingRuleLock(7,true,contract);
 await expect(result).resolves.toMatchObject({success:true,data:{revision:'3'}});
});
it.each([{generated_reference_number:'TST-0001'},{...receipt,replayed:undefined},{...receipt,generation_status:'reserved'},{...receipt,generated_sequence_number:Number.MAX_SAFE_INTEGER+1},[receipt,receipt]])('does not confirm incomplete or inconsistent allocation receipts %j',async(data)=>{mock.rpc.mockResolvedValue({data,error:null});expect(await generateNextReference(input)).toMatchObject({success:false,uncertain:true});});
it('flags transport loss without inventing a new operation',async()=>{mock.rpc.mockRejectedValue(Error('private provider detail'));expect(await generateNextReference(input)).toMatchObject({success:false,uncertain:true});expect(mock.rpc).toHaveBeenCalledTimes(1);});
it.each(['22023','23505','42501','PT409','P0002'])('redacts known rollback %s without claiming an uncertain commit',async(code)=>{mock.rpc.mockResolvedValue({error:{code,message:'private database detail'}});const result=await generateNextReference(input);expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);expect(result.error).not.toContain('private database detail');});
it('marks a gateway response as uncertain with safe recovery guidance',async()=>{mock.rpc.mockResolvedValue({error:{message:'private gateway detail'}});const result=await generateNextReference(input);expect(result).toMatchObject({success:false,uncertain:true});expect(result.error).toMatch(/unchanged|same/i);expect(result.error).not.toContain('private gateway');});
it.each(['preview','generate'])('requires global %s authority rather than an unrelated scoped grant',async(action)=>{mock.global.mockReturnValue(false);const result=action==='preview'?await previewNextReference({ruleId:7}):await generateNextReference(input);expect(result).toMatchObject({success:false,kind:'forbidden'});expect(mock.rpc).not.toHaveBeenCalled();});
it.each([{}, {ruleId:0}, {ruleCode:''}, {ruleId:7,targetRecordId:4}, {ruleId:7,targetTableName:'x',targetRecordId:-1}])('rejects invalid allocation input before transport %j',async(fields)=>{expect((await generateNextReference({...fields,operationId})).success).toBe(false);expect(mock.rpc).not.toHaveBeenCalled();});
it('never silently ignores a legacy ID selector',async()=>{expect((await generateNextReference({ruleId:7,ruleCode:'TEST'})).success).toBe(false);expect(mock.rpc).not.toHaveBeenCalled();});
it('preserves the legacy code consumer until its atomic adoption',async()=>{const legacy={generated_reference_number:'TST-0001',generated_sequence_number:1,numbering_rule_id:7,sequence_state_id:4,generation_status:'consumed'};mock.rpc.mockResolvedValue({data:[legacy],error:null});expect((await generateNextReference({ruleCode:'TEST'})).success).toBe(true);expect(mock.rpc).toHaveBeenCalledWith('generate_next_reference_number',expect.objectContaining({p_rule_code:'TEST',p_generated_by:42}));});
it('warns legacy uncertain callers to reconcile rather than allocate again',async()=>{mock.rpc.mockRejectedValue(Error('lost'));const result=await generateNextReference({ruleCode:'TEST'});expect(result).toMatchObject({success:false,uncertain:true});expect(result.error).toMatch(/reconcile|history/i);});
it('validates preview input and does not pass zero as a sequence',async()=>{expect((await previewNextReference({ruleId:7,nextSequenceNumber:0})).success).toBe(false);expect(mock.rpc).not.toHaveBeenCalled();});
it('rejects incomplete preview and redacts provider details',async()=>{mock.rpc.mockResolvedValueOnce({data:[{preview_reference_number:'TST-0001'}],error:null});expect((await previewNextReference({ruleId:7})).success).toBe(false);mock.rpc.mockResolvedValueOnce({error:{code:'22023',message:'private detail'}});expect((await previewNextReference({ruleId:7})).error).not.toContain('private detail');});
it('returns a complete preview without allocating or invalidating',async()=>{mock.rpc.mockResolvedValue({data:[{preview_reference_number:'TST-0001',document_prefix:'TST',sequence_number:1,format_template:'{DOC}-{SEQ}',rule_id:7}],error:null});expect(await previewNextReference({ruleId:7})).toMatchObject({success:true,data:{ruleId:7,sequenceNumber:1}});expect(mock.invalidate).not.toHaveBeenCalled();});

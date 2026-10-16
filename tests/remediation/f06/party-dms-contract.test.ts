// Transport doubles and pure presentation/value contracts, not DB acceptance.
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.rpc})}));
import {preparePartyDmsRun,executePartyDmsRun,cancelPartyDmsRun} from '@/server/party-dms-apply';
import {resolvePartyChildRowProposals} from '@/lib/dms/apply-to-erp/apply-source-resolver';
import type {CreateApplyRunInput} from '@/lib/dms/apply-to-erp/types';
const requestId='ad62c5b8-a56b-451b-8c47-48b978b89e31';
function input():CreateApplyRunInput{return {requestId,documentId:3,partyId:4,sourceType:'extraction_result',sourceId:null,reviewQueueItemId:null,targetModule:'party',targetTable:'party_tax_registrations',targetKind:'party_tax_registrations',targetRecordId:5,items:resolvePartyChildRowProposals({documentId:3,partyId:4,targetKind:'party_tax_registrations',targetRecordId:5,sourceType:'extraction_result',sourceId:null,currentValues:{workspace_revision:7,tax_registration_number:'100000000000001'},proposedValues:{tax_registration_number:'100000000000003'}})};}
beforeEach(()=>{vi.resetAllMocks();m.rpc.mockResolvedValue({data:{runId:9,runCode:`APPLY-${requestId}`},error:null});});
it('masked summary and full write value remain separate through RPC',async()=>{const f=input();expect(f.items[0].proposedValueSummary).not.toBe('100000000000003');expect((await preparePartyDmsRun(f)).success).toBe(true);expect(m.rpc.mock.calls[0][1].p_data).toMatchObject({targetId:5,revision:'7',fields:{tax_registration_number:'100000000000003'}});});
it('long text is preserved while display summary remains bounded',()=>{const f=resolvePartyChildRowProposals({documentId:3,partyId:4,targetKind:'party_licenses',targetRecordId:5,sourceType:'extraction_result',sourceId:null,currentValues:{workspace_revision:7},proposedValues:{remarks:'long '.repeat(90)}});expect(f[0].proposedValue).toHaveLength(450);expect(f[0].proposedValueSummary!.length).toBeLessThanOrEqual(200);});
it.each(['missing-key','missing-value','missing-revision','different-child','duplicate-field'])('%s review fails before RPC',async failure=>{const f=input();if(failure==='missing-key')delete f.requestId;if(failure==='missing-value')delete f.items[0].proposedValue;if(failure==='missing-revision')delete f.items[0].reviewedRevision;if(failure==='different-child')f.items.push({...f.items[0],targetRecordId:6,targetField:'remarks'});if(failure==='duplicate-field')f.items.push({...f.items[0]});expect((await preparePartyDmsRun(f)).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
it.each([null,{runId:9,runCode:'APPLY-other'},{runId:9,runCode:`APPLY-${requestId}`,private:'unexpected'}])('malformed or mismatched prepared receipt remains uncertain',async data=>{m.rpc.mockResolvedValue({data,error:null});expect(await preparePartyDmsRun(input())).toMatchObject({success:false,uncertain:true});});
const confirm={confirmedItemIds:[11],humanReviewConfirmed:true,replaceExistingConfirmed:true};
const applied={runId:9,runCode:`APPLY-${requestId}`,status:'completed',appliedCount:1,skippedCount:0,conflictCount:0,failedCount:0,errorMessage:null,items:[{itemId:11,targetTable:'party_licenses',targetField:'remarks',targetRecordId:5,status:'applied',appliedValueSummary:'F06',skipReason:null,failureReason:null}]};
it('valid committed receipt is accepted',async()=>{m.rpc.mockResolvedValue({data:applied,error:null});expect((await executePartyDmsRun(9,confirm)).success).toBe(true);});
it.each([{...applied,runId:10},{...applied,appliedCount:2},{...applied,items:[]},{...applied,items:[{...applied.items[0],itemId:12}]}])('incomplete or wrong-operation applied receipt remains uncertain',async data=>{m.rpc.mockResolvedValue({data,error:null});expect(await executePartyDmsRun(9,confirm)).toMatchObject({success:false,uncertain:true});});
it.each(['42501','PT409','PT404','22023','XX000'])('%s diagnostics remain secret-safe',async code=>{m.rpc.mockResolvedValue({data:null,error:{code,message:'secret synthetic diagnostic'}});const r=await preparePartyDmsRun(input());expect(r.success).toBe(false);expect(JSON.stringify(r)).not.toContain('secret synthetic');expect(r.uncertain).toBe(code==='XX000');});
it('missing target reports known unavailability, not an unconfirmed commit',async()=>{m.rpc.mockResolvedValue({data:null,error:{code:'PT404'}});const r=await preparePartyDmsRun(input());expect(r).toMatchObject({success:false,uncertain:false,errorCode:'target_record_not_found'});expect(r.error).toContain('no longer available');expect(r.error).not.toContain('unconfirmed');});
it.each([null,{cancelled:false},{cancelled:true,unexpected:1}])('malformed cancellation receipt retains uncertainty',async data=>{m.rpc.mockResolvedValue({data,error:null});expect(await cancelPartyDmsRun(9)).toMatchObject({success:false,uncertain:true});});
it('cancellation transport failure retains uncertainty',async()=>{m.rpc.mockRejectedValue(Error('Synthetic lost response'));expect(await cancelPartyDmsRun(9)).toMatchObject({success:false,uncertain:true});});
it('invalid cancellation identity never reaches RPC',async()=>{expect((await cancelPartyDmsRun(-1)).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});

for(const [label,invoke] of [['prepare',()=>preparePartyDmsRun(input())],['apply',()=>executePartyDmsRun(9,confirm)],['cancel',()=>cancelPartyDmsRun(9)]] as const)it.each(['40003','08007'])(`W18 ${label} %s dispatches once with safe uncertainty`,async code=>{
 m.rpc.mockResolvedValueOnce({error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}}).mockResolvedValueOnce({error:{code:'40001'}});
 expect(await invoke()).toMatchObject({success:false,uncertain:true});expect(m.rpc).toHaveBeenCalledOnce();
 const first=m.rpc.mock.calls[0];expect(first).toEqual(w18Expected(label));expect((await invoke()).success).toBe(false);expect(m.rpc).toHaveBeenCalledTimes(2);expect(m.rpc.mock.calls[1]).toEqual(first);

 const confirmed=label==='prepare'?{runId:9,runCode:`APPLY-${requestId}`}:label==='apply'?applied:{cancelled:true};m.rpc.mockResolvedValue({data:confirmed,error:null});expect(await invoke()).toEqual(label==='cancel'?{success:true}:{success:true,data:confirmed});expect(m.rpc.mock.calls).toEqual([first,first,first]);
 // Explicit repeated calls verify request identity, not the excluded UI lifetime.
});

// W18: actual dispatched adapter, exact codes only; not a transaction/native oracle.
const w18Unknown:unknown[]=['40003','08007','40ZZZ','PGRST000','XX000',undefined,null,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01','23p01',40001,42501,['40001'],new String('40001'), 'toString', 'constructor', '__proto__'];
it.each([...w18Unknown,...["PT123","55P03","55000","57014","57015"]].map(code=>({code})))('W18 unknown code %# retains uncertainty without guidance',async({code})=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 const result=await preparePartyDmsRun(input());
 expect(m.rpc.mock.calls).toEqual([w18Expected('prepare')]);expect(result).toMatchObject({success:false,uncertain:true,error:expect.stringMatching(/unconfirmed/i)});
 expect(JSON.stringify(result)).not.toMatch(/W18_PRIVATE|no .*committed|rolled back|were rejected|was rejected/i);expect(result).not.toHaveProperty('fieldErrors');
});
it.each(["40000","40001","40002","40P01","22023","23514","42501","P0001","PT404","PT409"])('W18 exact known code %s preserves definite rejection',async code=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC'}});const result=await preparePartyDmsRun(input());
 expect(m.rpc).toHaveBeenCalledOnce();expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);expect(JSON.stringify(result)).not.toContain('W18_PRIVATE');
});
it('W18 does not coerce an object into a mapped SQLSTATE',async()=>{
 const toString=vi.fn(()=>'PT409'),code={toString};m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 expect(await preparePartyDmsRun(input())).toMatchObject({success:false,uncertain:true});expect(toString).not.toHaveBeenCalled();expect(m.rpc).toHaveBeenCalledOnce();
});

function w18Expected(label:string){return ['party_dms_apply',{p_action:label,p_data:label==='prepare'?{requestId,documentId:3,partyId:4,targetTable:'party_tax_registrations',targetId:5,revision:'7',fields:{tax_registration_number:'100000000000003'},sourceType:'extraction_result',sourceId:null}:label==='apply'?{runId:9,confirmedItemIds:[11],humanReviewConfirmed:true,replaceExistingConfirmed:true}:{runId:9}}];}

import {beforeEach,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>db}));
import {saveWorkspaceRecord} from '@/server/workspace-save';
const contract={operationId:'66a00000-0000-4000-8000-000000000001',revision:'2'};
const good={id:71,revision:'3',changed:true,replayed:false,owner_company_id:1,calendar_id:null};
beforeEach(()=>vi.resetAllMocks());
it.each([
 ['wrong ID',{...good,id:72}],['unsafe ID',{...good,id:Number.MAX_SAFE_INTEGER+1}],
 ['invalid revision',{...good,revision:'oops'}],['missing change result',{...good,changed:undefined}],
 ['missing scope',{...good,owner_company_id:undefined}],['wrong company',{...good,owner_company_id:2}],
 ['wrong parent type',{...good,calendar_id:71}],
])('calendar %s cannot acknowledge a save',async(_name,data)=>{
 db.rpc.mockResolvedValue({data,error:null});
 expect(await saveWorkspaceRecord('work_calendars',71,{owner_company_id:1},contract)).toMatchObject({success:false,uncertain:true});
});
it('valid calendar receipt is accepted without inventing fields',async()=>{
 db.rpc.mockResolvedValue({data:good,error:null});
 expect(await saveWorkspaceRecord('work_calendars',71,{owner_company_id:1},contract)).toEqual({success:true,data:good});
});
it.each([null,99,undefined])('shift parent %s must match the submitted calendar',async(calendar_id)=>{
 db.rpc.mockResolvedValue({data:{...good,calendar_id},error:null});
 expect(await saveWorkspaceRecord('work_shifts',71,{calendar_id:8},contract)).toMatchObject({success:false,uncertain:true});
});
it('shift replay preserves its expected parent and identity',async()=>{
 const data={...good,calendar_id:8,replayed:true};db.rpc.mockResolvedValue({data,error:null});
 expect(await saveWorkspaceRecord('work_shifts',71,{calendar_id:8},contract)).toEqual({success:true,data});
});
const replays=[
 {entity:'work_calendars',payload:{owner_company_id:null,is_active:false},receipt:{...good,owner_company_id:null,changed:false,replayed:true}},
 {entity:'work_shifts',payload:{calendar_id:8,is_active:false},receipt:{...good,calendar_id:8,changed:false,replayed:true}},
] as const;
it.each(replays.flatMap(entry=>['40003','08007'].map(code=>({...entry,code}))))('$entity / $code cannot acknowledge error data; only an explicit same-request replay can confirm it',async({entity,payload,receipt,code})=>{
 db.rpc.mockResolvedValueOnce({data:receipt,error:{code,message:'PRIVATE_MESSAGE',details:'PRIVATE_DETAILS',hint:'PRIVATE_HINT'}})
  .mockResolvedValueOnce({data:receipt,error:null});
 const first=await saveWorkspaceRecord(entity,71,payload,contract);
 expect(first).toEqual({success:false,uncertain:true,error:'Save unconfirmed. Keep the same values and retry safely to recover its result.'});
 expect(first).not.toHaveProperty('data');expect(JSON.stringify(first)).not.toMatch(/PRIVATE_(MESSAGE|DETAILS|HINT)/);
 expect(db.rpc).toHaveBeenCalledTimes(1);
 expect(await saveWorkspaceRecord(entity,71,payload,contract)).toEqual({success:true,data:receipt});
 const args={p_entity:entity,p_operation:contract.operationId,p_id:71,p_revision:'2',p_data:payload};
 expect(db.rpc.mock.calls).toEqual([['save_master_record',args],['save_master_record',args]]);
});

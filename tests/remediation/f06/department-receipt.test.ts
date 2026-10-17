import {beforeEach,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>db}));
import {saveWorkspaceRecord} from '@/server/workspace-save';
const contract={operationId:'66a00000-0000-4000-8000-000000000001',revision:'2'};
const good={id:71,revision:'3',changed:true,replayed:false,owner_company_id:1,branch_id:11};
beforeEach(()=>vi.resetAllMocks());
it.each([['wrong ID',{...good,id:72}],['unsafe ID',{...good,id:Number.MAX_SAFE_INTEGER+1}],['bad revision',{...good,revision:'oops'}],['missing result',{...good,changed:undefined}],['wrong company',{...good,owner_company_id:2}],['wrong branch',{...good,branch_id:12}],['missing branch',{...good,branch_id:undefined}]])('%s cannot acknowledge a department save',async(_name,data)=>{
 db.rpc.mockResolvedValue({data,error:null});expect(await saveWorkspaceRecord('departments',71,{owner_company_id:1,branch_id:11},contract)).toMatchObject({success:false,uncertain:true});
});
it('valid receipt preserves scope and no-op fields without inventing them',async()=>{db.rpc.mockResolvedValue({data:{...good,changed:false},error:null});expect(await saveWorkspaceRecord('departments',71,{owner_company_id:1,branch_id:11},contract)).toEqual({success:true,data:{...good,changed:false}});});
it.each(['40003','08007'])('%s cannot acknowledge error data; an explicit replay preserves the exact department request',async code=>{
 const payload={owner_company_id:1,branch_id:null,is_active:false};
 const receipt={...good,branch_id:null,changed:false,replayed:true};
 db.rpc.mockResolvedValueOnce({data:receipt,error:{code,message:'PRIVATE_MESSAGE',details:'PRIVATE_DETAILS',hint:'PRIVATE_HINT'}})
  .mockResolvedValueOnce({data:receipt,error:null});
 const first=await saveWorkspaceRecord('departments',71,payload,contract);
 expect(first).toEqual({success:false,uncertain:true,error:'Save unconfirmed. Keep the same values and retry safely to recover its result.'});
 expect(first).not.toHaveProperty('data');expect(JSON.stringify(first)).not.toMatch(/PRIVATE_(MESSAGE|DETAILS|HINT)/);
 expect(db.rpc).toHaveBeenCalledTimes(1);
 expect(await saveWorkspaceRecord('departments',71,payload,contract)).toEqual({success:true,data:receipt});
 const args={p_entity:'departments',p_operation:contract.operationId,p_id:71,p_revision:'2',p_data:payload};
 expect(db.rpc.mock.calls).toEqual([['save_workspace_record',args],['save_workspace_record',args]]);
});

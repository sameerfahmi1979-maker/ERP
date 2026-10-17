import {beforeEach,expect,it,vi} from 'vitest';
import type {CostCenterWithRelations} from '@/features/master-data/finance-basics/types';
const state=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:state.rpc})}));
import {attachFinanceReferenceLabels} from '@/server/finance-reference-labels';
const row=(id:number)=>({id,cost_center_code:'C'+id}) as CostCenterWithRelations;
const labels={owner_company:{company_code:'A',legal_name_en:'Company A'},branch:null,parent:null,type_label:null};
beforeEach(()=>vi.resetAllMocks());
it('returns every input row in order across bounded label batches',async()=>{
 state.rpc.mockImplementation(async(_name:string,{p_ids}:{p_ids:number[]})=>({data:Object.fromEntries(p_ids.map(id=>[id,labels])),error:null}));
 const result=await attachFinanceReferenceLabels('cost_centers',Array.from({length:1001},(_,i)=>row(i+1)));
 expect(state.rpc.mock.calls.map(c=>c[1].p_ids.length)).toEqual([1000,1]);expect(result.length).toBe(1001);
 expect(result[1000].id).toBe(1001);expect(result[0].owner_company?.legal_name_en).toBe('Company A');
});
it('rejects a missing label receipt instead of falsely displaying a global assignment',async()=>{
 state.rpc.mockResolvedValue({data:{},error:null});await expect(attachFinanceReferenceLabels('cost_centers',[row(1)])).rejects.toThrow('Finance reference labels unavailable');
});
it('does not silently accept labels for unsolicited records',async()=>{
 state.rpc.mockResolvedValue({data:{1:labels,2:labels},error:null});await expect(attachFinanceReferenceLabels('cost_centers',[row(1)])).rejects.toThrow('Finance reference labels unavailable');
});
it('a failed label batch cannot return a partial successful list',async()=>{
 state.rpc.mockResolvedValue({data:null,error:{message:'private infrastructure detail'}});await expect(attachFinanceReferenceLabels('cost_centers',[row(1)])).rejects.toThrow('Finance reference labels unavailable');
});
it('rejects unexpected sensitive metadata instead of forwarding it',async()=>{
 state.rpc.mockResolvedValue({data:{1:{...labels,secret:'not a real secret'}},error:null});await expect(attachFinanceReferenceLabels('cost_centers',[row(1)])).rejects.toThrow('Finance reference labels unavailable');
});
it('an empty authorized list needs no extra request',async()=>{
 expect(await attachFinanceReferenceLabels('cost_centers',[])).toEqual([]);expect(state.rpc).not.toHaveBeenCalled();
});

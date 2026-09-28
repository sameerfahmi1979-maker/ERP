import {beforeEach,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>db}));
import {saveWorkspaceRecord} from '@/server/workspace-save';
const contract={operationId:'0d028f75-3e6b-4f48-a14a-786bbd88a4cc',revision:'1'};
beforeEach(()=>vi.clearAllMocks());
it('calls the session-bound atomic RPC and validates its minimal receipt',async()=>{
 db.rpc.mockResolvedValue({data:{id:42,revision:'2',replayed:false},error:null});
 expect(await saveWorkspaceRecord('departments',42,{description:'test'},contract)).toEqual({success:true,data:{id:42,revision:'2',replayed:false}});
 expect(db.rpc).toHaveBeenCalledExactlyOnceWith('save_workspace_record',{p_entity:'departments',p_operation:contract.operationId,p_id:42,p_revision:'1',p_data:{description:'test'}});
});
it('rejects a missing update revision before reaching the database',async()=>{
 expect((await saveWorkspaceRecord('employees',42,{}, {...contract,revision:null})).success).toBe(false);expect(db.rpc).not.toHaveBeenCalled();
});
it.each(['P0409','42501','23505','23503','22023'])('known database rollback %s is not treated as an uncertain committed create',async code=>{
 db.rpc.mockResolvedValue({data:null,error:{code,message:'private database details'}});
 const r=await saveWorkspaceRecord('departments',42,{},contract);expect(r.success).toBe(false);expect(r.uncertain).not.toBe(true);expect(r.error).not.toContain('private database');
});
it.each([null,{id:42},{id:42,revision:'2'},{id:42,revision:'0',replayed:false}])('incomplete response retains operation identity: %j',async data=>{
 db.rpc.mockResolvedValue({data,error:null});expect((await saveWorkspaceRecord('departments',42,{},contract)).uncertain).toBe(true);
});
it('network exceptions remain uncertain and do not leak diagnostics',async()=>{
 db.rpc.mockRejectedValue(new Error('private transport detail'));const r=await saveWorkspaceRecord('departments',42,{},contract);expect(r.uncertain).toBe(true);expect(r.error).not.toContain('private');
});

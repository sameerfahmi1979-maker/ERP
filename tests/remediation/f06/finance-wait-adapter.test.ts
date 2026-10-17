// Actual finance adapter and scope helpers, offline auth/RPC/cache ports only.
import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),cache:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:m.auth}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.rpc})}));
vi.mock('next/cache',()=>({revalidatePath:m.cache}));
import {saveFinanceCenterRecord} from '@/server/finance-center-save';
const operationId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const contract={operationId,revision:'4'},receipt={id:7,revision:'5',changed:true,replayed:false};
const payload={is_active:false,sort_order:0,notes:null};
const privateDetail='SYNTHETIC_AUTHORITY_PRIVATE';
function principal(permission:string,global=true,systemAdmin=false){return {profile:{id:71,must_change_password:false},isAccountActive:true,
 permissionCodes:[permission],globalPermissionCodes:global?[permission]:[],roleCodes:systemAdmin?['system_admin']:['synthetic'],
 roleAssignments:[{roleId:1,roleCode:systemAdmin?'system_admin':'synthetic',ownerCompanyId:global?null:1,branchId:null,permissionCodes:[permission]}]};}
beforeEach(()=>{vi.resetAllMocks();m.rpc.mockResolvedValue({data:receipt,error:null});});
describe.each(['cost_centers','profit_centers'] as const)('%s authority boundary',entity=>{
 describe.each(['save','active','lock','retire'] as const)('%s',action=>{
  const permission=action==='lock'?'master_data.lookups.lock':'master_data.finance_basics.manage';
  const invoke=()=>saveFinanceCenterRecord(entity,action,7,payload,contract);
  const grant=(global=true)=>m.auth.mockResolvedValue(principal(permission,global,action==='retire'));
  it('keeps post-wait database denial definitive, private and one-dispatch',async()=>{
   grant();m.rpc.mockResolvedValue({data:null,error:{code:'42501',message:privateDetail,details:privateDetail,hint:privateDetail}});
   const result=await invoke();expect(result).toEqual({success:false,error:'This finance centre is locked, unavailable, or you no longer have permission to change it.'});
   expect(m.rpc.mock.calls).toEqual([['save_finance_center_record',{p_entity:entity,p_action:action,p_operation:operationId,p_id:7,p_revision:'4',p_data:payload}]]);
   expect(m.cache).not.toHaveBeenCalled();expect(JSON.stringify(result)).not.toContain(privateDetail);
  });
  it('does not upgrade company-scoped authority to global',async()=>{
   grant(false);expect((await invoke()).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();expect(m.cache).not.toHaveBeenCalled();
  });
  it('does not substitute unrelated global permission',async()=>{
   m.auth.mockResolvedValue(principal('unrelated.manage'));expect((await invoke()).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();
  });
  it.each([receipt,{...receipt,revision:'4',changed:false},{...receipt,replayed:true}])('preserves matching receipt and original request on refresh failure %#',async value=>{
   grant();m.rpc.mockResolvedValue({data:value,error:null});m.cache.mockImplementation(()=>{throw Error(privateDetail);});
   expect(await invoke()).toEqual({success:true,data:value});
   expect(m.rpc).toHaveBeenCalledExactlyOnceWith('save_finance_center_record',{p_entity:entity,p_action:action,p_operation:operationId,p_id:7,p_revision:'4',p_data:payload});
   expect(m.cache).toHaveBeenCalledOnce();
  });
  it.each(['40003','08007'])('retains uncertainty for unknown %s',async code=>{
   grant();m.rpc.mockResolvedValue({data:null,error:{code,message:privateDetail}});
   expect(await invoke()).toMatchObject({success:false,uncertain:true});expect(m.rpc).toHaveBeenCalledOnce();expect(m.cache).not.toHaveBeenCalled();
  });
  it('does not accept another record receipt',async()=>{
   grant();m.rpc.mockResolvedValue({data:{...receipt,id:8},error:null});
   expect(await invoke()).toMatchObject({success:false,uncertain:true});expect(m.cache).not.toHaveBeenCalled();
  });
 });
});

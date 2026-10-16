import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),auth:vi.fn(),client:vi.fn(),revalidate:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.auth,hasGlobalPermission:(ctx:{allowed:boolean})=>ctx.allowed,hasPermission:()=>false}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
vi.mock('next/cache',()=>({revalidatePath:m.revalidate}));
vi.mock('@/lib/logger',()=>({logger:{error:vi.fn()}}));
import * as actions from '@/server/actions/master-data/lookups';
import {saveLookupMutation} from '@/server/lookup-save';
const operationId='11111111-1111-4111-8111-111111111111';
const categoryContract={operationId,revision:'2',categoryId:null,categoryRevision:null};
const valueContract={...categoryContract,categoryId:8,categoryRevision:'6'};
type RpcArgs={p_kind:string;p_action:string;p_id:number|null;p_revision:string|null;p_category_id:number|null;p_category_revision:string|null;p_operation:string};
function answer(_rpc:string,p:RpcArgs){return {data:{id:p.p_id??501,revision:p.p_id?String(Number(p.p_revision)+1):'1',category_id:p.p_category_id??p.p_id??501,category_revision:p.p_kind==='category'?(p.p_id?String(Number(p.p_revision)+1):'1'):String(Number(p.p_category_revision)+1),kind:p.p_kind,action:p.p_action,operation_id:p.p_operation,changed:true,replayed:false},error:null};}
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({allowed:true});m.client.mockResolvedValue({rpc:m.rpc});m.rpc.mockImplementation(answer);});
const cases=[
 ['create category',()=>actions.createLookupCategory({category_code:'QA_TEST',category_name_en:'Synthetic'} as never,{...categoryContract,revision:null})],
 ['update category',()=>actions.updateLookupCategory({id:9,category_name_en:'Synthetic'},categoryContract)],
 ['category status',()=>actions.toggleLookupCategoryStatus(9,false,undefined,categoryContract)],
 ['category lock',()=>actions.toggleLookupCategoryLock(9,true,categoryContract)],
 ['create value',()=>actions.createLookupValue({category_id:8,value_code:'QA',value_label_en:'Synthetic'} as never,{...valueContract,revision:null})],
 ['update value',()=>actions.updateLookupValue({id:9,value_label_en:'Synthetic'},valueContract)],
 ['value status',()=>actions.toggleLookupValueStatus(9,false,undefined,valueContract)],
 ['value lock',()=>actions.toggleLookupValueLock(9,true,valueContract)],
 ['value default',()=>actions.setDefaultLookupValue(9,8,valueContract)],
] as const;
it.each(cases)('%s is one governed RPC, no separate table/audit requests',async(_name,run)=>{const result=await run();expect(result.success).toBe(true);expect(m.rpc).toHaveBeenCalledOnce();expect(m.rpc.mock.calls[0][0]).toBe('save_lookup_configuration');expect(m.revalidate).toHaveBeenCalledTimes(4);});
it.each(cases)('%s denies absent global capability before creating a client',async(_name,run)=>{m.auth.mockResolvedValue({allowed:false});const r=await run();expect(r.success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();expect(m.client).not.toHaveBeenCalled();});
it.each(cases)('%s safely rejects a malformed receipt without acknowledging/revalidating',async(_name,run)=>{m.rpc.mockResolvedValue({data:{id:9},error:null});expect(await run()).toMatchObject({success:false,uncertain:true});expect(m.revalidate).not.toHaveBeenCalled();});
it('does not accept mismatched category/contract identity or missing operation',async()=>{expect((await actions.setDefaultLookupValue(9,7,valueContract)).success).toBe(false);expect((await actions.createLookupCategory({category_code:'QA',category_name_en:'QA'} as never)).success).toBe(false);expect((await actions.updateLookupValue({id:9,value_label_en:'QA'},{...valueContract,operationId:'bad'})).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
it.each(['is_default','is_locked','is_system','created_by'])('rejects generic %s smuggling before RPC',async key=>{expect((await actions.updateLookupValue({id:9,[key]:true} as never,valueContract)).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
it('preserves null/false/zero payloads without arbitrary field coercion',async()=>{await actions.updateLookupValue({id:9,description:null,sort_order:0,is_active:false},valueContract);expect(m.rpc.mock.calls[0][1].p_data).toEqual({description:null,sort_order:0,is_active:false});});
it('returns committed success even if all cache callbacks fail',async()=>{m.revalidate.mockImplementation(()=>{throw Error('PRIVATE_CACHE');});const r=await cases[1][1]();expect(r).toMatchObject({success:true,refreshWarning:true});expect(JSON.stringify(r)).not.toContain('PRIVATE_CACHE');expect(m.rpc).toHaveBeenCalledOnce();});
it.each(['42501','PT409','PT404','23505','23514','22023'])('does not expose raw database/provider text for %s',async code=>{m.rpc.mockResolvedValue({data:null,error:{code,message:'PRIVATE_SQL_OR_METADATA'}});const r=await cases[8][1]();expect(r).toMatchObject({success:false,uncertain:false});expect(JSON.stringify(r)).not.toContain('PRIVATE_SQL_OR_METADATA');expect(m.revalidate).not.toHaveBeenCalled();});
it('distinguishes failure before dispatch from a lost committed response',async()=>{m.auth.mockRejectedValueOnce(Error('PRIVATE_AUTH'));expect(await cases[1][1]()).toMatchObject({success:false,uncertain:false});m.rpc.mockRejectedValueOnce(Error('PRIVATE_TRANSPORT'));expect(await cases[1][1]()).toMatchObject({success:false,uncertain:true});});
it('validates original parent context before RPC',async()=>{expect(await saveLookupMutation(9,{kind:'value',action:'default',categoryId:7,categoryRevision:'6',data:{}},valueContract)).toMatchObject({success:false});expect(m.rpc).not.toHaveBeenCalled();});

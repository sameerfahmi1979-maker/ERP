import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),from:vi.fn(),audit:vi.fn(),cache:vi.fn(),read:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:m.auth}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.rpc,from:m.from})}));
vi.mock('@/server/actions/audit',()=>({logAudit:m.audit}));
vi.mock('@/server/party-child-read-authority',()=>({authorizePartyChildRead:m.read}));
vi.mock('next/cache',()=>({revalidatePath:m.cache}));
import {addPartyServiceCategory,removePartyServiceCategory,getPartyServiceCategoryAssignments,getServiceCategoriesForSelect} from '@/server/actions/master-data/party-service-categories';
const add={party_id:10,service_category_id:20,is_primary:false,remarks:null};
const contract={operationId:'5e6a4fad-ad32-4c77-9774-78411fbdb954',revision:null};
const receipt={id:7,party_id:10,service_category_id:20,revision:'1',changed:true,replayed:false,is_active:true};
const capabilities=['master_data.parties.manage_services','master_data.parties.view'];
beforeEach(()=>{
 vi.resetAllMocks();m.auth.mockResolvedValue({profile:{id:1},isAccountActive:true,permissionCodes:capabilities,globalPermissionCodes:capabilities,roleCodes:[],roleAssignments:[]});
 const chain={select:vi.fn(),eq:vi.fn(),insert:vi.fn(),update:vi.fn(),order:vi.fn(),single:vi.fn(async()=>({data:{id:7},error:null})),then:(resolve:(v:unknown)=>unknown)=>resolve({data:[],error:null,count:0})};
 for(const key of ['select','eq','insert','update','order'] as const)chain[key].mockReturnValue(chain);m.from.mockReturnValue(chain);
 m.rpc.mockResolvedValue({data:receipt,error:null});m.read.mockResolvedValue({success:true,client:{from:m.from}});
});
it('requires a retained create operation',async()=>{expect((await addPartyServiceCategory(add)).success).toBe(false);expect(m.from).not.toHaveBeenCalled();});
it('rejects protected/unknown assignment fields',async()=>{expect((await Reflect.apply(addPartyServiceCategory,null,[{...add,is_active:false},contract])).success).toBe(false);expect(m.from).not.toHaveBeenCalled();});
it('rejects scoped-only writers',async()=>{m.auth.mockResolvedValue({profile:{id:1},isAccountActive:true,permissionCodes:capabilities,globalPermissionCodes:[],roleCodes:[],roleAssignments:[]});expect((await Reflect.apply(addPartyServiceCategory,null,[add,contract])).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled();});
it('requires global party view as well as manage services',async()=>{m.auth.mockResolvedValue({profile:{id:1},isAccountActive:true,permissionCodes:capabilities,globalPermissionCodes:[capabilities[0]],roleCodes:[],roleAssignments:[]});expect((await Reflect.apply(addPartyServiceCategory,null,[add,contract])).success).toBe(false);});
it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1])('rejects invalid retirement ID %s',async id=>{expect((await removePartyServiceCategory(id)).success).toBe(false);expect(m.from).not.toHaveBeenCalled();});
it('uses only the atomic RPC and preserves false',async()=>{
 expect(await Reflect.apply(addPartyServiceCategory,null,[add,contract])).toEqual({success:true,data:receipt});
 expect(m.rpc).toHaveBeenCalledWith('save_party_service_assignment',{p_operation:contract.operationId,p_action:'add',p_party:10,p_id:null,p_revision:null,p_data:{service_category_id:20,is_primary:false,remarks:null}});expect(m.from).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
});
it('does not turn a confirmed commit into cache failure',async()=>{m.cache.mockImplementation(()=>{throw Error('PRIVATE');});expect(await Reflect.apply(addPartyServiceCategory,null,[add,contract])).toEqual({success:true,data:receipt});});
it('keeps transport loss uncertain',async()=>{m.rpc.mockRejectedValue(Error('PRIVATE'));expect(await Reflect.apply(addPartyServiceCategory,null,[add,contract])).toMatchObject({success:false,uncertain:true});});
it('rejects a receipt for another parent',async()=>{m.rpc.mockResolvedValue({data:{...receipt,party_id:11},error:null});expect(await Reflect.apply(addPartyServiceCategory,null,[add,contract])).toMatchObject({success:false,uncertain:true});});
it('missing removal is not reported as success',async()=>{m.rpc.mockResolvedValue({data:null,error:{code:'PT404',message:'PRIVATE'}});const result=await Reflect.apply(removePartyServiceCategory,null,[7,{...contract,revision:'1',partyId:10}]);expect(result.success).toBe(false);expect(result.error).not.toContain('PRIVATE');expect(m.audit).not.toHaveBeenCalled();});
it('denies a missing/hidden parent before reading its assignments',async()=>{m.read.mockResolvedValue({success:false,error:'Party not found.'});expect((await getPartyServiceCategoryAssignments(10)).success).toBe(false);expect(m.from).not.toHaveBeenCalled();});
it('denies category choices without global party view',async()=>{m.auth.mockResolvedValue({profile:{id:1},isAccountActive:true,permissionCodes:capabilities,globalPermissionCodes:[],roleCodes:[],roleAssignments:[]});expect((await getServiceCategoriesForSelect()).success).toBe(false);expect(m.from).not.toHaveBeenCalled();});

for(const [label,invoke] of [['add',()=>addPartyServiceCategory(add,contract)],['remove',()=>removePartyServiceCategory(7,{...contract,revision:'1',partyId:10})]] as const)it.each(['40003','08007'])(`W18 ${label} %s dispatches once with safe uncertainty`,async code=>{
 m.rpc.mockResolvedValueOnce({error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}}).mockResolvedValueOnce({error:{code:'40001'}});
 expect(await invoke()).toMatchObject({success:false,uncertain:true});expect(m.rpc).toHaveBeenCalledOnce();expect(m.cache).not.toHaveBeenCalled();
 const first=m.rpc.mock.calls[0];expect(first).toEqual(w18Expected(label));expect((await invoke()).success).toBe(false);expect(m.rpc).toHaveBeenCalledTimes(2);expect(m.rpc.mock.calls[1]).toEqual(first);

 const confirmed={...receipt,is_active:label==='add',replayed:true};m.rpc.mockResolvedValue({data:confirmed,error:null});expect(await invoke()).toEqual({success:true,data:confirmed});expect(m.rpc.mock.calls).toEqual([first,first,first]);
 // Explicit repeated calls verify request identity, not the excluded UI lifetime.
});

// W18: actual dispatched adapter, exact codes only; not a transaction/native oracle.
const w18Unknown:unknown[]=['40003','08007','40ZZZ','PGRST000','XX000',undefined,null,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01','23p01',40001,42501,['40001'],new String('40001'), 'toString', 'constructor', '__proto__'];
it.each([...w18Unknown,...["55000","57015"]].map(code=>({code})))('W18 unknown code %# retains uncertainty without guidance',async({code})=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 const result=await addPartyServiceCategory(add,contract);
 expect(m.rpc.mock.calls).toEqual([w18Expected('add')]);expect(result).toMatchObject({success:false,uncertain:true,error:expect.stringMatching(/unconfirmed/i)});
 expect(JSON.stringify(result)).not.toMatch(/W18_PRIVATE|no .*committed|rolled back|were rejected|was rejected/i);expect(result).not.toHaveProperty('fieldErrors');expect(m.cache).not.toHaveBeenCalled();
});
it.each(["40000","40001","40002","40P01","22023","23514","42501","P0001","PT404","PT409","PT123","55P03","57014"])('W18 exact known code %s preserves definite rejection',async code=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC'}});const result=await addPartyServiceCategory(add,contract);
 expect(m.rpc).toHaveBeenCalledOnce();expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);expect(JSON.stringify(result)).not.toContain('W18_PRIVATE');expect(m.cache).not.toHaveBeenCalled();
});
it('W18 does not coerce an object into a mapped SQLSTATE',async()=>{
 const toString=vi.fn(()=>'PT409'),code={toString};m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 expect(await addPartyServiceCategory(add,contract)).toMatchObject({success:false,uncertain:true});expect(toString).not.toHaveBeenCalled();expect(m.rpc).toHaveBeenCalledOnce();
});

function w18Expected(label:string){return ['save_party_service_assignment',{p_operation:contract.operationId,p_action:label,p_party:10,p_id:label==='add'?null:7,p_revision:label==='add'?null:'1',p_data:label==='add'?{service_category_id:20,is_primary:false,remarks:null}:{}}];}

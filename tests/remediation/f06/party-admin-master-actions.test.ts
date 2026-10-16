import {beforeEach, expect, it, vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),audit:vi.fn(),query:vi.fn(),cache:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:m.auth}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.rpc,from:m.query})}));
vi.mock('@/server/actions/audit',()=>({logAudit:m.audit}));
vi.mock('next/cache',()=>({revalidatePath:m.cache}));
import {updateServiceCategory,updateRelationshipType,createServiceCategory,createRelationshipType,getServiceCategoriesAdmin,getRelationshipTypesAdmin} from '@/server/actions/master-data/party-admin-masters';
const contract={operationId:'5e6a4fad-ad32-4c77-9774-78411fbdb954',revision:'2'};
const receipt={id:7,revision:'3',changed:true,replayed:false};
const permissions=['master_data.parties.manage_services','master_data.parties.manage_relationships'];
beforeEach(()=>{
 vi.resetAllMocks();m.auth.mockResolvedValue({profile:{id:1},isAccountActive:true,permissionCodes:permissions,globalPermissionCodes:permissions,roleCodes:[],roleAssignments:[]});
 const query={select:vi.fn(),eq:vi.fn(),single:vi.fn(),update:vi.fn(),insert:vi.fn(),order:vi.fn(),maybeSingle:vi.fn()};
 Object.values(query).forEach(fn=>fn.mockReturnValue(query));query.single.mockResolvedValue({data:null,error:null});query.eq.mockReturnValue({...query,then:(resolve:(v:object)=>unknown)=>resolve({data:null,error:null})});m.query.mockReturnValue(query);
 m.rpc.mockResolvedValue({data:receipt,error:null});
});

// W18: actual dispatched adapter, exact codes only; not a transaction/native oracle.
const w18Unknown:unknown[]=['40003','08007','40ZZZ','PGRST000','XX000',undefined,null,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01','23p01',40001,42501,['40001'],new String('40001'), 'toString', 'constructor', '__proto__'];
it.each([...w18Unknown,...["55000","57015"]].map(code=>({code})))('W18 unknown code %# retains uncertainty without guidance',async({code})=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 const result=await updateServiceCategory(7,{is_active:false},contract);
 expect(m.rpc.mock.calls).toEqual([w18Expected('category')]);expect(result).toMatchObject({success:false,uncertain:true,error:expect.stringMatching(/unconfirmed/i)});
 expect(JSON.stringify(result)).not.toMatch(/W18_PRIVATE|no .*committed|rolled back|were rejected|was rejected/i);expect(result).not.toHaveProperty('fieldErrors');expect(m.cache).not.toHaveBeenCalled();
});
it.each(["40000","40001","40002","40P01","22023","23514","42501","P0001","PT404","PT409","PT123","55P03","57014"])('W18 exact known code %s preserves definite rejection',async code=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC'}});const result=await updateServiceCategory(7,{is_active:false},contract);
 expect(m.rpc).toHaveBeenCalledOnce();expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);expect(JSON.stringify(result)).not.toContain('W18_PRIVATE');expect(m.cache).not.toHaveBeenCalled();
});
it('W18 does not coerce an object into a mapped SQLSTATE',async()=>{
 const toString=vi.fn(()=>'PT409'),code={toString};m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 expect(await updateServiceCategory(7,{is_active:false},contract)).toMatchObject({success:false,uncertain:true});expect(toString).not.toHaveBeenCalled();expect(m.rpc).toHaveBeenCalledOnce();
});
it.each([updateServiceCategory,updateRelationshipType])('rejects unknown protected update fields before mutation',async action=>{
 expect((await Reflect.apply(action,null,[7,{is_system:false},contract])).success).toBe(false);expect(m.query).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
});
it.each([updateServiceCategory,updateRelationshipType])('requires the edit operation and opening revision',async action=>{
 expect((await action(7,{is_active:false})).success).toBe(false);expect(m.query).not.toHaveBeenCalled();
});
it.each([updateServiceCategory,updateRelationshipType])('rejects scoped-only catalogue writers',async action=>{
 m.auth.mockResolvedValue({profile:{id:1},isAccountActive:true,permissionCodes:permissions,globalPermissionCodes:[],roleCodes:[],roleAssignments:[]});
 expect((await Reflect.apply(action,null,[7,{is_active:false},contract])).success).toBe(false);expect(m.query).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
});
it.each([updateServiceCategory,updateRelationshipType])('reports missing targets as failure without a separate audit',async action=>{
 m.rpc.mockResolvedValue({data:null,error:{code:'PT404',message:'PRIVATE'}});
 const result=await Reflect.apply(action,null,[7,{is_active:false},contract]);expect(result.success).toBe(false);expect(result.error).not.toContain('PRIVATE');expect(m.audit).not.toHaveBeenCalled();
});
it.each([[updateServiceCategory,'party_service_categories_master'],[updateRelationshipType,'party_relationship_types']] as const)('uses atomic RPC and preserves false/zero',async(action,entity)=>{
 expect(await Reflect.apply(action,null,[7,{is_active:false,sort_order:0},contract])).toEqual({success:true,data:receipt});
 expect(m.rpc).toHaveBeenCalledWith('save_party_admin_master',{p_entity:entity,p_operation:contract.operationId,p_id:7,p_revision:'2',p_data:{is_active:false,sort_order:0}});expect(m.query).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
});
it.each([[createServiceCategory,{category_code:'TEST',category_name_en:'Test'}],[createRelationshipType,{relationship_code:'TEST',name_en:'Test'}]] as const)('requires create identity without an edit revision',async(action,payload)=>{
 expect((await Reflect.apply(action,null,[payload,contract])).success).toBe(false);expect(m.query).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
});
it.each([getServiceCategoriesAdmin,getRelationshipTypesAdmin])('denies unauthorized catalogue administration reads',async action=>{
 m.auth.mockResolvedValue({profile:{id:1},isAccountActive:true,permissionCodes:permissions,globalPermissionCodes:[],roleCodes:[],roleAssignments:[]});
 expect((await action()).success).toBe(false);expect(m.query).not.toHaveBeenCalled();
});
it.each([null,{id:99,revision:'3',changed:true,replayed:false},{id:7,revision:'3'},{...receipt,revision:0}])('keeps incomplete receipt %j retryable',async data=>{
 m.rpc.mockResolvedValue({data,error:null});expect(await updateServiceCategory(7,{is_active:false},contract)).toMatchObject({success:false,uncertain:true});expect(m.cache).not.toHaveBeenCalled();
});
it.each(['PT409','23505','23503','42501','55P03'])('redacts authoritative %s rollback without claiming an uncertain commit',async code=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'PRIVATE'}});const result=await updateRelationshipType(7,{description:'Updated'},contract);expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('transport loss remains uncertain and cache failure preserves a confirmed receipt',async()=>{
 m.rpc.mockRejectedValueOnce(Error('PRIVATE'));expect(await updateServiceCategory(7,{is_active:false},contract)).toMatchObject({success:false,uncertain:true});
 m.cache.mockImplementation(()=>{throw Error('PRIVATE');});expect(await updateServiceCategory(7,{is_active:false},contract)).toEqual({success:true,data:receipt});
});
it('description-only patch does not inject activation or sort order',async()=>{
 await updateRelationshipType(7,{description:'Updated'},contract);expect(m.rpc.mock.calls[0][1].p_data).toEqual({description:'Updated'});
});

for(const [label,invoke] of [['category',()=>updateServiceCategory(7,{is_active:false},contract)],['relationship',()=>updateRelationshipType(7,{is_active:false},contract)]] as const)it.each(['40003','08007'])(`W18 ${label} %s dispatches once with safe uncertainty`,async code=>{
 m.rpc.mockResolvedValueOnce({error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}}).mockResolvedValueOnce({error:{code:'40001'}});
 expect(await invoke()).toMatchObject({success:false,uncertain:true});expect(m.rpc).toHaveBeenCalledOnce();expect(m.cache).not.toHaveBeenCalled();
 const first=m.rpc.mock.calls[0];expect(first).toEqual(w18Expected(label));expect((await invoke()).success).toBe(false);expect(m.rpc).toHaveBeenCalledTimes(2);expect(m.rpc.mock.calls[1]).toEqual(first);
 m.rpc.mockResolvedValue({data:{...receipt,replayed:true},error:null});expect((await invoke()).success).toBe(true);expect(m.rpc).toHaveBeenCalledTimes(3);expect(m.rpc.mock.calls[2]).toEqual(first);
 // Explicit repeated calls verify request identity, not the excluded UI lifetime.
});

function w18Expected(label:string){return ['save_party_admin_master',{p_entity:label==='category'?'party_service_categories_master':'party_relationship_types',p_operation:contract.operationId,p_id:7,p_revision:'2',p_data:{is_active:false}}];}

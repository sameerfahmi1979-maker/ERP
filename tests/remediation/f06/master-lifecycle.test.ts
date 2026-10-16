import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn(),allowed:true,revalidate:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:mock.rpc})}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({}),hasPermission:()=>mock.allowed}));
vi.mock('next/cache',()=>({revalidatePath:mock.revalidate}));
import {setMasterArchived} from '@/server/master-lifecycle';
const contract={operationId:'1ba5d939-132e-48a7-adcd-123456789abc',revision:'1'};
beforeEach(()=>{vi.resetAllMocks();mock.allowed=true;mock.rpc.mockResolvedValue({data:{id:8,revision:'2',replayed:false,archived:true,changed:true,calendar_id:44},error:null});});
it('sends trusted contract through the caller RPC and invalidates the actual parent',async()=>{
 const r=await setMasterArchived('work_shifts',8,true,contract);expect(r.success).toBe(true);
 expect(mock.rpc).toHaveBeenCalledWith('set_master_record_archived',{p_entity:'work_shifts',p_id:8,p_archived:true,p_revision:'1',p_operation:contract.operationId});
 expect(mock.revalidate).toHaveBeenCalledWith('/admin/common-master-data/work-calendars/record/44');
});
it('requires capability before RPC',async()=>{mock.allowed=false;expect((await setMasterArchived('departments',8,true,contract)).success).toBe(false);expect(mock.rpc).not.toHaveBeenCalled();});
for(const [entity,id,revision] of [['arbitrary_table',8,'1'],['departments',-1,'1'],['departments',8,null]] as const)it(`rejects malformed lifecycle ${entity}/${id}/${revision}`,async()=>{
 expect((await setMasterArchived(entity,id,true,{...contract,revision})).success).toBe(false);expect(mock.rpc).not.toHaveBeenCalled();
});
for(const code of ['P0409','42501','23503','22023'])it(`rejects ${code} with a safe useful error and no false invalidation`,async()=>{
 mock.rpc.mockResolvedValue({error:{code,message:'sensitive-internal-detail'}});
 const r=await setMasterArchived('departments',8,true,contract);expect(r.success).toBe(false);expect(r.error).not.toContain('sensitive-internal-detail');expect(r.uncertain).toBeFalsy();expect(mock.revalidate).not.toHaveBeenCalled();
});
it('preserves uncertain transport outcome for replay',async()=>{mock.rpc.mockRejectedValue(Error('lost reply'));const r=await setMasterArchived('departments',8,true,contract);expect(r.uncertain).toBe(true);expect(r.success).toBe(false);});
it('does not accept incomplete success data',async()=>{mock.rpc.mockResolvedValue({data:{id:8},error:null});const r=await setMasterArchived('departments',8,true,contract);expect(r.uncertain).toBe(true);expect(mock.revalidate).not.toHaveBeenCalled();});
it('returns truthful no-op without claiming a record change',async()=>{mock.rpc.mockResolvedValue({data:{id:8,revision:'1',replayed:false,archived:false,changed:false,calendar_id:null},error:null});const r=await setMasterArchived('departments',8,false,contract);expect(r.success).toBe(true);expect(r.changed).toBe(false);});
it.each([
 ['wrong record',{id:9,revision:'2',replayed:false,archived:true,changed:true,calendar_id:44}],
 ['wrong state',{id:8,revision:'2',replayed:false,archived:false,changed:true,calendar_id:44}],
 ['missing parent',{id:8,revision:'2',replayed:false,archived:true,changed:true,calendar_id:null}],
])('rejects %s lifecycle receipt and does not invalidate an unrelated record',async(_label,data)=>{
 mock.rpc.mockResolvedValue({data,error:null});expect(await setMasterArchived('work_shifts',8,true,contract)).toMatchObject({success:false,uncertain:true});expect(mock.revalidate).not.toHaveBeenCalled();
});
for(const entity of ['departments','work_calendars','work_shifts'] as const)for(const archived of [true,false]){
 const paths=entity==='departments'?['/admin/common-master-data/departments']:['/admin/common-master-data/work-calendars',`/admin/common-master-data/work-calendars/record/${entity==='work_shifts'?44:8}`,'/admin/hr/time/shifts'];
 it.each(paths)(`${entity} archived=${archived}: confirmed result survives cache failure at %s`,async failed=>{
  const data={id:8,revision:'2',replayed:false,archived,changed:true,calendar_id:entity==='work_shifts'?44:null};
  mock.rpc.mockResolvedValue({data,error:null});mock.revalidate.mockImplementation(path=>{if(path===failed)throw Error('private cache');});
  expect(await setMasterArchived(entity,8,archived,contract)).toEqual({success:true,data,changed:true,archived});
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('set_master_record_archived',{p_entity:entity,p_id:8,p_archived:archived,p_revision:'1',p_operation:contract.operationId});
  expect(mock.revalidate.mock.calls).toEqual(paths.map(path=>[path]));
 });
 it.each([{changed:false,replayed:false},{changed:true,replayed:true}])(`${entity} archived=${archived}: preserves %j despite every cache fault`,async flags=>{
  const data={id:8,revision:'2',archived,calendar_id:entity==='work_shifts'?44:null,...flags};
  mock.rpc.mockResolvedValue({data,error:null});mock.revalidate.mockImplementation(()=>{throw Error('private');});
  expect(await setMasterArchived(entity,8,archived,contract)).toEqual({success:true,data,changed:flags.changed,archived});
  expect(mock.rpc).toHaveBeenCalledOnce();expect(mock.revalidate.mock.calls).toEqual(paths.map(path=>[path]));
 });
}

for(const [label,invoke] of (['departments','work_calendars','work_shifts'] as const).flatMap(entity=>[true,false].map(archived=>[entity+'/'+archived,()=>setMasterArchived(entity,8,archived,contract)] as const)))it.each(['40003','08007'])(`W18 ${label} %s dispatches once with safe uncertainty`,async code=>{
 mock.rpc.mockResolvedValueOnce({error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}}).mockResolvedValueOnce({error:{code:'40001'}});
 expect(await invoke()).toMatchObject({success:false,uncertain:true});expect(mock.rpc).toHaveBeenCalledOnce();expect(mock.revalidate).not.toHaveBeenCalled();
 const first=mock.rpc.mock.calls[0];expect(first).toEqual(w18Expected(label));expect((await invoke()).success).toBe(false);expect(mock.rpc).toHaveBeenCalledTimes(2);expect(mock.rpc.mock.calls[1]).toEqual(first);

 // Explicit repeated calls verify request identity, not the excluded UI lifetime.
});

// W18: actual dispatched adapter, exact codes only; not a transaction/native oracle.
const w18Unknown:unknown[]=['40003','08007','40ZZZ','PGRST000','XX000',undefined,null,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01','23p01',40001,42501,['40001'],new String('40001'), 'toString', 'constructor', '__proto__'];
it.each([...w18Unknown,...["PT123","PT404","PT409","55P03","55000","57014","57015"]].map(code=>({code})))('W18 unknown code %# retains uncertainty without guidance',async({code})=>{
 mock.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 const result=await setMasterArchived('departments',8,true,contract);
 expect(mock.rpc.mock.calls).toEqual([w18Expected('departments/true')]);expect(result).toMatchObject({success:false,uncertain:true,error:expect.stringMatching(/unconfirmed/i)});
 expect(JSON.stringify(result)).not.toMatch(/W18_PRIVATE|no .*committed|rolled back|were rejected|was rejected/i);expect(result).not.toHaveProperty('fieldErrors');expect(mock.revalidate).not.toHaveBeenCalled();
});
it.each(["40000","40001","40002","40P01","22023","23514","42501","P0001"])('W18 exact known code %s preserves definite rejection',async code=>{
 mock.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC'}});const result=await setMasterArchived('departments',8,true,contract);
 expect(mock.rpc).toHaveBeenCalledOnce();expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);expect(JSON.stringify(result)).not.toContain('W18_PRIVATE');expect(mock.revalidate).not.toHaveBeenCalled();
});
it('W18 does not coerce an object into a mapped SQLSTATE',async()=>{
 const toString=vi.fn(()=>'PT409'),code={toString};mock.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 expect(await setMasterArchived('departments',8,true,contract)).toMatchObject({success:false,uncertain:true});expect(toString).not.toHaveBeenCalled();expect(mock.rpc).toHaveBeenCalledOnce();
});

function w18Expected(label:string){return ['set_master_record_archived',{p_entity:label.split('/')[0],p_id:8,p_archived:label.split('/')[1]==='true',p_revision:'1',p_operation:contract.operationId}];}

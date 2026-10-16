// Actual server adapter and schemas; database responses and auth are explicit doubles.
import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),refresh:vi.fn(),allowed:true}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({}),hasGlobalPermission:()=>m.allowed}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.rpc})}));
vi.mock('next/cache',()=>({revalidatePath:m.refresh}));
import {saveHrLookup} from '@/server/hr-lookup-save';
import {hrLookupTables,hrSettingsTables} from '@/lib/hr/settings-save-contract';
const contract={operationId:'aabe0d34-468e-4a11-a201-6997b807724d',revision:'2'};
beforeEach(()=>{vi.resetAllMocks();m.allowed=true;m.rpc.mockResolvedValue({data:{id:9,revision:'3',entity:'hr_grades',changed:true,replayed:false},error:null});});
it.each([{id:88},{created_by:88},{workspace_revision:100},{name_en:'  '},{sort_order:1.2},{is_active:'false'},{grade_level:0},{description:'a'.repeat(1001)}])('rejects invalid or protected update %j before database execution',async input=>{expect((await saveHrLookup('hr_grades',9,input,contract)).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
it.each(hrLookupTables)('%s creates using a complete operation contract and unchanged false/zero',async table=>{m.rpc.mockResolvedValue({data:{id:9,revision:'1',entity:table,changed:true,replayed:false},error:null});expect((await saveHrLookup(table,null,{code:'F06_TEST',name_en:'  Name  ',is_active:false,sort_order:0},{...contract,revision:null})).success).toBe(true);expect(m.rpc).toHaveBeenCalledWith('save_hr_lookup',expect.objectContaining({p_table:table,p_operation:contract.operationId,p_data:{code:'F06_TEST',name_en:'Name',is_active:false,sort_order:0}}));});
it('missing-record error is truthful and contains no database details',async()=>{m.rpc.mockResolvedValue({data:null,error:{code:'PT404',message:'PRIVATE DATABASE'}});const r=await saveHrLookup('hr_grades',9,{name_en:'Name'},contract);expect(r).toMatchObject({success:false,error:expect.stringMatching(/no longer available/)});expect(JSON.stringify(r)).not.toContain('PRIVATE');});
it('a mismatched receipt is uncertain and cannot close a form',async()=>{m.rpc.mockResolvedValue({data:{id:88,revision:'3',entity:'hr_grades',changed:true,replayed:false},error:null});expect(await saveHrLookup('hr_grades',9,{name_en:'Name'},contract)).toMatchObject({success:false,uncertain:true});});
it('transport rejection is uncertain without exposing raw diagnostics',async()=>{m.rpc.mockRejectedValue(Error('PRIVATE endpoint'));const r=await saveHrLookup('hr_grades',9,{name_en:'Name'},contract);expect(r).toMatchObject({success:false,uncertain:true});expect(JSON.stringify(r)).not.toContain('PRIVATE');});
it('a revoked global permission denies even a potential receipt replay',async()=>{m.allowed=false;expect((await saveHrLookup('hr_grades',9,{name_en:'Name'},contract)).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});

for(const [label,invoke] of hrSettingsTables.flatMap(table=>(['save','archive','restore'] as const).map(action=>[table+'/'+action,()=>saveHrLookup(table,9,{},contract,action)] as const)))it.each(['40003','08007'])(`W18 ${label} %s dispatches once with safe uncertainty`,async code=>{
 m.rpc.mockResolvedValueOnce({error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}}).mockResolvedValueOnce({error:{code:'40001'}});
 expect(await invoke()).toMatchObject({success:false,uncertain:true});expect(m.rpc).toHaveBeenCalledOnce();expect(m.refresh).not.toHaveBeenCalled();
 const first=m.rpc.mock.calls[0];expect(first).toEqual(w18Expected(label));expect((await invoke()).success).toBe(false);expect(m.rpc).toHaveBeenCalledTimes(2);expect(m.rpc.mock.calls[1]).toEqual(first);

 // Explicit repeated calls verify request identity, not the excluded UI lifetime.
});

// W18: actual dispatched adapter, exact codes only; not a transaction/native oracle.
const w18Unknown:unknown[]=['40003','08007','40ZZZ','PGRST000','XX000',undefined,null,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01','23p01',40001,42501,['40001'],new String('40001'), 'toString', 'constructor', '__proto__'];
it.each([...w18Unknown,...["55P03","55000","57014","57015"]].map(code=>({code})))('W18 unknown code %# retains uncertainty without guidance',async({code})=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 const result=await saveHrLookup('hr_grades',9,{name_en:'Name'},contract);
 expect(m.rpc.mock.calls).toEqual([w18Expected('matrix')]);expect(result).toMatchObject({success:false,uncertain:true,error:expect.stringMatching(/unconfirmed/i)});
 expect(JSON.stringify(result)).not.toMatch(/W18_PRIVATE|no .*committed|rolled back|were rejected|was rejected/i);expect(result).not.toHaveProperty('fieldErrors');expect(m.refresh).not.toHaveBeenCalled();
});
it.each(["40000","40001","40002","40P01","22023","23514","42501","P0001","PT404","PT409","PT123"])('W18 exact known code %s preserves definite rejection',async code=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC'}});const result=await saveHrLookup('hr_grades',9,{name_en:'Name'},contract);
 expect(m.rpc).toHaveBeenCalledOnce();expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);expect(JSON.stringify(result)).not.toContain('W18_PRIVATE');expect(m.refresh).not.toHaveBeenCalled();
});
it('W18 does not coerce an object into a mapped SQLSTATE',async()=>{
 const toString=vi.fn(()=>'PT409'),code={toString};m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 expect(await saveHrLookup('hr_grades',9,{name_en:'Name'},contract)).toMatchObject({success:false,uncertain:true});expect(toString).not.toHaveBeenCalled();expect(m.rpc).toHaveBeenCalledOnce();
});

function w18Expected(label:string){return ['save_hr_lookup',{p_table:label==='matrix'?'hr_grades':label.split('/')[0],p_id:9,p_operation:contract.operationId,p_revision:'2',p_data:label==='matrix'?{name_en:'Name'}:{},p_action:label==='matrix'?'save':label.split('/')[1]}];}

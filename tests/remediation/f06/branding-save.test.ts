import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),revalidate:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:m.revalidate}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.rpc})}));
import {saveBrandingMutation} from '@/server/branding-save';
const contract={operationId:'77f7576c-59bb-4d48-91fa-7b4315cc4e0c',revision:'2'};
beforeEach(()=>{vi.resetAllMocks();m.rpc.mockResolvedValue({data:{id:1,revision:'3',changed:true,replayed:false,owner_company_id:1},error:null});});
it('uses the authenticated atomic RPC, including exact revision and operation identity',async()=>{
 const r=await saveBrandingMutation('report',1,{profile_name:'Synthetic'},contract);
 expect(r.success).toBe(true);expect(m.rpc).toHaveBeenCalledWith('save_branding_configuration',{p_kind:'report',p_id:1,p_data:{profile_name:'Synthetic'},p_operation:contract.operationId,p_revision:'2'});
});
it.each([undefined,{...contract,revision:null},{...contract,revision:'0'},{...contract,operationId:'invalid'}])('missing or malformed editing contract cannot write %j',async c=>{expect((await saveBrandingMutation('report',1,{},c)).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
it('creation needs a new-record contract and app settings cannot be implicitly created',async()=>{expect((await saveBrandingMutation('report',null,{},contract)).success).toBe(false);expect((await saveBrandingMutation('app',null,{},{...contract,revision:null})).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
it.each(['PT409','42501','23505','23503','22023','P0001'])('known %s failures are final and never expose SQL details',async code=>{m.rpc.mockResolvedValue({error:{code,message:'PRIVATE internal row'},data:null});const r=await saveBrandingMutation('report',1,{},contract);expect(r.success).toBe(false);expect(r.uncertain).not.toBe(true);expect(r.error).not.toContain('PRIVATE');});
it.each(['throw','unknown','malformed'])('unconfirmed %s responses retain the operation for safe retry',async mode=>{if(mode==='throw')m.rpc.mockRejectedValue(Error('PRIVATE'));else m.rpc.mockResolvedValue(mode==='unknown'?{error:{code:'NETWORK',message:'PRIVATE'}}:{data:{id:1}});const r=await saveBrandingMutation('report',1,{},contract);expect(r.uncertain).toBe(true);expect(r.error).not.toContain('PRIVATE');});
it('refreshes the actual receipt company, never the requested company',async()=>{m.rpc.mockResolvedValue({data:{id:1,revision:'3',changed:true,replayed:false,owner_company_id:7},error:null});expect((await saveBrandingMutation('report',1,{owner_company_id:999},contract)).success).toBe(true);expect(m.revalidate).toHaveBeenCalledWith('/admin/organizations/record/7');expect(m.revalidate).not.toHaveBeenCalledWith('/admin/organizations/record/999');});
it('no-op and rejected saves do not invalidate unrelated views',async()=>{m.rpc.mockResolvedValue({data:{id:1,revision:'2',changed:false,replayed:false,owner_company_id:1},error:null});expect((await saveBrandingMutation('report',1,{},contract)).success).toBe(true);expect(m.revalidate).not.toHaveBeenCalled();m.rpc.mockResolvedValue({error:{code:'42501'}});await saveBrandingMutation('report',1,{},contract);expect(m.revalidate).not.toHaveBeenCalled();});
it('post-commit refresh failure remains a confirmed save',async()=>{m.revalidate.mockImplementation(()=>{throw Error('PRIVATE');});const r=await saveBrandingMutation('app',1,{},contract);expect(r.success).toBe(true);expect(r.uncertain).not.toBe(true);});

for(const [label,invoke] of (['app','report'] as const).map(kind=>[kind,()=>saveBrandingMutation(kind,1,{app_name:'Synthetic'},contract)] as const))it.each(['40003','08007'])(`W18 ${label} %s dispatches once with safe uncertainty`,async code=>{
 m.rpc.mockResolvedValueOnce({error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}}).mockResolvedValueOnce({error:{code:'40001'}});
 expect(await invoke()).toMatchObject({success:false,uncertain:true});expect(m.rpc).toHaveBeenCalledOnce();expect(m.revalidate).not.toHaveBeenCalled();
 const first=m.rpc.mock.calls[0];expect(first).toEqual(w18Expected(label));expect((await invoke()).success).toBe(false);expect(m.rpc).toHaveBeenCalledTimes(2);expect(m.rpc.mock.calls[1]).toEqual(first);
 m.rpc.mockResolvedValue({data:{id:1,revision:'3',changed:true,replayed:true,owner_company_id:1},error:null});expect((await invoke()).success).toBe(true);expect(m.rpc).toHaveBeenCalledTimes(3);expect(m.rpc.mock.calls[2]).toEqual(first);
 // Explicit repeated calls verify request identity, not the excluded UI lifetime.
});

// W18: actual dispatched adapter, exact codes only; not a transaction/native oracle.
const w18Unknown:unknown[]=['40003','08007','40ZZZ','PGRST000','XX000',undefined,null,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01','23p01',40001,42501,['40001'],new String('40001'), 'toString', 'constructor', '__proto__'];
it.each([...w18Unknown,...["55P03","55000","57014","57015"]].map(code=>({code})))('W18 unknown code %# retains uncertainty without guidance',async({code})=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 const result=await saveBrandingMutation('app',1,{app_name:'Synthetic'},contract);
 expect(m.rpc.mock.calls).toEqual([w18Expected('app')]);expect(result).toMatchObject({success:false,uncertain:true,error:expect.stringMatching(/unconfirmed/i)});
 expect(JSON.stringify(result)).not.toMatch(/W18_PRIVATE|no .*committed|rolled back|were rejected|was rejected/i);expect(result).not.toHaveProperty('fieldErrors');expect(m.revalidate).not.toHaveBeenCalled();
});
it.each(["40000","40001","40002","40P01","22023","23514","42501","P0001","PT404","PT409","PT123"])('W18 exact known code %s preserves definite rejection',async code=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC'}});const result=await saveBrandingMutation('app',1,{app_name:'Synthetic'},contract);
 expect(m.rpc).toHaveBeenCalledOnce();expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);expect(JSON.stringify(result)).not.toContain('W18_PRIVATE');expect(m.revalidate).not.toHaveBeenCalled();
});
it('W18 does not coerce an object into a mapped SQLSTATE',async()=>{
 const toString=vi.fn(()=>'PT409'),code={toString};m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 expect(await saveBrandingMutation('app',1,{app_name:'Synthetic'},contract)).toMatchObject({success:false,uncertain:true});expect(toString).not.toHaveBeenCalled();expect(m.rpc).toHaveBeenCalledOnce();
});

function w18Expected(label:string){return ['save_branding_configuration',{p_kind:label,p_id:1,p_data:{app_name:'Synthetic'},p_operation:contract.operationId,p_revision:'2'}];}

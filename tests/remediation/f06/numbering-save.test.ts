// Server adapter tests use a database transport double; actual policies tested by numbering-rule-db.mjs.
import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:mock.rpc})}));
import {saveNumberingMutation} from '@/server/numbering-save';
const contract={operationId:'594b271a-63be-494d-a2e6-4dbd0b2ea47f',revision:'7'};
beforeEach(()=>{vi.resetAllMocks();mock.rpc.mockResolvedValue({data:{id:7,revision:'8',changed:true,replayed:false},error:null});});
it('uses authenticated save RPC and retained identity/revision',async()=>{expect((await saveNumberingMutation(7,'lock',{is_locked:true},contract)).success).toBe(true);expect(mock.rpc).toHaveBeenCalledWith('save_numbering_rule',{p_id:7,p_action:'lock',p_data:{is_locked:true},p_operation:contract.operationId,p_revision:'7'});});
it('refuses a missing opening revision before sending',async()=>{expect((await saveNumberingMutation(7,'save',{}, {...contract,revision:null})).success).toBe(false);expect(mock.rpc).not.toHaveBeenCalled();});
it.each(['PT409','PT404','42501','23505','22023'])('known rollback %s is not falsely uncertain',async(code)=>{mock.rpc.mockResolvedValue({error:{code,message:'private diagnostic'}});const r=await saveNumberingMutation(7,'save',{},contract);expect(r.success).toBe(false);expect(r.uncertain).not.toBe(true);expect(r.error).not.toContain('private diagnostic');});
it('gateway timeout retains uncertainty',async()=>{mock.rpc.mockResolvedValue({error:{message:'timeout'}});expect((await saveNumberingMutation(7,'save',{},contract)).uncertain).toBe(true);});
it('incomplete success cannot discard a pending operation',async()=>{mock.rpc.mockResolvedValue({data:{id:7},error:null});expect((await saveNumberingMutation(7,'save',{},contract)).uncertain).toBe(true);});

for(const [label,invoke] of (['save','active','lock'] as const).map(action=>[action,()=>saveNumberingMutation(7,action,{is_active:false},contract)] as const))it.each(['40003','08007'])(`W18 ${label} %s dispatches once with safe uncertainty`,async code=>{
 mock.rpc.mockResolvedValueOnce({error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}}).mockResolvedValueOnce({error:{code:'40001'}});
 expect(await invoke()).toMatchObject({success:false,uncertain:true});expect(mock.rpc).toHaveBeenCalledOnce();
 const first=mock.rpc.mock.calls[0];expect(first).toEqual(w18Expected(label));expect((await invoke()).success).toBe(false);expect(mock.rpc).toHaveBeenCalledTimes(2);expect(mock.rpc.mock.calls[1]).toEqual(first);
 mock.rpc.mockResolvedValue({data:{id:7,revision:'8',changed:true,replayed:true},error:null});expect((await invoke()).success).toBe(true);expect(mock.rpc).toHaveBeenCalledTimes(3);expect(mock.rpc.mock.calls[2]).toEqual(first);
 // Explicit repeated calls verify request identity, not the excluded UI lifetime.
});

// W18: actual dispatched adapter, exact codes only; not a transaction/native oracle.
const w18Unknown:unknown[]=['40003','08007','40ZZZ','PGRST000','XX000',undefined,null,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01','23p01',40001,42501,['40001'],new String('40001'), 'toString', 'constructor', '__proto__'];
it.each([...w18Unknown,...["55P03","55000","57014","57015"]].map(code=>({code})))('W18 unknown code %# retains uncertainty without guidance',async({code})=>{
 mock.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 const result=await saveNumberingMutation(7,'save',{},contract);
 expect(mock.rpc.mock.calls).toEqual([w18Expected('matrix')]);expect(result).toMatchObject({success:false,uncertain:true,error:expect.stringMatching(/unconfirmed/i)});
 expect(JSON.stringify(result)).not.toMatch(/W18_PRIVATE|no .*committed|rolled back|were rejected|was rejected/i);expect(result).not.toHaveProperty('fieldErrors');
});
it.each(["40000","40001","40002","40P01","22023","23514","42501","P0001","PT404","PT409","PT123"])('W18 exact known code %s preserves definite rejection',async code=>{
 mock.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC'}});const result=await saveNumberingMutation(7,'save',{},contract);
 expect(mock.rpc).toHaveBeenCalledOnce();expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);expect(JSON.stringify(result)).not.toContain('W18_PRIVATE');
});
it('W18 does not coerce an object into a mapped SQLSTATE',async()=>{
 const toString=vi.fn(()=>'PT409'),code={toString};mock.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 expect(await saveNumberingMutation(7,'save',{},contract)).toMatchObject({success:false,uncertain:true});expect(toString).not.toHaveBeenCalled();expect(mock.rpc).toHaveBeenCalledOnce();
});

function w18Expected(label:string){return ['save_numbering_rule',{p_id:7,p_action:label==='matrix'?'save':label,p_data:label==='matrix'?{}:{is_active:false},p_operation:contract.operationId,p_revision:'7'}];}

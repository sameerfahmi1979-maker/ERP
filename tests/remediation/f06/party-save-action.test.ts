import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),refresh:vi.fn(),allowed:true,auth:vi.fn(),client:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.auth,hasGlobalPermission:()=>m.allowed}));
vi.mock('next/cache',()=>({revalidatePath:m.refresh}));
import {savePartyRecord,changePartyState} from '@/server/party-save';
const contract={operationId:'73150cf9-2613-4c0d-9585-0bbbcd688ad8',revision:'4'};
const receipt={id:8,revision:'5',changed:true,replayed:false};
beforeEach(()=>{vi.resetAllMocks();m.allowed=true;m.auth.mockResolvedValue({});m.client.mockResolvedValue({rpc:m.rpc});m.rpc.mockResolvedValue({data:receipt,error:null});});
it('uses the retained edit contract and returns only the verified receipt',async()=>{expect(await savePartyRecord(8,{latitude:0,is_active:false},contract)).toEqual({success:true,data:receipt});expect(m.rpc).toHaveBeenCalledWith('save_party_record',{p_operation:contract.operationId,p_id:8,p_revision:'4',p_data:{latitude:0,is_active:false}});});
it.each([undefined,{...contract,revision:null},{...contract,revision:'0'},{...contract,operationId:'bad'},{...contract,extra:1}])('rejects an invalid edit contract %# before dispatch',async c=>{expect((await Reflect.apply(savePartyRecord,null,[8,{},c])).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
it('denied global authority never dispatches a write',async()=>{m.allowed=false;expect((await savePartyRecord(8,{},contract)).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
it.each([null,{...receipt,id:9},{...receipt,revision:null},{...receipt,changed:undefined},{...receipt,private_data:'redacted'}])('keeps an incomplete or wrong receipt uncertain %#',async data=>{m.rpc.mockResolvedValue({data,error:null});expect(await savePartyRecord(8,{},contract)).toMatchObject({success:false,uncertain:true});expect(m.refresh).not.toHaveBeenCalled();});
it.each(['PT404','PT409','42501','23503','23505','23514','22023','P0001','40001'])('known database rollback %s gives safe, definite feedback',async code=>{m.rpc.mockResolvedValue({error:{code,message:'PRIVATE DATABASE VALUES'}});const r=await savePartyRecord(8,{},contract);expect(r).toMatchObject({success:false,uncertain:false});expect(r.error).not.toContain('PRIVATE');});
it('connection failure after dispatch remains uncertain',async()=>{m.rpc.mockRejectedValue(Error('PRIVATE'));const r=await savePartyRecord(8,{},contract);expect(r).toMatchObject({success:false,uncertain:true});expect(r.error).not.toContain('PRIVATE');});
it('session failure before dispatch is definite and does not disclose details',async()=>{m.auth.mockRejectedValue(Error('PRIVATE'));expect(await savePartyRecord(8,{},contract)).toMatchObject({success:false,uncertain:false});expect(m.rpc).not.toHaveBeenCalled();});
it('post-commit cache failure preserves success',async()=>{m.refresh.mockImplementation(()=>{throw Error('unavailable');});expect(await savePartyRecord(8,{},contract)).toEqual({success:true,data:receipt});});

for(const [label,invoke] of [['save',()=>savePartyRecord(8,{is_active:false},contract)],['active',()=>changePartyState(8,'active',{is_active:false,reason:null},contract)],['types',()=>changePartyState(8,'types',{selected:[2],primary:2},contract)]] as const)it.each(['40003','08007'])(`W18 ${label} %s dispatches once with safe uncertainty`,async code=>{
 m.rpc.mockResolvedValueOnce({error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}}).mockResolvedValueOnce({error:{code:'40001'}});
 expect(await invoke()).toMatchObject({success:false,uncertain:true});expect(m.rpc).toHaveBeenCalledOnce();expect(m.refresh).not.toHaveBeenCalled();
 const first=m.rpc.mock.calls[0];expect(first).toEqual(w18Expected(label));expect((await invoke()).success).toBe(false);expect(m.rpc).toHaveBeenCalledTimes(2);expect(m.rpc.mock.calls[1]).toEqual(first);
 m.rpc.mockResolvedValue({data:{...receipt,replayed:true},error:null});expect((await invoke()).success).toBe(true);expect(m.rpc).toHaveBeenCalledTimes(3);expect(m.rpc.mock.calls[2]).toEqual(first);
 // Explicit repeated calls verify request identity, not the excluded UI lifetime.
});

// W18: actual dispatched adapter, exact codes only; not a transaction/native oracle.
const w18Unknown:unknown[]=['40003','08007','40ZZZ','PGRST000','XX000',undefined,null,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01','23p01',40001,42501,['40001'],new String('40001'), 'toString', 'constructor', '__proto__'];
it.each([...w18Unknown,...["55P03","55000","57014","57015"]].map(code=>({code})))('W18 unknown code %# retains uncertainty without guidance',async({code})=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 const result=await savePartyRecord(8,{is_active:false},contract);
 expect(m.rpc.mock.calls).toEqual([w18Expected('save')]);expect(result).toMatchObject({success:false,uncertain:true,error:expect.stringMatching(/unconfirmed/i)});
 expect(JSON.stringify(result)).not.toMatch(/W18_PRIVATE|no .*committed|rolled back|were rejected|was rejected/i);expect(result).not.toHaveProperty('fieldErrors');expect(m.refresh).not.toHaveBeenCalled();
});
it.each(["40000","40001","40002","40P01","22023","23514","42501","P0001","PT404","PT409","PT123"])('W18 exact known code %s preserves definite rejection',async code=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC'}});const result=await savePartyRecord(8,{is_active:false},contract);
 expect(m.rpc).toHaveBeenCalledOnce();expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);expect(JSON.stringify(result)).not.toContain('W18_PRIVATE');expect(m.refresh).not.toHaveBeenCalled();
});
it('W18 does not coerce an object into a mapped SQLSTATE',async()=>{
 const toString=vi.fn(()=>'PT409'),code={toString};m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 expect(await savePartyRecord(8,{is_active:false},contract)).toMatchObject({success:false,uncertain:true});expect(toString).not.toHaveBeenCalled();expect(m.rpc).toHaveBeenCalledOnce();
});

function w18Expected(label:string){return [label==='save'?'save_party_record':'change_party_state',{p_operation:contract.operationId,p_id:8,p_revision:'4',p_data:label==='types'?{selected:[2],primary:2}:label==='active'?{is_active:false,reason:null}:{is_active:false},...(label==='save'?{}:{p_action:label})}];}

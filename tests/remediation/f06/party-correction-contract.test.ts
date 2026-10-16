import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.rpc})}));
import {runPartyCorrection,loadPartyCorrectionSource} from '@/server/party-dms-correction';
beforeEach(()=>vi.resetAllMocks());
it.each(['42501','PT404','PT409','22023','23514'])('known correction error %s is safe and not uncertain',async code=>{m.rpc.mockResolvedValue({error:{code,message:'PRIVATE RAW DATABASE DETAIL'}});const r=await runPartyCorrection('apply',{proposalId:1});expect(r.success).toBe(false);expect(r.uncertain).toBe(false);expect(JSON.stringify(r)).not.toContain('PRIVATE');});
it.each(['08006','PT599'])('unknown correction error %s remains unconfirmed',async code=>{m.rpc.mockResolvedValue({error:{code}});expect((await runPartyCorrection('apply',{proposalId:1})).uncertain).toBe(true);});
it('lost correction response is unconfirmed',async()=>{m.rpc.mockRejectedValue(Error('SECRET'));const r=await runPartyCorrection('cancel',{proposalId:1});expect(r.uncertain).toBe(true);expect(JSON.stringify(r)).not.toContain('SECRET');});
it.each([{proposalId:2,status:'applied'},{proposalId:1,status:'cancelled'},{proposalId:1,status:'applied',private:'data'}])('rejects inconsistent correction receipt %j',async data=>{m.rpc.mockResolvedValue({data});expect((await runPartyCorrection('apply',{proposalId:1})).uncertain).toBe(true);});
it('rejects invalid input before sending an operation',async()=>{expect((await runPartyCorrection('prepare',{requestId:'bad'})).success).toBe(false);expect((await loadPartyCorrectionSource(0)).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});

for(const [label,invoke] of [['source read',()=>loadPartyCorrectionSource(1)],['prepare',()=>runPartyCorrection('prepare',{requestId:'ad62c5b8-a56b-451b-8c47-48b978b89e31'})],['apply',()=>runPartyCorrection('apply',{proposalId:1})],['cancel',()=>runPartyCorrection('cancel',{proposalId:1})]] as const)it.each(['40003','08007'])(`W18 ${label} %s dispatches once with safe uncertainty`,async code=>{
 m.rpc.mockResolvedValueOnce({error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}}).mockResolvedValueOnce({error:{code:'40001'}});
 expect(await invoke()).toMatchObject({success:false,uncertain:true});expect(m.rpc).toHaveBeenCalledOnce();
 const first=m.rpc.mock.calls[0];expect(first).toEqual(w18Expected(label));expect((await invoke()).success).toBe(false);expect(m.rpc).toHaveBeenCalledTimes(2);expect(m.rpc.mock.calls[1]).toEqual(first);

 if(label!=='source read'){const confirmed={proposalId:1,status:label==='prepare'?'draft':label==='apply'?'applied':'cancelled'};m.rpc.mockResolvedValue({data:confirmed,error:null});expect(await invoke()).toEqual({success:true,data:confirmed});expect(m.rpc.mock.calls).toEqual([first,first,first]);}
 // Explicit repeated calls verify request identity, not the excluded UI lifetime.
});

// W18: actual dispatched adapter, exact codes only; not a transaction/native oracle.
const w18Unknown:unknown[]=['40003','08007','40ZZZ','PGRST000','XX000',undefined,null,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01','23p01',40001,42501,['40001'],new String('40001'), 'toString', 'constructor', '__proto__'];
it.each([...w18Unknown,...["PT123","55P03","55000","57014","57015"]].map(code=>({code})))('W18 unknown code %# retains uncertainty without guidance',async({code})=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 const result=await runPartyCorrection('apply',{proposalId:1});
 expect(m.rpc.mock.calls).toEqual([w18Expected('apply')]);expect(result).toMatchObject({success:false,uncertain:true,error:expect.stringMatching(/unconfirmed/i)});
 expect(JSON.stringify(result)).not.toMatch(/W18_PRIVATE|no .*committed|rolled back|were rejected|was rejected/i);expect(result).not.toHaveProperty('fieldErrors');
});
it.each(["40000","40001","40002","40P01","22023","23514","42501","P0001","PT404","PT409"])('W18 exact known code %s preserves definite rejection',async code=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC'}});const result=await runPartyCorrection('apply',{proposalId:1});
 expect(m.rpc).toHaveBeenCalledOnce();expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);expect(JSON.stringify(result)).not.toContain('W18_PRIVATE');
});
it('W18 does not coerce an object into a mapped SQLSTATE',async()=>{
 const toString=vi.fn(()=>'PT409'),code={toString};m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 expect(await runPartyCorrection('apply',{proposalId:1})).toMatchObject({success:false,uncertain:true});expect(toString).not.toHaveBeenCalled();expect(m.rpc).toHaveBeenCalledOnce();
});

function w18Expected(label:string){return ['party_dms_correction',{p_action:label==='source read'?'source':label,p_data:label==='prepare'?{requestId:'ad62c5b8-a56b-451b-8c47-48b978b89e31'}:label==='source read'?{originalApplyItemId:1}:{proposalId:1}}];}

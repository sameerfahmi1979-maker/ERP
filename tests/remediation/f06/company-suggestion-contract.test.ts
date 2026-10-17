// Offline transport/query tests; all network is disabled by the test setup.
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({responses:[] as unknown[],from:vi.fn(),rpc:vi.fn(),insert:vi.fn(),is:vi.fn(),select:vi.fn(),cache:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:m.from,rpc:m.rpc})}));
vi.mock('next/cache',()=>({revalidatePath:m.cache}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:3}}),hasPermission:()=>true}));
import {loadCurrentRecordSnapshot} from '@/lib/ai/common/field-suggestions/current-record-loader';
import {insertPendingSuggestions} from '@/lib/ai/common/field-suggestions/persistence';
import {COMPANY_REGISTRY} from '@/lib/ai/common/registry/company-registry';
import {applyCompanySuggestion,applyCompanySuggestions} from '@/server/administration-suggestion-apply';
import {applyAiSuggestionByRegisteredHandler} from '@/lib/ai/common/field-suggestions/apply-engine';
import {acceptSelectedAiFieldSuggestions} from '@/server/actions/ai/common/field-suggestions';
import {APPLY_HANDLER_REGISTRY} from '@/lib/ai/common/field-suggestions/apply-handlers';
import type {ErpAiFieldSuggestionDraft,ErpAiCurrentRecordSnapshot} from '@/lib/ai/common/types';
const registry={...COMPANY_REGISTRY,fields:COMPANY_REGISTRY.fields.filter(f=>f.targetField==='trade_name')};
beforeEach(()=>{vi.resetAllMocks();m.responses=[];m.from.mockImplementation(()=>{const response=m.responses.shift();const q={select:(s:string)=>{m.select(s);return q;},eq:()=>q,is:(...a:unknown[])=>{m.is(...a);return q;},limit:()=>q,single:()=>Promise.resolve(response),maybeSingle:()=>Promise.resolve(response),insert:(rows:unknown)=>{m.insert(rows);return q;},then:(resolve:(r:unknown)=>unknown)=>Promise.resolve(response).then(resolve)};return q;});});
it.each([{data:null,error:{message:'private'}},{data:null,error:null},{data:{id:1,trade_name:'name'},error:null},{data:{id:1,workspace_revision:9007199254740992},error:null}])('company query/revision failure never fabricates missing values',async response=>{
 m.responses=[response];await expect(loadCurrentRecordSnapshot('company',1,registry)).rejects.toThrow(/could not be loaded/);
});

// W18: actual dispatched adapter, exact codes only; not a transaction/native oracle.
const w18Unknown:unknown[]=['40003','08007','40ZZZ','PGRST000','XX000',undefined,null,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01','23p01',40001,42501,['40001'],new String('40001'), 'toString', 'constructor', '__proto__'];
it.each([...w18Unknown,...["57014","57015"]].map(code=>({code})))('W18 unknown code %# retains uncertainty without guidance',async({code})=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 const result=await applyCompanySuggestions([11],1);
 expect(m.rpc.mock.calls).toEqual([w18Expected('matrix')]);expect(result).toMatchObject({success:false,uncertain:true,message:expect.stringMatching(/unconfirmed/i)});
 expect(JSON.stringify(result)).not.toMatch(/W18_PRIVATE|no .*committed|rolled back|were rejected|was rejected/i);expect(result).not.toHaveProperty('fieldErrors');expect(m.cache).not.toHaveBeenCalled();
});
it.each(["40000","40001","40002","40P01","22023","23514","42501","P0001","PT404","PT409","PT123","55P03","55000"])('W18 exact known code %s preserves definite rejection',async code=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC'}});const result=await applyCompanySuggestions([11],1);
 expect(m.rpc).toHaveBeenCalledOnce();expect(result.success).toBe(false);expect(result).not.toMatchObject({uncertain:true});expect(JSON.stringify(result)).not.toContain('W18_PRIVATE');expect(m.cache).not.toHaveBeenCalled();
});
it('W18 does not coerce an object into a mapped SQLSTATE',async()=>{
 const toString=vi.fn(()=>'PT409'),code={toString};m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 expect(await applyCompanySuggestions([11],1)).toMatchObject({success:false,uncertain:true});expect(toString).not.toHaveBeenCalled();expect(m.rpc).toHaveBeenCalledOnce();
});
it('company snapshot preserves exact whitespace and revision without nonexistent soft-delete filters',async()=>{
 m.responses=[{data:{id:1,workspace_revision:7,trade_name:' historical '},error:null}];
 expect(await loadCurrentRecordSnapshot('company',1,registry)).toEqual({entityType:'company',entityId:1,fields:{trade_name:' historical '},reviewedTargets:{owner_companies:{id:1,revision:'7'}}});
 expect(m.select).toHaveBeenCalledWith('id,workspace_revision,trade_name');expect(m.is).not.toHaveBeenCalled();
});
const draft={targetField:'trade_name',fieldLabel:'Trade name',fieldType:'text',currentValue:'untrusted model value',suggestedValue:'Reviewed name',suggestionType:'correct_value',confidenceScore:1} as ErpAiFieldSuggestionDraft;
const snapshot:ErpAiCurrentRecordSnapshot={entityType:'company',entityId:1,fields:{trade_name:' exact current '},reviewedTargets:{owner_companies:{id:1,revision:'7'}}};
it('persistence binds server values and company revision, never model currentValue',async()=>{
 m.responses=[{data:[{id:11}],error:null}];await insertPendingSuggestions('company',1,[draft],3,new Map([['trade_name','owner_companies']]),snapshot);
 expect(m.insert.mock.calls[0][0][0]).toMatchObject({current_value:' exact current ',reviewed_target_id:1,reviewed_target_revision:'7'});
});
it.each([undefined,{...snapshot,entityId:2},{...snapshot,reviewedTargets:{}},{...snapshot,fields:{}}])('unbound company generation cannot persist applicable suggestions',async input=>{
 await expect(insertPendingSuggestions('company',1,[draft],3,new Map([['trade_name','owner_companies']]),input)).rejects.toThrow(/reviewed company/);expect(m.insert).not.toHaveBeenCalled();
});
const receipt={suggestionId:11,companyId:1,field:'trade_name',changed:true,revision:'8',replayed:false};
it('single company application validates a complete receipt',async()=>{m.rpc.mockResolvedValue({data:[receipt],error:null});expect((await applyCompanySuggestion(11,1,'trade_name')).success).toBe(true);});
it.each([[{...receipt,companyId:2}],[{...receipt,suggestionId:12}],[{...receipt,unexpected:true}],[receipt,receipt],null])('invalid receipts are uncertain and do not report failure as rollback',async data=>{
 m.rpc.mockResolvedValue({data,error:null});expect(await applyCompanySuggestions([11],1)).toMatchObject({success:false,uncertain:true,message:expect.stringMatching(/response incomplete/)});
});
it('single receipt field must match the reviewed field',async()=>{m.rpc.mockResolvedValue({data:[{...receipt,field:'main_activity'}],error:null});expect(await applyCompanySuggestion(11,1,'trade_name')).toMatchObject({success:false,uncertain:true});});
it.each(['42501','PT409','PT404','22023','23514','40P01','XX000'])('%s errors use safe messages',async code=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'private SQL credentials'}});const result=await applyCompanySuggestions([11],1);expect(result.success).toBe(false);expect(JSON.stringify(result)).not.toMatch(/private|SQL|credentials/);
});
it('lost response remains uncertain and retries exactly the same suggestion IDs',async()=>{
 m.rpc.mockRejectedValueOnce(Error('lost')).mockResolvedValueOnce({data:[{...receipt,replayed:true}],error:null});
 expect(await applyCompanySuggestions([11],1)).toMatchObject({success:false,uncertain:true});expect((await applyCompanySuggestions([11],1)).success).toBe(true);expect(m.rpc.mock.calls[0]).toEqual(m.rpc.mock.calls[1]);
});
it('engine selects the company transaction before generic acceptance/application handlers',async()=>{
 m.responses=[{data:{id:11,entity_type:'company',entity_id:1,target_table:'owner_companies',target_field:'trade_name',field_label:'Trade name',field_type:'text',suggested_value:'Reviewed',status:'applied',reviewed_target_id:1},error:null}];
 m.rpc.mockResolvedValue({data:[{...receipt,replayed:true}],error:null});expect(await applyAiSuggestionByRegisteredHandler(11,3)).toMatchObject({success:true,atomic:true,status:'applied'});expect(m.insert).not.toHaveBeenCalled();
});
it('batch action applies one selected company batch without per-field revision refresh',async()=>{
 m.rpc.mockResolvedValue({data:[receipt,{...receipt,suggestionId:12,field:'main_activity'}],error:null});m.cache.mockImplementation(()=>{throw Error('cache unavailable');});
 const result=await acceptSelectedAiFieldSuggestions({entityType:'company',entityId:1,suggestionIds:[11,12]});expect(result).toMatchObject({success:true,data:{appliedCount:2,failedCount:0}});
 expect(m.rpc).toHaveBeenCalledExactlyOnceWith('apply_company_field_suggestions',{p_company:1,p_suggestions:[11,12],p_accept_pending:true});expect(m.from).not.toHaveBeenCalled();
});
it('legacy company handler keys cannot perform generic direct UPDATEs',async()=>{
 for(const key of ['trade_name','main_activity','established_date','office_address_line_1','office_address_line_2'])expect(await APPLY_HANDLER_REGISTRY['apply_owner_company_'+key]({entityId:1,suggestedValue:'x',fieldType:'text'})).toMatchObject({success:false});
 expect(m.from).not.toHaveBeenCalled();
});

for(const [label,invoke] of [['single',()=>applyCompanySuggestion(11,1,'trade_name')],['batch',()=>applyCompanySuggestions([11,12],1)]] as const)it.each(['40003','08007'])(`W18 ${label} %s dispatches once with safe uncertainty`,async code=>{
 m.rpc.mockResolvedValueOnce({error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}}).mockResolvedValueOnce({error:{code:'40001'}});
 expect(await invoke()).toMatchObject({success:false,uncertain:true});expect(m.rpc).toHaveBeenCalledOnce();expect(m.cache).not.toHaveBeenCalled();
 const first=m.rpc.mock.calls[0];expect(first).toEqual(w18Expected(label));expect((await invoke()).success).toBe(false);expect(m.rpc).toHaveBeenCalledTimes(2);expect(m.rpc.mock.calls[1]).toEqual(first);
 m.rpc.mockResolvedValue({data:label==='batch'?[{...receipt,replayed:true},{...receipt,suggestionId:12,field:'main_activity',replayed:true}]:[{...receipt,replayed:true}],error:null});expect((await invoke()).success).toBe(true);expect(m.rpc).toHaveBeenCalledTimes(3);expect(m.rpc.mock.calls[2]).toEqual(first);
 // Explicit repeated calls verify request identity, not the excluded UI lifetime.
});

function w18Expected(label:string){return ['apply_company_field_suggestions',{p_company:1,p_suggestions:label==='batch'?[11,12]:[11],p_accept_pending:false}];}

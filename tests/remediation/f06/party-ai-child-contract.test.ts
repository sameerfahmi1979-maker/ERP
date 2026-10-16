// Offline query/transport tests, separate from the real DB .local suite.
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({responses:[] as unknown[],insert:vi.fn(),from:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:m.from,rpc:m.rpc})}));
import {loadCurrentRecordSnapshot} from '@/lib/ai/common/field-suggestions/current-record-loader';
import {insertPendingSuggestions} from '@/lib/ai/common/field-suggestions/persistence';
import {PARTY_REGISTRY} from '@/lib/ai/common/registry/party-registry';
import {applyPartyChildSuggestion,applyPartySuggestion} from '@/server/party-suggestion-apply';
import type {ErpAiFieldSuggestionDraft,ErpAiCurrentRecordSnapshot} from '@/lib/ai/common/types';
const registry={...PARTY_REGISTRY,fields:PARTY_REGISTRY.fields.filter(f=>f.targetTable==='party_tax_registrations')};
beforeEach(()=>{vi.resetAllMocks();m.responses=[];m.from.mockImplementation(()=>{const value=m.responses.shift();const q={select:()=>q,eq:()=>q,is:()=>q,limit:()=>q,insert:(rows:unknown)=>{m.insert(rows);return q;},then:(resolve:(r:unknown)=>unknown)=>Promise.resolve(value).then(resolve)};return q;});});
it.each([{data:null,error:{message:'private'}},{data:null,error:null}])('unavailable child query is not a fabricated empty value',async result=>{
 m.responses=[result];await expect(loadCurrentRecordSnapshot('party',1,registry)).rejects.toThrow(/could not be loaded/);
});
it('multiple active children never silently select the newest',async()=>{
 m.responses=[{data:[{id:1},{id:2}],error:null}];await expect(loadCurrentRecordSnapshot('party',1,registry)).rejects.toThrow(/manual selection/);
});
it('no existing child yields no writable target binding',async()=>{
 m.responses=[{data:[],error:null}];expect(await loadCurrentRecordSnapshot('party',1,registry)).toMatchObject({fields:{tax_registration_number:null},reviewedTargets:{}});
});
it('one active child carries the exact record/revision separately from prompt fields',async()=>{
 m.responses=[{data:[{id:21,workspace_revision:7,tax_registration_number:'100000000000003'}],error:null}];expect(await loadCurrentRecordSnapshot('party',1,registry)).toEqual({entityType:'party',entityId:1,fields:{tax_registration_number:'100000000000003'},reviewedTargets:{party_tax_registrations:{id:21,revision:'7'}}});
});
const draft={targetField:'tax_registration_number',fieldLabel:'TRN',fieldType:'text',currentValue:'untrusted model old value',suggestedValue:'100000000000003',suggestionType:'fill_missing',confidenceScore:1} as ErpAiFieldSuggestionDraft;
const snapshot:ErpAiCurrentRecordSnapshot={entityType:'party',entityId:1,fields:{tax_registration_number:'100000000000001'},reviewedTargets:{party_tax_registrations:{id:21,revision:'7'}}};
it('persistence uses the server snapshot, never model-supplied target/current value',async()=>{
 m.responses=[{data:[{id:11}],error:null}];await insertPendingSuggestions('party',1,[draft],3,new Map([['tax_registration_number','party_tax_registrations']]),snapshot);
 expect(m.insert.mock.calls[0][0][0]).toMatchObject({current_value:'100000000000001',reviewed_target_id:21,reviewed_target_revision:'7'});
});
it('missing target or mismatched parent snapshot is rejected before an insert',async()=>{
 for(const input of [undefined,{...snapshot,entityId:2},{...snapshot,reviewedTargets:{}}])await expect(insertPendingSuggestions('party',1,[draft],3,new Map([['tax_registration_number','party_tax_registrations']]),input)).rejects.toThrow(/reviewed child target/);
 expect(m.insert).not.toHaveBeenCalled();
});
const receipt={suggestionId:11,partyId:1,targetTable:'party_tax_registrations',targetId:21,field:'tax_registration_number',changed:false,revision:'7',replayed:false};
it('complete child receipt is accepted including legacy TRN field alias',async()=>{m.rpc.mockResolvedValue({data:receipt,error:null});expect((await applyPartyChildSuggestion(11,1,'party_tax_registrations','trn',21)).success).toBe(true);});
it.each([{...receipt,suggestionId:12},{...receipt,partyId:2},{...receipt,targetId:0},{...receipt,targetId:22},{...receipt,field:'license_number'},{...receipt,unexpected:true},null])('mismatched/malformed child receipt remains uncertain',async data=>{m.rpc.mockResolvedValue({data,error:null});expect(await applyPartyChildSuggestion(11,1,'party_tax_registrations','tax_registration_number',21)).toMatchObject({success:false,message:expect.stringMatching(/response incomplete/)});});
it.each(['42501','PT409','PT404','22023','XX000'])('%s errors never expose provider/database diagnostics',async code=>{m.rpc.mockResolvedValue({data:null,error:{code,message:'private SQL credentials'}});const result=await applyPartyChildSuggestion(11,1,'party_tax_registrations','tax_registration_number',21);expect(result.success).toBe(false);expect(JSON.stringify(result)).not.toMatch(/private|SQL|credentials/);});

// W18 exercises both message-only predicates without inventing an uncertainty DTO.
const w18Suggestions=[
 ['child',()=>applyPartyChildSuggestion(11,1,'party_tax_registrations','tax_registration_number',21),receipt],
 ['parent',()=>applyPartySuggestion(11,1),{suggestionId:11,partyId:1,field:'display_name',changed:true,revision:'7',replayed:false}],
] as const;
for(const [label,invoke,confirmed] of w18Suggestions){
 it.each([...['40003','08007','40ZZZ','PGRST000','XX000',undefined,null,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01','23p01',40001,42501,['40001'],new String('40001'), 'toString', 'constructor', '__proto__'],'PT123','55P03','55000','57014','57015'].map(code=>({code})))(`W18 ${label} unknown %# gives unconfirmed feedback`,async({code})=>{
  m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
  const result=await invoke();expect(m.rpc).toHaveBeenCalledOnce();expect(result).toMatchObject({success:false,message:expect.stringMatching(/unconfirmed/i)});expect(result).not.toHaveProperty('uncertain');expect(JSON.stringify(result)).not.toContain('W18_PRIVATE');
 });
 it.each(['40000','40001','40002','40P01','22023','23514','42501','P0001','PT404','PT409'])(`W18 ${label} exact known %s stays definite`,async code=>{
  m.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});const result=await invoke();expect(m.rpc).toHaveBeenCalledOnce();expect(result.success).toBe(false);expect(result.message).not.toMatch(/unconfirmed|W18_PRIVATE/);expect(result).not.toHaveProperty('uncertain');
 });
 it(`W18 ${label} does not coerce mapped codes`,async()=>{
  const toString=vi.fn(()=>'42501');m.rpc.mockResolvedValue({error:{code:{toString}}});expect(await invoke()).toMatchObject({success:false,message:expect.stringMatching(/unconfirmed/)});expect(toString).not.toHaveBeenCalled();
 });
 it.each(['40003','08007'])(`W18 ${label} explicit recovery preserves persisted IDs after %s`,async code=>{
  m.rpc.mockResolvedValueOnce({error:{code}}).mockResolvedValueOnce({error:{code:'40001'}}).mockResolvedValueOnce({data:{...confirmed,replayed:true},error:null});
  expect(await invoke()).toMatchObject({success:false,message:expect.stringMatching(/unconfirmed/)});
  expect(m.rpc.mock.calls).toEqual([[label==='child'?'apply_party_child_field_suggestion':'apply_party_field_suggestion',{p_suggestion:11,p_accept_pending:false}]]);expect((await invoke()).success).toBe(false);expect((await invoke()).success).toBe(true);
  expect(m.rpc.mock.calls[1]).toEqual(m.rpc.mock.calls[0]);expect(m.rpc.mock.calls[2]).toEqual(m.rpc.mock.calls[0]);expect(m.from).not.toHaveBeenCalled();expect(m.insert).not.toHaveBeenCalled();
 });
}

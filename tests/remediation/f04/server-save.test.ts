import {beforeEach,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>db}));
import {saveWorkspaceRecord} from '@/server/workspace-save';
const contract={operationId:'0d028f75-3e6b-4f48-a14a-786bbd88a4cc',revision:'1'};
beforeEach(()=>vi.resetAllMocks());
it('calls the session-bound atomic RPC and validates the scoped Department receipt',async()=>{
 const receipt={id:42,revision:'2',replayed:false,changed:true,owner_company_id:1,branch_id:null};
 db.rpc.mockResolvedValue({data:receipt,error:null});
 expect(await saveWorkspaceRecord('departments',42,{description:'test'},contract)).toEqual({success:true,data:receipt});
 expect(db.rpc).toHaveBeenCalledExactlyOnceWith('save_workspace_record',{p_entity:'departments',p_operation:contract.operationId,p_id:42,p_revision:'1',p_data:{description:'test'}});
});
it('preserves the established receipt contract for other workspace entities',async()=>{
 const receipt={id:42,revision:'2',replayed:false};
 db.rpc.mockResolvedValue({data:receipt,error:null});
 expect(await saveWorkspaceRecord('employees',42,{notes:'test'},contract)).toEqual({success:true,data:receipt});
 expect(db.rpc).toHaveBeenCalledExactlyOnceWith('save_workspace_record',{p_entity:'employees',p_operation:contract.operationId,p_id:42,p_revision:'1',p_data:{notes:'test'}});
});
it('rejects a missing update revision before reaching the database',async()=>{
 expect((await saveWorkspaceRecord('employees',42,{}, {...contract,revision:null})).success).toBe(false);expect(db.rpc).not.toHaveBeenCalled();
});
it.each(['P0409','42501','23505','23503','22023'])('known database rollback %s is not treated as an uncertain committed create',async code=>{
 db.rpc.mockResolvedValue({data:null,error:{code,message:'private database details'}});
 const r=await saveWorkspaceRecord('departments',42,{},contract);expect(r.success).toBe(false);expect(r.uncertain).not.toBe(true);expect(r.error).not.toContain('private database');
});
it.each([null,{id:42},{id:42,revision:'2'},{id:42,revision:'0',replayed:false}])('incomplete response retains operation identity: %j',async data=>{
 db.rpc.mockResolvedValue({data,error:null});expect((await saveWorkspaceRecord('departments',42,{},contract)).uncertain).toBe(true);
});
it('network exceptions remain uncertain and do not leak diagnostics',async()=>{
 db.rpc.mockRejectedValue(new Error('private transport detail'));const r=await saveWorkspaceRecord('departments',42,{},contract);expect(r.uncertain).toBe(true);expect(r.error).not.toContain('private');
});

const unconfirmed={success:false,uncertain:true,error:'Save unconfirmed. Keep the same values and retry safely to recover its result.'};
const rejected={success:false,uncertain:false,error:'The save was rejected. Check the entered values and try again.'};
const conflict={success:false,error:'Someone changed this record after you opened it. Your draft is retained. Reopen the latest record and compare your changes before saving.'};
const unknownCodes: Array<[string,unknown]> = [
 ['statement completion unknown','40003'],['transaction resolution unknown','08007'],
 ['unsupported class 40','40ZZZ'],['cancelled statement','57014'],['lock unavailable','55P03'],
 ['unsupported custom class','PT409'],['internal error','XX000'],['PostgREST error','PGRST000'],
 ['missing code',undefined],['null code',null],['empty code',''],['class only','40'],['short code','4000'],
 ['unknown suffix','40003suffix'],['conflict suffix','40001suffix'],['permission suffix','42501suffix'],
 ['leading space',' 40001'],['trailing space','40001 '],['conflict newline','40001\n'],
 ['permission newline','42501\n'],['lowercase class 40','40p01'],['lowercase non-40','P0a01'],
 ['nonalphanumeric non-40','22!23'],['number',40001],['array',['40001']],['boxed string',Object('40001')],
];
it.each(unknownCodes)('%s stays unconfirmed without exposing diagnostics or accepting error data',async(_name,code)=>{
 db.rpc.mockResolvedValue({
  data:{id:42,revision:'2',replayed:true,changed:false,owner_company_id:1,branch_id:null},
  error:{code,message:'PRIVATE_MESSAGE',details:'PRIVATE_DETAILS',hint:'PRIVATE_HINT'},
 });
 const result=await saveWorkspaceRecord('departments',42,{owner_company_id:1,branch_id:null},contract);
 expect(result).toEqual(unconfirmed);
 expect(result).not.toHaveProperty('data');
 expect(JSON.stringify(result)).not.toMatch(/PRIVATE_(MESSAGE|DETAILS|HINT)/);
 expect(db.rpc).toHaveBeenCalledExactlyOnceWith('save_workspace_record',{
  p_entity:'departments',p_operation:contract.operationId,p_id:42,p_revision:'1',p_data:{owner_company_id:1,branch_id:null},
 });
});
it('does not coerce an object code into a definite SQLSTATE',async()=>{
 const stringify=vi.fn(()=>'40001');
 db.rpc.mockResolvedValue({data:null,error:{code:{toString:stringify},message:'PRIVATE_MESSAGE'}});
 expect(await saveWorkspaceRecord('employees',42,{},contract)).toEqual(unconfirmed);
 expect(stringify).not.toHaveBeenCalled();expect(db.rpc).toHaveBeenCalledTimes(1);
});
it.each([
 ['40000',rejected],['40001',conflict],['40002',rejected],['40P01',rejected],
 ['22023',rejected],['23503',rejected],['P0001',rejected],['P0409',conflict],
 ['23505',{success:false,error:'A record with this unique code already exists. Check the existing record before retrying.'}],
 ['42501',{success:false,error:'This record is unavailable or you no longer have permission to save it.'}],
])('exact recognized rejection %s preserves its established safe response',async(code,expected)=>{
 db.rpc.mockResolvedValue({
  data:{id:42,revision:'2',replayed:true,changed:false,owner_company_id:1,branch_id:null},
  error:{code,message:'PRIVATE_MESSAGE',details:'PRIVATE_DETAILS',hint:'PRIVATE_HINT'},
 });
 const result=await saveWorkspaceRecord('departments',42,{},contract);
 expect(result).toEqual(expected);expect(result).not.toHaveProperty('data');
 expect(JSON.stringify(result)).not.toMatch(/PRIVATE_(MESSAGE|DETAILS|HINT)/);
 expect(db.rpc).toHaveBeenCalledTimes(1);
});

const entityReplays = [
 {entity:'departments',rpc:'save_workspace_record',payload:{owner_company_id:1,branch_id:null,is_active:false},receipt:{id:42,revision:'2',replayed:true,changed:false,owner_company_id:1,branch_id:null}},
 {entity:'employees',rpc:'save_workspace_record',payload:{notes:null,is_active:false},receipt:{id:42,revision:'2',replayed:true}},
 {entity:'hr_candidates',rpc:'save_workspace_record',payload:{notes:null,is_active:false},receipt:{id:42,revision:'2',replayed:true}},
 {entity:'work_calendars',rpc:'save_master_record',payload:{owner_company_id:1,is_active:false},receipt:{id:42,revision:'2',replayed:true,changed:false,owner_company_id:1,calendar_id:null}},
 {entity:'work_shifts',rpc:'save_master_record',payload:{calendar_id:8,is_active:false},receipt:{id:42,revision:'2',replayed:true,changed:false,owner_company_id:1,calendar_id:8}},
] as const;
it.each(entityReplays.flatMap(entry=>['40003','08007'].map(code=>({...entry,code}))))('$entity / $code requires an explicit same-request replay with exact routing',async({entity,rpc,payload,receipt,code})=>{
 db.rpc.mockResolvedValueOnce({data:receipt,error:{code,message:'PRIVATE_MESSAGE',details:'PRIVATE_DETAILS',hint:'PRIVATE_HINT'}})
  .mockResolvedValueOnce({data:receipt,error:null});
 const first=await saveWorkspaceRecord(entity,42,payload,contract);
 expect(first).toEqual(unconfirmed);expect(first).not.toHaveProperty('data');
 expect(JSON.stringify(first)).not.toMatch(/PRIVATE_(MESSAGE|DETAILS|HINT)/);
 expect(db.rpc).toHaveBeenCalledTimes(1);
 expect(await saveWorkspaceRecord(entity,42,payload,contract)).toEqual({success:true,data:receipt});
 const args={p_entity:entity,p_operation:contract.operationId,p_id:42,p_revision:'1',p_data:payload};
 expect(db.rpc.mock.calls).toEqual([[rpc,args],[rpc,args]]);
});

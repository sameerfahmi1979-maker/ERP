// Real actions and receipt parsers; all Auth/RPC/provider/file/cache ports are offline doubles.
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
const m=vi.hoisted(()=>({auth:vi.fn(),client:vi.fn(),admin:vi.fn(),rpc:vi.fn(),adminRpc:vi.fn(),claims:vi.fn(),cache:vi.fn(),check:vi.fn(),send:vi.fn(),write:vi.fn(),audit:vi.fn(),from:vi.fn(),adminFrom:vi.fn(),metadata:vi.fn(),log:vi.fn(),events:[] as string[]}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.auth}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.admin}));
vi.mock('next/cache',()=>({revalidatePath:m.cache}));
vi.mock('@/lib/email/providers/microsoft-graph-provider',()=>({MicrosoftGraphEmailProvider:class{testConnection(){return m.check();}sendEmail(input:unknown){return m.send(input);}}}));
vi.mock('@/lib/ai/providers/factory',()=>({getAiProvider:async()=>({testConnection:m.check})}));
vi.mock('@/lib/settings/env-file-secrets',()=>({writeAiProviderSecret:m.write}));
vi.mock('@/server/actions/audit',()=>({logAudit:m.audit}));
import * as email from '@/server/actions/settings/email-settings';
import * as ai from '@/server/actions/settings/ai-settings';

const operationId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const session='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const contract=(revision:string|null='4'):WorkspaceSaveContract=>({operationId,revision});
const receipt={id:41,revision:'5',changed:true,replayed:false};
const privateDetail='SYNTHETIC_PRIVATE_CACHE_DETAIL';
const secret='SYNTHETIC_ONLY_CREDENTIAL';
const grants=['settings.email.manage','settings.email.test','settings.email.secrets.manage','settings.email.feature_flags.manage','settings.ai.manage','settings.ai.test','settings.ai.secrets.manage'];
const principal=(codes=grants)=>({profile:{id:71,must_change_password:false},isAccountActive:true,globalPermissionCodes:codes,permissionCodes:codes,roleCodes:[],roleAssignments:[]});
let rawReceipt:unknown,recorded:unknown,recordError:unknown,providerRow:Record<string,unknown>;
function query(row:unknown){const q={select:vi.fn(()=>q),eq:vi.fn(()=>q),is:vi.fn(()=>q),single:vi.fn(async()=>({data:row,error:null})),maybeSingle:vi.fn(async()=>({data:row,error:null})),update:vi.fn(()=>q),insert:m.log,then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(m.metadata()).then(resolve)};return q;}
beforeEach(()=>{
 vi.resetAllMocks();m.events=[];rawReceipt={...receipt};recorded={ok:false,message:'Recorded connection check failed.',revision:'5',durationMs:0};recordError=null;
 providerRow={id:41,workspace_revision:4,provider_code:'F06_POSTCOMMIT',config_code:'F06_POSTCOMMIT',provider_type:'microsoft_graph',is_enabled:true,is_active:true,is_default:false,updated_at:'synthetic-version'};
 m.auth.mockResolvedValue(principal());m.claims.mockResolvedValue({data:{claims:{session_id:session}},error:null});
 m.rpc.mockImplementation(async(name:string)=>{m.events.push(name);if(name==='f03_current_session_valid')return {data:true,error:null};if(['save_provider_configuration','save_provider_feature_flag'].includes(name))return {data:rawReceipt,error:null};throw Error('Unexpected session RPC');});
 m.adminRpc.mockImplementation(async(name:string)=>{m.events.push(name);if(name==='save_email_provider_secret')return {data:rawReceipt,error:null};if(name==='record_provider_health')return {data:recorded,error:recordError};throw Error('Unexpected admin RPC');});
 m.from.mockImplementation((table:string)=>{if(!['erp_email_provider_configs','erp_ai_provider_configs','erp_email_send_logs'].includes(table))throw Error('Unexpected table');return query(providerRow);});
 m.adminFrom.mockImplementation((table:string)=>{if(table!=='erp_ai_provider_configs')throw Error('Unexpected admin table');return query({id:41,provider_type:'openai',updated_at:'synthetic-version'});});
 m.client.mockResolvedValue({rpc:m.rpc,from:m.from,auth:{getClaims:m.claims}});m.admin.mockReturnValue({rpc:m.adminRpc,from:m.adminFrom});
 m.metadata.mockReturnValue({data:[{id:41}],error:null});m.log.mockResolvedValue({data:null,error:null});m.audit.mockResolvedValue({success:true});
 m.check.mockResolvedValue({ok:false,status:'failed',message:'Ignored adapter detail',durationMs:0});
 m.send.mockResolvedValue({ok:true,status:'sent',message:'Provider accepted; inbox delivery not confirmed.',durationMs:0});
 m.write.mockImplementation(async(_input:unknown,persist:()=>Promise<boolean>)=>({success:await persist()}));
 m.cache.mockImplementation(()=>{m.events.push('cache');throw Error(privateDetail);});
});
const actions=[
 ['email create','email','save_provider_configuration',()=>email.createEmailProviderConfig({provider_code:'F06_POSTCOMMIT_EMAIL',provider_name:'Synthetic',provider_type:'microsoft_graph',is_enabled:false},contract(null))],
 ['email update','email','save_provider_configuration',()=>email.updateEmailProviderConfig(41,{notes:'Synthetic'},contract())],
 ['email archive','email','save_provider_configuration',()=>email.deleteEmailProviderConfig(41,contract())],
 ['email default','email','save_provider_configuration',()=>email.setDefaultEmailProviderConfig(41,contract())],
 ['email secret','email','save_email_provider_secret',()=>email.saveEmailProviderSecret({id:41,secret_value:secret},contract())],
 ['email probe','email','save_email_provider_secret',()=>email.checkEmailProviderSecretSave(41,contract())],
 ['email flag','email','save_provider_feature_flag',()=>email.updateEmailFeatureFlag('F06_POSTCOMMIT_EMAIL',{is_enabled:true},contract())],
 ['AI create','ai','save_provider_configuration',()=>ai.createAiProviderConfig({config_code:'F06_POSTCOMMIT_AI',provider_name:'Synthetic',provider_type:'local_custom',purpose:'general',is_enabled:false},contract(null))],
 ['AI update','ai','save_provider_configuration',()=>ai.updateAiProviderConfig({id:41,notes:'Synthetic'},contract())],
 ['AI archive','ai','save_provider_configuration',()=>ai.deleteAiProviderConfig(41,contract())],
 ['AI flag','ai','save_provider_feature_flag',()=>ai.updateAiFeatureFlag('F06_POSTCOMMIT_AI',{is_enabled:false},contract())],
] as const;
describe.each(actions)('%s postcommit boundary',(_name,kind,rpcName,invoke)=>{
 it.each([
  ['commit',receipt],['no-op',{...receipt,revision:'4',changed:false}],['replay',{...receipt,replayed:true}],
 ] as const)('preserves the parsed %s receipt when invalidation throws',async(_state,value)=>{
  rawReceipt={...value,private:privateDetail,secret_ref:secret};const result=await invoke();
  expect(result).toEqual({success:true,data:value});expect(m.cache).toHaveBeenCalledExactlyOnceWith(`/admin/settings/${kind}`);
  const rpc=rpcName==='save_email_provider_secret'?m.adminRpc:m.rpc;
  expect(rpc.mock.calls.filter(([name])=>name===rpcName)).toHaveLength(1);expect([...m.rpc.mock.calls,...m.adminRpc.mock.calls].map(([name])=>name).filter(name=>name!=='f03_current_session_valid')).toEqual([rpcName]);expect(m.events.indexOf(rpcName)).toBeLessThan(m.events.indexOf('cache'));
  expect(JSON.stringify(result)).not.toContain(privateDetail);expect(JSON.stringify(result)).not.toContain(secret);
 });
 it('does not enter cache work on permission denial',async()=>{
  m.auth.mockResolvedValue(principal([]));const result=await invoke();expect(result.success).toBe(false);expect(m.cache).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();expect(m.adminRpc).not.toHaveBeenCalled();
 });
});
it('credential save and secret-free probe preserve exact actor/session/operation arguments',async()=>{
 await email.saveEmailProviderSecret({id:41,secret_value:secret},contract());await email.checkEmailProviderSecretSave(41,contract());
 const expected={p_actor:71,p_session:session,p_id:41,p_revision:'4',p_operation:operationId};
 expect(m.adminRpc.mock.calls).toEqual([['save_email_provider_secret',{...expected,p_secret:secret}],['save_email_provider_secret',{...expected,p_secret:null}]]);
 expect(m.write).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();
});
describe.each([actions[1],actions[6],actions[4]])('%s actual receipt parsing',(_name,_kind,_rpcName,invoke)=>{
 it.each([null,[],{...receipt,revision:5},{...receipt,revision:undefined},{...receipt,changed:undefined},{...receipt,replayed:'false'}])('rejects incomplete receipt %j before cache',async raw=>{
  rawReceipt=raw;const result=await invoke();expect(result).toMatchObject({success:false,uncertain:true});expect(result.data).toBeUndefined();expect(m.cache).not.toHaveBeenCalled();
 });
 it('preserves a known database rejection rather than confirming it',async()=>{
  const respond=async(name:string)=>name==='f03_current_session_valid'?{data:true,error:null}:{data:null,error:{code:'PT409',message:privateDetail}};
  m.rpc.mockImplementation(respond);m.adminRpc.mockImplementation(respond);const result=await invoke();expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);expect(JSON.stringify(result)).not.toContain(privateDetail);expect(m.cache).not.toHaveBeenCalled();
 });
 it('keeps real transport rejection uncertain',async()=>{
  m.rpc.mockImplementation(async(name:string)=>{if(name==='f03_current_session_valid')return {data:true,error:null};throw Error(privateDetail);});m.adminRpc.mockRejectedValue(Error(privateDetail));
  expect(await invoke()).toMatchObject({success:false,uncertain:true});expect(m.cache).not.toHaveBeenCalled();
 });
});
it('invalid credential session never reaches the privileged save or cache',async()=>{
 m.rpc.mockResolvedValue({data:false,error:null});expect((await email.checkEmailProviderSecretSave(41,contract())).success).toBe(false);expect(m.adminRpc).not.toHaveBeenCalled();expect(m.cache).not.toHaveBeenCalled();
});
describe.each([['email',email.testEmailProviderConnection],['ai',ai.testAiProviderConnection]] as const)('%s recorded health', (kind,invoke)=>{
 it.each([true,false])('retains the exact recorded ok=%s shape despite cache failure',async ok=>{
  const message=ok?'Recorded connection only; not delivery.':'Recorded connection check failed.';
  m.check.mockResolvedValue({ok,status:ok?'success':'failed',message:privateDetail,durationMs:0});recorded={ok,message,revision:'5',durationMs:0};
  const result=await invoke(41);
  expect(result).toEqual(kind==='email'?{success:ok,data:{status:ok?'success':'failed',message,durationMs:0},error:ok?undefined:message}:{success:true,data:{ok,message,durationMs:0}});
  expect(m.check).toHaveBeenCalledOnce();expect(m.adminRpc).toHaveBeenCalledExactlyOnceWith('record_provider_health',{p_kind:kind,p_id:41,p_revision:4,p_actor:71,p_session:session,p_ok:ok,p_duration:0});
  expect(m.events).toEqual(['f03_current_session_valid','record_provider_health','cache']);expect(m.cache).toHaveBeenCalledExactlyOnceWith(`/admin/settings/${kind}`);expect(JSON.stringify(result)).not.toContain(privateDetail);
 });
 it.each(['rejected','malformed'] as const)('a %s recording never enters cache work',async state=>{
  if(state==='rejected')recordError={code:'PT409',message:privateDetail};else recorded={ok:false};
  const result=await invoke(41);expect(result.success).toBe(false);expect(m.cache).not.toHaveBeenCalled();expect(m.check).toHaveBeenCalledOnce();expect(m.adminRpc).toHaveBeenCalledOnce();
 });
 it.each(['missing','malformed','claims-error','claims-throw','expired','session-error'] as const)('rejects %s session before privileged recording',async reason=>{
  if(reason==='missing')m.claims.mockResolvedValue({data:{claims:{}},error:null});
  if(reason==='malformed')m.claims.mockResolvedValue({data:{claims:{session_id:privateDetail}},error:null});
  if(reason==='claims-error')m.claims.mockResolvedValue({data:{claims:{session_id:session}},error:{message:privateDetail}});
  if(reason==='claims-throw')m.claims.mockRejectedValue(Error(privateDetail));
  if(reason==='expired')m.rpc.mockResolvedValue({data:false,error:null});
  if(reason==='session-error')m.rpc.mockResolvedValue({data:true,error:{message:privateDetail}});
  const result=await invoke(41);expect(result.success).toBe(false);expect(m.adminRpc).not.toHaveBeenCalled();expect(m.cache).not.toHaveBeenCalled();expect(m.check).toHaveBeenCalledOnce();
  expect(JSON.stringify(result)).not.toContain(privateDetail);
 });
 it('preserves safe late permission denial without retry or cache effects',async()=>{
  recordError={code:'42501',message:privateDetail,details:privateDetail};
  const result=await invoke(41);expect(result.success).toBe(false);expect(m.adminRpc).toHaveBeenCalledOnce();expect(m.cache).not.toHaveBeenCalled();expect(m.check).toHaveBeenCalledOnce();expect(JSON.stringify(result)).not.toContain(privateDetail);
 });
});
it.each([true,false])('test-email simulated result ok=%s survives cache failure without resending',async ok=>{
 const message=ok?'Provider accepted; inbox delivery not confirmed.':'Submission unconfirmed; do not blindly resend.';
 m.send.mockResolvedValue({ok,status:ok?'sent':'failed',message,durationMs:0});
 const result=await email.sendTestEmail(41,{to_email:'recipient@example.invalid',subject:'Synthetic',message:'Synthetic only'});
 expect(result).toEqual({success:ok,data:{status:ok?'sent':'failed',message,durationMs:0},error:ok?undefined:message});
 expect(m.send).toHaveBeenCalledOnce();expect(m.log).toHaveBeenCalledOnce();expect(m.audit).toHaveBeenCalledOnce();expect(m.cache).toHaveBeenCalledExactlyOnceWith('/admin/settings/email');
});
it('optional AI writer remains a fully doubled one-call path after cache failure',async()=>{
 const result=await ai.saveAiProviderSecret({id:41,secret_ref:'OPENAI_API_KEY',secret_value:secret});
 expect(result).toEqual({success:true});expect(m.write).toHaveBeenCalledOnce();expect(m.metadata).toHaveBeenCalledOnce();expect(m.audit).toHaveBeenCalledOnce();expect(JSON.stringify(m.audit.mock.calls)).not.toContain(secret);expect(m.cache).toHaveBeenCalledExactlyOnceWith('/admin/settings/ai');
});
it('repeated invalidation failure cannot hide a confirmed replay or cause an internal retry',async()=>{
 const first=await email.updateEmailFeatureFlag('F06_POSTCOMMIT_EMAIL',{is_enabled:true},contract());rawReceipt={...receipt,replayed:true};
 const second=await email.updateEmailFeatureFlag('F06_POSTCOMMIT_EMAIL',{is_enabled:true},contract());
 expect(first).toEqual({success:true,data:receipt});expect(second).toEqual({success:true,data:{...receipt,replayed:true}});
 expect(m.rpc).toHaveBeenCalledTimes(2);expect(m.rpc.mock.calls[1]).toEqual(m.rpc.mock.calls[0]);expect(m.cache).toHaveBeenCalledTimes(2);
});

function w18ProviderError(code:unknown){
 const respond=async(name:string)=>name==='f03_current_session_valid'?{data:true,error:null}:{data:null,error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}};
 m.rpc.mockImplementation(respond);m.adminRpc.mockImplementation(respond);
}
describe.each([actions[1],actions[6],actions[4]])('%s W18 classifier',(_name,_kind,rpcName,invoke)=>{
 it.each([...['40003','08007','40ZZZ','PGRST000','XX000',undefined,null,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01','23p01',40001,42501,['40001'],new String('40001'), 'toString', 'constructor', '__proto__'],'55P03','55000','57014','57015'].map(code=>({code})))('unknown code %# preserves dispatched uncertainty',async({code})=>{
  w18ProviderError(code);const result=await invoke();expect(result).toMatchObject({success:false,uncertain:true});
  const rpc=rpcName==='save_email_provider_secret'?m.adminRpc:m.rpc;expect(rpc.mock.calls.filter(([name])=>name===rpcName)).toHaveLength(1);expect([...m.rpc.mock.calls,...m.adminRpc.mock.calls].map(([name])=>name).filter(name=>name!=='f03_current_session_valid')).toEqual([rpcName]);
  expect(JSON.stringify(result)).not.toMatch(/W18_PRIVATE|rolled back|was rejected/);expect(result).not.toHaveProperty('fieldErrors');expect(m.cache).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();expect(m.check).not.toHaveBeenCalled();
 });
 it.each(['40000','40001','40002','40P01','22023','23514','42501','P0001','PT409','PT404','PT123'])('exact known %s preserves definite failure',async code=>{
  w18ProviderError(code);const result=await invoke();expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);
  const rpc=rpcName==='save_email_provider_secret'?m.adminRpc:m.rpc;expect(rpc.mock.calls.filter(([name])=>name===rpcName)).toHaveLength(1);expect([...m.rpc.mock.calls,...m.adminRpc.mock.calls].map(([name])=>name).filter(name=>name!=='f03_current_session_valid')).toEqual([rpcName]);expect(m.cache).not.toHaveBeenCalled();expect(JSON.stringify(result)).not.toContain('W18_PRIVATE');
 });
 it('does not coerce mapped codes',async()=>{const toString=vi.fn(()=>'42501');w18ProviderError({toString});expect(await invoke()).toMatchObject({success:false,uncertain:true});expect(toString).not.toHaveBeenCalled();});
});
describe.each(actions)('%s W18 one-dispatch boundary',(_label,_kind,rpcName,invoke)=>{
 it.each(['40003','08007'])('unknown %s does not retry or perform side effects',async code=>{
  w18ProviderError(code);expect(await invoke()).toMatchObject({success:false,uncertain:true});const rpc=rpcName==='save_email_provider_secret'?m.adminRpc:m.rpc;
  expect(rpc.mock.calls.filter(([name])=>name===rpcName)).toHaveLength(1);expect([...m.rpc.mock.calls,...m.adminRpc.mock.calls].map(([name])=>name).filter(name=>name!=='f03_current_session_valid')).toEqual([rpcName]);expect(m.cache).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();expect(m.check).not.toHaveBeenCalled();
  if(_label==='email probe')expect(m.adminRpc).toHaveBeenCalledWith(rpcName,expect.objectContaining({p_secret:null,p_operation:operationId,p_revision:'4'}));
 });
});

describe.each([
 ['configuration',()=>email.updateEmailProviderConfig(41,{notes:'Synthetic'},contract()),'save_provider_configuration'],
 ['flag',()=>email.updateEmailFeatureFlag('F06_POSTCOMMIT_EMAIL',{is_enabled:true},contract()),'save_provider_feature_flag'],
] as const)('W18 %s retained request recovery',(_label,invoke,rpcName)=>{
 it.each(['40003','08007'])('explicit %s recovery never changes operation, revision or payload',async code=>{
  w18ProviderError(code);expect(await invoke()).toMatchObject({success:false,uncertain:true});
  const first=m.rpc.mock.calls.find(([name])=>name===rpcName);expect(first).toBeDefined();
  expect(first?.[1]).toMatchObject({p_operation:operationId,p_revision:'4'});
  if(rpcName==='save_provider_configuration')expect(first).toEqual([rpcName,{p_kind:'email',p_action:'save',p_id:41,p_data:{notes:'Synthetic'},p_operation:operationId,p_revision:'4'}]);
  else expect(first).toEqual([rpcName,{p_kind:'email',p_code:'F06_POSTCOMMIT_EMAIL',p_data:{is_enabled:true},p_operation:operationId,p_revision:'4'}]);
  w18ProviderError('40001');expect((await invoke()).success).toBe(false);expect(m.cache).not.toHaveBeenCalled();
  m.rpc.mockImplementation(async(name:string)=>name==='f03_current_session_valid'?{data:true,error:null}:{data:{...receipt,replayed:true},error:null});
  expect(await invoke()).toEqual({success:true,data:{...receipt,replayed:true}});
  expect(m.rpc.mock.calls.filter(([name])=>name===rpcName)).toEqual([first,first,first]);
  expect(m.send).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();expect(m.check).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
 });
});
it.each(['40003','08007'])('W18 credential %s recovers only with a secret-free same-operation probe',async code=>{
 const args={p_actor:71,p_session:session,p_id:41,p_revision:'4',p_operation:operationId};
 w18ProviderError(code);expect(await email.saveEmailProviderSecret({id:41,secret_value:secret},contract())).toMatchObject({success:false,uncertain:true});
 expect(m.adminRpc).toHaveBeenCalledExactlyOnceWith('save_email_provider_secret',{...args,p_secret:secret});expect(m.cache).not.toHaveBeenCalled();
 w18ProviderError('40001');expect((await email.checkEmailProviderSecretSave(41,contract())).success).toBe(false);expect(m.cache).not.toHaveBeenCalled();
 m.adminRpc.mockResolvedValue({data:{...receipt,replayed:true},error:null});expect(await email.checkEmailProviderSecretSave(41,contract())).toEqual({success:true,data:{...receipt,replayed:true}});
 expect(m.adminRpc.mock.calls).toEqual([['save_email_provider_secret',{...args,p_secret:secret}],['save_email_provider_secret',{...args,p_secret:null}],['save_email_provider_secret',{...args,p_secret:null}]]);
 expect(m.send).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();expect(m.check).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
});

// Actual read actions and permission/mapping code; every external effect is an offline double.
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
const m=vi.hoisted(()=>({auth:vi.fn(),client:vi.fn(),from:vi.fn(),execute:vi.fn(),admin:vi.fn(),rpc:vi.fn(),provider:vi.fn(),write:vi.fn(),audit:vi.fn(),cache:vi.fn(),calls:[] as unknown[][]}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.auth}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.admin}));
vi.mock('@/lib/email/providers/microsoft-graph-provider',()=>({MicrosoftGraphEmailProvider:class{constructor(){m.provider();}}}));
vi.mock('@/lib/ai/providers/factory',()=>({getAiProvider:m.provider}));
vi.mock('@/lib/settings/env-file-secrets',()=>({writeAiProviderSecret:m.write}));
vi.mock('@/server/actions/audit',()=>({logAudit:m.audit}));
vi.mock('next/cache',()=>({revalidatePath:m.cache}));
import * as email from '@/server/actions/settings/email-settings';
import * as ai from '@/server/actions/settings/ai-settings';

const marker='SYNTHETIC_TRANSPORT_DETAIL';
const history='SYNTHETIC_STORED_HISTORY';
const principal=(codes:string[]=[]):AuthContext=>({profile:{id:71,must_change_password:false},isAccountActive:true,globalPermissionCodes:codes,permissionCodes:codes,roleCodes:[],roleAssignments:[]} as unknown as AuthContext);
const emailConfigRow={id:41,workspace_revision:4,provider_code:'F06_READ',provider_type:'microsoft_graph',provider_name:'Synthetic',is_default:false,is_enabled:false,is_active:false,tenant_id:null,client_id:null,authority_url:null,graph_base_url:null,sender_email:null,sender_display_name:null,reply_to_email:null,secret_ref:'SYNTHETIC_REFERENCE',masked_secret_preview:'****',auth_mode:'client_credentials',send_mode:'graph_send_mail',default_recipient_for_tests:null,throttle_per_minute:0,daily_send_limit:0,last_test_status:'failed',last_test_at:null,last_test_message:history,config_json:{synthetic:false},notes:history,created_at:'2026-10-05',updated_at:'2026-10-05'};
const emailConfig={id:41,workspaceRevision:'4',providerCode:'F06_READ',providerType:'microsoft_graph',providerName:'Synthetic',isDefault:false,isEnabled:false,isActive:false,tenantId:null,clientId:null,authorityUrl:null,graphBaseUrl:null,senderEmail:null,senderDisplayName:null,replyToEmail:null,secretRef:'SYNTHETIC_REFERENCE',maskedSecretPreview:'****',authMode:'client_credentials',sendMode:'graph_send_mail',defaultRecipientForTests:null,throttlePerMinute:0,dailySendLimit:0,lastTestStatus:'failed',lastTestAt:null,lastTestMessage:history,configJson:{synthetic:false},notes:history,createdAt:'2026-10-05',updatedAt:'2026-10-05'};
const emailFlagRow={id:42,workspace_revision:4,feature_code:'F06_READ',feature_name:'Synthetic',is_enabled:false,requires_approval:false,notes:history,updated_at:'2026-10-05'};
const emailFlag={id:42,workspaceRevision:'4',featureCode:'F06_READ',featureName:'Synthetic',isEnabled:false,requiresApproval:false,notes:history,updatedAt:'2026-10-05'};
const emailLogRow={id:43,provider_config_id:null,feature_area:'synthetic',operation_type:'synthetic',status:'failed',from_email:null,to_emails:null,subject:null,message_preview:history,external_message_id:null,duration_ms:0,attempt_count:0,last_error:history,created_at:'2026-10-05',provider:{provider_name:'Historical provider'}};
const emailLog={id:43,providerConfigId:null,featureArea:'synthetic',operationType:'synthetic',status:'failed',fromEmail:null,toEmails:null,subject:null,messagePreview:history,externalMessageId:null,durationMs:0,attemptCount:0,lastError:history,createdAt:'2026-10-05',providerName:'Historical provider'};
const aiConfigRow={id:44,workspace_revision:4,config_code:'F06_READ',provider_type:'local_custom',provider_name:'Synthetic',purpose:'general',is_default:false,is_enabled:false,is_active:false,requires_human_review:false,confidence_threshold:'0',secret_ref:'SYNTHETIC_REFERENCE',masked_secret_preview:'****',last_test_status:'failed',last_test_message:history,notes:history};
const aiConfig={id:44,workspaceRevision:'4',configCode:'F06_READ',providerType:'local_custom',providerName:'Synthetic',apiEndpoint:null,modelId:null,apiVersion:null,purpose:'general',isDefault:false,isEnabled:false,isActive:false,requiresHumanReview:false,confidenceThreshold:0,configJson:null,secretRef:'SYNTHETIC_REFERENCE',maskedSecretPreview:'****',lastTestStatus:'failed',lastTestAt:null,lastTestMessage:history,notes:history};
const aiFlagRow={id:45,workspace_revision:4,feature_code:'F06_READ',feature_name:'Synthetic',is_enabled:false,requires_human_review:false,min_confidence_threshold:'0'};
const aiFlag={id:45,workspaceRevision:'4',featureCode:'F06_READ',featureName:'Synthetic',description:null,isEnabled:false,requiresHumanReview:false,minConfidenceThreshold:0};
const aiLogRow={id:46,feature_area:'synthetic',operation_type:'synthetic',model_id:null,status:'failed',duration_ms:0,estimated_cost:'0',error_message:history,created_at:'2026-10-05',erp_ai_provider_configs:{provider_name:'Historical provider'}};
const aiLog={id:46,featureArea:'synthetic',operationType:'synthetic',modelId:null,status:'failed',durationMs:0,estimatedCost:0,errorMessage:history,createdAt:'2026-10-05',providerName:'Historical provider'};
const readers=[
 {name:'email configs',kind:'email',read:email.getEmailProviderConfigs,table:'erp_email_provider_configs',grants:['settings.email.view','settings.email.manage','settings.email.test','settings.email.secrets.manage'],message:'Email provider configurations could not be loaded. Try loading settings again.',row:emailConfigRow,expected:emailConfig,shape:[['select','*'],['is','deleted_at',null],['order','is_default',{ascending:false}],['order','provider_name',{ascending:true}]]},
 {name:'email flags',kind:'email',read:email.getEmailFeatureFlags,table:'erp_email_feature_flags',grants:['settings.email.view','settings.email.manage','settings.email.feature_flags.manage'],message:'Email feature flags could not be loaded. Try loading settings again.',row:emailFlagRow,expected:emailFlag,shape:[['select','id, feature_code, feature_name, is_enabled, requires_approval, notes, updated_at, workspace_revision'],['order','feature_code',{ascending:true}]]},
 {name:'email logs',kind:'email',read:email.getEmailSendLogs,table:'erp_email_send_logs',grants:['settings.email.logs.view','settings.email.manage'],message:'Email send logs could not be loaded. Try loading settings again.',row:emailLogRow,expected:emailLog,shape:[['select','id, provider_config_id, feature_area, operation_type, status, from_email, to_emails, subject, message_preview, external_message_id, duration_ms, attempt_count, last_error, created_at, provider:erp_email_provider_configs!provider_config_id(provider_name)'],['order','created_at',{ascending:false}],['limit',100]]},
 {name:'AI configs',kind:'ai',read:ai.getAiProviderConfigs,table:'erp_ai_provider_configs',grants:['settings.ai.view','settings.ai.manage','settings.ai.test','settings.ai.secrets.manage'],message:'AI provider configurations could not be loaded. Try loading settings again.',row:aiConfigRow,expected:aiConfig,shape:[['select','*'],['is','deleted_at',null],['order','purpose',{ascending:true}],['order','config_code',{ascending:true}]]},
 {name:'AI flags',kind:'ai',read:ai.getAiFeatureFlags,table:'erp_ai_feature_flags',grants:['settings.ai.view','settings.ai.manage'],message:'AI feature flags could not be loaded. Try loading settings again.',row:aiFlagRow,expected:aiFlag,shape:[['select','*'],['order','feature_code',{ascending:true}]]},
 {name:'AI logs',kind:'ai',read:ai.getAiUsageLogs,table:'erp_ai_usage_logs',grants:['settings.ai.usage.view'],message:'AI usage logs could not be loaded. Try loading settings again.',row:aiLogRow,expected:aiLog,shape:[['select','*, erp_ai_provider_configs(provider_name)'],['order','created_at',{ascending:false}],['limit',50]]},
] as const;
beforeEach(()=>{
 vi.resetAllMocks();m.calls=[];m.auth.mockResolvedValue(principal());m.execute.mockResolvedValue({data:[],error:null});
 m.from.mockImplementation((table:string)=>{
  m.calls.push(['from',table]);
  const record=(name:string,args:unknown[])=>{m.calls.push([name,...args]);return builder;};
  const builder={select:(columns:string)=>record('select',[columns.replace(/\s+/g,' ').trim()]),is:(...args:unknown[])=>record('is',args),order:(...args:unknown[])=>record('order',args),limit:(...args:unknown[])=>record('limit',args),then:(resolve:(value:unknown)=>unknown,reject:(reason:unknown)=>unknown)=>m.execute().then(resolve,reject)};
  return builder;
 });
 m.client.mockResolvedValue({from:m.from,rpc:m.rpc});
 for(const effect of [m.admin,m.rpc,m.provider,m.write,m.audit,m.cache])effect.mockImplementation(()=>{throw Error('UNEXPECTED_EXTERNAL_EFFECT');});
});
afterEach(()=>{for(const effect of [m.admin,m.rpc,m.provider,m.write,m.audit,m.cache])expect(effect).not.toHaveBeenCalled();});
describe.each(readers)('$name read boundary',reader=>{
 const denied=reader.kind==='email'?'Permission denied':reader.name==='AI logs'?'You do not have permission to view AI usage logs':'You do not have permission to view AI settings';
 beforeEach(()=>{m.auth.mockResolvedValue(principal([reader.grants[0]]));});
 it('returns a fixed service error without raw diagnostic fields',async()=>{
  m.execute.mockResolvedValue({data:null,error:{message:marker,details:marker,hint:marker,code:'XX000'}});
  const result=await reader.read();expect(result).toEqual({success:false,error:reader.message});expect(JSON.stringify(result)).not.toContain(marker);expect(m.execute).toHaveBeenCalledOnce();
 });
 it('does not touch the mapper when an error accompanies partial data',async()=>{
  const touched=vi.fn(()=>{throw Error('MAPPER_MUST_NOT_RUN');});const row={...reader.row};Object.defineProperty(row,'id',{get:touched});
  m.execute.mockResolvedValue({data:[row],error:{message:marker}});const result=await reader.read();
  expect(touched).not.toHaveBeenCalled();expect(result).toEqual({success:false,error:reader.message});
 });
 it.each(['auth','client','query','mapping'] as const)('uses read-specific failure wording for a thrown %s boundary',async boundary=>{
  const thrown=Error(marker);let touched:ReturnType<typeof vi.fn>|undefined;
  if(boundary==='auth')m.auth.mockRejectedValue(thrown);
  else if(boundary==='client')m.client.mockRejectedValue(thrown);
  else if(boundary==='query')m.execute.mockRejectedValue(thrown);
  else{touched=vi.fn(()=>{throw thrown;});const row={...reader.row};Object.defineProperty(row,'id',{get:touched});m.execute.mockResolvedValue({data:[row],error:null});}
  const result=await reader.read();if(touched)expect(touched).toHaveBeenCalledOnce();
  expect(result).toEqual({success:false,error:reader.message});expect(JSON.stringify(result)).not.toContain(marker);
  if(boundary==='auth'||boundary==='client')expect(m.from).not.toHaveBeenCalled();else expect(m.execute).toHaveBeenCalledOnce();
 });
 it.each([{data:[]},{data:null}])('preserves a successful empty/null result %j',async({data})=>{
  m.execute.mockResolvedValue({data,error:null});expect(await reader.read()).toEqual({success:true,data:[]});
 });
 it('preserves exact successful history, false/zero/null values, revision and query shape',async()=>{
  m.execute.mockResolvedValue({data:[reader.row],error:null});expect(await reader.read()).toEqual({success:true,data:[reader.expected]});
  expect(m.calls).toEqual([['from',reader.table],...reader.shape]);expect(m.execute).toHaveBeenCalledOnce();
 });
 it.each(reader.grants)('accepts minimal global grant %s with empty role arrays',async grant=>{
  m.auth.mockResolvedValue(principal([grant]));expect(await reader.read()).toEqual({success:true,data:[]});expect(m.from).toHaveBeenCalledExactlyOnceWith(reader.table);
 });
 it.each(['none','scoped','inactive','password','profile'] as const)('preserves denial for %s without issuing a query',async kind=>{
  const ctx=principal(kind==='none'?[]:[reader.grants[0]]);
  if(kind==='scoped'){ctx.globalPermissionCodes=[];ctx.roleAssignments=[{roleCode:'synthetic',ownerCompanyId:1,branchId:null,permissionCodes:[reader.grants[0]]}];}
  if(kind==='inactive')ctx.isAccountActive=false;
  if(kind==='password')ctx.profile!.must_change_password=true;
  if(kind==='profile')ctx.profile=null;
  m.auth.mockResolvedValue(ctx);expect(await reader.read()).toEqual({success:false,error:kind==='profile'&&reader.kind==='email'?'Not authenticated':denied});
  expect(m.from).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled();expect(m.client).toHaveBeenCalledTimes(reader.kind==='email'?1:0);
 });
 it.each(['system_admin','group_admin'])('preserves global %s override without explicit grants',async roleCode=>{
  const ctx=principal();ctx.roleAssignments=[{roleCode,ownerCompanyId:null,branchId:null,permissionCodes:[]}];m.auth.mockResolvedValue(ctx);
  expect(await reader.read()).toEqual({success:true,data:[]});expect(m.from).toHaveBeenCalledExactlyOnceWith(reader.table);
 });
});
it('AI management alone never grants usage history',async()=>{
 m.auth.mockResolvedValue(principal(['settings.ai.manage']));expect(await ai.getAiUsageLogs()).toEqual({success:false,error:'You do not have permission to view AI usage logs'});expect(m.from).not.toHaveBeenCalled();
});
it.each([['email',email.getEmailSendLogs],['AI',ai.getAiUsageLogs]] as const)('%s forwards an explicit bounded recent-history limit unchanged',async(kind,read)=>{
 m.auth.mockResolvedValue(principal([kind==='email'?'settings.email.logs.view':'settings.ai.usage.view']));expect(await read(7)).toEqual({success:true,data:[]});expect(m.calls.at(-1)).toEqual(['limit',7]);
});
it('AI usage preserves nullable cost/duration/provider without manufacturing zeros',async()=>{
 m.auth.mockResolvedValue(principal(['settings.ai.usage.view']));m.execute.mockResolvedValue({data:[{...aiLogRow,estimated_cost:null,duration_ms:null,erp_ai_provider_configs:null}],error:null});
 expect(await ai.getAiUsageLogs()).toEqual({success:true,data:[{...aiLog,estimatedCost:null,durationMs:null,providerName:null}]});
});

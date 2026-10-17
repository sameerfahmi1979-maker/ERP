// W18 actual adapters and schemas; only Auth/RPC/image/Storage/cache ports are doubled.
// Network is blocked by the unchanged F06 setup. No native helper or local service import.
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {WorkspaceSaveResult} from '@/server/workspace-save';
const m=vi.hoisted(()=>({rpc:vi.fn(),adminRpc:vi.fn(),cache:vi.fn(),claims:vi.fn(),from:vi.fn(),upload:vi.fn(),download:vi.fn(),remove:vi.fn(),image:vi.fn(),authority:vi.fn(),auth:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.auth,hasGlobalPermission:()=>true,hasRole:()=>true}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.rpc,from:m.from,auth:{getClaims:m.claims}})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:m.adminRpc,storage:{from:()=>({upload:m.upload,download:m.download,remove:m.remove})}})}));
vi.mock('next/cache',()=>({revalidatePath:m.cache}));
vi.mock('@/server/branding-image',()=>({verifyBrandingImage:m.image}));
vi.mock('@/server/report-template-authority',()=>({requireReportTemplateCapability:m.authority}));
import {saveBrandingUpload,retireBrandingAsset} from '@/server/branding-asset-save';
import {saveCurrencyRecord} from '@/server/currency-save';
import {saveFinanceCenterRecord} from '@/server/finance-center-save';
import {saveGeographyInput} from '@/server/geography-save';
import {saveUomRecord} from '@/server/uom-save';
import {savePartyAddress} from '@/server/party-address-save';
import {savePartyChild,verifyPartyBank} from '@/server/party-child-save';
import {savePartyType} from '@/server/party-type-save';
import {saveTemplateConfiguration} from '@/server/template-configuration-save';
import {saveTemplateGovernance} from '@/server/template-governance-save';
import {setPartyChildArchived} from '@/server/actions/master-data/party-child-lifecycle';
import {upsertPartyFinanceProfile} from '@/server/actions/master-data/party-finance-profiles';
import * as geo from '@/features/master-data/geography/validation';

const operationId='70e9e46b-67e5-4c6b-a2f2-38f6b3d7a472',session='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const contract={operationId,revision:'4'},created={operationId,revision:null};
const receipt={id:7,revision:'5',changed:true,replayed:false};
const assetReceipt={...receipt,parent_revision:'5',owner_company_id:1};
const assetContract={operationId,assetId:7,revision:'4',parentRevision:'4'};
const governanceReceipt={...receipt,source_id:7,governance_status:'draft',security_review_status:'passed',owner_company_id:1,review:null};
const privateDetail='W18_PRIVATE_DIAGNOSTIC';
function uploadForm(){
 const form=new FormData();
 form.set('metadata',JSON.stringify({assetScope:'report',assetType:'report_logo',brandingProfileId:7,ownerCompanyId:1}));
 form.set('contract',JSON.stringify(assetContract));form.set('file',new File(['synthetic image port'],'w18.png',{type:'image/png'}));return form;
}
beforeEach(()=>{
 vi.resetAllMocks();
 const codes=['reports.manage','reports.sign','branding.assets.upload','branding.app.manage'];
 m.auth.mockResolvedValue({profile:{id:71},isAccountActive:true,globalPermissionCodes:codes,permissionCodes:codes,roleCodes:[],roleAssignments:[{ownerCompanyId:1,branchId:null,roleCode:'synthetic_company_writer',permissionCodes:codes}]});
 m.claims.mockResolvedValue({data:{claims:{session_id:session}},error:null});
 m.authority.mockResolvedValue({template:{body_html_en:'<p>Synthetic template</p>',show_stamp:false,show_signatory:false},companyId:1});
 const q={select:vi.fn(()=>q),eq:vi.fn(()=>q),maybeSingle:vi.fn(async()=>({data:{id:7,owner_company_id:1,is_active:true},error:null}))};m.from.mockReturnValue(q);
 m.image.mockResolvedValue({bytes:Buffer.from('synthetic verified image'),metadata:{mime:'image/png',sha256:'a'.repeat(64)}});
 m.upload.mockResolvedValue({data:{path:'reserved'},error:null});m.download.mockRejectedValue(Error('Unexpected download'));m.remove.mockRejectedValue(Error('Forbidden compensation'));
 m.rpc.mockImplementation(async(name:string)=>({data:name==='f03_current_session_valid'?true:receipt,error:null}));
 m.adminRpc.mockResolvedValue({data:assetReceipt,error:null});
});
type Variant={label:string;rpc:string;invoke:()=>Promise<WorkspaceSaveResult>;admin?:boolean;known55?:'class'|'exact';beforeUpload?:boolean;afterUpload?:boolean;success?:object;args:object};
const variants:Variant[]=[];
const attempt={p_operation:operationId,p_id:7,p_revision:'4'};
const actions=['save','active','lock','retire'] as const;
// The broad legacy hasRole mock is not an exact global system assignment.
// Only these finance retirement dispatch fixtures deliberately receive one.
function authorizedFinanceDispatch(action:string,invoke:()=>Promise<WorkspaceSaveResult>){
 if(action==='retire')m.auth.mockResolvedValueOnce({profile:{id:71,must_change_password:false},isAccountActive:true,
  globalPermissionCodes:[],permissionCodes:[],roleCodes:['system_admin'],
  roleAssignments:[{ownerCompanyId:null,branchId:null,roleCode:'system_admin',permissionCodes:[]}]});
 return invoke();
}
for(const action of actions){
 variants.push({label:'currency '+action,rpc:'save_currency_record',args:{...attempt,p_action:action,p_data:{is_active:false}},invoke:()=>authorizedFinanceDispatch(action,()=>saveCurrencyRecord(action,7,{is_active:false},contract))});
 for(const entity of ['cost_centers','profit_centers'] as const)variants.push({label:entity+' '+action,rpc:'save_finance_center_record',args:{...attempt,p_entity:entity,p_action:action,p_data:{is_active:false}},known55:'class',invoke:()=>authorizedFinanceDispatch(action,()=>saveFinanceCenterRecord(entity,action,7,{is_active:false},contract))});
 for(const entity of ['uom_categories','units_of_measure','uom_conversions'] as const)variants.push({label:entity+' '+action,rpc:'save_uom_record',args:{...attempt,p_entity:entity,p_action:action,p_data:{is_active:false}},known55:'class',invoke:()=>saveUomRecord(entity,action,7,{is_active:false},contract)});
}
const geoSchemas=[['countries',geo.updateCountrySchema],['emirates',geo.updateEmirateSchema],['cities',geo.updateCitySchema],['areas_zones',geo.updateAreaZoneSchema],['ports',geo.updatePortSchema]] as const;
for(const [entity,schema] of geoSchemas)for(const action of actions){
 const input=action==='active'?{id:7,is_active:false}:action==='lock'?{id:7,is_locked:true}:action==='retire'?{id:7}:{id:7,name_en:'Synthetic'};
 const validator=action==='active'?geo.toggleGeographyStatusSchema:action==='lock'?geo.toggleGeographyLockSchema:schema;
 variants.push({label:entity+' '+action,rpc:'save_geography_record',args:{...attempt,p_entity:entity,p_action:action,p_data:action==='active'?{is_active:false}:action==='lock'?{is_locked:true}:action==='retire'?{}:{name_en:'Synthetic'}},invoke:()=>saveGeographyInput(entity,action,input,validator,contract)});
}
variants.push({label:'address edit',rpc:'save_party_address',args:{...attempt,p_data:{is_primary:false}},invoke:()=>savePartyAddress(7,{is_primary:false},contract)});
const children=['party_contacts','party_bank_details','party_licenses','party_tax_registrations','party_documents','party_notes'] as const;
for(const entity of children)variants.push({label:entity+' edit',rpc:'save_party_child_record',args:{...attempt,p_entity:entity,p_data:{remarks:'Synthetic'}},invoke:()=>savePartyChild(entity,7,{remarks:'Synthetic'},contract)});
variants.push({label:'bank verification',rpc:'verify_party_bank_record',args:attempt,invoke:()=>verifyPartyBank(7,contract)});
for(const entity of [...children,'party_addresses'] as const)for(const archived of [true,false])variants.push({label:entity+' archived='+archived,rpc:'set_party_child_archived',args:{...attempt,p_entity:entity,p_archived:archived},invoke:()=>setPartyChildArchived(entity,7,archived,contract),success:{...receipt,archived}});
for(const id of [null,7]){
 variants.push({label:'party type '+(id===null?'create':'edit'),rpc:'save_party_type',args:{...attempt,p_id:id,p_revision:id===null?null:'4',p_data:{is_active:false}},invoke:()=>savePartyType(id,{is_active:false},id===null?created:contract)});
 variants.push({label:'template '+(id===null?'create':'edit'),rpc:'save_template_configuration',args:{...attempt,p_id:id,p_revision:id===null?null:'4',p_data:{template_name:'Synthetic'}},invoke:()=>saveTemplateConfiguration(id,{template_name:'Synthetic'},id===null?created:contract),success:{...receipt,owner_company_id:1}});
}
variants.push({label:'finance profile',rpc:'save_party_finance_profile',args:{p_operation:operationId,p_party_id:10,p_revision:'4',p_data:{credit_limit:0,finance_hold:false}},known55:'exact',invoke:()=>upsertPartyFinanceProfile({party_id:10,credit_limit:0,finance_hold:false},contract)});
for(const action of ['submit','approve','reject','publish','archive','new_version','review'] as const)variants.push({label:'governance '+action,rpc:'transition_report_template',args:{...attempt,p_actor:71,p_session:session,p_action:action,p_note:'Synthetic review reason',p_review:action==='submit'||action==='review'?{passed:true,severity:'none',findings:[]}:null},admin:true,invoke:()=>saveTemplateGovernance(7,action,'Synthetic review reason',contract),success:{...governanceReceipt,id:action==='new_version'?8:7}});
variants.push(
 {label:'asset prepare',rpc:'prepare_branding_asset_change',args:{p_actor:71,p_session:session,p_scope:'report',p_parent:7,p_type:'report_logo',p_operation:operationId,p_expected_asset:7,p_revision:'4',p_parent_revision:'4',p_mode:'upload',p_metadata:{mime:'image/png',sha256:'a'.repeat(64)}},admin:true,beforeUpload:true,invoke:()=>saveBrandingUpload(uploadForm()),success:{status:'complete',receipt:assetReceipt}},
 {label:'asset finalize',rpc:'finalize_branding_asset_change',args:{p_actor:71,p_session:session,p_operation:operationId},admin:true,afterUpload:true,invoke:()=>saveBrandingUpload(uploadForm()),success:assetReceipt},
 ...(['deactivate','retire'] as const).map(mode=>({label:'asset '+mode,rpc:'retire_branding_asset_change',args:{p_actor:71,p_session:session,p_asset:7,p_revision:'4',p_parent_revision:'4',p_operation:operationId,p_mode:mode},admin:true,invoke:()=>retireBrandingAsset(7,mode,assetContract),success:{status:'complete',receipt:assetReceipt}})),
);
function respond(v:Variant,error:unknown,data:unknown=null){
 const dispatch=async(name:string)=>{
  if(name==='f03_current_session_valid')return {data:true,error:null};
  if(v.afterUpload&&name==='prepare_branding_asset_change')return {data:{status:'prepared',path:'report/company-1/profile-7/report_logo/v2.png',version:2},error:null};
  if(name!==v.rpc)throw Error('Unexpected business RPC '+name);
  return {data,error};
 };m.rpc.mockImplementation(dispatch);m.adminRpc.mockImplementation(dispatch);
}
function calls(v:Variant){return (v.admin?m.adminRpc:m.rpc).mock.calls.filter(([name])=>name===v.rpc);}
function noAfterError(v:Variant){
 expect(calls(v)).toEqual([[v.rpc,v.args]]);
 if(v.admin){expect(m.rpc.mock.calls).toEqual([['f03_current_session_valid']]);expect(m.adminRpc.mock.calls.map(([name])=>name)).toEqual(v.afterUpload?['prepare_branding_asset_change',v.rpc]:[v.rpc]);}
 else {expect(m.rpc.mock.calls).toEqual([[v.rpc,v.args]]);expect(m.adminRpc).not.toHaveBeenCalled();}expect(m.cache).not.toHaveBeenCalled();expect(m.remove).not.toHaveBeenCalled();expect(m.download).not.toHaveBeenCalled();
 expect(m.upload).toHaveBeenCalledTimes(v.afterUpload?1:0);
 if(v.beforeUpload)expect(m.adminRpc.mock.calls.map(([name])=>name)).toEqual(['prepare_branding_asset_change']);
}
const representatives=['currency save','cost_centers save','uom_categories save','countries save','address edit','party_contacts edit','bank verification','party_contacts archived=true','party type edit','template edit','finance profile','governance submit','asset prepare'];
const unknown:unknown[]=['40003','08007','40ZZZ','PGRST000','XX000',undefined,null,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01','23p01',40001,42501,['40001'],new String('40001'), 'toString', 'constructor', '__proto__'];
describe.each(variants.filter(v=>representatives.includes(v.label)))('$label exact error policy',v=>{
 const known=['40000','40001','40002','40P01','22023','23514','42501','P0001','PT404','PT409','PT123',...(v.known55?['55P03']:[]),...(v.known55==='class'?['55000']:[]),...(v.known55==='exact'?['57014']:[])];
 it.each([...unknown,...['55P03','55000','57014','57015'].filter(code=>!known.includes(code))].map(code=>({code})))('unknown %# never implies rollback',async({code})=>{
  respond(v,{code,message:privateDetail,details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'});const result=await v.invoke();expect(result).toMatchObject({success:false,uncertain:true});noAfterError(v);
  expect(JSON.stringify(result)).not.toMatch(/W18_PRIVATE|no .*committed|rolled back|was rejected|were rejected/i);expect(result).not.toHaveProperty('fieldErrors');expect(result.error).toMatch(/unconfirmed/i);
 });
 it.each(known)('known exact %s preserves the existing policy',async code=>{
  respond(v,{code,message:privateDetail});const result=await v.invoke();expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);expect(JSON.stringify(result)).not.toContain(privateDetail);noAfterError(v);
 });
 it('never coerces an object into a mapped error code',async()=>{
  const toString=vi.fn(()=>'42501');respond(v,{code:{toString},message:privateDetail});expect(await v.invoke()).toMatchObject({success:false,uncertain:true});expect(toString).not.toHaveBeenCalled();noAfterError(v);
 });
});
describe.each(variants)('$label dispatch/recovery',v=>{
 it.each(['40003','08007'])('one %s dispatch retains inputs; explicit recovery uses the same request',async code=>{
  respond(v,{code,message:privateDetail});expect(await v.invoke()).toMatchObject({success:false,uncertain:true});noAfterError(v);
  const first=[v.rpc,v.args];
  respond(v,{code:'40001',message:privateDetail});const rejection=await v.invoke();expect(rejection.success).toBe(false);expect(rejection.uncertain).not.toBe(true);expect(calls(v)).toHaveLength(2);expect(calls(v)[1]).toEqual(first);
  const raw=v.success??receipt;
  const wrapped='receipt' in raw;
  const confirmed={...(wrapped?raw.receipt as object:raw),replayed:true};
  const success=wrapped?{...raw,receipt:confirmed}:confirmed;
  respond(v,null,success);expect(await v.invoke()).toEqual({success:true,data:confirmed});expect(calls(v)).toEqual([first,first,first]);
  expect(m.rpc).toHaveBeenCalledTimes(3);expect(m.adminRpc).toHaveBeenCalledTimes(v.admin?(v.afterUpload?6:3):0);
  // These are explicit calls with retained input, not proof that UI callers retain it.
 });
});
it.each(['40003','08007'])('finance and UOM unknown %s ignore even allowlisted validation diagnostics',async code=>{
 for(const [invoke,message,details] of [
  [()=>saveFinanceCenterRecord('cost_centers','save',7,{},contract),'Choose an active company','owner_company_id'],
  [()=>saveUomRecord('units_of_measure','save',7,{},contract),'Choose an active unit category','uom_category_id'],
 ] as const){
  m.rpc.mockResolvedValue({data:null,error:{code,message,details}});const result=await invoke();expect(result).toMatchObject({success:false,uncertain:true,error:expect.stringMatching(/unconfirmed/i)});expect(result).not.toHaveProperty('fieldErrors');expect(result.error).not.toContain(message);
 }expect(m.rpc).toHaveBeenCalledTimes(2);expect(m.cache).not.toHaveBeenCalled();
});
it('preserves approved finance and UOM validation guidance for an exact known rejection',async()=>{
 m.rpc.mockResolvedValueOnce({error:{code:'23514',message:'Choose an active company',details:'owner_company_id'}}).mockResolvedValueOnce({error:{code:'23514',message:'Choose an active unit category',details:'uom_category_id'}});
 expect(await saveFinanceCenterRecord('cost_centers','save',7,{},contract)).toMatchObject({success:false,fieldErrors:{owner_company_id:'Choose an active company'}});
 expect(await saveUomRecord('units_of_measure','save',7,{},contract)).toMatchObject({success:false,fieldErrors:{uom_category_id:'Choose an active unit category.'}});
});


describe.each([
 {label:'currency',invoke:()=>saveCurrencyRecord('retire',7,{is_active:false},contract)},
 {label:'cost centre',invoke:()=>saveFinanceCenterRecord('cost_centers','retire',7,{is_active:false},contract)},
 {label:'profit centre',invoke:()=>saveFinanceCenterRecord('profit_centers','retire',7,{is_active:false},contract)},
])('$label exact retirement authority',({invoke})=>{
 it.each(['scoped system','global group plus scoped system','inactive global system','password-required global system'])('%s cannot dispatch despite the broad legacy role mock',async policy=>{
  const system={ownerCompanyId:policy.includes('scoped')?1:null,branchId:null,roleCode:'system_admin',permissionCodes:[]};
  const roleAssignments=policy.startsWith('global group')?[{ownerCompanyId:null,branchId:null,roleCode:'group_admin',permissionCodes:[]},system]:[system];
  m.auth.mockResolvedValue({profile:{id:71,must_change_password:policy.startsWith('password-required')},isAccountActive:!policy.startsWith('inactive'),
   globalPermissionCodes:[],permissionCodes:[],roleCodes:roleAssignments.map(a=>a.roleCode),roleAssignments});
  const result=await invoke();expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);
  expect(m.rpc).not.toHaveBeenCalled();expect(m.adminRpc).not.toHaveBeenCalled();expect(m.cache).not.toHaveBeenCalled();
 });
});

// Existing receipt contracts remain authoritative even after mapper changes.
describe.each(variants.filter(v=>['currency save','cost_centers save','uom_categories save','countries save','template edit','governance submit'].includes(v.label)))('$label receipt preservation',v=>{
 it.each([null,{id:7}])('incomplete receipt %j cannot confirm a save',async data=>{respond(v,null,data);expect(await v.invoke()).toMatchObject({success:false,uncertain:true});expect(m.cache).not.toHaveBeenCalled();});
 it('mismatched identity cannot confirm a save',async()=>{respond(v,null,{...(v.success??receipt),id:99});expect(await v.invoke()).toMatchObject({success:false,uncertain:true});expect(m.cache).not.toHaveBeenCalled();});
 it('no-op replay preserves the exact confirmed receipt',async()=>{const data={...(v.success??receipt),changed:false,replayed:true};respond(v,null,data);expect(await v.invoke()).toEqual({success:true,data});expect(calls(v)).toEqual([[v.rpc,v.args]]);});
});

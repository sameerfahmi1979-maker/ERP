// Actual coordinator + snapshot helper; controlled auth/report/engine/DB ports.
// No PDF renderer, network, database or storage call is executed in this file.
import {beforeEach,expect,it,vi} from 'vitest';
import type {ExportBrandingContext} from '@/lib/export/export-types';
import type {IssuancePorts,RunIssuanceInput} from '@/lib/output/issuance-engine';
const m=vi.hoisted(()=>({brand:vi.fn(),input:null as RunIssuanceInput|null,inserted:null as Record<string,unknown>|null}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:11}})}));
vi.mock('@/lib/rbac/employee-access',()=>({getEmployeeAccess:async()=>({subject:{owner_company_id:1},allows:()=>true})}));
vi.mock('@/lib/output/issued-file-access',()=>({canAccessIssuedFile:async()=>true,issuedFileUrl:(id:number)=>`/api/output/file?issuanceId=${id}`}));
vi.mock('@/lib/report-center/report-runner',()=>({runReport:async()=>({success:true,data:{columns:['employee_name'],rows:[{owner_company_id:1,employee_name:'Synthetic employee'}]},resolvedTemplateId:7})}));
vi.mock('@/lib/report-center/template-export',()=>({resolveTemplateForExport:m.brand}));
vi.mock('@/lib/output/feature-flags',()=>({isOutputCoordinatorEnabled:()=>true,isOfficialIssuanceEnabled:()=>true}));
vi.mock('@/server/actions/audit',()=>({logAudit:vi.fn()}));
vi.mock('@/lib/output/issuance-engine',()=>({runIssuance:async(input:RunIssuanceInput,ports:IssuancePorts)=>{
  m.input=input;await ports.insertIssuance({requestKey:input.requestKey,contentFingerprint:input.contentFingerprint,outputCode:input.outputCode,documentClass:input.policy.documentClass,storagePath:input.storagePath,fileName:input.fileName,supersedesIssuanceId:null});
  return {kind:'issued',issuanceId:9,finalSha256:'synthetic',fileSizeBytes:100,qr:{status:'not_requested'},idempotentReplay:false,reissued:false,serialNo:null};
}}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{
  const result=()=>({error:null,data:table==='erp_report_registry'?{id:1,report_code:'F06_BRANDING_TEST',report_name_en:'Synthetic',module_code:'HR',required_permissions:[],document_class:'G'}:table==='erp_output_class_policies'?{document_class:'G',qr_policy:'none',approval_required:false,official:false,requires_serial:false}:table==='erp_report_templates'?{id:7,branding_profile:{owner_company_id:1}}:{id:9}});
  const q={select:()=>q,eq:()=>q,is:()=>q,insert:(value:Record<string,unknown>)=>{m.inserted=value;return q;},single:async()=>result(),maybeSingle:async()=>result()};return q;
}})}));
import {generateOfficialDocument} from '@/server/actions/output/generate-official-document';
const brand=():ExportBrandingContext=>({companyNameEn:'F06 issuer',logoUrl:'https://synthetic.invalid/asset?token=TEST_CAPABILITY',provenance:{schemaVersion:1,templateId:7,templateRevision:'5',templateVersion:2,brandingProfileId:4,brandingRevision:'3',ownerCompanyId:1,assets:[{id:10,type:'report_logo',version:2,revision:'1'}]}});
beforeEach(()=>{vi.clearAllMocks();m.input=null;m.inserted=null;m.brand.mockResolvedValue(brand());});
it('persists exact branding provenance and requests the strict issuance resolver',async()=>{
  expect((await generateOfficialDocument('F06_BRANDING_TEST',1)).success).toBe(true);
  expect(m.brand).toHaveBeenCalledWith({templateId:7,reportCode:'F06_BRANDING_TEST',principalId:11,forIssuance:true});
  expect(m.inserted?.branding_snapshot_json).toMatchObject({schemaVersion:1,templateId:7,templateRevision:'5',brandingProfileId:4,brandingRevision:'3',assets:[{id:10,type:'report_logo',version:2,revision:'1'}]});
  expect(JSON.stringify(m.inserted)).not.toMatch(/TEST_CAPABILITY|https:/);
});
it('legacy governed output persists its actual template version instead of null',async()=>{
  expect((await generateOfficialDocument('F06_BRANDING_TEST',1)).success).toBe(true);
  expect(m.inserted?.template_version).toBe(2);
});
it('a new branding revision changes content identity without mutating the old snapshot',async()=>{
  await generateOfficialDocument('F06_BRANDING_TEST',1);const original=structuredClone(m.inserted),fingerprint=m.input!.contentFingerprint;
  const current=brand();current.provenance!.brandingRevision='4';current.provenance!.assets[0]={id:20,type:'report_logo',version:3,revision:'1'};m.brand.mockResolvedValue(current);
  await generateOfficialDocument('F06_BRANDING_TEST',1);expect(m.input!.contentFingerprint).not.toBe(fingerprint);expect(original!.branding_snapshot_json).toMatchObject({brandingRevision:'3',assets:[{id:10,version:2}]});
});
it.each([null,{companyNameEn:'Unversioned issuer'}])('cannot silently issue without the selected governed branding: %j',async value=>{
  m.brand.mockResolvedValue(value);expect(await generateOfficialDocument('F06_BRANDING_TEST',1)).toMatchObject({success:false,blocked:'validation_failed'});expect(m.inserted).toBeNull();
});

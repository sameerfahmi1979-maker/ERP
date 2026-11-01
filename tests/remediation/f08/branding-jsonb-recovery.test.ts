import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({brand:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:11}})}));
vi.mock('@/lib/report-center/template-export',()=>({resolveTemplateForExport:m.brand}));
vi.mock('@/lib/output/feature-flags',()=>({isOfficialIssuanceEnabled:()=>true}));
import {issuedBrandingSnapshot} from '@/lib/branding/issuance-provenance';
import {buildRetainedRenderPlan,type RecoveryDocument} from '@/lib/output/recovery-plan';
import {OFFICIAL_DOCUMENT_LAYOUT_VERSION} from '@/lib/official-documents/layout/render';
import type {ExportBrandingContext} from '@/lib/export/export-types';
import {wordingReviewSample} from '@/lib/official-documents/wording-review-sample';
const brand:ExportBrandingContext={companyNameEn:'SAMPLE COMPANY',companyNameAr:'شركة تجريبية',provenance:{schemaVersion:1,templateId:3,templateRevision:'7',templateVersion:2,brandingProfileId:4,brandingRevision:'9',ownerCompanyId:1,assets:[{id:5,type:'report_logo',version:1,revision:'3'}]}};
function reorder(value:unknown):unknown {
 if(Array.isArray(value))return value.map(reorder);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reorder(item)]));
 return value;
}
function doc():RecoveryDocument {const sample=wordingReviewSample();return {
 id:7,lifecycle_state:'rendering',storage_path:'synthetic/7.pdf',file_name:'synthetic.pdf',checksum:'pending',file_size_bytes:null,serial_no:'SAMPLE-LETTER-7',output_code:'HR_EMPLOYMENT_CONFIRMATION',source_record_id:1,template_id:3,generated_at:'2026-10-30T08:00:00Z',supersedes_issuance_id:null,
 policy_snapshot_json:{official:true} as RecoveryDocument['policy_snapshot_json'],branding_snapshot_json:reorder(issuedBrandingSnapshot(brand)),
 data_snapshot_json:{...sample,language:'en',inputs:{},columns:[],operation:{title:'Synthetic confirmation'},definition_version:2,layout_version:OFFICIAL_DOCUMENT_LAYOUT_VERSION}};}
beforeEach(()=>{vi.resetAllMocks();m.brand.mockResolvedValue(structuredClone(brand));});
it('recovers the same retained revision after jsonb reorders nested keys, preserving the original reference',async()=>{
 const retained=doc();expect(JSON.stringify(retained.branding_snapshot_json)).not.toBe(JSON.stringify(issuedBrandingSnapshot(brand)));
 const plan=await buildRetainedRenderPlan(retained);expect(plan.html).toContain('SAMPLE-LETTER-7');
 expect(m.brand).toHaveBeenCalledExactlyOnceWith({templateId:3,reportCode:retained.output_code,principalId:11,forIssuance:true});
});
it.each(['templateRevision','templateVersion','brandingRevision','brandingProfileId','templateId','ownerCompanyId','companyNameEn'])('still rejects a changed %s without substituting new branding',async key=>{
 const retained=doc(),snapshot=retained.branding_snapshot_json as Record<string,unknown>;
 snapshot[key]=typeof snapshot[key]==='number'?999:'CHANGED';
 await expect(buildRetainedRenderPlan(retained)).rejects.toThrow('Original branding revision is unavailable');
});
it.each(['id','type','version','revision'])('retains exact asset %s checking',async key=>{
 const retained=doc(),snapshot=retained.branding_snapshot_json as {assets:Record<string,unknown>[]};snapshot.assets[0][key]='changed';
 await expect(buildRetainedRenderPlan(retained)).rejects.toThrow('No newer brand was substituted');
});
it('holds inaccessible/deleted branding and does not discard the original request',async()=>{
 m.brand.mockResolvedValue(null);await expect(buildRetainedRenderPlan(doc())).rejects.toThrow('Original branding revision is unavailable');
});
it('does not bypass definition/layout reconciliation',async()=>{
 const retained=doc();retained.data_snapshot_json.layout_version=0;
 await expect(buildRetainedRenderPlan(retained)).rejects.toThrow('wording/version reconciliation');expect(m.brand).not.toHaveBeenCalled();
});

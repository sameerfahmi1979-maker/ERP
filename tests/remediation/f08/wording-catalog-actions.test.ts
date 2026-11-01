import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({scope:true,active:true,installed:true,registry:[] as Record<string,unknown>[]}));
vi.mock('@/server/reads/hr-letter-integration',()=>({hrLetterIntegrationReady:async()=>m.installed}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:1}}),canUseApplication:()=>m.active,hasPermission:()=>m.scope}));
vi.mock('@/lib/rbac/employee-access',()=>({getEmployeeAccess:async()=>({subject:{id:1,owner_company_id:1},allows:()=>m.scope})}));
vi.mock('@/lib/output/class-policy',()=>({resolveEffectivePolicy:()=>({official:true,approvalRequired:true,allowQuickPrint:false,qrPolicy:'none',qrValidityDays:null})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{
 const q={select:()=>q,eq:()=>q,is:()=>q,in:()=>q,order:()=>q,then:(cb:(v:unknown)=>unknown)=>Promise.resolve({data:table==='erp_report_registry'?m.registry:[{document_class:'A'},{document_class:'B'},{document_class:'C'}],error:null}).then(cb)};return q;
}})}));
import {listEmployeeOutputCatalog} from '@/server/actions/output/output-catalog';
import {listOfficialDocumentDefinitions} from '@/lib/official-documents/registry';
beforeEach(()=>{m.scope=true;m.active=true;m.installed=true;m.registry=listOfficialDocumentDefinitions().map(def=>({report_code:def.documentCode,report_name_en:def.titleEn,report_category:'letter',document_class:'B',required_permissions:['hr.employees.view'],sensitive_profile:'normal'}));});
it('offers all fourteen draft previews and enables approved source-ready definitions when the source integration is installed',async()=>{
 const result=await listEmployeeOutputCatalog(1);expect(result.success).toBe(true);expect(result.data).toHaveLength(14);
 expect(result.data!.filter(item=>item.generatable)).toHaveLength(14);
 expect(result.data!.filter(item=>item.sourceWorkflowPending)).toHaveLength(0);
 expect(result.data!.every(item=>item.wordingApproved)).toBe(true);
 for(const item of result.data!){expect(item.canPreview).toBe(true);expect(item.previewLanguages).toEqual(['en','ar','bilingual']);}
});
it('a wording-review mode does not supply missing employee permissions',async()=>{
 m.scope=false;const result=await listEmployeeOutputCatalog(1);for(const item of result.data!){expect(item.canPreview).toBe(false);expect(item.canGenerate).toBe(false);}
});
it('inactive accounts cannot obtain a preview catalogue',async()=>{
 m.active=false;expect((await listEmployeeOutputCatalog(1)).success).toBe(false);
});

it('keeps the nine integrations disabled if the database contract is unavailable',async()=>{
 m.installed=false;const result=await listEmployeeOutputCatalog(1);expect(result.success).toBe(true);
 expect(result.data!.filter(item=>item.generatable)).toHaveLength(5);
 expect(result.data!.filter(item=>item.sourceWorkflowPending)).toHaveLength(9);
});

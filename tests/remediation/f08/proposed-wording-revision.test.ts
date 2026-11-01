import {expect,it} from 'vitest';
import {getOfficialDocumentDefinition,listOfficialDocumentDefinitions,buildInputsSchema} from '@/lib/official-documents/registry';
import {wordingReviewSample,wordingReviewInputs} from '@/lib/official-documents/wording-review-sample';
import {proposedHrWording} from '@/lib/official-documents/definitions/hr/review-wording';
import {renderOfficialDocumentPrintPackage} from '@/lib/official-documents/layout/render';
function model(code:string,overrides:Record<string,unknown>={},inputs:Record<string,string>={}) {
 const def=getOfficialDocumentDefinition(code)!,sample=wordingReviewSample();
 return def.build({...sample,row:{...sample.row,...overrides},inputs:{...wordingReviewInputs(def),...inputs},language:'bilingual',issuedDateEn:'30 October 2026',issuedDateAr:'٣٠ أكتوبر ٢٠٢٦'});
}
it('imports exactly the 13 proposed revisions without copying the unapproved confirmation v3',()=>{
 expect(Object.keys(proposedHrWording)).toHaveLength(13);expect(proposedHrWording).not.toHaveProperty('HR_EMPLOYMENT_CONFIRMATION');
 expect(getOfficialDocumentDefinition('HR_EMPLOYMENT_CONFIRMATION')!.version).toBe(2);
});
it.each(Object.keys(proposedHrWording))('%s substitutes mapped facts without printing drafting notation or duplicate company prefixes',code=>{
 const built=model(code),text=JSON.stringify(built);
 expect(text).not.toMatch(/{{|}}|\[omit|\[Optional|\[or:|السيد\/السيدة|يعمل\/تعمل|الموظف\/الموظفة|شركة شركة/);
 expect(text).not.toContain('No salary amount or banking information is disclosed');
 expect(built.blocks.length).toBeGreaterThan(0);
});
it('renders coherent female grammar using recorded gender',()=>{
 const result=model('HR_EMPLOYMENT_LETTER',{gender:'female'}),text=JSON.stringify(result);
 expect(text).toContain('السيدة');expect(text).toContain('تعمل لديها');expect(text).toContain('تشغل حالياً');expect(text).not.toContain('السيد/');
});
it('distinguishes current service from end-of-service, retaining statutory review facts only in the latter proposal',()=>{
 const former=JSON.stringify(model('HR_EXPERIENCE_LETTER'));expect(former).toContain('last wage');expect(former).toContain('2 years and 9 months');expect(former).toContain('SAMPLE END-OF-SERVICE REASON');
 const current=JSON.stringify(model('HR_EXPERIENCE_LETTER',{last_working_date:null}));expect(current).toContain('CURRENT SERVICE');expect(current).not.toContain('last wage');expect(current).not.toContain('SAMPLE END-OF-SERVICE REASON');
});
it('keeps bank wording informational and omits account disclosure without explicit source authority',()=>{
 const denied=JSON.stringify(model('HR_BANK_SALARY_TRANSFER',{bank_disclosure_authorised:false,verified_iban:'PRIVATE-ACCOUNT'}));expect(denied).not.toContain('PRIVATE-ACCOUNT');expect(denied).toContain('does not confirm a completed payment');
 const allowed=JSON.stringify(model('HR_BANK_SALARY_TRANSFER'));expect(allowed).toContain('SAMPLE — NOT AN ACCOUNT');expect(allowed).toContain('SAMPLE BANK');
});
it('prints specific recipient/purpose and conditional NOC terms without a generic salutation or implicit expiry',()=>{
 const result=model('HR_NOC',{}, {addressee:'QA Authority',addressee_ar:'جهة الاختبار',purpose:'apply for a stated licence',purpose_ar:'التقدم للحصول على الترخيص المحدد'}),text=JSON.stringify(result);
 expect(text).toContain('QA Authority');expect(text).not.toContain('TO WHOM IT MAY CONCERN');expect(text).not.toContain('subject to —');expect(text).not.toContain('الشروط المعتمدة —');expect(text).toContain('29 November 2026');
});
it('rejects invalid date values before preview or issuance',()=>{
 const schema=buildInputsSchema(getOfficialDocumentDefinition('HR_NOC')!);
 expect(schema.safeParse({purpose:'QA',valid_until:'2026-02-30'}).success).toBe(false);
 expect(schema.safeParse({purpose:'QA',valid_until:'2028-02-29'}).success).toBe(true);
});
it.each([['HR_CLEARANCE_FORM',9,0],['HR_JOINING_CHECKLIST',7,10],['HR_PPE_ISSUE_FORM',8,1],['HR_HANDOVER_FORM',8,1]] as const)('%s contains structured evidence/owner fields without marking any task complete', (code,columns,rows)=>{
 const built=model(code),record=built.blocks.find(b=>b.kind==='record_table');expect(record?.kind).toBe('record_table');
 if(record?.kind!=='record_table')throw Error('Missing record table');expect(record.columns).toHaveLength(columns);expect(record.rows).toHaveLength(rows);
 const html=renderOfficialDocumentPrintPackage(getOfficialDocumentDefinition(code)!,{...wordingReviewSample(),inputs:{},language:'bilingual',issuedDateEn:'30 October 2026',issuedDateAr:'٣٠ أكتوبر ٢٠٢٦',draft:true}).html;
 expect(html).toContain('od-record-table');expect(html).toContain('table-layout:fixed');
});
it('makes integrated definitions available while keeping record-specific source validation',()=>{
 for(const code of ['HR_WARNING_LETTER','HR_EXPERIENCE_LETTER','HR_BANK_SALARY_TRANSFER','HR_EMBASSY_LETTER','HR_HANDOVER_FORM','HR_LEAVE_CONFIRMATION'])expect(getOfficialDocumentDefinition(code)!.wordingReviewOnly).toBe(false);
 expect(listOfficialDocumentDefinitions().filter(def=>def.status==='published')).toHaveLength(14);
});

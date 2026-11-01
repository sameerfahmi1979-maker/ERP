import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getOfficialDocumentDefinition,listOfficialDocumentDefinitions,isGeneratable,buildInputsSchema} from '@/lib/official-documents/registry';
import {officialWordingBlockers} from '@/lib/official-documents/catalogue';
import {approvedHrSourceError} from '@/lib/official-documents/definitions/hr/approved-source-readiness';
import {wordingReviewSample} from '@/lib/official-documents/wording-review-sample';
import type {OfficialDocumentLanguage} from '@/lib/official-documents/types';
const held:string[]=[];
const source=(overrides:Record<string,unknown>={},language:OfficialDocumentLanguage='bilingual',inputs:Record<string,string>={purpose:'Verified request purpose',purpose_ar:'غرض الطلب المحدد',valid_until:'2026-11-29'})=>{
 const row={...wordingReviewSample().row,employee_status:'active',gender:'male',generated_date:'2026-10-30',clearance_status:'clearance_in_progress',payroll_status:'active',salary_source_fingerprint:'a'.repeat(64),source_review_id:12,source_review_fingerprint:'b'.repeat(64),condition_ar:'جيد',ppe_item_ar:'خوذة',condition:'Good',issuer:'Synthetic issuer',...overrides};return {row,rows:[row],language,inputs};
};
it('activates the exact reviewed bilingual text without editing its bytes',()=>{
 const text=readFileSync('src/lib/official-documents/definitions/hr/review-wording.ts');
 expect(createHash('sha256').update(text).digest('hex')).toBe('cee5351ad8d6c5426b195434569698ae54b39c28e2f3af3a183ceb14b912230d');
});
it.each(listOfficialDocumentDefinitions().filter(def=>def.documentCode!=='HR_EMPLOYMENT_CONFIRMATION'))('records explicit owner approval for $documentCode in both languages without clearing source holds',def=>{
 expect(def.status).toBe('published');
 for(const lang of ['en','ar'] as const)expect(def.wording[lang]).toMatchObject({businessApprovalStatus:'approved',provenance:'verified_prompt',approvedBy:'System owner',approvalDate:'2026-10-30',approvalReference:expect.stringContaining('other 13')});
 expect(isGeneratable(def)).toBe(!held.includes(def.documentCode));
 expect(officialWordingBlockers(def,'bilingual')).toEqual(held.includes(def.documentCode)?['Source-verified workflow integration is required before official issuance.']:[]);
});
it('retains the separately approved confirmation version without applying the other-wording approval',()=>{
 const def=getOfficialDocumentDefinition('HR_EMPLOYMENT_CONFIRMATION')!;expect(def.version).toBe(2);expect(def.validateSource).toBeUndefined();expect(def.wording.en.approvalNotes).toContain('Keep the English wording as supplied');
});
it.each(['HR_EMPLOYMENT_LETTER','HR_SALARY_CERT_GENERAL','HR_SALARY_CERT_WITH_AMOUNT','HR_NOC','HR_CLEARANCE_FORM','HR_JOINING_CHECKLIST','HR_PPE_ISSUE_FORM'])('%s accepts complete synthetic record evidence without certifying a transaction',code=>{
 expect(approvedHrSourceError(code,source())).toBeNull();
});
it.each(['inactive','terminated','suspended','archived','unknown'])('wording approval does not certify %s employment',employee_status=>{
 expect(approvedHrSourceError('HR_EMPLOYMENT_LETTER',source({employee_status}))).toContain('Current employment');
});
it.each(['2099-01-01','2026-02-30',''])('holds a missing, future or invalid joining date %s',joining_date=>{
 expect(approvedHrSourceError('HR_SALARY_CERT_GENERAL',source({joining_date}))).toContain('Current employment');
});
it.each(['employee_name_ar','company_name_ar','designation_ar','gender'])('does not invent missing Arabic identity/grammar data: %s',key=>{
 expect(approvedHrSourceError('HR_EMPLOYMENT_LETTER',source({[key]:null}))).not.toBeNull();
 expect(approvedHrSourceError('HR_EMPLOYMENT_LETTER',source({[key]:null},'en'))).toBeNull();
});
it.each(['salary_in_words_en','salary_in_words_ar'])('does not issue a salary certificate with unverified %s',key=>{
 expect(approvedHrSourceError('HR_SALARY_CERT_WITH_AMOUNT',source({[key]:null}))).toContain('verified salary');
});
it.each(['USD','',null])('does not relabel %s salary as AED',currency=>{
 expect(approvedHrSourceError('HR_SALARY_CERT_WITH_AMOUNT',source({currency}))).toContain('AED');
});
it.each([0,-1,NaN,Infinity])('does not certify invalid salary %s',gross_salary=>{
 expect(approvedHrSourceError('HR_SALARY_CERT_WITH_AMOUNT',source({gross_salary}))).toContain('positive');
});
it.each(['','2026-02-30','2026-10-29'])('requires an actual reviewed, valid NOC expiry: %s',valid_until=>{
 expect(approvedHrSourceError('HR_NOC',source({},'en',{purpose:'Approved activity',valid_until}))).toContain('expiry date');
});
it('does not issue materially different bilingual NOC conditions',()=>{
 expect(approvedHrSourceError('HR_NOC',source({},'bilingual',{purpose:'QA',purpose_ar:'اختبار',valid_until:'2026-11-29',approved_conditions_en:'Condition only in English'}))).toContain('both English and Arabic');
});
it.each(['cleared','approved','paid','complete'])('never infers final clearance or payment: %s',clearance_status=>{
 expect(approvedHrSourceError('HR_CLEARANCE_FORM',source({clearance_status}))).toContain('cannot certify completed clearance');
});
it.each([{ppe_item:'No items'},{quantity:0},{quantity:null},{condition:'[Not recorded]'},{issuer:''},{issue_date:'2026-02-30'}])('does not certify incomplete PPE custody %#',bad=>{
 expect(approvedHrSourceError('HR_PPE_ISSUE_FORM',source(bad))).toContain('Every issued PPE item');
});
it('requires calendar input before issuing a date-limited NOC, without inventing a default period',()=>{
 const schema=buildInputsSchema(getOfficialDocumentDefinition('HR_NOC')!);
 expect(schema.safeParse({purpose:'QA'}).success).toBe(false);
 expect(schema.safeParse({purpose:'QA',valid_until:'2026-11-29'}).success).toBe(true);
});

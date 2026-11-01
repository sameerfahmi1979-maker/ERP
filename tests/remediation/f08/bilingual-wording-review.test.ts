import {expect,it} from 'vitest';
import {getOfficialDocumentDefinition,listOfficialDocumentDefinitions,isGeneratable,isPreviewable,buildInputsSchema,validateOfficialDocumentRegistry} from '@/lib/official-documents/registry';
import {officialWordingBlockers} from '@/lib/official-documents/catalogue';
import {wordingReviewInputs,wordingReviewSample} from '@/lib/official-documents/wording-review-sample';
import {renderOfficialDocumentPrintPackage} from '@/lib/official-documents/layout/render';
it('keeps the separately approved confirmation wording and version unchanged',()=>{
 const def=getOfficialDocumentDefinition('HR_EMPLOYMENT_CONFIRMATION')!;expect(def.version).toBe(2);
 for(const language of ['en','ar'] as const)expect(def.wording[language]).toMatchObject({provenance:'verified_prompt',businessApprovalStatus:'approved',approvedBy:'System owner',approvalDate:'2026-10-30'});
 const sample=wordingReviewSample(),model=def.build({...sample,inputs:{},language:'en',issuedDateEn:'30 October 2026',issuedDateAr:'٣٠ أكتوبر ٢٠٢٦'});
 expect(model.blocks).toContainEqual({kind:'paragraph',en:"This certificate is issued at the employee's request for official purposes, without any liability or financial obligation on the part of the Company.",ar:'وقد أُصدرت هذه الشهادة بناءً على طلب الموظف لتقديمها إلى الجهات الرسمية والمعنية، دون أن يترتب على الشركة أي التزامات أو مسؤوليات مالية نتيجة إصدارها.'});
});
it('preserves identities and records the explicit owner approval without clearing source holds',()=>{
 expect(validateOfficialDocumentRegistry()).toEqual([]);
 expect(listOfficialDocumentDefinitions()).toHaveLength(14);
 for(const def of listOfficialDocumentDefinitions()){
  expect(isPreviewable(def)).toBe(true);expect(def.supportedLanguages).toEqual(['en','ar','bilingual']);
  if(def.documentCode==='HR_EMPLOYMENT_CONFIRMATION')continue;
  expect(isGeneratable(def)).toBe(!def.wordingReviewOnly);expect(def.wording.ar?.businessApprovalStatus).toBe('approved');
  expect(officialWordingBlockers(def,'bilingual').length).toBe(def.wordingReviewOnly?1:0);
 }
});
it.each(listOfficialDocumentDefinitions().map(def=>def.documentCode))('%s has populated English, Arabic and bilingual bodies without executable user content',code=>{
 const def=getOfficialDocumentDefinition(code)!,sample=wordingReviewSample(),inputs=buildInputsSchema(def).parse(wordingReviewInputs(def));
 for(const language of ['en','ar','bilingual'] as const){
  const plan=renderOfficialDocumentPrintPackage(def,{...sample,inputs,language,draft:true,serialNo:null,issuedDateEn:'30 October 2026',issuedDateAr:'٣٠ أكتوبر ٢٠٢٦'});
  expect(plan.html).toContain(language==='ar'?'تجريبي':'SAMPLE');expect(plan.html).not.toContain('/verify/');expect(plan.html).not.toContain('<div class="od-signature">');
  if(language!=='en')expect(plan.html).toMatch(/[\u0600-\u06ff]/);
 }
});
it('unintegrated workflow drafts remain held even if a caller forges their publication status',()=>{
 const def=getOfficialDocumentDefinition('HR_BANK_SALARY_TRANSFER')!;
 expect(isGeneratable({...def,wordingReviewOnly:true,status:'published',wording:{en:{source:'test',provenance:'verified_code',businessApprovalStatus:'approved'},ar:{source:'test',provenance:'verified_code',businessApprovalStatus:'approved'}}})).toBe(false);
});

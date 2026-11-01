import {expect,it} from 'vitest';
import {getOfficialDocumentDefinition,buildInputsSchema} from '@/lib/official-documents/registry';
import {employmentRecipientError,employmentAddressee} from '@/lib/official-documents/employment-recipient';
import {renderOfficialDocumentPrintPackage} from '@/lib/official-documents/layout/render';
import {officialWordingBlockers} from '@/lib/official-documents/catalogue';
import {issuanceCommandHash} from '@/lib/output/durable-operation';
const def=getOfficialDocumentDefinition('HR_EMPLOYMENT_CONFIRMATION')!;
const row={employee_name:'SYNTHETIC PERSON',employee_name_ar:'موظف اختبار',employee_code:'SYN-1',designation:'General Manager',designation_ar:'المدير العام',joining_date:'2019-01-01',company_name:'SYNTHETIC COMPANY',company_name_ar:'شركة اختبار',employment_type:'Full Time'};
it('retains the supplied confirmation version and records only its explicit owner approval',()=>{
 expect(def.version).toBe(2);expect(getOfficialDocumentDefinition('HR_EMPLOYMENT_LETTER')!.version).toBe(3);
 expect(officialWordingBlockers(def,'bilingual')).toEqual([]);
 expect(def.wording.en.approvalReference).toContain('30 October 2026');
 expect(officialWordingBlockers(getOfficialDocumentDefinition('HR_EMPLOYMENT_LETTER')!,'bilingual')).toEqual([]);
});
it('defaults to a general addressee and rejects forged modes, titles, extra keys, control characters and oversized recipients',()=>{
 expect(buildInputsSchema(def).parse({})).toMatchObject({recipient_mode:'general',employee_title:''});
 for(const input of [{recipient_mode:'forged'},{employee_title:'Doctor'},{html:'<script>'},{recipient_organization_en:'a\nb'},{recipient_department_en:'x'.repeat(181)}])expect(buildInputsSchema(def).safeParse(input).success).toBe(false);
});
it.each(['en','ar','bilingual'] as const)('requires a matching specific-recipient value for %s',language=>{
 const input={recipient_mode:'specific',recipient_organization_en:'QA Bank',recipient_department_ar:'قسم اختبار'};
 expect(employmentRecipientError(input,language)).toBeNull();
 expect(employmentRecipientError({recipient_mode:'specific'},language)).toBeTruthy();
 if(language!=='en')expect(employmentRecipientError({recipient_mode:'specific',recipient_organization_en:'QA'},language)).toContain('Arabic');
});
it('ignores retained specific addresses in general mode rather than leaking them into the letter',()=>{
 expect(employmentAddressee({recipient_mode:'general',recipient_organization_en:'PRIVATE PREVIOUS RECIPIENT'},'en')).toBe('TO WHOM IT MAY CONCERN');
});
it('uses the owner wording with actual record facts and escapes named recipients',()=>{
 const inputs=buildInputsSchema(def).parse({recipient_mode:'specific',recipient_organization_en:'QA <Bank>',recipient_department_en:'Accounts',recipient_organization_ar:'بنك اختبار',employee_title:'Mr.'}) as Record<string,string>;
 const plan=renderOfficialDocumentPrintPackage(def,{row,rows:[row],language:'bilingual',inputs,draft:true,serialNo:null,issuedDateEn:'29 October 2026',issuedDateAr:'٢٩ أكتوبر ٢٠٢٦'});
 expect(plan.html).toContain('QA &lt;Bank&gt; — Accounts');expect(plan.html).toContain('Mr. SYNTHETIC PERSON');
 expect(plan.html).toContain('01 January 2019');expect(plan.html).toContain('on a full-time basis');
 expect(plan.html).toContain('without any liability or financial obligation');expect(plan.html).toContain('دون أن يترتب على الشركة');
 expect(plan.html).toContain('For and on behalf of SYNTHETIC COMPANY');expect(plan.html).not.toContain('Sameer');
 expect(plan.html).not.toContain('<div class="od-signature">');expect(plan.html).not.toContain('/verify/');
});
it('does not invent full-time work or a personal title when those are not supplied',()=>{
 const model=def.build({row:{...row,employment_type:''},rows:[row],language:'en',inputs:{},issuedDateEn:'',issuedDateAr:''});
 expect(JSON.stringify(model)).not.toContain('full-time');expect(JSON.stringify(model)).not.toContain('Mr.');
 const part=def.build({row:{...row,employment_type:'Part Time'},rows:[row],language:'en',inputs:{},issuedDateEn:'',issuedDateAr:''});expect(JSON.stringify(part)).toContain('part-time');
});
it('binds recipient values to the retained issuance command so changed recipients cannot reuse its identity',()=>{
 expect(issuanceCommandHash({language:'en',inputs:{recipient_mode:'general'}})).not.toBe(issuanceCommandHash({language:'en',inputs:{recipient_mode:'specific',recipient_organization_en:'QA Bank'}}));
});

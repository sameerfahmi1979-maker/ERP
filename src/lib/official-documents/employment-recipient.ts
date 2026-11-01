import type {OfficialDocumentLanguage} from './types';

export const EMPLOYMENT_RECIPIENT_FIELDS = [
  {key:'recipient_mode',labelEn:'Addressed to',type:'text' as const,required:false,maxLength:20,defaultValue:'general',choices:[{value:'general',labelEn:'To whom it may concern'},{value:'specific',labelEn:'Specific recipient'}]},
  {key:'recipient_organization_en',labelEn:'Organisation (English)',type:'text' as const,required:false,maxLength:180},
  {key:'recipient_department_en',labelEn:'Department / recipient (English)',type:'text' as const,required:false,maxLength:180},
  {key:'recipient_organization_ar',labelEn:'Organisation (Arabic)',type:'text' as const,required:false,maxLength:180},
  {key:'recipient_department_ar',labelEn:'Department / recipient (Arabic)',type:'text' as const,required:false,maxLength:180},
  {key:'employee_title',labelEn:'Employee title',type:'text' as const,required:false,maxLength:10,defaultValue:'',choices:[{value:'',labelEn:'No title'},{value:'Mr.',labelEn:'Mr.'},{value:'Ms.',labelEn:'Ms.'}]},
];

/** Match the requested language explicitly; never translate/guess a recipient. */
export function employmentRecipientError(inputs:Record<string,string>,language:OfficialDocumentLanguage):string|null {
  if ((inputs.recipient_mode || 'general') === 'general') return null;
  if (inputs.recipient_mode !== 'specific') return 'Choose a valid recipient option.';
  const required=language==='bilingual'?['en','ar']: [language];
  for (const variant of required) if (!inputs[`recipient_organization_${variant}`]?.trim() && !inputs[`recipient_department_${variant}`]?.trim())
    return `Enter the organisation or department / recipient in ${variant==='en'?'English':'Arabic'}.`;
  return null;
}

export function employmentAddressee(inputs:Record<string,string>,language:'en'|'ar'):string {
  if(inputs.recipient_mode!=='specific')return language==='en'?'TO WHOM IT MAY CONCERN':'إلى من يهمه الأمر';
  return [inputs[`recipient_organization_${language}`],inputs[`recipient_department_${language}`]].map(value=>value?.trim()).filter(Boolean).join(' — ');
}

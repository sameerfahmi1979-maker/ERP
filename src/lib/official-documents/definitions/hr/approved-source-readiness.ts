import {needsLetterReview} from '../../hr-source-review';
import type {OfficialDocumentDefinition,OfficialDocumentRenderContext} from '../../types';
type Source=Pick<OfficialDocumentRenderContext,'row'|'rows'|'inputs'|'language'>;
/** Integration is installed separately; runtime version and record-specific
 * source checks remain mandatory even when the definition is available. */
export const HR_SOURCE_WORKFLOW_HOLDS:Readonly<Record<string,string>>={};
const missing=(v:unknown)=>v===null||v===undefined||!String(v).trim()||/^(?:—|-|\[not recorded\]|\[not on record\])$/i.test(String(v).trim());
function calendar(v:unknown):string|null {
 const text=String(v??'');if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;
 const date=new Date(`${text}T00:00:00Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===text?text:null;
}
/** No invented salary words, completed reviews, pay rules or missing source facts. */
export function approvedHrSourceError(code:string,{row,rows,inputs,language}:Source):string|null {
 const requireFields=(fields:[string,string][])=>{
  const absent=fields.filter(([key])=>missing(row[key]));
  return absent.length?`Complete the verified source data before issuing: ${absent.map(([,label])=>label).join(', ')}.`:null;
 };
 const common=requireFields([['employee_name','employee name'],['employee_code','employee number'],['company_name','registered employer name']]);if(common)return common;
 const current=['HR_EMPLOYMENT_LETTER','HR_SALARY_CERT_GENERAL','HR_SALARY_CERT_WITH_AMOUNT','HR_NOC','HR_BANK_SALARY_TRANSFER','HR_EMBASSY_LETTER'].includes(code);
 if(current){
  const joining=calendar(row.joining_date),asOf=calendar(row.generated_date);
  if(!['active','on_leave','probation'].includes(String(row.employee_status))||!joining||!asOf||joining>asOf)return 'Current employment and the effective joining date must be verified before this certificate can be issued.';
  const role=requireFields([['designation','current job title']]);if(role)return role;
 }
 if(language!=='en'){
  const arabic=requireFields([['employee_name_ar','Arabic employee name'],['company_name_ar','Arabic registered employer name'],...(current?[['designation_ar','Arabic job title']] as [string,string][]:[])]);if(arabic)return arabic;
  if(current&&!['male','female'].includes(String(row.gender)))return 'Verify the employee gender for the approved Arabic grammatical form before issuing.';
 }
 if(needsLetterReview(code)&&(!/^[1-9]\d*$/.test(String(row.source_review_id))||!/^[a-f0-9]{64}$/.test(String(row.source_review_fingerprint))))return 'Select independently approved source particulars bound to the original evidence.';
 if(code==='HR_SALARY_CERT_WITH_AMOUNT'){
  if(row.payroll_status!=='active'||missing(row.salary_source_fingerprint))return 'A current active payroll source is required.';
  if(row.currency!=='AED'||!Number.isFinite(Number(row.gross_salary))||Number(row.gross_salary)<=0)return 'A verified positive gross monthly salary in AED is required for this salary certificate.';
  const words=requireFields((language==='en'?[['salary_in_words_en','verified salary in English words']]:language==='ar'?[['salary_in_words_ar','verified salary in Arabic words']]:[['salary_in_words_en','verified salary in English words'],['salary_in_words_ar','verified salary in Arabic words']]) as [string,string][]);if(words)return words;
 }
 if(['HR_NOC','HR_SALARY_CERT_WITH_AMOUNT'].includes(code)){
  if(language!=='ar'&&!inputs.purpose?.trim())return 'Enter the purpose / approved activity in English.';
  if(language!=='en'&&!inputs.purpose_ar?.trim())return 'Enter the purpose / approved activity in Arabic.';
 }
 if(code==='HR_NOC'){
  const expiry=calendar(inputs.valid_until),asOf=calendar(row.generated_date);
  if(!expiry||!asOf||expiry<asOf)return 'Choose an explicitly reviewed expiry date on or after the issue date.';
  if(language==='bilingual'&&!!inputs.approved_conditions_en?.trim()!==!!inputs.approved_conditions_ar?.trim())return 'Provide approved conditions in both English and Arabic, or leave both empty.';
 }
 if(code==='HR_BANK_SALARY_TRANSFER'){
  const bank=requireFields([['bank_name','bank name']]);if(bank)return bank;
  if(language!=='en'&&missing(row.bank_name_ar))return 'The verified Arabic bank name is required.';
  if(row.currency!=='AED'||row.payroll_status!=='active'||!Number.isFinite(Number(row.gross_salary))||Number(row.gross_salary)<=0)return 'Current positive AED payroll facts are required.';
 }
 if(code==='HR_EMBASSY_LETTER'){
  if(language!=='ar'&&(!inputs.addressee?.trim()||!inputs.purpose?.trim()))return 'Enter the embassy/consulate and application purpose in English.';
  if(language!=='en'&&(!inputs.addressee_ar?.trim()||!inputs.purpose_ar?.trim()))return 'Enter the embassy/consulate and application purpose in Arabic.';
 }
 if(code==='HR_LEAVE_CONFIRMATION'){
  const leave=requireFields([['leave_reference','approved leave reference'],['leave_type','leave type'],['source_revision','original request revision']]);if(leave)return leave;
  if(language!=='en'&&missing(row.leave_type_ar))return 'Verify the Arabic leave type before issuing.';
  if(row.leave_status!=='approved'||!calendar(row.leave_start)||!calendar(row.leave_end)||!calendar(row.return_date)||String(row.leave_start)>String(row.leave_end)||String(row.return_date)<=String(row.leave_end))return 'Approved leave dates and the recorded return schedule are required.';
 }
 if(code==='HR_CLEARANCE_FORM'){
  const clearance=requireFields([['department','department'],['last_working_date','verified last working date'],['clearance_status','verified clearance status']]);if(clearance)return clearance;
  // The current layout contains unsigned department review rows, not their
  // authoritative decisions. Never certify final clearance from this form.
  if(!['draft','notice_served','clearance_in_progress','pending_final_settlement'].includes(String(row.clearance_status)))return 'This preparation form cannot certify completed clearance. Department-owner decisions and final HR review remain required.';
 }

 if(code==='HR_EXPERIENCE_LETTER'){
  const required=requireFields([['designation','last position'],['joining_date','employment start'],['employment_end_date','employment end'],['service_period','service period'],['termination_reason','recorded separation reason'],['salary_source_fingerprint','effective salary evidence']]);if(required)return required;
  if(!calendar(row.employment_end_date)||!calendar(row.joining_date)||String(row.employment_end_date)<String(row.joining_date)||!Number.isFinite(Number(row.final_wage))||Number(row.final_wage)<=0)return 'Verify employment dates and the last wage.';
  if(language!=='en'){const arabic=requireFields([['designation_ar','Arabic last position'],['termination_reason_ar','Arabic separation reason'],['service_period_ar','Arabic service period']]);if(arabic)return arabic;}
 }
 if(code==='HR_WARNING_LETTER'){
  const required=requireFields([['warning_subject_en','decided warning subject'],['verified_conduct_description_en','reviewed conduct'],['specific_corrective_action_en','recorded corrective action'],['policy_reference_en','policy reference'],['response_channel_en','response channel'],['response_period','response period']]);if(required)return required;
  if(!calendar(row.incident_date)||!calendar(row.corrective_deadline)||String(row.corrective_deadline)<String(row.incident_date))return 'Verify the warning dates.';
  if(language!=='en'){const arabic=requireFields(['warning_subject_ar','verified_conduct_description_ar','specific_corrective_action_ar','policy_reference_ar','response_channel_ar','response_period_ar'].map(key=>[key,'Arabic '+key]));if(arabic)return arabic;}
 }
 if(code==='HR_HANDOVER_FORM'){
  const required=requireFields([['receiving_employee_name','receiving employee'],['description_en','handed-over item'],['reference','item reference'],['owner_name','recorded responsible owner'],['status_en','recorded item status']]);if(required)return required;
  if(!calendar(row.handover_date))return 'Verified actual handover date required.';
  if(language!=='en'){const arabic=requireFields([['receiving_employee_name_ar','Arabic receiver name'],['description_ar','Arabic item description'],['status_ar','Arabic item status']]);if(arabic)return arabic;}
 }

 if(code==='HR_PPE_ISSUE_FORM'){
  if(language!=='en'&&rows.some(item=>missing(item.ppe_item_ar)||missing(item.condition_ar)))return 'Verified Arabic PPE item and condition are required.';
  if(!rows.length||rows.some(item=>missing(item.ppe_item)||item.ppe_item==='No items'||!Number.isFinite(Number(item.quantity))||Number(item.quantity)<=0||!calendar(item.issue_date)||missing(item.condition)||missing(item.issuer)))return 'Every issued PPE item needs a verified quantity, condition, issue date and issuing person. Empty or incomplete custody records cannot be certified.';
 }
 return null;
}
export function sourceReadiness(def:OfficialDocumentDefinition,context:Source):string|null{return def.validateSource?.(context)??null;}

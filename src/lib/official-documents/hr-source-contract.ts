import {needsLetterReview} from './hr-source-review';
import type {OfficialDocumentInputField} from './types';
export const HR_INTEGRATED_LETTERS:readonly string[]=['HR_EXPERIENCE_LETTER','HR_WARNING_LETTER','HR_PPE_ISSUE_FORM','HR_HANDOVER_FORM','HR_CLEARANCE_FORM','HR_BANK_SALARY_TRANSFER','HR_EMBASSY_LETTER','HR_LEAVE_CONFIRMATION','HR_SALARY_CERT_WITH_AMOUNT'];

/** These are exact existing capabilities, not new role grants. */
export const HR_LETTER_CAPABILITIES:Readonly<Record<string,readonly string[]>>={
 HR_EXPERIENCE_LETTER:['hr.eos.view','hr.payroll.view'],
 HR_WARNING_LETTER:['hr.actions.view','hr.confidential.view'],
 HR_BANK_SALARY_TRANSFER:['hr.payroll.view','hr.banking.view'],
 HR_SALARY_CERT_WITH_AMOUNT:['hr.payroll.view'],
 HR_PPE_ISSUE_FORM:['hr.assignments.view'],
 HR_CLEARANCE_FORM:['hr.eos.view'],
 HR_HANDOVER_FORM:['hr.actions.view','hr.assignments.view'],
 HR_LEAVE_CONFIRMATION:['hr.leave.view'],
};
export const HR_LETTER_SELECTIONS:Readonly<Record<string,{key:string;table:string;label:string}>>={
 HR_EXPERIENCE_LETTER:{key:'eos_case_id',table:'employee_eos_cases',label:'Closed separation case'},
 HR_PPE_ISSUE_FORM:{key:'ppe_issue_id',table:'employee_ppe_issues',label:'Issued PPE record'},
 HR_WARNING_LETTER:{key:'action_id',table:'employee_disciplinary_records',label:'Disciplinary case'},
 HR_CLEARANCE_FORM:{key:'eos_case_id',table:'employee_eos_cases',label:'Clearance / separation case'},
 HR_LEAVE_CONFIRMATION:{key:'leave_request_id',table:'employee_leave_requests',label:'Approved leave request'},
};
export function hrLetterSourceInputs(code:string):OfficialDocumentInputField[]{
 if(needsLetterReview(code))return [{key:'source_review_id',labelEn:'Approved source review',type:'text',required:true,maxLength:16,helpText:'Select independently reviewed particulars tied to the original employee record and evidence.'}];
 const selection=HR_LETTER_SELECTIONS[code];
 return selection?[{key:selection.key,labelEn:selection.label,type:'text',required:code!=='HR_EXPERIENCE_LETTER',maxLength:16,helpText:'Select the original employee transaction. A different or changed record cannot replace it.'}]:[];
}
/** Only declared source identities can reach the report provider. Never forward
 * arbitrary letter inputs, payroll facts or a caller-supplied employee scope. */
export function hrLetterSourceFilters(code:string,inputs:Record<string,string>):Record<string,number>{
 const field=needsLetterReview(code)?'source_review_id':HR_LETTER_SELECTIONS[code]?.key;if(!field||!inputs[field])return {};
 const value=inputs[field];if(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value)))throw Error('Select a valid original employee transaction.');
 return {[field]:Number(value)};
}

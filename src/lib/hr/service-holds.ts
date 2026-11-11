/** Allowlisted business guidance only; never forward arbitrary SQL/field data. */
const guidance=new Set([
 'Assign a currently authorized HR user and a valid due date before progressing or closing this task',
 'The selected HR task owner is not currently authorized for this employee',
 'This task requires source-bound approval mapping review before closure',
 'Last working date cannot precede notice date',
 'Full separation closure is held: approved Finance settlement and clearance authority are not configured',
 'Owner clearance is held: HR cannot certify IT, stock, resource or Finance actions without verified source authority',
 'Owner clearance cannot be relabelled as HR clearance',
 'Attach current employee-linked evidence before recording HR clearance',
 'Verified clearance evidence bytes and version required',
 'Use an uppercase three-letter payroll currency code',
 'Payroll currency change is held: existing salary history needs verified currency provenance, not automatic conversion',
 'Certificate Number is required for the selected training type',
 'Provider is required for the selected training type',
 'The training category does not match the selected training type. Reload the training choices and use the configured category',
]);
export function hrServiceGuidance(code:string|undefined,message:string|undefined):string|undefined{
 if(code!=='23514'||!message)return;
 if(guidance.has(message))return message+'.';
 if(message==='Required or compatible training facts missing')return 'Check the category configured for this training type, its required Certificate Number and Provider.';
 if(/^new row for relation "employee_eos_cases" violates check constraint "f12_separation_date_order"$/.test(message))return 'Employment end date must be on or after the notice and last working dates.';
}

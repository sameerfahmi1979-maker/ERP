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
]);
export function hrServiceGuidance(code:string|undefined,message:string|undefined):string|undefined{
 if(code!=='23514'||!message)return;
 if(guidance.has(message))return message+'.';
 if(/^new row for relation "employee_eos_cases" violates check constraint "f12_separation_date_order"$/.test(message))return 'Employment end date must be on or after the notice and last working dates.';
}

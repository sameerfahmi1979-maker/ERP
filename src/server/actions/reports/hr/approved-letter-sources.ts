import {createHash} from 'node:crypto';
import type {ReportFetcher,ReportDataResult} from '@/lib/report-center/types';
import {approvedEmployeeFacts,loadEmployeeBase} from './hr-letter-documents';
import {readSalarySnapshot} from '@/server/reads/salary-snapshot';
import {payrollToday,salaryDate} from '@/lib/hr/payroll/salary-as-of';
import {collectCompletePages} from '@/lib/reads/complete-pages';

export function letterId(value:unknown):number{const n=Number(value);if(!/^[1-9]\d*$/.test(String(value))||!Number.isSafeInteger(n))throw Error('Select the original employee transaction.');return n;}
function result(employeeId:number,rows:Record<string,unknown>[]):ReportDataResult{return {columns:Object.keys(rows[0]),rows,meta:{sourceRecordId:employeeId,ownerCompanyIds:[Number(rows[0].owner_company_id)]}};}
const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Two bounded collections reject replacement or edits while material facts load. */
async function stable<T>(read:()=>Promise<T>):Promise<T>{const first=await read(),second=await read();if(fingerprint(first)!==fingerprint(second))throw Error('The selected source changed. Refresh and review it again.');return second;}

export const embassyLetterFetcher:ReportFetcher={reportCode:'HR_EMBASSY_LETTER',async fetch(filters,_permissions,db){
 const id=letterId(filters.employee_id),employee=await loadEmployeeBase(id,db);
 return result(id,[approvedEmployeeFacts(employee)]);
}};

export const bankSalaryLetterFetcher:ReportFetcher={reportCode:'HR_BANK_SALARY_TRANSFER',async fetch(filters,permissions,db){
 if(!['hr.payroll.view','hr.banking.view'].every(cap=>permissions.some(p=>[cap,cap+'.self',cap+'.team'].includes(p))))throw Error('Payroll and banking access are required.');
 const id=letterId(filters.employee_id),employee=await loadEmployeeBase(id,db);
 const bank=await stable(async()=>{const r=await db.from('employee_wps_profiles').select('id,employee_id,workspace_revision,bank_id,salary_payment_method,salary_effective_date,wps_status,bank:banks(bank_name_en,bank_name_ar)').eq('employee_id',id).is('deleted_at',null).maybeSingle();
  if(r.error||!r.data||r.data.employee_id!==id||r.data.wps_status!=='active'||r.data.salary_payment_method!=='bank_transfer'||!r.data.salary_effective_date||salaryDate(r.data.salary_effective_date)>payrollToday())throw Error('An active, effective bank salary profile must be verified first.');return r.data;});
 const salary=await readSalarySnapshot(db,id);
 if(salary.payrollStatus!=='active'||salary.currency!=='AED')throw Error('An active AED payroll profile is required.');
 const profile=bank.bank as unknown as {bank_name_en:string;bank_name_ar:string|null}|null;
 // Full IBAN never reaches this report. Optional disclosure remains off; the
 // approved wording explicitly permits omission of that line.
 return result(id,[{...approvedEmployeeFacts(employee),gross_salary:salary.gross,currency:salary.currency,payroll_status:salary.payrollStatus,
  bank_name:profile?.bank_name_en??'',bank_name_ar:profile?.bank_name_ar??'',bank_disclosure_authorised:false,
  bank_source_id:bank.id,bank_source_revision:String(bank.workspace_revision),salary_source_fingerprint:salary.sourceFingerprint}]);
}};

export const leaveConfirmationFetcher:ReportFetcher={reportCode:'HR_LEAVE_CONFIRMATION',async fetch(filters,_permissions,db){
 const id=letterId(filters.employee_id),sourceId=letterId(filters.leave_request_id),employee=await loadEmployeeBase(id,db);
 const leave=await stable(async()=>{const r=await db.from('employee_leave_requests').select('id,employee_id,workspace_revision,approval_status,approved_by,approved_at,cancelled_at,start_date,end_date,return_date,leave_type:hr_leave_types(name_en,name_ar)').eq('employee_id',id).eq('id',sourceId).is('deleted_at',null).single();
  if(r.error||!r.data||r.data.employee_id!==id||r.data.id!==sourceId||r.data.approval_status!=='approved'||!r.data.approved_by||!r.data.approved_at||r.data.cancelled_at)throw Error('Select a currently approved leave request for this employee.');return r.data;});
 if(!leave.return_date||salaryDate(leave.return_date)<=salaryDate(leave.end_date)||salaryDate(leave.start_date)>leave.end_date)throw Error('The approved leave record needs its actual scheduled return date; no next-day date was assumed.');
 const kind=leave.leave_type as unknown as {name_en:string;name_ar:string|null}|null;
 return result(id,[{...approvedEmployeeFacts(employee),leave_reference:`LEAVE-${leave.id}`,leave_type:kind?.name_en??'',leave_type_ar:kind?.name_ar??'',
  leave_start:leave.start_date,leave_end:leave.end_date,return_date:leave.return_date,leave_status:leave.approval_status,source_id:leave.id,source_revision:String(leave.workspace_revision)}]);
}};

export const verifiedClearanceFetcher:ReportFetcher={reportCode:'HR_CLEARANCE_FORM',async fetch(filters,_permissions,db){
 const id=letterId(filters.employee_id),caseId=letterId(filters.eos_case_id),employee=await loadEmployeeBase(id,db);
 const source=await stable(async()=>{
  const r=await db.from('employee_eos_cases').select('id,employee_id,workspace_revision,last_working_date,case_status').eq('id',caseId).eq('employee_id',id).is('deleted_at',null).single();
  if(r.error||!r.data||r.data.id!==caseId||r.data.employee_id!==id)throw Error('The selected separation case is unavailable.');
  const items=await collectCompletePages((from,to)=>db.from('employee_clearance_items').select('id,employee_id,eos_case_id,workspace_revision,clearance_area,item_title,item_status,notes,cleared_at,evidence_document_id,evidence_version_id,responsible_user:user_profiles!responsible_user_id(display_name),reviewer:user_profiles!cleared_by(display_name)',{count:'exact'}).eq('employee_id',id).eq('eos_case_id',caseId).is('deleted_at',null).order('id').range(from,to),{identity:r=>r.id,maxRows:250});
  if(items.some(item=>item.employee_id!==id||item.eos_case_id!==caseId))throw Error('Clearance item source does not match the selected case.');return {case:r.data,items};
 });
 if(!source.case.last_working_date)throw Error('Record the actual last working date in the selected separation case first.');
 const base={...approvedEmployeeFacts(employee),last_working_date:source.case.last_working_date,clearance_status:source.case.case_status,clearance_status_label:({draft:'Draft',notice_served:'Notice served',clearance_in_progress:'Clearance in progress',pending_final_settlement:'Pending final settlement'} as Record<string,string>)[source.case.case_status]??source.case.case_status,
  clearance_status_ar:({draft:'مسودة',notice_served:'تم الإخطار',clearance_in_progress:'إخلاء الطرف قيد الإجراء',pending_final_settlement:'التسوية النهائية معلقة'} as Record<string,string>)[source.case.case_status]??'',source_id:caseId,source_revision:String(source.case.workspace_revision)};
 const areas:Record<string,[string,string]>={hr:['Human Resources','الموارد البشرية'],operations:['Operations','العمليات'],it:['IT','تقنية المعلومات'],finance:['Finance','المالية'],camp:['Accommodation','السكن'],workshop:['Workshop','الورشة'],store:['Store','المستودع'],hse:['HSE','الصحة والسلامة والبيئة'],other:['Other','أخرى']};
 const states:Record<string,[string,string]>={pending:['Pending','معلق'],cleared:['Cleared','تمت التصفية'],not_applicable:['Not applicable','لا ينطبق'],blocked:['Blocked','متعذر']};
 return result(id,source.items.length?source.items.map(item=>({...base,clearance_area:areas[item.clearance_area]?.[0]??item.clearance_area,clearance_area_ar:areas[item.clearance_area]?.[1]??'',item_title:item.item_title,item_status:states[item.item_status]?.[0]??item.item_status,item_status_ar:states[item.item_status]?.[1]??'',
  reviewer_name:(item.reviewer as unknown as {display_name:string}|null)?.display_name??'',responsible_name:(item.responsible_user as unknown as {display_name:string}|null)?.display_name??'',
  evidence_reference:item.evidence_document_id?`Clearance item ${item.id} (retained evidence)`:'',cleared_at:item.cleared_at??'',remarks:item.notes??''})):[base]);
}};

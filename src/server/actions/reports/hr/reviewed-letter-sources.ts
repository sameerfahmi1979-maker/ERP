import type {ReportFetcher,ReportDataResult} from '@/lib/report-center/types';
import {loadEmployeeBase,approvedEmployeeFacts} from './hr-letter-documents';
import {letterId} from './approved-letter-sources';
import {readApprovedLetterReview} from '@/server/reads/hr-letter-review';
import {readSalarySnapshot} from '@/server/reads/salary-snapshot';
import {payrollToday,salaryDate} from '@/lib/hr/payroll/salary-as-of';

function fetcher(code:string):ReportFetcher{return {reportCode:code,async fetch(filters,_permissions,db):Promise<ReportDataResult>{
 const id=letterId(filters.employee_id),review=await readApprovedLetterReview(id,code,filters.source_review_id);
 const employee=await loadEmployeeBase(id,db),base={...approvedEmployeeFacts(employee),source_review_id:review.id,source_review_fingerprint:review.fingerprint,source_id:review.source_id,
  source_evidence_document:review.document_id,source_evidence_version:review.version_id};
 let rows:Record<string,unknown>[];
 if(code==='HR_EXPERIENCE_LETTER'){
  const r=await db.from('employee_eos_cases').select('id,employee_id,workspace_revision,case_status,last_working_date,employment_end_date,reason').eq('id',review.source_id).eq('employee_id',id).is('deleted_at',null).single();
  if(r.error||!r.data||r.data.employee_id!==id||r.data.case_status!=='closed')throw Error('The selected closed separation case is unavailable.');
  const end=salaryDate(r.data.employment_end_date),last=salaryDate(r.data.last_working_date),start=salaryDate(employee.joining_date);
  if(last<start||end<last||end>payrollToday()||!r.data.reason?.trim())throw Error('Verify the original employment dates and recorded reason.');
  const salary=await readSalarySnapshot(db,id,end);
  if(salary.currency!=='AED'||!Number.isFinite(Number(salary.gross))||Number(salary.gross)<=0)throw Error('A verified last AED gross monthly wage is required.');
  // Calendar duration describes the recorded interval, never a statutory/EOS calculation.
  const days=Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1;
  rows=[{...base,...review.facts,designation:review.facts.designation_en,designation_ar:review.facts.designation_ar,
   last_working_date:last,employment_end_date:end,service_period:`${days} calendar days (inclusive)`,service_period_ar:`${new Intl.NumberFormat('ar-AE-u-nu-arab').format(days)} يوماً تقويمياً (شاملاً تاريخي البداية والنهاية)`,
   final_wage:salary.gross,wage_basis:'Gross monthly AED',salary_source_fingerprint:salary.sourceFingerprint,termination_reason:r.data.reason,source_revision:String(r.data.workspace_revision)}];
 }else if(code==='HR_WARNING_LETTER'){
  const r=await db.from('employee_disciplinary_records').select('id,employee_id,workspace_revision,status,disciplinary_type,subject,description,action_taken,incident_date').eq('id',review.source_id).eq('employee_id',id).is('deleted_at',null).single();
  if(r.error||!r.data||r.data.employee_id!==id||r.data.status!=='closed'||!['written_warning','final_warning'].includes(r.data.disciplinary_type)||![r.data.subject,r.data.description,r.data.action_taken].every(v=>v?.trim()))throw Error('A completed written-warning case with recorded decision and corrective action is required.');
  const incident=salaryDate(r.data.incident_date);if(incident>payrollToday()||salaryDate(review.facts.corrective_deadline)<incident)throw Error('The recorded warning dates require review.');
  rows=[{...base,...review.facts,warning_level:r.data.disciplinary_type,warning_reason:r.data.subject,warning_subject_en:r.data.subject,verified_conduct_description_en:r.data.description,
   specific_corrective_action_en:r.data.action_taken,incident_date:incident,source_revision:String(r.data.workspace_revision)}];
 }else if(code==='HR_PPE_ISSUE_FORM'){
  const r=await db.from('employee_ppe_issues').select('id,employee_id,workspace_revision,ppe_item,standard_or_size,quantity,issued_date,status,issuer:user_profiles!issued_by(display_name)').eq('id',review.source_id).eq('employee_id',id).is('deleted_at',null).single();
  if(r.error||!r.data||r.data.employee_id!==id||r.data.status!=='issued')throw Error('The original issued PPE record is unavailable.');
  const issuer=r.data.issuer as unknown as {display_name:string}|null;
  const day=salaryDate(r.data.issued_date);if(day>payrollToday())throw Error('Actual issue date required.');
  rows=[{...base,...review.facts,ppe_item:r.data.ppe_item,quantity:r.data.quantity,size_specification:r.data.standard_or_size??'',issue_date:day,issuer:issuer?.display_name??'',stock_reference:'',source_revision:String(r.data.workspace_revision)}];
 }else{
  if(!review.receiver_id||review.source_id!==id)throw Error('Explicit giver and receiver required.');
  const receiver=await loadEmployeeBase(review.receiver_id,db);
  if(receiver.owner_company_id!==employee.owner_company_id||receiver.id===id)throw Error('Permitted same-company receiver required.');
  if(salaryDate(review.facts.handover_date)>payrollToday())throw Error('Actual handover date required.');
  rows=[{...base,...review.facts,receiving_employee_name:receiver.full_name_en,receiving_employee_name_ar:receiver.full_name_ar??'',evidence_reference:`Source review ${review.id}`}];
 }
 const fresh=await readApprovedLetterReview(id,code,review.id);
 if(fresh.fingerprint!==review.fingerprint)throw Error('The original source changed during preparation.');
 return {columns:Object.keys(rows[0]),rows,meta:{sourceRecordId:id,ownerCompanyIds:[employee.owner_company_id]}};
}};}
export const reviewedExperienceFetcher=fetcher('HR_EXPERIENCE_LETTER');
export const reviewedWarningFetcher=fetcher('HR_WARNING_LETTER');
export const reviewedPpeFetcher=fetcher('HR_PPE_ISSUE_FORM');
export const reviewedHandoverFetcher=fetcher('HR_HANDOVER_FORM');

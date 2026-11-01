'use server';
import {z} from 'zod';
import {getAuthContext,canUseApplication} from '@/lib/rbac/check';
import {getEmployeeAccess} from '@/lib/rbac/employee-access';
import {createScopedReportReadClient,revalidateScopedReportReadClient} from '@/lib/report-center/scoped-read-client';
import {HR_LETTER_CAPABILITIES,HR_LETTER_SELECTIONS} from '@/lib/official-documents/hr-source-contract';
const request=z.object({employeeId:z.number().int().positive().safe(),code:z.string(),page:z.number().int().min(1).max(10000).default(1),selectedId:z.number().int().positive().safe().optional()}).strict();
export async function listHrLetterSources(raw:z.input<typeof request>){
 try{
  const p=request.parse(raw),selection=HR_LETTER_SELECTIONS[p.code];if(!selection)throw Error();
  const ctx=await getAuthContext();if(!canUseApplication(ctx)||!ctx.profile)throw Error();
  const access=await getEmployeeAccess(ctx,p.employeeId),caps=['reports.run','reports.pdf.generate',...(HR_LETTER_CAPABILITIES[p.code]??[])];if(!caps.every(access.allows))throw Error();
  const db=await createScopedReportReadClient(ctx,p.code,caps);
  const projection=selection.table==='employee_ppe_issues'?'id,employee_id,ppe_item,status,issued_date':selection.table==='employee_eos_cases'?'id,employee_id,case_status,last_working_date':selection.table==='employee_leave_requests'?'id,employee_id,approval_status,start_date,end_date':'id,employee_id,status,subject,record_date';
  let q=db.from(selection.table).select(projection,{count:'exact'}).eq('employee_id',p.employeeId).is('deleted_at',null).order('id',{ascending:false});
  if(p.selectedId)q=q.eq('id',p.selectedId);else q=q.range((p.page-1)*25,p.page*25-1);
  const r=await q; if(r.error||r.count===null)throw Error();
  const rows=z.array(z.object({id:z.number().int().positive(),employee_id:z.number().int().positive()}).catchall(z.unknown())).parse(r.data);
  if(rows.some(row=>row.employee_id!==p.employeeId))throw Error();
  const fresh=await getAuthContext();await revalidateScopedReportReadClient(db,fresh);
  return {success:true as const,rows:rows.map(row=>({id:Number(row.id),label:p.code==='HR_PPE_ISSUE_FORM'?`PPE ${row.id} · ${row.ppe_item} · ${row.issued_date} · ${row.status}`:p.code==='HR_LEAVE_CONFIRMATION'?`LEAVE-${row.id} · ${row.start_date} – ${row.end_date} · ${row.approval_status}`:p.code==='HR_WARNING_LETTER'?`Case ${row.id} · ${row.subject} · ${row.status}`:`Case ${row.id} · ${row.last_working_date??'date not recorded'} · ${row.case_status}`})),hasMore:!p.selectedId&&r.count>p.page*25};
 }catch{return {success:false as const,error:'Source choices could not be verified in your current employee access. Retry; no replacement was selected.'};}
}

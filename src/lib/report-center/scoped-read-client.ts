import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAccountActive, hasGlobalPermission, hasPermissionInScope, isGlobalAdmin, type AuthContext } from "@/lib/rbac/check";
import { getAuthorizedReportEmployees, getLinkedEmployeeId, hasEmployeePermission } from "@/lib/rbac/employee-access";

export type ReportReadClient = Pick<ReturnType<typeof createAdminClient>, "from">;
const childCapabilities: Record<string,string[]> = {
 employee_identity_documents:["hr.compliance.view"], employee_medical_insurances:["hr.medical.view"], employee_training_certificates:["hr.compliance.view"],
 employee_dependents:["hr.compliance.view"], employee_medical_records:["hr.medical.view"],
 employee_attendance_daily_summary:["hr.attendance.view"], employee_overtime_records:["hr.attendance.view"],
 employee_leave_requests:["hr.leave.view"],employee_leave_balances:["hr.leave.view"],
 employee_payroll_profiles:["hr.payroll.view"],employee_salary_components:["hr.payroll.view"],employee_payroll_holds:["hr.payroll.view"],employee_wps_profiles:["hr.payroll.view","hr.banking.view"],
 employee_assignments:["hr.assignments.view"],employee_assets:["hr.assignments.view"],employee_ppe_issues:["hr.assignments.view"],
 employee_pro_processes:["hr.actions.view"],employee_disciplinary_records:["hr.actions.view","hr.confidential.view"],
 employee_eos_cases:["hr.eos.view"],employee_clearance_items:["hr.eos.view"],
};
/** Query failures must not silently become empty/zero-valued official reports. */
function checkedRead<T extends object>(query:T):T {
 return new Proxy(query,{get(target,key,receiver){
  if(key==='then')return (fulfilled:((value:unknown)=>unknown)|undefined,rejected:((reason:unknown)=>unknown)|undefined)=>
   Promise.resolve(target as unknown as PromiseLike<{error:{message:string}|null}>).then(result=>{
    if(result.error)throw new Error(`Report data query failed: ${result.error.message}`);
    return result;
   }).then(fulfilled,rejected);
  const value=Reflect.get(target,key,receiver);
  if(typeof value!=='function')return value;
  return (...args:unknown[])=>{const next=value.apply(target,args);return next&&typeof next==='object'&&'then' in next?checkedRead(next):next;};
 }});
}
/** Read-only, closed-table facade. All report queries receive immutable AND row-ID filters.
 * Both interactive and scheduled reports use the current actor's individual assignments.
 * The underlying service client is not exposed to a fetcher.
 */
export async function createScopedReportReadClient(ctx:AuthContext, reportCode:string, required:string[]=[]):Promise<ReportReadClient> {
 assertAccountActive(ctx);
 const db=createAdminClient();
 const scopes=new Map<string,{column:string;ids:number[]}>();
 if(reportCode.startsWith("HR_")) {
  const requiredEmployee=required.filter(c=>(c.startsWith("hr.")||c.startsWith("reports."))&&!['hr.employees.view','hr.employee_profile.view','hr.recruitment.view'].includes(c));
  if(reportCode==='HR_SALARY_CERT_WITH_AMOUNT') requiredEmployee.push('hr.payroll.view');
  if(reportCode==='HR_WARNING_LETTER'||reportCode==='HR_DISCIPLINARY_SUMMARY') requiredEmployee.push('hr.confidential.view');
  const [employees,linked]=await Promise.all([getAuthorizedReportEmployees(ctx,["reports.run",...requiredEmployee]),getLinkedEmployeeId(ctx)]);
  scopes.set('employees',{column:'id',ids:employees.ids});
  for(const [table,codes] of Object.entries(childCapabilities)) scopes.set(table,{column:'employee_id',ids:employees.subjects.filter(e=>codes.every(c=>hasEmployeePermission(ctx,e,linked,c))).map(e=>e.id)});
 }
 if(['HR_CANDIDATE_PIPELINE','HR_REQUISITIONS','HR_ONBOARDING_TASKS'].includes(reportCode)) {
  const recruitmentCaps=['hr.recruitment.view','reports.run',...required.filter(c=>c.startsWith('reports.'))];
  const req=await db.from('hr_job_requisitions').select('id,owner_company_id,branch_id',{count:'exact'}).is('deleted_at',null).limit(1000);
  if(req.error||req.count===null||req.count>1000) throw new Error('Recruitment report scope could not be safely bounded');
  const requisitions=req.data.filter(r=>recruitmentCaps.every(c=>hasPermissionInScope(ctx,c,r.owner_company_id,r.branch_id))).map(r=>r.id as number);
  scopes.set('hr_job_requisitions',{column:'id',ids:requisitions});
  let query=db.from('hr_candidates').select('id,requisition_id',{count:'exact'}).is('deleted_at',null);
  if(!isGlobalAdmin(ctx)) query=query.in('requisition_id',requisitions.length?requisitions:[-1]);
  const candidates=await query.limit(1000);
  if(candidates.error||candidates.count===null||candidates.count>1000) throw new Error('Candidate report scope could not be safely bounded');
  const ids=candidates.data.map(r=>r.id as number);
  scopes.set('hr_candidates',{column:'id',ids});scopes.set('hr_interviews',{column:'candidate_id',ids});
  const offers=await db.from('hr_offers').select('id,owner_company_id,branch_id',{count:'exact'}).in('candidate_id',ids.length?ids:[-1]).is('deleted_at',null).limit(1000);
  if(offers.error||offers.count===null||offers.count>1000) throw new Error('Offer report scope could not be verified');
  scopes.set('hr_offers',{column:'id',ids:offers.data.filter(r=>recruitmentCaps.every(c=>hasPermissionInScope(ctx,c,r.owner_company_id,r.branch_id))).map(r=>r.id)});
  const employeeIds=scopes.get('employees')?.ids??[];
  const tasks=await db.from('hr_onboarding_tasks').select('id,employee_id,candidate_id',{count:'exact'}).is('deleted_at',null)
   .or(`employee_id.in.(${employeeIds.length?employeeIds.join(','):-1}),candidate_id.in.(${ids.length?ids.join(','):-1})`).limit(1000);
  if(tasks.error||tasks.count===null||tasks.count>1000) throw new Error('Onboarding report scope could not be verified');
  scopes.set('hr_onboarding_tasks',{column:'id',ids:tasks.data.filter(t=>(t.employee_id===null||employeeIds.includes(t.employee_id))&&(t.candidate_id===null||ids.includes(t.candidate_id))).map(t=>t.id)});
 }
 return {
  from(relation:string) {
   const scope=scopes.get(relation);
   const catalog=relation==='permissions'&&reportCode==='ADMIN_PERMISSION_MATRIX'&&(hasGlobalPermission(ctx,'permissions.view')||hasGlobalPermission(ctx,'roles.view'));
   if(!scope&&!catalog) throw new Error('This report data source is not authorized');
   const builder=db.from(relation);
   return new Proxy(builder, {get(target,key){
    if(key!=='select') throw new Error('Report data access is read-only');
    return (...args:Parameters<typeof builder.select>)=>{
      if(relation==='employees' && /\*|\bblood_group\b/.test(args[0]??'*')) throw new Error('Sensitive employee columns require separate authorization');
      if(relation==='employee_dependents' && /\*|\bmedical_insurance_/.test(args[0]??'*')) throw new Error('Sensitive dependent columns require separate authorization');
      if(['hr_candidates','hr_job_requisitions','hr_offers'].includes(relation) && /\*|\b(?:expected_salary|budgeted_salary_min|budgeted_salary_max|basic_salary|gross_salary)\b/.test(args[0]??'*')) throw new Error('Recruitment salary columns require a separately authorized salary report');
      // Embedding a different employee child would skip that child's ID/capability
      // filter. Fetch approved child tables separately through this facade.
      if(/(?:^|[,(]|:)\s*employee_[a-z_]+\s*(?:![\w]+\s*)?\(/.test(args[0]??'')) throw new Error('Employee relation embeds require separately scoped queries');
      if(/\bemployees\s*(?:![\w]+\s*)?\(/.test(args[0]??'') && /\*|\bblood_group\b/.test(args[0]??'')) throw new Error('Sensitive employee columns require separate authorization');
      const query=target.select(...args);
      // postgrest-js appends filters, so additional caller filters can only narrow this result.
      return checkedRead(scope?query.in(scope.column,scope.ids.length?scope.ids:[-1]):query);
    };
   }});
  },
 } as ReportReadClient;
}

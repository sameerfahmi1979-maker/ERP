import {HR_LETTER_CAPABILITIES} from "@/lib/official-documents/hr-source-contract";
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAccountActive, hasGlobalPermission, hasPermissionInScope, type AuthContext } from "@/lib/rbac/check";
import { getAuthorizedReportEmployees, getLinkedEmployeeId, hasEmployeePermission, type EmployeeSubject } from "@/lib/rbac/employee-access";
import { completeReportRead, REPORT_READ_MAX_ROWS } from "./complete-read";
import { isRecruitmentReport, usesFreshAnalyticalExport } from "./recruitment-reports";
import { reportAuthorityIdentity } from "./result-identity";
import { z } from "zod";
import { businessDateStart, dubaiBusinessDate } from "@/lib/dubai-calendar";

type WorkforceLeaveKind = "balances" | "requests";
export type ReportReadClient = Pick<ReturnType<typeof createAdminClient>, "from"> & {
 readWorkforceAttendance?: (filters: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
 readWorkforceLeave?: (kind: WorkforceLeaveKind, filters: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
};
const workforceLeaveReports: Record<WorkforceLeaveKind, string> = {
 balances: "HR_LEAVE_BALANCE", requests: "HR_LEAVE_REQUESTS",
};
const workforceReportCodes = new Set(["HR_ATTENDANCE_SUMMARY", ...Object.values(workforceLeaveReports)]);
const grantIdentity = z.tuple([z.number(), z.number().nullable(), z.number().nullable()]);
const workforceSources = ["t03_employment_periods","t04_cases","t04_days","t04_case_events","f12_leave_movements",
 "owner_companies","hr_leave_types","user_profiles"];
const workforceIdentity = z.object({
 owner_company_id: z.number().int().positive().safe(), branch_id: z.number().int().positive().safe().nullable(),
 employee_code: z.string(), employee_name: z.string(), company: z.string(),
});
const reportDay = z.iso.date();
const numberOrNull = z.number().nullable();
const textOrNull = z.string().nullable();
const workforceAttendanceRow = workforceIdentity.extend({
 department: textOrNull, attendance_date: reportDay, attendance_type: z.string(), total_hours: numberOrNull,
 worked_minutes: z.number().int().min(0).max(1440).nullable(), first_in_at: textOrNull, last_out_at: textOrNull,
 late_minutes: numberOrNull, early_out_minutes: numberOrNull, is_missing_punch: z.boolean().nullable(),
 approval_status: z.string(), work_site: textOrNull, as_of_date: reportDay, shift_name: textOrNull,
 shift_context: z.enum(["Dated assignment","Conflicting assignments","Unknown"]),
});
const workforceBalanceRow = workforceIdentity.extend({
 leave_type: z.string(), as_of_date: reportDay.nullable(), leave_year: z.number(), period_start: reportDay.nullable(),
 period_end: reportDay.nullable(), entitled_days: numberOrNull, carry_forward: numberOrNull, used_days: numberOrNull,
 balance_days: numberOrNull, recorded_balance_days: numberOrNull, verified_available_days: numberOrNull,
 pending_reservation_days: numberOrNull, balance_status: z.enum(["Recorded only","Review required","Verified"]),
});
const workforceRequestRow = workforceIdentity.extend({
 leave_type: z.string(), request_ref: z.string(), request_date: reportDay, start_date: reportDay, end_date: reportDay,
 total_days: numberOrNull, approval_status: z.string(), approved_by: textOrNull, approved_at: textOrNull,
 overlap_days: z.number().int().positive(), allocated_days: numberOrNull, paid_allocated_days: numberOrNull,
 allocation_scope: z.enum(["Posted by period (legacy)","Not verified","Posted","Reserved"]),
});
const collectionGuards=new WeakMap<ReportReadClient,(fresh:AuthContext)=>Promise<void>>();
const revisionsSchema = z.record(z.string(), z.string().regex(/^\d+$/));

/** The report runners verify this client's private generation guard before returning any rows. */
export function hasReportSourceGenerationGuard(client: ReportReadClient): boolean {
 return collectionGuards.has(client);
}
/** Internal collection admission, not a callable HTTP authorization parameter. */
export async function revalidateScopedReportReadClient(client:ReportReadClient,fresh:AuthContext){
 const verify=collectionGuards.get(client);if(!verify)throw Error('Report collection authority could not be verified.');await verify(fresh);
}
const childCapabilities: Record<string,string[]> = {
 employee_identity_documents:["hr.compliance.view"], employee_medical_insurances:["hr.medical.view"], employee_training_certificates:["hr.compliance.view"], employee_access_cards:["hr.compliance.view"],
 employee_dependents:["hr.compliance.view"], employee_medical_records:["hr.medical.view"],
 employee_attendance_daily_summary:["hr.attendance.view"], employee_shift_assignments:["hr.attendance.view"], employee_overtime_records:["hr.attendance.view"],
 employee_leave_requests:["hr.leave.view"],employee_leave_balances:["hr.leave.view"],
 employee_payroll_profiles:["hr.payroll.view"],employee_salary_components:["hr.payroll.view"],employee_salary_revision_effects:["hr.payroll.view"],employee_payroll_holds:["hr.payroll.view"],employee_wps_profiles:["hr.payroll.view","hr.banking.view"],
 employee_assignments:["hr.assignments.view"],employee_assets:["hr.assignments.view"],employee_ppe_issues:["hr.assignments.view"],
 employee_pro_processes:["hr.actions.view"],employee_disciplinary_records:["hr.actions.view","hr.confidential.view"],
 employee_eos_cases:["hr.eos.view"],employee_clearance_items:["hr.eos.view"],
};
async function readRecruitmentScope(db: ReturnType<typeof createAdminClient>, actor: AuthContext, employees: EmployeeSubject[], required: string[], reportCode: string, filters: Record<string, unknown>) {
 const reportCaps = [...new Set(['reports.run',...required.filter(code=>code.startsWith('reports.'))])];
 const allows = (company: number | null, branch: number | null) => {
  if (branch !== null && company === null) return false;
  const has = (code: string) => company === null ? hasGlobalPermission(actor,code) : hasPermissionInScope(actor,code,company,branch);
  return (has('hr.recruitment.view') || has('hr.recruitment.manage')) && reportCaps.every(has);
 };
 const read = async <T>(query: PromiseLike<{data:T[] | null; error:unknown; count:number | null}>): Promise<T[]> => {
  const {data,error,count}=await query;
  if(error || data===null || count===null || data.length!==count || count>1000) throw new Error('Recruitment report scope could not be safely bounded');
  return data;
 };
 const global = allows(null,null);
 const scopedCompanies = [...new Set((actor.roleAssignments ?? []).flatMap(a => a.ownerCompanyId === null ? [] : [a.ownerCompanyId]))];
 let branchQuery = db.from('branches').select('id,owner_company_id',{count:'exact'});
 if (!global) branchQuery = branchQuery.in('owner_company_id', scopedCompanies.length ? scopedCompanies : [-1]);
 const branchPairs = await completeReportRead(branchQuery);
 if (branchPairs.error || !branchPairs.data) throw new Error('Recruitment branch scope could not be verified');
 const branchOwners = new Map(branchPairs.data.map(row=>[row.id,row.owner_company_id]));
 const scopeAllows = (company: number | null, branch: number | null) =>
  (branch===null || branchOwners.get(branch)===company) && allows(company,branch);
 const scopeTerms = scopedCompanies.flatMap(company => {
  if (allows(company,null)) return [`owner_company_id.eq.${company}`];
  return branchPairs.data.filter(b=>b.owner_company_id===company && allows(company,b.id))
   .map(b=>`and(owner_company_id.eq.${company},branch_id.eq.${b.id})`);
 });
 let reqQuery = db.from('hr_job_requisitions').select('id,owner_company_id,branch_id',{count:'exact'}).is('deleted_at',null);
 if (!global) reqQuery = scopeTerms.length ? reqQuery.or(scopeTerms.join(',')) : reqQuery.eq('id',-1);
 if (reportCode === 'HR_REQUISITIONS') {
  if (filters.owner_company_id) reqQuery = reqQuery.eq('owner_company_id', Number(filters.owner_company_id));
  if (filters.department_id) reqQuery = reqQuery.eq('department_id', Number(filters.department_id));
  if (filters.requisition_status) reqQuery = reqQuery.eq('requisition_status', String(filters.requisition_status));
  if (filters.date_from) reqQuery = reqQuery.gte('created_at', businessDateStart(String(filters.date_from)));
  if (filters.date_to) reqQuery = reqQuery.lt('created_at', businessDateStart(String(filters.date_to),1));
 }
 const req = await read(reqQuery.order('id').limit(1000));
 const requisitions = req.filter(row=>scopeAllows(row.owner_company_id,row.branch_id));
 const requisitionIds = new Set(requisitions.map(row=>row.id));
 let candidateIdsQuery = db.from('hr_candidates').select('id,requisition_id',{count:'exact'}).is('deleted_at',null);
 if (reportCode==='HR_CANDIDATE_PIPELINE') {
  if (filters.candidate_status) candidateIdsQuery = candidateIdsQuery.eq('candidate_status',String(filters.candidate_status));
  if (filters.requisition_status) candidateIdsQuery = candidateIdsQuery.eq('pipeline_stage',String(filters.requisition_status));
  if (filters.date_from) candidateIdsQuery = candidateIdsQuery.gte('created_at',businessDateStart(String(filters.date_from)));
  if (filters.date_to) candidateIdsQuery = candidateIdsQuery.lt('created_at',businessDateStart(String(filters.date_to),1));
  if (filters.search) candidateIdsQuery = candidateIdsQuery.ilike('full_name_en',`%${filters.search}%`);
 }
 const reqFilter = [...requisitionIds];
 const candidates = await read((global && reportCode !== 'HR_REQUISITIONS'
   ? candidateIdsQuery.or(`requisition_id.is.null,requisition_id.in.(${reqFilter.length?reqFilter.join(','):-1})`)
   : candidateIdsQuery.in('requisition_id',reqFilter.length?reqFilter:[-1])).order('id').limit(1000));
 const candidateIds = new Set(candidates.map(row=>row.id));
 const candidateFilter = candidateIds.size ? [...candidateIds] : [-1];
 const employeeIds = new Set(employees.filter(row=>scopeAllows(row.owner_company_id,row.branch_id)).map(row=>row.id));
 const employeeFilter = employeeIds.size ? [...employeeIds].join(',') : '-1';
 const eligibleRequisition = (id: number | null) => id===null || requisitionIds.has(id);
 const interviewQuery = db.from('hr_interviews').select('id,candidate_id,requisition_id',{count:'exact'}).in('candidate_id',candidateFilter).is('deleted_at',null)
  .or(`requisition_id.is.null,requisition_id.in.(${reqFilter.length?reqFilter.join(','):-1})`);
 let offerQuery = db.from('hr_offers').select('id,candidate_id,requisition_id,owner_company_id,branch_id',{count:'exact'}).in('candidate_id',candidateFilter).is('deleted_at',null)
  .or(`requisition_id.is.null,requisition_id.in.(${reqFilter.length?reqFilter.join(','):-1})`);
 if (!global) offerQuery = scopeTerms.length ? offerQuery.or(scopeTerms.join(',')) : offerQuery.eq('id',-1);
 let tasksQuery = db.from('hr_onboarding_tasks').select('id,employee_id,candidate_id',{count:'exact'}).is('deleted_at',null)
  .or(`employee_id.is.null,employee_id.in.(${employeeFilter})`).or(`candidate_id.is.null,candidate_id.in.(${candidateFilter.join(',')})`);
 if (!global) tasksQuery = tasksQuery.or('employee_id.not.is.null,candidate_id.not.is.null');
 if (filters.employee_status) tasksQuery = tasksQuery.eq('task_status', String(filters.employee_status));
 if (filters.date_from) tasksQuery = tasksQuery.gte('due_date', String(filters.date_from));
 if (filters.date_to) tasksQuery = tasksQuery.lte('due_date', String(filters.date_to));
 const [interviews,offers,tasks] = await Promise.all([
  reportCode==='HR_CANDIDATE_PIPELINE' ? read(interviewQuery.order('id').limit(1000)) : [],
  reportCode==='HR_CANDIDATE_PIPELINE' ? read(offerQuery.order('id').limit(1000)) : [],
  reportCode==='HR_ONBOARDING_TASKS' ? read(tasksQuery.order('id').limit(1000)) : [],
 ]);
 return {
  hr_job_requisitions:requisitions,
  hr_candidates:candidates,
  ...(reportCode==='HR_CANDIDATE_PIPELINE' ? {
   hr_interviews:interviews.filter(row=>candidateIds.has(row.candidate_id)&&eligibleRequisition(row.requisition_id)),
   hr_offers:offers.filter(row=>candidateIds.has(row.candidate_id)&&eligibleRequisition(row.requisition_id)&&scopeAllows(row.owner_company_id,row.branch_id)),
  } : {}),
  ...(reportCode==='HR_ONBOARDING_TASKS' ? {
   hr_onboarding_tasks:tasks.filter(row=>row.employee_id===null&&row.candidate_id===null ? global :
    (row.employee_id===null||employeeIds.has(row.employee_id))&&(row.candidate_id===null||candidateIds.has(row.candidate_id))),
  } : {}),
 };
}
/** Read-only, closed-table facade. All report queries receive immutable AND row-ID filters.
 * Both interactive and scheduled reports use the current actor's individual assignments.
 * The underlying service client is not exposed to a fetcher.
 */
export async function createScopedReportReadClient(requestContext:AuthContext, reportCode:string, required:string[]=[], filters: Record<string, unknown> = {}):Promise<ReportReadClient> {
 assertAccountActive(requestContext);
 const db=createAdminClient();
 const guardedWorkforce = workforceReportCodes.has(reportCode);
 const readWorkforceGrants = async (actor: AuthContext) => {
  const {data,error} = await db.rpc("t19_workforce_grants", {p_profile:actor.profile!.id}).abortSignal(AbortSignal.timeout(5_000));
  const parsed = z.array(grantIdentity).safeParse(data);
  if (error || !parsed.success) throw new Error("Current workforce assignment dates could not be verified.");
  return new Set(parsed.data.map(grant=>JSON.stringify(grant)));
 };
 const activeGrants = guardedWorkforce ? await readWorkforceGrants(requestContext) : null;
 const narrowContext = (actor: AuthContext): AuthContext => !activeGrants ? actor : {
  ...actor,
  roleAssignments: (actor.roleAssignments ?? []).filter(role=>
   activeGrants.has(JSON.stringify([role.roleId,role.ownerCompanyId,role.branchId]))),
 };
 const ctx = narrowContext(requestContext);
 const readRevisions = async () => {
  const { data, error } = await db.rpc('phase3_report_source_generations').abortSignal(AbortSignal.timeout(5_000));
  const parsed = revisionsSchema.safeParse(data);
  if (error || !parsed.success) throw new Error('Report source revisions could not be verified.');
  return parsed.data;
 };
 const opening = await readRevisions();
 const sources = new Set<string>();
 const scopes=new Map<string,{column:string;ids:number[]}>();
 let employeeSubjects: EmployeeSubject[] = [];
 let employeeCapabilities: string[] = [];
 let verifyEmployeeScope:(fresh:AuthContext)=>Promise<void>=async fresh=>{assertAccountActive(fresh);if(fresh.profile?.id!==ctx.profile?.id)throw Error('Report collection actor changed.');};
 if(reportCode.startsWith("HR_")) {
  sources.add('employees');
  sources.add('erp_user_employee_links');
  const requiredEmployee=required.filter(c=>(c.startsWith("hr.")||c.startsWith("reports."))&&!['hr.employees.view','hr.employee_profile.view','hr.recruitment.view'].includes(c));
  requiredEmployee.push(...(HR_LETTER_CAPABILITIES[reportCode]??[]));
  if(reportCode==='HR_SALARY_CERT_WITH_AMOUNT') requiredEmployee.push('hr.payroll.view');
  if(reportCode==='HR_WPS_READINESS') requiredEmployee.push('hr.payroll.view','hr.banking.view');
  if(reportCode==='HR_WARNING_LETTER'||reportCode==='HR_DISCIPLINARY_SUMMARY') requiredEmployee.push('hr.confidential.view');
  employeeCapabilities = ["reports.run",...requiredEmployee];
  const [employees,linked]=await Promise.all([reportCode === 'HR_CANDIDATE_PIPELINE' || reportCode === 'HR_REQUISITIONS' ? {subjects:[],ids:[]} : getAuthorizedReportEmployees(ctx,employeeCapabilities),getLinkedEmployeeId(ctx)]);
  employeeSubjects=employees.subjects;
  scopes.set('employees',{column:'id',ids:employees.ids});
  for(const [table,codes] of Object.entries(childCapabilities)) scopes.set(table,{column:'employee_id',ids:employees.subjects.filter(e=>codes.every(c=>hasEmployeePermission(ctx,e,linked,c))).map(e=>e.id)});
  const normalize=(ids:number[])=>JSON.stringify([...ids].sort((a,b)=>a-b));
  const admitted=new Map([...scopes].map(([table,scope])=>[table,normalize(scope.ids)]));
  verifyEmployeeScope=async fresh=>{
   assertAccountActive(fresh);if(fresh.profile?.id!==ctx.profile?.id)throw Error('Report collection actor changed.');
   const [current,currentLink]=await Promise.all([reportCode === 'HR_CANDIDATE_PIPELINE' || reportCode === 'HR_REQUISITIONS' ? {subjects:[],ids:[]} : getAuthorizedReportEmployees(fresh,["reports.run",...requiredEmployee]),getLinkedEmployeeId(fresh)]);
   if(normalize(current.ids)!==admitted.get('employees'))throw Error('Employee report scope changed during collection. Run it again.');
   for(const [table,codes]of Object.entries(childCapabilities))if(normalize(current.subjects.filter(e=>codes.every(c=>hasEmployeePermission(fresh,e,currentLink,c))).map(e=>e.id))!==admitted.get(table))throw Error('Employee report scope changed during collection. Run it again.');
  };
 }
 if(isRecruitmentReport(reportCode)) {
  sources.add('branches');
  const admitted=await readRecruitmentScope(db,ctx,employeeSubjects,required,reportCode,filters);
  for (const table of Object.keys(admitted)) sources.add(table);
  for (const [table,rows] of Object.entries(admitted)) if (rows) scopes.set(table,{column:'id',ids:rows.map(row=>row.id)});
  const verifyEmployees=verifyEmployeeScope;
  verifyEmployeeScope=async fresh=>{
   await verifyEmployees(fresh);
   const current=reportCode === 'HR_ONBOARDING_TASKS' ? await getAuthorizedReportEmployees(fresh,employeeCapabilities) : {subjects:[]};
   if(JSON.stringify(await readRecruitmentScope(db,fresh,current.subjects,required,reportCode,filters))!==JSON.stringify(admitted))
    throw new Error('Recruitment report scope changed during collection. Run it again.');
  };
 }
 async function readWorkforce(kind: WorkforceLeaveKind | "attendance", criteria: Record<string, unknown>) {
  const attendance = kind === "attendance";
  if ((attendance ? "HR_ATTENDANCE_SUMMARY" : workforceLeaveReports[kind]) !== reportCode) {
   throw new Error("This workforce report data source is not authorized");
  }
  const table = attendance ? "employee_attendance_daily_summary" : kind === "balances" ? "employee_leave_balances" : "employee_leave_requests";
  const scope = scopes.get(table);
  if (!scope) throw new Error("Report scope could not be verified");
  const hardCaps = [...new Set([...employeeCapabilities,attendance ? "hr.attendance.view" : "hr.leave.view"])];
  const canReadDatedScope = (owner:number,branch:number|null) =>
   (hasPermissionInScope(ctx,"hr.employees.view",owner,branch) || hasPermissionInScope(ctx,"hr.employee_profile.view",owner,branch)) &&
   hardCaps.every(code=>hasPermissionInScope(ctx,code,owner,branch));
  const owner = criteria.owner_company_id ? Number(criteria.owner_company_id) : null;
  const branch = criteria.branch_id ? Number(criteria.branch_id) : null;
  const broad = ctx.roleAssignments?.some(role=>role.ownerCompanyId===null && role.branchId===null);
  const authorizedCompanies = [...new Set((ctx.roleAssignments ?? []).flatMap(role=>role.ownerCompanyId===null ? [] : [role.ownerCompanyId]))];
  let branchQuery = db.from("branches").select("id,owner_company_id",{count:"exact"}).eq("status","active").eq("operating_status","active");
  if (owner !== null) branchQuery=branchQuery.eq("owner_company_id",owner);
  if (branch !== null) branchQuery=branchQuery.eq("id",branch);
  if (!broad) branchQuery=branchQuery.in("owner_company_id",authorizedCompanies.length ? authorizedCompanies : [-1]);
  const branchRows = await completeReportRead(branchQuery);
  if (branchRows.error || !branchRows.data) throw new Error("Report branch scope could not be verified.");
  sources.add("branches");
  const historical = branchRows.data.filter(row=>canReadDatedScope(row.owner_company_id,row.id))
   .map(row=>row.owner_company_id+":"+row.id);
  const ownerCandidates = [...new Set([...authorizedCompanies,...branchRows.data.map(row=>row.owner_company_id)])]
   .filter(id=>owner === null || id===owner);
  if (branch === null) for (const id of ownerCandidates) if (canReadDatedScope(id,null)) historical.push(id+":0");
  if ((owner !== null || branch !== null) && historical.length===0 &&
     !employeeSubjects.some(subject => scope.ids.includes(subject.id) &&
       (owner===null || subject.owner_company_id===owner) && (branch===null || subject.branch_id===branch))) {
   throw new Error("This workforce report scope is restricted.");
  }
  sources.add(table);
  const requiredSources = attendance
   ? ["t03_employment_periods","owner_companies","departments","work_sites","employee_shift_assignments","work_shifts"]
   : [...workforceSources,...(kind === "balances" ? ["t04_policies","t04_periods"] : [])];
  for (const source of requiredSources) sources.add(source);
  let subjectQuery = client.from("employees").select("id").is("deleted_at",null).in("id",scope.ids.length ? scope.ids : [-1]);
  if (criteria.department_id) subjectQuery=subjectQuery.eq("department_id",Number(criteria.department_id));
  const ids = z.array(z.object({id:z.number().int().positive().safe()})).safeParse((await subjectQuery).data);
  if (!ids.success) throw new Error("Workforce report subjects could not be verified");
  const today = dubaiBusinessDate();
  const parameters = {
   p_employees:ids.data.map(row=>row.id),p_as_of:today,p_from:criteria.date_from || null,p_to:criteria.date_to || null,
   p_limit:REPORT_READ_MAX_ROWS,p_owner:owner,p_branch:branch,p_historical:criteria.department_id ? [] : historical,
  };
  const { data, error } = await (attendance
   ? db.rpc("t19_workforce_attendance_report",{...parameters,p_site:criteria.work_site_id || null,p_status:criteria.attendance_status || null})
   : db.rpc("t19_workforce_leave_report",{...parameters,p_kind:kind,p_status:kind === "requests" ? criteria.leave_status || null : null})
  ).abortSignal(AbortSignal.timeout(10_000));
  if (error?.code === "54000") throw new Error("This report exceeds the verified row limit. Narrow the dates and run it again.");
  if (error || today !== dubaiBusinessDate()) throw new Error("Workforce report facts could not be verified. Run the report again.");
  const projection = attendance ? workforceAttendanceRow : kind === "balances" ? workforceBalanceRow : workforceRequestRow;
  return z.array(projection).parse(data);
 }
 const client={
  readWorkforceAttendance: (criteria: Record<string, unknown>) => readWorkforce("attendance",criteria),
  readWorkforceLeave: (kind: WorkforceLeaveKind, criteria: Record<string, unknown>) => readWorkforce(kind,criteria),
  from(relation:string) {
   const scope=scopes.get(relation);
   const catalog=relation==='permissions'&&reportCode==='ADMIN_PERMISSION_MATRIX'&&(hasGlobalPermission(ctx,'permissions.view')||hasGlobalPermission(ctx,'roles.view'));
   if(!scope&&!catalog) throw new Error('This report data source is not authorized');
   const builder=db.from(relation);
   return new Proxy(builder, {get(target,key){
    if(key!=='select') throw new Error('Report data access is read-only');
    return (...args:Parameters<typeof builder.select>)=>{
      sources.add(relation);
      for (const match of (args[0] ?? '').matchAll(/(?:^|(?<=[,(]))\s*(?:\w+\s*:\s*)?(\w+)(?:![\w]+)*\s*\(/g)) sources.add(match[1]);
      if(relation==='employees' && /\*|\bblood_group\b/.test(args[0]??'*')) throw new Error('Sensitive employee columns require separate authorization');
      if(relation==='employee_dependents' && /\*|\bmedical_insurance_/.test(args[0]??'*')) throw new Error('Sensitive dependent columns require separate authorization');
      if(['hr_candidates','hr_job_requisitions','hr_offers'].includes(relation) && /\*|\b(?:expected_salary|budgeted_salary_min|budgeted_salary_max|basic_salary|gross_salary)\b/.test(args[0]??'*')) throw new Error('Recruitment salary columns require a separately authorized salary report');
      if(isRecruitmentReport(reportCode) && /\bhr_(?:interviews|offers|onboarding_tasks)\s*(?:![\w]+\s*)?\(/.test(args[0]??'')) throw new Error('Recruitment children require separately scoped queries');
      // Embedding a different employee child would skip that child's ID/capability
      // filter. Fetch approved child tables separately through this facade.
      if(/(?:^|[,(]|:)\s*employee_[a-z_]+\s*(?:![\w]+\s*)?\(/.test(args[0]??'')) throw new Error('Employee relation embeds require separately scoped queries');
      if(/\bemployees\s*(?:![\w]+\s*)?\(/.test(args[0]??'') && /\*|\bblood_group\b/.test(args[0]??'')) throw new Error('Sensitive employee columns require separate authorization');
      const query=target.select(args[0],{...args[1],count:'exact'});
      // postgrest-js appends filters, so additional caller filters can only narrow this result.
      return completeReportRead(scope?query.in(scope.column,scope.ids.length?scope.ids:[-1]):query, {
        generationFenced: usesFreshAnalyticalExport(reportCode) && hasReportSourceGenerationGuard(client),
      });
    };
   }});
  },
 } as ReportReadClient;
 collectionGuards.set(client,async fresh=>{
  if (activeGrants) {
   const closingGrants=await readWorkforceGrants(fresh);
   if (closingGrants.size!==activeGrants.size || [...closingGrants].some(grant=>!activeGrants.has(grant))) {
    throw new Error("Your active workforce report assignments changed during collection. Run it again.");
   }
  }
  const narrowedFresh = narrowContext(fresh);
  if (activeGrants && reportAuthorityIdentity(narrowedFresh)!==reportAuthorityIdentity(ctx)) {
   throw new Error("Your scoped workforce report permissions changed during collection. Run it again.");
  }
  await verifyEmployeeScope(narrowedFresh);
  const closing = await readRevisions();
  if ([...sources].some(source => opening[source] === undefined || closing[source] !== opening[source])) {
   throw new Error('Report data changed during collection. Run it again.');
  }
 });
 return client;
}

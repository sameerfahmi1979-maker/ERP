import { z } from "zod";
import { type AuthContext, hasPermission, hasPermissionInScope } from "@/lib/rbac/check";
import { hasEmployeePermission, type EmployeeSubject } from "@/lib/rbac/employee-access";
import { literalContains } from "@/lib/reads/search";
import { createClient } from "@/lib/supabase/server";
import { type HrCommand, id } from "./hr-contracts";
import { balanceRow, dbRevision, denied, field, human, mobileBalanceFact, rpcFailure, unavailable } from "./hr-shapes";

export type Db = Awaited<ReturnType<typeof createClient>>;
type Input<K extends HrCommand["op"]>=Extract<HrCommand,{op:K}>;
const nullable=z.string().nullable();
const dubaiTimestamp=(value:string)=>{
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw unavailable();
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Dubai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
  const part=(name:string)=>parts.find(x=>x.type===name)?.value;
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")} +04:00`;
};
const choice=z.object({id,label:z.string()});
export const pageRows=<T>(rows:T[])=>({rows:rows.slice(0,25),more:rows.length>25});
export const choicePage=(raw:unknown)=>pageRows(z.array(choice).max(26).parse(raw));
export async function rpc(db:Db,name:string,args:Record<string,unknown>,write=false){
  const {data,error}=await db.rpc(name,args);
  if(error) throw rpcFailure(error.code,write,error.message);
  return data as unknown;
}
export async function employeeContext(db:Db,ctx:AuthContext,employeeId:number,linked:number|null) {
  const r=await db.from("employees").select("id,owner_company_id,branch_id,reporting_manager_id").eq("id",employeeId).is("deleted_at",null).maybeSingle();
  if(r.error) throw unavailable();
  if(!r.data)throw denied();
  const subject=r.data as EmployeeSubject;
  const allows=(code:string)=>hasEmployeePermission(ctx,subject,linked,code);
  if(!allows("hr.employees.view") && !allows("hr.employee_profile.view"))throw denied();
  return {subject,allows,own:linked===employeeId};
}
type Access=Awaited<ReturnType<typeof employeeContext>>;
export function capabilities(ctx:AuthContext,a?:Access){
  const permits=(s:string)=>a?.allows(s)===true;
  const submit=a?.own===true && hasPermissionInScope(ctx,"hr.requests.submit.self",a.subject.owner_company_id,a.subject.branch_id);
  const evidence=!!a && ["dms.documents.view","dms.documents.preview"].every(s=>hasPermissionInScope(ctx,s,a.subject.owner_company_id,a.subject.branch_id));
  return {leaveCertificate:evidence&&permits("hr.medical.view")&&permits("hr.leave.view"),profileCorrection:submit&&permits("hr.employees.view"),renewalCompliance:permits("hr.compliance.view"),renewalMedical:permits("hr.medical.view"),leave:permits("hr.leave.view"),attendance:permits("hr.attendance.view"),renewals:permits("hr.compliance.view")||permits("hr.medical.view"),
    leaveSubmit:submit&&permits("hr.leave.view"),timeCorrection:submit&&permits("hr.attendance.view"),renewalSubmit:submit&&permits("hr.compliance.view"),
    evidence,
    employees:["hr.employees.view","hr.employee_profile.view","hr.employees.view.team","hr.employee_profile.view.team"].some(s=>hasPermission(ctx,s))};
}
const expandedCapabilities=z.strictObject({
  directory:z.boolean(),employeeRecord:z.boolean(),work:z.boolean(),teamReadiness:z.boolean(),services:z.boolean(),serviceReview:z.boolean(),
  issuedDocuments:z.boolean(),ppeAssets:z.boolean(),onboarding:z.boolean(),pro:z.boolean(),teamCalendar:z.boolean(),dependents:z.boolean(),
  accommodation:z.boolean(),offboarding:z.boolean(),
});
const staffSchema=z.object({roster:z.boolean(),approvalsGeneral:z.boolean(),approvalsLeave:z.boolean(),approvalsProposal:z.boolean(),requestsTeam:z.boolean(),expanded:expandedCapabilities.optional()});
export async function staffCapabilities(db:Db,subject?:number|null,own=false){
  if(subject!==undefined){
    const result=await db.rpc("mobile_hr_staff_capabilities",{p_expanded:true,p_subject:subject,p_own:own});
    if(!result.error)return staffSchema.parse(result.data);
    if(result.error.code!=="PGRST202" && result.error.code!=="42883")throw rpcFailure(result.error.code,false,result.error.message);
  }
  return staffSchema.parse(await rpc(db,"mobile_hr_staff_capabilities",{}));
}
const relation=(s:string)=>z.record(z.string(),z.unknown()).nullable().transform(v=>v&&typeof v[s]==="string"?String(v[s]):null);
const contacts=z.object({mobile_number:nullable,personal_email:nullable,emergency_contact_name:nullable,emergency_contact_mobile:nullable});
const profileSchema=z.object({id,full_name_en:z.string(),employee_code:z.string(),employee_status:z.string(),joining_date:nullable,workspace_revision:dbRevision,
  contacts:contacts.nullable(),owner_company:nullable,branch:nullable,designation:nullable,department:nullable,manager:nullable,site:nullable,
  owner_company_id:id,branch_id:id.nullable(),reporting_manager_id:id.nullable(),own:z.boolean()});
const ownSchema=z.object({employeeId:id,profile:z.boolean(),leave:z.boolean(),attendance:z.boolean(),compliance:z.boolean(),medical:z.boolean(),submit:z.boolean(),mine:z.boolean(),actions:z.boolean(),evidence:z.boolean()});
type OwnAccess=z.infer<typeof ownSchema>;
export async function ownAccess(db:Db){return ownSchema.nullable().parse(await rpc(db,"mobile_hr_own_access",{}));}
export async function home(db:Db,ctx:AuthContext){
  const [own,{expanded,...staff}]=await Promise.all([ownAccess(db),staffCapabilities(db,null)]);
  const submit=own?.submit===true, leave=own?.leave===true, attendance=own?.attendance===true, compliance=own?.compliance===true, medical=own?.medical===true;
  const profile=own?.profile===true,evidence=own?.evidence===true;
  const person=profile&&own?await db.from("employees").select("id,owner_company_id,branch_id,reporting_manager_id,full_name_en").eq("id",own.employeeId).is("deleted_at",null).maybeSingle():null;
  if(person?.error)throw unavailable();
  const canCorrectProfile=submit && !!person?.data && !!own && hasEmployeePermission(ctx,person.data,own.employeeId,"hr.employees.view");
  // Team grants may apply to a different person. Keep the linked employee's home actions scoped to that employee.
  const personal=expanded&&own?(await staffCapabilities(db,own.employeeId)).expanded:undefined;
  const staffEntry=staff.roster||staff.approvalsGeneral||staff.approvalsLeave||staff.approvalsProposal||staff.requestsTeam||
    !!expanded&&(expanded.directory||expanded.teamReadiness||expanded.teamCalendar||expanded.serviceReview);
  const ownEntry=!!own&&(profile||leave||attendance||compliance||medical||own.mine||!!personal&&
    (personal.work||personal.services||personal.issuedDocuments||personal.ppeAssets||personal.onboarding||personal.dependents||personal.pro||personal.accommodation||personal.offboarding));
  return {...(expanded?{entryAvailable:staffEntry||ownEntry,personalCapabilities:personal??null}:{}),hrContractVersion:expanded?2:1,employeeId:own?.employeeId??null,own:own!==null,name:person?.data?.full_name_en??null,capabilities:{
    ...staff,...expanded,profile,profileCorrection:canCorrectProfile,leave,attendance,renewals:compliance||medical,renewalCompliance:compliance,renewalMedical:medical,
    leaveSubmit:submit&&leave,timeCorrection:submit&&attendance,renewalSubmit:submit&&compliance,evidence,leaveCertificate:evidence&&medical&&leave,
    requests:own?.mine===true,approvals:staff.approvalsGeneral||staff.approvalsLeave||staff.approvalsProposal,employees:expanded?expanded.directory:capabilities(ctx).employees}};
}
type PersonalInput=Input<"leaveOptions"|"leaveBalances"|"leaveRequests"|"renewals"|"time"|"evidence">;
export async function ownDomainRead(db:Db,own:OwnAccess,i:PersonalInput){
  if(own.employeeId!==i.employeeId)throw denied();
  if(i.op==="leaveOptions" || i.op==="leaveBalances" || i.op==="leaveRequests"){
    if(!own.leave)throw denied();
    return leaveFacts(db,i);
  }
  if(i.op==="evidence"){
    if(!own.evidence || i.purpose==="leave" && (!own.leave || !own.medical))throw denied();
    return evidencePage(db,i);
  }
  if(i.op==="time"?!own.attendance:i.kind==="medical-insurance"?!own.medical:!own.compliance)throw denied();
  const raw=await rpc(db,"mobile_hr_own_records",{p_employee:i.employeeId,p_kind:i.kind,p_page:i.page});
  if(i.op==="time")return pageRows(z.array(z.object({id,label:z.string(),date:z.string(),detail:nullable,status:nullable,revision:dbRevision.nullable()})).max(26).parse(raw));
  return pageRows(z.array(z.object({id,label:z.string(),expiryDate:nullable,revision:dbRevision})).max(26).parse(raw));
}
export async function evidencePage(db:Db,i:Input<"evidence">){
  const raw=await rpc(db,"mobile_hr_evidence",{p_employee:i.employeeId,p_page:i.page,p_purpose:i.purpose});
  return pageRows(z.array(z.object({id,label:z.string(),versionId:id})).max(26).parse(raw));
}
export async function readProfileAccess(db:Db,ctx:AuthContext,employeeId?:number){
  const [raw,own,{expanded,...staff}]=await Promise.all([rpc(db,"mobile_hr_profile",{p_employee:employeeId??null}),ownAccess(db),staffCapabilities(db,employeeId??null,employeeId===undefined)]);
  const menu=(a?:Access,selected=expanded)=>({...capabilities(ctx,a),...staff,...selected,profile:!!a,requests:own?.mine===true,
    approvals:staff.approvalsGeneral||staff.approvalsLeave||staff.approvalsProposal});
  if(raw==null){
    if(employeeId!=null||own)throw denied();
    return {record:null,capabilities:menu()};
  }
  const p=profileSchema.parse(raw);
  if(employeeId!=null && p.id!==employeeId)throw denied();
  const a={subject:p,own:p.own,allows:(code:string)=>hasEmployeePermission(ctx,p,own?.employeeId??null,code)};
  return {record:p,capabilities:menu(a)};
}
export async function profile(db:Db,ctx:AuthContext,employeeId?:number){
  const {record:p,capabilities}=await readProfileAccess(db,ctx,employeeId);
  if(!p)return {employeeId:null,name:null,own:false,revision:null,fields:[],capabilities};
  return {employeeId:p.id,name:p.full_name_en,own:p.own,revision:p.workspace_revision,capabilities,fields:[
    field("Employee code",p.employee_code),field("Company",p.owner_company),field("Branch",p.branch),field("Department",p.department),
    field("Designation",p.designation),field("Manager",p.manager),field("Work site",p.site),field("Employment status",p.employee_status),field("Joining date",p.joining_date),
    ...(p.contacts?[field("Mobile number",p.contacts.mobile_number),field("Personal email",p.contacts.personal_email),
      field("Emergency contact",p.contacts.emergency_contact_name),field("Emergency contact mobile",p.contacts.emergency_contact_mobile)]:[])]};
}
export async function employees(db:Db,ctx:AuthContext,input:Input<"employees">){
  if(!capabilities(ctx).employees)throw denied();
  let q=db.from("employees").select("id,employee_code,full_name_en").is("deleted_at",null);
  if(input.search){ const term=literalContains(input.search);q=q.or(`full_name_en.ilike.${term},employee_code.ilike.${term}`); }
  const from=(input.page-1)*25;
  const r=await q.order("id").range(from,from+25);
  if(r.error)throw unavailable();
  return pageRows((r.data??[]).map(e=>({id:e.id,label:`${e.employee_code} — ${e.full_name_en}`})));
}
export async function leaveRead(db:Db,a:Access,input:Input<"leaveOptions"|"leaveBalances"|"leaveRequests">){
  if(!a.allows("hr.leave.view"))throw denied();
  return leaveFacts(db,input);
}
async function leaveFacts(db:Db,input:Input<"leaveOptions"|"leaveBalances"|"leaveRequests">){
  const kind=input.op==="leaveOptions"?"options":input.op==="leaveBalances"?"balances":"requests";
  const data=await rpc(db,"mobile_hr_leave_read",{p_kind:kind,p_employee:input.employeeId,p_cursor:input.op==="leaveBalances"?input.after:input.page});
  if(input.op==="leaveOptions")return pageRows(z.array(choice.extend({requiresDocument:z.boolean()})).max(26).parse(data));
  if(input.op==="leaveBalances")return pageRows(z.array(mobileBalanceFact).max(26).parse(data).map(p=>balanceRow(p,p.label??"Leave balance")));
  return pageRows(z.array(z.object({id,revision:dbRevision,label:z.string(),startDate:z.string(),endDate:z.string(),status:z.string(),canCancel:z.boolean()})).max(26).parse(data));
}
const inspections={
  "identity-document":["employee_identity_documents","kind:hr_identity_document_types(name_en)"],
  "medical-insurance":["employee_medical_insurances",""],
  "access-card":["employee_access_cards","kind:hr_access_card_types(name_en)"],
  "training-certificate":["employee_training_certificates","kind:hr_training_types(name_en)"],
} as const;
export async function renewalRead(db:Db,a:Access,input:Input<"renewals">){
  if(!a.allows(input.kind==="medical-insurance"?"hr.medical.view":"hr.compliance.view"))throw denied();
  const [table,join]=inspections[input.kind],from=(input.page-1)*25;
  const r=await db.from(table).select(["id,workspace_revision,expiry_date",join].filter(Boolean).join(",")).eq("employee_id",input.employeeId).is("deleted_at",null)
    .order("expiry_date",{nullsFirst:false}).order("id").range(from,from+25);
  if(r.error)throw unavailable();
  return pageRows(z.array(z.object({id,workspace_revision:dbRevision,expiry_date:nullable,kind:relation("name_en").optional()})).parse(r.data).map(x=>({id:x.id,revision:x.workspace_revision,expiryDate:x.expiry_date,label:x.kind??human(input.kind)})));
}
export async function timeRead(db:Db,a:Access,input:Input<"time">){
  if(!a.allows("hr.attendance.view"))throw denied();
  const from=(input.page-1)*25;
  if(input.kind==="punch"||input.kind==="overtime"){
    const raw=await rpc(db,"mobile_hr_time_history",{p_employee:input.employeeId,p_kind:input.kind,p_page:input.page});
    return pageRows(z.array(z.object({id,label:z.string(),date:z.string(),detail:nullable,status:nullable,revision:dbRevision.nullable()})).max(26).parse(raw));
  }
  if(input.kind==="shift"){
    const r=await db.from("employee_shift_assignments").select("id,effective_from,effective_to,weekly_off_day,shift:work_shifts!employee_shift_assignments_work_shift_id_fkey(shift_name)").eq("employee_id",input.employeeId).is("deleted_at",null).order("effective_from",{ascending:false}).order("id",{ascending:false}).range(from,from+25);
    if(r.error)throw unavailable();
    return pageRows(z.array(z.object({id,effective_from:z.string(),effective_to:nullable,weekly_off_day:nullable,shift:relation("shift_name")})).parse(r.data).map(x=>({id:x.id,label:x.shift??"Shift assignment",date:x.effective_from,detail:[x.effective_to&&"Until "+x.effective_to,x.weekly_off_day&&"Weekly off: "+x.weekly_off_day].filter(Boolean).join(" · ")||null,status:null,revision:null})));
  }
  const r=await db.from("employee_attendance_daily_summary").select("id,workspace_revision,attendance_date,attendance_type,approval_status,first_in_at,last_out_at,total_hours").eq("employee_id",input.employeeId).order("attendance_date",{ascending:false}).order("id",{ascending:false}).range(from,from+25);
  if(r.error)throw unavailable();
  return pageRows(z.array(z.object({id,workspace_revision:dbRevision,attendance_date:z.string(),attendance_type:z.string(),approval_status:z.string(),first_in_at:nullable,last_out_at:nullable,total_hours:z.number().nullable()})).parse(r.data).map(x=>({id:x.id,label:human(x.attendance_type),date:x.attendance_date,detail:[x.first_in_at&&"In "+dubaiTimestamp(x.first_in_at),x.last_out_at&&"Out "+dubaiTimestamp(x.last_out_at),x.total_hours!=null?x.total_hours+" h":null].filter(Boolean).join(" · ")||null,status:x.approval_status,revision:x.workspace_revision})));
}

import { z } from "zod";
import { literalContains } from "@/lib/reads/search";
import { type AuthContext } from "@/lib/rbac/check";
import { EMPLOYEE_PUBLIC_FIELDS } from "@/lib/hr/employee-public-fields";
import { hrSubjectPermission } from "@/server/reads/hr-subject-access";
import { rpc, readProfileAccess, type Db, pageRows } from "./hr-reads";
import { subjectPhoto } from "./hr-photo";
import { id } from "./hr-contracts";
import { checkedRows, fields, pageOf, requireDomain, rid, related } from "./hr-page";
import { denied, unavailable } from "./hr-shapes";
import type { ExpandedInput } from "./hr-services-contracts";
const nullable=z.string().nullable();
const directoryDetails = z.array(z.strictObject({
  employeeId: id, employeeCode: z.string(), name: z.string(), status: z.string(), company: nullable, branch: nullable,
  department: nullable, designation: nullable, site: nullable, phone: nullable,
})).max(25);
export async function directory(db:Db,i:ExpandedInput<"directoryChoices"|"directory">,signal?:AbortSignal) {
  signal?.throwIfAborted();
  if(i.op==="directoryChoices"){
    const rows=z.array(z.strictObject({value:z.string(),label:z.string()})).parse(await rpc(db,"mobile_hr_v5_directory_choices",{
      p_kind:i.kind,p_company:i.companyId,p_branch:i.branchId,p_search:i.search,p_after:i.after},false,signal));
    if(i.kind==="status")return {rows,more:false,nextAfterId:null};
    const p=pageRows(rows);return {...p,nextAfterId:p.more?Number(p.rows.at(-1)!.value):null};
  }
  let q=db.from("employees").select("id,photo_dms_document_id").is("deleted_at",null);
  for(const [column,value] of Object.entries({owner_company_id:i.companyId,branch_id:i.branchId,department_id:i.departmentId,designation_id:i.designationId,primary_work_site_id:i.siteId,employee_status:i.status}))
    if(value!==null)q=q.eq(column,value);
  if(i.search){const term=literalContains(i.search);q=q.or(`full_name_en.ilike.${term},employee_code.ilike.${term}`);}
  const start=(i.page-1)*25;
  const query=q.order("employee_code").order("id").range(start,start+25);
  const result=await (signal ? query.abortSignal(signal) : query);
  signal?.throwIfAborted();
  const all=checkedRows(result);
  const p = pageRows(all);
  const employeeIds = p.rows.map(row => rid(row));
  if (!employeeIds.length) return pageOf(null, i.page, []);

  const details = directoryDetails.safeParse(await rpc(db, "mobile_hr_v5_directory_details", { p_employees: employeeIds }, false, signal));
  if (!details.success || details.data.length !== employeeIds.length ||
      details.data.some((row, index) => row.employeeId !== employeeIds[index])) throw unavailable();
  // Keep each authorized photo check independent. The saved pointer only
  // avoids a lookup for empty slots and is never published in the response.
  const photos = await Promise.all(p.rows.map(async (row, index) => {
    if (row.photo_dms_document_id == null) return { value: null, incomplete: false };
    try {
      return { value: await subjectPhoto(employeeIds[index], null, db, signal), incomplete: false };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      return { value: null, incomplete: true };
    }
  }));
  signal?.throwIfAborted();
  const rows = details.data.map((row, index) => ({ ...row, photo: photos[index].value }));
  return { ...pageOf(null, i.page, rows), more: p.more,
    ...(photos.some(photo => photo.incomplete) && { photoReadIncomplete: true }) };
}
export async function employeeRecord(db:Db,ctx:AuthContext,employeeId:number) {
  await requireDomain(db,employeeId,"hr.employees.view","hr.employee_profile.view");
  const [{record:p,capabilities},photo,record,medicalAllowed]=await Promise.all([readProfileAccess(db,ctx,employeeId),subjectPhoto(employeeId),
    db.from("employees").select(EMPLOYEE_PUBLIC_FIELDS+",nationality:countries(name_en),category:hr_employee_categories(name_en),employment_type:hr_employment_types(name_en),supervisor:supervisor_id(full_name_en),sponsor:owner_companies!employees_sponsor_company_id_fkey(legal_name_en),mohre:hr_mohre_establishments!employees_mohre_establishment_id_fkey(establishment_name),relationship:hr_relationship_types!employees_emergency_contact_relationship_type_id_fkey(name_en)").eq("id",employeeId).is("deleted_at",null).maybeSingle(),
    hrSubjectPermission(db,employeeId,"hr.medical.view")]);
  if(record.error)throw unavailable();
  if(!p||!record.data)throw denied();
  const raw=z.record(z.string(),z.unknown()).parse(record.data);
  const r={...raw,nationality:related(raw,"nationality","name_en"),category:related(raw,"category","name_en"),employment_type:related(raw,"employment_type","name_en"),supervisor:related(raw,"supervisor","full_name_en"),sponsor:related(raw,"sponsor","legal_name_en"),mohre:related(raw,"mohre","establishment_name"),relationship:related(raw,"relationship","name_en")};
  const blood=medicalAllowed?nullable.parse(await rpc(db,"f03_employee_blood_group",{employee_id:employeeId})):null;
  const folder=await db.rpc("mobile_dms_document",{p_action:"employee_folder_access",p_data:{employeeId}});
  const contact=(key:string,label:string,value:string|null,dialable=false)=>({key,label,value,dialable});
  return {employeeId,employeeCode:p.employee_code,name:p.full_name_en,company:p.owner_company,branch:p.branch,revision:p.workspace_revision,own:p.own,photo,capabilities:{...capabilities,linkedDocuments:!folder.error&&folder.data===true},
    sections:{personal:fields(r,["known_name","full_name_ar","gender","nationality","date_of_birth","marital_status","uae_address","home_country_address"]),
      employment:[...fields(p,["owner_company","branch","department","designation","manager","site","employee_status"]),
        ...fields(r,["category","employment_type","joining_date","actual_joining_date","supervisor","sponsor","mohre","probation_start_date","probation_end_date","contract_type","contract_start_date","contract_end_date","notice_period_days","inactive_date","inactive_reason"])],
      contacts:p.contacts?[contact("mobile_number","Mobile number",p.contacts.mobile_number,true),contact("personal_email","Personal email",p.contacts.personal_email)]:[],
      emergency:p.contacts?[contact("emergency_contact_name","Emergency contact",p.contacts.emergency_contact_name),contact("emergency_contact_mobile","Emergency mobile",p.contacts.emergency_contact_mobile,true),
        contact("emergency_contact_relationship_type_id","Relationship",r.relationship)]:[],
      medical:medicalAllowed?[{key:"blood_group",label:"Blood group",value:blood}]:null}};
}

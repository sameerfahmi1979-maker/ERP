/** Internal WPS-readiness review only; never a bank file or payment receipt. */
import type {ReportFetcher, ReportDataResult} from "@/lib/report-center/types";
import type {ReportReadClient} from "@/lib/report-center/scoped-read-client";
import {z} from "zod";
import {createHash} from "node:crypto";
import {checkWpsReadiness} from "@/lib/hr/payroll/wps-readiness";
import {payrollToday,payrollEmploymentEligible,salaryAsOf,salaryDate,salaryDisplayNumber} from "@/lib/hr/payroll/salary-as-of";

const id=z.number().int().positive().refine(Number.isSafeInteger);
const revision=z.union([id,z.string().regex(/^[1-9]\d{0,18}$/).refine(v=>BigInt(v)<=BigInt('9223372036854775807'))]).transform(String);
const company=z.object({legal_name_en:z.string()}).nullable();
const employee=z.object({id,workspace_revision:revision,employee_code:z.string(),full_name_en:z.string(),employee_status:z.string(),joining_date:z.string(),owner_company_id:id,owner_company:company});
const profile=z.object({employee_id:id,workspace_revision:revision,effective_date:z.string(),currency:z.string(),payroll_status:z.string()});
const wps=z.object({employee_id:id,workspace_revision:revision,wps_applicable:z.boolean(),wps_status:z.string(),salary_payment_method:z.string(),labour_card_number:z.string().nullable(),mohre_person_code:z.string().nullable(),bank_id:id.nullable(),iban:z.string().nullable(),account_number:z.string().nullable(),exchange_house:z.string().nullable(),bank:z.object({bank_name_en:z.string()}).nullable()});
const component=z.object({id,employee_id:id,workspace_revision:revision,component_type_id:id,amount:z.union([z.number().finite(),z.string()]).nullable(),effective_from:z.string(),effective_to:z.string().nullable(),is_active:z.boolean(),deleted_at:z.string().nullable(),component_type:z.object({component_kind:z.string(),is_basic:z.boolean(),workspace_revision:revision}).nullable()});
const effect=z.object({id,employee_id:id,revision_id:id,effective_date:z.string(),new_basic:z.union([z.number().finite(),z.string()]),currency:z.string()});
const hold=z.object({id,employee_id:id,workspace_revision:revision,is_active:z.boolean()});
function verified<T extends z.ZodType>(result:{data:unknown;error:unknown},schema:T) {
 if(result.error)throw Error("Complete payroll review sources unavailable");
 const parsed=z.array(schema).safeParse(result.data);
 if(!parsed.success)throw Error("Complete payroll review sources unavailable");
 return parsed.data;
}
function unique<T extends {employee_id:number}>(rows:T[]) {
 const map=new Map<number,T>();for(const row of rows){if(map.has(row.employee_id))throw Error("Ambiguous payroll review source");map.set(row.employee_id,row);}return map;
}
export const wpsReadinessFetcher:ReportFetcher={
 reportCode:"HR_WPS_READINESS",
 async fetch(filters:Record<string,unknown>,_permissions:string[],db:ReportReadClient):Promise<ReportDataResult>{
  const collect=async()=>{
  let query=db.from("employees").select("id,workspace_revision,employee_code,full_name_en,employee_status,joining_date,owner_company_id,owner_company:owner_companies!employees_owner_company_id_fkey(legal_name_en)").is("deleted_at",null).eq("employee_status","active").order("id");
  if(filters.owner_company_id)query=query.eq("owner_company_id",Number(filters.owner_company_id));
  if(filters.department_id)query=query.eq("department_id",Number(filters.department_id));
  // The existing scoped facade drains every exact-count page. No first-N cap.
  const employees=verified(await query,employee),ids=employees.map(e=>e.id),subjects=new Set(ids);
  if(subjects.size!==ids.length)throw Error("Duplicate review subjects");
  if(!ids.length)return{employees,profiles:[],wpsRows:[],components:[],effects:[],holds:[]};
  const [p,w,c,a,h]=await Promise.all([
   db.from("employee_payroll_profiles").select("employee_id,workspace_revision,effective_date,currency,payroll_status").in("employee_id",ids).is("deleted_at",null).order("employee_id"),
   db.from("employee_wps_profiles").select("employee_id,workspace_revision,wps_applicable,wps_status,salary_payment_method,labour_card_number,mohre_person_code,bank_id,iban,account_number,exchange_house,bank:banks(bank_name_en)").in("employee_id",ids).is("deleted_at",null).order("employee_id"),
   db.from("employee_salary_components").select("id,employee_id,workspace_revision,component_type_id,amount,effective_from,effective_to,is_active,deleted_at,component_type:hr_salary_component_types!employee_salary_components_component_type_id_fkey(component_kind,is_basic,workspace_revision)").in("employee_id",ids).is("deleted_at",null).order("id"),
   db.from("employee_salary_revision_effects").select("id,employee_id,revision_id,effective_date,new_basic,currency").in("employee_id",ids).order("id"),
   db.from("employee_payroll_holds").select("id,employee_id,workspace_revision,is_active").in("employee_id",ids).eq("is_active",true).is("deleted_at",null).order("id")
  ]);
  const profiles=verified(p,profile),wpsRows=verified(w,wps),components=verified(c,component),effects=verified(a,effect),holds=verified(h,hold);
  for(const rows of [profiles,wpsRows,components,effects,holds])if(rows.some(row=>!subjects.has(row.employee_id)))throw Error("Payroll review subject mismatch");
  unique(profiles);unique(wpsRows);
  for(const rows of [components,effects,holds])if(new Set(rows.map(row=>row.id)).size!==rows.length)throw Error("Duplicate payroll review facts");
  return{employees,profiles,wpsRows,components,effects,holds};
  };
  // Fixed two-pass reconciliation, never retries until a convenient result.
  // Versions detect edit-and-revert; full values detect changed selection and
  // reference labels. This is a bounded review snapshot, not a payment lock.
  const first=await collect(),confirmed=await collect(),source=JSON.stringify(first);
  if(source!==JSON.stringify(confirmed))throw Error("Payroll review sources changed during collection. Run it again.");
  const {employees,profiles,wpsRows,components,effects,holds}=confirmed;
  const columns=["employee_code","employee_name","company","bank_name","wps_applicable","wps_status","payment_method","missing_fields","hold_status","readiness_status"];
  const profileMap=unique(profiles),wpsMap=unique(wpsRows),holdSet=new Set(holds.map(row=>row.employee_id)),asOf=payrollToday();
  // Group once; never issue a salary query per employee.
  const componentsByEmployee=Map.groupBy(components,row=>row.employee_id),effectsByEmployee=Map.groupBy(effects,row=>row.employee_id);
  const rows=employees.map(emp=>{
   const p=profileMap.get(emp.id),w=wpsMap.get(emp.id)??null,hasHold=holdSet.has(emp.id);
   let readiness;
   try{
    if(!p||salaryDate(p.effective_date)>asOf)throw Error("Salary profile unavailable");
    const salary=salaryAsOf(componentsByEmployee.get(emp.id)??[],asOf,p.currency,effectsByEmployee.get(emp.id)??[]);
    readiness=checkWpsReadiness({wpsProfile:w,hasActivePayrollHold:hasHold,hasSalaryComponents:salary.activeCount>0,grossSalary:salaryDisplayNumber(salary.gross),payrollStatus:p.payroll_status,employmentEligible:payrollEmploymentEligible(emp,asOf)});
   }catch{readiness={status:"incomplete",missingRequirements:["Salary facts require review"]};}
   return{employee_code:emp.employee_code,employee_name:emp.full_name_en,company:emp.owner_company?.legal_name_en??"",bank_name:w?.bank?.bank_name_en??"",wps_applicable:w?.wps_applicable?"Yes":"No",wps_status:w?.wps_status??"not_enrolled",payment_method:w?.salary_payment_method??"",missing_fields:readiness.missingRequirements.join(", "),hold_status:hasHold?"On Hold":"None",readiness_status:readiness.status,owner_company_id:emp.owner_company_id};
  }).filter(row=>!filters.readiness_status||row.readiness_status===filters.readiness_status);
  return{columns,rows,meta:{total:rows.length,asOf,reviewOnly:true,sourceFingerprint:createHash('sha256').update(source).digest('hex'),ownerCompanyIds:[...new Set(rows.map(row=>row.owner_company_id))]}};
 }
};



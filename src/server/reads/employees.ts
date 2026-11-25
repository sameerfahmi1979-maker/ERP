import "server-only";
import {getReadAuthContext} from "./read-context";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { type AuthContext } from "@/lib/rbac/check";
import { canBrowseEmployees } from "@/lib/rbac/employee-access";
import { literalContains } from "@/lib/reads/search";
import type { ActionResult, EmployeeListRow } from "@/server/actions/hr/employees";

export const employeeReadSchema = z.object({
  search: z.string().max(200).optional(),
  ownerCompanyId: z.number().int().positive().optional(), branchId: z.number().int().positive().optional(),
  departmentId: z.number().int().positive().optional(), designationId: z.number().int().positive().optional(),
  employeeCategoryId: z.number().int().positive().optional(), employmentTypeId: z.number().int().positive().optional(),
  employeeStatus: z.string().max(40).optional(), nationalityId: z.number().int().positive().optional(),
  quality: z.enum(['legacy-category','missing-emergency']).optional(),
  primaryWorkSiteId: z.number().int().positive().optional(),
  page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25),
  sortKey: z.enum(["employee_code","full_name_en","nationality","department","designation","employee_status","company"]).default("employee_code"),
  sortDir: z.enum(["asc","desc"]).default("asc"),
}).strict();
export type EmployeeReadParams = z.input<typeof employeeReadSchema>;
export type EmployeeRegisterRow = Pick<EmployeeListRow, "id" | "employee_code" | "full_name_en" | "full_name_ar" | "employee_status" | "workspace_revision"> & {
  nationality: { name_en: string } | null;
  owner_company: { company_code: string } | null;
  department: { department_name_en: string } | null;
  designation: { designation_name_en: string } | null;
};
export type EmployeeReadPage = {rows:EmployeeRegisterRow[];totalCount:number;page:number;pageSize:number;updatedAt:number};
const orderColumns = {employee_code:"employee_code",full_name_en:"full_name_en",nationality:"nationality(name_en)",department:"department(department_name_en)",designation:"designation(designation_name_en)",employee_status:"employee_status",company:"owner_company(company_code)"};
const fields = "id,employee_code,full_name_en,full_name_ar,employee_status,workspace_revision";
const joins = "nationality:countries(name_en),owner_company:owner_companies!employees_owner_company_id_fkey(company_code),department:departments(department_name_en),designation:designations(designation_name_en)";

/** Context may only come from a current server request; never from client parameters or a shared cache. */
export async function readEmployees(params: EmployeeReadParams = {}, context?: AuthContext): Promise<ActionResult<EmployeeReadPage>> {
  try {
    const ctx=context ?? await getReadAuthContext();
    if(!canBrowseEmployees(ctx)) return {success:false,error:"Permission denied"};
    const parsed=employeeReadSchema.safeParse(params);
    if(!parsed.success) return {success:false,error:"Invalid employee search or page"};
    const p=parsed.data;
    const db=await createClient();
    let query=db.from("employees").select(`${fields},${joins}`,{count:"exact"}).is("deleted_at",null);
    const searchFilter=p.search?.trim()? ["employee_code","full_name_en","full_name_ar","known_name","mobile_number","personal_email"].map(c=>`${c}.ilike.${literalContains(p.search!.trim())}`).join(","):null;
    const qualityFilter=p.quality==='missing-emergency'?'emergency_contact_name.is.null,emergency_contact_name.eq."",emergency_contact_mobile.is.null,emergency_contact_mobile.eq.""':null;
    // One explicit AND tree avoids ambiguity when both filters contain ORs.
    if(searchFilter&&qualityFilter)query=query.or(`and(or(${searchFilter}),or(${qualityFilter}))`);
    else if(searchFilter||qualityFilter)query=query.or((searchFilter||qualityFilter)!);
    const filters={owner_company_id:p.ownerCompanyId,branch_id:p.branchId,department_id:p.departmentId,designation_id:p.designationId,employee_category_id:p.employeeCategoryId,employment_type_id:p.employmentTypeId,employee_status:p.employeeStatus,nationality_id:p.nationalityId,primary_work_site_id:p.primaryWorkSiteId};
    for(const [column,value] of Object.entries(filters))if(value!==undefined)query=query.eq(column,value);
    if(p.quality==='legacy-category')query=query.is('employee_category_id',null);
    const from=(p.page-1)*p.pageSize;
    const {data,error,count}=await query.order(orderColumns[p.sortKey],{ascending:p.sortDir==="asc",nullsFirst:false}).order("id",{ascending:true}).range(from,from+p.pageSize-1);
    if(error || count===null || !Number.isSafeInteger(count) || count<0 || !Array.isArray(data) || data.length!==Math.min(p.pageSize,Math.max(0,count-from))) return {success:false,error:"Employees could not be loaded. Please retry."};
    return {success:true,data:{rows:data as unknown as EmployeeRegisterRow[],totalCount:count,page:p.page,pageSize:p.pageSize,updatedAt:Date.now()}};
  } catch {return {success:false,error:"Employees could not be loaded. Please retry."};}
}

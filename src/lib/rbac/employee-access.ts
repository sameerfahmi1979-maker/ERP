import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAccountActive, canUseApplication, isGlobalAdmin, type AuthContext } from "./check";

export type EmployeeSubject = { id: number; owner_company_id: number; branch_id: number | null; reporting_manager_id: number | null };
export function hasEmployeePermission(ctx: AuthContext, subject: EmployeeSubject, linkedEmployeeId: number | null, code: string): boolean {
  if (!canUseApplication(ctx)) return false;
  if (isGlobalAdmin(ctx)) return true;
  return !!ctx.roleAssignments?.some(a =>
    ((a.ownerCompanyId === null && a.branchId === null) || (a.ownerCompanyId === subject.owner_company_id && (a.branchId === null || a.branchId === subject.branch_id))) &&
    (a.permissionCodes.includes(code) ||
      (linkedEmployeeId === subject.id && a.permissionCodes.includes(code + ".self")) ||
      (linkedEmployeeId !== null && linkedEmployeeId !== subject.id && linkedEmployeeId === subject.reporting_manager_id && a.permissionCodes.includes(code + ".team"))));
}
export function canBrowseEmployees(ctx: AuthContext): boolean {
  return canUseApplication(ctx) && (isGlobalAdmin(ctx) || ["hr.employees.view", "hr.employees.view.self", "hr.employees.view.team", "hr.employee_profile.view"].some(c => ctx.permissionCodes.includes(c)));
}
export async function getLinkedEmployeeId(ctx: AuthContext): Promise<number | null> {
  assertAccountActive(ctx);
  const db = createAdminClient();
  const { data, error } = await db.from("erp_user_employee_links").select("employee_id").eq("user_profile_id", ctx.profile!.id).maybeSingle();
  if (error) throw new Error("Employee identity could not be verified");
  if (!data) return null;
  const employee = await db.from("employees").select("id,owner_company_id,branch_id").eq("id", data.employee_id).is("deleted_at", null).maybeSingle();
  if (employee.error) throw new Error("Employee identity could not be verified");
  // A transfer invalidates the relationship until an administrator reviews it.
  return employee.data && employee.data.owner_company_id === ctx.profile!.owner_company_id &&
    employee.data.branch_id === ctx.profile!.branch_id ? employee.data.id : null;
}
export async function getEmployeeAccess(ctx: AuthContext, employeeId: number) {
  assertAccountActive(ctx);
  if (!Number.isSafeInteger(employeeId) || employeeId <= 0) throw new Error("Invalid employee");
  const [{ data, error }, linked] = await Promise.all([
    createAdminClient().from("employees").select("id,owner_company_id,branch_id,reporting_manager_id").eq("id",employeeId).is("deleted_at",null).maybeSingle(), getLinkedEmployeeId(ctx),
  ]);
  if (error || !data) throw new Error("Employee unavailable");
  const subject = data as EmployeeSubject;
  const allows = (code: string) => hasEmployeePermission(ctx,subject,linked,code);
  if (!allows("hr.employees.view") && !allows("hr.employee_profile.view")) throw new Error("Employee unavailable or access denied");
  return { subject, allows, scopedContext: {
    ...ctx, permissionCodes: Array.from(new Set(ctx.permissionCodes.map(c => c.replace(/\.(self|team)$/, "")))).filter(allows),
  } };
}

/** Report identity selection is bounded and uses only minimal scope fields, never salary/medical data. */
export async function getAuthorizedReportEmployees(ctx: AuthContext, required: string[] = []): Promise<{ ids: number[]; subjects: EmployeeSubject[] }> {
  assertAccountActive(ctx);
  const linked=await getLinkedEmployeeId(ctx);
  const clauses: string[]=[];
  let global=isGlobalAdmin(ctx);
  for(const a of ctx.roleAssignments ?? []) {
    for(const base of ["hr.employees.view","hr.employee_profile.view"]) {
      const relations: (string|null)[] = a.permissionCodes.includes(base) ? [null] : [
        ...(linked !== null && a.permissionCodes.includes(base+".self") ? [`id.eq.${linked}`] : []),
        ...(linked !== null && a.permissionCodes.includes(base+".team") ? [`reporting_manager_id.eq.${linked}`] : []),
      ];
      for (const relation of relations) {
        const parts=[...(a.ownerCompanyId===null?[]:[`owner_company_id.eq.${a.ownerCompanyId}`]),...(a.branchId===null?[]:[`branch_id.eq.${a.branchId}`]),...(relation?[relation]:[])];
        if(parts.length===0) global=true; else clauses.push(parts.length===1?parts[0]:`and(${parts.join(",")})`);
      }
    }
  }
  if(!global && clauses.length===0) return {ids:[],subjects:[]};
  let query=createAdminClient().from("employees").select("id,owner_company_id,branch_id,reporting_manager_id",{count:"exact"}).is("deleted_at",null);
  if(!global) query=query.or(clauses.join(","));
  const {data,error,count}=await query.order("id").limit(1000);
  if(error || count===null) throw new Error("Report access scope could not be verified");
  if(count>1000) throw new Error("This report exceeds the current 1,000-employee access-scope limit. Ask an administrator to use a narrower role scope; no partial report was generated.");
  const subjects=(data as EmployeeSubject[]).filter(e=>
    (hasEmployeePermission(ctx,e,linked,"hr.employees.view")||hasEmployeePermission(ctx,e,linked,"hr.employee_profile.view")) &&
    required.every(code=>hasEmployeePermission(ctx,e,linked,code)));
  return {ids:subjects.map(e=>e.id),subjects};
}

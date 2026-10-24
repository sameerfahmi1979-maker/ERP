import "server-only";
import {readSortPriority} from "@/lib/reads/read-sorting";
import {getAuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalContains, literalLike} from "@/lib/reads/search";
import {operationsRealDate} from "@/lib/reads/hr-operations-schema";
import {checkWpsReadiness} from "@/lib/hr/payroll/wps-readiness";
import {payrollToday,payrollEmploymentEligible,salaryDisplayNumber} from "@/lib/hr/payroll/salary-as-of";
import {readSalarySnapshot} from "@/server/reads/salary-snapshot";
import {redactWpsProfile} from "@/lib/hr/payroll/redaction";
import {z} from "zod";
import {PAYROLL_RECORD_FIELDS, payrollRecordCriteriaSchema, payrollRecordPageSchema, payrollRecordRows, payrollPointCriteriaSchema, payrollProfileSchema, payrollWpsRawSchema, payrollPointSchemas, type PayrollRecordKind} from "@/lib/reads/hr-payroll-records-schema";
import {payrollChoiceCriteriaSchema, payrollChoicePageSchema, payrollComponentSchema, hasPayrollReadCapability} from "@/lib/reads/hr-payroll-records-schema";

const tables = {"salary-components": "employee_salary_components", "salary-revisions": "employee_salary_revisions", holds: "employee_payroll_holds"} as const;
const relations = {
  "salary-components": "component_type:hr_salary_component_types!employee_salary_components_component_type_id_fkey(id,code,name_en,component_kind,is_wps_component)",
  "salary-revisions": "approver:user_profiles!employee_salary_revisions_approved_by_fkey(display_name),creator:user_profiles!employee_salary_revisions_created_by_fkey(display_name),review:employee_salary_revision_reviews!employee_salary_revision_reviews_revision_id_fkey(revision_id,employee_id,status,workspace_revision,currency)",
  holds: "releaser:user_profiles!employee_payroll_holds_released_by_fkey(display_name)",
};
function projection(kind: PayrollRecordKind, full = false) {
  const schema = kind === "salary-components" && full ? payrollComponentSchema : payrollRecordRows[kind];
  return Object.keys(schema.shape).filter(k => !["component_type", "approver", "creator", "releaser", "review"].includes(k)).join(",") + "," + relations[kind];
}
async function subject(employeeId: number, banking = false) {
  const ctx = await getAuthContext();
  if (!hasPayrollReadCapability(ctx, "hr.payroll.view") || banking && !hasPayrollReadCapability(ctx, "hr.banking.view")) return null;
  const db = await createClient();
  // A global capability is not a row grant. An invisible payroll row must not
  // be interpreted as a missing profile or an authorized zero salary.
  const permissions = banking ? ["hr.payroll.view", "hr.banking.view"] : ["hr.payroll.view"];
  const grants = await Promise.all(permissions.map(permission_code => db.rpc("f03_has_employee_permission", {employee_id: employeeId, permission_code})));
  if (grants.some(g => g.error || typeof g.data !== "boolean")) throw Error("Payroll authorization unavailable");
  if (!grants.every(g => g.data === true)) return null;
  // Payroll policies also require visibility of the employee itself. A payroll
  // assignment without this independent scope must not yield an authorized zero.
  const employee = await db.from("employees").select("id").eq("id", employeeId).is("deleted_at", null).maybeSingle();
  if (employee.error) throw Error("Payroll employee authorization unavailable");
  if (!employee.data || employee.data.id !== employeeId) return null;
  return db;
}
export async function readPayrollRecords(input: unknown) {
  const parsed = payrollRecordCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid payroll record criteria"};
  try {
    const p = parsed.data, db = await subject(p.employeeId);
    if (!db) return {success: false, error: "Permission denied"};
    const fields = PAYROLL_RECORD_FIELDS[p.kind];
    let columns = projection(p.kind);
    if (p.kind === "salary-components" && p.columnFilters.component_type_name_en) columns = columns.replace("!employee_salary_components_component_type_id_fkey(", "!employee_salary_components_component_type_id_fkey!inner(");
    if (p.kind === "salary-components" && p.search) columns += ",search_type:hr_salary_component_types!employee_salary_components_component_type_id_fkey(id)";
    const query = (head = false) => {
      const q = db.from(tables[p.kind]).select(columns, {count: "exact", head}).eq("employee_id", p.employeeId);
      if (p.kind !== "salary-revisions") q.is("deleted_at", null);
      if (p.search) {
        const clauses: string[] = [];
        for (const f of fields) {
          if (f.id === "component_type_name_en") continue;
          if (f.type === "text") clauses.push(`${f.id}.ilike.${literalContains(p.search)}`);
          else if (f.type === "date" && operationsRealDate(p.search)) clauses.push(`${f.id}.eq.${p.search}`);
          else if (f.id === "is_active" && /^(true|false)$/.test(p.search)) clauses.push(`${f.id}.eq.${p.search}`);
        }
        if (p.kind !== "salary-revisions") clauses.push(`notes.ilike.${literalContains(p.search)}`);
        if (p.kind === "salary-components") {
          q.or(`name_en.ilike.${literalContains(p.search)},name_ar.ilike.${literalContains(p.search)},code.ilike.${literalContains(p.search)}`, {referencedTable: "search_type"});
          clauses.push("search_type.not.is.null");
        }
        q.or(clauses.join(","));
      }
      for (const f of fields) {
        const value = p.columnFilters[f.id]; if (!value) continue;
        if (f.id === "component_type_name_en") q.or(`name_en.ilike.${literalContains(value)},name_ar.ilike.${literalContains(value)},code.ilike.${literalContains(value)}`, {referencedTable: "component_type"});
        else if (f.id === "is_active") q.eq(f.id, value === "true");
        else if (f.type === "text") q.ilike(f.id, literalLike(value));
        else q.eq(f.id, value);
      }
      if (!head) {
        // Preserve the old default active-first ordering. An explicit user sort
        // orders the whole result by that field, never by a hidden first key.
        const priority = readSortPriority(p);
        if (p.kind === "salary-components" && priority[0].id === "original") q.order("is_active", {ascending: false}).order("effective_from", {ascending: false});
        else for (const sort of priority) q.order(sort.id === "component_type_name_en" ? "component_type(name_en)" : sort.id, {ascending: !sort.desc, nullsFirst: false});
        q.order("id", {ascending: true});
      }
      return q;
    };
    const from = (p.page - 1) * p.pageSize;
    const [result, activeHolds] = await Promise.all([
      query().range(from, from + p.pageSize - 1),
      p.kind === "holds" ? db.from("employee_payroll_holds").select("id", {count: "exact", head: true}).eq("employee_id", p.employeeId).eq("is_active", true).is("deleted_at", null) : Promise.resolve(null),
    ]);
    // Preserve the employee-wide Active badge independently of the current
    // search, filters and page. A failed count is not a zero-hold result.
    if (activeHolds?.error) throw Error("Payroll active hold count unavailable");
    let rows: unknown = result.data, count = result.count, error = result.error;
    if (from > 0 && result.status === 416 && result.error?.code === "PGRST103") {
      const counted = await query(true);
      if (counted.error || counted.count === null || counted.count > from) throw Error("Unverified payroll range");
      rows = []; count = counted.count; error = null;
    }
    const safe = payrollRecordPageSchema.safeParse({kind: p.kind, employeeId: p.employeeId, page: p.page, pageSize: p.pageSize, rows, totalCount: count, ...(p.kind === "holds" ? {activeCount: activeHolds?.count} : {})});
    if (error || !safe.success) throw Error("Incomplete payroll records");
    return {success: true, data: safe.data};
  } catch {return {success: false, error: "Payroll records could not be completely loaded. Please retry."};}
}

async function totals(db: NonNullable<Awaited<ReturnType<typeof subject>>>, employeeId: number) {
  const snapshot = await readSalarySnapshot(db, employeeId);
  return {gross: salaryDisplayNumber(snapshot.gross), basic: salaryDisplayNumber(snapshot.basic), activeCount: snapshot.activeCount};
}
export async function readPayrollPoint(input: unknown) {
  const parsed = payrollPointCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid payroll detail criteria"};
  try {
    const p = parsed.data, db = await subject(p.employeeId, p.kind === "wps");
    if (!db) return {success: false, error: "Permission denied"};
    let data: unknown;
    if (p.kind === "salary-totals") data = await totals(db, p.employeeId);
    else if (p.kind === "component-detail") {
      const result = await db.from("employee_salary_components").select(projection("salary-components", true)).eq("id", p.recordId!).eq("employee_id", p.employeeId).is("deleted_at", null).maybeSingle();
      if (result.error || !result.data) throw Error("Payroll record unavailable"); data = result.data;
    } else if (p.kind === "profile") {
      const columns = Object.keys(payrollProfileSchema.shape).filter(k => k !== "payroll_group").join(",") + ",payroll_group:hr_payroll_groups!employee_payroll_profiles_payroll_group_id_fkey(id,name_en,pay_frequency)";
      const result = await db.from("employee_payroll_profiles").select(columns).eq("employee_id", p.employeeId).is("deleted_at", null).maybeSingle();
      if (result.error) throw Error("Payroll profile unavailable"); data = result.data;
    } else {
      const columns = Object.keys(payrollWpsRawSchema.shape).filter(k => !["bank", "mohre_establishment"].includes(k)).join(",") + ",bank:banks!employee_wps_profiles_bank_id_fkey(id,bank_name_en,bank_code),mohre_establishment:hr_mohre_establishments!employee_wps_profiles_mohre_establishment_id_fkey(id,establishment_name,establishment_number)";
      const [profile, holds, salary, employment] = await Promise.all([
        db.from("employee_wps_profiles").select(columns).eq("employee_id", p.employeeId).is("deleted_at", null).maybeSingle(),
        db.from("employee_payroll_holds").select("id", {count: "exact", head: true}).eq("employee_id", p.employeeId).eq("is_active", true).is("deleted_at", null),
        readSalarySnapshot(db, p.employeeId),
        db.from("employees").select("id,employee_status,joining_date").eq("id",p.employeeId).is("deleted_at",null).maybeSingle(),
      ]);
      if (profile.error || holds.error || typeof holds.count !== "number" || !Number.isSafeInteger(holds.count) || holds.count < 0) throw Error("Incomplete WPS readiness");
      if(employment.error)throw Error("Employment context unavailable");
      const current=z.object({id:z.literal(p.employeeId),employee_status:z.string(),joining_date:z.string()}).parse(employment.data);
      const raw = payrollWpsRawSchema.nullable().parse(profile.data);
      data = {profile: raw ? redactWpsProfile(raw, true) : null, readiness: checkWpsReadiness({wpsProfile: raw, hasActivePayrollHold: holds.count > 0, hasSalaryComponents: salary.activeCount > 0, grossSalary: salaryDisplayNumber(salary.gross), payrollStatus: salary.payrollStatus,employmentEligible:payrollEmploymentEligible(current,payrollToday())})};
    }
    const safe = payrollPointSchemas[p.kind].safeParse(data);
    if (!safe.success || safe.data && "employee_id" in safe.data && safe.data.employee_id !== p.employeeId || p.kind === "component-detail" && safe.data && "id" in safe.data && safe.data.id !== p.recordId) throw Error("Invalid payroll detail");
    if (safe.data && "profile" in safe.data && safe.data.profile && safe.data.profile.employee_id !== p.employeeId) throw Error("Invalid WPS employee");
    return {success: true, data: {kind: p.kind, employeeId: p.employeeId, value: safe.data}};
  } catch {return {success: false, error: "Payroll detail could not be completely loaded. Please retry."};}
}

export async function readPayrollChoices(input: unknown) {
  const parsed = payrollChoiceCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid payroll choice criteria"};
  try {
    const p = parsed.data, db = await subject(p.employeeId, p.kind === "mohre-establishments");
    if (!db) return {success: false, error: "Permission denied"};
    const mohre = p.kind === "mohre-establishments", table = mohre ? "hr_mohre_establishments" : p.kind === "payroll-groups" ? "hr_payroll_groups" : "hr_salary_component_types";
    const columns = mohre ? "id,code:establishment_number,name_en:establishment_name,status" : "id,code,name_en,name_ar,is_active";
    const make = (head = false) => {
      const q = db.from(table).select(columns, {count: "exact", head}).is("deleted_at", null);
      // Existing MOHRE helper includes inactive rows; preserve that eligibility.
      if (!mohre) q.eq("is_active", true);
      if (p.search) q.or((mohre ? ["establishment_name", "establishment_number"] : ["name_en", "name_ar", "code"]).map(k => `${k}.ilike.${literalContains(p.search)}`).join(","));
      if (!head) q.order(mohre ? "establishment_name" : p.kind === "salary-component-types" ? "sort_order" : "name_en").order("id");
      return q;
    };
    const from = (p.page - 1) * p.pageSize;
    const [page, selected] = await Promise.all([make().range(from, from + p.pageSize - 1), p.selectedId === null ? Promise.resolve(null) : db.from(table).select(columns).eq("id", p.selectedId).is("deleted_at", null).maybeSingle()]);
    let rows = page.data, count = page.count, error = page.error;
    if (from > 0 && page.status === 416 && page.error?.code === "PGRST103") {
      const counted = await make(true); if (counted.error || counted.count === null || counted.count > from) throw Error("Unverified choice range");
      rows = []; count = counted.count; error = null;
    }
    const normalize = (value: unknown) => {
      if (!mohre) return value;
      const item = z.object({id: z.number(), code: z.string(), name_en: z.string(), status: z.string()}).parse(value);
      return {id: item.id, code: item.code, name_en: item.name_en, name_ar: null, is_active: item.status === "active"};
    };
    const safe = payrollChoicePageSchema.safeParse({kind: p.kind, employeeId: p.employeeId, page: p.page, pageSize: p.pageSize, rows: rows?.map(normalize), totalCount: count, selected: selected?.data ? normalize(selected.data) : null});
    if (error || selected?.error || !safe.success || safe.data.selected && safe.data.selected.id !== p.selectedId) throw Error("Incomplete payroll choices");
    return {success: true, data: safe.data};
  } catch {return {success: false, error: "Payroll choices could not be completely loaded. Please retry."};}
}

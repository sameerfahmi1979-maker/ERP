import "server-only";
import {getAuthContext, canUseApplication, hasPermission, isGlobalAdmin, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalContains, literalLike} from "@/lib/reads/search";
import {HR_TIME_CONFIG, hrTimeCriteriaSchema, hrTimePageSchema, type HrTimePage} from "@/lib/reads/hr-time-schema";
const projections = {
  attendance: "id,employee_id,attendance_date,attendance_type,total_hours,overtime_hours,late_minutes,is_missing_punch,approval_status",
  shifts: "id,employee_id,effective_from,effective_to,weekly_off_day,overtime_eligible,attendance_required,work_calendar:work_calendars!employee_shift_assignments_work_calendar_id_fkey(calendar_name),work_shift:work_shifts!employee_shift_assignments_work_shift_id_fkey(shift_name)",
  leave: "id,employee_id,start_date,end_date,total_days,approval_status,employee:employees!employee_leave_requests_employee_id_fkey(employee_code,full_name_en,full_name_ar),leave_type:hr_leave_types!employee_leave_requests_leave_type_id_fkey(name_en,code)",
} as const;
const relationships = {employee_name: ["employee", "employees", "employee_leave_requests_employee_id_fkey", "full_name_en"], shift_name: ["work_shift", "work_shifts", "employee_shift_assignments_work_shift_id_fkey", "shift_name"], calendar_name: ["work_calendar", "work_calendars", "employee_shift_assignments_work_calendar_id_fkey", "calendar_name"], leave_type_name: ["leave_type", "hr_leave_types", "employee_leave_requests_leave_type_id_fkey", "name_en"]} as const;
/** Authenticated native RLS is authoritative. No service-role business reads,
 * growing employee-ID intermediary, public privileged RPC or cross-request auth cache. */
export async function readHrTime(input: unknown, context?: AuthContext): Promise<{success: boolean; data?: HrTimePage; updatedAt?: number; error?: string}> {
  const parsed = hrTimeCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid time search, filters or page"};
  try {
    const ctx = context ?? await getAuthContext();
    if (!canUseApplication(ctx)) return {success: false, error: "Permission denied"};
    // Native row policies also permit suffix self/team capability variants; an
    // application-wide capability union must not grant or narrow subject scope.
    const p = parsed.data, config = HR_TIME_CONFIG[p.kind], db = await createClient();
    if (p.kind === "leave" && !hasPermission(ctx, "hr.leave.view") && !hasPermission(ctx, "hr.leave.manage") && !hasPermission(ctx, "hr.admin") && !isGlobalAdmin(ctx)) return {success: false, error: "Permission denied"};
    // Preserve the legacy employee-readable intersection without collecting a
    // backend-capped intermediary ID array. Parent RLS and soft deletion apply.
    const requireVisibleEmployee = p.kind === "leave" && (!!p.employeeId || (!isGlobalAdmin(ctx) && !hasPermission(ctx, "hr.admin")));
    let projection: string = projections[p.kind];
    if (requireVisibleEmployee) projection = projection.replace("employee_leave_requests_employee_id_fkey(", "employee_leave_requests_employee_id_fkey!inner(");
    for (const [key, value] of Object.entries(p.columnFilters)) {
      if (value && key in relationships) {
        const r = relationships[key as keyof typeof relationships];
        projection = projection.replace(`${r[2]}(`, `${r[2]}!inner(`);
      }
    }
    if (p.search) {
      projection += `,search_employee:employees!${config.table}_employee_id_fkey(id)`;
      if (p.kind === "shifts") projection += ",search_shift:work_shifts!employee_shift_assignments_work_shift_id_fkey(id),search_calendar:work_calendars!employee_shift_assignments_work_calendar_id_fkey(id)";
      if (p.kind === "leave") projection += ",search_type:hr_leave_types!employee_leave_requests_leave_type_id_fkey(id)";
    }
    const query = (head = false) => {
      const q = db.from(config.table).select(projection, {count: "exact", head});
      if (requireVisibleEmployee) q.is("employee.deleted_at", null);
      if (p.kind !== "attendance") q.is("deleted_at", null);
      if (p.employeeId) q.eq("employee_id", p.employeeId);
      if (p.status) q.eq("approval_status", p.status);
      if (p.date) q.eq("attendance_date", p.date);
      if (p.dateFrom) q.gte(config.sort, p.dateFrom);
      if (p.dateTo) q.lte(p.kind === "leave" ? "end_date" : config.sort, p.dateTo);
      if (p.search) {
        const clauses = config.search.map(field => `${field}.ilike.${literalContains(p.search)}`);
        q.or(`full_name_en.ilike.${literalContains(p.search)},full_name_ar.ilike.${literalContains(p.search)},employee_code.ilike.${literalContains(p.search)}`, {referencedTable: "search_employee"});
        clauses.push("search_employee.not.is.null");
        if (/^\d+$/.test(p.search) && Number.isSafeInteger(Number(p.search)) && Number(p.search) > 0) clauses.push(`employee_id.eq.${Number(p.search)}`);
        if (p.kind === "shifts") {q.ilike("search_shift.shift_name", literalLike(p.search)); q.ilike("search_calendar.calendar_name", literalLike(p.search)); clauses.push("search_shift.not.is.null", "search_calendar.not.is.null");}
        if (p.kind === "leave") {q.or(`name_en.ilike.${literalContains(p.search)},name_ar.ilike.${literalContains(p.search)},code.ilike.${literalContains(p.search)}`, {referencedTable: "search_type"}); clauses.push("search_type.not.is.null");}
        q.or(clauses.join(","));
      }
      const fields: readonly {id: string; type: string}[] = config.fields;
      for (const f of fields) {
        const value = p.columnFilters[f.id];
        if (!value) continue;
        if (f.id in relationships) {
          const r = relationships[f.id as keyof typeof relationships];
          if (f.id === "employee_name") q.or(`full_name_en.ilike.${literalContains(value)},full_name_ar.ilike.${literalContains(value)}`, {referencedTable: "employee"});
          else q.ilike(`${r[0]}.${r[3]}`, literalLike(value));
        } else if (f.type === "text") q.ilike(f.id, literalLike(value));
        else if (f.type === "number") q.eq(f.id, Number(value));
        else if (f.type === "select") q.eq(f.id, ["true", "false"].includes(value) ? value === "true" : value);
        else q.eq(f.id, value);
      }
      if (head) return q;
      const relation = p.sortKey in relationships ? relationships[p.sortKey as keyof typeof relationships] : null;
      q.order(relation ? `${relation[0]}(${relation[3]})` : p.sortKey, {ascending: p.sortDir === "asc", nullsFirst: false});
      q.order("id", {ascending: true});
      return q;
    };
    const from = (p.page - 1) * p.pageSize, result = await query().range(from, from + p.pageSize - 1);
    let rows: unknown = result.data, count = result.count, error = result.error;
    if (from > 0 && result.status === 416 && result.error?.code === "PGRST103") {
      const counted = await query(true);
      if (counted.error || counted.count === null || !Number.isSafeInteger(counted.count) || counted.count < 0 || counted.count > from) throw Error("Unverified time range");
      rows = []; count = counted.count; error = null;
    }
    const safe = hrTimePageSchema.safeParse({kind: p.kind, rows, totalCount: count, page: p.page, pageSize: p.pageSize});
    if (error || !safe.success) throw Error("Incomplete time result");
    return {success: true, data: safe.data, updatedAt: Date.now()};
  } catch {return {success: false, error: "Time records could not be completely loaded. Please retry."};}
}

import "server-only";
import {getAuthContext, hasPermission, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalContains, literalLike} from "@/lib/reads/search";
import {HR_OPERATIONS_CONFIG, hrOperationsCriteriaSchema, hrOperationsPageSchema, type HrOperationsField, type HrOperationsPage} from "@/lib/reads/hr-operations-schema";
const projections = {
  assignments: "id,employee_id,assignment_type,assignment_status,effective_from,effective_to,employee:employees!employee_assignments_employee_id_fkey(id,full_name_en,full_name_ar,employee_code),company:owner_companies!employee_assignments_owner_company_id_fkey(id,name_en:legal_name_en),department:departments!employee_assignments_department_id_fkey(id,name_en:department_name_en),designation:designations!employee_assignments_designation_id_fkey(id,name_en:designation_name_en),site:work_sites!employee_assignments_work_site_id_fkey(id,name_en:site_name)",
  blocks: "id,employee_id,block_type,block_reason,block_status,effective_from,effective_to,created_at,employee:employees!employee_operational_blocks_employee_id_fkey(id,full_name_en,full_name_ar,employee_code)",
  readiness: "id,employee_id,readiness_status,checked_at,employee:employees!employee_site_readiness_employee_id_fkey(id,full_name_en,full_name_ar,employee_code),site:work_sites!employee_site_readiness_work_site_id_fkey(id,name_en:site_name)",
} as const;
const related = {employee_name: {alias: "employee", table: "employees", fk: "employee_id", column: "full_name_en"}, employee_code: {alias: "employee", table: "employees", fk: "employee_id", column: "employee_code"}, company_name: {alias: "company", table: "owner_companies", fk: "owner_company_id", column: "legal_name_en"}, department_name: {alias: "department", table: "departments", fk: "department_id", column: "department_name_en"}, designation_name: {alias: "designation", table: "designations", fk: "designation_id", column: "designation_name_en"}, site_name: {alias: "site", table: "work_sites", fk: "work_site_id", column: "site_name"}} as const;
/** Native business and related-row RLS remains authoritative; no privileged
 * content RPC, service-role business read or capped employee-ID intermediary. */
export async function readHrOperations(input: unknown, context?: AuthContext): Promise<{success: boolean; data?: HrOperationsPage; updatedAt?: number; error?: string}> {
  const parsed = hrOperationsCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid operational search, filters or page"};
  try {
    const ctx = context ?? await getAuthContext();
    if (!hasPermission(ctx, "hr.assignments.view")) return {success: false, error: "Permission denied"};
    const p = parsed.data, config = HR_OPERATIONS_CONFIG[p.kind], db = await createClient();
    let projection: string = projections[p.kind];
    for (const [key, value] of Object.entries(p.columnFilters)) {
      if (value && key in related) {const r = related[key as keyof typeof related]; projection = projection.replace(`${config.table}_${r.fk}_fkey(`, `${config.table}_${r.fk}_fkey!inner(`);}
    }
    if (p.search) {
      projection += `,search_employee:employees!${config.table}_employee_id_fkey(id)`;
      if (p.kind !== "blocks") projection += `,search_site:work_sites!${config.table}_work_site_id_fkey(id)`;
      if (p.kind === "assignments") projection += ",search_company:owner_companies!employee_assignments_owner_company_id_fkey(id),search_department:departments!employee_assignments_department_id_fkey(id),search_designation:designations!employee_assignments_designation_id_fkey(id)";
    }
    const query = (head = false) => {
      const q = db.from(config.table).select(projection, {count: "exact", head}).is("deleted_at", null);
      if (p.status) q.eq(config.status, p.status);
      if (p.employeeId) q.eq("employee_id", p.employeeId);
      if (p.workSiteId) q.eq("work_site_id", p.workSiteId);
      if (p.departmentId) q.eq("department_id", p.departmentId);
      if (p.designationId) q.eq("designation_id", p.designationId);
      if (p.search) {
        const clauses = config.search.map(field => `${field}.ilike.${literalContains(p.search)}`);
        q.or(`full_name_en.ilike.${literalContains(p.search)},full_name_ar.ilike.${literalContains(p.search)},employee_code.ilike.${literalContains(p.search)}`, {referencedTable: "search_employee"}); clauses.push("search_employee.not.is.null");
        if (/^\d+$/.test(p.search) && Number.isSafeInteger(Number(p.search)) && Number(p.search) > 0) clauses.push(`employee_id.eq.${Number(p.search)}`);
        if (p.kind !== "blocks") {q.ilike("search_site.site_name", literalLike(p.search)); clauses.push("search_site.not.is.null");}
        if (p.kind === "assignments") for (const [alias, column] of [["company", "legal_name_en"], ["department", "department_name_en"], ["designation", "designation_name_en"]]) {q.ilike(`search_${alias}.${column}`, literalLike(p.search)); clauses.push(`search_${alias}.not.is.null`);}
        q.or(clauses.join(","));
      }
      const fields: readonly HrOperationsField[] = config.fields;
      for (const f of fields) {
        const value = p.columnFilters[f.id]; if (!value) continue;
        if (f.id in related) {
          const r = related[f.id as keyof typeof related];
          if (f.id === "employee_name") q.or(`full_name_en.ilike.${literalContains(value)},full_name_ar.ilike.${literalContains(value)}`, {referencedTable: r.alias});
          else q.ilike(`${r.alias}.${r.column}`, literalLike(value));
        } else if (f.type === "text") q.ilike(f.id, literalLike(value));
        else if (f.type === "number") q.eq(f.id, Number(value));
        else if (f.id === "created_at" || f.id === "checked_at") {
          // Explicit UTC day filters; display formatting does not change dates.
          q.gte(f.id, `${value}T00:00:00Z`); q.lt(f.id, new Date(Date.parse(`${value}T00:00:00Z`) + 86400000).toISOString());
        } else q.eq(f.id, value);
      }
      if (head) return q;
      const r = p.sortKey in related ? related[p.sortKey as keyof typeof related] : null;
      // Top-level related ordering sees the selected subquery label alias.
      // Employee fields retain native names; other protected labels are name_en.
      const sortColumn = r ? r.alias === "employee" ? r.column : "name_en" : p.sortKey;
      q.order(r ? `${r.alias}(${sortColumn})` : sortColumn, {ascending: p.sortDir === "asc", nullsFirst: false}).order("id", {ascending: true});
      return q;
    };
    const from = (p.page - 1) * p.pageSize, result = await query().range(from, from + p.pageSize - 1);
    let rows: unknown = result.data, count = result.count, error = result.error;
    if (from > 0 && result.status === 416 && result.error?.code === "PGRST103") {
      const counted = await query(true);
      if (counted.error || counted.count === null || !Number.isSafeInteger(counted.count) || counted.count < 0 || counted.count > from) throw Error("Unverified operational range");
      rows = []; count = counted.count; error = null;
    }
    const safe = hrOperationsPageSchema.safeParse({kind: p.kind, rows, totalCount: count, page: p.page, pageSize: p.pageSize});
    if (error || !safe.success) throw Error("Incomplete operational result");
    return {success: true, data: safe.data, updatedAt: Date.now()};
  } catch {return {success: false, error: "Operational records could not be completely loaded. Please retry."};}
}

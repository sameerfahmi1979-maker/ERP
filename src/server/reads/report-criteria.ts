import "server-only";
import {z} from "zod";
import {getAuthContext, hasPermission, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalContains} from "@/lib/reads/search";
import {canReadReportCriterion, reportCriteriaSchema, reportCriteriaPageSchema, reportCriteriaRestrictedSchema, type ReportCriteria, type ReportCriteriaResponse, type ReportCriterionKey} from "@/lib/reads/report-criteria-schema";
import {reportFilterKeys} from '@/lib/report-center/filter-contract';

type Definition = {table: string; label: string; code?: string; softDelete: boolean; dependencies: Partial<Record<"ownerCompanyId" | "branchId" | "departmentId", string>>};
const definitions: Record<ReportCriterionKey, Definition> = {
  employee_id: {table: "employees", label: "full_name_en", code: "employee_code", softDelete: true, dependencies: {ownerCompanyId: "owner_company_id", branchId: "branch_id", departmentId: "department_id"}},
  owner_company_id: {table: "owner_companies", label: "legal_name_en", code: "company_code", softDelete: false, dependencies: {}},
  branch_id: {table: "branches", label: "branch_name_en", softDelete: false, dependencies: {ownerCompanyId: "owner_company_id"}},
  department_id: {table: "departments", label: "department_name_en", softDelete: true, dependencies: {ownerCompanyId: "owner_company_id"}},
  designation_id: {table: "designations", label: "designation_name_en", softDelete: true, dependencies: {ownerCompanyId: "owner_company_id", departmentId: "department_id"}},
  work_site_id: {table: "work_sites", label: "site_name", softDelete: true, dependencies: {ownerCompanyId: "owner_company_id"}},
};
const registrySchema = z.object({report_code: z.string(), required_permissions: z.array(z.string()), filter_schema_json: z.unknown()});
const dependencyKeys = {ownerCompanyId: "owner_company_id", branchId: "branch_id", departmentId: "department_id"} as const;
type Result = {success: boolean; data?: ReportCriteriaResponse; error?: string};

/** One request-bound ordinary client. Native registry/employee/master-data RLS
 * remains authoritative. Selecting an entity name or reports.run alone never
 * grants labels. No historical active-status filter is introduced. */
export async function readReportCriteria(input: unknown, context?: AuthContext, signal?: AbortSignal): Promise<Result> {
  const parsed = reportCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid report criteria"};
  try {
    signal?.throwIfAborted();
    const ctx = context ?? await getAuthContext(), p = parsed.data;
    signal?.throwIfAborted();
    if (!hasPermission(ctx, "reports.run")) return {success: false, error: "Permission denied"};
    const db = await createClient(); signal?.throwIfAborted();
    const attach = <T extends {abortSignal: (value: AbortSignal) => unknown}>(query: T): T => signal ? query.abortSignal(signal) as T : query;
    const registryResult = await attach(db.from("erp_report_registry").select("report_code,required_permissions,filter_schema_json")
      .eq("report_code", p.reportCode).eq("is_active", true).is("deleted_at", null)).maybeSingle();
    signal?.throwIfAborted();
    if (registryResult.error) throw Error("Report applicability read failed");
    if (!registryResult.data) return {success: false, error: "Permission denied"};
    const registry = registrySchema.parse(registryResult.data);
    if (registry.report_code !== p.reportCode) throw Error("Report applicability mismatch");
    // Preserve the existing route's any-required-permission contract exactly.
    if (registry.required_permissions.length && !registry.required_permissions.some(code => hasPermission(ctx, code))) return {success: false, error: "Permission denied"};
    const filters = reportFilterKeys(registry.report_code,registry.filter_schema_json);
    if (!filters.includes(p.key) || Object.entries(dependencyKeys).some(([key, field]) => p[key as keyof typeof dependencyKeys] !== undefined && !filters.includes(field)))
      return {success: false, error: "Invalid report filter applicability"};
    if (!canReadReportCriterion(ctx, p.key)) return {success: true, data: reportCriteriaRestrictedSchema.parse({criteria: p, availability: "restricted"})};
    const def = definitions[p.key], fields = ["id", def.label, ...(def.code ? [def.code] : [])].join(",");
    const base = (head = false) => {
      signal?.throwIfAborted();
      let query = db.from(def.table).select(fields, {count: "exact", head});
      if (def.softDelete) query = query.is("deleted_at", null);
      for (const [key, column] of Object.entries(def.dependencies)) {
        const value = p[key as keyof ReportCriteria]; if (value !== undefined) query = query.eq(column, value);
      }
      return attach(query);
    };
    const searched = (head = false) => {
      let query = base(head);
      if (p.search) query = query.or([def.label, ...(def.code ? [def.code] : [])].map(column => `${column}.ilike.${literalContains(p.search)}`).join(","));
      return query;
    };
    const start = (p.page - 1) * p.pageSize;
    const readPage = async () => {
      const result = await searched().order(def.label, {ascending: true, nullsFirst: false}).order("id", {ascending: true}).range(start, start + p.pageSize - 1);
      signal?.throwIfAborted();
      if (start > 0 && (result.status === 416 || result.error?.code === "PGRST103")) {
        const count = await searched(true); signal?.throwIfAborted();
        if (count.error || count.count === null || !Number.isSafeInteger(count.count) || count.count < 0 || count.count > start) throw Error("Page exhaustion could not be verified");
        return {data: [], error: null, count: count.count};
      }
      return result;
    };
    const [page, selection] = await Promise.all([readPage(), p.selectedId ? base().eq("id", p.selectedId).range(0, 0) : Promise.resolve({data: [], error: null, count: 0})]);
    signal?.throwIfAborted();
    if (page.error || selection.error || page.count === null || selection.count === null || ![0, 1].includes(selection.count)) throw Error("Criteria read failed");
    const rowSchema = z.object({id: z.number().int().positive().refine(Number.isSafeInteger), [def.label]: z.string(), ...(def.code ? {[def.code]: z.string().nullable()} : {})});
    const rows = z.array(rowSchema).parse(page.data), selectedRows = z.array(rowSchema).parse(selection.data);
    if (selectedRows.length !== selection.count || selectedRows.some(row => row.id !== p.selectedId)) throw Error("Selected choice could not be verified");
    const option = (row: z.infer<typeof rowSchema>) => ({value: row.id, label: row[def.label] as string, code: def.code ? row[def.code] as string | null : null});
    return {success: true, data: reportCriteriaPageSchema.parse({criteria: p, rows: rows.map(option), totalCount: page.count, selected: selectedRows[0] ? option(selectedRows[0]) : null})};
  } catch {
    signal?.throwIfAborted();
    return {success: false, error: "Report choices could not be loaded. Please retry."};
  }
}

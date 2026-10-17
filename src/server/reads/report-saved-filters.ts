import "server-only";
import {z} from "zod";
import {getAuthContext, hasPermission, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalLike} from "@/lib/reads/search";
import {reportSavedFiltersRequestSchema, reportSavedFiltersPageSchema, reportSavedFilterDetailResponseSchema} from "@/lib/reads/report-saved-filters-schema";

const columns = "id,report_id,user_profile_id,filter_name,is_default,is_shared,created_at,updated_at";
const registrySchema = z.object({id: z.number().int().positive().refine(Number.isSafeInteger), report_code: z.string(), required_permissions: z.array(z.string())});
/** Caller RLS is authoritative. A manager's permission to edit other filters
 * does not broaden the original owning-user OR shared ordinary list contract. */
export async function readReportSavedFilters(input: unknown, context?: AuthContext, signal?: AbortSignal) {
  const parsed = reportSavedFiltersRequestSchema.safeParse(input);
  if (!parsed.success) return {success: false as const, kind: "invalid_input" as const, error: "Invalid saved-filter criteria"};
  try {
    signal?.throwIfAborted();
    const ctx = context ?? await getAuthContext(), p = parsed.data;
    signal?.throwIfAborted();
    if (!hasPermission(ctx, "reports.run") || !ctx.profile?.id) return {success: false as const, kind: "forbidden" as const, error: "Permission denied"};
    const db = await createClient(); signal?.throwIfAborted();
    const attach = <T extends {abortSignal: (value: AbortSignal) => unknown}>(query: T): T => signal ? query.abortSignal(signal) as T : query;
    const registryResult = await attach(db.from("erp_report_registry").select("id,report_code,required_permissions")
      .eq("report_code", p.reportCode).eq("is_active", true).is("deleted_at", null)).maybeSingle();
    signal?.throwIfAborted();
    if (registryResult.error) throw Error("Report applicability unavailable");
    if (!registryResult.data) return {success: false as const, kind: "forbidden" as const, error: "Permission denied"};
    const registry = registrySchema.parse(registryResult.data);
    if (registry.report_code !== p.reportCode) throw Error("Report applicability mismatch");
    // Same any-required-permission check as the existing report route/criteria.
    if (registry.required_permissions.length && !registry.required_permissions.some(code => hasPermission(ctx, code)))
      return {success: false as const, kind: "forbidden" as const, error: "Permission denied"};
    const base = (head = false) => attach(db.from("erp_report_saved_filters")
      .select(columns + (p.mode === "detail" ? ",filters_json" : ""), {count: "exact", head})
      .eq("report_id", registry.id).is("deleted_at", null).or(`user_profile_id.eq.${ctx.profile!.id},is_shared.eq.true`));
    if (p.mode === "detail") {
      const result = await base().eq("id", p.id).range(0, 0); signal?.throwIfAborted();
      if (result.error || !Array.isArray(result.data) || ![0, 1].includes(result.count ?? -1) || result.data.length !== result.count) throw Error("Saved-filter detail unavailable");
      const data = reportSavedFilterDetailResponseSchema.parse({criteria: p, record: result.data[0] ?? null});
      if (data.record && (data.record.report_id !== registry.id || data.record.user_profile_id !== ctx.profile.id && !data.record.is_shared)) throw Error("Selected filter scope mismatch");
      return {success: true as const, data};
    }
    const query = (head = false) => {
      const q = base(head); if (p.search !== "") q.ilike("filter_name", literalLike(p.search)); return q;
    };
    const start = (p.page - 1) * p.pageSize;
    const result = await query().order("is_default", {ascending: false}).order("filter_name", {ascending: true}).order("id", {ascending: true}).range(start, start + p.pageSize - 1);
    signal?.throwIfAborted();
    let rows = result.data, count = result.count, error = result.error;
    if (start > 0 && result.status === 416 && result.error?.code === "PGRST103") {
      const recount = await query(true); signal?.throwIfAborted();
      if (recount.error || recount.count === null || !Number.isSafeInteger(recount.count) || recount.count < 0 || recount.count > start) throw Error("Unverified saved-filter count");
      rows = []; count = recount.count; error = null;
    }
    if (error) throw Error("Saved-filter page unavailable");
    const data = reportSavedFiltersPageSchema.parse({criteria: p, rows, totalCount: count});
    if (data.rows.some(row => row.report_id !== registry.id || row.user_profile_id !== ctx.profile!.id && !row.is_shared)) throw Error("Saved-filter scope mismatch");
    return {success: true as const, data};
  } catch {
    signal?.throwIfAborted();
    return {success: false as const, kind: "unavailable" as const, error: "Saved filters could not be loaded. Please retry."};
  }
}

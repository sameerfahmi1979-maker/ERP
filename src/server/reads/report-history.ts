import "server-only";
import {getAuthContext, hasPermission, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalContains, literalLike} from "@/lib/reads/search";
import {reportHistoryRequestSchema, reportHistoryPageSchema, reportHistoryDetailSchema, type REPORT_HISTORY_SORT_KEYS} from "@/lib/reads/report-history-schema";

const runColumns = "id,report_code,run_reference,run_status,output_format,row_count,duration_ms,run_by,started_at,sensitive_data_included,was_multi_company";
const listColumns = runColumns + ",report,runner";
const detailColumns = runColumns + ",report:erp_report_registry!report_id(report_name_en,module_code),runner:user_profiles!run_by(display_name),completed_at,template_selected_manually,error_message,redaction_summary_json";
const sortColumns = {report: "report_sort", output_format: "output_format", run_status: "run_status", row_count: "row_count", duration: "duration_sort", run_by: "runner_sort", started_at: "started_at"} satisfies Record<(typeof REPORT_HISTORY_SORT_KEYS)[number], string>;
const searchColumns = ["report_display", "format_search", "status_search", "rows_search", "duration_search", "runner_display", "started_search", "code_search", "reference_search"] as const;
/** Internal context sharing is only for the SSR composition. RLS and the
 * original own-run/history-viewer policy remain authoritative for every row. */
export async function readReportHistory(input: unknown, context?: AuthContext, signal?: AbortSignal) {
  const parsed = reportHistoryRequestSchema.safeParse(input);
  if (!parsed.success) return {success: false as const, error: "Invalid report history criteria"};
  try {
    signal?.throwIfAborted();
    const p = parsed.data, ctx = context ?? await getAuthContext();
    signal?.throwIfAborted();
    if (!hasPermission(ctx, "reports.view") && !hasPermission(ctx, "reports.history.view")) return {success: false as const, error: "Permission denied"};
    const db = await createClient();
    signal?.throwIfAborted();
    if (p.mode === "detail") {
      const query = db.from("erp_report_runs").select(detailColumns).eq("id", p.recordId);
      if (signal) query.abortSignal(signal);
      const result = await query.maybeSingle(), safe = reportHistoryDetailSchema.safeParse(result.data);
      signal?.throwIfAborted();
      if (result.error || !safe.success || safe.data.id !== p.recordId) throw Error("Unavailable detail");
      return {success: true as const, data: {mode: "detail" as const, record: safe.data}, updatedAt: Date.now()};
    }
    const makeQuery = (head = false) => {
      // The reviewed invoker view retains caller RLS and independently masked
      // labels. A missing/denied/unavailable view is an error, never a fallback
      // to the old capped collection or a different ordering/search contract.
      const query = db.from("perf_report_history_read").select(listColumns, {count: "exact", head});
      if (signal) query.abortSignal(signal);
      if (p.search !== "") {
        const value = literalContains(p.search);
        query.or(searchColumns.map(field => `${field}.ilike.${value}`).join(","));
      }
      for (const [key, value] of Object.entries(p.columnFilters)) {
        if (!value) continue;
        if (key === "report_code" || key === "run_reference") query.ilike(key, literalLike(value));
        else if (key === "started_at") query.gte(key, value + "T00:00:00Z").lt(key, new Date(Date.parse(value + "T00:00:00Z") + 86400000).toISOString());
        else query.eq(key === "duration" ? "duration_sort" : key, key === "row_count" || key === "duration" ? Number(value) : value);
      }
      if (!head) {
        for (const sort of p.sorting) query.order(sortColumns[sort.id], {ascending: !sort.desc, nullsFirst: false});
        query.order("id", {ascending: true});
      }
      return query;
    };
    const from = (p.page - 1) * p.pageSize, result = await makeQuery().range(from, from + p.pageSize - 1);
    signal?.throwIfAborted();
    let rows: unknown = result.data, count = result.count, error = result.error;
    if (from > 0 && result.status === 416 && result.error?.code === "PGRST103") {
      const recount = await makeQuery(true);
      signal?.throwIfAborted();
      if (recount.error || recount.count === null || !Number.isSafeInteger(recount.count) || recount.count < 0 || recount.count > from) throw Error("Unverified count");
      rows = []; count = recount.count; error = null;
    }
    const safe = reportHistoryPageSchema.safeParse({mode: "list", page: p.page, pageSize: p.pageSize, totalCount: count, rows});
    if (error || !safe.success) throw Error("Incomplete history");
    return {success: true as const, data: safe.data, updatedAt: Date.now()};
  } catch {signal?.throwIfAborted(); return {success: false as const, error: "Report history could not be completely loaded. Please retry."};}
}

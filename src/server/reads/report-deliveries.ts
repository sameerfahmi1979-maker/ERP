import "server-only";
import {getAuthContext, hasPermission, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalContains} from "@/lib/reads/search";
import {reportDeliveriesCriteriaSchema, reportDeliveriesPageSchema} from "@/lib/reads/report-deliveries-schema";
const columns = "id,run_id,delivery_type,recipient_to,subject,attachment_format,attachment_filename,provider,delivery_status,sent_at,created_at,error_message";
export async function readReportDeliveries(input: unknown, context?: AuthContext, signal?: AbortSignal) {
  const parsed = reportDeliveriesCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false as const, error: "Invalid report delivery criteria"};
  try {
    signal?.throwIfAborted(); const ctx = context ?? await getAuthContext(); signal?.throwIfAborted();
    if (!hasPermission(ctx, "reports.history.view")) return {success: false as const, error: "Permission denied"};
    const p = parsed.data, db = await createClient(); signal?.throwIfAborted();
    const base = (head = false) => {
      const q = db.from("erp_report_delivery_logs").select(columns, {count: "exact", head});
      if (signal) q.abortSignal(signal);
      if (p.runId !== undefined) q.eq("run_id", p.runId);
      if (p.status) q.eq("delivery_status", p.status);
      if (p.search) q.or(["subject", "attachment_filename", "provider", "delivery_type"].map(field => `${field}.ilike.${literalContains(p.search)}`).join(","));
      return q;
    };
    const offset = (p.page - 1) * p.pageSize, result = await base().order("created_at", {ascending: false}).order("id", {ascending: true}).range(offset, offset + p.pageSize - 1); signal?.throwIfAborted();
    let rows = result.data, count = result.count, error = result.error;
    if (offset > 0 && result.status === 416 && error?.code === "PGRST103") {
      const recount = await base(true); signal?.throwIfAborted();
      if (recount.error || recount.count === null || !Number.isSafeInteger(recount.count) || recount.count < 0 || recount.count > offset) throw Error("Unverified count");
      rows = []; count = recount.count; error = null;
    }
    if (error || !Array.isArray(rows)) throw Error("Unverified deliveries");
    const data = reportDeliveriesPageSchema.parse({page: p.page, pageSize: p.pageSize, totalCount: count, rows: rows.map(row => ({...row, hasError: typeof row.error_message === "string" && row.error_message.length > 0}))});
    if (p.runId !== undefined && data.rows.some(row => row.run_id !== p.runId)) throw Error("Wrong run");
    return {success: true as const, data};
  } catch {signal?.throwIfAborted(); return {success: false as const, error: "Report deliveries could not be loaded. Please retry."};}
}

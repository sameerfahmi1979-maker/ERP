import "server-only";
import {z} from "zod";
import {getAuthContext, hasPermission, hasGlobalPermission, hasPermissionInScope, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalContains} from "@/lib/reads/search";
import {reportTemplateSelectionCriteriaSchema, reportTemplateSelectionPageSchema, reportTemplateSelectionRowSchema} from "@/lib/reads/report-template-selection-schema";

const columns = "id,template_code,template_name,template_type,is_default,governance_status,visual_editor_engine,branding_profile_id,branding_profile_name,branding_profile_type,company_name,logo_url,owner_company_id,selectable";
/** Requires the reviewed invoker projection composed with the F06 authority
 * boundary. Its absence is unavailable: never fall back to admin/raw branding
 * reads or collect every template/profile before filtering a page. */
export async function readReportTemplateSelection(input: unknown, context?: AuthContext, signal?: AbortSignal) {
  const parsed = reportTemplateSelectionCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false as const, kind: "invalid_input" as const, error: "Invalid template selection criteria"};
  try {
    signal?.throwIfAborted(); const ctx = context ?? await getAuthContext(), p = parsed.data; signal?.throwIfAborted();
    if (!hasPermission(ctx, "reports.view") && !hasPermission(ctx, "reports.manage")) return {success: false as const, kind: "forbidden" as const, error: "Permission denied"};
    const db = await createClient(); signal?.throwIfAborted();
    const attach = <T extends {abortSignal: (value: AbortSignal) => unknown}>(query: T): T => signal ? query.abortSignal(signal) as T : query;
    const base = (head = false) => {
      const query = attach(db.from("perf_report_template_selection").select(columns, {count: "exact", head}));
      // Like F06, empty input adds no restriction. Null-company choices are
      // global-authorized by the native view, never authorized by this OR.
      if (p.ownerCompanyIds.length) query.or(`owner_company_id.is.null,owner_company_id.in.(${p.ownerCompanyIds.join(",")})`);
      return query;
    };
    const searched = (head = false) => {
      const query = base(head).eq("selectable", true);
      if (p.issuableOnly) query.in("governance_status", ["approved", "published"]);
      if (p.search !== "") query.or(["template_name", "template_code", "template_type", "branding_profile_name", "company_name"].map(field => `${field}.ilike.${literalContains(p.search)}`).join(","));
      return query;
    };
    const start = (p.page - 1) * p.pageSize;
    const readPage = async () => {
      const result = await searched().order("is_default", {ascending: false}).order("template_name", {ascending: true}).order("id", {ascending: true}).range(start, start + p.pageSize - 1);
      signal?.throwIfAborted();
      if (start > 0 && result.status === 416 && result.error?.code === "PGRST103") {
        const recount = await searched(true); signal?.throwIfAborted();
        if (recount.error || recount.count === null || !Number.isSafeInteger(recount.count) || recount.count < 0 || recount.count > start) throw Error("Unverified template count");
        return {data: [], count: recount.count, error: null};
      }
      return result;
    };
    const [page, selection] = await Promise.all([readPage(), p.selectedId ? base().eq("id", p.selectedId).range(0, 0) : Promise.resolve({data: [], count: 0, error: null})]);
    signal?.throwIfAborted();
    if (page.error || selection.error || ![0, 1].includes(selection.count ?? -1) || !Array.isArray(selection.data) || selection.data.length !== selection.count) throw Error("Template read unavailable");
    const rows = z.array(reportTemplateSelectionRowSchema).parse(page.data), selectedRows = z.array(reportTemplateSelectionRowSchema).parse(selection.data);
    const selected = selectedRows[0] ? {...selectedRows[0], selectable: selectedRows[0].selectable && (!p.issuableOnly || ["approved", "published"].includes(selectedRows[0].governance_status))} : null;
    const data = reportTemplateSelectionPageSchema.parse({criteria: p, rows, selected, totalCount: page.count});
    for (const row of [...data.rows, ...(data.selected ? [data.selected] : [])]) {
      const permitted = ["reports.view", "reports.manage"].some(code => row.owner_company_id === null ? hasGlobalPermission(ctx, code) : hasPermissionInScope(ctx, code, row.owner_company_id));
      if (!permitted || p.ownerCompanyIds.length && row.owner_company_id !== null && !p.ownerCompanyIds.includes(row.owner_company_id)) throw Error("Template authority mismatch");
    }
    if (p.issuableOnly && data.rows.some(row => !["approved", "published"].includes(row.governance_status))) throw Error("Template eligibility mismatch");
    return {success: true as const, data};
  } catch {
    signal?.throwIfAborted(); return {success: false as const, kind: "unavailable" as const, error: "Template choices could not be loaded. Please retry."};
  }
}

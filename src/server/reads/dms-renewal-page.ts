import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/check";
import { getReadAuthContext } from "./read-context";
import { readAllPages } from "./all-pages";
import { literalContains, literalLike } from "@/lib/reads/search";
import { renewalFilterSchema, renewalRowsSchema } from "./dms-renewal-contract";
import type { ActionResult, DmsRenewalRequestRow } from "@/server/actions/dms/renewals";

const text = z.string().trim().max(200);
const baseRowsSchema = z.array(renewalRowsSchema.element.omit({ document: true, requester: true, assignee: true }));
const documentRowsSchema = z.array(renewalRowsSchema.element.shape.document.unwrap());
const profileRowsSchema = z.array(z.object({ id: z.number().int().positive(), full_name: z.string().nullable() }));
export const renewalPageSchema = renewalFilterSchema.extend({
  page: z.number().int().min(1).max(100000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  search: text.default(""),
  sortKey: z.enum(["created_at", "renewal_no", "status", "priority", "target_renewal_date"]).default("created_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  columnFilters: z.object({
    renewal_no: text.optional(), document: text.optional(), status: text.optional(),
    priority: text.optional(), assignee: text.optional(),
    target_renewal_date: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  }).strict().default({}),
}).strict();
export type RenewalReadPage = { rows: DmsRenewalRequestRow[]; totalCount: number; page: number; pageSize: number };

/** A bounded interactive page. The existing full-result action is deliberately
 * retained for compatibility; it must not be used to seed this paged UI. */
export async function readDmsRenewalPage(input: unknown): Promise<ActionResult<RenewalReadPage>> {
  const parsed = renewalPageSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid renewal criteria" };
  try {
    const ctx = await getReadAuthContext();
    if (!ctx.profile || !ctx.isAccountActive || ctx.profile.must_change_password ||
        !["dms.renewals.view", "dms.renewals.manage", "dms.admin"].some(permission => hasPermission(ctx, permission))) {
      return { success: false, error: "Permission denied" };
    }
    const p = parsed.data;
    const db = await createClient();
    const empty = (): ActionResult<RenewalReadPage> => ({ success: true, data: { rows: [], totalCount: 0, page: p.page, pageSize: p.pageSize } });
    // Resolve only requested relation filters through the same ordinary protected
    // client as the displayed embeds. Fail closed on a partial lookup; never turn
    // a truncated set into a plausible but incomplete renewal count.
    const ids = async (table: "dms_documents" | "user_profiles", value: string, titleOnly = false) => {
      return (await readAllPages<{ id: number }>(async (from, to) => {
        let query = db.from(table).select("id", { count: "exact" });
        if (table === "dms_documents") {
          query = query.is("deleted_at", null);
          query = titleOnly ? query.ilike("title", literalLike(value)) : query.or(`document_no.ilike.${literalContains(value)},title.ilike.${literalContains(value)}`);
        } else query = query.ilike("full_name", literalLike(value));
        const result = await query.order("id").range(from, to);
        return { ...result, data: z.array(z.object({ id: z.number().int().positive() })).parse(result.data) };
      }, { identity: row => row.id, maxRows: 10000 })).map(row => row.id);
    };
    let query = db.from("dms_renewal_requests").select(`
      id, document_id, renewal_no, status, priority, requested_by, assigned_to,
      requested_at, target_renewal_date, old_expiry_date, new_expiry_date,
      replacement_document_id, replacement_version_id, notes,
      completed_at, cancelled_at, created_by, created_at, updated_at
    `, { count: "exact" }).is("deleted_at", null);
    if (p.documentId) query = query.eq("document_id", p.documentId);
    if (p.status) query = query.eq("status", p.status);
    if (p.assignedToMe) query = query.eq("assigned_to", ctx.profile.id);
    if (!p.includeCompleted) query = query.not("status", "in", '("renewed","cancelled","rejected")');
    const fields = p.columnFilters;
    for (const field of ["renewal_no", "status", "priority"] as const) {
      if (fields[field]) query = query.ilike(field, literalLike(fields[field]));
    }
    if (fields.target_renewal_date) query = query.eq("target_renewal_date", fields.target_renewal_date);
    if (fields.document) {
      const matches = await ids("dms_documents", fields.document, true);
      if (!matches.length) return empty();
      query = query.in("document_id", matches);
    }
    if (fields.assignee) {
      const matches = await ids("user_profiles", fields.assignee);
      if (!matches.length) return empty();
      query = query.in("assigned_to", matches);
    }
    if (p.search) {
      const [documents, assignees] = await Promise.all([ids("dms_documents", p.search), ids("user_profiles", p.search)]);
      const term = literalContains(p.search);
      query = query.or([
        `renewal_no.ilike.${term}`, `status.ilike.${term}`, `priority.ilike.${term}`,
        ...(documents.length ? [`document_id.in.(${documents.join(",")})`] : []),
        ...(assignees.length ? [`assigned_to.in.(${assignees.join(",")})`] : []),
      ].join(","));
    }
    const from = (p.page - 1) * p.pageSize;
    const result = await query.order(p.sortKey, { ascending: p.sortDir === "asc", nullsFirst: false })
      .order("id", { ascending: true }).range(from, from + p.pageSize - 1);
    // PostgREST returns 416 for a page past the last row. Verify its current
    // exact count with the identical filters instead of parsing error text or
    // inventing zero. Concurrent growth or another failure remains unavailable.
    if (result.status === 416 && result.error?.code === "PGRST103") {
      const check = await query.range(0, 0);
      const first = baseRowsSchema.safeParse(check.data);
      if (!check.error && check.count !== null && Number.isSafeInteger(check.count) && check.count >= 0 &&
          from >= check.count && first.success && first.data.length === Math.min(1, check.count)) {
        return { success: true, data: { rows: [], totalCount: check.count, page: p.page, pageSize: p.pageSize } };
      }
    }
    const rows = baseRowsSchema.safeParse(result.data);
    if (result.error || result.count === null || !Number.isSafeInteger(result.count) || result.count < 0 ||
        !rows.success || rows.data.length !== Math.min(p.pageSize, Math.max(0, result.count - from)) ||
        new Set(rows.data.map(row => row.id)).size !== rows.data.length) {
      return { success: false, error: "Renewal rows or count could not be verified. Please retry." };
    }
    // Hydrate only this page in batches. Per-row embedded protected document
    // readers repeatedly evaluate their visible set; no need to do that N times.
    // Ordinary RLS/masking still owns each relation. Denied relations remain null.
    const documentIds = [...new Set(rows.data.map(row => row.document_id))];
    const profileIds = [...new Set(rows.data.flatMap(row => [row.requested_by, row.assigned_to]).filter((id): id is number => id !== null))];
    const [documents, profiles] = await Promise.all([
      documentIds.length ? db.from("dms_documents").select("id, document_no, title, expiry_date, document_type_id", { count: "exact" }).in("id", documentIds).order("id").range(0, documentIds.length - 1) : Promise.resolve({ data: [], count: 0, error: null }),
      profileIds.length ? db.from("user_profiles").select("id, full_name", { count: "exact" }).in("id", profileIds).order("id").range(0, profileIds.length - 1) : Promise.resolve({ data: [], count: 0, error: null }),
    ]);
    const docs = documentRowsSchema.parse(documents.data), people = profileRowsSchema.parse(profiles.data);
    for (const [response, values, requested] of [[documents, docs, documentIds], [profiles, people, profileIds]] as const) {
      if (response.error || response.count !== values.length || new Set(values.map(row => row.id)).size !== values.length || values.some(row => !requested.includes(row.id))) {
        return { success: false, error: "Renewal references could not be verified. Please retry." };
      }
    }
    const docMap = new Map(docs.map(row => [row.id, row]));
    const personMap = new Map(people.map(row => [row.id, { full_name: row.full_name }]));
    const hydrated = rows.data.map(row => ({ ...row, document: docMap.get(row.document_id) ?? null, requester: row.requested_by === null ? null : personMap.get(row.requested_by) ?? null, assignee: row.assigned_to === null ? null : personMap.get(row.assigned_to) ?? null }));
    return { success: true, data: { rows: hydrated, totalCount: result.count, page: p.page, pageSize: p.pageSize } };
  } catch {
    return { success: false, error: "Renewal requests could not be loaded. Refine the filters or retry." };
  }
}

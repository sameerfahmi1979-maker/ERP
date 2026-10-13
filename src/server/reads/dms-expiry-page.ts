import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/check";
import { literalContains, literalLike } from "@/lib/reads/search";
import { getReadAuthContext } from "./read-context";
import { readAllPages } from "./all-pages";
import { expiryFilterSchema, expiryDocumentRowsSchema, expiryIdRowsSchema, expiryLinkRowsSchema, readNoExpiryTypeIds } from "./dms-expiry-contract";
import type { ActionResult, DmsExpiringDocumentRow } from "@/server/actions/dms/expiry-reminders";

const text = z.string().trim().max(200);
export const expiryCriteriaSchema = expiryFilterSchema.safeExtend({
  limit: z.never().optional(),
  search: text.default(""),
  sortKey: z.enum(["document_no", "title", "document_type", "expiry_date", "status"]).default("expiry_date"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  columnFilters: z.object({ document_no: text.optional(), document_type: text.optional(),
    expiry_date: z.union([z.literal(""), z.iso.date()]).optional(), expiry_override_reason: text.optional(), status: text.optional(),
  }).strict().default({}),
}).strict();
export const expiryPageSchema = expiryCriteriaSchema.safeExtend({
  page: z.number().int().min(1).max(100000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
}).strict();
export type ExpiryCriteria = z.input<typeof expiryCriteriaSchema>;
export type ExpiryPage = { rows: DmsExpiringDocumentRow[]; totalCount: number; page: number; pageSize: number };
export type ExpiryOutput = { rows: DmsExpiringDocumentRow[]; totalCount: number; fingerprint: string };

/** One query definition for the interactive page and complete filtered output.
 * Every relation lookup uses the ordinary caller's client, never service role. */
async function prepare(input: z.output<typeof expiryCriteriaSchema>, now: number) {
  const ctx = await getReadAuthContext();
  if (!ctx.profile || !ctx.isAccountActive || ctx.profile.must_change_password ||
      !["dms.expiry.view", "dms.documents.view", "dms.admin"].some(p => hasPermission(ctx, p))) throw Error("Permission denied");
  const db = await createClient(), p = input;
  const date = (days: number) => new Date(now + days * 86400000).toISOString().slice(0, 10);
  const typeIds = async (value: string, categoryOnly = false) => {
    const categories = categoryOnly ? (await readAllPages(async (from, to) => {
      const r = await db.from("dms_document_categories").select("id", { count: "exact" }).ilike("name_en", literalLike(value)).order("id").range(from, to);
      return { ...r, data: expiryIdRowsSchema.parse(r.data) };
    }, { identity: r => r.id, maxRows: 10000 })).map(r => r.id) : [];
    if (categoryOnly && !categories.length) return [];
    return (await readAllPages(async (from, to) => {
      let q = db.from("dms_document_types").select("id", { count: "exact" });
      q = categoryOnly ? q.in("category_id", categories) : q.ilike("name_en", literalLike(value));
      const r = await q.order("id").range(from, to);
      return { ...r, data: expiryIdRowsSchema.parse(r.data) };
    }, { identity: r => r.id, maxRows: 10000 })).map(r => r.id);
  };
  let query = db.from("dms_documents").select(`id, document_no, title, expiry_date, issue_date, status, confidentiality:confidentiality_level,
    expiry_tracking_override, expiry_override_reason,
    document_type:dms_document_types!document_type_id(name_en, is_renewable),
    category:dms_document_types!document_type_id(category:dms_document_categories!category_id(name_en))`, { count: "exact" })
    .is("deleted_at", null).neq("status", "superseded");
  if (p.view === "expired") query = query.not("expiry_date", "is", null).lt("expiry_date", date(0)).is("expiry_tracking_override", null);
  if (p.view === "expiring") query = query.not("expiry_date", "is", null).gte("expiry_date", date(0)).lte("expiry_date", date(90)).is("expiry_tracking_override", null);
  if (p.view === "missing_expiry") {
    query = query.is("expiry_date", null).neq("status", "archived").is("expiry_tracking_override", null);
    const excluded = await readNoExpiryTypeIds(db);
    if (excluded.length) query = query.not("document_type_id", "in", `(${excluded.join(",")})`);
  }
  if (p.view === "ignored") query = query.eq("expiry_tracking_override", "ignored");
  if (p.documentTypeId) query = query.eq("document_type_id", p.documentTypeId);
  if (p.categoryId) {
    const ids = (await readAllPages(async (from, to) => {
      const r = await db.from("dms_document_types").select("id", { count: "exact" }).eq("category_id", p.categoryId!).is("deleted_at", null).order("id").range(from, to);
      return { ...r, data: expiryIdRowsSchema.parse(r.data) };
    }, { identity: r => r.id, maxRows: 10000 })).map(r => r.id);
    if (!ids.length) return null;
    query = query.in("document_type_id", ids);
  }
  if (p.entityType && p.entityId) {
    const links = await readAllPages(async (from, to) => {
      const r = await db.from("dms_document_links").select("id, document_id", { count: "exact" }).eq("entity_type", p.entityType!).eq("entity_id", p.entityId!).order("id").range(from, to);
      return { ...r, data: expiryLinkRowsSchema.parse(r.data) };
    }, { identity: r => r.id, maxRows: 10000 });
    if (!links.length) return null;
    query = query.in("id", [...new Set(links.map(r => r.document_id))]);
  }
  if (p.status) query = query.eq("status", p.status);
  if (p.searchText) { const term = literalContains(p.searchText); query = query.or(`title.ilike.${term},document_no.ilike.${term}`); }
  if (p.expiryDateFrom) query = query.gte("expiry_date", p.expiryDateFrom);
  if (p.expiryDateTo) query = query.lte("expiry_date", p.expiryDateTo);
  if (p.daysRemainingMin !== undefined) query = query.gte("expiry_date", date(p.daysRemainingMin));
  if (p.daysRemainingMax !== undefined) query = query.lte("expiry_date", date(p.daysRemainingMax));
  const f = p.columnFilters;
  // Document's existing column filter is title; global search also covers number.
  if (f.document_no) query = query.ilike("title", literalLike(f.document_no));
  if (f.status) query = query.ilike("status", literalLike(f.status));
  if (f.expiry_override_reason) query = query.ilike("expiry_override_reason", literalLike(f.expiry_override_reason));
  if (f.expiry_date) query = query.eq("expiry_date", f.expiry_date);
  if (f.document_type) {
    const ids = await typeIds(f.document_type); if (!ids.length) return null;
    query = query.in("document_type_id", ids);
  }
  if (p.search) {
    const [types, categories] = await Promise.all([typeIds(p.search), typeIds(p.search, true)]);
    const ids = [...new Set([...types, ...categories])], term = literalContains(p.search);
    query = query.or(`document_no.ilike.${term},title.ilike.${term},status.ilike.${term},expiry_override_reason.ilike.${term}${ids.length ? `,document_type_id.in.(${ids.join(",")})` : ""}`);
  }
  return { query: query.order(p.sortKey === "document_type" ? "document_type(name_en)" : p.sortKey, { ascending: p.sortDir === "asc", nullsFirst: false }).order("id", { ascending: true }) };
}

function mapRows(rows: z.output<typeof expiryDocumentRowsSchema>, now: number): DmsExpiringDocumentRow[] {
  return rows.map(d => ({ ...d, document_type: d.document_type?.name_en ?? null, is_renewable: d.document_type?.is_renewable ?? true,
    category: d.category?.category?.name_en ?? null, days_remaining: d.expiry_date ? Math.round((new Date(d.expiry_date).getTime() - now) / 86400000) : null,
    owner: null, latest_reminder_status: null }));
}
const failure = (error: unknown) => ({ success: false, error: error instanceof Error && error.message === "Permission denied" ? "Permission denied" : "Expiry results could not be completely verified. Refine the filters or retry." });

export async function readDmsExpiryPage(input: unknown): Promise<ActionResult<ExpiryPage>> {
  const parsed = expiryPageSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid expiry criteria" };
  const p = parsed.data, now = Date.now(), from = (p.page - 1) * p.pageSize;
  try {
    const prepared = await prepare(p, now);
    if (!prepared) return { success: true, data: { rows: [], totalCount: 0, page: p.page, pageSize: p.pageSize } };
    const result = await prepared.query.range(from, from + p.pageSize - 1);
    if (result.status === 416 && result.error?.code === "PGRST103") {
      const check = await prepared.query.range(0, 0), first = expiryDocumentRowsSchema.safeParse(check.data);
      if (!check.error && check.count !== null && Number.isSafeInteger(check.count) && check.count >= 0 && from >= check.count &&
          first.success && first.data.length === Math.min(1, check.count)) return { success: true, data: { rows: [], totalCount: check.count, page: p.page, pageSize: p.pageSize } };
    }
    const rows = expiryDocumentRowsSchema.parse(result.data);
    if (result.error || result.count === null || !Number.isSafeInteger(result.count) || result.count < 0 ||
        rows.length !== Math.min(p.pageSize, Math.max(0, result.count - from)) || new Set(rows.map(r => r.id)).size !== rows.length) throw Error("Invalid page");
    return { success: true, data: { rows: mapRows(rows, now), totalCount: result.count, page: p.page, pageSize: p.pageSize } };
  } catch (error) { return failure(error); }
}

/** Explicit complete output only: bounded 500-row traversal, fail closed above
 * 10,000 rows, then verify a second pass to detect same-count edits/offset drift.
 * This is an observed stable result, not a transactional database snapshot. */
export async function readDmsExpiryOutput(input: unknown): Promise<ActionResult<ExpiryOutput>> {
  const parsed = expiryCriteriaSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid expiry output criteria" };
  const now = Date.now();
  try {
    const collect = async () => {
      const prepared = await prepare(parsed.data, now);
      if (!prepared) return [];
      return readAllPages(async (from, to) => {
        const result = await prepared.query.range(from, to);
        return { ...result, data: expiryDocumentRowsSchema.parse(result.data) };
      }, { identity: row => row.id, maxRows: 10000 });
    };
    const rows = mapRows(await collect(), now), verified = mapRows(await collect(), now);
    const encoded = JSON.stringify(rows);
    if (Buffer.byteLength(encoded, "utf8") > 6_000_000) throw Error("Output too large; refine filters");
    if (encoded !== JSON.stringify(verified)) throw Error("Changed during output");
    return { success: true, data: { rows, totalCount: rows.length, fingerprint: createHash("sha256").update(encoded).digest("hex") } };
  } catch (error) { return failure(error); }
}

import "server-only";
import {z} from "zod";
import {getAuthContext, hasPermission, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {getAllowedConfidentialityLevels} from "@/lib/dms/confidentiality";
import {collectCompletePages} from "@/lib/reads/complete-pages";
import {dmsBrowserCriteriaSchema, dmsBrowserResponseSchema, type DmsBrowserResponse} from "@/lib/reads/dms-browser-schema";

const id = z.number().int().positive().refine(Number.isSafeInteger), text = z.string().nullable();
const documentSchema = z.object({id, document_no: text, title: text, status: text, issue_date: z.iso.date().nullable(), expiry_date: z.iso.date().nullable(),
  created_at: z.string().nullable(), document_type: z.object({type_code: text, name_en: text}).strip().nullable(),
}).strip();
type Document = z.infer<typeof documentSchema>;
type Native = {data: unknown; count: number | null; error: {code?: string} | null; status?: number};
interface Query extends PromiseLike<Native> {
  eq(k: string, v: unknown): Query; is(k: string, v: null): Query; in(k: string, v: readonly number[] | readonly string[]): Query;
  not(k: string, op: string, value: string): Query; or(v: string): Query; ilike(k: string, v: string): Query;
  gte(k: string, v: string): Query; lte(k: string, v: string): Query;
  textSearch(k: string, v: string, options: {type: "plain"; config: "simple"}): Query;
  order(k: string, options?: {ascending?: boolean}): Query; range(from: number, to: number): Query;
}
const DOCUMENT_FIELDS = "id,document_no,title,status,issue_date,expiry_date,created_at,document_type:dms_document_types(type_code,name_en)";
// Finite composition, never a silent provider cap. Simple metadata reads stay
// natively paged. Content/link unions over this budget return no rows/count.
export const DMS_BROWSER_COMPOSITION_LIMIT = 5000;
export const DMS_BROWSER_READ_TIMEOUT_MS = 15000;
const ID_BATCH = 200, MAX_REQUESTS = 70;
class CompositionTooLarge extends Error {}
const chunks = (ids: number[]) => Array.from({length: Math.ceil(ids.length / ID_BATCH)}, (_, i) => ids.slice(i * ID_BATCH, (i + 1) * ID_BATCH));

const MONTH_NAMES: Record<string, string> = {jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03", apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07", july: "07", aug: "08", august: "08", sep: "09", sept: "09", september: "09", oct: "10", october: "10", nov: "11", november: "11", dec: "12", december: "12"};
/** Original date expansion + plain/simple FTS (not newly invented OR search). */
function normalizeDateTermsForFts(query: string): string {
  const terms = new Set<string>([query]), lower = query.toLowerCase();
  const ddMonthMatch = lower.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*/);
  if (ddMonthMatch) {
    const dd = ddMonthMatch[1].padStart(2, "0"), key = Object.keys(MONTH_NAMES).find(k => ddMonthMatch[2].startsWith(k.slice(0, 3)));
    if (key) {const mm = MONTH_NAMES[key]; terms.add(`${dd}/${mm}`); terms.add(`${mm}/${dd}`); terms.add(`${dd}-${mm}`); terms.add(`${mm}-${dd}`); terms.add(`${dd}.${mm}`); terms.add(ddMonthMatch[2].toUpperCase().slice(0, 3));}
  }
  const monthDdMatch = lower.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/);
  if (monthDdMatch) {
    const dd = monthDdMatch[2].padStart(2, "0"), key = Object.keys(MONTH_NAMES).find(k => monthDdMatch[1].startsWith(k.slice(0, 3)));
    if (key) {const mm = MONTH_NAMES[key]; terms.add(`${dd}/${mm}`); terms.add(`${mm}/${dd}`); terms.add(`${dd}-${mm}`);}
  }
  const year = lower.match(/\b(19|20)\d{2}\b/); if (year) terms.add(year[0]);
  return [...terms].join(" ");
}
function extractExcerpt(value: string | null, query: string): string | null {
  if (!value || !query.trim()) return null;
  const index = value.toLowerCase().indexOf(query.trim().toLowerCase().split(/\s+/)[0]);
  if (index < 0) return null;
  const start = Math.max(0, index - 40), end = Math.min(value.length, index + 80);
  return `${start > 0 ? "…" : ""}${value.slice(start, end).trim()}${end < value.length ? "…" : ""}`;
}
// Quote the PostgREST grammar without changing the legacy ILIKE wildcard
// semantics (%/_/* and backslash remain SQL/PostgREST pattern operators).
const metadataPattern = (query: string) => `"%${query.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}%"`;
function micros(value: string): bigint {
  const parsed = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parsed) throw Error("Unsupported document timestamp");
  const seconds = Date.parse(`${parsed[1]}${parsed[3]}`) / 1000;
  if (!Number.isSafeInteger(seconds)) throw Error("Invalid document timestamp");
  return BigInt(seconds) * BigInt(1000000) + BigInt((parsed[2] ?? "").padEnd(6, "0"));
}
function compareDocuments(a: Document, b: Document): number {
  // PostgreSQL DESC defaults to NULLS FIRST. Preserve microseconds, not JS ms.
  if (a.created_at === null && b.created_at !== null) return -1;
  if (b.created_at === null && a.created_at !== null) return 1;
  if (a.created_at !== null && b.created_at !== null) {const x = micros(a.created_at), y = micros(b.created_at); if (x !== y) return x > y ? -1 : 1;}
  return b.id - a.id;
}
const rowDto = (row: Document, query = "", content = false, excerpt: string | null = null) => {
  const metadata = !query || (row.title ?? "").toLowerCase().includes(query.toLowerCase()) || (row.document_no ?? "").toLowerCase().includes(query.toLowerCase());
  return {id: row.id, documentNo: row.document_no ?? "", title: row.title ?? "", status: row.status ?? "", issueDate: row.issue_date, expiryDate: row.expiry_date,
    typeNameEn: row.document_type?.name_en ?? null, typeCode: row.document_type?.type_code ?? null,
    matchSource: content ? metadata ? "both" as const : "content" as const : "metadata" as const, contentExcerpt: excerpt};
};

/** Ordinary authenticated client throughout. Existing F03 RLS and the legacy
 * additional confidentiality predicate are independent; no inferred grants.
 * No provider, storage URL, byte download or mutation is called here. */
export async function readDmsBrowser(input: unknown, context?: AuthContext, callerSignal?: AbortSignal): Promise<{success: boolean; data?: DmsBrowserResponse; error?: string}> {
  const parsed = dmsBrowserCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid document browser criteria"};
  // Bound the whole ordinary read attempt, including every sequential source.
  // This does not change any database setting or extend a provider timeout.
  const signal = AbortSignal.any([...(callerSignal ? [callerSignal] : []), AbortSignal.timeout(DMS_BROWSER_READ_TIMEOUT_MS)]);
  try {
    signal?.throwIfAborted();
    const ctx = context ?? await getAuthContext();
    signal?.throwIfAborted();
    if (!(hasPermission(ctx, "dms.documents.view") || hasPermission(ctx, "dms.admin"))) return {success: false, error: "Permission denied"};
    const db = await createClient(), p = parsed.data, asOf = new Date().toISOString();
    let requests = 0;
    const select = (table: string, fields: string, head = false): Query => {
      signal?.throwIfAborted(); if (++requests > MAX_REQUESTS) throw new CompositionTooLarge();
      const q = db.from(table).select(fields, {count: "exact", head}); if (signal) q.abortSignal(signal);
      return q as unknown as Query;
    };
    const output = (value: unknown) => {signal?.throwIfAborted(); return {success: true, data: dmsBrowserResponseSchema.parse(value)};};
    const complete = async <S extends z.ZodType>(query: () => Query, schema: S, identity: (row: z.infer<S>) => number) => collectCompletePages(async (from, to) => {
      const result = await query().range(from, to); signal?.throwIfAborted();
      if (result.error) throw Error("Browser source unavailable");
      if (result.count !== null && result.count > DMS_BROWSER_COMPOSITION_LIMIT) throw new CompositionTooLarge();
      return {...result, data: z.array(schema).parse(result.data)};
    }, {identity, maxRows: DMS_BROWSER_COMPOSITION_LIMIT, signal});
    const nativePage = async (query: (head?: boolean) => Query, offset: number, limit: number) => {
      let result = await query().range(offset, offset + limit - 1); signal?.throwIfAborted();
      if (offset > 0 && result.status === 416 && result.error?.code === "PGRST103") {
        const head = await query(true); signal?.throwIfAborted();
        if (head.error || head.count === null || !Number.isSafeInteger(head.count) || head.count < 0 || head.count > offset) throw Error("Unverified range");
        result = {...head, data: []};
      }
      if (result.error || result.count === null || !Number.isSafeInteger(result.count) || result.count < 0 || !Array.isArray(result.data) || result.data.length !== Math.min(limit, Math.max(0, result.count - offset))) throw Error("Incomplete browser page");
      return {rows: result.data, totalCount: result.count};
    };
    const documents = (head = false) => {
      const q = select("dms_documents", DOCUMENT_FIELDS, head).is("deleted_at", null).eq("is_archived", false).not("status", "in", '("archived","superseded","deleted")');
      if (!(hasPermission(ctx, "dms.admin") || ctx.roleCodes.includes("system_admin"))) {
        const levels = getAllowedConfidentialityLevels(ctx);
        if (ctx.profile?.id) q.or(`confidentiality_level.in.(${levels.join(",")}),owner_user_id.eq.${ctx.profile.id},created_by.eq.${ctx.profile.id}`);
        else q.in("confidentiality_level", levels);
      }
      return q;
    };
    const ordered = (q: Query) => q.order("created_at", {ascending: false}).order("id", {ascending: false});
    if (p.operation === "types") {
      const rows = await complete(() => select("dms_document_types", "id,type_code,name_en").eq("is_active", true).order("name_en", {ascending: true}).order("id", {ascending: true}), z.object({id, type_code: z.string(), name_en: z.string()}).strip(), r => r.id);
      return output({criteria: p, asOf, availability: "available", totalCount: rows.length, rows: rows.map(r => ({id: r.id, typeCode: r.type_code, nameEn: r.name_en}))});
    }
    if (p.operation === "files") {
      const parent = await nativePage(() => documents().eq("id", p.documentId).order("id"), 0, 1);
      if (parent.totalCount === 0) return output({criteria: p, asOf, availability: "unavailable"});
      if (parent.totalCount !== 1) throw Error("Document mismatch");
      const doc = documentSchema.parse(parent.rows[0]); if (doc.id !== p.documentId) throw Error("Document mismatch");
      const capability = async (permission: string) => {
        signal?.throwIfAborted();
        const q = db.rpc("f03_has_document_permission", {document_id: p.documentId, permission_code: permission}); if (signal) q.abortSignal(signal);
        const r = await q; signal?.throwIfAborted(); if (r.error || typeof r.data !== "boolean") throw Error("Document capability unavailable"); return r.data;
      };
      const [result, canPreview, canDownload] = await Promise.all([
        nativePage(head => select("dms_document_files", "id,document_id,file_name,mime_type,file_size_bytes", head).eq("document_id", p.documentId).is("deleted_at", null).order("id", {ascending: true}), p.offset, p.limit),
        capability("dms.documents.preview"), capability("dms.documents.download"),
      ]);
      const rows = z.array(z.object({id, document_id: id, file_name: z.string(), mime_type: text, file_size_bytes: z.number().int().nonnegative().nullable()}).strip()).parse(result.rows);
      if (rows.some(row => row.document_id !== p.documentId)) throw Error("File membership mismatch");
      return output({criteria: p, asOf, availability: "available", totalCount: result.totalCount, document: rowDto(doc), canPreview, canDownload,
        rows: rows.map(row => ({id: row.id, fileName: row.file_name, mimeType: row.mime_type, fileSizeBytes: row.file_size_bytes}))});
    }
    const contentRows = p.query.length >= 2 ? await complete(() => select("dms_document_content", "id,document_id").textSearch("content_text", normalizeDateTermsForFts(p.query), {type: "plain", config: "simple"}).order("id", {ascending: true}), z.object({id, document_id: id}).strip(), r => r.id) : [];
    const contentIds = new Set(contentRows.map(r => r.document_id));
    if (contentIds.size !== contentRows.length) throw Error("Duplicate document content");
    const linkedRows = p.linkedEntityType ? await complete(() => select("dms_document_links", "id,document_id").eq("entity_type", p.linkedEntityType).is("deleted_at", null).order("id", {ascending: true}), z.object({id, document_id: id}).strip(), r => r.id) : null;
    const linkedIds = linkedRows === null ? null : [...new Set(linkedRows.map(r => r.document_id))];
    const docNoOnly = /^[A-Za-z0-9]+-\d+$/.test(p.query) || /^\d{4,}$/.test(p.query);
    const filtered = (head = false) => {
      const q = documents(head);
      if (p.status && p.status !== "all") q.eq("status", p.status);
      if (p.documentTypeIds.length) q.in("document_type_id", p.documentTypeIds);
      if (p.issueDateFrom) q.gte("issue_date", p.issueDateFrom);
      if (p.issueDateTo) q.lte("issue_date", p.issueDateTo);
      return q;
    };
    const searched = (q: Query, matchingContent: number[] = []) => {
      if (!p.query) return q;
      if (docNoOnly) return q.ilike("document_no", `%${p.query}%`);
      return q.or([`title.ilike.${metadataPattern(p.query)}`, `document_no.ilike.${metadataPattern(p.query)}`, ...(matchingContent.length ? [`id.in.(${matchingContent.join(",")})`] : [])].join(","));
    };
    let rows: Document[], totalCount: number;
    if (linkedIds === null && (contentIds.size === 0 || docNoOnly)) {
      const result = await nativePage(head => ordered(searched(filtered(head))), p.offset, p.limit);
      rows = z.array(documentSchema).parse(result.rows); totalCount = result.totalCount;
    } else {
      const union = new Map<number, Document>();
      const merge = (items: Document[], batch?: number[]) => {
        for (const item of items) {if (batch && !batch.includes(item.id)) throw Error("Document membership mismatch");
          const prior = union.get(item.id); if (prior && JSON.stringify(prior) !== JSON.stringify(item)) throw Error("Document changed during composition"); union.set(item.id, item);}
        if (union.size > DMS_BROWSER_COMPOSITION_LIMIT) throw new CompositionTooLarge();
      };
      if (linkedIds !== null) {
        // Each ID filter is <=200, even when the complete link set exceeds 1000.
        for (const batch of chunks(linkedIds)) merge(await complete(() => ordered(searched(filtered().in("id", batch), batch.filter(n => contentIds.has(n)))), documentSchema, r => r.id), batch);
      } else {
        merge(await complete(() => ordered(searched(filtered())), documentSchema, r => r.id));
        for (const batch of chunks([...contentIds])) merge(await complete(() => ordered(filtered().in("id", batch)), documentSchema, r => r.id), batch);
      }
      const all = [...union.values()].sort(compareDocuments); totalCount = all.length; rows = all.slice(p.offset, p.offset + p.limit);
    }
    const excerptIds = rows.filter(r => contentIds.has(r.id)).map(r => r.id), excerpts = new Map<number, string | null>();
    if (excerptIds.length) {
      const matched = await complete(() => select("dms_document_content", "id,document_id,content_text").in("document_id", excerptIds)
        .textSearch("content_text", normalizeDateTermsForFts(p.query), {type: "plain", config: "simple"}).order("id", {ascending: true}), z.object({id, document_id: id, content_text: text}).strip(), r => r.id);
      if (matched.length !== excerptIds.length || new Set(matched.map(r => r.document_id)).size !== matched.length || matched.some(r => !excerptIds.includes(r.document_id))) throw Error("Content changed during composition");
      for (const item of matched) excerpts.set(item.document_id, extractExcerpt(item.content_text, p.query));
    }
    return output({criteria: p, asOf, availability: "available", totalCount, rows: rows.map(r => rowDto(r, p.query, contentIds.has(r.id), excerpts.get(r.id) ?? null))});
  } catch (error) {
    if (error instanceof CompositionTooLarge && !signal?.aborted && parsed.data.operation !== "files") return {success: true, data: dmsBrowserResponseSchema.parse({criteria: parsed.data, asOf: new Date().toISOString(), availability: "too_large"})};
    return {success: false, error: "Document browser records could not be completely loaded. Please retry."};
  }
}

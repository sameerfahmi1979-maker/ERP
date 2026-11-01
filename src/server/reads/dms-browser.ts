import "server-only";
import {searchDocuments} from "@/server/ai/search/documents";
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
const MAX_REQUESTS = 70;
class CompositionTooLarge extends Error {}

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
    const shared=await searchDocuments({query:p.query,mode:"content",offset:p.offset,pageSize:p.limit,nullsFirst:true,includeExcerpts:true,
      filters:{documentTypeIds:p.documentTypeIds,status:p.status&&p.status!=="all"?p.status:undefined,issueFrom:p.issueDateFrom||undefined,issueTo:p.issueDateTo||undefined,linkedType:p.linkedEntityType||undefined}},ctx,signal);
    if(!shared.success||!shared.data)throw Error("Shared search unavailable");
    if(shared.data.outcome==="clarification_required")return output({criteria:p,asOf,availability:"clarification_required",message:shared.data.message});
    return output({criteria:p,asOf:shared.data.asOf,availability:"available",totalCount:shared.data.totalCount,
      rows:shared.data.rows.map(r=>({id:r.id,documentNo:r.document_no,title:r.title,status:r.status??"",issueDate:r.issue_date,expiryDate:r.expiry_date,
        typeNameEn:r.document_type?.name_en??null,typeCode:r.document_type?.type_code??null,matchSource:r.matchSource,contentExcerpt:r.contentExcerpt}))});
  } catch (error) {
    if (error instanceof CompositionTooLarge && !signal?.aborted && parsed.data.operation !== "files") return {success: true, data: dmsBrowserResponseSchema.parse({criteria: parsed.data, asOf: new Date().toISOString(), availability: "too_large"})};
    return {success: false, error: "Document browser records could not be completely loaded. Please retry."};
  }
}

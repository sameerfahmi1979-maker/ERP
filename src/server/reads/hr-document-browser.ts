import "server-only";
import {z} from "zod";
import {getAuthContext, hasPermission, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {collectCompletePages} from "@/lib/reads/complete-pages";
import {literalContains, literalLike} from "@/lib/reads/search";
import {hrDocumentBrowserCriteriaSchema, hrDocumentBrowserResponseSchema, HR_BROWSER_DOCUMENT_FIELDS, type HrBrowserDocument, type HrDocumentBrowserResponse} from "@/lib/reads/hr-document-browser-schema";

const id = z.number().int().positive().refine(Number.isSafeInteger), text = z.string().nullable();
const label = z.object({name_en: text}).strip().nullable();
const employee = z.object({id, employee_code: text, full_name_en: text, employee_status: text}).strip();
const dependent = z.object({id, employee_id: id, dependent_name_en: text, relationship_type: label}).strip();
const document = z.object({id, document_no: text, title: text, status: text, issue_date: text, expiry_date: text, document_type: label}).strip();
const identity = z.object({id, document_number: text, issue_date: text, expiry_date: text, status: text, dms_document_id: id.nullable(), doc_type: label}).strip();
const file = z.object({id, document_id: id, file_name: z.string(), mime_type: text, file_size_bytes: z.number().int().nonnegative().nullable()}).strip();
type Native = {data: unknown; count: number | null; error: {code?: string} | null; status?: number};
interface Query extends PromiseLike<Native> {
  eq(k: string, v: unknown): Query; is(k: string, v: null): Query; in(k: string, v: readonly number[]): Query; or(value: string): Query;
  ilike(k: string, v: string): Query; order(k: string, options?: {ascending?: boolean; nullsFirst?: boolean}): Query;
  range(from: number, to: number): Query; maybeSingle(): PromiseLike<Native>;
}
const denied = {success: false as const, error: "Permission denied"};
const MAX_COMPOSITION = 5000, ID_BATCH = 200;
class CompositionTooLarge extends Error {}
async function complete<S extends z.ZodType<{id: number}>>(query: () => Query, schema: S, signal?: AbortSignal) {
  return collectCompletePages(async (from, to) => {
    const result = await query().range(from, to);
    signal?.throwIfAborted();
    if (result.count !== null && result.count > MAX_COMPOSITION) throw new CompositionTooLarge();
    if (result.error) throw Error("Incomplete browser source");
    return {...result, data: z.array(schema).parse(result.data)};
  }, {identity: row => row.id, maxRows: MAX_COMPOSITION, signal});
}
async function nativePage(query: (head?: boolean) => Query, page: number, pageSize: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const from = (page - 1) * pageSize;
  let result = await query().range(from, from + pageSize - 1);
  signal?.throwIfAborted();
  if (from > 0 && result.status === 416 && result.error?.code === "PGRST103") {
    const counted = await query(true);
    signal?.throwIfAborted();
    if (counted.error || counted.count === null || !Number.isSafeInteger(counted.count) || counted.count < 0 || counted.count > from) throw Error("Unverified browser range");
    result = {...counted, data: []};
  }
  if (result.error || !Array.isArray(result.data)) throw Error("Browser read failed");
  return {rows: result.data, totalCount: result.count};
}
const chunks = (ids: number[]) => Array.from({length: Math.ceil(ids.length / ID_BATCH)}, (_, i) => ids.slice(i * ID_BATCH, (i + 1) * ID_BATCH));
const contains = (value: string | null, term: string) => (value ?? "").toLocaleLowerCase().includes(term.toLocaleLowerCase());

/** All inputs share one validated principal/client. The checked F03 projection
 * and each source's RLS remain authoritative; no admin client or new grant.
 * Union composition is deliberately bounded and exact, not native SQL paging. */
export async function readHrDocumentBrowser(input: unknown, context?: AuthContext, signal?: AbortSignal): Promise<{success: boolean; data?: HrDocumentBrowserResponse; error?: string}> {
  const parsed = hrDocumentBrowserCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid HR document browser criteria"};
  try {
    signal?.throwIfAborted();
    const ctx = context ?? await getAuthContext(), p = parsed.data;
    signal?.throwIfAborted();
    if (!hasPermission(ctx, "hr.employees.view") || !(hasPermission(ctx, "dms.documents.view") || hasPermission(ctx, "dms.admin"))) return denied;
    const db = await createClient(), asOf = new Date().toISOString();
    signal?.throwIfAborted();
    const select = (table: string, columns: string, head = false): Query => {
      signal?.throwIfAborted();
      const query = db.from(table).select(columns, {count: "exact", head});
      if (signal) query.abortSignal(signal);
      return query as unknown as Query;
    };
    const output = (value: unknown) => {signal?.throwIfAborted(); return {success: true, data: hrDocumentBrowserResponseSchema.parse(value)};};
    if (p.operation === "employees") {
      let dependentIds: number[] = [];
      if (p.search) {
        const matches = await complete(() => select("employee_dependents", "id,employee_id").is("deleted_at", null).ilike("dependent_name_en", literalLike(p.search)).order("id"), z.object({id, employee_id: id}).strip(), signal);
        dependentIds = [...new Set(matches.map(row => row.employee_id))];
        // A bounded OR keeps native employee collation/order/count exact without
        // enormous URLs or treating chunk-local employee order as a global sort.
        if (dependentIds.length > ID_BATCH) throw new CompositionTooLarge();
      }
      const query = (head = false) => {
        const q = select("employees", "id,employee_code,full_name_en,employee_status", head).is("deleted_at", null);
        if (p.status === "active") q.eq("employee_status", "active");
        if (p.status === "inactive") q.or("employee_status.neq.active,employee_status.is.null");
        if (p.search) q.or([`full_name_en.ilike.${literalContains(p.search)}`, `employee_code.ilike.${literalContains(p.search)}`, ...(dependentIds.length ? [`id.in.(${dependentIds.join(",")})`] : [])].join(","));
        return q.order("full_name_en", {ascending: true, nullsFirst: false}).order("id", {ascending: true});
      };
      const result = await nativePage(query, p.page, p.pageSize, signal);
      return output({criteria: p, asOf, totalCount: result.totalCount, rows: z.array(employee).parse(result.rows).map(row => ({id: row.id, employeeCode: row.employee_code, fullNameEn: row.full_name_en, status: row.employee_status}))});
    }
    const employeeId = p.operation === "dependents" ? p.employeeId : p.entityType === "employee" ? p.entityId : null;
    let subjectEmployeeId = employeeId, legacyDocumentId: number | null = null;
    if (employeeId === null && p.operation !== "dependents") {
      const result = await select("employee_dependents", "id,employee_id,dms_document_id").eq("id", p.entityId).is("deleted_at", null).maybeSingle();
      signal?.throwIfAborted();
      if (result.error) throw Error("Dependent authorization failed");
      if (!result.data) return denied;
      const subject = z.object({id, employee_id: id, dms_document_id: id.nullable()}).strip().parse(result.data);
      if (subject.id !== p.entityId) throw Error("Dependent mismatch");
      subjectEmployeeId = subject.employee_id; legacyDocumentId = subject.dms_document_id;
    }
    const owner = await select("employees", "id").eq("id", subjectEmployeeId).is("deleted_at", null).maybeSingle();
    signal?.throwIfAborted();
    if (owner.error) throw Error("Employee authorization failed");
    if (!owner.data) return denied;
    if (z.object({id}).strip().parse(owner.data).id !== subjectEmployeeId) throw Error("Employee mismatch");
    if (p.operation === "dependents") {
      const result = await nativePage(head => select("employee_dependents", "id,employee_id,dependent_name_en,relationship_type:hr_relationship_types(name_en)", head)
        .eq("employee_id", p.employeeId).is("deleted_at", null).order("dependent_name_en", {ascending: true, nullsFirst: false}).order("id"), p.page, p.pageSize, signal);
      return output({criteria: p, asOf, totalCount: result.totalCount, rows: z.array(dependent).parse(result.rows).map(row => ({id: row.id, employeeId: row.employee_id, name: row.dependent_name_en, relationship: row.relationship_type?.name_en ?? null}))});
    }
    if (p.operation === "files") {
      const unavailable = () => output({criteria: p, asOf, availability: "unavailable"});
      const links = await select("dms_document_links", "id", true).eq("entity_type", p.entityType).eq("entity_id", p.entityId).eq("document_id", p.documentId).is("deleted_at", null);
      signal?.throwIfAborted();
      if (links.error || links.count === null || !Number.isSafeInteger(links.count) || links.count < 0) throw Error("Membership failed");
      let member = links.count > 0 || legacyDocumentId === p.documentId;
      if (!member && p.entityType === "employee") {
        const reference = await select("employee_identity_documents", "id", true).eq("employee_id", p.entityId).eq("dms_document_id", p.documentId).is("deleted_at", null);
        signal?.throwIfAborted();
        if (reference.error || reference.count === null || !Number.isSafeInteger(reference.count) || reference.count < 0) throw Error("Identity membership failed");
        member = reference.count > 0;
      }
      if (!member) return unavailable();
      const visible = await select("dms_documents", "id").eq("id", p.documentId).is("deleted_at", null).maybeSingle();
      signal?.throwIfAborted();
      if (visible.error) throw Error("Document authorization failed");
      if (!visible.data) return unavailable();
      if (z.object({id}).strip().parse(visible.data).id !== p.documentId) throw Error("Document mismatch");
      const capability = async (permission: string) => {
        signal?.throwIfAborted();
        const query = db.rpc("f03_has_document_permission", {document_id: p.documentId, permission_code: permission});
        if (signal) query.abortSignal(signal);
        const result = await query;
        signal?.throwIfAborted();
        if (result.error || typeof result.data !== "boolean") throw Error("Document capability unavailable");
        return result.data;
      };
      const [result, canPreview, canDownload] = await Promise.all([
        nativePage(head => select("dms_document_files", "id,document_id,file_name,mime_type,file_size_bytes", head).eq("document_id", p.documentId).is("deleted_at", null).order("id"), p.page, p.pageSize, signal),
        capability("dms.documents.preview"), capability("dms.documents.download"),
      ]);
      return output({criteria: p, asOf, availability: "available", canPreview, canDownload, totalCount: result.totalCount,
        rows: z.array(file).parse(result.rows).map(row => ({id: row.id, documentId: row.document_id, fileName: row.file_name, mimeType: row.mime_type, fileSizeBytes: row.file_size_bytes}))});
    }
    // Independent only after subject authorization. Settle in parallel but
    // inspect outcomes in the original source order: an earlier oversized
    // source keeps its truthful ceiling outcome, not a timing-dependent error.
    const [linkResult, identityResult] = await Promise.allSettled([
      complete(() => select("dms_document_links", "id,document_id").eq("entity_type", p.entityType).eq("entity_id", p.entityId).is("deleted_at", null).order("id"), z.object({id, document_id: id}).strip(), signal),
      p.entityType === "employee" ? complete(() => select("employee_identity_documents", "id,document_number,issue_date,expiry_date,status,dms_document_id,doc_type:hr_identity_document_types(name_en)")
        .eq("employee_id", p.entityId).is("deleted_at", null).order("expiry_date", {ascending: true, nullsFirst: false}).order("id"), identity, signal) : Promise.resolve([]),
    ]);
    signal?.throwIfAborted();
    if (linkResult.status === "rejected") throw linkResult.reason;
    if (identityResult.status === "rejected") throw identityResult.reason;
    const links = linkResult.value, identities = identityResult.value;
    const ids = [...new Set([...links.map(row => row.document_id), ...identities.flatMap(row => row.dms_document_id ? [row.dms_document_id] : []), ...(legacyDocumentId ? [legacyDocumentId] : [])])];
    if (ids.length > MAX_COMPOSITION) throw new CompositionTooLarge();
    const documents = new Map<number, z.infer<typeof document>>();
    for (const batch of chunks(ids)) {
      signal?.throwIfAborted();
      const rows = await complete(() => select("dms_documents", "id,document_no,title,status,issue_date,expiry_date,document_type:dms_document_types(name_en)").in("id", batch).is("deleted_at", null).order("id"), document, signal);
      for (const row of rows) {if (!batch.includes(row.id)) throw Error("Document membership mismatch"); documents.set(row.id, row);}
    }
    const rows: HrBrowserDocument[] = [], seen = new Set<number>();
    const appendDms = (documentId: number, source: "dms_link" | "dependent_link") => {
      const d = documents.get(documentId); if (!d || seen.has(documentId)) return;
      seen.add(documentId); rows.push({key: `dms:${d.id}`, id: d.id, documentNo: d.document_no, title: d.title ?? "Untitled", typeNameEn: d.document_type?.name_en ?? null,
        status: d.status, issueDate: d.issue_date, expiryDate: d.expiry_date, source});
    };
    links.forEach(link => appendDms(link.document_id, p.entityType === "employee" ? "dms_link" : "dependent_link"));
    if (legacyDocumentId) appendDms(legacyDocumentId, "dependent_link");
    for (const r of identities) {
      if (r.dms_document_id && seen.has(r.dms_document_id)) continue;
      const d = r.dms_document_id ? documents.get(r.dms_document_id) : undefined;
      if (r.dms_document_id) seen.add(r.dms_document_id);
      rows.push({key: d ? `dms:${d.id}` : `identity:${r.id}`, id: d?.id ?? null, documentNo: d?.document_no ?? r.document_number,
        title: d?.title ?? `${r.doc_type?.name_en ?? "Identity Document"}${r.document_number ? ` — ${r.document_number}` : ""}`, typeNameEn: r.doc_type?.name_en ?? d?.document_type?.name_en ?? null,
        status: r.status ?? d?.status ?? null, issueDate: r.issue_date ?? d?.issue_date ?? null, expiryDate: r.expiry_date ?? d?.expiry_date ?? null, source: "hr_identity"});
    }
    if (rows.length > MAX_COMPOSITION) throw new CompositionTooLarge();
    const filtered = rows.filter(row => HR_BROWSER_DOCUMENT_FIELDS.every(key => !p.columnFilters[key] || contains(row[key], p.columnFilters[key]!))
      && (!p.search || HR_BROWSER_DOCUMENT_FIELDS.some(key => contains(row[key], p.search))));
    filtered.sort((a, b) => {
      if (p.sortKey === "expiryDate") {
        if (a.expiryDate && b.expiryDate) return a.expiryDate.localeCompare(b.expiryDate) * (p.sortDir === "asc" ? 1 : -1);
        if (a.expiryDate) return -1; if (b.expiryDate) return 1;
        return a.title.localeCompare(b.title);
      }
      return (a[p.sortKey] ?? "").localeCompare(b[p.sortKey] ?? "") * (p.sortDir === "asc" ? 1 : -1);
    });
    return output({criteria: p, asOf, totalCount: filtered.length, rows: filtered.slice((p.page - 1) * p.pageSize, p.page * p.pageSize)});
  } catch (error) {
    if (error instanceof CompositionTooLarge && !signal?.aborted) return {success: true, data: hrDocumentBrowserResponseSchema.parse({criteria: parsed.data, asOf: new Date().toISOString(), availability: "too_large"})};
    return {success: false, error: "HR document browser records could not be completely loaded. Please retry."};
  }
}

import "server-only";
import {readSortPriority} from "@/lib/reads/read-sorting";
import {z} from "zod";
import {getAuthContext, hasPermission, hasGlobalPermission, hasPermissionInScope, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalContains, literalLike} from "@/lib/reads/search";
import {operationsRealDate, type HrOperationsField} from "@/lib/reads/hr-operations-schema";
import {CANDIDATE_CHILD_CONFIG, candidateChildCriteriaSchema, candidateChildPageSchema, candidateChildDetailSchema, candidateChildUnavailableSchema,
  candidateChildNativeRowSchemas, candidateChildNativeDetailSchemas, candidateOfferSalaryAccessSchema, type CandidateChildKind} from "@/lib/reads/hr-candidate-children-schema";

const denied = {success: false as const, error: "Permission denied"};
const subjectSchema = z.object({id: z.number().int().positive().refine(Number.isSafeInteger)}).strip();
const documentTitle = "dms_document_document_title";
const dayRange = (value: string) => [value + "T00:00:00Z", new Date(Date.parse(value + "T00:00:00Z") + 86400000).toISOString()];
function projection(kind: CandidateChildKind, detail: boolean) {
  const schema = detail ? candidateChildNativeDetailSchemas[kind] : candidateChildNativeRowSchemas[kind];
  const relationKeys = new Set(kind === "documents" ? ["dms_document"] : kind === "offers" ? ["designation"] : []);
  return [...Object.keys(schema.shape).filter(key => !relationKeys.has(key)), ...(kind === "documents" ? ["document_visible_id", "document_number", "document_title"] : kind === "offers" ? ["designation_id"] : [])].join(",");
}
async function hydrateOfferLabels(db: Awaited<ReturnType<typeof createClient>>, rows: unknown) {
  const values = z.array(z.record(z.string(), z.unknown())).max(100).parse(rows);
  const ids = [...new Set(values.map(row => subjectSchema.shape.id.nullable().parse(row.designation_id)).filter((id): id is number => id !== null))];
  const result = ids.length ? await db.from("designations").select("id,designation_name_en", {count: "exact"}).in("id", ids) : {data: [], count: 0, error: null};
  if (result.error) throw Error("Offer labels unavailable");
  const labels = z.array(candidateChildNativeRowSchemas.offers.shape.designation.unwrap()).parse(result.data);
  if (result.count !== labels.length || labels.length > ids.length || new Set(labels.map(row => row.id)).size !== labels.length || labels.some(row => !ids.includes(row.id))) throw Error("Incomplete offer labels");
  const index = new Map(labels.map(row => [row.id, row]));
  return values.map(row => ({...row, designation: index.get(row.designation_id as number) ?? null}));
}
function protectedRow(kind: CandidateChildKind, value: unknown, detail: boolean, context: AuthContext) {
  if (kind === "documents") {
    const flat = z.object({document_visible_id: subjectSchema.shape.id.nullable(), document_number: z.string().nullable(), document_title: z.string().nullable()}).passthrough().parse(value);
    if (flat.document_visible_id === null && (flat.document_number !== null || flat.document_title !== null)) throw Error("Invalid hidden document metadata");
    const dms_document = flat.document_visible_id === null ? null : {id: flat.document_visible_id, document_number: flat.document_number, document_title: flat.document_title};
    return (detail ? candidateChildNativeDetailSchemas.documents : candidateChildNativeRowSchemas.documents).parse({...flat, dms_document});
  }
  if (kind !== "offers") return (detail ? candidateChildNativeDetailSchemas[kind] : candidateChildNativeRowSchemas[kind]).parse(value);
  const row = (detail ? candidateChildNativeDetailSchemas.offers : candidateChildNativeRowSchemas.offers).parse(value);
  const allowed = (code: string) => row.owner_company_id === null ? hasGlobalPermission(context, code) : hasPermissionInScope(context, code, row.owner_company_id, row.branch_id);
  const canView = allowed("hr.payroll.view");
  const salaryAccess = candidateOfferSalaryAccessSchema.parse({companyId: row.owner_company_id, branchId: row.branch_id, canView, canManage: canView && allowed("hr.payroll.manage")});
  return {...row, basic_salary: canView ? row.basic_salary : null,
    ...("gross_salary" in row ? {gross_salary: canView ? row.gross_salary : null} : {}), salaryAccess};
}

/** Cookie-bound F03 projections/RLS remain authoritative, including related
 * employee/document scopes. Optional context is internal composition only. */
export async function readCandidateChildren(input: unknown, context?: AuthContext) {
  const parsed = candidateChildCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false as const, error: "Invalid candidate child criteria"};
  try {
    const p = parsed.data, ctx = context ?? await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.view") && !hasPermission(ctx, "hr.recruitment.manage")) return denied;
    const db = await createClient();
    const subject = await db.from("hr_candidates").select("id").eq("id", p.candidateId).is("deleted_at", null).maybeSingle();
    if (subject.error) throw Error("Candidate authorization unavailable");
    if (!subject.data) return denied;
    if (subjectSchema.parse(subject.data).id !== p.candidateId) throw Error("Candidate identity mismatch");
    const config = CANDIDATE_CHILD_CONFIG[p.kind];
    // The invoker projection preserves child RLS and materializes protected
    // metadata once, including title filtering/sorting before exact paging.
    const table = p.kind === "documents" ? "perf_hr_candidate_document_reads" : config.table;
    if (p.operation === "detail") {
      const result = await db.from(table).select(projection(p.kind, true)).eq("candidate_id", p.candidateId).eq("id", p.recordId).is("deleted_at", null).maybeSingle();
      if (result.error) throw Error("Candidate child detail unavailable");
      if (!result.data) return {success: true as const, updatedAt: Date.now(), data: candidateChildUnavailableSchema.parse({...p, availability: "unavailable"})};
      const row = p.kind === "offers" ? (await hydrateOfferLabels(db, [result.data]))[0] : result.data;
      return {success: true as const, updatedAt: Date.now(), data: candidateChildDetailSchema.parse({...p, row: protectedRow(p.kind, row, true, ctx)})};
    }
    const fields: readonly HrOperationsField[] = config.fields;
    const selection = projection(p.kind, false);
    const query = (head = false) => {
      const q = db.from(table).select(selection, {count: "exact", head}).eq("candidate_id", p.candidateId).is("deleted_at", null);
      if (p.search) {
        const clauses: string[] = [];
        for (const field of fields) {
          if (field.id === documentTitle) continue;
          if (field.type === "text" || field.type === "select") clauses.push(`${field.id}.ilike.${literalContains(p.search)}`);
          else if (field.type === "date" && operationsRealDate(p.search)) {
            if (field.id === "interview_datetime") {const [from, to] = dayRange(p.search); clauses.push(`and(${field.id}.gte.${from},${field.id}.lt.${to})`);}
            else clauses.push(`${field.id}.eq.${p.search}`);
          }
        }
        if (p.kind === "documents") clauses.push(`document_title.ilike.${literalContains(p.search)}`);
        q.or(clauses.join(","));
      }
      for (const field of fields) {
        const value = p.columnFilters[field.id]; if (!value) continue;
        if (field.id === documentTitle) q.ilike("document_title", literalLike(value));
        else if (field.type === "text") q.ilike(field.id, literalLike(value));
        else if (field.type === "date" && field.id === "interview_datetime") {const [from, to] = dayRange(value); q.gte(field.id, from).lt(field.id, to);}
        else q.eq(field.id, value);
      }
      if (!head) {
        // Descending nullable interview timestamps used the native default of
        // nulls first. Preserve it while adding a deterministic row tie-breaker.
        for (const sort of readSortPriority(p)) q.order(sort.id === documentTitle ? "document_title" : sort.id, {ascending: !sort.desc, nullsFirst: sort.desc});
        q.order("id", {ascending: true});
      }
      return q;
    };
    const from = (p.page - 1) * p.pageSize, result = await query().range(from, from + p.pageSize - 1);
    let rows: unknown = result.data, count = result.count, error = result.error;
    if (from > 0 && result.status === 416 && result.error?.code === "PGRST103") {
      const counted = await query(true);
      if (counted.error || counted.count === null || !Number.isSafeInteger(counted.count) || counted.count < 0 || counted.count > from) throw Error("Unverified range");
      rows = []; count = counted.count; error = null;
    }
    if (error || !Array.isArray(rows)) throw Error("Incomplete candidate child result");
    const hydratedRows = p.kind === "offers" ? await hydrateOfferLabels(db, rows) : rows;
    const data = candidateChildPageSchema.parse({operation: "page", kind: p.kind, candidateId: p.candidateId, page: p.page, pageSize: p.pageSize,
      totalCount: count, rows: hydratedRows.map(row => protectedRow(p.kind, row, false, ctx))});
    return {success: true as const, updatedAt: Date.now(), data};
  } catch {return {success: false as const, error: "Candidate child records could not be completely loaded. Please retry."};}
}

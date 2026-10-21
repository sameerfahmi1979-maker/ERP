import "server-only";
import {z} from "zod";
import {readSortPriority} from "@/lib/reads/read-sorting";
import {getAuthContext, hasPermission, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalContains, literalLike} from "@/lib/reads/search";
import {operationsRealDate, type HrOperationsField} from "@/lib/reads/hr-operations-schema";
import {RECRUITMENT_INQUIRY_CONFIG, recruitmentInquiryCriteriaSchema, recruitmentInquiryPageSchema, recruitmentInquiryRowSchemas, recruitmentRequisitionDetailCriteriaSchema, recruitmentRequisitionDetailSchema, type RecruitmentInquiryKind, type RecruitmentInquiryPage} from "@/lib/reads/hr-recruitment-inquiries-schema";

const joins: Record<RecruitmentInquiryKind, string[]> = {
  requisitions: ["department:departments(id,department_name_en)", "designation:designations(id,designation_name_en)"],
  candidates: ["requisition:hr_job_requisitions(id,requisition_code,requisition_title)"],
  interviews: ["candidate:hr_candidates!candidate_id(id,candidate_code,full_name_en,full_name_ar)", "interviewer:user_profiles!hr_interviews_interviewer_id_fkey(id,full_name_en:full_name)"],
  offers: ["candidate:hr_candidates!candidate_id(id,candidate_code,full_name_en,full_name_ar)", "designation:designations(id,designation_name_en)"],
  onboarding: ["candidate:hr_candidates!candidate_id(id,candidate_code,full_name_en,full_name_ar)", "assigned_user:user_profiles!hr_onboarding_tasks_assigned_to_fkey(id,full_name_en:full_name)"],
};
const candidateFields = {candidate_name: "full_name_en", candidate_code: "candidate_code"} as const;
const isCandidateField = (kind: RecruitmentInquiryKind, key: string): key is keyof typeof candidateFields => kind !== "candidates" && kind !== "requisitions" && key in candidateFields;
const timestampFields = new Set(["created_at", "interview_datetime"]);
const dayRange = (value: string) => [value + "T00:00:00Z", new Date(Date.parse(value + "T00:00:00Z") + 86400000).toISOString()];
const permitted = (ctx: AuthContext) => hasPermission(ctx, "hr.recruitment.view") || hasPermission(ctx, "hr.recruitment.manage");
function projection(kind: RecruitmentInquiryKind, inner: boolean, includeCandidate = true) {
  const relations = joins[kind].map(join => inner && join.startsWith("candidate:") ? join.replace("!candidate_id(", "!candidate_id!inner(") : join);
  const relationKeys = new Set(relations.map(join => join.split(":")[0]));
  const selectedRelations=relations.filter(join=>includeCandidate&&join.startsWith("candidate:"));
  const foreignKeys=relationSpecs[kind].filter(spec=>!includeCandidate||spec.key!=="candidate").map(spec=>spec.foreignKey);
  return [...new Set([...Object.keys(recruitmentInquiryRowSchemas[kind].shape).filter(key => !relationKeys.has(key)),...foreignKeys]), ...selectedRelations].join(",");
}

type RelationSpec={key:string;table:string;foreignKey:string;columns:string};
const relationSpecs:Record<RecruitmentInquiryKind,RelationSpec[]>={
 requisitions:[{key:"department",table:"departments",foreignKey:"department_id",columns:"id,department_name_en"},{key:"designation",table:"designations",foreignKey:"designation_id",columns:"id,designation_name_en"}],
 candidates:[{key:"requisition",table:"hr_job_requisitions",foreignKey:"requisition_id",columns:"id,requisition_code,requisition_title"}],
 interviews:[{key:"candidate",table:"hr_candidates",foreignKey:"candidate_id",columns:"id,candidate_code,full_name_en,full_name_ar"},{key:"interviewer",table:"user_profiles",foreignKey:"interviewer_id",columns:"id,full_name_en:full_name"}],
 offers:[{key:"candidate",table:"hr_candidates",foreignKey:"candidate_id",columns:"id,candidate_code,full_name_en,full_name_ar"},{key:"designation",table:"designations",foreignKey:"designation_id",columns:"id,designation_name_en"}],
 onboarding:[{key:"candidate",table:"hr_candidates",foreignKey:"candidate_id",columns:"id,candidate_code,full_name_en,full_name_ar"},{key:"assigned_user",table:"user_profiles",foreignKey:"assigned_to",columns:"id,full_name_en:full_name"}],
};
// Paging/counting occurs before decorative label hydration. Embedding every
// relation into a counted protected RPC multiplied its permission work over
// the entire result and exhausted the native statement budget.
async function hydrateLabels(db:Awaited<ReturnType<typeof createClient>>,kind:RecruitmentInquiryKind,rows:unknown,includeCandidate:boolean){
 const values=z.array(z.record(z.string(),z.unknown())).parse(rows);
 await Promise.all(relationSpecs[kind].filter(spec=>!includeCandidate||spec.key!=="candidate").map(async spec=>{
  const ids=[...new Set(values.map(r=>z.number().int().positive().nullable().parse(r[spec.foreignKey])).filter((id):id is number=>id!==null))];
  const result=ids.length?await db.from(spec.table).select(spec.columns).in("id",ids):{data:[],error:null};
  if(result.error)throw Error("Related labels unavailable");
  const labels=z.array(z.object({id:z.number().int().positive()}).passthrough()).parse(result.data);
  if(labels.length>ids.length||new Set(labels.map(r=>r.id)).size!==labels.length||labels.some(r=>!ids.includes(r.id)))throw Error("Invalid related labels");
  const index=new Map(labels.map(r=>[r.id,r]));for(const row of values)row[spec.key]=index.get(row[spec.foreignKey] as number)??null;
 }));
 return values;
}

/** The optional context is an internal server composition boundary only. HTTP
 * callers supply validated criteria, never authority. Native RLS remains active. */
export async function readRecruitmentInquiry(input: unknown, context?: AuthContext): Promise<{success: boolean; data?: RecruitmentInquiryPage; updatedAt?: number; error?: string}> {
  const parsed = recruitmentInquiryCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid recruitment criteria"};
  try {
    const p = parsed.data, ctx = context ?? await getAuthContext();
    if (!permitted(ctx)) return {success: false, error: "Permission denied"};
    const db = await createClient(), config = RECRUITMENT_INQUIRY_CONFIG[p.kind], fields: readonly HrOperationsField[] = config.fields;
    const hasCandidate = p.kind !== "candidates" && p.kind !== "requisitions";
    const candidateJoin=hasCandidate&&(!!p.search||Object.entries(p.columnFilters).some(([key,value])=>value&&isCandidateField(p.kind,key))||readSortPriority(p).some(sort=>isCandidateField(p.kind,sort.id)));
    let selection = projection(p.kind, Object.entries(p.columnFilters).some(([key, value]) => value && isCandidateField(p.kind, key)),candidateJoin);
    if (p.search && hasCandidate) selection += ",search_candidate:hr_candidates!candidate_id(id)";
    const query = (head = false) => {
      const q = db.from(config.table).select(selection, {count: "exact", head}).is("deleted_at", null);
      if (p.search) {
        const clauses: string[] = [];
        for (const field of fields) {
          if (isCandidateField(p.kind, field.id)) continue;
          if (field.type === "text" || field.type === "select") clauses.push(`${field.id}.ilike.${literalContains(p.search)}`);
          else if (field.type === "date" && operationsRealDate(p.search)) {
            if (timestampFields.has(field.id)) {const [from, to] = dayRange(p.search); clauses.push(`and(${field.id}.gte.${from},${field.id}.lt.${to})`);}
            else clauses.push(`${field.id}.eq.${p.search}`);
          }
        }
        if (hasCandidate) {
          q.or(`full_name_en.ilike.${literalContains(p.search)},full_name_ar.ilike.${literalContains(p.search)},candidate_code.ilike.${literalContains(p.search)}`, {referencedTable: "search_candidate"});
          clauses.push("search_candidate.not.is.null");
        }
        q.or(clauses.join(","));
      }
      for (const field of fields) {
        const value = p.columnFilters[field.id]; if (!value) continue;
        if (isCandidateField(p.kind, field.id)) {
          if (field.id === "candidate_name") q.or(`full_name_en.ilike.${literalContains(value)},full_name_ar.ilike.${literalContains(value)}`, {referencedTable: "candidate"});
          else q.ilike("candidate.candidate_code", literalLike(value));
        } else if (field.type === "text") q.ilike(field.id, literalLike(value));
        else if (field.type === "date" && timestampFields.has(field.id)) {const [from, to] = dayRange(value); q.gte(field.id, from).lt(field.id, to);}
        else q.eq(field.id, value);
      }
      if (!head) {
        for (const sort of readSortPriority(p)) q.order(isCandidateField(p.kind, sort.id) ? `candidate(${candidateFields[sort.id]})` : sort.id, {ascending: !sort.desc, nullsFirst: false});
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
    if(error)throw Error("Incomplete result");
    rows=await hydrateLabels(db,p.kind,rows,candidateJoin);
    const safe = recruitmentInquiryPageSchema.safeParse({kind: p.kind, page: p.page, pageSize: p.pageSize, totalCount: count, rows});
    if (error || !safe.success) throw Error("Incomplete result");
    return {success: true, data: safe.data, updatedAt: Date.now()};
  } catch {return {success: false, error: "Recruitment records could not be completely loaded. Please retry."};}
}

export async function readRecruitmentRequisitionDetail(input: unknown) {
  const parsed = recruitmentRequisitionDetailCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid requisition criteria"};
  try {
    if (!permitted(await getAuthContext())) return {success: false, error: "Permission denied"};
    const db = await createClient();
    const result = await db.from("hr_job_requisitions").select(projection("requisitions", false) + ",workspace_revision,job_description,requirements,notes").eq("id", parsed.data.recordId).is("deleted_at", null).maybeSingle();
    const safe = recruitmentRequisitionDetailSchema.safeParse(result.data?(await hydrateLabels(db,"requisitions",[result.data],false))[0]:null);
    if (result.error || !safe.success || safe.data.id !== parsed.data.recordId) throw Error("Unavailable requisition");
    return {success: true, data: safe.data};
  } catch {return {success: false, error: "The complete requisition is unavailable. Refresh or retry."};}
}

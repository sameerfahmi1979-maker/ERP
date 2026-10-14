import "server-only";
import {hasHrReadCapability} from "@/lib/reads/hr-read-identity";
import {hrSubjectPermission} from "./hr-subject-access";
import {readSortPriority} from "@/lib/reads/read-sorting";
import {getAuthContext, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalContains, literalLike} from "@/lib/reads/search";
import {operationsRealDate, type HrOperationsField} from "@/lib/reads/hr-operations-schema";
import {HR_ACTION_RECORD_CONFIG, hrActionRecordCriteriaSchema, hrActionRecordDetailCriteriaSchema, hrActionRecordPageSchema, hrActionRecordDetailSchema, type HrActionRecordKind} from "@/lib/reads/hr-action-records-schema";

/** Existing caller/native subject and related-label policies stay authoritative.
 * No service-role business read, SQL view, grant, mutation or policy change. */
const projections = {
  pro: "id,employee_id,process_title,process_status,priority,request_date,target_date,created_at",
  actions: "id,employee_id,action_title,action_type,action_status,action_date,due_date",
  performance: "id,employee_id,review_type,status,review_date,review_period_start,review_period_end,rating",
  disciplinary: "id,employee_id,subject,disciplinary_type,severity,status,record_date,incident_date,acknowledged_by_employee",
  notes: "id,employee_id,note_type,visibility,created_at",
  approvals: "id,employee_id,request_title,request_status,approval_type,requested_at",
  eos: "id,employee_id,eos_type,case_status,last_working_date,notice_date,final_settlement_status,clearance_completed,created_at",
  clearance: "id,employee_id,eos_case_id,item_title,clearance_area,item_status,created_at",
} as const;
const audit = "created_at,updated_at,created_by,updated_by,deleted_at", relationship = "related_record_type,related_record_id";
const details = {
  pro: `${projections.pro},${audit},${relationship},process_type_id,submitted_date,completed_date,assigned_to,related_document_id,notes,process_type:hr_pro_process_types(name_en),assigned_to_profile:user_profiles!assigned_to(display_name)`,
  actions: `${projections.actions},${audit},${relationship},assigned_to,dms_document_id,requires_approval,approval_request_id,notes`,
  performance: `${projections.performance},${audit},reviewer_id,summary,strengths,improvement_areas,next_review_date,dms_document_id,reviewer:user_profiles!reviewer_id(display_name)`,
  disciplinary: `${projections.disciplinary},${audit},description,action_taken,issued_by,acknowledged_at,dms_document_id,creates_operational_block,operational_block_id,issued_by_profile:user_profiles!issued_by(display_name)`,
  notes: `${projections.notes},${relationship},note_text,created_by,deleted_at`,
  approvals: `${projections.approvals},${audit},${relationship},approval_role_id,requested_by,approved_by,approved_at,rejected_by,rejected_at,cancelled_by,cancelled_at,decision_reason,approval_role:approval_roles(name:role_name),requested_by_profile:user_profiles!requested_by(display_name)`,
  eos: `${projections.eos},${audit},reason,notes,dms_document_id`,
  clearance: `${projections.clearance},${audit},responsible_user_id,cleared_by,cleared_at,notes`,
} as const;
function permitted(ctx: AuthContext, kind: HrActionRecordKind) {
  const eos = kind === "eos" || kind === "clearance";
  return (hasHrReadCapability(ctx, "hr.actions.view") || eos && hasHrReadCapability(ctx, "hr.eos.view")) && (!HR_ACTION_RECORD_CONFIG[kind].confidential || hasHrReadCapability(ctx, "hr.confidential.view"));
}
async function subjectPermitted(db: Awaited<ReturnType<typeof createClient>>, employeeId:number, kind:HrActionRecordKind) {
  const codes = ["hr.actions.view", ...((kind==="eos"||kind==="clearance")?["hr.eos.view"]:[]), ...(HR_ACTION_RECORD_CONFIG[kind].confidential?["hr.confidential.view"]:[])];
  const grants=await Promise.all(codes.map(code=>hrSubjectPermission(db,employeeId,code)));
  return (grants[0] || ((kind==="eos"||kind==="clearance")&&grants[1])) && (!HR_ACTION_RECORD_CONFIG[kind].confidential || grants.at(-1)===true);
}
async function verifyEosSubject(db: Awaited<ReturnType<typeof createClient>>, employeeId: number, eosCaseId: number) {
  const result = await db.from("employee_eos_cases").select("id,employee_id").eq("id", eosCaseId).eq("employee_id", employeeId).is("deleted_at", null).maybeSingle();
  if (result.error || result.data?.id !== eosCaseId || result.data?.employee_id !== employeeId) throw Error("Unavailable EOS subject");
}
const isTimestamp = (key: string) => key === "created_at" || key === "requested_at";
async function hasVisibleEmployee(db: Awaited<ReturnType<typeof createClient>>, employeeId: number) {
  const subject = await db.from("employees").select("id").eq("id", employeeId).is("deleted_at", null).maybeSingle();
  if (subject.error) throw Error("Employee authorization unavailable");
  if (!subject.data) return false;
  if (subject.data.id !== employeeId) throw Error("Employee response mismatch");
  return true;
}
const dayRange = (value: string) => [value + "T00:00:00Z", new Date(Date.parse(value + "T00:00:00Z") + 86400000).toISOString()];
export async function readHrActionRecords(input: unknown) {
  const parsed = hrActionRecordCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid HR action record criteria"};
  try {
    const p = parsed.data, ctx = await getAuthContext();
    if (!permitted(ctx, p.kind)) return {success: false, error: "Permission denied"};
    const config = HR_ACTION_RECORD_CONFIG[p.kind], fields: readonly HrOperationsField[] = config.fields, db = await createClient();
    if (!await hasVisibleEmployee(db, p.employeeId) || !await subjectPermitted(db,p.employeeId,p.kind)) return {success: false, error: "Permission denied"};
    if (p.kind === "clearance") await verifyEosSubject(db, p.employeeId, p.eosCaseId!);
    const query = (head = false) => {
      const q = db.from(config.table).select(projections[p.kind], {count: "exact", head}).eq("employee_id", p.employeeId).is("deleted_at", null);
      if (p.kind === "clearance") q.eq("eos_case_id", p.eosCaseId!);
      if (p.search) {
        const clauses = [...config.bodySearch].map(column => `${column}.ilike.${literalContains(p.search)}`);
        for (const f of fields) {
          if (f.type === "text" || f.type === "select") clauses.push(`${f.id}.ilike.${literalContains(p.search)}`);
          else if (f.type === "date" && operationsRealDate(p.search)) {
            if (isTimestamp(f.id)) {const [from, to] = dayRange(p.search); clauses.push(`and(${f.id}.gte.${from},${f.id}.lt.${to})`);}
            else clauses.push(`${f.id}.eq.${p.search}`);
          }
        }
        q.or(clauses.join(","));
      }
      for (const f of fields) {
        const value = p.columnFilters[f.id]; if (!value) continue;
        if (f.type === "text") q.ilike(f.id, literalLike(value));
        else if (f.type === "date" && isTimestamp(f.id)) {const [from, to] = dayRange(value); q.gte(f.id, from).lt(f.id, to);}
        else q.eq(f.id, value);
      }
      if (!head) {
        const priority = readSortPriority(p);
        for (const sort of priority) q.order(sort.id, {ascending: !sort.desc, nullsFirst: false});
        if (p.kind === "clearance" && priority[0].id === "clearance_area" && !priority.some(sort => sort.id === "created_at")) q.order("created_at", {ascending: true, nullsFirst: false});
        q.order("id", {ascending: true});
      }
      return q;
    };
    const from = (p.page - 1) * p.pageSize, result = await query().range(from, from + p.pageSize - 1);
    let rows: unknown = result.data, count = result.count, error = result.error;
    if (from > 0 && result.status === 416 && result.error?.code === "PGRST103") {
      const counted = await query(true);
      if (counted.error || counted.count === null || !Number.isSafeInteger(counted.count) || counted.count < 0 || counted.count > from) throw Error("Unverified HR action range");
      rows = []; count = counted.count; error = null;
    }
    const safe = hrActionRecordPageSchema.safeParse({kind: p.kind, employeeId: p.employeeId, ...(p.eosCaseId ? {eosCaseId: p.eosCaseId} : {}), rows, totalCount: count, page: p.page, pageSize: p.pageSize});
    if (error || !safe.success) throw Error("Incomplete HR action page");
    return {success: true, data: safe.data};
  } catch {return {success: false, error: "HR action records could not be completely loaded. Please retry."};}
}
export async function readHrActionRecordDetail(input: unknown) {
  const parsed = hrActionRecordDetailCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid HR action detail criteria"};
  try {
    const p = parsed.data, ctx = await getAuthContext();
    if (!permitted(ctx, p.kind)) return {success: false, error: "Permission denied"};
    const db = await createClient();
    if (!await hasVisibleEmployee(db, p.employeeId) || !await subjectPermitted(db,p.employeeId,p.kind)) return {success: false, error: "Permission denied"};
    if (p.kind === "clearance") await verifyEosSubject(db, p.employeeId, p.eosCaseId!);
    const projection: string = details[p.kind];
    let query = db.from(HR_ACTION_RECORD_CONFIG[p.kind].table).select(projection).eq("employee_id", p.employeeId).eq("id", p.recordId).is("deleted_at", null);
    if (p.kind === "clearance") query = query.eq("eos_case_id", p.eosCaseId!);
    const result = await query.maybeSingle(), safe = hrActionRecordDetailSchema.safeParse({kind: p.kind, employeeId: p.employeeId, ...(p.eosCaseId ? {eosCaseId: p.eosCaseId} : {}), row: result.data});
    if (result.error || !safe.success || safe.data.row.id !== p.recordId) throw Error("Unavailable HR action detail");
    return {success: true, data: safe.data};
  } catch {return {success: false, error: "The complete HR action record is unavailable. Refresh or retry."};}
}

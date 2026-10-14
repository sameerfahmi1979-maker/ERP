import "server-only";
import {hasHrReadCapability} from "@/lib/reads/hr-read-identity";
import {hrSubjectPermission} from "./hr-subject-access";
import {readSortPriority} from "@/lib/reads/read-sorting";
import {getAuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalContains, literalLike} from "@/lib/reads/search";
import {HR_OPERATION_RECORD_CONFIG, hrOperationRecordCriteriaSchema, hrOperationRecordDetailCriteriaSchema, hrOperationRecordPageSchema, hrOperationRecordDetailSchema} from "@/lib/reads/hr-operation-records-schema";
import {operationsRealDate, type HrOperationsField} from "@/lib/reads/hr-operations-schema";
/** Static projections reproduce the permitted ORIGINAL labels. Native row and
 * related-label RLS remains authoritative; no privileged business read. */
const projections = {
  assignments: "id,assignment_type,assignment_status,effective_from,effective_to,departments(id,name_en:department_name_en),designations(id,name_en:designation_name_en),work_sites(id,name_en:site_name)",
  requirements: "id,requirement_type,requirement_name,is_required,is_met,status,expiry_date",
  readiness: "id,readiness_status,checked_at,work_sites(id,name_en:site_name)",
  blocks: "id,block_type,block_reason,block_status,effective_from,effective_to,created_at",
  assets: "id,asset_type,asset_reference,asset_description,issued_date,return_due_date,returned_date,status",
  ppe: "id,ppe_item,standard_or_size,quantity,issued_date,expiry_or_replacement_date,returned_date,status",
  accommodation: "id,accommodation_type,accommodation_location,room_or_bed_no,assigned_from,assigned_to,status",
} as const;
const details = {
  assignments: `${projections.assignments},notes,created_at,updated_at,owner_companies(id,name:legal_name_en),branches(id,name:branch_name_en),reporting_manager:employees!employee_assignments_reporting_manager_id_fkey(id,full_name_en,employee_code),supervisor:employees!employee_assignments_supervisor_id_fkey(id,full_name_en,employee_code)`,
  requirements: `${projections.requirements},waived_at,waiver_reason,met_record_type,met_record_id,created_at,updated_at,designations(id,name_en:designation_name_en)`,
  readiness: `${projections.readiness},notes,missing_requirements_json,hr_access_card_types(id,name_en)`,
  blocks: `${projections.blocks},released_at,release_reason,related_record_type,notes`,
  assets: `${projections.assets},condition_on_issue,condition_on_return,notes,created_at`,
  ppe: `${projections.ppe},notes,created_at`,
  accommodation: `${projections.accommodation},notes,created_at`,
} as const;
const related = {site_name: {alias: "work_sites", column: "site_name"}, department_name: {alias: "departments", column: "department_name_en"}, designation_name: {alias: "designations", column: "designation_name_en"}} as const;
async function hasVisibleEmployee(db: Awaited<ReturnType<typeof createClient>>, employeeId: number) {
  const subject = await db.from("employees").select("id").eq("id", employeeId).is("deleted_at", null).maybeSingle();
  if (subject.error) throw Error("Employee authorization unavailable");
  if (!subject.data) return false;
  if (subject.data.id !== employeeId) throw Error("Employee response mismatch");
  return true;
}
export async function readHrOperationRecords(input: unknown) {
  const parsed = hrOperationRecordCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid operational record criteria"};
  try {
    const ctx = await getAuthContext();
    if (!hasHrReadCapability(ctx, "hr.assignments.view")) return {success: false, error: "Permission denied"};
    const p = parsed.data, config = HR_OPERATION_RECORD_CONFIG[p.kind], fields: readonly HrOperationsField[] = config.fields, db = await createClient();
    if (!await hasVisibleEmployee(db, p.employeeId) || !await hrSubjectPermission(db,p.employeeId,"hr.assignments.view")) return {success: false, error: "Permission denied"};
    let projection: string = projections[p.kind];
    for (const [key, value] of Object.entries(p.columnFilters)) if (value && key in related) {const r = related[key as keyof typeof related]; projection = projection.replace(`${r.alias}(`, `${r.alias}!inner(`);}
    if (p.search) for (const f of fields) if (f.id in related) {const r = related[f.id as keyof typeof related]; projection += `,search_${r.alias}:${r.alias}(id)`;}
    const query = (head = false) => {
      const q = db.from(config.table).select(projection, {count: "exact", head}).eq("employee_id", p.employeeId).is("deleted_at", null);
      if (p.search) {
        const clauses: string[] = [];
        for (const f of fields) {
          if (f.id in related) {const r = related[f.id as keyof typeof related]; q.ilike(`search_${r.alias}.${r.column}`, literalLike(p.search)); clauses.push(`search_${r.alias}.not.is.null`);}
          else if (f.type === "text" || f.type === "select") clauses.push(`${f.id}.ilike.${literalContains(p.search)}`);
          else if (f.type === "number" && /^\d+(\.\d+)?$/.test(p.search) && Number.isFinite(Number(p.search))) clauses.push(`${f.id}.eq.${Number(p.search)}`);
          else if (f.type === "date" && operationsRealDate(p.search)) {
            if (f.id === "checked_at" || f.id === "created_at") {const time = Date.parse(`${p.search}T00:00:00Z`); if (Number.isFinite(time)) clauses.push(`and(${f.id}.gte.${p.search}T00:00:00Z,${f.id}.lt.${new Date(time + 86400000).toISOString()})`);}
            else clauses.push(`${f.id}.eq.${p.search}`);
          }
        }
        q.or(clauses.join(","));
      }
      for (const f of fields) {
        const value = p.columnFilters[f.id]; if (!value) continue;
        if (f.id in related) {const r = related[f.id as keyof typeof related]; q.ilike(`${r.alias}.${r.column}`, literalLike(value));}
        else if (f.type === "text") q.ilike(f.id, literalLike(value));
        else if (f.type === "number") q.eq(f.id, Number(value));
        else if (f.id === "checked_at" || f.id === "created_at") {q.gte(f.id, `${value}T00:00:00Z`); q.lt(f.id, new Date(Date.parse(`${value}T00:00:00Z`) + 86400000).toISOString());}
        else q.eq(f.id, value);
      }
      if (!head) {
        for (const sort of readSortPriority(p)) {
          const r = sort.id in related ? related[sort.id as keyof typeof related] : null;
          q.order(r ? `${r.alias}(name_en)` : sort.id, {ascending: !sort.desc, nullsFirst: false});
        }
        q.order("id", {ascending: true});
      }
      return q;
    };
    const from = (p.page - 1) * p.pageSize, result = await query().range(from, from + p.pageSize - 1);
    let rows: unknown = result.data, count = result.count, error = result.error;
    if (from > 0 && result.status === 416 && result.error?.code === "PGRST103") {
      const counted = await query(true);
      if (counted.error || counted.count === null || !Number.isSafeInteger(counted.count) || counted.count < 0 || counted.count > from) throw Error("Unverified operational record range");
      rows = []; count = counted.count; error = null;
    }
    const safe = hrOperationRecordPageSchema.safeParse({kind: p.kind, employeeId: p.employeeId, rows, totalCount: count, page: p.page, pageSize: p.pageSize});
    if (error || !safe.success) throw Error("Incomplete operational record page");
    return {success: true, data: safe.data};
  } catch {return {success: false, error: "Operational records could not be completely loaded. Please retry."};}
}
export async function readHrOperationRecordDetail(input: unknown) {
  const parsed = hrOperationRecordDetailCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid operational record detail criteria"};
  try {
    const ctx = await getAuthContext();
    if (!hasHrReadCapability(ctx, "hr.assignments.view")) return {success: false, error: "Permission denied"};
    const p = parsed.data, db = await createClient(), projection: string = details[p.kind];
    if (!await hasVisibleEmployee(db, p.employeeId) || !await hrSubjectPermission(db,p.employeeId,"hr.assignments.view")) return {success: false, error: "Permission denied"};
    const result = await db.from(HR_OPERATION_RECORD_CONFIG[p.kind].table).select(projection).eq("employee_id", p.employeeId).eq("id", p.recordId).is("deleted_at", null).maybeSingle();
    const safe = hrOperationRecordDetailSchema.safeParse({kind: p.kind, employeeId: p.employeeId, row: result.data});
    if (result.error || !safe.success || safe.data.row.id !== p.recordId) throw Error("Unavailable operational record detail");
    return {success: true, data: safe.data};
  } catch {return {success: false, error: "Operational record detail is unavailable. Refresh the records or retry."};}
}

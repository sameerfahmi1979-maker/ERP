import "server-only";
import {readSortPriority} from "@/lib/reads/read-sorting";
import {getAuthContext, hasPermission, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalContains, literalLike} from "@/lib/reads/search";
import {operationsRealDate} from "@/lib/reads/hr-operations-schema";
import {HR_ACTION_RECORD_CONFIG, hrActionRecordRowSchemas, hrActionRecordDetailSchemas} from "@/lib/reads/hr-action-records-schema";
import {HR_ACTION_INQUIRY_FIELDS, hrActionInquiryCriteriaSchema, hrActionInquiryPageSchema, hrDisciplinaryInquiryDetailCriteriaSchema, hrDisciplinaryInquiryDetailSchema, type HrActionInquiryKind, type HrActionInquiryPage} from "@/lib/reads/hr-action-inquiries-schema";

const employeeProjection = "employee:employees!employee_id(full_name_en,full_name_ar,employee_code)";
const employeeFields = {employee_name: "full_name_en", employee_code: "employee_code"} as const;
const isEmployeeField = (key: string): key is keyof typeof employeeFields => key in employeeFields;
const isTimestamp = (key: string) => key === "created_at" || key === "requested_at";
const dayRange = (value: string) => [value + "T00:00:00Z", new Date(Date.parse(value + "T00:00:00Z") + 86400000).toISOString()];
function permitted(ctx: AuthContext, kind: HrActionInquiryKind) {
  return (hasPermission(ctx, "hr.actions.view") || kind === "eos" && hasPermission(ctx, "hr.eos.view")) && (kind !== "disciplinary" || hasPermission(ctx, "hr.confidential.view"));
}

/** Reads use the caller's native business/employee policies. Search joins never
 * collect a capped intermediary employee-ID list or reveal a protected label. */
export async function readHrActionInquiry(input: unknown, context?: AuthContext): Promise<{success: boolean; data?: HrActionInquiryPage; updatedAt?: number; error?: string}> {
  const parsed = hrActionInquiryCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid HR inquiry criteria"};
  try {
    const p = parsed.data, ctx = context ?? await getAuthContext();
    if (!permitted(ctx, p.kind)) return {success: false, error: "Permission denied"};
    const config = HR_ACTION_RECORD_CONFIG[p.kind], fields = HR_ACTION_INQUIRY_FIELDS[p.kind], db = await createClient();
    // These schemas contain static reviewed native column names, never input.
    let projection = Object.keys(hrActionRecordRowSchemas[p.kind].shape).join(",");
    if (p.kind === "disciplinary") {
      const inner = Object.entries(p.columnFilters).some(([key, value]) => value && isEmployeeField(key));
      projection += "," + (inner ? employeeProjection.replace("!employee_id(", "!employee_id!inner(") : employeeProjection);
      if (p.search) projection += ",search_employee:employees!employee_id(id)";
    }
    const query = (head = false) => {
      const q = db.from(config.table).select(projection, {count: "exact", head}).is("deleted_at", null);
      if (p.search) {
        const clauses = [...config.bodySearch].map(column => `${column}.ilike.${literalContains(p.search)}`);
        for (const f of fields) {
          if (isEmployeeField(f.id)) continue;
          if (f.id === "clearance_completed") {if (/^(true|false)$/.test(p.search)) clauses.push(`${f.id}.eq.${p.search}`);}
          else if (f.type === "text" || f.type === "select") clauses.push(`${f.id}.ilike.${literalContains(p.search)}`);
          else if (f.type === "date" && operationsRealDate(p.search)) {
            if (isTimestamp(f.id)) {const [from, to] = dayRange(p.search); clauses.push(`and(${f.id}.gte.${from},${f.id}.lt.${to})`);}
            else clauses.push(`${f.id}.eq.${p.search}`);
          }
        }
        if (p.kind === "disciplinary") {
          q.or(`full_name_en.ilike.${literalContains(p.search)},full_name_ar.ilike.${literalContains(p.search)},employee_code.ilike.${literalContains(p.search)}`, {referencedTable: "search_employee"});
          clauses.push("search_employee.not.is.null");
        }
        q.or(clauses.join(","));
      }
      for (const f of fields) {
        const value = p.columnFilters[f.id]; if (!value) continue;
        if (f.id === "employee_name") q.or(`full_name_en.ilike.${literalContains(value)},full_name_ar.ilike.${literalContains(value)}`, {referencedTable: "employee"});
        else if (f.id === "employee_code") q.ilike("employee.employee_code", literalLike(value));
        else if (f.id === "clearance_completed") q.eq(f.id, value === "true");
        else if (f.type === "text") q.ilike(f.id, literalLike(value));
        else if (f.type === "date" && isTimestamp(f.id)) {const [from, to] = dayRange(value); q.gte(f.id, from).lt(f.id, to);}
        else q.eq(f.id, value);
      }
      if (!head) {
        for (const sort of readSortPriority(p)) q.order(isEmployeeField(sort.id) ? `employee(${employeeFields[sort.id]})` : sort.id, {ascending: !sort.desc, nullsFirst: false});
        q.order("id", {ascending: true});
      }
      return q;
    };
    const from = (p.page - 1) * p.pageSize, result = await query().range(from, from + p.pageSize - 1);
    let rows: unknown = result.data, count = result.count, error = result.error;
    if (from > 0 && result.status === 416 && result.error?.code === "PGRST103") {
      const counted = await query(true);
      if (counted.error || counted.count === null || !Number.isSafeInteger(counted.count) || counted.count < 0 || counted.count > from) throw Error("Unverified HR inquiry range");
      rows = []; count = counted.count; error = null;
    }
    const safe = hrActionInquiryPageSchema.safeParse({kind: p.kind, rows, totalCount: count, page: p.page, pageSize: p.pageSize});
    if (error || !safe.success) throw Error("Incomplete HR inquiry result");
    return {success: true, data: safe.data, updatedAt: Date.now()};
  } catch {return {success: false, error: "HR records could not be completely loaded. Please retry."};}
}

export async function readHrDisciplinaryInquiryDetail(input: unknown) {
  const parsed = hrDisciplinaryInquiryDetailCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid disciplinary detail criteria"};
  try {
    const ctx = await getAuthContext();
    if (!permitted(ctx, "disciplinary")) return {success: false, error: "Permission denied"};
    const db = await createClient();
    const projection = Object.keys(hrActionRecordDetailSchemas.disciplinary.shape).filter(k => k !== "issued_by_profile").join(",") + ",issued_by_profile:user_profiles!issued_by(display_name)," + employeeProjection;
    const result = await db.from("employee_disciplinary_records").select(projection).eq("id", parsed.data.recordId).eq("employee_id", parsed.data.employeeId).is("deleted_at", null).maybeSingle();
    const safe = hrDisciplinaryInquiryDetailSchema.safeParse(result.data);
    if (result.error || !safe.success || safe.data.id !== parsed.data.recordId || safe.data.employee_id !== parsed.data.employeeId) throw Error("Unavailable detail");
    return {success: true, data: safe.data};
  } catch {return {success: false, error: "The complete disciplinary record is unavailable. Refresh or retry."};}
}

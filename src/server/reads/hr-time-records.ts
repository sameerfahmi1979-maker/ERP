import "server-only";
import {z} from "zod";
import {createTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel} from "@tanstack/table-core";
import {getAuthContext, canUseApplication, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {collectCompletePages} from "@/lib/reads/complete-pages";
import {TIME_RECORD_CONFIG, timeRecordCriteriaSchema, timeRecordRowSchemas, timeRecordDetailSchemas, timeRecordPageSchema,
  timeRecordDetailSchema, timeRecordRestrictedSchema, timeRecordUnavailableSchema, timeHistoryUnavailableSchema, type TimeRecordKind} from "@/lib/reads/hr-time-records-schema";

const subjectSchema = z.object({id: z.number().int().positive().refine(Number.isSafeInteger)}).strip();
const summarySchema = subjectSchema.extend({employee_id: subjectSchema.shape.id});
const joins: Partial<Record<TimeRecordKind, Record<string, string>>> = {
  shifts: {work_calendar: "work_calendars!employee_shift_assignments_work_calendar_id_fkey(calendar_name)", work_shift: "work_shifts!employee_shift_assignments_work_shift_id_fkey(shift_name)"},
  leave: {leave_type: "hr_leave_types!employee_leave_requests_leave_type_id_fkey(name_en,code)"},
  balances: {leave_type: "hr_leave_types!employee_leave_balances_leave_type_id_fkey(name_en,code)"},
};
function projection(kind: TimeRecordKind, detail: boolean) {
  return Object.keys((detail ? timeRecordDetailSchemas : timeRecordRowSchemas)[kind].shape).map(key => joins[kind]?.[key] ? `${key}:${joins[kind]![key]}` : key).join(",");
}
function compose(rows: Record<string, unknown>[], p: z.infer<typeof timeRecordCriteriaSchema> & {operation: "page"}) {
  const config = TIME_RECORD_CONFIG[p.kind], fields = [...new Set([...config.fields.map(f => f.id), config.sort])];
  const sorting = p.sorting !== undefined ? p.sorting : p.sortKey !== config.sort || p.sortDir !== "desc" ? [{id: p.sortKey, desc: p.sortDir === "desc"}] : [];
  const table = createTable({data: rows, columns: fields.map(id => ({id, accessorFn: (row: Record<string, unknown>) => String(row[id] ?? ""), enableGlobalFilter: config.fields.some(f => f.id === id)})),
    state: {sorting, globalFilter: p.search, columnFilters: Object.entries(p.columnFilters).map(([id, value]) => ({id, value}))}, onStateChange: () => {}, renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getSortedRowModel: getSortedRowModel()});
  return table.getSortedRowModel().rows.map(row => row.original);
}

/** Ordinary request-bound subject reads. Existing native F03 policies remain
 * authoritative, including leave view-or-manage and immutable history tables. */
export async function readHrTimeRecords(input: unknown, context?: AuthContext, signal?: AbortSignal) {
  const parsed = timeRecordCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false as const, error: "Invalid time record criteria"};
  try {
    signal?.throwIfAborted();
    const ctx = context ?? await getAuthContext(); signal?.throwIfAborted();
    if (!canUseApplication(ctx)) return {success: false as const, error: "Permission denied"};
    const db = await createClient(), p = parsed.data, config = TIME_RECORD_CONFIG[p.kind];
    const bind = <T extends {abortSignal: (s: AbortSignal) => T}>(query: T): T => signal ? query.abortSignal(signal) : query;
    const subject = await bind(db.from("employees").select("id").eq("id", p.employeeId).is("deleted_at", null)).maybeSingle();
    signal?.throwIfAborted();
    if (subject.error) throw Error("Employee authorization unavailable");
    if (!subject.data) return {success: false as const, error: "Permission denied"};
    if (subjectSchema.parse(subject.data).id !== p.employeeId) throw Error("Employee response mismatch");
    const permissions = new Map<string, Promise<boolean>>();
    const permitted = (code: string) => {
      if (!permissions.has(code)) permissions.set(code, (async () => {
        signal?.throwIfAborted();
        const result = await bind(db.rpc("f03_has_employee_permission", {employee_id: p.employeeId, permission_code: code})); signal?.throwIfAborted();
        if (result.error) throw Error("Time capability unavailable");
        return z.boolean().parse(result.data);
      })());
      return permissions.get(code)!;
    };
    const leave = p.kind === "leave" || p.kind === "balances", code = leave ? "hr.leave" : "hr.attendance";
    const [view, manage] = await Promise.all([permitted(`${code}.view`), permitted(`${code}.manage`)]);
    const pageScope = {...(p.summaryId !== undefined ? {summaryId: p.summaryId} : {}), ...(p.operation === "page" && p.year !== undefined ? {year: p.year} : {})};
    if (!view && !(leave && manage)) return {success: true as const, data: timeRecordRestrictedSchema.parse({operation: p.operation, kind: p.kind, employeeId: p.employeeId, ...pageScope, availability: "restricted"})};
    // Native writes additionally require employee-management authority. These
    // booleans are current UI admission only; no business action is replaced.
    const employeeManage = manage && (await permitted("hr.employees.update") || await permitted("hr.employee_profile.manage"));
    const access = {canManage: manage && employeeManage};
    if (p.kind === "corrections") {
      const parent = await bind(db.from("employee_attendance_daily_summary").select("id,employee_id").eq("id", p.summaryId!).eq("employee_id", p.employeeId)).maybeSingle();
      signal?.throwIfAborted();
      if (parent.error) throw Error("Selected attendance unavailable");
      if (!parent.data) return {success: true as const, data: p.operation === "page"
        ? timeHistoryUnavailableSchema.parse({operation: "page", kind: "corrections", employeeId: p.employeeId, summaryId: p.summaryId, availability: "unavailable"})
        : timeRecordUnavailableSchema.parse({...p, availability: "unavailable"})};
      const row = summarySchema.parse(parent.data);
      if (row.id !== p.summaryId || row.employee_id !== p.employeeId) throw Error("Selected attendance mismatch");
    }
    const query = (select: string, head = false) => {
      const q = bind(db.from(config.table).select(select, {count: "exact", head}).eq("employee_id", p.employeeId));
      if (config.deleted) q.is("deleted_at", null);
      if (p.kind === "corrections") q.eq("summary_id", p.summaryId!);
      if (p.operation === "page" && p.kind === "balances" && p.year !== undefined) q.eq("leave_year", p.year);
      return q;
    };
    if (p.operation === "detail") {
      const result = await query(projection(p.kind, true)).eq("id", p.recordId).maybeSingle(); signal?.throwIfAborted();
      if (result.error) throw Error("Time detail unavailable");
      if (!result.data) return {success: true as const, data: timeRecordUnavailableSchema.parse({...p, availability: "unavailable"})};
      return {success: true as const, data: timeRecordDetailSchema.parse({...p, row: result.data, access})};
    }
    const ordered = (select: string) => {
      const q = query(select).order(config.sort, {ascending: false});
      if (p.kind === "balances") q.order("leave_type_id", {ascending: true});
      return q.order("id", {ascending: true});
    };
    const from = (p.page - 1) * p.pageSize;
    let rows: unknown, totalCount: number | null;
    const requiresComposition = !!p.search || Object.values(p.columnFilters).some(Boolean) || !!p.sorting?.length || p.sortKey !== config.sort || p.sortDir !== "desc";
    if (requiresComposition) {
      const keys = [...new Set(["id", config.sort, ...(p.kind === "balances" ? ["leave_type_id"] : []), ...config.fields.map(f => f.id)])];
      const metadataSchema = z.object({id: subjectSchema.shape.id, ...Object.fromEntries(keys.filter(key => key !== "id").map(key => [key, p.kind === "balances" ? z.number().int() : z.string().nullable()]))}).strip();
      const metadata = await collectCompletePages(async (start, end) => {
        const result = await ordered(keys.join(",")).range(start, end); signal?.throwIfAborted();
        return {...result, data: result.error ? null : z.array(metadataSchema).parse(result.data)};
      }, {signal, identity: row => row.id, maxRows: 10000}); // Safe composition bound, not a business limit.
      signal?.throwIfAborted();
      const complete = compose(metadata, p), selected = complete.slice(from, from + p.pageSize); totalCount = complete.length;
      if (!selected.length) rows = [];
      else {
        const result = await query(projection(p.kind, false)).in("id", selected.map(row => Number(row.id))).order("id").range(0, p.pageSize - 1); signal?.throwIfAborted();
        if (result.error || result.count !== selected.length || !Array.isArray(result.data)) throw Error("Time records changed while loading");
        const projected = z.array(timeRecordRowSchemas[p.kind]).parse(result.data), byId = new Map(projected.map(row => [row.id, row]));
        if (byId.size !== selected.length) throw Error("Incomplete selected time records");
        rows = selected.map(row => {
          const current = byId.get(Number(row.id));
          if (!current || keys.some(key => row[key] !== (current as Record<string, unknown>)[key])) throw Error("Time filter or sort values changed while loading");
          return current;
        });
      }
    } else {
      const result = await ordered(projection(p.kind, false)).range(from, from + p.pageSize - 1); signal?.throwIfAborted();
      rows = result.data; totalCount = result.count;
      if (from > 0 && result.status === 416 && result.error?.code === "PGRST103") {
        const counted = await query(projection(p.kind, false), true); signal?.throwIfAborted();
        if (counted.error || counted.count === null || !Number.isSafeInteger(counted.count) || counted.count < 0 || counted.count > from) throw Error("Unverified time range");
        rows = []; totalCount = counted.count;
      } else if (result.error) throw Error("Time records unavailable");
    }
    signal?.throwIfAborted();
    return {success: true as const, data: timeRecordPageSchema.parse({operation: "page", kind: p.kind, employeeId: p.employeeId, ...pageScope, page: p.page, pageSize: p.pageSize, totalCount, rows, access})};
  } catch {return {success: false as const, error: "Time records could not be completely loaded within the safe read bound. Retry or narrow the criteria."};}
}

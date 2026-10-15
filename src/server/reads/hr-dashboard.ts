import "server-only";
import {z} from "zod";
import {getAuthContext, hasPermission, hasPermissionInScope, hasGlobalPermission, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {collectCompletePages} from "@/lib/reads/complete-pages";
import {hrDashboardCriteriaSchema, hrDashboardSchema, type HrDashboard, type HrDashboardMetric, type HrDashboardAttentionItem} from "@/lib/reads/hr-dashboard-schema";

const id = z.number().int().positive().refine(Number.isSafeInteger);
const employeeRow = z.object({id, employee_status: z.string(), joining_date: z.string().nullable(), employee_category_id: id.nullable(),
  owner_company_id: id.nullable(), branch_id: id.nullable(), employee_code: z.string().nullable(), full_name_en: z.string()}).strip();
type Employee = z.infer<typeof employeeRow>;
type NativeResult = {data: unknown; error: unknown; count: number | null};
type PageQuery = {range: (from: number, to: number) => PromiseLike<NativeResult>};
/** Structural fluent boundary; projection rows are validated below, not asserted
 * to share the SDK's projection-specific generic type. */
interface Selected extends PromiseLike<NativeResult> {
  eq(column: string, value: unknown): Selected;
  neq(column: string, value: unknown): Selected;
  is(column: string, value: null | boolean): Selected;
  in(column: string, values: readonly unknown[]): Selected;
  lt(column: string, value: unknown): Selected;
  lte(column: string, value: unknown): Selected;
  gte(column: string, value: unknown): Selected;
  not(column: string, operator: string, value: unknown): Selected;
  or(filters: string): Selected;
  order(column: string): Selected;
  range(from: number, to: number): Selected;
}
const ready = (value: number): HrDashboardMetric => ({status: "ready", value});
const restricted: HrDashboardMetric = {status: "restricted"};
const unknownScope: HrDashboardMetric = {status: "unavailable", reason: "scope"};
const failed: HrDashboardMetric = {status: "failed"};
async function exact(query: PromiseLike<NativeResult>) {
  const result = await query;
  if (result.error || result.count === null || !Number.isSafeInteger(result.count) || result.count < 0) throw Error("Dashboard count unavailable");
  return result.count;
}
async function complete<S extends z.ZodType<{id: number}>>(query: () => PageQuery, schema: S) {
  return collectCompletePages(async (from, to) => {
    const result = await query().range(from, to);
    if (result.error) throw Error("Dashboard collection unavailable");
    return {...result, data: z.array(schema).parse(result.data)};
  }, {identity: row => row.id, maxRows: 50000});
}
function chunks(rows: Employee[]) {return Array.from({length: Math.ceil(rows.length / 200)}, (_, i) => rows.slice(i * 200, i * 200 + 200).map(e => e.id));}

/** Request-local composition only. Every table read uses the authenticated F03
 * client; a dashboard capability never replaces table/subject/sensitive RLS. */
export async function readHrDashboard(input: unknown, context?: AuthContext): Promise<{success: boolean; data?: HrDashboard; error?: string}> {
  const parsed = hrDashboardCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid HR dashboard criteria"};
  try {
    const ctx = context ?? await getAuthContext();
    if (!hasPermission(ctx, "hr.dashboard.view") && !hasPermission(ctx, "hr.employees.view")) return {success: false, error: "Permission denied"};
    const db = await createClient(), filters = parsed.data;
    // Dynamic projection boundary: all returned rows/counts are checked by the
    // schemas below. This avoids pretending unrelated projections share a DTO.
    const select = (table: string, columns: string, head = false): Selected => db.from(table).select(columns, {count: "exact", head}) as unknown as Selected;
    const now = new Date(), today = now.toISOString().slice(0, 10);
    // Retain the original dashboard's server-local calendar boundaries.
    const future = (days: number) => {const date = new Date(now); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10);};
    const weekDay = (offset: number) => {const date = new Date(now); date.setDate(date.getDate() - date.getDay() + offset); return date.toISOString().slice(0, 10);};
    const month = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), soon = future(filters.expiryThresholdDays);
    const can = (code: string) => hasPermission(ctx, `hr.${code}.view`);
    const employeeQuery = (filtered: boolean) => {
      let query = db.from("employees").select("id,employee_status,joining_date,employee_category_id,owner_company_id,branch_id,employee_code,full_name_en", {count: "exact"}).is("deleted_at", null);
      if (filtered) for (const [key, column] of [["ownerCompanyId", "owner_company_id"], ["branchId", "branch_id"], ["departmentId", "department_id"], ["designationId", "designation_id"]] as const) {
        if (filters[key] != null) query = query.eq(column, filters[key]);
      }
      return query.order("id");
    };
    const employees = await complete(() => employeeQuery(true), employeeRow);
    const active = employees.filter(e => ["active", "probation"].includes(e.employee_status));
    const allIds = chunks(employees), activeIds = chunks(active);
    // Missing-row calculations need authority over their denominator, not just
    // a flat capability belonging to another company/branch assignment.
    const covers = (code: string) => hasGlobalPermission(ctx, `hr.${code}.view`) || active.every(e => e.owner_company_id !== null && hasPermissionInScope(ctx, `hr.${code}.view`, e.owner_company_id, e.branch_id));
    const tasks = new Map<string, Promise<number>>();
    const tally = (key: string, table: string, modify: (query: Selected) => Selected = q => q, scope: "all" | "active" | "global" = "all", softDelete = true) => {
      if (!tasks.has(key)) tasks.set(key, (async () => {
        const batches = scope === "global" ? [null] : scope === "active" ? activeIds : allIds;
        let total = 0;
        for (const ids of batches) {
          let query = select(table, "id", true);
          if (softDelete) query = query.is("deleted_at", null);
          if (ids) query = query.in("employee_id", ids);
          total += await exact(modify(query));
          if (!Number.isSafeInteger(total)) throw Error("Dashboard count exceeded safe bounds");
        }
        return total;
      })());
      return tasks.get(key)!;
    };
    const metric = async (allowed: boolean, read: () => Promise<number>): Promise<HrDashboardMetric> => {
      if (!allowed) return restricted;
      try {return ready(await read());} catch {return failed;}
    };
    const computed = (allowed: boolean, value: number) => allowed ? ready(value) : restricted;
    const countEmployees = (status: string[]) => employees.filter(e => status.includes(e.employee_status)).length;
    const employee: HrDashboard["employee"] = {
      total: computed(can("employees"), employees.length), active: computed(can("employees"), countEmployees(["active"])),
      probation: computed(can("employees"), countEmployees(["probation"])), on_leave: computed(can("employees"), countEmployees(["on_leave"])),
      suspended: computed(can("employees"), countEmployees(["suspended"])), terminated_archived: computed(can("employees"), countEmployees(["terminated", "resigned", "archived"])),
      new_joiners_this_month: computed(can("employees"), employees.filter(e => e.joining_date && e.joining_date >= month && e.joining_date <= today).length),
    };
    const m = (permission: string, key: string, table: string, modify?: (query: Selected) => Selected, scope?: "all" | "active" | "global", softDelete?: boolean) => metric(can(permission), () => tally(key, table, modify, scope, softDelete));
    const resolve = async <T extends Record<string, Promise<HrDashboardMetric> | HrDashboardMetric>>(values: T) => Object.fromEntries(await Promise.all(Object.entries(values).map(async ([k, v]) => [k, await v]))) as {[K in keyof T]: HrDashboardMetric};
    const blockFilter = (q: Selected) => q.eq("block_status", "active").or(`effective_to.is.null,effective_to.gte.${today}`);
    const blockedEmployees = async () => {
      const ids = new Set<number>();
      for (const batch of activeIds) {
        const rows = await complete(() => blockFilter(select("employee_operational_blocks", "id,employee_id").in("employee_id", batch).is("deleted_at", null)).order("id"), z.object({id, employee_id: id}).strip());
        rows.forEach(row => ids.add(row.employee_id));
      }
      return ids.size;
    };
    const payrollCoverage = can("payroll") && covers("payroll"), bankCoverage = payrollCoverage && can("banking") && covers("banking");
    const bankMetric = (key: string, query?: (q: Selected) => Selected) => !can("payroll") || !can("banking") ? Promise.resolve(restricted) : !bankCoverage ? Promise.resolve(unknownScope) : metric(true, () => tally(key, "employee_wps_profiles", query, "active"));
    const wpsTotal = bankMetric("wps-total"), wpsReady = bankMetric("wps-ready", q => q.not("iban", "is", null).neq("iban", "").not("bank_id", "is", null));
    const subtract = async (a: Promise<HrDashboardMetric>, b: Promise<HrDashboardMetric>) => {
      const [left, right] = await Promise.all([a, b]);
      return left.status !== "ready" ? left : right.status !== "ready" ? right : left.value < right.value ? failed : ready(left.value - right.value);
    };
    const profileCount = m("payroll", "profiles", "employee_payroll_profiles", undefined, "active");
    const [compliance, time, payroll, operations, actions, recruitment, complianceIssues, summaryBlocks, headcount, attention] = await Promise.all([
      resolve({expired_documents: m("compliance", "expired-docs", "employee_identity_documents", q => q.lt("expiry_date", today)),
        expiring_soon: m("compliance", "soon-docs", "employee_identity_documents", q => q.gte("expiry_date", today).lte("expiry_date", soon)),
        missing_unverified: m("compliance", "unverified", "employee_identity_documents", q => q.eq("verification_status", "pending")),
        active_access_cards: m("compliance", "cards-active", "employee_access_cards", q => q.eq("status", "active")),
        expired_access_cards: m("compliance", "cards-expired", "employee_access_cards", q => q.lt("expiry_date", today)),
        training_expiring_soon: m("compliance", "training-soon", "employee_training_certificates", q => q.gte("expiry_date", today).lte("expiry_date", soon)),
        // There is no validity/expiry column in medical records. next_examination_date
        // is NOT silently redefined as expiry; a business definition is required.
        medical_expired: can("compliance") && can("medical") ? {status: "unavailable", reason: "definition"} : restricted,
        linked_dms_documents: m("compliance", "dms-links", "employee_document_links")}),
      resolve({attendance_pending_approval: m("attendance", "attendance-pending", "employee_attendance_daily_summary", q => q.eq("approval_status", "pending"), "active", false),
        missing_punches: m("attendance", "missing-punches", "employee_attendance_daily_summary", q => q.eq("attendance_date", today).eq("is_missing_punch", true), "active", false),
        approved_leave_today: m("leave", "leave-today", "employee_leave_requests", q => q.eq("approval_status", "approved").lte("start_date", today).gte("end_date", today), "active"),
        pending_leave_requests: m("leave", "leave-pending", "employee_leave_requests", q => q.eq("approval_status", "pending"), "active"),
        overtime_pending_approval: m("attendance", "overtime-pending", "employee_overtime_records", q => q.eq("approval_status", "pending"), "active")}),
      resolve({payroll_profiles_configured: profileCount,
        missing_payroll_profile: !can("payroll") ? restricted : !payrollCoverage ? unknownScope : profileCount.then(p => p.status === "ready" ? ready(Math.max(0, active.length - p.value)) : p),
        wps_ready: wpsReady, wps_incomplete: subtract(wpsTotal, wpsReady),
        on_payroll_hold: m("payroll", "holds", "employee_payroll_holds", q => q.eq("is_active", true), "active"),
        // Legacy metric counts missing IBAN only, despite the old label mentioning bank.
        missing_iban_bank: bankMetric("missing-iban", q => q.or('iban.is.null,iban.eq.""'))}),
      resolve({current_assignments: m("assignments", "assignments", "employee_assignments", q => q.eq("assignment_status", "active"), "active"),
        ready_employees: m("assignments", "readiness-ready", "employee_site_readiness", q => q.eq("readiness_status", "ready"), "active"),
        not_ready_employees: m("assignments", "readiness-other", "employee_site_readiness", q => q.neq("readiness_status", "ready"), "active"),
        blocked_employees: metric(can("assignments"), blockedEmployees), active_blocks: m("assignments", "active-blocks", "employee_operational_blocks", blockFilter, "active"),
        assets_issued: m("assignments", "assets", "employee_assets", q => q.eq("status", "issued"), "active"),
        ppe_due_replacement: m("assignments", "ppe", "employee_ppe_issues", q => q.lt("expiry_or_replacement_date", today).is("returned_date", null), "active"),
        accommodation_active: m("assignments", "accommodation", "employee_accommodation_records", q => q.eq("status", "active"), "active")}),
      resolve({open_pro_processes: m("actions", "pro", "employee_pro_processes", q => q.in("process_status", ["pending", "in_progress"])),
        open_hr_actions: m("actions", "hr-actions", "employee_hr_actions", q => q.in("action_status", ["pending", "in_progress"])),
        pending_approvals: m("actions", "approvals", "employee_approval_requests", q => q.eq("request_status", "pending")),
        open_disciplinary: can("actions") ? m("confidential", "disciplinary", "employee_disciplinary_records", q => q.in("status", ["open", "under_review"])) : restricted,
        open_eos_cases: can("actions") ? m("eos", "eos", "employee_eos_cases", q => q.in("case_status", ["initiated", "in_progress", "pending_clearance"])) : restricted,
        // Retain legacy all-permitted clearance scope; it was never employee-filtered.
        pending_clearance_items: can("actions") ? m("eos", "clearance", "employee_clearance_items", q => q.eq("item_status", "pending"), "global") : restricted}),
      resolve({open_requisitions: m("recruitment", "req-open", "hr_job_requisitions", q => q.eq("requisition_status", "open"), "global"),
        active_candidates: m("recruitment", "candidates", "hr_candidates", q => q.in("candidate_status", ["active", "in_review", "interview", "offer"]), "global"),
        interviews_this_week: m("recruitment", "interviews", "hr_interviews", q => q.gte("interview_datetime", weekDay(0)).lte("interview_datetime", weekDay(6) + "T23:59:59").eq("interview_status", "scheduled"), "global"),
        offers_pending: m("recruitment", "offers-pending", "hr_offers", q => q.eq("offer_status", "sent"), "global"),
        offers_accepted: m("recruitment", "offers-accepted", "hr_offers", q => q.eq("offer_status", "accepted"), "global"),
        onboarding_tasks_pending: m("recruitment", "onboarding", "hr_onboarding_tasks", q => q.eq("task_status", "pending"), "global"),
        converted_this_month: m("recruitment", "converted", "employee_recruitment_links", q => q.gte("created_at", month + "T00:00:00").lte("created_at", today + "T23:59:59"), "global", false)}),
      m("compliance", "compliance-issues", "employee_identity_documents", q => q.lte("expiry_date", soon)),
      m("assignments", "summary-blocks", "employee_operational_blocks", blockFilter),
      (async (): Promise<HrDashboard["headcount"]> => {
        if (!can("employees")) return {status: "restricted"};
        try {
          // Original category widget covers all permitted active staff, independent
          // of optional dashboard filters. Keep that distinction explicit in UI.
          const hasFilters = [filters.ownerCompanyId, filters.branchId, filters.departmentId, filters.designationId].some(v => v != null);
          const subjects = hasFilters ? (await complete(() => employeeQuery(false), employeeRow)).filter(e => ["active", "probation"].includes(e.employee_status)) : active;
          const categories = await complete(() => db.from("hr_employee_categories").select("id,name_en", {count: "exact"}).is("deleted_at", null).order("id"), z.object({id, name_en: z.string()}).strip());
          const names = new Map(categories.map(c => [c.id, c.name_en])), counts = new Map<number | null, number>();
          subjects.forEach(e => counts.set(e.employee_category_id, (counts.get(e.employee_category_id) ?? 0) + 1));
          const items = [...counts].map(([categoryId, count]) => ({categoryId, categoryName: categoryId === null ? "Uncategorised" : names.get(categoryId) ?? "Category unavailable", count})).sort((a, b) => b.count - a.count || (a.categoryId ?? 0) - (b.categoryId ?? 0));
          return {status: "ready", items, total: subjects.length};
        } catch {return {status: "failed"};}
      })(),
      (async (): Promise<HrDashboard["attention"]> => {
        const items: HrDashboardAttentionItem[] = [], failedSources = new Set<HrDashboard["attention"]["failedSources"][number]>();
        const empMap = new Map(active.map(e => [e.id, e]));
        let availableSources = 0, limited = false;
        async function source<S extends z.ZodType<{id: number}>>(category: HrDashboard["attention"]["failedSources"][number], allowed: boolean, limit: number,
          schema: S, query: (ids: number[] | null) => Selected, order: string, convert: (row: z.output<S>) => HrDashboardAttentionItem, employeeScoped = true) {
          if (!allowed) return;
          availableSources++;
          try {
            const rows: z.output<S>[] = [];
            for (const ids of employeeScoped ? activeIds : [null]) {
              const result = await query(ids).order(order).order("id").range(0, limit - 1);
              if (result.error || result.count === null || !Number.isSafeInteger(result.count) || result.count < 0) throw Error("Attention unavailable");
              const page = z.array(schema).parse(result.data);
              if (page.length !== Math.min(result.count, limit) || new Set(page.map(r => r.id)).size !== page.length) throw Error("Incomplete attention page");
              if (result.count > limit) limited = true;
              rows.push(...page);
            }
            rows.sort((a, b) => String((a as Record<string, unknown>)[order] ?? "").localeCompare(String((b as Record<string, unknown>)[order] ?? "")) || a.id - b.id);
            if (rows.length > limit) limited = true;
            items.push(...rows.slice(0, limit).map(convert));
          } catch {failedSources.add(category);}
        }
        const person = (employeeId: number) => {
          const e = empMap.get(employeeId);
          return {employeeId, employeeCode: e?.employee_code ?? undefined, employeeName: e?.full_name_en,
            description: e ? `${e.full_name_en} (${e.employee_code ?? "—"})` : `Employee #${employeeId}`};
        };
        const candidateLabel = z.object({full_name_en: z.string(), candidate_code: z.string().nullable()}).strip().nullable();
        const identityDoc = z.object({id, employee_id: id, expiry_date: z.string(), document_type: z.object({name_en: z.string()}).strip().nullable()}).strip();
        const subjectQuery = (table: string, columns: string, ids: number[] | null) => select(table, columns).in("employee_id", ids ?? []).is("deleted_at", null);
        await Promise.all([
          source("compliance", can("compliance"), 15, identityDoc,
            ids => subjectQuery("employee_identity_documents", "id,employee_id,expiry_date,document_type:hr_identity_document_types!employee_identity_documents_document_type_id_fkey(name_en)", ids).lt("expiry_date", today), "expiry_date",
            r => ({id: `comp-expired-${r.id}`, severity: "critical", category: "compliance", title: `Expired: ${r.document_type?.name_en ?? "Document"}`, ...person(r.employee_id), dueDate: r.expiry_date, linkHref: `/admin/hr/employees/record/${r.employee_id}`, linkLabel: "View Employee"})),
          source("compliance", can("compliance"), 10, identityDoc,
            ids => subjectQuery("employee_identity_documents", "id,employee_id,expiry_date,document_type:hr_identity_document_types!employee_identity_documents_document_type_id_fkey(name_en)", ids).gte("expiry_date", today).lte("expiry_date", soon), "expiry_date",
            r => ({id: `comp-expiring-${r.id}`, severity: "warning", category: "compliance", title: `Expiring soon: ${r.document_type?.name_en ?? "Document"}`, ...person(r.employee_id), dueDate: r.expiry_date, linkHref: `/admin/hr/employees/record/${r.employee_id}`, linkLabel: "View Employee"})),
          source("actions", can("actions"), 10, z.object({id, employee_id: id, approval_type: z.string(), created_at: z.string()}).strip(),
            ids => subjectQuery("employee_approval_requests", "id,employee_id,approval_type,created_at", ids).eq("request_status", "pending"), "created_at",
            r => ({id: `action-approval-${r.id}`, severity: "warning", category: "actions", title: `Pending approval: ${r.approval_type}`, ...person(r.employee_id), linkHref: "/admin/hr/actions/approvals", linkLabel: "View Approvals"})),
          source("operations", can("assignments"), 10, z.object({id, employee_id: id, effective_from: z.string()}).strip(),
            ids => blockFilter(subjectQuery("employee_operational_blocks", "id,employee_id,effective_from", ids)), "effective_from",
            r => ({id: `ops-block-${r.id}`, severity: "critical", category: "operations", title: "Operational block active", ...person(r.employee_id), dueDate: r.effective_from, linkHref: "/admin/hr/operations/blocks", linkLabel: "View Blocks"})),
          source("recruitment", can("recruitment"), 10, z.object({id, candidate_id: id, valid_until: z.string(), candidate: candidateLabel}).strip(),
            () => select("hr_offers", "id,candidate_id,valid_until,candidate:hr_candidates!hr_offers_candidate_id_fkey(full_name_en,candidate_code)").eq("offer_status", "sent").gte("valid_until", today).lte("valid_until", future(14)).is("deleted_at", null), "valid_until",
            r => ({id: `recruit-offer-${r.id}`, severity: "warning", category: "recruitment", title: "Offer expiring soon", description: r.candidate ? `${r.candidate.full_name_en} (${r.candidate.candidate_code ?? "—"})` : "Candidate unavailable", candidateId: r.candidate_id, candidateCode: r.candidate?.candidate_code ?? undefined, dueDate: r.valid_until, linkHref: `/admin/hr/recruitment/candidates/record/${r.candidate_id}`, linkLabel: "View Candidate"}), false),
          source("recruitment", can("recruitment"), 10, z.object({id, candidate_id: id.nullable(), task_title: z.string(), due_date: z.string(), candidate: candidateLabel}).strip(),
            () => select("hr_onboarding_tasks", "id,candidate_id,task_title,due_date,candidate:hr_candidates!hr_onboarding_tasks_candidate_id_fkey(full_name_en,candidate_code)").eq("task_status", "pending").lt("due_date", today).is("deleted_at", null), "due_date",
            r => ({id: `recruit-onboard-${r.id}`, severity: "warning", category: "recruitment", title: `Overdue onboarding: ${r.task_title}`, description: r.candidate ? `${r.candidate.full_name_en} (${r.candidate.candidate_code ?? "—"})` : r.candidate_id === null ? "Onboarding task" : "Candidate unavailable", candidateId: r.candidate_id ?? undefined, candidateCode: r.candidate?.candidate_code ?? undefined, dueDate: r.due_date, linkHref: r.candidate_id === null ? "/admin/hr/recruitment/onboarding" : `/admin/hr/recruitment/candidates/record/${r.candidate_id}`, linkLabel: r.candidate_id === null ? "View Onboarding" : "View Candidate"}), false),
        ]);
        const priority = {critical: 0, warning: 1, info: 2};
        items.sort((a, b) => priority[a.severity] - priority[b.severity] || (a.dueDate && b.dueDate ? a.dueDate.localeCompare(b.dueDate) : 0) || a.id.localeCompare(b.id));
        return {items: items.slice(0, 50), failedSources: [...failedSources].sort(), availableSources, limited: limited || items.length > 50};
      })(),
    ]);
    const totalWps = await wpsTotal, readyWps = await wpsReady;
    const wpsPercent: HrDashboardMetric = totalWps.status !== "ready" ? totalWps : readyWps.status !== "ready" ? readyWps : totalWps.value === 0 ? {status: "unavailable", reason: "no-data"} : readyWps.value > totalWps.value ? failed : ready(Math.round(readyWps.value / totalWps.value * 100));
    const data = hrDashboardSchema.parse({filters, asOf: now.toISOString(), employee, compliance, time, payroll, operations, actions, recruitment, headcount, attention,
      summary: {employee_total: employee.total, employee_active: computed(can("employees"), active.length), compliance_issues: complianceIssues,
        attendance_pending: time.attendance_pending_approval, wps_ready_pct: wpsPercent, active_blocks: summaryBlocks, recruitment_active: recruitment.active_candidates}});
    return {success: true, data};
  } catch {return {success: false, error: "Dashboard could not be completely loaded"};}
}

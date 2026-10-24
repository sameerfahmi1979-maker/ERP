import "server-only";
import {z} from "zod";
import {getAuthContext, hasPermission, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalContains, literalLike} from "@/lib/reads/search";
import {hrSearchReadRequestSchema, hrSearchAllowedCategories, hrSearchCriteriaIssue, hrSearchPageReadSchema, hrSearchSuggestionsReadSchema,
} from "@/lib/reads/hr-search-read-schema";
import type {HrSearchCategory, HrSearchResult} from "@/lib/hr/search/types";
import {hrDashboardCalendar} from '@/lib/hr/dashboard-metrics';

type Source = {key: string; table: string; category: HrSearchCategory; columns: string[]; search: string[]; employee?: true; employeeSearch?: true;
  employeeStatuses?: string[]; active?: true; medical?: true; confidential?: true; status?: string; date?: string;
  related?: {alias: string; table: string; fk: string; column: string; search?: true}};
/** Fixed source order preserves existing category/entity grouping. Only the
 * former accidental unordered samples change: each entire source now uses ID ASC. */
export const HR_SEARCH_READ_SOURCES: readonly Source[] = [
  {key: "employee", table: "employees", category: "employees", columns: ["employee_code", "full_name_en", "full_name_ar", "known_name", "mobile_number", "personal_email", "employee_status", "joining_date"], search: ["employee_code", "full_name_en", "full_name_ar", "known_name", "mobile_number", "personal_email"], status: "employee_status"},
  {key: "candidate", table: "hr_candidates", category: "candidates", columns: ["candidate_code", "full_name_en", "full_name_ar", "mobile_number", "email", "candidate_status", "pipeline_stage", "created_at"], search: ["candidate_code", "full_name_en", "full_name_ar", "mobile_number", "email"], status: "candidate_status", date: "created_at"},
  {key: "identity", table: "employee_identity_documents", category: "compliance", columns: ["document_number", "expiry_date", "verification_status"], search: ["document_number"], employee: true,
    related: {alias: "document_type", table: "hr_identity_document_types", fk: "document_type_id", column: "name_en", search: true}},
  {key: "card", table: "employee_access_cards", category: "compliance", columns: ["card_number", "status", "expiry_date"], search: ["card_number"], employee: true,
    related: {alias: "access_type", table: "hr_access_card_types", fk: "access_type_id", column: "name_en", search: true}},
  {key: "training", table: "employee_training_certificates", category: "compliance", columns: ["certificate_number", "expiry_date", "status"], search: ["certificate_number"], employee: true,
    related: {alias: "training_type", table: "hr_training_types", fk: "training_type_id", column: "name_en", search: true}},
  {key: "medical", table: "employee_medical_records", category: "compliance", columns: ["report_number", "examination_date", "next_examination_date", "result"], search: ["report_number"], employee: true, medical: true,
    related: {alias: "record_type", table: "hr_medical_record_types", fk: "medical_record_type_id", column: "name_en", search: true}},
  {key: "leave", table: "employee_leave_requests", category: "time", columns: ["approval_status", "start_date", "end_date"], search: [], employee: true, employeeSearch: true,
    employeeStatuses: ["active", "probation", "on_leave"], related: {alias: "leave_type", table: "hr_leave_types", fk: "leave_type_id", column: "name_en", search: true}},
  {key: "wps", table: "employee_wps_profiles", category: "payroll", columns: ["wps_status"], search: [], employee: true, employeeSearch: true, employeeStatuses: ["active", "probation"]},
  {key: "hold", table: "employee_payroll_holds", category: "payroll", columns: ["is_active"], search: [], employee: true, employeeSearch: true, employeeStatuses: ["active", "probation"], active: true},
  {key: "assignment", table: "employee_assignments", category: "operations", columns: ["assignment_status", "effective_from"], search: [], employee: true, employeeSearch: true,
    related: {alias: "work_site", table: "work_sites", fk: "work_site_id", column: "site_name", search: true}},
  {key: "block", table: "employee_operational_blocks", category: "operations", columns: ["block_status", "effective_from"], search: [], employee: true, employeeSearch: true, active: true},
  {key: "pro", table: "employee_pro_processes", category: "actions", columns: ["process_title", "process_status", "request_date"], search: ["process_title"], employee: true},
  {key: "action", table: "employee_hr_actions", category: "actions", columns: ["action_type", "action_status", "action_date"], search: ["action_type"], employee: true},
  {key: "disciplinary", table: "employee_disciplinary_records", category: "actions", columns: ["subject", "status", "severity", "incident_date"], search: ["subject"], employee: true, confidential: true},
  {key: "eos", table: "employee_eos_cases", category: "actions", columns: ["eos_type", "reason", "case_status", "last_working_date"], search: ["eos_type", "reason"], employee: true},
  {key: "onboarding", table: "hr_onboarding_tasks", category: "onboarding", columns: ["candidate_id", "task_title", "task_category", "task_status", "due_date"], search: ["task_title", "task_category"], status: "task_status", date: "due_date"},
];
const id = z.number().int().positive().refine(Number.isSafeInteger), text = z.string().nullable();
const employeeLabel = z.object({id, employee_code: z.string(), full_name_en: z.string()});
const candidateLabel = z.object({full_name_en: z.string(), candidate_code: text}).nullable();
type Raw = Record<string, unknown>;
function schema(s: Source) {
  const fields: Record<string, z.ZodType> = {id};
  for (const c of s.columns) fields[c] = c === "bank_id" ? id.nullable() : c === "candidate_id" ? id : c === "is_active" ? z.boolean() : text;
  if (s.employee) {fields.employee_id = id; fields.employee = employeeLabel;}
  if (s.related) fields[s.related.alias] = z.object({[s.related.column]: text}).nullable();
  if (s.key === "onboarding") {fields.candidate = candidateLabel; fields.candidate_id = id.nullable();}
  return z.object(fields);
}
const txt = (r: Raw, key: string) => r[key] as string | null;
const required = (r: Raw, key: string) => {const value = txt(r, key); if (typeof value !== "string") throw Error("Search row incomplete"); return value;};
function mapRow(s: Source, r: Raw, query: string,today:string): HrSearchResult {
  const entityId = r.id as number, emp = s.employee ? employeeLabel.parse(r.employee) : null, candidate = s.key === "onboarding" ? candidateLabel.parse(r.candidate) : null;
  const related = s.related && r[s.related.alias] ? (r[s.related.alias] as Record<string, string | null>)[s.related.column] : null;
  const prefixes: Record<string, string> = {employee: "emp", candidate: "cand", identity: "comp-id", card: "comp-card", training: "comp-cert", medical: "comp-med",
    leave: "time-leave", wps: "pay-wps", hold: "pay-hold", assignment: "ops-assign", block: "ops-block", pro: "act-pro", action: "act-hr", disciplinary: "act-disc", eos: "act-eos", onboarding: "onboard"};
  const base: HrSearchResult = {id: `${prefixes[s.key]}-${entityId}`, category: s.category, entityType: s.key, entityId, title: "", href: "/admin/hr", matchedFields: []};
  if (emp) Object.assign(base, {employeeId: r.employee_id, employeeCode: emp.employee_code, employeeName: emp.full_name_en,
    subtitle: `${emp.full_name_en} (${emp.employee_code})`, href: `/admin/hr/employees/record/${r.employee_id}`});
  const t = (key: string) => txt(r, key), value = (key: string) => t(key) ?? "—", optional = (key: string) => t(key) ?? undefined;
  const status = (key: string, good: string[], warning: string[] = [], bad: string[] = []) => ({status: optional(key),
    statusVariant: good.includes(value(key)) ? "success" as const : warning.includes(value(key)) ? "warning" as const : bad.includes(value(key)) ? "danger" as const : "muted" as const});
  const expired = (key: string) => !!t(key) && value(key) < today;
  switch (s.key) {
    case "employee": return {...base, entityType: "employee", title: required(r, "full_name_en"), subtitle: required(r, "employee_code"), description: t("mobile_number") ? `Mobile: ${t("mobile_number")}` : undefined,
      ...status("employee_status", ["active"], ["probation"], ["suspended"]), employeeId: entityId, employeeCode: required(r, "employee_code"), employeeName: required(r, "full_name_en"), date: optional("joining_date"), href: `/admin/hr/employees/record/${entityId}`,
      matchedFields: [["employee_code", "Employee Code"], ["full_name_en", "Name (EN)"], ["full_name_ar", "Name (AR)"], ["known_name", "Known Name"], ["mobile_number", "Mobile"], ["personal_email", "Email"]].filter(([f]) => t(f)?.toLowerCase().includes(query.toLowerCase())).map(([, label]) => label)};
    case "candidate": return {...base, entityType: "candidate", title: required(r, "full_name_en"), subtitle: optional("candidate_code"), description: t("pipeline_stage") ? `Stage: ${t("pipeline_stage")}` : undefined,
      ...status("candidate_status", ["offer", "hired"], ["interview"], ["rejected", "withdrawn"]), candidateId: entityId, candidateCode: optional("candidate_code"), date: required(r, "created_at").split("T")[0], href: `/admin/hr/recruitment/candidates/record/${entityId}`,
      matchedFields: [["candidate_code", "Candidate Code"], ["full_name_en", "Name"], ["mobile_number", "Mobile"], ["email", "Email"]].filter(([f]) => t(f)?.toLowerCase().includes(query.toLowerCase())).map(([, label]) => label)};
    case "identity": return {...base, entityType: "identity_document", title: related ?? "Identity document", description: `Expiry: ${value("expiry_date")} · Status: ${value("verification_status")}`,
      status: expired("expiry_date") ? "expired" : optional("verification_status"), statusVariant: expired("expiry_date") ? "danger" : t("verification_status") === "verified" ? "success" : "warning", date: optional("expiry_date"), matchedFields: ["Document Type"]};
    case "card": return {...base, entityType: "access_card", title: `Access Card — ${related ?? "Type unavailable"}`, description: `Status: ${value("status")} · Expiry: ${value("expiry_date")}`,
      ...status("status", ["active"]), date: optional("expiry_date"), matchedFields: ["Card Type", "Card Number"]};
    case "training": return {...base, entityType: "training_certificate", title: related ?? "Training certificate",
      status: expired("expiry_date") ? "expired" : optional("status"), statusVariant: expired("expiry_date") ? "danger" : t("status") === "valid" ? "success" : "warning", date: optional("expiry_date"), matchedFields: ["Training Type", "Certificate Number"]};
    case "medical": return {...base, entityType: "medical_record", title: `Medical: ${related ?? "Type unavailable"}`, description: `Examination: ${value("examination_date")} · Next examination: ${value("next_examination_date")}`, status: optional("result"),
      statusVariant: t("result") === "fit" ? "success" : "muted", date: optional("examination_date"), matchedFields: ["Medical Record Type", "Report Number"]};
    case "leave": return {...base, entityType: "leave_request", title: `Leave: ${related ?? "—"}`, description: `${value("start_date")} → ${value("end_date")}`, status: optional("approval_status"),
      statusVariant: t("approval_status") === "approved" ? "success" : t("approval_status") === "rejected" ? "danger" : "warning", date: optional("start_date"), href: "/admin/hr/time/leave", matchedFields: ["Leave Type", "Employee"]};
    case "wps": return {...base, entityType: "wps_profile", title: "WPS Profile", description: `Recorded profile status: ${t('wps_status')??'unknown'}. Open Payroll/WPS for current dated readiness; this search result is not payment clearance.`,
      status: optional('wps_status'), statusVariant: 'muted', href: "/admin/hr/payroll/wps", matchedFields: ["Employee"]};
    case "hold": return {...base, entityType: "payroll_hold", title: "Payroll Hold — Active", status: "on_hold", statusVariant: "danger", href: "/admin/hr/payroll/salaries", matchedFields: ["Employee"]};
    case "assignment": return {...base, entityType: "assignment", title: `Assignment${related ? `: ${related}` : ""}`, ...status("assignment_status", ["active"]), date: optional("effective_from"), href: "/admin/hr/operations/assignments", matchedFields: ["Employee", "Site"]};
    case "block": return {...base, entityType: "operational_block", title: "Operational Block — Active", status: "blocked", statusVariant: "danger", date: optional("effective_from"), href: "/admin/hr/operations/blocks", matchedFields: ["Employee"]};
    case "pro": return {...base, entityType: "pro_process", title: `PRO: ${value("process_title")}`,
      ...status("process_status", ["completed"], ["in_progress"]), date: optional("request_date"), href: "/admin/hr/actions/pro", matchedFields: ["Process Title"]};
    case "action": return {...base, entityType: "hr_action", title: `HR Action: ${value("action_type")}`, ...status("action_status", ["closed"], ["open","in_progress"]), date: optional("action_date"), matchedFields: ["Action Type"]};
    case "disciplinary": return {...base, entityType: "disciplinary", title: `Disciplinary${t("severity") ? ` — ${t("severity")}` : ""}`, description: t("subject") ? `Subject: ${t("subject")}` : undefined,
      status: optional("status"), statusVariant: t("status") === "closed" ? "muted" : "danger", date: optional("incident_date"), href: "/admin/hr/actions/disciplinary", matchedFields: ["Subject"]};
    case "eos": return {...base, entityType: "eos_case", title: `EOS: ${value("eos_type")}`, description: optional("reason"), status: optional("case_status"), statusVariant: t("case_status") === "closed" ? "muted" : "warning", date: optional("last_working_date"), href: "/admin/hr/actions/eos", matchedFields: ["EOS Type", "Reason"]};
    case "onboarding": return {...base, entityType: "onboarding_task", title: required(r, "task_title"), subtitle: candidate ? `${candidate.full_name_en}${candidate.candidate_code ? ` (${candidate.candidate_code})` : ""}` : `Candidate #${r.candidate_id}`,
      description: t("task_category") ? `Category: ${t("task_category")}` : undefined, status: optional("task_status"), statusVariant: t("task_status") === "completed" ? "success" : t("task_status") === "blocked" ? "danger" : "warning",
      candidateId: (r.candidate_id as number | null) ?? undefined, candidateCode: candidate?.candidate_code ?? undefined, date: optional("due_date"), href: r.candidate_id === null ? "/admin/hr/recruitment/onboarding" : `/admin/hr/recruitment/candidates/record/${r.candidate_id}`, matchedFields: ["Task Title", "Category"]};
    default: throw Error("Unsupported search source");
  }
}
async function boundedMap<T, R>(items: readonly T[], read: (item: T) => Promise<R>): Promise<R[]> {
  const result: R[] = []; for (let i = 0; i < items.length; i += 4) result.push(...await Promise.all(items.slice(i, i + 4).map(read))); return result;
}
export async function readHrSearch(input: unknown, context?: AuthContext, signal?: AbortSignal) {
  const parsed = hrSearchReadRequestSchema.safeParse(input);
  if (!parsed.success) return {success: false as const, error: "Invalid HR search criteria"};
  try {
    signal?.throwIfAborted(); const ctx = context ?? await getAuthContext(); signal?.throwIfAborted();
    const allowed = hrSearchAllowedCategories(ctx);
    if (!ctx.profile?.id || !ctx.isAccountActive || ctx.profile.must_change_password || !allowed.length) return {success: false as const, error: "Permission denied"};
    const p = parsed.data;
    if (p.mode === "results") {const issue = hrSearchCriteriaIssue(p, allowed); if (issue) return {success: false as const, error: "Invalid HR search criteria: " + issue};}
    const db = await createClient(),today=hrDashboardCalendar().today; signal?.throwIfAborted();
    if (p.mode === "suggestions") {
      const sources = [{category: "employees" as const, table: "employees", code: "employee_code", limit: 5}, {category: "candidates" as const, table: "hr_candidates", code: "candidate_code", limit: 3}].filter(s => allowed.includes(s.category));
      const groups = await boundedMap(sources, async s => {
        const prefix = literalContains(p.query).replace(/^"%/, '"');
        let query = db.from(s.table).select(`id,${s.code},full_name_en`).is("deleted_at", null)
          .or(`${s.code}.ilike.${prefix},full_name_en.ilike.${literalContains(p.query)}`).order("id", {ascending: true}).range(0, s.limit - 1);
        if (signal) query = query.abortSignal(signal);
        const result = await query; signal?.throwIfAborted(); if (result.error) throw Error("Suggestions unavailable");
        const rows = z.array(z.object({id, [s.code]: text, full_name_en: z.string()})).max(s.limit).parse(result.data);
        return rows.map(r => ({label: r.full_name_en as string, sublabel: r[s.code] as string | null ?? undefined,
          href: `/admin/hr/${s.category === "employees" ? "employees" : "recruitment/candidates"}/record/${r.id}`, category: s.category}));
      });
      return {success: true as const, data: hrSearchSuggestionsReadSchema.parse({criteria: p, kind: "quick-suggestions", limit: 8, complete: false, rows: groups.flat()})};
    }
    const sources = HR_SEARCH_READ_SOURCES.filter(s => allowed.includes(s.category) && (!p.categories.length || p.categories.includes(s.category)) && (!s.medical || hasPermission(ctx, "hr.medical.view")) && (!s.confidential || hasPermission(ctx, "hr.confidential.view")));
    const build = (s: Source, head = false) => {
      const columns = ["id", ...s.columns];
      if (s.employee) columns.push(`employee_id,employee:employees!employee_id!inner(id,employee_code,full_name_en)`);
      if (s.related) columns.push(`${s.related.alias}:${s.related.table}!${s.related.fk}(${s.related.column})`);
      // This nullable label is not a predicate or membership gate. Joining it
      // into every HEAD count repeats recruitment RLS across all task rows.
      // Resolve it only for the displayed page; parent task RLS is unchanged.
      if (s.key === "onboarding"&&!head) columns.push("candidate:hr_candidates!candidate_id(full_name_en,candidate_code)");
      if (s.employeeSearch) columns.push("search_employee:employees!employee_id(id)");
      if (s.related?.search) columns.push(`search_related:${s.related.table}!${s.related.fk}(id)`);
      let q = db.from(s.table).select(columns.join(","), {count: "exact", head}).is("deleted_at", null);
      if (signal) q = q.abortSignal(signal);
      if (s.employee) q.is("employee.deleted_at", null);
      if (s.employee || s.key === "employee") {
        const prefix = s.employee ? "employee." : "";
        for (const [filter, column] of [["ownerCompanyId", "owner_company_id"], ["branchId", "branch_id"], ["departmentId", "department_id"], ["designationId", "designation_id"]] as const)
          if (p[filter]) q.eq(prefix + column, p[filter]);
        if (s.employeeStatuses) q.in("employee.employee_status", s.employeeStatuses);
      }
      if (s.active) {
        if (s.key === "block") q.eq("block_status", "active").lte('effective_from',today).or(`effective_to.is.null,effective_to.gte.${today}`);
        else q.eq("is_active", true);
      }
      if (s.status && p.status) q.eq(s.status, p.status);
      if (s.date && p.dateFrom) q.gte(s.date, p.dateFrom);
      if (s.date && p.dateTo) q.lte(s.date, p.dateTo);
      if (p.query !== "") {
        const clauses = s.search.map(field => `${field}.ilike.${literalContains(p.query)}`);
        if (s.employeeSearch) {q.or(`full_name_en.ilike.${literalContains(p.query)},employee_code.ilike.${literalContains(p.query)}`, {referencedTable: "search_employee"}); clauses.push("search_employee.not.is.null");}
        if (s.related?.search) {q.ilike(`search_related.${s.related.column}`, literalLike(p.query)); clauses.push("search_related.not.is.null");}
        if (clauses.length) q.or(clauses.join(","));
      }
      return q;
    };
    const counts = await boundedMap(sources, async s => {signal?.throwIfAborted(); const result = await build(s, true); signal?.throwIfAborted();
      if (result.error || !Number.isSafeInteger(result.count) || result.count === null || result.count < 0) throw Error("Search count unavailable"); return result.count;});
    const totalCount = counts.reduce((sum, c) => sum + c, 0); if (!Number.isSafeInteger(totalCount)) throw Error("Search count overflow");
    const groupCounts: Partial<Record<HrSearchCategory, number>> = {}; sources.forEach((s, i) => {groupCounts[s.category] = (groupCounts[s.category] ?? 0) + counts[i];});
    const start = (p.page - 1) * p.pageSize; let offset = 0;
    const ranges = sources.flatMap((s, i) => {const before = offset; offset += counts[i]; const from = Math.max(0, start - before), to = Math.min(counts[i], start + p.pageSize - before);
      return to > from ? [{source: s, from, to: to - 1, count: counts[i]}] : [];});
    const pages = await boundedMap(ranges, async ({source, from, to, count}) => {
      signal?.throwIfAborted(); const result = await build(source).order("id", {ascending: true}).range(from, to); signal?.throwIfAborted();
      if (result.error || result.count !== count) throw Error("Search changed or unavailable");
      const rows = z.array(schema(source)).length(to - from + 1).parse(result.data);
      if (new Set(rows.map(r => r.id)).size !== rows.length) throw Error("Duplicate search rows");
      return rows.map(r => mapRow(source, r, p.query,today));
    });
    return {success: true as const, data: hrSearchPageReadSchema.parse({criteria: p, results: pages.flat(), totalCount, groupCounts,
      hasMore: p.page * p.pageSize < totalCount, ordering: "category-entity-id-v1", countScope: "authorized-matches"})};
  } catch {signal?.throwIfAborted(); return {success: false as const, error: "HR search could not be completely loaded. Please retry."};}
}

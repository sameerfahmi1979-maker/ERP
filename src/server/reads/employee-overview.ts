import "server-only";
import {z} from "zod";
import {getAuthContext, canUseApplication, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {collectCompletePages} from "@/lib/reads/complete-pages";
import {calculateGrossSalary, checkWpsReadiness} from "@/lib/hr/payroll/wps-readiness";
import {employeeOverviewCriteriaSchema, employeeOverviewDataSchemas, employeeOverviewSchema, type EmployeeOverview, type EmployeeOverviewSection} from "@/lib/reads/employee-overview-schema";

type Result = {data: unknown; error: unknown};
type CountResult = {count: number | null; error: unknown};
type PageQuery = {range: (from: number, to: number) => PromiseLike<Result & CountResult>};
const rowId = z.number().int().positive().refine(Number.isSafeInteger);
const expiryRow = z.object({id: rowId, status: z.string().nullable(), expiry_date: z.string().nullable()}).strip();
async function point<S extends z.ZodType>(query: PromiseLike<Result>, schema: S): Promise<z.output<S>> {
  const result = await query;
  if (result.error) throw Error("Overview point read failed");
  return schema.parse(result.data);
}
async function count(query: PromiseLike<CountResult>) {
  const result = await query;
  if (result.error || result.count === null || !Number.isSafeInteger(result.count) || result.count < 0) throw Error("Overview count unavailable");
  return result.count;
}
/** Existing complete-page contract: bounded native pages, stable IDs and exact
 * count reconciliation. No growing row array is sent to the browser. */
async function complete<S extends z.ZodType<{id: number}>>(query: () => PageQuery, schema: S) {
  return collectCompletePages(async (from, to) => {
    const result = await query().range(from, to);
    if (result.error) throw Error("Overview collection read failed");
    return {...result, data: z.array(schema).parse(result.data)};
  }, {identity: row => row.id});
}

/** Server-only composition. The browser can request section names, never supply
 * an authorization context. Native RLS remains authoritative for every read. */
export async function readEmployeeOverview(input: unknown, context?: AuthContext): Promise<{success: boolean; data?: EmployeeOverview; error?: string}> {
  const parsed = employeeOverviewCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid employee overview criteria"};
  try {
    const ctx = context ?? await getAuthContext();
    if (!canUseApplication(ctx)) return {success: false, error: "Permission denied"};
    const db = await createClient(), {employeeId, sections} = parsed.data;
    const subject = await point(db.from("employees").select("id").eq("id", employeeId).is("deleted_at", null).maybeSingle(), z.object({id: rowId}).nullable());
    if (!subject || subject.id !== employeeId) return {success: false, error: "Permission denied"};
    // Deduplication is ONLY within this invocation. One role's scope must never
    // supply another role's sensitive capability; F03 resolves each intersection.
    const permissions = new Map<string, Promise<boolean>>();
    const permitted = (code: string) => {
      if (!permissions.has(code)) permissions.set(code, point(db.rpc("f03_has_employee_permission", {employee_id: employeeId, permission_code: code}), z.boolean()));
      return permissions.get(code)!;
    };
    const either = async (a: string, b: string) => {const results = await Promise.all([permitted(a), permitted(b)]); return results.some(Boolean);};
    const now = new Date(), today = now.toISOString().slice(0, 10), soon = new Date(now.getTime() + 60 * 86400000).toISOString().slice(0, 10);
    // Preserve the existing server-local month/year contract, not a new timezone.
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const base = (table: string) => db.from(table);
    const expiryCounts = (rows: z.infer<typeof expiryRow>[]) => {
      let active = 0, expiringSoon = 0, expired = 0;
      for (const row of rows) {
        if (row.status === "expired") {expired++; continue;}
        if (row.status === "active" || row.status === "valid") {
          if (row.expiry_date && row.expiry_date < today) expired++;
          else {active++; if (row.expiry_date && row.expiry_date <= soon) expiringSoon++;}
        }
      }
      return {total: rows.length, active, expiringSoon, expired};
    };
    const expiryRows = (table: string) => complete(() => base(table).select("id,status,expiry_date", {count: "exact"}).eq("employee_id", employeeId).is("deleted_at", null).order("id"), expiryRow);
    const tally = (table: string) => base(table).select("id", {count: "exact", head: true}).eq("employee_id", employeeId).is("deleted_at", null);
    const readers = {
      compliance: async () => {
        const medical = await permitted("hr.medical.view");
        const [identity, insurance, dependents, cards, training, documents, medicalRows] = await Promise.all([
          expiryRows("employee_identity_documents"), medical ? expiryRows("employee_medical_insurances") : null,
          complete(() => base("employee_dependents").select("id,is_active", {count: "exact"}).eq("employee_id", employeeId).is("deleted_at", null).order("id"), z.object({id: rowId, is_active: z.boolean()}).strip()),
          expiryRows("employee_access_cards"), expiryRows("employee_training_certificates"), count(tally("employee_document_links")),
          medical ? complete(() => base("employee_medical_records").select("id,result,examination_date", {count: "exact"}).eq("employee_id", employeeId).is("deleted_at", null).order("id"), z.object({id: rowId, result: z.string().nullable(), examination_date: z.string().nullable()}).strip()) : null,
        ]);
        return {identityDocuments: expiryCounts(identity), medicalInsurances: insurance ? expiryCounts(insurance) : null, dependents: {total: dependents.length, active: dependents.filter(d => d.is_active).length},
          accessCards: expiryCounts(cards), trainingCertificates: {total: training.length, valid: training.filter(r => r.status === "valid").length,
            expiringSoon: training.filter(r => r.expiry_date && r.expiry_date > today && r.expiry_date <= soon).length,
            expired: training.filter(r => r.status === "expired" || r.expiry_date && r.expiry_date < today).length},
          medicalRecords: medicalRows ? {total: medicalRows.length, fit: medicalRows.filter(r => r.result === "fit").length,
            lastExaminationDate: medicalRows.map(r => r.examination_date).filter((v): v is string => v !== null).sort().at(-1) ?? null} : null,
          dmsDocuments: {total: documents}};
      },
      time: async () => {
        const leave = await either("hr.leave.view", "hr.leave.manage");
        const [shift, attendance, balances, pending, overtime] = await Promise.all([
          point(base("employee_shift_assignments").select("work_calendar:work_calendars!employee_shift_assignments_work_calendar_id_fkey(calendar_name),work_shift:work_shifts!employee_shift_assignments_work_shift_id_fkey(shift_name)").eq("employee_id", employeeId).is("deleted_at", null).is("effective_to", null).order("effective_from", {ascending: false}).order("id").limit(1).maybeSingle(), employeeOverviewDataSchemas.time.shape.currentShiftAssignment),
          count(base("employee_attendance_daily_summary").select("id", {count: "exact", head: true}).eq("employee_id", employeeId).gte("attendance_date", monthStart)),
          leave ? count(base("employee_leave_balances").select("id", {count: "exact", head: true}).eq("employee_id", employeeId).eq("leave_year", now.getFullYear())) : null,
          leave ? count(tally("employee_leave_requests").eq("approval_status", "pending")) : null,
          complete(() => base("employee_overtime_records").select("id,hours", {count: "exact"}).eq("employee_id", employeeId).is("deleted_at", null).eq("approval_status", "approved").gte("overtime_date", monthStart).order("id"), z.object({id: rowId, hours: z.number().finite().nullable()}).strip()),
        ]);
        return {currentShiftAssignment: shift, attendanceThisMonthCount: attendance, leaveBalanceCount: balances, pendingLeaveCount: pending, overtimeHoursThisMonth: overtime.reduce((sum, row) => sum + (row.hours ?? 0), 0)};
      },
      payroll: async () => {
        const banking = await permitted("hr.banking.view");
        const wpsSchema = z.object({wps_applicable: z.boolean(), wps_status: z.string(), bank_id: rowId.nullable(), account_number: z.string().nullable(), iban: z.string().nullable(), exchange_house: z.string().nullable(), salary_payment_method: z.string(), labour_card_number: z.string().nullable(), mohre_person_code: z.string().nullable()}).strip().nullable();
        const [profile, wps, holds, components] = await Promise.all([
          point(base("employee_payroll_profiles").select("payroll_status").eq("employee_id", employeeId).is("deleted_at", null).maybeSingle(), z.object({payroll_status: z.string().nullable()}).strip().nullable()),
          banking ? point(base("employee_wps_profiles").select("wps_applicable,wps_status,bank_id,account_number,iban,exchange_house,salary_payment_method,labour_card_number,mohre_person_code").eq("employee_id", employeeId).is("deleted_at", null).maybeSingle(), wpsSchema) : null,
          count(tally("employee_payroll_holds").eq("is_active", true)),
          complete(() => base("employee_salary_components").select("id,amount,is_active,deleted_at,component_type:hr_salary_component_types!employee_salary_components_component_type_id_fkey(component_kind)", {count: "exact"}).eq("employee_id", employeeId).order("id"), z.object({id: rowId, amount: z.number().finite().nullable(), is_active: z.boolean(), deleted_at: z.string().nullable(), component_type: z.object({component_kind: z.string()}).strip().nullable()}).strip()),
        ]);
        const salary = components.map(row => ({...row, amount: row.amount ?? 0})), gross = calculateGrossSalary(salary), hasActiveHold = holds > 0;
        const readiness = banking ? checkWpsReadiness({wpsProfile: wps, hasActivePayrollHold: hasActiveHold, hasSalaryComponents: salary.some(row => row.is_active && !row.deleted_at), grossSalary: gross}) : null;
        return {payrollStatus: profile?.payroll_status ?? null, grossSalary: gross, hasActiveHold, wpsStatus: wps?.wps_status ?? null, wpsReadiness: readiness ? {status: readiness.status} : null, bankingRestricted: !banking};
      },
      operations: async () => {
        const [assignment, blocks, assets, ppe, accommodation, readiness] = await Promise.all([
          point(base("employee_assignments").select("departments(name_en:department_name_en),designations(name_en:designation_name_en),work_sites(name_en:site_name)").eq("employee_id", employeeId).eq("assignment_status", "active").is("deleted_at", null).lte("effective_from", today).or(`effective_to.is.null,effective_to.gte.${today}`).order("effective_from", {ascending: false}).order("id").limit(1).maybeSingle(), employeeOverviewDataSchemas.operations.shape.currentAssignment),
          // Existing isActiveBlock deliberately has no effective_from predicate.
          count(tally("employee_operational_blocks").eq("block_status", "active").or(`effective_to.is.null,effective_to.gte.${today}`)),
          count(tally("employee_assets").eq("status", "issued")), count(tally("employee_ppe_issues").eq("status", "issued")),
          point(base("employee_accommodation_records").select("accommodation_location").eq("employee_id", employeeId).eq("status", "active").is("deleted_at", null).order("assigned_from", {ascending: false}).order("id").limit(1).maybeSingle(), employeeOverviewDataSchemas.operations.shape.activeAccommodation),
          base("employee_site_readiness").select("readiness_status", {count: "exact"}).eq("employee_id", employeeId).is("deleted_at", null).order("checked_at", {ascending: false}).order("id").limit(1),
        ]);
        if (readiness.error || readiness.count === null || !Number.isSafeInteger(readiness.count) || readiness.count < 0) throw Error("Readiness unavailable");
        const latest = z.array(z.object({readiness_status: z.string().nullable()}).strip()).max(1).parse(readiness.data);
        if (latest.length !== Math.min(1, readiness.count)) throw Error("Readiness count mismatch");
        return {currentAssignment: assignment, activeBlockCount: blocks, issuedAssetCount: assets, issuedPpeCount: ppe, activeAccommodation: accommodation, readinessCount: readiness.count, latestReadinessStatus: latest[0]?.readiness_status ?? null};
      },
      actions: async () => {
        const confidential = await permitted("hr.confidential.view");
        const [pro, actions, performance, discipline, approvals, eos] = await Promise.all([
          count(tally("employee_pro_processes").not("process_status", "in", '("completed","cancelled","rejected")')),
          count(tally("employee_hr_actions").not("action_status", "in", '("closed","cancelled")')),
          confidential ? count(tally("employee_performance_records")) : null,
          confidential ? count(tally("employee_disciplinary_records").not("status", "in", '("closed","cancelled")')) : null,
          count(tally("employee_approval_requests").eq("request_status", "pending")),
          count(tally("employee_eos_cases").not("case_status", "in", '("closed","cancelled")')),
        ]);
        return {open_pro_processes: pro, open_hr_actions: actions, performance_reviews: performance, open_disciplinary: discipline, pending_approvals: approvals, open_eos_case: eos > 0};
      },
      recruitment: () => point(base("employee_recruitment_links").select("candidate_id,converted_at,candidate:hr_candidates(id,candidate_code,full_name_en),requisition:hr_job_requisitions(id,requisition_code,requisition_title)").eq("employee_id", employeeId).maybeSingle(), employeeOverviewDataSchemas.recruitment),
    };
    const capabilities = {compliance: "hr.compliance.view", time: "hr.attendance.view", payroll: "hr.payroll.view", operations: "hr.assignments.view", actions: "hr.actions.view", recruitment: "hr.recruitment.view"} as const;
    const results = await Promise.all(sections.map(async (section: EmployeeOverviewSection) => {
      try {
        if (!await permitted(capabilities[section])) return [section, {status: "restricted"}] as const;
        const data = employeeOverviewDataSchemas[section].parse(await readers[section]());
        return [section, {status: "ready", data}] as const;
      } catch {return [section, {status: "failed"}] as const;}
    }));
    return {success: true, data: employeeOverviewSchema.parse({employeeId, sections: Object.fromEntries(results)})};
  } catch {return {success: false, error: "Employee overview could not be loaded. Please retry."};}
}

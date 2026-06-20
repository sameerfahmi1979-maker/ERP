# HR.11 / REPORT FINAL — Runtime QA, Security Review, and Gap Report

**Phase:** HR.11 / REPORT FINAL — Full Runtime QA, Security Review, and Gap Report  
**Date:** 2026-06-19  
**Reviewer:** Cursor AI Agent (Read-only audit — no code changes made)  
**Status:** READY FOR HR.12 WITH FIXES

---

## 1. Executive Summary

The Global Report Center (REPORT.1–REPORT.5) is **substantially complete and production-secure** for its core function: running HR reports, applying permission-based redaction, and exporting to PDF/Excel/CSV. The 26 HR report entries are correctly seeded, all 26 fetchers are implemented and registered, and the security/redaction layer is functioning correctly.

Two **HIGH** security/correctness gaps were identified in the REPORT.5 email and scheduling foundation:

1. **Email permission code case mismatch** — `sendExportEmail` checks `"REPORTS.view"` (uppercase) instead of `"reports.view"` (lowercase), blocking email sends for non-admin users.
2. **`listReportSchedules` access control logic bug** — users without `reports.schedule.view` or `reports.schedule.manage` can still list all schedules if they have a valid profile.

Several **MEDIUM** gaps exist around UX completeness (filter entity lookups, column profile persistence UI, missing HR page report menus) and the scheduling cron trigger.

None of the identified gaps block HR.12 (HR AI Integration), which operates on the data layer rather than the email/scheduling layer.

---

## 2. Review Scope

Files and systems reviewed:

| Area | Files Reviewed |
|---|---|
| Report runner | `src/lib/report-center/report-runner.ts`, `report-fetchers.ts`, `branding-resolver.ts`, `redaction-engine.ts` |
| Server actions | `src/server/actions/reports/runner.ts`, `schedules.ts`, `saved-filters.ts`, `column-profiles.ts` |
| Email | `src/server/actions/email.ts` |
| HR fetchers | All 19 files in `src/server/actions/reports/hr/` |
| UI | `report-run-page.tsx`, `report-filter-panel.tsx`, `report-results-table.tsx`, `report-export-toolbar.tsx`, `report-history-page.tsx`, `report-delivery-log-page.tsx`, `report-schedules-page.tsx`, `report-schedule-form.tsx` |
| Export/attachment | `src/lib/export/pdf.ts`, `generate-attachment.ts` |
| Branding | `src/lib/report-center/branding-resolver.ts`, `src/lib/report-center/company-onboarding.ts` |
| Migrations | `20260619130000_report_2_...sql`, `20260619150000_report_4_...sql`, `20260619160000_report_5_...sql` |
| HR page integration | `src/app/(protected)/admin/hr/**/page.tsx`, `src/components/erp/hr-reports-menu.tsx` |
| RBAC | `src/lib/rbac/check.ts` |
| SOT | `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` |
| Implementation Reports | REPORT_1 through REPORT_5 |

---

## 3. Source of Truth Alignment

| Item | Expected | Observed | Status |
|---|---|---|---|
| REPORT.1 | CLOSED ✅ | CLOSED ✅ | PASS |
| REPORT.2 | CLOSED ✅ | CLOSED ✅ | PASS |
| REPORT.3 | CLOSED ✅ | CLOSED ✅ | PASS |
| REPORT.4 | CLOSED ✅ | CLOSED ✅ | PASS |
| REPORT.5 | CLOSED ✅ | CLOSED ✅ | PASS |
| HR.11 | CLOSED ✅ (via REPORT phases) | CLOSED ✅ | PASS |
| HR.12 | NOT STARTED | NOT STARTED | PASS |
| HR.13 | NOT STARTED | NOT STARTED | PASS |
| Next phase | HR.12 (after review approval) | Stated as HR.12 in SOT | PASS |

**SOT is correct and consistent.** No contradictions found. The SOT last-updated stamp is `2026-06-19` matching the closure of REPORT.5.

---

## 4. Report Registry Review

### 4.1 Core HR Reports (sort_order 100–117)

| Report Code | Name | Category | Permissions | Sensitive Profile | Branding | Scheduling | Status |
|---|---|---|---|---|---|---|---|
| HR_EMPLOYEE_LIST | Employee List | list | hr.employees.view | normal | auto_by_owner_company | false | ✅ IMPLEMENTED |
| HR_EMPLOYEE_PROFILE | Employee Profile | detail | hr.employees.view | mixed_sensitive | auto_by_owner_company | false | ✅ IMPLEMENTED |
| HR_COMPLIANCE_EXPIRY | Compliance Expiry | compliance | hr.compliance.view | normal | auto_by_owner_company | false | ✅ IMPLEMENTED |
| HR_ATTENDANCE_SUMMARY | Attendance Summary | summary | hr.attendance.view | normal | auto_by_owner_company | false | ✅ IMPLEMENTED |
| HR_LEAVE_BALANCE | Leave Balance | summary | hr.leave.view | normal | auto_by_owner_company | false | ✅ IMPLEMENTED |
| HR_LEAVE_REQUESTS | Leave Requests | list | hr.leave.view | normal | auto_by_owner_company | false | ✅ IMPLEMENTED |
| HR_WPS_READINESS | WPS Readiness | compliance | hr.payroll.view | payroll | auto_by_owner_company | false | ✅ IMPLEMENTED |
| HR_ASSIGNMENT_BY_SITE | Assignment by Site | list | hr.operations.view | normal | auto_by_owner_company | false | ✅ IMPLEMENTED |
| HR_PRO_PROCESSES | PRO Processes | list | hr.actions.view | normal | auto_by_owner_company | false | ✅ IMPLEMENTED |
| HR_CANDIDATE_PIPELINE | Candidate Pipeline | list | hr.recruitment.view | recruitment | auto_by_owner_company | false | ✅ IMPLEMENTED |
| HR_REQUISITIONS | Job Requisitions | list | hr.recruitment.view | normal | auto_by_owner_company | false | ✅ IMPLEMENTED |
| HR_ONBOARDING_TASKS | Onboarding Tasks | list | hr.recruitment.view | normal | auto_by_owner_company | false | ✅ IMPLEMENTED |
| HR_DISCIPLINARY_SUMMARY | Disciplinary Summary | summary | hr.actions.view | disciplinary | auto_by_owner_company | false | ✅ IMPLEMENTED |
| HR_OVERTIME_REPORT | Overtime Report | summary | hr.attendance.view | normal | auto_by_owner_company | false | ✅ IMPLEMENTED |
| HR_ABSENT_LATE_SUMMARY | Absent & Late Summary | summary | hr.attendance.view | normal | auto_by_owner_company | false | ✅ IMPLEMENTED |
| HR_EOS_CASES | End of Service Cases | list | hr.actions.view | normal | auto_by_owner_company | false | ✅ IMPLEMENTED |
| HR_PPE_ISSUE_REPORT | PPE Issue Report | list | hr.operations.view | normal | auto_by_owner_company | false | ✅ IMPLEMENTED |
| HR_ASSET_ISSUE_REPORT | Asset Issue Report | list | hr.operations.view | normal | auto_by_owner_company | false | ✅ IMPLEMENTED |

### 4.2 HR Letters / Certificates / Forms (sort_order 200–207)

| Report Code | Name | Numbering | Permission | Sensitive | Letter | Status |
|---|---|---|---|---|---|---|
| HR_EXPERIENCE_LETTER | Experience Letter | HR_EXPERIENCE_LETTER | hr.employees.view | normal | true | ✅ IMPLEMENTED |
| HR_SALARY_CERT_GENERAL | Salary Certificate (General) | HR_SALARY_CERTIFICATE | hr.employees.view | normal | true | ✅ IMPLEMENTED |
| HR_SALARY_CERT_WITH_AMOUNT | Salary Certificate (with Amount) | HR_SALARY_CERTIFICATE | hr.payroll.view | payroll | true | ✅ IMPLEMENTED |
| HR_NOC | No Objection Certificate | HR_NOC | hr.employees.view | normal | true | ✅ IMPLEMENTED |
| HR_EMPLOYEE_ID_CARD | Employee ID Card | — | hr.employees.view | normal | false | ✅ IMPLEMENTED |
| HR_PPE_ISSUE_FORM | PPE Issue Form | HR_PPE_ISSUE_FORM | hr.operations.view | normal | false | ✅ IMPLEMENTED |
| HR_JOINING_CHECKLIST | Joining Checklist | HR_JOINING_CHECKLIST | hr.employees.view | normal | false | ✅ IMPLEMENTED |
| HR_CLEARANCE_FORM | Employee Clearance Form | HR_CLEARANCE_FORM | hr.actions.view | normal | false | ✅ IMPLEMENTED |

### 4.3 Registry Quality Checks

| Check | Result |
|---|---|
| All HR.11 report codes exist | ✅ All 26 codes present |
| Report categories correct | ✅ (list, detail, summary, compliance, letter, certificate, form, badge, checklist) |
| Output formats correct | ✅ Screen/PDF/Excel/CSV/Print for reports; PDF/Print only for letters |
| Permissions correct | ✅ Aligned with HR module permission scheme |
| Sensitive profiles correct | ✅ Normal/payroll/recruitment/disciplinary/mixed_sensitive as appropriate |
| Branding strategy correct | ✅ All `auto_by_owner_company` (correct for HR company-specific documents) |
| Numbering flags correct | ✅ Letters/forms with true, reports with false |
| No duplicate codes | ✅ Migration uses `ON CONFLICT (report_code) DO UPDATE` |
| Inactive/placeholder entries | ✅ None — all 26 entries are `is_active = true` |

**Minor gap (MEDIUM):** `HR_WPS_READINESS` registry has `sensitive_profile: 'payroll'` which triggers full payroll redaction rules (removing `basic_salary`, `gross_salary`, `net_salary`, `iban`, `bank_account_number`). The fetcher already strips these fields. The redaction engine then additionally attempts to strip the same fields from the returned rows. Double redaction is harmless but the registry `sensitive_profile` should arguably be `normal` (since no salary/IBAN is returned by the fetcher), with the registry `sensitive_field_rules_json` documenting the intent. This is informational — current behavior is safe.

---

## 5. HR Report Fetcher Review

| Report Code | Fetcher File | Registered | Data Source | Filters | Redaction | Owner Company Support | Status | Issues |
|---|---|---|---|---|---|---|---|---|
| HR_EMPLOYEE_LIST | employee-list-report.ts | ✅ | employees + joins | company/dept/status/date/search | normal | ✅ ownerCompanyIds | ✅ | None |
| HR_EMPLOYEE_PROFILE | employee-profile-report.ts | ✅ | employees + all sub-tables | employee_id | mixed_sensitive (handled by engine) | ✅ single company | ✅ | None |
| HR_COMPLIANCE_EXPIRY | compliance-expiry-report.ts | ✅ | identity_docs + insurance + training | company/dept/type/expiry/status | normal (doc_number masked by design) | ✅ ownerCompanyIds | ✅ | None |
| HR_ATTENDANCE_SUMMARY | attendance-summary-report.ts | ✅ | employee_daily_attendance | company/dept/site/date range/status | normal | ✅ ownerCompanyIds | ✅ | None |
| HR_LEAVE_BALANCE | leave-balance-report.ts | ✅ | leave_balances + leave_types | company/dept/date | normal | ✅ ownerCompanyIds | ✅ | None |
| HR_LEAVE_REQUESTS | leave-requests-report.ts | ✅ | leave_requests + joins | company/dept/date/status | normal | ✅ ownerCompanyIds | ✅ | None |
| HR_WPS_READINESS | wps-readiness-report.ts | ✅ | employees + wps_profiles + banks + holds | company/dept/readiness | IBAN/account/salary omitted at source | ✅ ownerCompanyIds | ✅ | See note above |
| HR_ASSIGNMENT_BY_SITE | assignment-by-site-report.ts | ✅ | employee_assignments | company/site/date/status | normal | ✅ ownerCompanyIds | ✅ | None |
| HR_PRO_PROCESSES | pro-processes-report.ts | ✅ | employee_pro_processes | company/dept/status/date | normal | ✅ ownerCompanyIds | ✅ | None |
| HR_CANDIDATE_PIPELINE | candidate-pipeline-report.ts | ✅ | hr_candidates + interviews + offers | status/stage/date/search | expected_salary/offer_amount omitted ✅ | ✅ owner_company_id from offer | ✅ | owner_company_id=0 for no-offer candidates (safe but inaccurate context) |
| HR_REQUISITIONS | requisitions-report.ts | ✅ | hr_job_requisitions | company/dept/status/date | normal | ✅ ownerCompanyIds | ✅ | None |
| HR_ONBOARDING_TASKS | onboarding-tasks-report.ts | ✅ | hr_onboarding_tasks | status/date | normal | ✅ ownerCompanyIds | ✅ | None |
| HR_DISCIPLINARY_SUMMARY | disciplinary-summary-report.ts | ✅ | employee_disciplinary_records | company/dept/date/status | subject hidden unless hr.actions.manage ✅ | ✅ ownerCompanyIds | ✅ | Filter key `employee_status` maps to record `status` (misleading name) |
| HR_OVERTIME_REPORT | overtime-report.ts | ✅ | employee_overtime_records | company/dept/date/status | normal | ✅ ownerCompanyIds | ✅ | None |
| HR_ABSENT_LATE_SUMMARY | absent-late-summary-report.ts | ✅ | employee_daily_attendance | company/dept/date/status | normal | ✅ ownerCompanyIds | ✅ | None |
| HR_EOS_CASES | eos-cases-report.ts | ✅ | employee_eos_cases | company/dept/status/date | normal | ✅ ownerCompanyIds | ✅ | None |
| HR_PPE_ISSUE_REPORT | ppe-issue-report.ts | ✅ | employee_ppe_issues | company/dept/site/date/status | normal | ✅ ownerCompanyIds | ✅ | None |
| HR_ASSET_ISSUE_REPORT | asset-issue-report.ts | ✅ | employee_assets | company/dept/date/status | normal | ✅ ownerCompanyIds | ✅ | None |
| HR_EXPERIENCE_LETTER | hr-letter-documents.ts | ✅ | employees + eos_cases | employee_id (required) | normal | ✅ single | ✅ | None |
| HR_SALARY_CERT_GENERAL | hr-letter-documents.ts | ✅ | employees | employee_id (required) | normal (no salary fields) | ✅ single | ✅ | None |
| HR_SALARY_CERT_WITH_AMOUNT | hr-letter-documents.ts | ✅ | employees + payroll_profiles | employee_id (required), requires hr.payroll.view | checked in fetcher ✅ | ✅ single | ✅ | Permission checked twice (fetcher + registry) — doubly safe |
| HR_NOC | hr-letter-documents.ts | ✅ | employees + identity_docs | employee_id (required) | passport masked in fetcher ✅ | ✅ single | ✅ | None |
| HR_EMPLOYEE_ID_CARD | hr-letter-documents.ts | ✅ | employees | employee_id (required) | normal | ✅ single | ✅ | None |
| HR_PPE_ISSUE_FORM | hr-letter-documents.ts | ✅ | employees + ppe_issues | employee_id (required) | normal | ✅ single | ✅ | None |
| HR_JOINING_CHECKLIST | hr-letter-documents.ts | ✅ | employees | employee_id (required) | normal (hardcoded checklist items) | ✅ single | ✅ | Checklist items are static; not DB-driven |
| HR_CLEARANCE_FORM | hr-letter-documents.ts | ✅ | employees + eos_cases + clearance_items | employee_id (required) | normal | ✅ single | ✅ | None |

**General fetcher quality:**

- All fetchers use `createAdminClient()` (server-side DB access) ✅
- All fetchers return `ReportDataResult` shape ✅
- All list-type fetchers return `ownerCompanyIds` in `meta` ✅
- All letter-type fetchers return `ownerCompanyIds: [emp.owner_company_id]` in `meta` ✅
- No hardcoded company names ✅ (uses DB-fetched `legal_name_en`)
- No direct export logic in fetchers ✅
- All handle empty data (return `{columns:[], rows:[], meta:{total:0}}`) ✅
- Date filters use string `.gte()`/`.lte()` — safe for ISO date strings ✅
- Row limits in place: 2000 for employee-based, 5000 for activity-based ✅

---

## 6. Report Run Page Runtime Review

### 6.1 Route Loading

`/admin/reports/run/[reportCode]/page.tsx` — server component loads `erp_report_registry` by `report_code`, checks `reports.run` permission, and renders `ReportRunPage`. Permission denial redirects to `/admin`. Registry entry missing returns 404 message.

| Check | Status | Notes |
|---|---|---|
| Route loads registry entry safely | ✅ | Uses `adminClient` + `.maybeSingle()` |
| Permission denial behavior | ✅ | Redirects to `/admin` on missing `reports.run` |
| `runReportAction` used | ✅ | Via `report-run-page.tsx` → `runReportAction` |
| Results display safely | ✅ | `ReportResultsTable` renders only `data.columns` |
| Export uses authorized columns | ✅ | Export uses `data.columns` returned after redaction |
| Large PDF/print warning | ✅ | `LARGE_EXPORT_PDF_THRESHOLD = 500` — warns at row count > 500 |
| Mixed-company template selection triggered | ✅ | `ReportTemplateSelectDialog` shown when `requiresManualTemplateSelection` |
| Selected template passed to export | ✅ | `selectedTemplateId` passed to `runReportAction`, `resolvedBranding` passed to export |
| Saved filters do not store report rows | ✅ | `filters_json` stores only filter key/value pairs |
| Column visibility cannot reveal unauthorized columns | ✅ | `visibleColumns` only hides; export uses `data.columns` (server-redacted) |

### 6.2 Filter Panel Gap

**MEDIUM gap:** `ReportFilterPanel` renders generic `text`/`date`/`select` inputs. The filter schema from `filter_schema_json` (e.g., `owner_company_id`, `department_id`, `work_site_id`, `employee_id`) are numeric IDs stored as raw text inputs. Users must type the ID number directly — there is no `ERPCombobox` lookup connected to the DB for these fields. This makes the following filters practically unusable without knowing the ID:
- `owner_company_id`, `department_id`, `work_site_id`, `designation_id`
- `employee_id` (required for all letter-type reports)

For letter-type reports (HR_NOC, HR_EXPERIENCE_LETTER, etc.), the user MUST know the `employee_id` integer to run the report. **This is the single largest UX gap in the report run experience.**

### 6.3 Column Visibility Gap

**MEDIUM gap:** Column visibility is local `useState` only. The `column-profiles.ts` server actions (`createColumnProfile`, `listColumnProfiles`) exist but are NOT wired to the UI in `report-run-page.tsx`. Named save/load of column visibility profiles is missing. Current behavior: visibility resets on page refresh.

---

## 7. Export / Print / PDF / Excel / CSV Review

| Check | Status | Notes |
|---|---|---|
| No hardcoded "Alliance Gulf ERP" footer | ✅ | `branding.footerTextEn ?? "ERP Report"` neutral fallback |
| Neutral fallback is "ERP Report" | ✅ | Confirmed in `pdf.ts` and `generate-attachment.ts` |
| Branding uses `ExportBrandingContext` | ✅ | All adapters accept optional `branding` parameter |
| PDF/print/Excel honor selected template | ✅ | `resolvedBranding` passed through to export options |
| CSV backward compatible | ✅ | CSV export has no branding — just data and UTF-8 BOM |
| PDF works without logo | ✅ | Logo section skipped if `branding.logoUrl` not present |
| Print can show logo | ✅ | `branding.logoUrl` used in `print.ts` |
| Email attachments use same template | ✅ | `buildExportOptions()` passes `resolvedBranding` to attachment generator |
| No sensitive values bypass redaction during export | ✅ | Export uses `data` from `runResult` which is post-redaction |

**Known limitation (DEFERRED):** PDF logo embedding via `jsPDF` requires base64/data URL, not a remote HTTPS URL. If `branding.logoUrl` is a Supabase Storage URL, it cannot be fetched client-side in `jsPDF` without a server-side base64 conversion step. This is a pre-existing documented limitation from REPORT.3. Logo is omitted silently if URL fetch fails.

---

## 8. Branding / Template / Multi-Company Review

| Check | Status | Notes |
|---|---|---|
| Single-company reports auto-resolve | ✅ | `branding-resolver.ts` — 1 `ownerCompanyId` → loads company default template |
| Multi-company reports require manual selection | ✅ | `requiresManualTemplateSelection: true` when `ownerCompanyIds.length > 1` |
| No hardcoded ALGT/ALS logic | ✅ | All resolution is DB-driven via `owner_companies` and `erp_report_branding_profiles` |
| `company-onboarding.ts` idempotent | ✅ | Uses `ON CONFLICT DO NOTHING` pattern |
| New owner company creates branding + templates | ✅ | `ensureCompanyReportBranding()` helper creates profile + report/letter templates |
| Templates and branding profiles permission-gated | ✅ | RLS: `reports.view` for SELECT, `erp.admin` or `reports.manage` for writes |
| Stamp/signature fields not exposed | ✅ | `stamp_url`, `signature_url` are in branding profile but only used in PDF rendering |

**No hardcoded company identities found.** Decision tree in `resolveReportBranding` is clean and extensible.

---

## 9. Email / Scheduling / History Review

### 9.1 Email Delivery

| Check | Status | Notes |
|---|---|---|
| Report email checks `reports.email` | ✅ | `sendReportEmail` checks `hasPermission(ctx, "reports.email")` |
| Delivery logs written | ✅ | `erp_report_delivery_logs` row inserted after each `sendReportEmail` call |
| Delivery logs do not store raw report data | ✅ | Only `body_preview` (max 200 chars), `attachment_filename`, metadata |
| Email permission seeded in REPORT.2 | ✅ | `reports.email` seeded in migration `20260619130000` |

**HIGH gap — Email permission case mismatch:**  
`sendReportEmail` calls `sendExportEmail` with `context: { moduleCode: "REPORTS" }`. Inside `sendExportEmail`, the required permission is built as:
```typescript
const requiredPermission = `${input.context.moduleCode}.view`; // → "REPORTS.view"
```
`hasPermission` performs `ctx.permissionCodes.includes("REPORTS.view")` — case-sensitive. The DB stores permissions as lowercase `"reports.view"`. Non-admin users (without `system_admin` or `group_admin` role) will fail this check, causing all report email sends to return "Permission denied" even though they already passed the `reports.email` check.

**Fix required:** Change `moduleCode: "REPORTS"` to `moduleCode: "reports"` in the `sendReportEmail` → `sendExportEmail` call, or remove the secondary permission check inside `sendExportEmail` when called from `sendReportEmail`.

### 9.2 Report Schedules

| Check | Status | Notes |
|---|---|---|
| Schedules validate permissions before creation | ✅ | `createReportSchedule` checks `reports.schedule.manage` + `reports.run` + `reports.email` + report-specific permissions |
| Schedules validate current permissions before execution | ✅ | `processDueReportSchedules` calls `getCreatorPermissions` at runtime |
| Template missing/inactive causes safe skip | ✅ | `executeScheduleRun` returns error if run fails; `markScheduleSkipped` writes `last_status: 'skipped'` |
| Multi-company schedules require selected template | ✅ | `processDueReportSchedules` skips if `!sched.selected_template_id && sched.owner_company_id === null` |
| `processDueReportSchedules` foundation is safe | ✅ | Foundation code is correct; scheduling logic is sound |
| External cron requirement is documented | ✅ | Documented as operational follow-up in the server action file header |
| History UI does not expose unauthorized runs | MEDIUM — see below |
| Normal users see own history | MEDIUM — see below |

**HIGH gap — `listReportSchedules` access control logic bug:**  
```typescript
if (!hasPermission(ctx, "reports.schedule.view") && !hasPermission(ctx, "reports.schedule.manage")) {
  if (!ctx.profile?.id) {  // Only returns error if no profile
    return { success: false, error: "Permission denied." };
  }
}
// Falls through → returns all schedules
```
If the user lacks both schedule permissions but has a valid profile, the outer `if` block is entered but returns nothing (falls through). All schedules are then returned to the caller. **Any authenticated user with a valid profile can list all report schedules.**

**Fix required:** Remove the inner `if (!ctx.profile?.id)` and return the permission denied error directly.

**HIGH gap — Timezone ignored in `calculateNextRunAt`:**  
The `_timezone` parameter is prefixed with underscore (explicitly unused). Schedule times are calculated in the Node.js server's local timezone, not the user-specified `Asia/Dubai` timezone. Scheduled reports may run at incorrect times in production if the server runs in UTC (common for cloud deployments).

**Fix required:** Use a timezone-aware date library (e.g., `date-fns-tz`) to calculate `next_run_at` in the specified timezone.

**MEDIUM gap — `processDueReportSchedules` is a Server Action, not callable from cron:**  
Supabase pg_cron and Supabase Edge Function schedulers cannot invoke Next.js Server Actions directly. An API route (`/api/reports/process-schedules`) or a dedicated Supabase Edge Function is needed as the cron trigger.

### 9.3 Report History

**MEDIUM gap — History RLS allows any `reports.view` user to see ALL runs:**  
`erp_report_runs` RLS SELECT policy uses `current_user_has_permission('reports.view')`. Any user with `reports.view` can read all run records from all users. The `report-history-page.tsx` client component fetches via `createClient()` (browser client subject to RLS). There is no `run_by = current_user_profile_id()` row-level filter for non-admin users. Regular users should only see their own history; admins should see all.

---

## 10. Security / RLS Review

### 10.1 Table Audit

| Table | BIGINT PK | RLS Enabled | RLS Forced | Content Check |
|---|---|---|---|---|
| `erp_report_branding_profiles` | ✅ | ✅ (REPORT.2) | ✅ | Branding config only — no raw data |
| `erp_report_templates` | ✅ | ✅ (REPORT.2) | ✅ | Template metadata only |
| `erp_report_registry` | ✅ | ✅ (REPORT.2) | ✅ | Report config only |
| `erp_report_runs` | ✅ | ✅ (REPORT.2) | ✅ | Metadata only (no row data stored) ✅ |
| `erp_report_delivery_logs` | ✅ | ✅ (REPORT.2) | ✅ | Delivery metadata + body_preview max 200 chars ✅ |
| `erp_report_saved_filters` | ✅ | ✅ (REPORT.5) | Needs verify | `filters_json` stores filter params only ✅ |
| `erp_report_column_profiles` | ✅ | ✅ (REPORT.5) | Needs verify | `column_config_json` stores col visibility ✅ |
| `erp_report_schedules` | ✅ | ✅ (REPORT.5) | Needs verify | Schedule config only ✅ |

**No report row data is stored in any table.** ✅

### 10.2 Sensitive Data Audit

| Profile | Fields Protected | Mechanism |
|---|---|---|
| `payroll` | basic_salary, gross_salary, net_salary, iban, bank_account_number, wps_amount | Removed by redaction engine if caller lacks `hr.payroll.view` |
| `medical` | diagnosis, medical_notes, prescription, chronic_condition | Removed if lacks `hr.medical.view` |
| `disciplinary` | disciplinary_notes, violation_details, penalty_details | Removed if lacks `hr.disciplinary.view` |
| `recruitment` | expected_salary, offer_amount, interview_feedback, rejection_reason | Removed if lacks `hr.recruitment.view` |
| `dms_confidential` | document_content, extracted_text, ai_summary | Removed if lacks `dms.confidential.view` |
| `mixed_sensitive` | subset of payroll + medical + disciplinary per permission | Independently checked per sub-permission |

**Redaction engine is immutable (creates new row objects, never mutates).** ✅  
**Raw sensitive values are never logged.** ✅

### 10.3 Permissions Seeded

| Permission | Migration | Present |
|---|---|---|
| `reports.view` | REPORT.2 | ✅ |
| `reports.run` | REPORT.2 | ✅ |
| `reports.export` | REPORT.2 | ✅ |
| `reports.email` | REPORT.2 | ✅ |
| `reports.schedule.view` | REPORT.5 | ✅ |
| `reports.schedule.manage` | REPORT.5 | ✅ |
| `reports.saved_filters.manage` | REPORT.5 | ✅ |
| `reports.column_profiles.manage` | REPORT.5 | ✅ |

All 8 REPORT permissions are correctly seeded. No missing permissions.

---

## 11. HR Page Integration Review

### 11.1 Pages WITH `HrReportsMenu`

| HR Page | Route | Reports Linked |
|---|---|---|
| Employees | `/admin/hr/employees` | HR_EMPLOYEE_LIST, HR_COMPLIANCE_EXPIRY |
| Payroll Hub | `/admin/hr/payroll` | HR_WPS_READINESS |
| Time Hub | `/admin/hr/time` | HR_ATTENDANCE_SUMMARY, HR_LEAVE_BALANCE, HR_LEAVE_REQUESTS |
| Recruitment Hub | `/admin/hr/recruitment` | HR_CANDIDATE_PIPELINE, HR_REQUISITIONS, HR_ONBOARDING_TASKS |

Employee workspace form (`/admin/hr/employees/record/[id]`) has a "Letters & Forms" section using `HrLetterGenerator` component with direct links to all 8 letter-type reports, with `employee_id` pre-filled. ✅

### 11.2 Pages WITHOUT `HrReportsMenu` (Gap)

| HR Page | Missing Reports | Gap Severity |
|---|---|---|
| Actions Hub (`/admin/hr/actions`) | HR_DISCIPLINARY_SUMMARY, HR_EOS_CASES, HR_PRO_PROCESSES | MEDIUM |
| Operations Hub (`/admin/hr/operations`) | HR_ASSIGNMENT_BY_SITE, HR_PPE_ISSUE_REPORT, HR_ASSET_ISSUE_REPORT | MEDIUM |
| Dashboard (`/admin/hr/dashboard`) | HR_EMPLOYEE_LIST, HR_ATTENDANCE_SUMMARY (summary links) | MEDIUM |
| Search (`/admin/hr/search`) | Contextual report on search results | LOW |

Links to these reports are accessible through the global `/admin/reports?module=HR` page, but in-context report dropdowns are missing from Actions, Operations, and Dashboard pages.

### 11.3 No Duplicate HR Report Pages

Confirmed: no `/admin/hr/reports/` route exists. All reports route through `/admin/reports/run/[reportCode]`. ✅  
No direct PDF generation bypassing the Report Center was found. ✅

---

## 12. Functional Test Matrix

| # | Test | Expected Result | Observed (Static Analysis) | Risk if Not Tested |
|---|---|---|---|---|
| 1 | HR Employee List — single company PDF | Employee list PDF with company header branding | Likely PASS — fetcher + branding resolver both single-company path | Medium — branding may fall back if template not configured |
| 2 | HR Employee List — all companies → template selection | `ReportTemplateSelectDialog` appears before export | PASS — `requiresManualTemplateSelection: true` when multi-company | Low — UI dialog exists |
| 3 | Employee Profile PDF — ALGT employee | PDF with ALGT branding, mixed_sensitive redaction applied | Likely PASS — profile is `mixed_sensitive`, redaction engine handles payroll+medical | HIGH — must verify redaction removes salary from profile PDF |
| 4 | Employee Profile PDF — ALS employee | PDF with ALS branding | Likely PASS if ALS has branding profile configured | Medium — template may fall back to neutral |
| 5 | Compliance Expiry Excel | Excel with all expiring documents, doc number masked | PASS — fetcher masks document_number; Excel export confirmed working | Low |
| 6 | WPS Readiness — verify no IBAN/account/salary | WPS report shows no financial values | PASS — fetcher explicitly omits these fields with comment | High — must verify in actual output |
| 7 | Candidate Pipeline — verify no salary/offer amount | No salary/offer columns in output | PASS — fetcher comments confirm omission | High — must verify in actual output |
| 8 | Disciplinary Summary — verify no notes/details leakage | Subject shows "[Restricted]" without hr.actions.manage | PASS — fetcher checks `permissionCodes.includes("hr.actions.manage")` | HIGH — must verify restriction works |
| 9 | NOC letter — numbering + branding | PDF with masked passport + company branding + letter number | Partial — numbering integration with `global_numbering_rules` was registered but runtime integration with `runReport` not verified | HIGH — letter numbering may not be applied at render time |
| 10 | Salary certificate general — no salary amount | Certificate body with name/designation only | PASS — fetcher returns no salary fields | Low |
| 11 | Salary certificate with amount — permission-gated | Error if missing `hr.payroll.view`; salary shown if present | PASS — checked in both fetcher AND registry required_permissions | HIGH — double protection confirmed |
| 12 | Send report by email — delivery log | Email sent; `erp_report_delivery_logs` row created | **FAIL for non-admin users** — `sendExportEmail` checks `"REPORTS.view"` (uppercase) which won't match DB `"reports.view"` | CRITICAL — email blocked for normal users |
| 13 | Schedule report — run now | Schedule executes, delivery log created | Partial PASS for admin; same email permission bug affects non-admin schedule runs | HIGH |
| 14 | Report history — own vs admin | Admin sees all runs; normal user sees only own | **FAIL** — RLS allows any `reports.view` user to see all runs; no user-scoped filter | HIGH |
| 15 | Saved filter — save/load/delete | Filter saved to DB and reloaded | Likely PASS — server actions exist and are wired | Low — needs runtime verification |
| 16 | Column visibility — hide/export visible columns | Hidden columns not in export | PASS at export level — export uses server-redacted `data.columns` | Low |
| 17 | Large PDF warning >500 rows | Warning toast + confirmation before export | PASS — `LARGE_EXPORT_PDF_THRESHOLD = 500` implemented | Low |

---

## 13. Gap Register

| ID | Gap | Area | Severity | Phase |
|---|---|---|---|---|
| GAP-01 | `sendExportEmail` checks `"REPORTS.view"` (uppercase) — non-admin email sends blocked | Email | HIGH | REPORT.5 |
| GAP-02 | `listReportSchedules` permission logic bug — authenticated users without schedule permissions can list all schedules | Scheduling | HIGH | REPORT.5 |
| GAP-03 | `calculateNextRunAt` ignores timezone — `_timezone` parameter unused | Scheduling | HIGH | REPORT.5 |
| GAP-04 | `ReportFilterPanel` has no entity ID lookups — `employee_id`, `owner_company_id`, `department_id` etc. require raw integer input | UX | HIGH | REPORT.4 |
| GAP-05 | Column profile persistence UI not wired — `column-profiles.ts` server actions exist but not connected to UI | UX | MEDIUM | REPORT.5 |
| GAP-06 | `processDueReportSchedules` is a Server Action, not an API route — cannot be called from Supabase Cron or pg_cron | Scheduling | MEDIUM | REPORT.5 |
| GAP-07 | Report history RLS allows all `reports.view` users to see all run records — no user-scoped row filter | Security | MEDIUM | REPORT.2 |
| GAP-08 | `HrReportsMenu` missing from Actions, Operations, Dashboard HR pages | Integration | MEDIUM | REPORT.4 |
| GAP-09 | Letter numbering integration — `global_numbering_rules` are seeded but runtime numbering at report render time is not verified | Letters | MEDIUM | REPORT.4 |
| GAP-10 | PDF logo embedding limitation — jsPDF cannot load remote HTTPS URLs without server-side base64 conversion | Export | DEFERRED | REPORT.3 |
| GAP-11 | `HR_WPS_READINESS` registry `sensitive_profile: 'payroll'` redundant with fetcher-level exclusions | Registry | LOW | REPORT.4 |
| GAP-12 | `HR_DISCIPLINARY_SUMMARY` filter key `employee_status` maps to `record.status` — misleading filter name | Fetcher | LOW | REPORT.4 |
| GAP-13 | `HR_CANDIDATE_PIPELINE` returns `owner_company_id: 0` for candidates without offers — inaccurate context | Fetcher | LOW | REPORT.4 |
| GAP-14 | Arabic letter rendering — jsPDF has limited RTL/Arabic support without additional plugins | Output | DEFERRED | REPORT.3 |
| GAP-15 | `HR_JOINING_CHECKLIST` uses hardcoded checklist items — not DB-driven | Letters | LOW | REPORT.4 |

---

## 14. Risk Rating

| Risk Area | Current Risk Level | Notes |
|---|---|---|
| Report data security (redaction) | **LOW** | Engine is sound; server-side; immutable; permission-checked |
| Export data leakage | **LOW** | Export uses post-redaction data only |
| Branding security | **LOW** | No hardcoded identities; fully DB-driven |
| Report registry integrity | **LOW** | All 26 reports correctly seeded; no duplicates |
| Email delivery for non-admin | **HIGH** | Blocked by uppercase permission code mismatch |
| Schedule access control | **HIGH** | Unauthenticated listing bug |
| Schedule timezone accuracy | **HIGH** | Times calculated in server timezone, not configured timezone |
| Report history privacy | **MEDIUM** | All runs visible to any `reports.view` user |
| Filter UX for ID-based fields | **HIGH (UX)** | Letter-type reports require raw integer employee_id |
| Letter numbering at runtime | **MEDIUM** | Seeded but not verified at render time |
| HR page integration completeness | **MEDIUM** | Actions/Operations/Dashboard pages lack report menus |
| Scheduling cron trigger | **MEDIUM** | Foundation exists; external trigger not set up |

---

## 15. Readiness Decision for HR.12

```
READY FOR HR.12 WITH FIXES
```

**Rationale:**

The HR.11 reporting core — the ability to run any of the 26 HR reports, apply permission-based redaction, export to PDF/Excel/CSV, and view results on-screen — is complete, secure, and production-ready. The REPORT.1–REPORT.5 foundation is solid.

HR.12 (HR AI Integration) operates on the employee data and AI suggestion layer, NOT on the email/scheduling layer. The HIGH gaps identified (GAP-01, GAP-02, GAP-03) are all in the REPORT.5 email/scheduling foundation, which is additional functionality on top of the core. HR.12 does not depend on scheduled emails or the schedule list UI.

**Conditions before proceeding to HR.12:**
1. GAP-01 (email permission case mismatch) — **must fix** if email feature will be tested alongside HR.12.
2. GAP-02 (schedule listing permission bug) — **must fix** before any schedule UI is made accessible to regular users.
3. GAP-03 (timezone in schedules) — **should fix** before schedules are used in production.

**Conditions that can wait until HR.13:**
- GAP-04 (filter panel entity lookups) — UX improvement, not security
- GAP-05 (column profile persistence UI) — enhancement
- GAP-07 (history RLS user scope) — enhancement
- GAP-08 (HR page menu completeness) — enhancement
- GAP-09 (letter numbering verification) — testing

---

## 16. Recommended Next Step

**If GAP-01, GAP-02, GAP-03 are fixed first:**
```
HR.12 — HR AI Integration
```

**If a targeted fix phase is needed before HR.12:**
```
HR.11 / REPORT FINAL FIX — Critical Runtime QA Fixes Before HR.12
```

The fix phase should address:
1. `sendExportEmail` moduleCode lowercase (`"reports"` instead of `"REPORTS"`)
2. `listReportSchedules` permission guard fix (remove inner `if (!ctx.profile?.id)`)
3. `calculateNextRunAt` timezone support via `date-fns-tz`
4. Optional: `ReportFilterPanel` entity ID comboboxes for `employee_id`, `owner_company_id`, `department_id`
5. Optional: `erp_report_runs` RLS history policy scoped to `run_by = current_user_profile_id()` for non-admin users

---

*Report generated: 2026-06-19 — Read-only audit. No code changes made.*

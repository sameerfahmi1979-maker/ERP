# REPORT.4 — HR.11 Reports + Letters + Forms Library
## Implementation Report

**Phase:** REPORT.4  
**Status:** CLOSED / PASS ✅  
**Date:** 2026-06-19  
**Build:** tsc PASS · build PASS  
**Migration:** `20260619150000_report_4_hr11_reports_letters_forms_library.sql`

---

## 1. Scope

Built the full HR report library on top of the global Report Center engine (REPORT.2 + REPORT.3). No new engine created — all HR reports use the shared `ReportFetcher` contract, `runReportAction`, branding resolver, and export adapters.

Deliverables:
- 26 HR report/letter/form registry entries in `erp_report_registry`
- 6 official numbering rules in `global_numbering_rules`
- 19 fetcher files (one per report or letter group)
- 5 new UI components
- Generic report run page `/admin/reports/run/[reportCode]`
- HR module-level report dropdowns (employees, time, payroll, recruitment pages)
- "Letters & Forms" section in Employee workspace form

---

## 2. Database Migration

**File:** `supabase/migrations/20260619150000_report_4_hr11_reports_letters_forms_library.sql`  
**Applied:** via MCP `apply_migration`

### Registry entries seeded (26 total)

| Report Code | Category | Type |
|---|---|---|
| HR_EMPLOYEE_LIST | hr | report |
| HR_EMPLOYEE_PROFILE | hr | report |
| HR_COMPLIANCE_EXPIRY | hr | report |
| HR_ATTENDANCE_SUMMARY | hr | report |
| HR_LEAVE_BALANCE | hr | report |
| HR_LEAVE_REQUESTS | hr | report |
| HR_WPS_READINESS | hr | report |
| HR_ASSIGNMENT_BY_SITE | hr | report |
| HR_PRO_PROCESSES | hr | report |
| HR_CANDIDATE_PIPELINE | hr | report |
| HR_REQUISITIONS | hr | report |
| HR_ONBOARDING_TASKS | hr | report |
| HR_DISCIPLINARY_SUMMARY | hr | report |
| HR_OVERTIME_REPORT | hr | report |
| HR_ABSENT_LATE_SUMMARY | hr | report |
| HR_EOS_CASES | hr | report |
| HR_PPE_ISSUE | hr | report |
| HR_ASSET_ISSUE | hr | report |
| HR_EXPERIENCE_LETTER | hr | letter |
| HR_EXPERIENCE_LETTER_AR | hr | letter |
| HR_SALARY_CERTIFICATE | hr | letter |
| HR_SALARY_CERTIFICATE_AR | hr | letter |
| HR_NOC | hr | letter |
| HR_NOC_AR | hr | letter |
| HR_EMPLOYMENT_CONTRACT | hr | form |
| HR_CLEARANCE_FORM | hr | form |

### Numbering rules seeded (6 total)

| Prefix | Pattern | Document Type |
|---|---|---|
| HREL | HR-EL-{YYYY}-{SEQ6} | Experience Letter |
| HRELAR | HR-EL-AR-{YYYY}-{SEQ6} | Experience Letter (Arabic) |
| HRSAL | HR-SAL-{YYYY}-{SEQ6} | Salary Certificate |
| HRSALAR | HR-SAL-AR-{YYYY}-{SEQ6} | Salary Certificate (Arabic) |
| HRNOC | HR-NOC-{YYYY}-{SEQ6} | NOC Letter |
| HRELOA | HR-LOA-{YYYY}-{SEQ6} | Employment Offer/Contract |

---

## 3. Report Fetchers

All fetchers live under `src/server/actions/reports/hr/` and implement the `ReportFetcher` interface from `src/lib/report-center/types.ts`.

| File | Report Code(s) |
|---|---|
| `employee-list-report.ts` | HR_EMPLOYEE_LIST |
| `employee-profile-report.ts` | HR_EMPLOYEE_PROFILE |
| `compliance-expiry-report.ts` | HR_COMPLIANCE_EXPIRY |
| `attendance-summary-report.ts` | HR_ATTENDANCE_SUMMARY |
| `leave-balance-report.ts` | HR_LEAVE_BALANCE |
| `leave-requests-report.ts` | HR_LEAVE_REQUESTS |
| `wps-readiness-report.ts` | HR_WPS_READINESS |
| `assignment-by-site-report.ts` | HR_ASSIGNMENT_BY_SITE |
| `pro-processes-report.ts` | HR_PRO_PROCESSES |
| `candidate-pipeline-report.ts` | HR_CANDIDATE_PIPELINE |
| `requisitions-report.ts` | HR_REQUISITIONS |
| `onboarding-tasks-report.ts` | HR_ONBOARDING_TASKS |
| `disciplinary-summary-report.ts` | HR_DISCIPLINARY_SUMMARY |
| `overtime-report.ts` | HR_OVERTIME_REPORT |
| `absent-late-summary-report.ts` | HR_ABSENT_LATE_SUMMARY |
| `eos-cases-report.ts` | HR_EOS_CASES |
| `ppe-issue-report.ts` | HR_PPE_ISSUE |
| `asset-issue-report.ts` | HR_ASSET_ISSUE |
| `hr-letter-documents.ts` | HR_EXPERIENCE_LETTER, HR_EXPERIENCE_LETTER_AR, HR_SALARY_CERTIFICATE, HR_SALARY_CERTIFICATE_AR, HR_NOC, HR_NOC_AR, HR_EMPLOYMENT_CONTRACT, HR_CLEARANCE_FORM |

All 26 fetchers registered in `src/lib/report-center/report-fetchers.ts` `REPORT_FETCHERS` dispatch map.

### Fetcher design patterns

- Use `createAdminClient()` for all DB access (no browser client)
- Filter by `owner_company_id` when provided (multi-company support)
- Return `meta.ownerCompanyIds` array for branding resolver
- Sensitive columns (salary, IBAN, passport, SIN) only included when `sensitive_profile` permits
- Joins use Supabase nested select syntax; results cast via `as unknown as T` to satisfy TypeScript strict mode

---

## 4. UI Components

### `src/features/report-center/report-filter-panel.tsx`
Client component. Renders filter form from `FilterField[]` array (text, date, date-range, select types). Controlled via `values`/`onChange` props.

### `src/features/report-center/report-results-table.tsx`
Client component. Displays tabular `ReportDataResult` with column headers from `columns[]`, formatted cell values (dates, booleans, status badges), row count footer.

### `src/features/report-center/report-export-toolbar.tsx`
Client component. Provides CSV, Print, PDF, Excel export buttons using existing `exportToPDF`, `exportToExcel`, `exportToPrint` adapters from `src/lib/export/*`. PDF/Excel export in a `DropdownMenu` for template-gated branding.

### `src/components/erp/hr-reports-menu.tsx`
Client component. `DropdownMenu` button with list of HR report links. Each link navigates to `/admin/reports/run/[reportCode]`. Used on HR module list pages.

### `src/features/report-center/hr-letter-generator.tsx`
Client component. Lists available HR letters and forms for a specific employee. Pre-fills `?employee_id=` on link to report run page. Hides salary certificate behind `hr.payroll.view` permission check.

---

## 5. Report Run Page

**Route:** `/admin/reports/run/[reportCode]`  
**Server Component:** `src/app/(protected)/admin/reports/run/[reportCode]/page.tsx`  
**Client Component:** `src/features/report-center/report-run-page.tsx`

Flow:
1. Server component loads registry entry by `reportCode` (via `getReportRegistryEntry`)
2. Checks user permission; returns `notFound()` if missing
3. Extracts initial filter values from `searchParams` (supports `?employee_id=`, `?owner_company_id=`, etc.)
4. Renders `ReportRunPage` client component with registry, initial filters
5. User sets filters → clicks "Run Report" → calls `runReportAction` (server action)
6. Results displayed in `ReportResultsTable`
7. Export via `ReportExportToolbar` (CSV/Print/PDF/Excel)
8. For multi-company reports requiring template selection, `ReportTemplateSelectDialog` appears before PDF/Excel export

---

## 6. HR Module Integration

### HR module list pages (Reports dropdown)

| Page | Route | Reports |
|---|---|---|
| Employees | `/admin/hr/employees` | Employee List, Compliance Expiry |
| Time & Leave | `/admin/hr/time` | Attendance Summary, Leave Balance, Leave Requests, Overtime, Absent & Late |
| Payroll | `/admin/hr/payroll` | WPS Readiness |
| Recruitment | `/admin/hr/recruitment` | Candidate Pipeline, Job Requisitions, Onboarding Tasks |

### Employee workspace form — Letters & Forms tab

`src/features/hr/employees/employee-workspace-form.tsx` now includes a "Letters & Forms" section using `ERPRecordSectionPanel` containing `HrLetterGenerator`. The section appears for any employee with a valid `id` and lists all 8 letter/form types with direct links to the report run page.

---

## 7. Files Changed / Created

### New files
```
src/server/actions/reports/hr/employee-list-report.ts
src/server/actions/reports/hr/employee-profile-report.ts
src/server/actions/reports/hr/compliance-expiry-report.ts
src/server/actions/reports/hr/attendance-summary-report.ts
src/server/actions/reports/hr/leave-balance-report.ts
src/server/actions/reports/hr/leave-requests-report.ts
src/server/actions/reports/hr/wps-readiness-report.ts
src/server/actions/reports/hr/assignment-by-site-report.ts
src/server/actions/reports/hr/pro-processes-report.ts
src/server/actions/reports/hr/candidate-pipeline-report.ts
src/server/actions/reports/hr/requisitions-report.ts
src/server/actions/reports/hr/onboarding-tasks-report.ts
src/server/actions/reports/hr/disciplinary-summary-report.ts
src/server/actions/reports/hr/overtime-report.ts
src/server/actions/reports/hr/absent-late-summary-report.ts
src/server/actions/reports/hr/eos-cases-report.ts
src/server/actions/reports/hr/ppe-issue-report.ts
src/server/actions/reports/hr/asset-issue-report.ts
src/server/actions/reports/hr/hr-letter-documents.ts
src/features/report-center/report-filter-panel.tsx
src/features/report-center/report-results-table.tsx
src/features/report-center/report-export-toolbar.tsx
src/features/report-center/report-run-page.tsx
src/components/erp/hr-reports-menu.tsx
src/features/report-center/hr-letter-generator.tsx
src/app/(protected)/admin/reports/run/[reportCode]/page.tsx
supabase/migrations/20260619150000_report_4_hr11_reports_letters_forms_library.sql
```

### Modified files
```
src/lib/report-center/report-fetchers.ts          (26 fetchers registered)
src/app/(protected)/admin/hr/employees/page.tsx   (HrReportsMenu added)
src/app/(protected)/admin/hr/time/page.tsx         (HrReportsMenu added)
src/app/(protected)/admin/hr/payroll/page.tsx      (HrReportsMenu added)
src/app/(protected)/admin/hr/recruitment/page.tsx  (HrReportsMenu added)
src/features/hr/employees/employee-workspace-form.tsx (Letters & Forms section)
.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md               (updated)
```

---

## 8. Bugs Fixed During Implementation

| # | Issue | Fix |
|---|---|---|
| 1 | `global_numbering_rules` INSERT failed: `null value in column "module_name"` | Added `module_name` + `document_type_name` to INSERT |
| 2 | `global_numbering_rules` INSERT failed: check constraint `^[A-Z0-9_]+$` on prefix | Changed `HR-EL` → `HREL`, `HR-SAL` → `HRSAL`, etc. |
| 3 | `TS2352` in 10+ fetcher files: Supabase joins typed as arrays, code cast to single object | Applied `as unknown as T` pattern throughout all fetcher files |
| 4 | `TS2339` in `wps-readiness-report.ts`: `bank_id` not in selected columns | Changed `!wps.bank_id` → `!wps.bank` |
| 5 | `TS2322` in `report-results-table.tsx`: `unknown` not assignable to `ReactNode` | Changed `&&` short-circuit to ternary `? : null` for meta.total rendering |

---

## 9. Validation

```
tsc --noEmit:  EXIT 0 ✅ (0 errors)
npm run build: EXIT 0 ✅
```

---

## 10. Next Phase

**REPORT.5** (planned): Email / Scheduling / Report History / Security UAT  
(Note: Finance/Procurement reports are NOT the next phase — REPORT.5 is the global platform completion phase.)

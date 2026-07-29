# ERP HR.5 — Payroll & WPS Readiness Implementation Report

**Date:** 2026-06-18  
**Phase:** ERP HR.5 — Payroll & WPS Readiness  
**Status:** CLOSED / PASS

---

## 1. Executive Summary

**Status:** PASS

HR.5 implements full payroll readiness and WPS readiness configuration inside the Employee Profile and provides global Payroll & WPS management pages. All 5 HR.5 tables are created, RLS enabled and forced, server actions implemented, and the Payroll & WPS tab is activated in the employee profile.

**Scope implemented:**
- 5 new HR.5 payroll/WPS readiness tables
- Payroll profile per employee
- Named salary components with gross salary calculation
- Append-only salary revision history
- Payroll hold management (place, release, archive)
- WPS profile with bank details (masking enforced)
- Deterministic WPS readiness engine
- Server-side IBAN/account number masking and salary redaction
- Employee Payroll & WPS tab (5 sections)
- Overview tab payroll summary cards (permission-gated)
- Global `/admin/hr/payroll`, `/admin/hr/payroll/salaries`, `/admin/hr/payroll/wps` pages
- Sidebar navigation updated with Payroll & WPS group
- 8 query keys + 7 invalidation helpers

**No HR.6+ implementation performed. No payroll run. No payslips. No accounting.**

---

## 2. Files Created / Modified

### Created
| File | Purpose |
|---|---|
| `supabase/migrations/20260618230000_erp_hr_5_payroll_wps_readiness.sql` | DB migration: 5 tables, 17 indexes, RLS |
| `src/lib/hr/payroll/redaction.ts` | Payroll redaction/masking utilities |
| `src/lib/hr/payroll/wps-readiness.ts` | WPS readiness checker + gross salary calculator |
| `src/server/actions/hr/payroll.ts` | All HR.5 server actions |
| `src/features/hr/employees/tabs/employee-payroll-tab.tsx` | Employee Payroll & WPS tab (5 sections) |
| `src/app/(protected)/admin/hr/payroll/page.tsx` | Global payroll hub page |
| `src/app/(protected)/admin/hr/payroll/salaries/page.tsx` | Global salary profiles page |
| `src/app/(protected)/admin/hr/payroll/wps/page.tsx` | Global WPS readiness page |
| `src/features/hr/payroll/salaries/hr-salaries-page-client.tsx` | Salary profiles client component |
| `src/features/hr/payroll/wps/hr-wps-page-client.tsx` | WPS readiness client component |
| `implementation_Review/HR_Phases/Phase_HR_5/ERP_HR_5_PAYROLL_WPS_READINESS_IMPLEMENTATION_REPORT.md` | This report |

### Modified
| File | Change |
|---|---|
| `src/lib/query/query-keys.ts` | Added `queryKeys.hr.payroll` with 9 key factories |
| `src/lib/query/invalidation.ts` | Added 7 invalidation helpers for HR.5 payroll data |
| `src/features/hr/employees/employee-workspace-form.tsx` | Replaced Payroll placeholder with `EmployeePayrollTab`, added `canViewPayroll` to Overview |
| `src/features/hr/employees/tabs/employee-overview-tab.tsx` | Added `PayrollSummarySection` (HR.5), removed HR.5 placeholder, added `canViewPayroll` prop |
| `src/components/layout/app-sidebar.tsx` | Added "Payroll & WPS" nav group with Salary Profiles + WPS Readiness links |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Updated SOT with HR.5 closure entry |

---

## 3. Database Migration Summary

**Migration file:** `supabase/migrations/20260618230000_erp_hr_5_payroll_wps_readiness.sql`

### Tables Created
| Table | Purpose |
|---|---|
| `employee_payroll_profiles` | Payroll readiness profile per employee (UNIQUE on employee_id) |
| `employee_salary_components` | Named salary components (Basic, Housing, etc.) |
| `employee_salary_revisions` | Append-only salary revision history |
| `employee_payroll_holds` | Payroll hold management |
| `employee_wps_profiles` | WPS enrollment + bank details (UNIQUE on employee_id) |

### Indexes Created
17 indexes created in the same migration:
- `employee_payroll_profiles`: 3 indexes (employee, group, status)
- `employee_salary_components`: 4 indexes (employee, type, effective dates, active)
- `employee_salary_revisions`: 2 indexes (employee, employee+date)
- `employee_payroll_holds`: 3 indexes (employee, active, hold_date)
- `employee_wps_profiles`: 5 indexes (employee, status, bank, mohre, applicable)

### RLS Confirmation
All 5 tables:
- `relrowsecurity = true` ✅
- `relforcerowsecurity = true` ✅

Verified via live SQL query on `pg_class`.

### Payroll Helper Functions Created
```sql
current_user_can_view_employee_payroll(employee_id BIGINT) → BOOLEAN
current_user_can_manage_employee_payroll(employee_id BIGINT) → BOOLEAN
```
Both are SECURITY DEFINER, STABLE SQL functions reusing existing HR.2 helpers.

### Append-Only Salary Revision Policy Confirmation
`employee_salary_revisions` has:
- `emp_salary_rev_select` (FOR SELECT) ✅
- `emp_salary_rev_insert` (FOR INSERT) ✅
- **No UPDATE policy** ✅
- **No DELETE policy** ✅

---

## 4. Payroll Tables

### FK Reuse Summary
| FK | Target |
|---|---|
| `employee_payroll_profiles.employee_id` | `employees.id` |
| `employee_payroll_profiles.payroll_group_id` | `hr_payroll_groups.id` (HR.1) |
| `employee_salary_components.component_type_id` | `hr_salary_component_types.id` (HR.1) |
| `employee_wps_profiles.bank_id` | `banks.id` (Finance Basics — existing global) |
| `employee_wps_profiles.mohre_establishment_id` | `hr_mohre_establishments.id` (HR.1) |
| All tables `created_by`/`updated_by`/`deleted_by` | `user_profiles.id` |

### No Duplicate Master Data Created
- No `hr_banks` table created ✅
- No `hr_payroll_runs` table created ✅
- No `hr_payslips` table created ✅
- No `hr_salary_payments` table created ✅
- No `hr_accounting_entries` table created ✅

---

## 5. Server Actions

**File:** `src/server/actions/hr/payroll.ts`

### Action Groups Implemented

| Group | Actions |
|---|---|
| Payroll Profile | `getEmployeePayrollProfile`, `createOrUpdateEmployeePayrollProfile`, `archiveEmployeePayrollProfile` |
| Salary Components | `listEmployeeSalaryComponents`, `createEmployeeSalaryComponent`, `updateEmployeeSalaryComponent`, `archiveEmployeeSalaryComponent`, `calculateEmployeeGrossSalary` |
| Salary Revisions | `listEmployeeSalaryRevisions`, `createEmployeeSalaryRevision` (append-only — no update/delete) |
| Payroll Holds | `listEmployeePayrollHolds`, `placeEmployeePayrollHold`, `releaseEmployeePayrollHold`, `archiveEmployeePayrollHold`, `getEmployeeActivePayrollHold` |
| WPS Profile | `getEmployeeWpsProfile`, `createOrUpdateEmployeeWpsProfile`, `getEmployeeWpsReadiness` |
| Global Queries | `listWpsReadiness`, `listGlobalSalaryProfiles`, `getEmployeePayrollSummary` |
| Combobox Helpers | `listHrSalaryComponentTypesForPayroll`, `listHrPayrollGroupsForPayroll`, `listHrMohreEstablishmentsForPayroll` |

### Auth/RBAC/Zod/Audit Compliance
- ✅ All mutations: `getAuthContext()` + `hasPermission('hr.payroll.manage')`
- ✅ All reads: `hasPermission('hr.payroll.view')`
- ✅ All mutations: `createAdminClient()` for writes
- ✅ All mutations: Zod validation with explicit schemas
- ✅ All mutations: `logAudit({ module_code: "HR", ... })`
- ✅ All mutations: `revalidatePath("/admin/hr/employees/record/[id]")`
- ✅ Raw IBAN/account_number NOT included in audit `new_values`

### Gross Salary Calculation
Implemented in `src/lib/hr/payroll/wps-readiness.ts`:
- Sums active earning components (is_active=true, deleted_at IS NULL)
- Uses `hr_salary_component_types.component_kind = 'earning'` to identify earning components
- Deductions excluded from gross
- Called server-side via `calculateEmployeeGrossSalary()` action

### WPS Readiness Logic
Deterministic checker in `src/lib/hr/payroll/wps-readiness.ts`:
- Returns: `ready | incomplete | on_hold | exempt | not_enrolled`
- Returns missing requirements list
- Checks: WPS applicable, WPS status, bank/IBAN, exchange house, labour card, salary components, gross > 0, active payroll hold

### Redaction/Masking Logic
Implemented in `src/lib/hr/payroll/redaction.ts`:
- `maskIban()`: Shows first 2 + last 4 chars
- `maskAccountNumber()`: Shows last 4 chars
- `maskMoney()`: Returns null for unauthorized users
- `redactWpsProfile()`: Always nulls raw IBAN/account, returns masked versions
- `redactSalaryComponent()`: Nulls amount + notes for unauthorized
- `redactSalaryRevision()`: Nulls old_gross + new_gross for unauthorized

---

## 6. UI Implementation

### Payroll & WPS Tab
**File:** `src/features/hr/employees/tabs/employee-payroll-tab.tsx`

5 sections:
1. **Salary Profile** — payroll group, effective date, currency, status, calculated gross salary (read-only display)
2. **Salary Components** — list with component type, amount, effective dates; Add/Edit/Archive with ERPChildDialogForm
3. **Salary Revision History** — append-only; Add revision only; no edit/delete; lock indicator shown
4. **WPS / Bank Details** — BankSelect for bank; IBAN/account always masked with EyeOff indicator; WPS readiness badge + missing requirements shown
5. **Payroll Holds** — Place/Release/Archive holds; active hold count shown in badge; hold history shown

If user lacks `hr.payroll.view`: Full lock screen shown with restriction message. Mutation buttons hidden for users without `hr.payroll.manage`.

### Global Payroll Hub
- `/admin/hr/payroll` — hub with cards for Salary Profiles and WPS Readiness
- `/admin/hr/payroll/salaries` — paginated employee salary table with payroll status filter
- `/admin/hr/payroll/wps` — paginated WPS readiness table with status + active hold filters

### Overview Summary Updates
`PayrollSummarySection` added to Employee Overview tab:
- Shows: Payroll Status, Gross Salary, WPS Status, WPS Readiness badge, Payroll Hold indicator
- If user lacks `hr.payroll.view`: Shows "Payroll information is restricted" with lock icon
- Salary amount shown as calculated gross in AED format

### Restricted User Behavior
- Payroll tab: Full restriction message with Lock icon if no `hr.payroll.view`
- Overview cards: "Payroll information is restricted" message
- Server-side: Unauthorized users return `null` salary/IBAN fields from all API calls

---

## 7. Sensitive Data Protection

### IBAN Masking
- `maskIban()`: `AE***...***XXXX` (first 2 + last 4)
- Raw IBAN **never** sent to client in normal flow
- `redactWpsProfile()` always nulls `iban` and returns `iban_masked`
- WPS edit form starts with empty IBAN field (raw never pre-filled in form)

### Account Number Masking
- `maskAccountNumber()`: `****XXXX` (last 4 chars)
- Raw account_number **never** sent to client in normal flow
- `redactWpsProfile()` always nulls `account_number` and returns `account_number_masked`

### Salary Amount Redaction
- `maskMoney(amount, canViewPayroll)`: Returns `null` for unauthorized
- `redactSalaryComponent()`: Nulls `amount` and `notes` for unauthorized
- `redactSalaryRevision()`: Nulls `old_gross` and `new_gross` for unauthorized
- UI displays `*** Restricted ***` when amount is `null`

### Draft Denylist / Draft Disable
- `employee-workspace-form.tsx` already has `DRAFT_DENYLIST` containing `"iban"`, `"account_number"`, `"salary"` — this prevents sensitive fields from being stored in localStorage draft
- Payroll tab does not use `useWorkspaceFormDraft` (no parent form state to draft for payroll records)
- Child form state is React `useState` only — never persisted to localStorage

### Audit Safety
- Raw IBAN/account_number NOT included in any `logAudit` `new_values`
- Raw salary amounts NOT in audit
- Salary revision audit only logs `effective_date` and `revision_reason` (not gross amounts)

---

## 8. Query Keys and Invalidation

### HR Payroll Query Keys Added (`queryKeys.hr.payroll`)
| Key | Factory |
|---|---|
| `profile` | `(employeeId) => ["hr","payroll","profile",employeeId]` |
| `salaryComponents` | `(employeeId) => ["hr","payroll","salary-components",employeeId]` |
| `salaryRevisions` | `(employeeId) => ["hr","payroll","salary-revisions",employeeId]` |
| `holds` | `(employeeId) => ["hr","payroll","holds",employeeId]` |
| `wpsProfile` | `(employeeId) => ["hr","payroll","wps-profile",employeeId]` |
| `wpsReadiness` | `(employeeId) => ["hr","payroll","wps-readiness",employeeId]` |
| `globalSalaryProfiles` | `(params?) => ["hr","payroll","global-salary-profiles",...]` |
| `globalWpsReadiness` | `(params?) => ["hr","payroll","global-wps-readiness",...]` |
| `summary` | `(employeeId) => ["hr","payroll","summary",employeeId]` |

### Invalidation Helpers Added
| Function | Invalidates |
|---|---|
| `invalidateHrEmployeePayroll` | All employee payroll keys |
| `invalidateHrEmployeeSalaryComponents` | Components + summary + wps-readiness + global |
| `invalidateHrEmployeeSalaryRevisions` | Revisions only |
| `invalidateHrEmployeePayrollHolds` | Holds + wps-readiness + summary |
| `invalidateHrEmployeeWps` | WPS profile + readiness + summary + global |
| `invalidateHrGlobalPayroll` | Global salary profiles |
| `invalidateHrGlobalWpsReadiness` | Global WPS readiness |

---

## 9. RLS Verification

Live SQL query result (`SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('employee_payroll_profiles','employee_salary_components','employee_salary_revisions','employee_payroll_holds','employee_wps_profiles')`):

| Table | relrowsecurity | relforcerowsecurity |
|---|---|---|
| employee_payroll_holds | true | true |
| employee_payroll_profiles | true | true |
| employee_salary_components | true | true |
| employee_salary_revisions | true | true |
| employee_wps_profiles | true | true |

All 5 HR.5 tables: RLS enabled AND forced. ✅

Policy count per table:
- `employee_payroll_profiles`: 4 policies (SELECT, INSERT, UPDATE, DELETE) ✅
- `employee_salary_components`: 4 policies (SELECT, INSERT, UPDATE, DELETE) ✅
- `employee_salary_revisions`: 2 policies (SELECT, INSERT only — **no UPDATE, no DELETE**) ✅
- `employee_payroll_holds`: 4 policies (SELECT, INSERT, UPDATE, DELETE) ✅
- `employee_wps_profiles`: 4 policies (SELECT, INSERT, UPDATE, DELETE) ✅

---

## 10. Testing

### TypeScript
```
npx tsc --noEmit
Exit code: 0 — No errors ✅
```

### Build
```
npm run build
Exit code: 0 — Build successful ✅
```
Build output confirmed routes:
- `ƒ /admin/hr/payroll`
- `ƒ /admin/hr/payroll/salaries`
- `ƒ /admin/hr/payroll/wps`
- `ƒ /admin/hr/settings/payroll-groups` (pre-existing HR.1)

### Manual Smoke Test Checklist
- [ ] Employee Profile → Payroll & WPS tab loads without error
- [ ] Without `hr.payroll.view`: Restriction message shown, no data visible
- [ ] With `hr.payroll.view`: Tab content visible
- [ ] Salary Profile: Setup Profile button → ERPChildDialogForm opens → Save works
- [ ] Salary Components: Add Component → dialog opens → gross salary recalculated
- [ ] Salary Revision: Record Revision → append-only; no edit/delete visible
- [ ] WPS / Bank Details: Setup WPS → BankSelect works; IBAN/account masked after save
- [ ] WPS Readiness badge shows correctly based on profile completeness
- [ ] Payroll Hold: Place Hold → hold shown; Release → hold marked released
- [ ] Overview tab shows Payroll Summary cards when authorized
- [ ] `/admin/hr/payroll` hub loads
- [ ] `/admin/hr/payroll/salaries` shows employee salary profiles
- [ ] `/admin/hr/payroll/wps` shows WPS readiness table

---

## 11. Scope Control

- ✅ No payroll run table created
- ✅ No payslip table created
- ✅ No salary payment history table created
- ✅ No accounting posting created
- ✅ No hr_banks table created (uses existing `banks`)
- ✅ Bank FK references existing `banks` table
- ✅ Payroll & WPS tab activated
- ✅ Overview payroll summary updated with permission restriction
- ✅ Global payroll routes created only within HR.5 scope
- ✅ Salary revisions append-only — no UPDATE/DELETE policies
- ✅ IBAN/account number masked in normal UI (always)
- ✅ Salary values hidden/redacted for unauthorized users
- ✅ Draft denylist already covers payroll sensitive fields in existing `DRAFT_DENYLIST`
- ✅ No assignments/readiness tables created
- ✅ No HR actions/recruitment/dashboard/search/report/AI implementation
- ✅ All new tables use BIGINT identity
- ✅ All new tables have RLS enabled and forced
- ✅ All 17 indexes created in same migration
- ✅ All mutations use getAuthContext + hasPermission + Zod + logAudit + revalidatePath
- ✅ ERPChildDialogForm used for all Payroll child forms
- ✅ No duplicate master data created
- ✅ tsc passes
- ✅ build passes
- ✅ Implementation report created
- ✅ SOT updated

---

## 12. Issues / Notes

### IBAN/Encryption Limitation
IBAN and account_number are stored as plain text in the database. No column-level encryption is applied. This is documented as a limitation — raw values are protected by:
1. RLS (only authorized users can SELECT from these tables)
2. Server-side redaction (raw values never sent to client in normal flow)
3. Audit safety (raw values never logged)

If encryption is required, this should be addressed in a future security hardening phase.

### WPS Export
A basic `exportWpsReadiness` server action was not implemented as the existing `src/lib/export/` infrastructure was not reviewed for payroll sensitivity. A future HR.5 follow-up can add WPS SIF export once the export pattern is confirmed safe.

### Draft Disable
The Payroll & WPS tab uses child dialog forms with `useState` only — no `useWorkspaceFormDraft` is used in the payroll child forms, so sensitive salary/IBAN/account fields are never stored in localStorage draft state.

---

## 13. Final Recommendation

**HR.5 is COMPLETE and READY for HR.6 prompt generation.**

Next recommended phase: **ERP HR.6 — Operations and Readiness**

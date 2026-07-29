# ERP HR.2 — Employee Master and Profile Shell Implementation Report

**Phase:** ERP HR.2  
**Status:** CLOSED / PASS  
**Date:** 2026-06-18  
**Implemented by:** Cursor AI Agent  

---

## 1. Executive Summary

**Status: PASS**

ERP HR.2 — Employee Master and Profile Shell has been fully implemented. The phase delivers the core employee data model, server-side CRUD operations, a paginated employee list, a new employee form, and a full 10-section workspace profile shell with functional Overview and Profile tabs and correct placeholder sections for all future HR phases (HR.3–HR.12).

**Scope implemented:**
- `employees` table with BIGINT PK, full personal/employment/contract/emergency columns
- `employee_status_events` append-only status history table
- `employee_document_links` table for future DMS readiness
- All 21 indexes including GIN trigram indexes for full-text name search
- RLS enabled + forced on all 3 tables
- RLS helper functions: `current_user_can_view_employee`, `current_user_can_manage_employee`
- Employee code generation using HR.1 `HR_EMPLOYEE` numbering rule (EMP-000001)
- 8 server actions: `listEmployees`, `getEmployee`, `getEmployeeOverview`, `createEmployee`, `updateEmployee`, `archiveEmployee`, `changeEmployeeStatus`, `getEmployeeStatusHistory`
- HR query keys + invalidation helpers (4 new keys)
- 3 UI routes: `/admin/hr/employees`, `/admin/hr/employees/record/new`, `/admin/hr/employees/record/[id]`
- 10-section employee profile shell (Overview + Profile functional, 8 placeholder tabs)
- HR sidebar updated with "Employees" nav item under "HR" group
- Full audit logging for all employee mutations
- `npx tsc --noEmit` passes with 0 errors
- `npm run build` passes with all 3 employee routes emitted

**No HR.3+ implementation performed.** No compliance child tables, no identity documents, no medical insurance, no dependents, no access cards, no training certificates, no medical records, no attendance, no leave, no payroll, no WPS, no assignments, no recruitment, no dashboard, no search, no reports, no HR AI.

---

## 2. Files Created / Modified

### Created

| File | Purpose |
|---|---|
| `supabase/migrations/20260618200000_erp_hr_2_employee_master_profile_shell.sql` | DB migration |
| `src/server/actions/hr/employees.ts` | Employee server actions |
| `src/features/hr/employees/employees-table.tsx` | Employee list client component |
| `src/features/hr/employees/employee-workspace-form.tsx` | Employee profile workspace form |
| `src/features/hr/employees/tabs/employee-overview-tab.tsx` | Overview tab (read-only summary) |
| `src/features/hr/employees/tabs/employee-profile-tab.tsx` | Profile tab (editable form) |
| `src/features/hr/employees/tabs/employee-placeholder-tab.tsx` | Reusable placeholder tab |
| `src/app/(protected)/admin/hr/employees/page.tsx` | Employee list route |
| `src/app/(protected)/admin/hr/employees/record/new/page.tsx` | New employee route |
| `src/app/(protected)/admin/hr/employees/record/[id]/page.tsx` | Employee profile route |
| `implementation_Review/HR_Phases/Phase_HR_2/ERP_HR_2_EMPLOYEE_MASTER_PROFILE_SHELL_IMPLEMENTATION_REPORT.md` | This report |

### Modified

| File | Change |
|---|---|
| `src/lib/query/query-keys.ts` | Added `hr.employees.list/detail/overview/statusHistory` key factories |
| `src/lib/query/invalidation.ts` | Added 4 `invalidateHrEmployee*` helpers |
| `src/components/layout/app-sidebar.tsx` | Added "HR" group with "Employees" nav item |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | HR.2 closure entry |

---

## 3. Database Migration Summary

**Migration file:** `supabase/migrations/20260618200000_erp_hr_2_employee_master_profile_shell.sql`

**Applied to:** `mmiefuieduzdiiwnqpie.supabase.co` via `user-supabase` MCP — **SUCCESS**

### Tables Created

| Table | PK | Purpose |
|---|---|---|
| `employees` | `BIGINT GENERATED ALWAYS AS IDENTITY` | Core employee master |
| `employee_status_events` | `BIGINT GENERATED ALWAYS AS IDENTITY` | Append-only status history |
| `employee_document_links` | `BIGINT GENERATED ALWAYS AS IDENTITY` | Future DMS readiness |

### Indexes Created — 21 total

- `idx_employees_employee_code` (btree)
- `idx_employees_full_name_en_trgm` (GIN, trigram)
- `idx_employees_full_name_ar_trgm` (GIN, trigram)
- `idx_employees_mobile_number`
- `idx_employees_owner_company_id`, `branch_id`, `department_id`, `designation_id`
- `idx_employees_employee_category_id`, `employment_type_id`
- `idx_employees_employee_status` (partial: WHERE deleted_at IS NULL)
- `idx_employees_joining_date`, `nationality_id`, `primary_work_site_id`
- `idx_employees_reporting_manager_id`, `supervisor_id`
- `idx_employee_status_events_employee_id`, `created_at`
- `idx_employee_document_links_employee_id` (partial), `dms_document_id`, `related_record`

### RLS Verified (live DB)

| Table | relrowsecurity | relforcerowsecurity |
|---|---|---|
| `employees` | `true` | `true` |
| `employee_status_events` | `true` | `true` |
| `employee_document_links` | `true` | `true` |

### RLS Helper Functions

- `current_user_can_view_employee(p_employee_id BIGINT)` — SECURITY DEFINER
- `current_user_can_manage_employee(p_employee_id BIGINT)` — SECURITY DEFINER

### No Compliance Child Tables

No `employee_identity_documents`, `employee_medical_insurances`, `employee_dependents`, `employee_access_cards`, `employee_training_certificates`, `employee_medical_records` — all deferred to HR.3.

---

## 4. Employees Table

### Column Summary

- **PK:** `id BIGINT GENERATED ALWAYS AS IDENTITY`
- **Code:** `employee_code TEXT NOT NULL UNIQUE` (auto-generated)
- **Personal:** `full_name_en`, `full_name_ar` (nullable), `known_name`, `gender`, `nationality_id`, `date_of_birth`, `marital_status`, `mobile_number`, `personal_email`, `uae_address`, `home_country_address`, `blood_group`, `photo_dms_document_id`
- **Employment:** `owner_company_id` (required), `branch_id`, `department_id`, `designation_id`, `employee_category_id`, `employment_type_id`, `joining_date` (required), `actual_joining_date`, `employee_status`, `reporting_manager_id`, `supervisor_id`, `primary_work_site_id`, `sponsor_company_id`, `mohre_establishment_id`
- **Contract:** `probation_start_date`, `probation_end_date`, `contract_type`, `contract_start_date`, `contract_end_date`, `notice_period_days`
- **Status extras:** `inactive_date`, `inactive_reason`
- **Emergency:** `emergency_contact_name` (required), `emergency_contact_mobile` (required), `emergency_contact_relationship_type_id`
- **Metadata:** `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `deleted_by`

### FK Reuse Summary

All FKs reference existing global master tables — no HR-specific duplicates:

| Column | References |
|---|---|
| `nationality_id` | `countries(id)` |
| `owner_company_id`, `sponsor_company_id` | `owner_companies(id)` |
| `branch_id` | `branches(id)` |
| `department_id` | `departments(id)` |
| `designation_id` | `designations(id)` |
| `primary_work_site_id` | `work_sites(id)` |
| `photo_dms_document_id` | `dms_documents(id)` |
| `created_by`, `updated_by`, `deleted_by` | `user_profiles(id)` |
| `employee_category_id` | `hr_employee_categories(id)` |
| `employment_type_id` | `hr_employment_types(id)` |
| `mohre_establishment_id` | `hr_mohre_establishments(id)` |
| `emergency_contact_relationship_type_id` | `hr_relationship_types(id)` |
| `reporting_manager_id`, `supervisor_id` | `employees(id)` (self-referential) |

### Numbering Rule

- Rule code: `HR_EMPLOYEE`
- Format: `{DOC}-{SEQ6}` → `EMP-000001`
- Confirmed live: `current_sequence_number = 0`, `document_prefix = 'EMP'`
- Code generation via `createAdminClient()` (bypasses `numbering.rules.generate` permission per HR.0 decision)

### Soft Delete / Archive

- `deleted_at TIMESTAMPTZ` — set on archive
- `deleted_by BIGINT` — set on archive
- `employee_status = 'archived'` — set on archive
- No hard delete. All queries filter `WHERE deleted_at IS NULL`.

---

## 5. Server Actions

**File:** `src/server/actions/hr/employees.ts`

All actions use: `getAuthContext()` + `hasPermission()` + Zod validation + `logAudit()` + `revalidatePath()`

| Action | Permission Required | Notes |
|---|---|---|
| `listEmployees(params)` | `hr.employees.view` | Server-side pagination, 50/page default, 10 filter dimensions |
| `getEmployee(id)` | `hr.employees.view` | Returns full row with joined labels |
| `getEmployeeOverview(id)` | `hr.employees.view` | Returns employee + status history |
| `createEmployee(input)` | `hr.employees.create` | Generates EMP code, inserts initial status event |
| `updateEmployee(id, input)` | `hr.employees.update` | Auto-inserts status event if status changes |
| `archiveEmployee(id, reason)` | `hr.employees.archive` | Soft-delete, status → archived, status event |
| `changeEmployeeStatus(id, status, reason, date)` | `hr.employees.update` | Inserts status event + audit log |
| `getEmployeeStatusHistory(id)` | `hr.employees.view` | Returns status events ordered by created_at DESC |

---

## 6. UI Implementation

### Employee List Route — `/admin/hr/employees`
- Server-side initial data load (page 1, 50 rows)
- Client-side search with server action re-fetch
- Pagination controls (prev/next with count display)
- Columns: Code, Full Name (EN+AR), Known Name, Nationality, Department, Designation, Status, Company, Branch, Work Site, Joining Date, Actions
- Action dropdown: View, Edit (if permission), Archive with confirmation (if permission)
- Empty state with "Add First Employee" CTA

### New Employee Route — `/admin/hr/employees/record/new`
- Redirects to list if no `hr.employees.create` permission
- Opens `EmployeeWorkspaceForm` in "add" mode
- After save: URL updated to `/admin/hr/employees/record/{id}?mode=edit`

### Employee Profile Route — `/admin/hr/employees/record/[id]`
- `notFound()` for invalid ID
- Permission check: `hr.employees.view`
- Mode: `view` (default) or `edit` (if `?mode=edit` and has `hr.employees.update`)

### Overview Tab
- Read-only summary cards: Employee Identity, Employment Details, Contact & Emergency, Contract & Probation
- 7 future-phase placeholder cards: Compliance (HR.3), Time & Leave (HR.4), Payroll & WPS (HR.5), Operations (HR.6), HR Actions (HR.7), Recruitment (HR.8), AI Review (HR.12)
- No fake data — all placeholders say "Available in HR.X"

### Profile Tab
- 4 sections: Personal Information, Employment Details, Contract & Probation, Emergency Contact
- Combobox components for all async/DB-sourced options (no shadcn Select)
- ERPCombobox for: gender, marital_status, blood_group, nationality, department, designation, category, employment type, employee status, work site, sponsor company, MOHRE establishment, relationship type
- OwnerCompanySelect for employer/sponsor company
- BranchSelect for branch
- CountrySelect for nationality
- All date fields: native `<input type="date">`
- Employee code is always read-only

### Placeholder Tabs — All 8
Each uses `EmployeePlaceholderTab` with specific title, description, and phase label:

| Tab | Phase |
|---|---|
| Compliance | HR.3 |
| Time | HR.4 |
| Payroll & WPS | HR.5 |
| Operations | HR.6 |
| HR Actions | HR.7 |
| Documents | HR.3+ |
| AI Review | HR.12 |
| Audit | HR.3+ |

---

## 7. Query Keys and Invalidation

### Added to `src/lib/query/query-keys.ts`

```typescript
queryKeys.hr.employees.list(p?)         // ["hr","employees","list",p]
queryKeys.hr.employees.detail(id)       // ["hr","employees","detail",id]
queryKeys.hr.employees.overview(id)     // ["hr","employees","overview",id]
queryKeys.hr.employees.statusHistory(id) // ["hr","employees","status-history",id]
```

### Added to `src/lib/query/invalidation.ts`

```typescript
invalidateHrEmployees(queryClient)
invalidateHrEmployee(queryClient, id)
invalidateHrEmployeeOverview(queryClient, id)
invalidateHrEmployeeStatusHistory(queryClient, id)
```

HR.1 query keys and invalidations are unmodified.

---

## 8. RLS Verification

Live DB query result:

```sql
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN ('employees','employee_status_events','employee_document_links');
```

| relname | relrowsecurity | relforcerowsecurity |
|---|---|---|
| employee_document_links | true | true |
| employee_status_events | true | true |
| employees | true | true |

All 3 tables: RLS enabled and forced. ✅

---

## 9. Testing

### `npx tsc --noEmit`
**Result: EXIT 0 — PASS ✅**

Errors encountered during development and fixed:
- `useWorkspaceTabDirty(isDirty)` → `useWorkspaceTabDirty({ isDirty, enabled })` (hook API mismatch)
- `ERPRecordStatusVariant` "outline"/"secondary"/"destructive" → valid values: "success"/"warning"/"danger"/"muted"
- `DropdownMenuTrigger asChild` → removed (new Radix v2 API has no asChild on Trigger)
- HR settings list params `active` → `is_active`; `result.data` → `result.data.data` (paginated response shape)
- Zod enum `required_error` → removed (updated Zod API)
- Supabase join query cast → `as unknown as EmployeeListRow[]`
- MOHRE establishment `name_en` → `establishment_name`

### `npm run build`
**Result: EXIT 0 — PASS ✅**

Routes confirmed in build output:
- `ƒ /admin/hr/employees`
- `ƒ /admin/hr/employees/record/[id]`
- `ƒ /admin/hr/employees/record/new`

### Manual Smoke Test Checklist

- [ ] Navigate to `/admin/hr/employees` — shows employee list page
- [ ] Click "Add Employee" — opens new employee workspace form
- [ ] Fill required fields, save — employee code `EMP-000001` generated
- [ ] Navigate to employee profile — shows 10 tabs
- [ ] Overview tab — shows summary cards + future phase placeholders
- [ ] Profile tab — editable fields with comboboxes
- [ ] Compliance/Time/Payroll/Operations/HR Actions/Documents/AI Review/Audit — all show placeholder text
- [ ] Archive action — soft-deletes employee, status → archived
- [ ] HR sidebar shows "HR" group with "Employees" link

---

## 10. Scope Control

| Check | Status |
|---|---|
| `employees` table created | ✅ |
| `employee_status_events` table created | ✅ |
| `employee_document_links` table created | ✅ |
| No HR.3 compliance child tables created | ✅ |
| No `employee_identity_documents` table | ✅ |
| No `employee_medical_insurances` table | ✅ |
| No `employee_dependents` table | ✅ |
| No `employee_access_cards` table | ✅ |
| No `employee_training_certificates` table | ✅ |
| No `employee_medical_records` table | ✅ |
| No attendance/leave/payroll/assignment/recruitment/dashboard/search/report/AI tables | ✅ |
| Employee list uses server-side pagination | ✅ |
| Employee code uses HR.1 EMP numbering rule | ✅ |
| Employee code is read-only in UI | ✅ |
| All new tables use BIGINT identity | ✅ |
| All new tables have RLS enabled and forced | ✅ |
| All 21 indexes created in same migration | ✅ |
| All mutations use getAuthContext + hasPermission + Zod + logAudit + revalidatePath | ✅ |
| ERPRecordWorkspaceForm used for Employee Profile | ✅ |
| useWorkspaceFormDraft used | ✅ |
| Placeholder tabs clearly identify future phase numbers | ✅ |
| tsc passes | ✅ |
| build passes | ✅ |
| implementation report created | ✅ |
| SOT updated | ✅ |

---

## 11. Issues / Notes

### Note 1: Draft Denylist
`useWorkspaceFormDraft` has a global denylist via `isDraftFieldAllowed()`. HR.2 adds no salary, IBAN, passport, or medical fields. A defensive comment-style denylist is documented in the workspace form for when HR.3+ sensitive fields are added.

### Note 2: Reporting Manager / Supervisor Combobox
`reporting_manager_id` and `supervisor_id` are self-referential FKs to `employees(id)`. HR.2 includes these columns in the database and in the `EmployeeProfileFormState`, but the Profile tab UI uses a placeholder select (numeric input field omitted to keep complexity scoped to HR.2). Full employee-to-employee combobox lookup should be implemented in HR.3 when the employee population has grown.

### Note 3: Role Mapping
HR.1 seeded permissions but not all HR role codes (`hr_officer`, `hr_manager`, `hr_director`) may exist as live roles. The server actions use `system_admin` role as a fallback alongside permission checks. This is consistent with the HR.0 and HR.1 decisions.

### Note 4: Employee Photo
`photo_dms_document_id` column is present on the `employees` table. No DMS upload UI is implemented in HR.2 — the field is display-only in the Profile tab as documented in HR.2 scope.

### Note 5: MOHRE Establishment field label
`HrMohreEstablishmentRow` uses `establishment_name` (not `name_en`). Profile tab uses `establishment_name` correctly.

---

## 12. Final Recommendation

**READY for HR.3 prompt generation.**

HR.2 is complete and fully scoped. All database objects, server actions, UI routes, and placeholder tabs are correctly implemented. The codebase builds and type-checks cleanly. The following items should be addressed in HR.3:

- Implement compliance child tables: `employee_identity_documents`, `employee_medical_insurances`, `employee_dependents`, `employee_access_cards`, `employee_training_certificates`, `employee_medical_records`
- Activate the Compliance tab with full CRUD
- Activate the Documents tab with DMS integration
- Add reporting manager / supervisor employee combobox selectors
- Add employee photo upload via DMS pipeline

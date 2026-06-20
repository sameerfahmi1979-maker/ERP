# ERP HR.3 — Compliance Inside Employee Profile
## Implementation Report

## Correction Note — 2026-06-18

After HR.3 closure, the next-phase wording was corrected to align with the approved HR roadmap. The next phase is HR.4 — Time Foundation. The approved HR.4 data model uses `employee_attendance_punches`, `employee_attendance_daily_summary`, `employee_attendance_corrections`, `employee_shift_assignments`, `employee_leave_requests`, `employee_leave_balances`, and `employee_overtime_records`. The incorrect names `employee_shifts`, `employee_leave_types`, and `employee_attendance_logs` must not be used. No implementation changes were made by this correction.

---

**Phase:** ERP HR.3  
**Status:** CLOSED / PASS ✅  
**Date:** 2026-06-18  
**Migration:** `20260618210000_erp_hr_3_compliance_inside_employee_profile.sql`

---

## Scope Delivered

HR.3 implemented the full Compliance sub-system inside the Employee Profile workspace. This includes 6 new database tables, RLS helper functions, DMS required document rules, server actions, query keys/invalidation, expiry utilities, a multi-section Compliance tab UI, activated Documents tab, and an updated Overview tab.

---

## Database — 6 New Tables

| Table | Columns | Key Constraints |
|---|---|---|
| `employee_identity_documents` | 28 | FK → `employees`, `hr_identity_document_types`, `countries`, `emirates`, `owner_companies`, `dms_documents`, `user_profiles` |
| `employee_medical_insurances` | 19 | FK → `employees`, `owner_companies`, `dms_documents`, `user_profiles` |
| `employee_dependents` | 20 | FK → `employees`, `hr_relationship_types`, `countries`, `dms_documents`, `user_profiles` |
| `employee_access_cards` | 17 | FK → `employees`, `hr_access_card_types`, `work_sites`, `dms_documents`, `user_profiles` |
| `employee_training_certificates` | 20 | FK → `employees`, `hr_training_categories`, `hr_training_types`, `dms_documents`, `user_profiles` |
| `employee_medical_records` | 20 | FK → `employees`, `hr_medical_record_types`, `dms_documents`, `user_profiles` |

All tables:
- `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
- `set_updated_at()` trigger
- `deleted_at TIMESTAMPTZ` soft-delete
- `created_by / updated_by / deleted_by` audit columns
- RLS ENABLED + FORCED
- Partial indexes on `(employee_id) WHERE deleted_at IS NULL`
- Expiry date indexes for compliance alerting

---

## RLS Helper Functions (SECURITY DEFINER)

| Function | Purpose |
|---|---|
| `current_user_can_view_employee_medical(p_employee_id)` | Allows `hr.medical.view` or `hr.medical.manage` permission holders + `system_admin/group_admin/hr_admin/hr_manager` roles |
| `current_user_can_manage_employee_medical(p_employee_id)` | Allows `hr.medical.manage` permission holders + `system_admin/group_admin/hr_admin` roles only |

---

## RLS Policies

- `employee_identity_documents` — SELECT gated by `current_user_can_view_employee + hr.compliance.view`; INSERT/UPDATE gated by `current_user_can_manage_employee + hr.compliance.manage`
- `employee_medical_insurances` — same as above
- `employee_dependents` — same as above
- `employee_access_cards` — same as above
- `employee_training_certificates` — same as above
- `employee_medical_records` — SELECT gated by `current_user_can_view_employee_medical`; INSERT/UPDATE gated by `current_user_can_manage_employee_medical` (strictly medical-restricted)

---

## Indexes (Enterprise-Scale)

19 indexes total:
- `idx_emp_id_docs_employee`, `idx_emp_id_docs_type`, `idx_emp_id_docs_expiry`, `idx_emp_id_docs_status`, `idx_emp_id_docs_docnum_gin` (GIN trigram)
- `idx_emp_ins_employee`, `idx_emp_ins_expiry`, `idx_emp_ins_status`
- `idx_emp_dep_employee`, `idx_emp_dep_active`
- `idx_emp_ac_employee`, `idx_emp_ac_expiry`, `idx_emp_ac_status`
- `idx_emp_tc_employee`, `idx_emp_tc_expiry`, `idx_emp_tc_status`
- `idx_emp_med_employee`, `idx_emp_med_exam_date`, `idx_emp_med_result`

---

## DMS Required Document Rules (Employee Entity)

5 rules seeded into `dms_required_document_rules` for `entity_type = 'employee'`:

| Rule Code | Document Type ID | Required | Expiry Required | Reminders |
|---|---|---|---|---|
| `EMP_EMIRATES_ID` | 10 | ✅ | ✅ | 90, 60, 30 days |
| `EMP_PASSPORT` | 9 | ✅ | ✅ | 90, 60, 30 days |
| `EMP_UAE_VISA` | 15 | ✅ | ✅ | 90, 60, 30 days |
| `EMP_MEDICAL_CERTIFICATE` | 39 | ✅ | ✅ | 30 days |
| `EMP_LABOUR_CONTRACT` | 13 | ✅ | ❌ | none |

---

## Permissions

4 permissions verified in live DB:

| Permission Code | Purpose |
|---|---|
| `hr.compliance.view` | View identity docs, medical insurance, dependents, access cards, training |
| `hr.compliance.manage` | CRUD on all non-medical compliance records |
| `hr.medical.view` | View employee medical fitness records |
| `hr.medical.manage` | CRUD on medical fitness records |

---

## Files Created / Modified

### New Files

| File | Purpose |
|---|---|
| `supabase/migrations/20260618210000_erp_hr_3_compliance_inside_employee_profile.sql` | Full DB migration (6 tables, RLS, indexes, seeds) |
| `src/lib/hr/compliance/expiry.ts` | Expiry status calculations, badge configs, compliance summary aggregator |
| `src/server/actions/hr/compliance.ts` | All compliance server actions (CRUD, verify, renewalStatus, summary) |
| `src/features/hr/employees/tabs/employee-compliance-tab.tsx` | 6-section compliance tab UI |

### Modified Files

| File | Change |
|---|---|
| `src/lib/dms/dms-entity-types.ts` | Added 7 new HR entity types: `EMPLOYEE_IDENTITY_DOCUMENT`, `EMPLOYEE_MEDICAL_INSURANCE`, `EMPLOYEE_DEPENDENT`, `EMPLOYEE_ACCESS_CARD`, `EMPLOYEE_TRAINING_CERTIFICATE`, `EMPLOYEE_MEDICAL_RECORD`, `EMPLOYEE_CONTRACT` |
| `src/lib/query/query-keys.ts` | Added `queryKeys.hr.compliance.*` keys (8 total) |
| `src/lib/query/invalidation.ts` | Added `invalidateHrEmployeeCompliance` and per-entity invalidation helpers |
| `src/features/hr/employees/employee-workspace-form.tsx` | Activated Compliance tab (EmployeeComplianceTab) + Documents tab (DmsEntityDocumentsTab); added `isChildDialogOpen` prop; inline `checkPermission` helper |
| `src/features/hr/employees/tabs/employee-overview-tab.tsx` | Added `ComplianceSummarySection` with `ComplianceMiniCard` grid showing real compliance counts |

---

## Server Actions — `src/server/actions/hr/compliance.ts`

### Per Compliance Entity (× 6)
- `list[Entity](employeeId, params)` — reads via `createClient()` (RLS-enforced)
- `create[Entity](employeeId, input)` — uses `createAdminClient()` + explicit `hasPermission` + Zod + `logAudit` + `revalidatePath`
- `update[Entity](id, input)` — same pattern
- `archive[Entity](id)` — soft-delete with audit log

### Special Actions
- `verifyEmployeeIdentityDocument(id)` — sets `verification_status='verified'`, `verified_by`, `verified_at`
- `verifyEmployeeTrainingCertificate(id)` — sets `verification_status='verified'`
- `verifyEmployeeMedicalInsurance(id)` — sets `verification_status='verified'` (no verified_by/at — not in schema)
- `updateEmployeeIdentityDocumentRenewal(id, status)` — renewal status lifecycle
- `updateEmployeeAccessCardRenewal(id, status)` — renewal status lifecycle
- `updateEmployeeTrainingCertificateRenewal(id, status)` — renewal status lifecycle
- `getEmployeeComplianceSummary(employeeId)` — aggregate counts across all 6 entity types + DMS documents

### Permission Gating
- Compliance actions: `hr.compliance.manage` (mutations), `hr.compliance.view` (reads via RLS)
- Medical record actions: `hr.medical.manage` (mutations), `hr.medical.view` (reads via RLS)
- Global admin (`hr.admin`) also grants compliance management

---

## Compliance Tab UI — `src/features/hr/employees/tabs/employee-compliance-tab.tsx`

6 sections, each with:
- Section header with record count badge and Add button (permission-gated)
- ERPDataTable-style rows with expiry/status badges
- Archive action per row
- Verify button for identity docs, training certificates, and insurance
- `ERPChildDialogForm` modal for Add/Edit (uses `onChildOpen` to block workspace tabs)

| Section | Entity | Special Fields |
|---|---|---|
| Legal Documents | `employee_identity_documents` | Document type, document number, issue/expiry dates, Emirates-specific fields (UID, MOHRE code, etc.) |
| Medical Insurance | `employee_medical_insurances` | Provider, TPA, policy number, network class, effective/expiry dates, coverage flags |
| Dependents | `employee_dependents` | Name EN/AR, relationship type, DOB, nationality, visa details, medical coverage |
| Access Cards & Passes | `employee_access_cards` | Access type, work site, card number, issue/expiry dates, status (including `in_application`) |
| Training & Certifications | `employee_training_certificates` | Training type/category, provider, certificate number, completion/expiry dates |
| Medical & Health Records | `employee_medical_records` | Medical record type, examination date, result (fit/unfit/conditionally_fit/under_review), work restrictions — RESTRICTED: requires `hr.medical.view` |

---

## Overview Tab Update

`src/features/hr/employees/tabs/employee-overview-tab.tsx` now shows a real **Compliance Overview** card grid (visible only with `hr.compliance.view` permission):
- Identity Docs: total / active / expiring / expired
- Medical Insurance: total / active / expiring / expired
- Dependents: total / active
- Access Cards: total / active / expiring / expired
- Training: total / valid / expiring / expired
- Medical Fitness: total / fit (shown only if medical records accessible)
- DMS Documents: total linked

The HR.3 placeholder card was removed from the overview. Remaining placeholders: HR.4 through HR.12.

---

## Documents Tab Activation

`DmsEntityDocumentsTab` is now rendered for `entityType="employee"` with `entityId={employee.id}`. Upload and link permissions gated by `hr.employees.update`.

---

## Bugs Fixed During Implementation

| Bug | Fix |
|---|---|
| `ctx.userId` used instead of `ctx.profile?.id` | Replaced all 25 occurrences in `compliance.ts` |
| `ZodError.errors` used instead of `ZodError.issues` | Replaced all occurrences |
| `metadata_json` passed to `logAudit` (not in `AuditLogParams`) | Removed all occurrences |
| `hasPermission` imported from server-only `check.ts` into client component | Inlined as `checkPermission` in `employee-workspace-form.tsx` |
| `verifyEmployeeMedicalInsurance/TrainingCertificate` setting non-existent `verified_by/verified_at` | Removed those columns from update payload |
| Incorrect HR settings API calls (`listHrSettings` → specific functions, wrong type names, `pageSize` → `page_size`) | Fixed all calls and types in `employee-compliance-tab.tsx` |
| Wrong import paths for `CountrySelect`, `EmirateSelect`, `OwnerCompanySelect` | Fixed to `@/components/erp/geography/...` and `@/components/erp/organizations/...` |

---

## TypeScript & Build

- `npx tsc --noEmit` — PASS (0 errors)
- `npm run build` — PASS (0 errors, 0 warnings)

---

## Next Phase

**ERP HR.4 — Time Foundation** (requires explicit Sameer/Dina approval)

Approved HR.4 scope:
- Create `employee_attendance_punches` for raw biometric/manual/import punches.
- Create `employee_attendance_daily_summary` for approved daily attendance, with `UNIQUE(employee_id, attendance_date)`.
- Create `employee_attendance_corrections` as append-only correction audit.
- Create `employee_shift_assignments` referencing existing global `work_calendars` and `work_shifts` (from COMMON MD.1 — do not duplicate).
- Create `employee_leave_requests` referencing existing HR.1 `hr_leave_types`.
- Create `employee_leave_balances` referencing existing HR.1 `hr_leave_types`.
- Create `employee_overtime_records`.
- Activate the Time tab inside Employee Profile workspace.
- Add global Attendance & Leave pages only within HR.4 scope.

**Do not create** `employee_leave_types` — `hr_leave_types` already exists from HR.1.  
**Do not create** `employee_shifts` — `work_shifts` already exists globally from COMMON MD.1.  
**Do not create** `employee_attendance_logs` — the approved model separates punches, daily summary, and corrections.

**Not in HR.4 scope:** payroll, WPS, assignments/readiness, HR actions, recruitment, dashboard, search, reports, HR AI (those belong to later phases HR.5–HR.13).

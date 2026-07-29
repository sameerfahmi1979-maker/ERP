# ERP HR.1 — HR Settings Foundation
## Implementation Report

## Correction Note — 2026-06-18

After HR.1 closure, the next-phase wording was corrected to align with the approved HR roadmap. The next phase is HR.2 — Employee Master and Profile Shell. Compliance child tables and compliance functional tabs belong to HR.3 — Compliance Inside Employee Profile, not HR.2. No implementation changes were made by this correction.

**Phase:** HR.1  
**Date:** 2026-06-18  
**Status:** CLOSED ✅  
**Build:** `npx tsc --noEmit` PASS · `npm run build` PASS  

---

## 1. Scope Summary

HR.1 establishes the full HR module settings foundation:
- 18 HR settings/configuration tables with RLS, indexes, triggers
- 31 HR permissions seeded across the full HR roadmap scope
- Role-permission mappings for 7 existing roles
- 2 RLS helper SQL functions
- Seed data for all 14 seeded lookup tables
- EMP numbering rule updated to `{DOC}-{SEQ6}`
- 10 HR notification templates
- HR server actions file (18 action groups)
- HR query keys and invalidation helpers
- HR settings UI (19 routes: hub + 18 sub-pages)
- HR Admin sidebar navigation entry

---

## 2. Database Migration

**File:** `supabase/migrations/20260618100000_erp_hr_1_settings_foundation.sql`

### Applied Sections

| Section | Description | Status |
|---------|-------------|--------|
| S1 | 31 HR permissions | ✅ Applied |
| S2 | Role mappings (7 roles) | ✅ Applied |
| S3 | RLS helper functions | ✅ Applied |
| S4 | 18 HR tables (DDL, indexes, RLS, triggers) | ✅ Applied |
| S5–S17 | Seed data for 14 lookup tables | ✅ Applied |
| S18 | Approval workflow seed | ✅ Applied |
| S19 | EMP numbering rule update | ✅ Applied |
| S20 | 10 HR notification templates | ✅ Applied |

### Tables Created (18)

| # | Table | Seed Records |
|---|-------|-------------|
| 1 | `hr_employee_categories` | 12 (DRIVER, OPERATOR, TECHNICIAN, SUPERVISOR, ADMIN, ENGINEER, LABORER, HSE, SECURITY, PRO, WORKSHOP, YARD) |
| 2 | `hr_employment_types` | 7 (FULL_TIME, PART_TIME, CONTRACT, SECONDMENT, TEMPORARY, PROBATION, CASUAL) |
| 3 | `hr_grades` | 13 (A1–A5, B1–B5, C1–C3) |
| 4 | `hr_identity_document_types` | 8 (Emirates ID, Passport, Residence Visa, Labour Card, Work Permit, Employment Contract, Health Card, Driving License) |
| 5 | `hr_access_card_types` | 8 (CICPA, ADNOC Plant, Client Site, Port, Offshore, Project Gate, Yard Access, Visitor Pass) |
| 6 | `hr_training_categories` | 9 (Safety, HSE, Operator, Driving, Environmental, Site Specific, Equipment, First Aid, Fire Safety) |
| 7 | `hr_training_types` | 25 (H2S, ADSD, WMS/PTW, ADNOC ATA, CICPA Induction, Offshore Safety, Rigger, Scaffolding, First Aid, Fire Watch, Confined Space, Forklift, Crane, Defensive Driving, Waste & Env, AGT, Hot Work, LOTO, Work at Height, Banksman, Signalman, Heavy Equipment, Excavator, Loader, Dozer) |
| 8 | `hr_medical_record_types` | 10 (Visa Medical, Pre-Employment, Periodic, Offshore, Driver, Sick Leave, Restriction, Return to Work, Incident, Fitness to Work) |
| 9 | `hr_leave_types` | 10 (Annual, Sick, Emergency, Maternity, Paternity, Unpaid, Hajj, Compassionate, Compensatory, Public Holiday) |
| 10 | `hr_relationship_types` | 10 (Spouse, Child, Father, Mother, Parent, Sibling, Brother, Sister, Friend, Other) |
| 11 | `hr_salary_component_types` | 8 (Basic, Housing, Transport, Food, Overtime, Other Allowance, Deduction, Bonus) |
| 12 | `hr_payroll_groups` | 2 (Monthly, Weekly) |
| 13 | `hr_mohre_establishments` | 0 (configured per-company by HR admin) |
| 14 | `hr_pro_process_types` | 11 (Visa Renewal, EID Renewal, Labour Card, Work Permit, Medical Fitness, Insurance, CICPA, Plant Card, Training Renewal, Visa Cancellation, Labour Cancellation) |
| 15 | `hr_readiness_rule_templates` | 0 (populated in HR.2+) |
| 16 | `hr_role_requirement_matrix` | 0 (populated in HR.2+) |
| 17 | `hr_site_requirement_matrix` | 0 (populated in HR.2+) |
| 18 | `hr_approval_workflows` | 1 (LEAVE_DEFAULT) |

### RLS

All 18 tables:
- `ENABLE ROW LEVEL SECURITY` ✅
- `FORCE ROW LEVEL SECURITY` ✅
- SELECT: `current_user_can_view_hr_settings()` ✅
- INSERT/UPDATE/DELETE: `current_user_can_manage_hr_settings()` ✅

### Permissions (31)

| Group | Permissions |
|-------|-------------|
| Employees | view, create, update, archive |
| Employee Profile | view, manage |
| Compliance | view, manage |
| Medical | view, manage |
| Payroll | view, manage |
| Attendance | view, manage |
| Leave | view, manage |
| Recruitment | view, manage |
| Assignments | view, manage |
| Actions | view, manage |
| EOS | view, manage |
| Dashboard | view |
| Search | use |
| Settings | view, manage |
| AI | review, apply_suggestion |
| Admin | hr.admin (full access) |

### Role Mappings

| Role | Permissions Granted |
|------|-------------------|
| `system_admin` | ALL 31 HR permissions |
| `group_admin` | ALL 31 HR permissions |
| `company_admin` | All except: medical.manage, payroll.manage, hr.admin |
| `hr_manager` | All except: hr.admin |
| `hse_manager` | employees.view, compliance.*, medical.*, attendance.view, dashboard.view, search.use, settings.view |
| `operations_manager` | employees.view, profile.view, compliance.view, attendance.*, leave.view, assignments.*, dashboard.view, search.use, settings.view |
| `finance_manager` | employees.view, payroll.*, eos.view, settings.view |

**Note:** `hr_officer`, `payroll_officer`, `pro_officer`, `supervisor` roles do not exist in the DB yet — they will be mapped when created in a future phase.

### Numbering Rule

| Rule Code | Old Format | New Format |
|-----------|-----------|-----------|
| `HR_EMPLOYEE` | `{DOC}-{SEQ4}` | `{DOC}-{SEQ6}` |

Example: `EMP-000001`

### Notification Templates (10)

| Code | Type |
|------|------|
| `HR_OFFER_LETTER` | hr_offer |
| `HR_INTERVIEW_INVITE` | hr_recruitment |
| `HR_JOINING_INSTRUCTIONS` | hr_onboarding |
| `HR_DOCUMENT_RENEWAL_REMINDER` | hr_expiry_reminder |
| `HR_LEAVE_DECISION` | hr_leave |
| `HR_SALARY_CERTIFICATE` | hr_document |
| `HR_EOS_CLEARANCE` | hr_eos |
| `HR_DOCUMENT_REQUEST` | hr_document |
| `HR_NOC_LETTER` | hr_document |
| `HR_WARNING_LETTER` | hr_action |

---

## 3. Server Actions

**File:** `src/server/actions/hr/settings.ts`

All 18 action groups implemented with:
- ✅ `getAuthContext()` + `hasPermission()` on every action
- ✅ `zod` schema validation
- ✅ `logAudit()` on all create/update/archive mutations
- ✅ `revalidatePath("/admin/hr/settings")`
- ✅ Soft-delete pattern via `deleted_at` + `deleted_by`
- ✅ Generic `toggleHrSettingsRowActive()` helper
- ✅ Generic `archiveHrSettingsRow()` helper

Functions exported:
- `listHrEmployeeCategories`, `createHrEmployeeCategory`, `updateHrEmployeeCategory`
- `listHrEmploymentTypes`, `createHrEmploymentType`, `updateHrEmploymentType`
- `listHrGrades`, `createHrGrade`, `updateHrGrade`
- `listHrIdentityDocumentTypes`, `createHrIdentityDocumentType`, `updateHrIdentityDocumentType`
- `listHrAccessCardTypes`, `createHrAccessCardType`, `updateHrAccessCardType`
- `listHrTrainingCategories`, `createHrTrainingCategory`, `updateHrTrainingCategory`
- `listHrTrainingTypes`, `createHrTrainingType`, `updateHrTrainingType`
- `listHrMedicalRecordTypes`, `createHrMedicalRecordType`, `updateHrMedicalRecordType`
- `listHrLeaveTypes`, `createHrLeaveType`, `updateHrLeaveType`
- `listHrRelationshipTypes`, `createHrRelationshipType`, `updateHrRelationshipType`
- `listHrSalaryComponentTypes`, `createHrSalaryComponentType`, `updateHrSalaryComponentType`
- `listHrPayrollGroups`, `createHrPayrollGroup`, `updateHrPayrollGroup`
- `listHrMohreEstablishments`, `createHrMohreEstablishment`, `updateHrMohreEstablishment`
- `listHrProProcessTypes`, `createHrProProcessType`, `updateHrProProcessType`
- `listHrReadinessRuleTemplates`, `createHrReadinessRuleTemplate`, `updateHrReadinessRuleTemplate`
- `listHrRoleRequirementMatrix`, `createHrRoleRequirementMatrix`
- `listHrSiteRequirementMatrix`, `createHrSiteRequirementMatrix`
- `listHrApprovalWorkflows`, `createHrApprovalWorkflow`, `updateHrApprovalWorkflow`
- `archiveHrSettingsRow` (generic)
- `toggleHrSettingsRowActive` (generic)

---

## 4. Query Keys & Invalidation

**Files:**
- `src/lib/query/query-keys.ts` — `queryKeys.hr.*` (18 key factories)
- `src/lib/query/invalidation.ts` — 19 invalidation helpers (`invalidateHrSettings`, `invalidateHrEmployeeCategories`, etc.)

---

## 5. UI Routes (19)

| Route | Component | Type |
|-------|-----------|------|
| `/admin/hr/settings` | Hub page with 18 category links | Server Component |
| `/admin/hr/settings/employee-categories` | Full CRUD list + dialog | Server + Client |
| `/admin/hr/settings/employment-types` | Full CRUD list + dialog | Server + Client |
| `/admin/hr/settings/grades` | Full CRUD list + dialog | Server + Client |
| `/admin/hr/settings/identity-document-types` | Full CRUD list + dialog | Server + Client |
| `/admin/hr/settings/access-card-types` | Full CRUD list + dialog | Server + Client |
| `/admin/hr/settings/training-categories` | Full CRUD list + dialog | Server + Client |
| `/admin/hr/settings/training-types` | Full CRUD list + dialog | Server + Client |
| `/admin/hr/settings/medical-record-types` | Full CRUD list + dialog | Server + Client |
| `/admin/hr/settings/leave-types` | Full CRUD list + dialog | Server + Client |
| `/admin/hr/settings/relationship-types` | Full CRUD list + dialog | Server + Client |
| `/admin/hr/settings/salary-component-types` | Full CRUD list + dialog | Server + Client |
| `/admin/hr/settings/payroll-groups` | Full CRUD list + dialog | Server + Client |
| `/admin/hr/settings/mohre-establishments` | Read-only list | Server Component |
| `/admin/hr/settings/pro-process-types` | Full CRUD list + dialog | Server + Client |
| `/admin/hr/settings/readiness-rule-templates` | Read-only list | Server Component |
| `/admin/hr/settings/role-requirement-matrix` | Read-only list | Server Component |
| `/admin/hr/settings/site-requirement-matrix` | Read-only list | Server Component |
| `/admin/hr/settings/approval-workflows` | Read-only grouped list | Server Component |

**Shared component:** `src/features/hr/settings/hr-settings-lookup-page.tsx`
- Reusable list + inline `ERPChildDialogForm` for simple lookup tables
- Uses `useTransition` for optimistic search
- Respects `canManage` prop for permission gating

---

## 6. Sidebar Navigation

**File:** `src/components/layout/app-sidebar.tsx`

Added **HR Admin** nav group:
```
HR Admin
  └── HR Settings → /admin/hr/settings
```

Removed "HR & Payroll" (comingSoon) from Operations group.

---

## 7. Files Created / Modified

### New Files
| File | Description |
|------|-------------|
| `supabase/migrations/20260618100000_erp_hr_1_settings_foundation.sql` | Full HR.1 migration |
| `src/server/actions/hr/settings.ts` | All 18 HR settings action groups |
| `src/features/hr/settings/hr-settings-lookup-page.tsx` | Reusable list+dialog component |
| `src/app/(protected)/admin/hr/settings/page.tsx` | HR Settings hub |
| `src/app/(protected)/admin/hr/settings/[18 sub-pages]/page.tsx` | All 18 settings sub-pages |
| `implementation_Review/HR_Phases/Phase_HR_1/ERP_HR_1_SETTINGS_FOUNDATION_IMPLEMENTATION_REPORT.md` | This report |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/query/query-keys.ts` | Added `queryKeys.hr.*` (18 key factories) |
| `src/lib/query/invalidation.ts` | Added 19 HR invalidation helpers |
| `src/components/layout/app-sidebar.tsx` | Added HR Admin nav group |

---

## 8. Architecture Compliance

| Rule | Status |
|------|--------|
| BIGINT PK on all HR tables | ✅ |
| No UUIDs | ✅ |
| RLS ENABLED + FORCED on all 18 tables | ✅ |
| `getAuthContext()` + `hasPermission()` in all actions | ✅ |
| Zod validation in all mutations | ✅ |
| `logAudit()` in all mutations | ✅ |
| `revalidatePath()` in all mutations | ✅ |
| No OpenAI imports / No HR AI in HR.1 | ✅ |
| No `employees` table created | ✅ |
| `user-supabase` MCP used (not plugin-supabase) | ✅ |
| `npx tsc --noEmit` passes | ✅ |
| `npm run build` passes | ✅ |

---

## 9. Known Decisions & Deferreds

1. **Missing HR roles** — `hr_officer`, `payroll_officer`, `pro_officer`, `supervisor` role codes do not exist in the DB. They will receive HR permissions when added (HR.2+ or a roles migration).

2. **Complex settings editors** — MOHRE Establishments, Readiness Rule Templates, Role/Site Matrix, and Approval Workflows render as read-only lists. Full CRUD editors for these will be implemented in HR.2+ when the full employee profile module provides the FK context (designations, work sites, etc.).

3. **Training type category FK in seed** — Training types are seeded using a subquery to resolve the training category ID dynamically, making the seed idempotent regardless of auto-incremented IDs.

4. **Approval workflow role** — The LEAVE_DEFAULT workflow seeds `approval_role_id` via a subquery matching `LIKE '%hr%manager%'` on the `approval_roles` table. If no match is found, it seeds NULL (unconfigured), which is safe.

---

## 10. Next Phase

**HR.2 — Employee Master and Profile Shell** (requires explicit Sameer/Dina approval):
- Create the core `employees` table only.
- Create `employee_status_events` append-only table.
- Create `employee_document_links` table for future DMS linking readiness only.
- Create Employee list route.
- Create New Employee form.
- Create Employee Profile shell route.
- Implement Overview tab with summary/placeholder cards.
- Implement Profile tab with core personal/employment fields.
- Add placeholder tabs for Compliance, Time, Payroll & WPS, Operations, HR Actions, Documents, AI Review, and Audit.
- Add HR sidebar entries only as approved for HR.2.
- Employee number generation must use the HR.1 EMP numbering rule.
- Do not create compliance child tables in HR.2.
- Do not implement identity documents, medical insurance, dependents, access cards, training certificates, or medical records in HR.2.
- Do not implement attendance, leave, payroll, assignments, recruitment, dashboard, search, reports, or HR AI in HR.2.

**HR.3 — Compliance Inside Employee Profile** (requires explicit Sameer/Dina approval):
- Compliance child tables start in HR.3, not HR.2.
- Identity documents, access cards, training certificates, and medical records are HR.3 scope.

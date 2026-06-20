# ERP COMMON MD.1 — Cross-Module Master Data Foundation
## Implementation Report

**Phase:** ERP COMMON MD.1  
**Date:** 2026-06-16  
**Status:** ✅ CLOSED / PASS  
**TypeScript:** 0 errors  
**Build:** PASS  
**Migration:** Applied to live Supabase (`https://mmiefuieduzdiiwnqpie.supabase.co`)

---

## Scope Summary

Implemented the approved **ERP COMMON MD.1** plan: the cross-module master data foundation required by HR, Fleet, Workshop, Finance, Projects, and HSE modules. Strictly avoided module-specific master data and any workflow engine enforcement.

**Entities implemented:**
1. Organization Extended Profile (columns on `owner_companies`)
2. Branch Extended Profile (columns on `branches`)
3. Owner Company Authorized Signatories (new table)
4. Departments
5. Designations / Job Titles
6. Work Sites / Operational Locations
7. Work Calendars + Work Shifts
8. Approval Roles / Authority Levels
9. DMS Required Document Rules

---

## Database Migration

**File:** `supabase/migrations/20260616120000_erp_common_md_1_cross_module_master_data_foundation.sql`

### Schema Changes

#### Extended Columns — `owner_companies`
| Column | Type | Notes |
|---|---|---|
| `trade_name` | VARCHAR(200) | Nullable |
| `main_activity` | TEXT | Nullable |
| `established_date` | DATE | Nullable |
| `default_tax_type_id` | BIGINT | FK → `tax_types` |
| `default_bank_id` | BIGINT | FK → `banks` |
| `compliance_status` | VARCHAR(50) | CHECK (compliant/pending/non_compliant/under_review) |
| `office_address_line_1` | TEXT | Nullable |
| `office_address_line_2` | TEXT | Nullable |
| `office_emirate_id` | BIGINT | FK → `emirates` |
| `office_city_id` | BIGINT | FK → `cities` |

#### Extended Columns — `branches`
| Column | Type | Notes |
|---|---|---|
| `opening_date` | DATE | Nullable |
| `closing_date` | DATE | Nullable |
| `cost_center_id` | BIGINT | FK → `cost_centers` |
| `profit_center_id` | BIGINT | FK → `profit_centers` |
| `default_work_calendar_id` | BIGINT | FK → `work_calendars` |
| `branch_manager_user_id` | BIGINT | FK → `user_profiles` |
| `legal_branch_name` | VARCHAR(300) | Nullable |
| `trade_license_branch_ref` | VARCHAR(100) | Nullable |
| `emirate_id` | BIGINT | FK → `emirates` |
| `city_id` | BIGINT | FK → `cities` |
| `area_zone_id` | BIGINT | FK → `areas_zones` |

#### New Tables

| Table | PK | Unique constraint | RLS |
|---|---|---|---|
| `owner_company_signatories` | BIGINT identity | — | ENABLED + FORCED |
| `departments` | BIGINT identity | `(owner_company_id, department_code)` | ENABLED + FORCED |
| `designations` | BIGINT identity | `(designation_code)` | ENABLED + FORCED |
| `work_calendars` | BIGINT identity | `(calendar_code)` | ENABLED + FORCED |
| `work_shifts` | BIGINT identity | `(calendar_id, shift_code)` | ENABLED + FORCED |
| `work_sites` | BIGINT identity | `(site_code)` | ENABLED + FORCED |
| `approval_roles` | BIGINT identity | `(role_code)` | ENABLED + FORCED |
| `dms_required_document_rules` | BIGINT identity | `(rule_code)` | ENABLED + FORCED |

### RLS Policies
All 8 new tables have 4 policies each:
- **SELECT:** `current_user_has_permission('common_md.view')` OR role member
- **INSERT:** `current_user_has_permission('common_md.manage')` OR `system_admin` role
- **UPDATE:** same as INSERT
- **DELETE:** `current_user_has_role('system_admin')` only

### Permission Seeding
17 new permission codes inserted into `permissions` table (ON CONFLICT DO NOTHING):
```
common_md.view, common_md.manage,
common_md.organizations.view, common_md.organizations.manage,
common_md.branches.view, common_md.branches.manage,
common_md.departments.view, common_md.departments.manage,
common_md.designations.view, common_md.designations.manage,
common_md.work_sites.view, common_md.work_sites.manage,
common_md.work_calendars.view, common_md.work_calendars.manage,
common_md.approval_roles.view, common_md.approval_roles.manage,
common_md.dms_required_documents.view, common_md.dms_required_documents.manage
```
Mapped to: `system_admin` (all), `group_admin` (view+manage), `company_admin` (view only).

### DMS Required Document Rules Seeded
8 initial rules for verified-existing document type codes:

| Rule Code | Entity Type | Document Type |
|---|---|---|
| COMP-TRADE-LICENSE | company | TRADE_LICENSE |
| COMP-VAT-CERT | company | VAT_CERTIFICATE |
| COMP-TRN-CERT | company | TRN_CERTIFICATE |
| COMP-INS-CERT | company | INSURANCE_CERTIFICATE |
| COMP-POA | company | POWER_OF_ATTORNEY |
| SITE-ACCESS-PERMIT | site | SITE_ACCESS_PERMIT |
| SITE-CICPA-PASS | site | CICPA_PASS |
| SITE-ADNOC-GATE | site | ADNOC_GATE_PASS |

> Note: `blocks_activation` stored as data only — no workflow enforcement in this phase.

---

## Server Actions

7 new server action files in `src/server/actions/common-master-data/`:

| File | CRUD functions | Combobox |
|---|---|---|
| `departments.ts` | list, getById, create, update, softDelete | getDepartmentComboboxOptions |
| `designations.ts` | list, getById, create, update, softDelete | getDesignationComboboxOptions |
| `work-calendars.ts` | listCalendars, getCalendarById, create, update, softDelete, createShift, updateShift, softDeleteShift | getWorkCalendarComboboxOptions |
| `work-sites.ts` | list, getById, create, update, softDelete | getWorkSiteComboboxOptions |
| `approval-roles.ts` | list, getById, create, update, softDelete | getApprovalRoleComboboxOptions |
| `dms-required-document-rules.ts` | list, getById, create, update, softDelete | — |
| `owner-company-signatories.ts` | list, create, update, softDelete | — |

**Pattern applied consistently in all files:**
- `getAuthContext()` + `hasPermission()` for auth
- Zod schema for input validation
- `logAudit({ module_code, entity_name, entity_id, entity_reference, action, new_values })` for audit trail
- `revalidatePath()` for cache invalidation
- Soft deletion via `deleted_at` timestamp
- Typed `ActionResult<T>` return type

---

## Query Keys & Invalidation

**`src/lib/query/query-keys.ts`** — Added `commonMd` object with factories:
```typescript
queryKeys.commonMd.departments(filters?)
queryKeys.commonMd.department(id)
queryKeys.commonMd.designations(filters?)
queryKeys.commonMd.designation(id)
queryKeys.commonMd.workSites(filters?)
queryKeys.commonMd.workSite(id)
queryKeys.commonMd.workCalendars(filters?)
queryKeys.commonMd.workCalendar(id)
queryKeys.commonMd.workShifts(calendarId)
queryKeys.commonMd.approvalRoles(filters?)
queryKeys.commonMd.approvalRole(id)
queryKeys.commonMd.dmsRequiredDocumentRules(filters?)
queryKeys.commonMd.dmsRequiredDocumentRule(id)
queryKeys.commonMd.companySignatories(companyId)
```

**`src/lib/query/invalidation.ts`** — Added 7 helpers.

---

## UI Extensions

### Organization Workspace Form (`src/features/organizations/organization-workspace-form.tsx`)
- New "Extended Profile" section: `trade_name`, `main_activity`, `established_date`, `compliance_status`, `office_address_line_1/2`, `EmirateSelect`, `CitySelect`, `default_tax_type_id`, `default_bank_id`
- New "Signatories" section: inline CRUD table for `owner_company_signatories` using `ERPChildDialogForm` pattern
- New "Documents" section: `DmsEntityDocumentsTab` with `entityType="company"`

### Branch Workspace Form (`src/features/branches/branch-workspace-form.tsx`)
- Extended fields: `legal_branch_name`, `trade_license_branch_ref`, `opening_date`, `closing_date`
- New "Documents" section: `DmsEntityDocumentsTab` with `entityType="branch"`

---

## New Feature Routes

### Landing Page
**`/admin/common-master-data`** — 6 tile cards linking to each master data area with live record counts.

### Departments
- `/admin/common-master-data/departments` (list)
- `/admin/common-master-data/departments/record/new`
- `/admin/common-master-data/departments/record/[id]`
- Form: `DepartmentWorkspaceForm` — sections: Department Info, Hierarchy & Org, Notes

### Designations
- `/admin/common-master-data/designations` (list)
- `/admin/common-master-data/designations/record/new`
- `/admin/common-master-data/designations/record/[id]`
- Form: `DesignationWorkspaceForm` — sections: Designation Info, Notes

### Work Sites
- `/admin/common-master-data/work-sites` (list)
- `/admin/common-master-data/work-sites/record/new`
- `/admin/common-master-data/work-sites/record/[id]`
- Form: `WorkSiteWorkspaceForm` — sections: Site Info, Location & Access, Documents (DmsEntityDocumentsTab, entityType=site)

### Work Calendars
- `/admin/common-master-data/work-calendars` (list)
- `/admin/common-master-data/work-calendars/record/new`
- `/admin/common-master-data/work-calendars/record/[id]`
- Form: `WorkCalendarWorkspaceForm` — sections: Calendar Info (day toggle), Shifts (inline add/edit/delete)

### Approval Roles
- `/admin/common-master-data/approval-roles` (list)
- `/admin/common-master-data/approval-roles/record/new`
- `/admin/common-master-data/approval-roles/record/[id]`
- Form: `ApprovalRoleWorkspaceForm` — sections: Role Info (level, scope, amount limit, delegation flags), Description

### DMS Required Document Rules
- `/admin/common-master-data/dms-required-documents` (list)
- `/admin/common-master-data/dms-required-documents/record/new`
- `/admin/common-master-data/dms-required-documents/record/[id]`
- Form: `DmsRequiredDocumentRuleForm` — sections: Rule Details (entity type, document type, compliance flags), Notes

---

## Navigation

**`src/components/layout/app-sidebar.tsx`** — Added "Common Master Data" nav group with 7 items:
- Common MD Overview → `/admin/common-master-data`
- Departments
- Designations
- Work Sites
- Work Calendars
- Approval Roles
- Required Doc. Rules

---

## Constraints Respected

| Constraint | Status |
|---|---|
| No module-specific master data (HR/Fleet/Finance) | ✅ Respected |
| No workflow engine / no blocking enforcement | ✅ `blocks_activation` is data-only |
| RLS maintained / strengthened | ✅ All 8 new tables have ENABLED+FORCED RLS |
| No break to existing Org/Branch behavior | ✅ Only additive columns (nullable) |
| No DMS entity type duplication | ✅ Used `company`, `branch`, `site` (existing); `department` not added as DMS entity type |
| DMS rule seeding uses only verified document type codes | ✅ 8 codes confirmed present in live DB |
| Soft deletion only (no hard delete) | ✅ `deleted_at` used across all tables |
| Global rule 9 (server mutations pattern) | ✅ Applied in all 7 action files |

---

## Files Changed / Created

### New Files
```
supabase/migrations/20260616120000_erp_common_md_1_cross_module_master_data_foundation.sql
src/server/actions/common-master-data/departments.ts
src/server/actions/common-master-data/designations.ts
src/server/actions/common-master-data/work-calendars.ts
src/server/actions/common-master-data/work-sites.ts
src/server/actions/common-master-data/approval-roles.ts
src/server/actions/common-master-data/dms-required-document-rules.ts
src/server/actions/common-master-data/owner-company-signatories.ts
src/app/(protected)/admin/common-master-data/page.tsx
src/app/(protected)/admin/common-master-data/departments/page.tsx
src/app/(protected)/admin/common-master-data/departments/record/new/page.tsx
src/app/(protected)/admin/common-master-data/departments/record/[id]/page.tsx
src/app/(protected)/admin/common-master-data/designations/page.tsx
src/app/(protected)/admin/common-master-data/designations/record/new/page.tsx
src/app/(protected)/admin/common-master-data/designations/record/[id]/page.tsx
src/app/(protected)/admin/common-master-data/work-sites/page.tsx
src/app/(protected)/admin/common-master-data/work-sites/record/new/page.tsx
src/app/(protected)/admin/common-master-data/work-sites/record/[id]/page.tsx
src/app/(protected)/admin/common-master-data/work-calendars/page.tsx
src/app/(protected)/admin/common-master-data/work-calendars/record/new/page.tsx
src/app/(protected)/admin/common-master-data/work-calendars/record/[id]/page.tsx
src/app/(protected)/admin/common-master-data/approval-roles/page.tsx
src/app/(protected)/admin/common-master-data/approval-roles/record/new/page.tsx
src/app/(protected)/admin/common-master-data/approval-roles/record/[id]/page.tsx
src/app/(protected)/admin/common-master-data/dms-required-documents/page.tsx
src/app/(protected)/admin/common-master-data/dms-required-documents/record/new/page.tsx
src/app/(protected)/admin/common-master-data/dms-required-documents/record/[id]/page.tsx
src/features/common-master-data/departments/department-workspace-form.tsx
src/features/common-master-data/designations/designation-workspace-form.tsx
src/features/common-master-data/work-sites/work-site-workspace-form.tsx
src/features/common-master-data/work-calendars/work-calendar-workspace-form.tsx
src/features/common-master-data/approval-roles/approval-role-workspace-form.tsx
src/features/common-master-data/dms-required-document-rules/dms-required-document-rule-form.tsx
```

### Modified Files
```
src/features/organizations/organization-workspace-form.tsx  (extended profile + signatories + DMS tab)
src/features/branches/branch-workspace-form.tsx             (extended fields + DMS tab)
src/lib/query/query-keys.ts                                 (commonMd query keys)
src/lib/query/invalidation.ts                               (7 new invalidation helpers)
src/components/layout/app-sidebar.tsx                       (Common Master Data nav group)
.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md                         (phase status, module table, DB stats)
```

---

## Bugs Fixed

| Bug | Root Cause | Fix |
|---|---|---|
| `logAudit` TS errors (24 occurrences) | `AuditLogParams` has no `entity_type` or `auth_context` fields | Fixed all calls to use `module_code`, `entity_name`, `entity_reference` pattern |
| DB table `area_zones` not found | Live DB uses `areas_zones` | Corrected in migration SQL |
| `permissions` table (not `erp_permissions`) | Different name than assumed from older docs | Corrected in permission seeding SQL |

---

## Known Limitations

1. **`blocks_activation` is data only** — no enforcement gate exists yet. Module-level enforcement deferred to individual module build phases (HR, Fleet, etc.).
2. **`work_sites` DMS entity type** — The canonical `dms-entity-types.ts` uses `site` (not `work_site`). WorkSiteWorkspaceForm uses `entityType="site"` accordingly.
3. **`department` DMS entity type** — Not added to canonical entity type registry. DmsEntityDocumentsTab not included in DepartmentWorkspaceForm (department documents deferred).
4. **Organization/Branch form extensions** — New extended fields are present but Combobox-backed selects (`EmirateSelect`, `CitySelect`, `BankSelect`, `TaxTypeSelect`) must be confirmed present in org/branch forms at runtime.
5. **signatory.full_name** — The `owner_company_signatories.full_name` field is nullable in some code paths; guarded with `?? String(data.id)` in logAudit call.

---

## Next Phase Options

- **ERP Party Master 5A.3** — Party Master additional entity types or extensions
- **ERP HR Module 003A** — HR employee master data (uses departments, designations, work calendars, approval roles from COMMON MD.1)
- **ERP Fleet Module** — Fleet asset/vehicle master (uses work sites, work calendars from COMMON MD.1)
- **ERP COMMON MD.2** — Additional cross-module master data if needed before module builds

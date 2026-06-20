# ERP HR.6 — Operations and Readiness Implementation Report

**Phase:** ERP HR.6 — Operations and Readiness  
**Status:** CLOSED / PASS  
**Date:** 2026-06-19  
**Implemented by:** Cursor AI Agent

---

## Executive Summary

HR.6 implements employee operational records inside the Employee Profile, adds global Operations
pages for assignments, readiness, and blocks, and activates the Operations tab. All 7 new tables
were created in a single migration, RLS was enabled and forced on all tables, and deterministic
readiness logic was implemented without AI. TypeScript and build both pass clean.

---

## Files Created

| File | Type | Description |
|---|---|---|
| `supabase/migrations/20260619070000_erp_hr_6_operations_and_readiness.sql` | Migration | 7 tables, 31 indexes, 2 RLS helpers, 28 RLS policies |
| `src/lib/hr/operations/readiness.ts` | Utility | Deterministic employee readiness calculation |
| `src/lib/hr/operations/status.ts` | Utility | Block/assignment/readiness status badge helpers |
| `src/server/actions/hr/operations.ts` | Server Actions | Full CRUD for all 7 HR.6 entity groups + summaries |
| `src/features/hr/employees/tabs/employee-operations-tab.tsx` | UI | Operations tab with 7 sections |
| `src/features/hr/operations/assignments/hr-assignments-page-client.tsx` | UI | Global assignments page client |
| `src/features/hr/operations/readiness/hr-readiness-page-client.tsx` | UI | Global readiness monitor page client |
| `src/features/hr/operations/blocks/hr-blocks-page-client.tsx` | UI | Global operational blocks page client |
| `src/app/(protected)/admin/hr/operations/page.tsx` | Route | HR Operations hub page |
| `src/app/(protected)/admin/hr/operations/assignments/page.tsx` | Route | Assignments global page |
| `src/app/(protected)/admin/hr/operations/readiness/page.tsx` | Route | Readiness monitor global page |
| `src/app/(protected)/admin/hr/operations/blocks/page.tsx` | Route | Operational blocks global page |

## Files Modified

| File | Change |
|---|---|
| `src/lib/query/query-keys.ts` | Added `queryKeys.hr.operations` sub-object with 12 query keys |
| `src/lib/query/invalidation.ts` | Added 10 invalidation helpers for HR operations |
| `src/features/hr/employees/employee-workspace-form.tsx` | Activated `EmployeeOperationsTab`, passed `canViewOperations` |
| `src/features/hr/employees/tabs/employee-overview-tab.tsx` | Added `OperationsSummarySection` with 6 mini-cards |
| `src/components/layout/app-sidebar.tsx` | Added "HR Operations" nav group with Assignments, Readiness, Blocks |

---

## Database Migration Summary

**Migration file:** `20260619070000_erp_hr_6_operations_and_readiness.sql`

### Tables Created

| Table | Purpose | PK | RLS | RLS Forced |
|---|---|---|---|---|
| `employee_assignments` | Operational assignment history | BIGINT IDENTITY | ✓ | ✓ |
| `employee_role_requirements` | Per-employee role requirement status | BIGINT IDENTITY | ✓ | ✓ |
| `employee_site_readiness` | Site-specific readiness snapshot | BIGINT IDENTITY | ✓ | ✓ |
| `employee_operational_blocks` | Blocks preventing site assignment | BIGINT IDENTITY | ✓ | ✓ |
| `employee_assets` | HR-level asset issuance records | BIGINT IDENTITY | ✓ | ✓ |
| `employee_ppe_issues` | PPE issued to employees | BIGINT IDENTITY | ✓ | ✓ |
| `employee_accommodation_records` | Accommodation assignment records | BIGINT IDENTITY | ✓ | ✓ |

### Indexes Created: 31 total

- `employee_assignments`: 7 indexes (employee, site, department, designation, status, effective dates, active partial)
- `employee_role_requirements`: 5 indexes (employee, designation, status, type, expiry)
- `employee_site_readiness`: 4 indexes (employee, site, status, checked_at)
- `employee_operational_blocks`: 5 indexes (employee, status, type, effective, active partial)
- `employee_assets`: 4 indexes (employee, type, status, issued partial)
- `employee_ppe_issues`: 4 indexes (employee, status, expiry, active partial)
- `employee_accommodation_records`: 3 indexes (employee, status, date range)

### RLS Helper Functions Created

```sql
current_user_can_view_employee_operations(p_employee_id BIGINT)
current_user_can_manage_employee_operations(p_employee_id BIGINT)
```

Both use existing HR.2 helpers (`current_user_can_view_employee`, `current_user_can_manage_employee`)
plus `hr.assignments.view` and `hr.assignments.manage` permission checks.

### RLS Policies: 28 total (4 per table × 7 tables)

Each table has: SELECT, INSERT, UPDATE, DELETE policies using the HR.6 helper functions above.

---

## Server Actions

**File:** `src/server/actions/hr/operations.ts`

All actions use: `getAuthContext()` → `hasPermission()` → Zod validation → `createAdminClient()` → `logAudit()` → `revalidatePath()`

### Assignment Actions (6)
- `listEmployeeAssignments`, `listGlobalEmployeeAssignments`
- `createEmployeeAssignment`, `updateEmployeeAssignment`, `archiveEmployeeAssignment`
- `getCurrentEmployeeAssignment`

### Role Requirement Actions (6)
- `listEmployeeRoleRequirements`
- `createEmployeeRoleRequirement`, `updateEmployeeRoleRequirement`, `archiveEmployeeRoleRequirement`
- `waiveEmployeeRoleRequirement`, `recalculateEmployeeRoleRequirements`

### Site Readiness Actions (5)
- `listEmployeeSiteReadiness`, `listGlobalSiteReadiness`
- `recalculateEmployeeSiteReadiness`, `recalculateAllEmployeeSiteReadiness`
- `updateEmployeeSiteReadinessNotes`

### Operational Block Actions (6)
- `listEmployeeOperationalBlocks`, `listGlobalOperationalBlocks`
- `createEmployeeOperationalBlock`, `releaseEmployeeOperationalBlock`, `archiveEmployeeOperationalBlock`
- `getEmployeeActiveOperationalBlocks`

### Asset Actions (5)
- `listEmployeeAssets`
- `createEmployeeAsset`, `updateEmployeeAsset`, `returnEmployeeAsset`, `archiveEmployeeAsset`

### PPE Actions (5)
- `listEmployeePpeIssues`
- `createEmployeePpeIssue`, `updateEmployeePpeIssue`, `returnEmployeePpeIssue`, `archiveEmployeePpeIssue`

### Accommodation Actions (5)
- `listEmployeeAccommodationRecords`
- `createEmployeeAccommodationRecord`, `updateEmployeeAccommodationRecord`
- `endEmployeeAccommodationRecord`, `archiveEmployeeAccommodationRecord`

### Summary Actions (2)
- `getEmployeeOperationsSummary` — 6 parallel queries for overview cards
- `getEmployeeReadinessSummary` — consolidated readiness status

---

## UI Implementation

### Operations Tab (7 sections)

**File:** `src/features/hr/employees/tabs/employee-operations-tab.tsx`

| Section | Features |
|---|---|
| Assignments | List, Add, Edit, Archive. Shows type/status/dates/department/designation/site |
| Site Readiness | List all site readiness records. Recalculate button triggers deterministic check |
| Role Requirements | List, Add, Edit, Archive, Waive (with audit). Recalculate all button |
| Operational Blocks | List, Add Block, Release (with reason). Blocked employees shown with destructive badge |
| Assets | List, Issue, Edit, Return, Archive |
| PPE | List, Issue, Edit, Return, Archive |
| Accommodation | List, Assign, Edit, End (with end date), Archive |

All forms use `ERPChildDialogForm`. All data uses `ERPCombobox` (never shadcn Select).
Permission gates: `hr.assignments.view` for read, `hr.assignments.manage` for mutations.

### Employee Overview Tab Updates

6 new mini-cards under "Operations & Readiness":
- Current Assignment (department/designation/site or "—")
- Readiness Status (badge from most recent site readiness record)
- Active Blocks (count, red if >0)
- Assets Issued (count)
- PPE Issued (count)
- Accommodation (location or "No accommodation record")

### Global Operations Pages

| Route | Description |
|---|---|
| `/admin/hr/operations` | Hub page with 3 cards linking to sub-pages |
| `/admin/hr/operations/assignments` | Global list with status filter, search, pagination |
| `/admin/hr/operations/readiness` | Global readiness monitor with status filter and search |
| `/admin/hr/operations/blocks` | Global blocks list with status filter, links to employee profiles |

All pages are server-side permission-gated. Client components handle pagination (50/page).

---

## Readiness Logic

**File:** `src/lib/hr/operations/readiness.ts`

Deterministic only. No AI.

### Priority Order
1. **blocked** — if any active operational blocks exist → always blocked
2. **expired** — if any critical cert/doc/training is past expiry date
3. **not_ready** — if missing critical required data (identity doc, required access card, critical role reqs)
4. **needs_review** — if warnings only (medical missing/restricted, non-critical training)
5. **ready** — all checks pass, no missing requirements

### `recalculateEmployeeSiteReadiness` Data Inputs
- Active operational blocks
- Identity documents (expired check)
- Access cards (site-specific, expired check)
- Medical records (expired check)
- Medical insurance (expired check)
- Training certificates (expired check)
- Role requirements (critical missing/expired count)

### `MissingRequirement` Object
```typescript
{
  code: string;
  label: string;
  category: "document" | "training" | "medical" | "access_card" | "block" | "assignment" | "other";
  severity: "info" | "warning" | "critical";
  relatedRecordType?: string;
  relatedRecordId?: number;
}
```

No raw medical notes, payroll details, or sensitive text in readiness output.

---

## Query Keys and Invalidation

### Query Keys Added (`queryKeys.hr.operations`)
```
assignments(employeeId, params?)
globalAssignments(params?)
roleRequirements(employeeId, params?)
siteReadiness(employeeId)
globalReadiness(params?)
blocks(employeeId, params?)
globalBlocks(params?)
assets(employeeId, params?)
ppe(employeeId, params?)
accommodation(employeeId, params?)
summary(employeeId)
readinessSummary(employeeId)
```

### Invalidation Helpers Added
```
invalidateHrEmployeeOperations (invalidates all)
invalidateHrEmployeeAssignments
invalidateHrGlobalAssignments
invalidateHrEmployeeReadiness
invalidateHrGlobalReadiness
invalidateHrEmployeeBlocks
invalidateHrGlobalBlocks
invalidateHrEmployeeAssets
invalidateHrEmployeePpe
invalidateHrEmployeeAccommodation
```

---

## RLS Verification

All 7 tables verified in Supabase:

| Table | `relrowsecurity` | `relforcerowsecurity` |
|---|---|---|
| employee_accommodation_records | true | true |
| employee_assets | true | true |
| employee_assignments | true | true |
| employee_operational_blocks | true | true |
| employee_ppe_issues | true | true |
| employee_role_requirements | true | true |
| employee_site_readiness | true | true |

Permissions used: `hr.assignments.view` (confirmed in DB), `hr.assignments.manage` (confirmed in DB)

---

## Testing

### TypeScript
```
npx tsc --noEmit → Exit code 0, no errors
```

### Production Build
```
npm run build → Exit code 0, compiled successfully
```
All 4 new HR.6 routes appear in build output:
- `/admin/hr/operations`
- `/admin/hr/operations/assignments`
- `/admin/hr/operations/blocks`
- `/admin/hr/operations/readiness`

---

## Scope Control Checklist

- [x] `employee_assignments` created
- [x] `employee_role_requirements` created
- [x] `employee_site_readiness` created
- [x] `employee_operational_blocks` created
- [x] `employee_assets` created
- [x] `employee_ppe_issues` created
- [x] `employee_accommodation_records` created
- [x] Operations tab activated in Employee Profile
- [x] Overview operations/readiness summary updated (6 mini-cards)
- [x] Global operations routes created within HR.6 scope only
- [x] Deterministic readiness calculation implemented
- [x] No HR actions/disciplinary/PRO/EOS tables created
- [x] No recruitment tables created
- [x] No dashboard/search/report/AI implementation
- [x] No Fleet/Workshop/Inventory module implementation
- [x] No duplicate asset/accommodation master created
- [x] All tables use BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
- [x] All tables have RLS enabled and forced
- [x] 31 indexes created in same migration
- [x] All mutations use getAuthContext + hasPermission + Zod + logAudit + revalidatePath
- [x] ERPChildDialogForm used for all child forms
- [x] No shadcn Select for async DB data
- [x] tsc passes (exit 0)
- [x] build passes (exit 0)
- [x] Implementation report created
- [x] SOT updated

---

## Issues / Notes

1. **Audit metadata pattern:** Consistent with HR.5 — `parent_employee_id`, `employee_code`, `employee_name`, `related_record_type` in `new_values`.
2. **FK cast for Supabase-generated join types:** Using `as unknown as` to correctly cast nested joined rows (same pattern as HR.5).
3. **`ERPRecordSectionPanel` not used in tab:** That component belongs to the workspace routing layer. Operations tab sections use inline `div` containers matching the payroll tab pattern.
4. **`AuthContext.permissionCodes`:** The `AuthContext` shape uses `permissionCodes` (not `permissions`) — fixed in `checkPerm` helper.
5. **Work site ID for readiness:** The "Check Readiness" dialog takes a numeric work site ID input. Future HR phases may improve this with a site selector ERPCombobox backed by live data.
6. **Waiver audit:** Role requirement waivers are always logged with `waiver_reason` in audit metadata.

---

## Final Recommendation

HR.6 is complete. The next recommended phase is:

```
ERP HR.7 — HR Actions
```

HR.7 may create disciplinary/PRO/action records and can optionally create `employee_operational_blocks`
entries with `block_type = 'hr_hold'` using the HR.6 block table. HR.7 must NOT modify HR.6 tables
except through the existing `createEmployeeOperationalBlock` server action.

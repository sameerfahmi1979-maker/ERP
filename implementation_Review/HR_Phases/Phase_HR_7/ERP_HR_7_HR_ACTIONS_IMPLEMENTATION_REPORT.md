# ERP HR.7 — HR Actions Implementation Report

**Phase:** ERP HR.7 — HR Actions  
**Date:** 2026-06-19  
**Status:** CLOSED / PASS  
**Prerequisite:** HR.6 — Operations and Readiness (CLOSED / PASS)

---

## Executive Summary

HR.7 implements the HR Actions module across the ALGT ERP system. This phase activates the HR Actions tab within the Employee Profile workspace and creates five global HR action management pages. Eight new database tables were created covering PRO processes, general HR actions, performance reviews, disciplinary records, HR notes, approval requests, EOS cases, and clearance checklist items. All tables have RLS enabled and forced with permission-gated access. TypeScript compiles clean and the production build passes.

---

## Files Created

### Database Migration
- `supabase/migrations/20260619090000_erp_hr_7_hr_actions.sql` — 8 tables, 2 RLS helpers, 38 indexes, all RLS policies

### Server Actions
- `src/server/actions/hr/actions.ts` — Full CRUD server actions for all 8 HR.7 entities + summary

### UI Tab
- `src/features/hr/employees/tabs/employee-hr-actions-tab.tsx` — 7-section HR Actions tab component

### Global Route Pages
- `src/app/(protected)/admin/hr/actions/page.tsx` — HR Actions hub page
- `src/app/(protected)/admin/hr/actions/pro/page.tsx` — PRO Processes page
- `src/app/(protected)/admin/hr/actions/disciplinary/page.tsx` — Disciplinary & Warnings page
- `src/app/(protected)/admin/hr/actions/approvals/page.tsx` — Approval Requests page
- `src/app/(protected)/admin/hr/actions/eos/page.tsx` — EOS & Clearance page

### Global Page Clients
- `src/features/hr/actions/hr-pro-processes-page-client.tsx`
- `src/features/hr/actions/hr-disciplinary-page-client.tsx`
- `src/features/hr/actions/hr-approvals-page-client.tsx`
- `src/features/hr/actions/hr-eos-page-client.tsx`

---

## Files Modified

- `src/lib/query/query-keys.ts` — Added `queryKeys.hr.actions.*` (14 new key factories)
- `src/lib/query/invalidation.ts` — Added 13 new invalidation helpers
- `src/features/hr/employees/employee-workspace-form.tsx` — Activated HR Actions tab; updated Overview to pass `canViewHrActions`
- `src/features/hr/employees/tabs/employee-overview-tab.tsx` — Added `HrActionsSummarySection` with 6 metric cards; removed HR.7 placeholder
- `src/components/layout/app-sidebar.tsx` — Added "HR Actions" nav group with 4 sub-items

---

## Database Migration Summary

**Migration file:** `20260619090000_erp_hr_7_hr_actions.sql`

### RLS Helper Functions Created
| Function | Purpose |
|---|---|
| `current_user_can_view_employee_hr_actions(employee_id)` | View permission gate using `hr.actions.view` |
| `current_user_can_manage_employee_hr_actions(employee_id)` | Manage permission gate using `hr.actions.manage` |

### HR Actions Tables Created

| Table | Purpose | PK | Soft Delete |
|---|---|---|---|
| `employee_pro_processes` | PRO/government/visa/legal admin processes | BIGINT IDENTITY | ✓ |
| `employee_hr_actions` | General HR action register | BIGINT IDENTITY | ✓ |
| `employee_performance_records` | Performance/probation review records | BIGINT IDENTITY | ✓ |
| `employee_disciplinary_records` | Disciplinary/warning records | BIGINT IDENTITY | ✓ |
| `employee_hr_notes` | Restricted internal HR notes (append-only) | BIGINT IDENTITY | ✓ |
| `employee_approval_requests` | Simple one-step HR approval requests | BIGINT IDENTITY | ✓ |
| `employee_eos_cases` | EOS/resignation/termination process shell | BIGINT IDENTITY | ✓ |
| `employee_clearance_items` | Clearance checklist items linked to EOS case | BIGINT IDENTITY | ✓ |

### Cross-Table FK
- `employee_hr_actions.approval_request_id` → `employee_approval_requests(id)` added post-table creation

### Total Indexes Created: 38 partial indexes (WHERE deleted_at IS NULL)

---

## Server Actions

**File:** `src/server/actions/hr/actions.ts`

All mutations follow: `getAuthContext()` → `hasPermission()` → `Zod.safeParse()` → `createAdminClient()` → DB mutation → `hrAuditLog()` → `revalidatePath()`

### Action Groups

| Group | Actions |
|---|---|
| **PRO Processes** | `listEmployeeProProcesses`, `listGlobalProProcesses`, `createEmployeeProProcess`, `updateEmployeeProProcess`, `archiveEmployeeProProcess`, `changeEmployeeProProcessStatus` |
| **HR Actions** | `listEmployeeHrActions`, `listGlobalHrActions`, `createEmployeeHrAction`, `updateEmployeeHrAction`, `archiveEmployeeHrAction`, `closeEmployeeHrAction`, `cancelEmployeeHrAction` |
| **Performance** | `listEmployeePerformanceRecords`, `createEmployeePerformanceRecord`, `updateEmployeePerformanceRecord`, `archiveEmployeePerformanceRecord`, `submitEmployeePerformanceRecord`, `approveEmployeePerformanceRecord`, `closeEmployeePerformanceRecord` |
| **Disciplinary** | `listEmployeeDisciplinaryRecords`, `listGlobalDisciplinaryRecords`, `createEmployeeDisciplinaryRecord`, `updateEmployeeDisciplinaryRecord`, `archiveEmployeeDisciplinaryRecord`, `acknowledgeEmployeeDisciplinaryRecord`, `closeEmployeeDisciplinaryRecord` |
| **HR Notes** | `listEmployeeHrNotes`, `createEmployeeHrNote`, `archiveEmployeeHrNote` |
| **Approval Requests** | `listEmployeeApprovalRequests`, `listGlobalApprovalRequests`, `createEmployeeApprovalRequest`, `approveEmployeeApprovalRequest`, `rejectEmployeeApprovalRequest`, `cancelEmployeeApprovalRequest`, `archiveEmployeeApprovalRequest` |
| **EOS Cases** | `listEmployeeEosCases`, `listGlobalEosCases`, `createEmployeeEosCase`, `updateEmployeeEosCase`, `archiveEmployeeEosCase`, `changeEmployeeEosCaseStatus` |
| **Clearance Items** | `listEmployeeClearanceItems`, `createEmployeeClearanceItem`, `updateEmployeeClearanceItem`, `clearEmployeeClearanceItem`, `blockEmployeeClearanceItem`, `archiveEmployeeClearanceItem` |
| **Summary** | `getEmployeeHrActionsSummary` |

---

## UI Implementation

### HR Actions Tab (Employee Profile)
**File:** `src/features/hr/employees/tabs/employee-hr-actions-tab.tsx`

7 sections implemented:
1. **PRO Processes** — List, Add, Edit, Archive; status/priority badges; status change
2. **HR Actions** — List, Add, Edit, Archive, Close; action type and status display
3. **Performance Reviews** — List, Add, Edit, Archive, Submit, Approve; rating display
4. **Disciplinary & Warnings** — List, Add, Edit, Archive, Acknowledge; severity + status badges
5. **HR Notes** — Append-only list, Add, Archive; visibility indicator; confidentiality warning
6. **Approval Requests** — List, Create, Approve/Reject/Cancel; pending decision dialog
7. **EOS & Clearance** — EOS case list, Add/Edit; inline clearance checklist per case; Clear/Block actions

All child forms use `ERPChildDialogForm`. All async dropdowns use `ERPCombobox`.

### Overview Tab Updates
**File:** `src/features/hr/employees/tabs/employee-overview-tab.tsx`

Added `HrActionsSummarySection` with 6 metric cards:
- Open PRO Processes
- Open HR Actions
- Performance Reviews
- Open Disciplinary Records
- Pending Approvals
- Open EOS Case (Active/None)

Removed HR.7 placeholder from future phase placeholders.

### Employee Workspace Form
**File:** `src/features/hr/employees/employee-workspace-form.tsx`

- Imported `EmployeeHrActionsTab`
- Replaced placeholder with live `<EmployeeHrActionsTab employeeId={...} authContext={...} onChildOpen={...} />`
- Passed `canViewHrActions={checkPermission(authContext, "hr.actions.view")}` to OverviewTab

---

## Global HR Actions Routes

| Route | Permission Gate | Client Component |
|---|---|---|
| `/admin/hr/actions` | `hr.actions.view` | Static hub page |
| `/admin/hr/actions/pro` | `hr.actions.view` | `HrProProcessesPageClient` |
| `/admin/hr/actions/disciplinary` | `hr.actions.view` | `HrDisciplinaryPageClient` |
| `/admin/hr/actions/approvals` | `hr.actions.view` | `HrApprovalsPageClient` |
| `/admin/hr/actions/eos` | `hr.actions.view OR hr.eos.view` | `HrEosPageClient` |

All pages: permission-gated, server-side rendered, no full table client loading.

---

## Approval / EOS / Clearance Limitations

Per prompt requirements, the following are NOT implemented in HR.7:

| Feature | Deferred To |
|---|---|
| Full global approval engine / workflow routing | Future phase |
| EOS gratuity/financial calculation | Finance module |
| Final settlement payroll processing | Finance module |
| Warning letter / NOC / salary certificate PDF | HR.11 |
| Automated email for approval decisions | HR.11 |
| Automatic disciplinary escalation | Future phase |
| Legal case management | Future phase |

---

## Query Keys and Invalidation

**Added to `src/lib/query/query-keys.ts`:**
```
queryKeys.hr.actions.proProcesses(employeeId, params?)
queryKeys.hr.actions.globalProProcesses(params?)
queryKeys.hr.actions.hrActions(employeeId, params?)
queryKeys.hr.actions.globalHrActions(params?)
queryKeys.hr.actions.performance(employeeId, params?)
queryKeys.hr.actions.disciplinary(employeeId, params?)
queryKeys.hr.actions.globalDisciplinary(params?)
queryKeys.hr.actions.notes(employeeId, params?)
queryKeys.hr.actions.approvals(employeeId, params?)
queryKeys.hr.actions.globalApprovals(params?)
queryKeys.hr.actions.eosCases(employeeId, params?)
queryKeys.hr.actions.globalEosCases(params?)
queryKeys.hr.actions.clearanceItems(eosCaseId)
queryKeys.hr.actions.summary(employeeId)
```

**Added to `src/lib/query/invalidation.ts`:** 13 new helpers including `invalidateHrEmployeeActions`, `invalidateHrEmployeeProProcesses`, `invalidateHrGlobalProProcesses`, `invalidateHrEmployeeHrActions`, `invalidateHrEmployeePerformance`, `invalidateHrEmployeeDisciplinary`, `invalidateHrGlobalDisciplinary`, `invalidateHrEmployeeNotes`, `invalidateHrEmployeeApprovals`, `invalidateHrGlobalApprovals`, `invalidateHrEmployeeEos`, `invalidateHrGlobalEos`, `invalidateHrEmployeeClearance`.

---

## RLS Verification for All 8 HR.7 Tables

| Table | RLS Enabled | RLS Forced | SELECT Policy | INSERT Policy | UPDATE Policy | DELETE Policy |
|---|---|---|---|---|---|---|
| `employee_pro_processes` | ✓ | ✓ | hr.actions.view | hr.actions.manage | hr.actions.manage | hr.actions.manage |
| `employee_hr_actions` | ✓ | ✓ | hr.actions.view | hr.actions.manage | hr.actions.manage | hr.actions.manage |
| `employee_performance_records` | ✓ | ✓ | hr.actions.view | hr.actions.manage | hr.actions.manage | hr.actions.manage |
| `employee_disciplinary_records` | ✓ | ✓ | hr.actions.view | hr.actions.manage | hr.actions.manage | hr.actions.manage |
| `employee_hr_notes` | ✓ | ✓ | hr.actions.view | hr.actions.manage | hr.actions.manage | hr.actions.manage |
| `employee_approval_requests` | ✓ | ✓ | hr.actions.view | hr.actions.manage | hr.actions.manage | hr.actions.manage |
| `employee_eos_cases` | ✓ | ✓ | hr.eos.view OR hr.actions.view | hr.eos.manage OR hr.actions.manage | hr.eos.manage OR hr.actions.manage | hr.eos.manage OR hr.actions.manage |
| `employee_clearance_items` | ✓ | ✓ | hr.eos.view OR hr.actions.view | hr.eos.manage OR hr.actions.manage | hr.eos.manage OR hr.actions.manage | hr.eos.manage OR hr.actions.manage |

All policies use `current_user_can_view_employee()` / `current_user_can_manage_employee()` helper functions established in HR.2.

---

## Testing

### TypeScript Check
```
npx tsc --noEmit
Exit code: 0 — No errors
```

### Production Build
```
npm run build
✓ Compiled successfully
✓ TypeScript passed
✓ All pages generated
Exit code: 0
```

New routes verified in build output:
- `/admin/hr/actions` ✓
- `/admin/hr/actions/approvals` ✓
- `/admin/hr/actions/disciplinary` ✓
- `/admin/hr/actions/eos` ✓
- `/admin/hr/actions/pro` ✓

**Note:** Pre-existing UTF-8 encoding issues in `branch-workspace-form.tsx` and `organization-workspace-form.tsx` (from the previous HR.6 session) were fixed as part of ensuring a clean build.

---

## Scope Control Checklist

- [x] employee_pro_processes table created
- [x] employee_hr_actions table created
- [x] employee_performance_records table created
- [x] employee_disciplinary_records table created
- [x] employee_hr_notes table created
- [x] employee_approval_requests table created
- [x] employee_eos_cases table created
- [x] employee_clearance_items table created
- [x] HR Actions tab activated
- [x] Overview HR actions summary updated
- [x] Global HR actions routes created only within HR.7 scope
- [x] Basic approval request workflow implemented
- [x] EOS shell implemented without financial calculation
- [x] Clearance checklist implemented
- [x] No recruitment tables created
- [x] No dashboard/search/report/AI implementation
- [x] No payroll run/payslip/accounting implementation
- [x] No full global approval engine created
- [x] No document generation/email sending
- [x] All new tables use BIGINT identity
- [x] All new tables have RLS enabled and forced
- [x] All indexes created in same migration
- [x] All mutations use getAuthContext + hasPermission + Zod + logAudit + revalidatePath
- [x] ERPChildDialogForm used for HR action child forms
- [x] No duplicate master data created
- [x] tsc passes
- [x] build passes
- [x] implementation report created
- [x] SOT updated

---

## Issues / Notes

1. **`logAudit` signature mismatch** — The ERP audit helper uses `module_code/entity_name/entity_reference/action` shape, not a generic `entity_type/description` shape. A local `hrAuditLog()` wrapper was created in `actions.ts` to bridge the gap. Audit calls are wrapped in try/catch so they are non-blocking.

2. **`ctx.profile?.id`** — `AuthContext` exposes `profile` as a `UserProfile | null` object, not a `profileId` shorthand. All mutations use `ctx.profile?.id`.

3. **EOS clearance — employee_id scope** — The clearance items tab uses the employee_id from the selected EOS case to scope clearance item queries. The `selectedEosId` state tracks which EOS case is expanded.

4. **Pre-existing UTF-8 encoding issue** — Fixed in `branch-workspace-form.tsx` and `organization-workspace-form.tsx` to ensure clean build (introduced by PowerShell Set-Content from previous session).

---

## Final Recommendation

HR.7 is complete and build-verified. The HR Actions tab is live in Employee Profile and all 5 global HR action pages are reachable from the sidebar "HR Actions" group.

**Next recommended phase:** ERP HR.8 — Recruitment & Onboarding

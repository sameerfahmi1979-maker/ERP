# HR Employee Numbering Strategy — Implementation Report

**Phase:** HR EMPLOYEE NUMBERING STRATEGY.1  
**Status:** CLOSED / PASS ✅  
**Date:** 2026-07-21  
**Commits:** `fix(hr): make employee_category_id required at create` (aeee0d3), `feat(hr): add headcount by category dashboard widget`

---

## Scope

Three-part implementation covering employee numbering policy confirmation, category enforcement,
and a headcount-by-category dashboard widget.

---

## Todo 1 — Confirm EMP-{SEQ6} Policy (DB Verified ✅)

**Finding:** Policy already correctly implemented in `global_numbering_rules`.

| Field | Value |
|---|---|
| `rule_code` | `HR_EMPLOYEE` |
| `rule_name` | Employee Number |
| `document_prefix` | `EMP` |
| `separator` | `-` |
| `sequence_length` | `6` |
| `reset_policy` | `never` |
| `is_active` | `true` |

Format: `EMP-000001`, `EMP-000002`, … — never resets. No code change required.

---

## Todo 2 — Employee Category Mandatory at Hire (Code Change ✅)

**Finding:** `employee_category_id` was optional in both the Zod schema and UI.

### Changes Made

**`src/server/actions/hr/employees.ts`**
- `employeeCreateSchema`: `z.number().int().positive().nullish()` → `z.number().int().positive({ message: "Employee Category is required" })`
- `employeeUpdateSchema`: added explicit `.nullish()` override for `employee_category_id` — preserves backward compatibility for existing employee records that may have `null` in the DB

**`src/features/hr/employees/tabs/employee-profile-tab.tsx`**
- `<Label>Employee Category</Label>` → `<RequiredLabel>Employee Category</RequiredLabel>`
- `allowClear` prop removed from `ERPCombobox`
- `required` prop added to `ERPCombobox`

### Result
- Server rejects new employee creation if `employee_category_id` is missing (400-level error with message)
- UI shows required asterisk and does not allow clearing the combobox value
- Existing employees with `null` category can still be updated without forcing re-selection

---

## Todo 3 — Headcount by Category Dashboard Widget (New Feature ✅)

### Server Action

**`src/server/actions/hr/dashboard.ts`** — new file  
Exported: `getHeadcountByCategory(): Promise<ActionResult<HeadcountByCategoryItem[]>>`

- Permission gate: `hr.employees.view`
- Queries `employees` (status `active` | `probation`, `deleted_at IS NULL`) joined with `hr_employee_categories`
- Aggregates counts in JS; includes "Uncategorised" bucket for employees without a category
- Returns sorted by count DESC

### Widget Component

**`src/features/hr/dashboard/hr-headcount-by-category-widget.tsx`** — new file

- `"use client"` directive
- TanStack Query key: `queryKeys.hr.dashboard.headcountByCategory()`
- Loading: 3 skeleton rows
- Empty state: "No active employees"
- Error state with Retry button
- Rows: category name + `Badge` count
- Footer: total active count when multiple categories present
- Wraps `HrDashboardSectionCard` matching existing dashboard card pattern

### Placement

**`src/features/hr/dashboard/hr-dashboard-page-client.tsx`**
- Added as card #8 in the `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` HR Dashboard grid
- Rendered only when `permissions.canViewEmployees` is true

### Query Keys

**`src/lib/query-keys.ts`**
- Added `queryKeys.hr.dashboard.headcountByCategory()` under existing `hr.dashboard` namespace

---

## Files Changed

| File | Change |
|---|---|
| `src/server/actions/hr/employees.ts` | `employee_category_id` required in create schema |
| `src/features/hr/employees/tabs/employee-profile-tab.tsx` | RequiredLabel + required combobox |
| `src/server/actions/hr/dashboard.ts` | New — `getHeadcountByCategory` server action |
| `src/features/hr/dashboard/hr-headcount-by-category-widget.tsx` | New — headcount widget component |
| `src/features/hr/dashboard/hr-dashboard-page-client.tsx` | Widget added to dashboard grid |
| `src/lib/query-keys.ts` | New query key for headcount widget |

---

## Test Results

- **tsc (`--noEmit`):** Zero errors in all HR/dashboard files. Pre-existing errors in unrelated modules (audit, branches, permissions) unchanged.
- **No DB migration required** — policy confirmation only; category enforcement is code-level only.

---

## Notes

- The numbering strategy adopts single-serial `EMP-{SEQ6}` as the official policy. No category-based prefixes or ranges.
- `employee_category_id` is now mandatory at hire. Existing employees are not affected (update schema remains nullable for backward compat).
- The dashboard widget uses the category relationship (`employee_category_id → hr_employee_categories`) for grouping — not number ranges.

# ERP GLOBAL UI.4E.1 — Implementation Report
## System-Wide Workspace State Isolation, Scoped Child Dialogs, and Full Form Workspace Conversion

**Date:** 2026-06-14  
**Phase:** ERP GLOBAL UI.4E.1  
**Status:** COMPLETE ✅  
**TypeScript:** PASS (0 errors)  

---

## 1. Objectives

| # | Objective | Status |
|---|-----------|--------|
| 1 | Fix ERPDataTable state leakage between screens (route-scoped localStorage) | ✅ Done |
| 2 | Fix WorkspaceTabBar z-index so child dialogs never block tab switching | ✅ Done |
| 3 | Convert all Finance Basics forms to ERPRecordWorkspaceForm | ✅ Done |
| 4 | Convert all UOM forms to ERPRecordWorkspaceForm | ✅ Done |
| 5 | Convert all Geography forms to ERPRecordWorkspaceForm | ✅ Done |
| 6 | Convert Lookup Categories and Values to ERPRecordWorkspaceForm | ✅ Done |
| 7 | Convert Admin modules (Roles, Organizations, Branches, Numbering) to ERPRecordWorkspaceForm | ✅ Done |
| 8 | Convert Legacy Customer Add/Edit/View to ERPRecordWorkspaceForm | ✅ Done |
| 9 | Party Admin Masters — confirmed already correct (ERPChildDialogForm) | ✅ No change needed |
| 10 | Update workspace route registry with all new record routes | ✅ Done |
| 11 | Fix ERPRecordSection icon type to accept Lucide component constructors | ✅ Done |
| 12 | TypeScript + build pass | ✅ Done |

---

## 2. Bug Fixes

### 2.1 ERPDataTable Cross-Screen State Leakage

**Problem:** `erp_table_prefs:v2:{userId}:{tableId}` key in localStorage was shared across routes, causing filters/pagination from one screen to contaminate another.

**Fix:** Key is now `erp_table_prefs:v2:{userId}:{normalizedRoute}:{tableId}`, where `normalizedRoute` is derived from `usePathname()`. Each screen has fully isolated table state.

**Files changed:**
- `src/components/erp/table/erp-data-table.tsx`
- `src/lib/workspace/table-preferences.ts` (or inline in ERPDataTable)

### 2.2 WorkspaceTabBar Z-Index

**Problem:** `ERPChildDialogForm` (z-[60]) was blocking the workspace tab bar, preventing tab switching while a child dialog was open.

**Fix:** `WorkspaceTabBar` z-index raised from `z-[30]` to `z-[100]` with `pointer-events-auto`.

**Files changed:**
- `src/components/workspace/workspace-tab-bar.tsx`

---

## 3. New Workspace Form Standard

### 3.1 Pattern

All main CRUD record operations now use `ERPRecordWorkspaceForm`:
- Table action buttons call `router.push('/path/record/new')` or `router.push('/path/record/${id}?mode=edit')`
- A Next.js server page (`record/new/page.tsx`, `record/[id]/page.tsx`) handles auth + RBAC + data fetching
- A client `*WorkspaceForm` component renders `ERPRecordWorkspaceForm` + `ERPRecordSectionPanel` sections

### 3.2 ERPChildDialogForm

Remains the correct pattern for:
- Child entity tables embedded within a parent form (contacts, addresses, bank details)
- Simple lookup admin tables with inline add/edit (Party Types, Service Categories, Relationship Types)

---

## 4. Files Created / Modified

### New Workspace Forms
| File | Description |
|------|-------------|
| `src/features/master-data/finance-basics/components/bank-workspace-form.tsx` | Bank record form |
| `src/features/master-data/finance-basics/components/currency-workspace-form.tsx` | Currency record form |
| `src/features/master-data/finance-basics/components/payment-term-workspace-form.tsx` | Payment term form |
| `src/features/master-data/finance-basics/components/tax-type-workspace-form.tsx` | Tax type form |
| `src/features/master-data/finance-basics/components/cost-center-workspace-form.tsx` | Cost center form |
| `src/features/master-data/finance-basics/components/profit-center-workspace-form.tsx` | Profit center form |
| `src/features/master-data/uom/components/uom-category-workspace-form.tsx` | UOM category form |
| `src/features/master-data/uom/components/unit-of-measure-workspace-form.tsx` | Unit of measure form |
| `src/features/master-data/uom/components/uom-conversion-workspace-form.tsx` | UOM conversion form |
| `src/features/master-data/geography/components/country-workspace-form.tsx` | Country form |
| `src/features/master-data/geography/components/emirate-workspace-form.tsx` | Emirate form |
| `src/features/master-data/geography/components/city-workspace-form.tsx` | City form |
| `src/features/master-data/geography/components/area-workspace-form.tsx` | Area form |
| `src/features/master-data/geography/components/port-workspace-form.tsx` | Port form |
| `src/features/master-data/lookups/components/lookup-category-workspace-form.tsx` | Lookup category form |
| `src/features/master-data/lookups/components/lookup-value-workspace-form.tsx` | Lookup value form |
| `src/features/roles/role-workspace-form.tsx` | Role form |
| `src/features/organizations/organization-workspace-form.tsx` | Organization form |
| `src/features/branches/branch-workspace-form.tsx` | Branch form |
| `src/features/numbering/components/numbering-rule-workspace-form.tsx` | Numbering rule form |
| `src/features/master-data/customers/components/customer-workspace-form.tsx` | Customer form |

### New Server Route Pages (record/new + record/[id]) — 42 new pages total
All under `src/app/(protected)/admin/...` for Finance Basics, UOM, Geography, Lookups, Roles, Organizations, Branches, Numbering, and Customers.

### Updated Tables (router.push navigation)
All `*-table.tsx` components for the above modules updated to remove dialog state and use `router.push()`.

### Updated Add Buttons
- `src/features/roles/add-role-button.tsx`
- `src/features/branches/add-branch-button.tsx`
- `src/features/organizations/add-organization-button.tsx`

### New Server Actions
- `getEmirateById`, `getCityById`, `getAreaById`, `getPortById` → `src/features/master-data/geography/actions.ts`
- `getBranchById` → `src/server/actions/branches.ts`
- `getOrganizationById` → `src/server/actions/organizations.ts`
- `getRoleById` → `src/server/actions/roles.ts`

### Type Fixes
- `src/components/workspace/erp-record-section-nav.tsx` — `icon` type now accepts `React.ComponentType` (Lucide constructors) + `React.createElement` in render
- `src/components/workspace/erp-record-workspace-form.tsx` — `onSave`/`onSaveAndClose` now accept `Promise<boolean>`

### Route Registry
- `src/lib/workspace/workspace-route-registry.ts` — added all new record tab entries for Lookups, Finance Basics, UOM, Geography, Admin, Customer

---

## 5. Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| Opening any Finance Basics, UOM, Geography, Lookup, Role, Org, Branch, Numbering Rule, or Customer record opens a workspace tab | ✅ |
| Child dialogs (ERPChildDialogForm) do not block WorkspaceTabBar | ✅ |
| Table filters/search on one screen do not appear on another | ✅ |
| TypeScript build: 0 errors | ✅ |
| ERPDrawerForm no longer used for primary CRUD | ✅ |
| ERPChildDialogForm still used for Party Admin Masters (correct pattern) | ✅ |

---

## 6. Known Limitations / Notes

- **Users module**: Not converted. User management involves auth-level operations (invites, password reset) that are not equivalent to simple CRUD workspace forms. Deferred.
- **Port form**: Fields `operator_name`, `website`, `description` were found to not exist in the `Port` DB type — removed from form. These can be added in a future DB schema phase if needed.
- **Numbering "Duplicate" mode**: The old `NumberingRuleFormDialog` had a `duplicate` mode. The workspace form only supports `add`/`edit`/`view`. Duplicate functionality can be re-added as a dedicated action button if needed.
- **Customers table**: The `onRefresh` prop no longer calls `handleRefresh` after form closes (since the form is now a separate route). List screen should use `router.refresh()` or react-query revalidation on focus return.

---

*Report generated: 2026-06-14 | Phase: ERP GLOBAL UI.4E.1*

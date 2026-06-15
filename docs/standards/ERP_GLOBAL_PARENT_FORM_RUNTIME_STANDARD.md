# ERP Global Parent Form Runtime Standard

**Status:** Official app-wide standard
**Phase:** ERP BASE 002F.3E.3B.6G.1
**Date:** 2026-06-12
**Applies to:** Every parent form with lookup fields and/or child tables — current modules (Customers, Vendors, Subcontractors, Consultants, Government Authorities, Recruitment Agencies, master data) and all future modules (HR, Fleet, Workshop, Inventory, Projects, Finance).

Related standards:

- `docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md`
- `docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md`

Related utilities (implemented in 3B.6G.1):

- `src/lib/query/prefetch-lookups.ts` — `prefetchLookupCategories`, `seedLookupCategoryValues`, `prefetchMasterDataQueries`
- `src/lib/query/form-prefetch-types.ts` — `FormPrefetchDeclaration`, `MasterQueryDescriptor`, `ChildTableDescriptor`
- `src/lib/query/query-keys.ts` — `queryKeys.child.*`
- `src/lib/query/invalidation.ts` — `invalidateChildTable` + per-entity helpers
- `src/lib/lookups/master-data-fetchers.ts` — shared fetchers used by both hooks and prefetch
- Reference declaration: `src/features/master-data/customers/customer-prefetch.ts`

---

## 1. Purpose

This standard exists to guarantee:

1. **Fast parent form opening** — the drawer shell appears immediately; data arrives in controlled, parallel phases, never blocking the shell.
2. **No one-by-one lookup loading** — lookup comboboxes must never populate sequentially. Root cause (verified in 3B.6G plan): each `LookupSelect` fires its own server action, and Next.js serializes server actions per client. The fix is one batch action + seeding individual query keys.
3. **Safe child table loading** — child tables (contacts, addresses, bank details, documents) fetch only when their tab is first opened and the parent record exists.
4. **No FormData data loss** — sections containing inputs read by `new FormData(form)` must never be lazy-unmounted while save actions perform full-payload updates.
5. **Future module consistency** — every new module follows the same declared, reviewable runtime plan instead of ad-hoc fetching.

## 2. Parent Form Opening Phases

Every parent drawer must follow this sequence:

| Phase | Action | Rule |
|-------|--------|------|
| **A** | Open drawer shell immediately | Never await any fetch before rendering the shell, header, and tab navigation. |
| **B** | Load or receive parent record | Edit mode: the row already held by the list page is passed in; any refresh happens in background. Add mode: no fetch. |
| **C** | Prefetch default/basic tab lookup data | Fire `prefetchLookupCategories` (one batch server action) + `prefetchMasterDataQueries` (parallel TanStack prefetch) on drawer open. |
| **D** | Render default tab with synchronized lookup availability | Comboboxes read seeded cache and appear together — not one by one. A failed prefetch degrades gracefully to per-field fetch. |
| **E** | Lazy-mount non-visible safe sections | Inactive tabs that are FormData-safe (see §5) use `lazyMount` / mount-on-first-activation (3B.6E standard). |
| **F** | Lazy-fetch child tables only when tab opens and parent id exists | Child queries are disabled until both conditions hold. Add mode shows "Save parent first". |

## 3. Lookup Prefetch Standard

1. **Parent forms must declare lookup categories.** Each module exports a `FormPrefetchDeclaration` constant (e.g. `CUSTOMER_FORM_PREFETCH` in `customer-prefetch.ts`) listing the UPPERCASE category codes its default tab needs.
2. **Batch lookup category values are fetched once.** Use `prefetchLookupCategories(queryClient, declaration.lookupCategories)`, which calls `getActiveLookupValuesByCategoryCodes` — one server action, two Supabase round-trips, regardless of category count.
3. **Batch results must seed individual `LookupSelect` query keys.** The batch query key `["lookup","batch",…]` is NOT what `LookupSelect` reads. Seeding writes each category to `queryKeys.lookup.values(code, null, includeInactive)` = `["lookup","values",CODE,null,false]` — the exact key `useLookupValuesQuery` uses with default options. Never invent a different key shape.
4. **Common master lists use TanStack `prefetchQuery`.** Countries, currencies, payment terms, tax types, etc. are prefetched via `prefetchMasterDataQueries` with descriptors built from `queryKeys` factories and shared fetchers in `master-data-fetchers.ts`. `prefetchQuery` skips fresh cache entries automatically, so reopening a form costs zero network calls within `staleTime`.
5. **Dependent lookups are not prefetched until the parent value exists.** Cascades (country → emirate → city → area, lookup `parentValueCode` chains) fetch on demand when the parent field has a value. Prefetching all possible child combinations is forbidden.
6. **Lazy-tab lookups are not part of the open-time batch.** Categories used only inside lazy-mounted tabs (e.g. `CONTACT_TYPES` in the Contacts tab) fetch when that tab first opens. The open-time batch covers only the default-visible tab(s).

## 4. Child Table Standard

1. **Fetch trigger:** a child table query runs only when (a) its tab/section has been activated at least once AND (b) the parent id exists. Never fetch child rows during drawer open.
2. **Query key shape:** `queryKeys.child.table(tableName, parentId)` → `["child", "<table_name>", <parentId|null>]`. Entity-specific helpers exist for Customer (`queryKeys.child.customerContacts(id)` etc.) and future modules must add equivalents.
3. **Mutation invalidation:** every child create/update/delete must call the matching invalidation helper (`invalidateChildTable(qc, tableName, parentId)` or an entity helper such as `invalidateCustomerContacts`). Invalidate only the child key — never parent or master caches — unless the child mutation genuinely changes parent-displayed data.
4. **Add mode:** when the parent record is unsaved (`parentId == null`), the child section renders a "Save parent first" placeholder. The child query stays disabled (`enabled: !!parentId`).
5. **Dirty isolation:** child row edits happen in their own sub-form/dialog and must NOT mark the parent form dirty, unless the operation intentionally affects a parent field (in which case the parent change goes through normal dirty tracking).
6. **Generic helper (3B.6G.4):** new modules MUST build child hooks on `useChildTableQuery` from `src/hooks/child-tables/use-child-table-query.ts` — do not copy-paste query logic. A complete new-module child hook is a few lines:

```typescript
// src/features/master-data/vendors/hooks/use-vendor-child-queries.ts
export function useVendorContactsQuery(
  vendorId: number | null | undefined,
  options: ChildTableQueryOptions = {}
) {
  return useChildTableQuery<VendorContact>({
    tableName: "vendor_contacts",   // key becomes ["child","vendor_contacts",vendorId]
    parentId: vendorId,             // null (Add mode) keeps the query disabled
    fetcher: getVendorContacts,     // existing server action
    errorLabel: "contacts",
    enabled: options.enabled,
  });
}

// invalidation helper — one line via the factory in src/lib/query/invalidation.ts
export const invalidateVendorContacts = createChildInvalidator("vendor_contacts");

// inside the section component, after a successful create/update/delete:
invalidateVendorContacts(queryClient, vendorId);
// (equivalent: invalidateChildTable(queryClient, "vendor_contacts", vendorId))
```

The Customer child hooks (`use-customer-child-queries.ts`) are the reference implementation of this pattern.

## 5. Lazy Mount and FormData Safety Rule

Parent save actions currently perform **full-payload updates**: `new FormData(form)` collects only mounted inputs, and the server replaces all columns. Therefore:

- **Safe to lazy-mount:** sections containing NO inputs read by the parent's FormData — child CRUD tables (own save path), audit/read-only sections, document lists.
- **Unsafe to lazy-mount (unmount form fields):** any section whose inputs feed the parent FormData payload. If such a tab were unmounted at save time, its fields would be silently written as null/empty — data loss.
- **Permitted pattern for mixed tabs:** keep the parent inputs always mounted; lazy-mount only the embedded child CRUD component (3B.6E "partial lazy-mount", as done for Customer `location`/`finance` tabs).
- **Once mounted, stay mounted:** `lazyMount` defers first mount only; after activation the section is hidden with CSS (`hidden`), never unmounted, so FormData stays complete.
- **Future unlock:** if a module's save action is converted to patch-style (only changed fields submitted), its form sections become safe for full lazy-mount. Until then, assume full-payload risk.

## 6. Future Module Checklist (HR / Fleet / Workshop / Inventory / Projects)

Before merging a new parent form, verify:

- [ ] A `FormPrefetchDeclaration` constant exists in the module folder (`<module>-prefetch.ts`) declaring `lookupCategories`, `masterQueries`, `childTables`.
- [ ] All declared category codes verified against live `global_lookup_categories` (UPPERCASE, active).
- [ ] Drawer open fires `prefetchLookupCategories` + `prefetchMasterDataQueries`; no lookup combobox triggers its own server action for declared categories.
- [ ] `masterQueries` descriptors use `queryKeys` factories and shared fetchers from `master-data-fetchers.ts` (extend that file if a new list is needed — do not duplicate Supabase queries).
- [ ] Each child table has a `queryKeys.child.*` helper and an invalidation helper in `invalidation.ts`.
- [ ] Child queries are `enabled` only after tab activation + parent id exists; Add mode shows "Save parent first".
- [ ] Lazy-mount applied only to FormData-safe sections (§5); mixed tabs use partial lazy-mount.
- [ ] Safe Close / dirty tracking verified for combobox-only edits (3B.6C standard).
- [ ] Runtime QA checklist (§7) executed and recorded in the module's implementation report.

## 7. Runtime QA Checklist

Every module applying this standard must pass:

| # | Test | Pass condition |
|---|------|----------------|
| 1 | No one-by-one lookup loading | Open drawer: all default-tab lookup comboboxes populate together; network shows ONE batch lookup action, not N. |
| 2 | Child section no fetch before tab activation | Open drawer, stay on default tab: zero child-table requests fired. |
| 3 | Cached reopen | Close and reopen the drawer within `staleTime`: lookup/master comboboxes render instantly with zero refetch. |
| 4 | Safe Close after combobox-only edit | Change only a combobox value, press Esc/close: unsaved-changes warning appears. |
| 5 | Save / Save & Close regression | Both actions persist all fields, including values inside previously-inactive (mounted) tabs. |
| 6 | No FormData data loss | Edit record, save WITHOUT visiting other tabs: re-fetch row and confirm untouched tab fields kept their values. |

## 8. Developer Rules (Strict)

1. **No direct lookup fetch inside parent form body.** Lookup data flows through `useLookupValuesQuery` (per-field, cache-shared) plus declaration-driven prefetch. Never call lookup server actions imperatively from form components.
2. **No hidden child table fetch before tab activation.** No `useEffect`-on-mount child fetches in drawer-level components.
3. **No lazy unmount of FormData-dependent sections.** §5 is non-negotiable until patch-style saves exist for that module.
4. **Every parent form must declare its lookup and child table runtime plan** as a `FormPrefetchDeclaration` constant, reviewed in the module's implementation report.
5. **Every child table query must have a query key and invalidation rule** registered in `query-keys.ts` and `invalidation.ts` before the mutation ships.
6. **Never seed or read a query key shape other than the `queryKeys` factories.** Hand-written key arrays in components are forbidden.

---

## 9. Current Module Compliance Status (3B.6G.5)

| Module | Form | Lookup-heavy? | Child tables? | FormData risk? | Prefetch Decl? | Compliance |
|--------|------|---------------|---------------|----------------|----------------|------------|
| Customer | `customer-form-drawer.tsx` | ✅ 6 lookup + 4 master | ✅ contacts/addresses/banks/docs | Yes (full-payload) | ✅ `CUSTOMER_FORM_PREFETCH` + wired | **COMPLIANT** |
| Organization | `organization-form-dialog.tsx` | ⚠️ geography/currency (TanStack hooks, no LookupSelect) | None | Yes | ✅ `ORGANIZATION_FORM_PREFETCH` declared | **DECL-READY** (wiring deferred) |
| Branch | `branch-form-dialog.tsx` | ⚠️ geography (TanStack hooks, no LookupSelect) | None | Yes | ✅ `BRANCH_FORM_PREFETCH` declared | **DECL-READY** (wiring deferred) |
| Roles | `role-form-dialog.tsx`, `role-detail-drawer.tsx` | No | None | Yes | N/A | **D — Not applicable** |
| Users | `add-user-dialog.tsx`, `user-edit-dialog.tsx` | No | None | Yes | N/A | **D — Not applicable** |
| Numbering Rules | `numbering-rule-form-dialog.tsx` | No | None | Yes | N/A | **D — Not applicable** |
| Geography | country/emirate/city/area/port dialogs | ⚠️ parent-child comboboxes (cascade) | None | Yes | N/A — small dialogs | **D — Not applicable** |
| Finance Basics | currency/bank/payment-term/payment-type dialogs | No | None | Yes | N/A — small dialogs | **D — Not applicable** |
| Finance Basics | `cost-center-form-dialog.tsx`, `profit-center-form-dialog.tsx` | ⚠️ 1 LookupSelect (type) + OwnerCompany/Branch | None | Yes | N/A — single-field | **D — Not applicable** |
| Finance Basics | `tax-type-form-dialog.tsx` | ⚠️ 1 LookupSelect (treatment) | None | Yes | N/A — single-field | **D — Not applicable** |
| UOM | uom-category/unit/conversion dialogs | No | None | Yes | N/A — small dialogs | **D — Not applicable** |
| Lookups | category/value dialogs | No | None | Yes | N/A — small dialogs | **D — Not applicable** |

**Compliance levels:**
- **COMPLIANT** — FormPrefetchDeclaration exists and is wired into page-mount prefetch.
- **DECL-READY** — Declaration created; wiring deferred to a future phase (low risk, small form).
- **D — Not applicable** — Form is too small or has no multi-field lookup loading issue.

---

## 10. When to Create a FormPrefetchDeclaration

Create a `FormPrefetchDeclaration` when **all three** are true:

1. The form is a parent drawer/form (not a simple dialog) with more than one lookup or master-data combobox on its default visible tab.
2. The comboboxes would load "one by one" without prefetch (i.e. they each trigger separate server actions on mount).
3. The module has child CRUD tables **or** is a party-master (customer-like) module.

## 11. When NOT to Create a FormPrefetchDeclaration

Do NOT create a declaration if:

- The form is a small dialog with ≤ 1 lookup field (cost-center, tax-type, etc.) — a single `useLookupValuesQuery` call is acceptable.
- The form is purely static (roles, numbering rules) with no lookup comboboxes.
- The form's comboboxes are entirely cascade-dependent (emirate → city); the parent value is not known at drawer-open time.

## 12. FormData Risk Review Guide

Before lazy-mounting any section in a parent drawer:

1. Search the section for `<input>`, `<select>`, `<textarea>`, and any form-field component that renders a hidden input (e.g. `LookupSelect`, `ERPCombobox`).
2. Trace the parent save action: does it call `new FormData(form)` or read `formData.get(fieldName)`?
3. If yes, the section is **FormData-unsafe** — keep it always mounted. Use partial lazy-mount (mount the parent inputs, lazy-mount only embedded child CRUD components).
4. If the section is read-only (audit trail, document viewer, computed labels only), it is **FormData-safe** — apply `lazyMount`.

## 13. Future Party-Master Module Template

Ready-to-use templates for Vendor, Subcontractor, Consultant, Government Authority, and Recruitment Agency are declared in:

```
src/lib/standards/party-master-prefetch-templates.ts
```

Each template includes:
- `<ENTITY>_CHILD_TABLES` — typed array of `ChildTableDescriptor` for all child tables (contacts, addresses, bank details, documents).
- `invalidate<Entity><ChildTable>` — pre-created invalidation helpers using `createChildInvalidator`.
- `<ENTITY>_FORM_PREFETCH_TEMPLATE` — a complete `FormPrefetchDeclaration` with lookup category codes verified against live `global_lookup_categories`.

**Steps for each new module:**
1. Copy the relevant `*_FORM_PREFETCH_TEMPLATE` from `party-master-prefetch-templates.ts` into `src/features/master-data/<module>/<module>-prefetch.ts`.
2. Rename it to `<ENTITY>_FORM_PREFETCH` (remove `_TEMPLATE` suffix).
3. Verify lookup categories against actual form fields and live DB.
4. Create entity-specific child hooks using `useChildTableQuery` (§4 rule 6).
5. Wire the declaration via `usePrefetchHook` into the module's table page-mount (follow `useCustomerFormPrefetch` pattern from 3B.6G.2).
6. Register query keys in `query-keys.ts` and invalidation helpers in `invalidation.ts`.

---

*Standard introduced in 3B.6G.1. Wiring phases: 3B.6G.2 (Customer lookup prefetch), 3B.6G.3 (Customer child tables → TanStack Query), 3B.6G.4 (generic child table pattern), 3B.6G.5 (apply to existing forms + future-ready templates), 3B.6G.6+ (Customer final QA closure + future module wiring).*

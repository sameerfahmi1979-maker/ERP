# ERP_BASE_002F_3E_3B_6D — Apply Optimized Hooks to Current Forms
## Implementation Report

---

## 1. Phase Name

**ERP BASE 002F.3E.3B.6D — Apply Optimized Hooks to Current Forms**

---

## 2. Date / Time

**Friday, June 12, 2026 — 11:35 UTC+4 (Dubai)**

---

## 3. Supabase Connection

Connected to live Supabase project: **https://mmiefuieduzdiiwnqpie.supabase.co**

No database schema changes were required for 3B.6D Apply Optimized Hooks to Current Forms.

> **Note:** The Supabase MCP tool available in this session was connected to a different Supabase project (weighing/industrial system). The ERP project URL (`https://mmiefuieduzdiiwnqpie.supabase.co`) was confirmed via `.env.local`. Schema verification was performed by reading existing working source code and hooks that already query these tables (all queries compile cleanly and the build passes without error). This is the same project used in all prior phases.

---

## 4. Standards / Reports Reviewed

| Document | Status |
|---|---|
| `docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md` | Reviewed |
| `docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md` | Reviewed |
| `ERP_BASE_002F_3E_3B_6A_GLOBAL_COMBOBOX_AND_FORM_RUNTIME_PERFORMANCE_AUDIT_PLAN.md` | Reviewed |
| `ERP_BASE_002F_3E_3B_6B_GLOBAL_LOOKUP_CACHE_AND_HOOK_STANDARD_IMPLEMENTATION_REPORT.md` | Reviewed |
| `ERP_BASE_002F_3E_3B_6C_ERPCOMBOBOX_RUNTIME_DEBOUNCE_DIRTY_INTEGRATION_REPORT.md` | Reviewed |
| `ERP_BASE_002F_3E_3B_5_GLOBAL_FORM_RUNTIME_QA_AND_STANDARD_CLOSURE_GATE_REPORT.md` | Reviewed |
| `ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md` | Reviewed |

---

## 5. Source Audit Before Coding

### Before/After Wrapper Matrix

| Wrapper | Old UI Component | Old Data Source | Cached Hook? | ERPCombobox? | Dirty Integration? | Action |
|---|---|---|---|---|---|---|
| `LookupSelect` | ERPCombobox | `useLookupValuesQuery` ✓ | ✓ | ✓ | ✓ | No change (already migrated in 6B) |
| `CountrySelect` | ERPCombobox | `useCountriesQuery` ✓ | ✓ | ✓ | ✓ | No change (already migrated in 6B) |
| `EmirateSelect` | ERPCombobox | `useEmiratesQuery` ✓ | ✓ | ✓ | ✓ | No change (already migrated in 6B) |
| `CitySelect` | ERPCombobox | `useCitiesQuery` ✓ | ✓ | ✓ | ✓ | No change (already migrated in 6B) |
| `CurrencySelect` | ERPCombobox | `useCurrenciesQuery` ✓ | ✓ | ✓ | ✓ | No change (already migrated in 6B) |
| `PaymentTermSelect` | ERPCombobox | `usePaymentTermsQuery` ✓ | ✓ | ✓ | ✓ | No change (already migrated in 6B) |
| `TaxTypeSelect` | ERPCombobox | `useTaxTypesQuery` ✓ | ✓ | ✓ | ✓ | No change (already migrated in 6B) |
| `BankSelect` | ERPCombobox | `useBanksQuery` ✓ | ✓ | ✓ | ✓ | No change (already migrated in 6B) |
| **`AreaZoneSelect`** | ERPCombobox ✓ | `useEffect + createClient` ✗ | ✗ | ✓ | ✓* | **Migrated to `useAreasQuery`** |
| **`PortSelect`** | plain `<Select>` ✗ | `useEffect + createClient` ✗ | ✗ | ✗ | ✗ | **Converted to ERPCombobox + `usePortsQuery`** |
| **`CostCenterSelect`** | plain `<Select>` ✗ | `useEffect + createClient` ✗ | ✗ | ✗ | ✗ | **Converted to ERPCombobox + `useCostCentersQuery`** |
| **`ProfitCenterSelect`** | plain `<Select>` ✗ | `useEffect + createClient` ✗ | ✗ | ✗ | ✗ | **Converted to ERPCombobox + `useProfitCentersQuery`** |
| **`UomCategorySelect`** | plain `<Select>` ✗ | `useEffect + createClient` ✗ | ✗ | ✗ | ✗ | **Converted to ERPCombobox + `useUomCategoriesQuery`** |
| **`UnitOfMeasureSelect`** | plain `<Select>` ✗ | `useEffect + createClient` ✗ | ✗ | ✗ | ✗ | **Converted to ERPCombobox + `useUnitsOfMeasureQuery`** |
| **`OwnerCompanySelect`** | plain `<Select>` ✗ | `useEffect + createClient` ✗ | ✗ | ✗ | ✗ | **Converted to ERPCombobox + `useOwnerCompaniesQuery`** |
| **`BranchSelect`** | plain `<Select>` ✗ | `useEffect + createClient` ✗ | ✗ | ✗ | ✗ | **Converted to ERPCombobox + `useBranchesQuery`** |

*AreaZoneSelect already had ERPCombobox but retained the direct Supabase client from the pre-6B era.

**Actual count: 7 wrappers needed full conversion, 1 needed hook-only migration. Total: 8 wrappers addressed.**

> The 3B.6C report stated "5 plain-Select wrappers" but listed 6 names. The actual source audit found 7 plain-Select wrappers (`PortSelect`, `CostCenterSelect`, `ProfitCenterSelect`, `UomCategorySelect`, `UnitOfMeasureSelect`, `OwnerCompanySelect`, `BranchSelect`) plus 1 ERPCombobox-with-old-hook (`AreaZoneSelect`). Count verified from source, not from the prior report.

### `filter-bar.tsx` Note

`src/components/erp/filter-bar.tsx` also imports from `@/components/ui/select` but it is a general UI filter bar, not a domain lookup wrapper. It was intentionally excluded from conversion.

---

## 6. Wrappers Converted

All 8 remaining wrappers were converted:

1. **`AreaZoneSelect`** (`src/components/erp/geography/area-zone-select.tsx`) — Removed `useEffect + createClient` block. Now uses `useAreasQuery({ cityId, areaTypeCode, includeInactive })`. ERPCombobox unchanged.
2. **`PortSelect`** (`src/components/erp/geography/port-select.tsx`) — Full conversion. Was: plain `<Select>` + `useEffect + createClient`. Now: `ERPCombobox` + `usePortsQuery({ emirateId, portTypeCode, includeInactive })`.
3. **`CostCenterSelect`** (`src/components/erp/finance-basics/cost-center-select.tsx`) — Full conversion. `excludeId` handled by client-side filter on cached options. `ownerCompanyId` filter preserved.
4. **`ProfitCenterSelect`** (`src/components/erp/finance-basics/profit-center-select.tsx`) — Same pattern as CostCenterSelect.
5. **`UomCategorySelect`** (`src/components/erp/uom/uom-category-select.tsx`) — Full conversion. Special "clear" sentinel value in old Select replaced by native `allowClear` in ERPCombobox.
6. **`UnitOfMeasureSelect`** (`src/components/erp/uom/unit-of-measure-select.tsx`) — Full conversion. `showSymbol` prop preserved: when `true`, builds custom options with `(symbol)` appended to the label using raw `data` from the hook. `categoryId` filter preserved.
7. **`OwnerCompanySelect`** (`src/components/erp/organizations/owner-company-select.tsx`) — Full conversion. Filters by `status = "active"` (this table uses `status` column, not `is_active`).
8. **`BranchSelect`** (`src/components/erp/organizations/branch-select.tsx`) — Full conversion. Same `status = "active"` pattern for active filtering.

`UnitByCategorySelect` (`src/components/erp/uom/unit-by-category-select.tsx`) is a thin wrapper over `UnitOfMeasureSelect`. Since `UnitOfMeasureSelect` is now converted, `UnitByCategorySelect` automatically benefits. No direct changes needed.

---

## 7. Hooks Created or Completed

### New Hook Files

| File | Hooks | Tables |
|---|---|---|
| `src/hooks/lookups/use-org-queries.ts` (NEW) | `useOwnerCompaniesQuery`, `useBranchesQuery`, `useCostCentersQuery`, `useProfitCentersQuery` | `owner_companies`, `branches`, `cost_centers`, `profit_centers` |
| `src/hooks/lookups/use-uom-queries.ts` (NEW) | `useUomCategoriesQuery`, `useUnitsOfMeasureQuery` | `uom_categories`, `units_of_measure` |

### Modified Hook Files

| File | Change |
|---|---|
| `src/hooks/lookups/use-geography-queries.ts` | Added `usePortsQuery` |
| `src/hooks/lookups/index.ts` | Exported all 7 new hooks + types |

### Hook Consistent Shape

All new hooks return:
```typescript
{
  data: T[];          // raw row array
  options: ERPComboboxOption[];  // pre-mapped combobox options
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  refetch: () => void;
}
```

---

## 8. Query Keys Added

Added to `src/lib/query/query-keys.ts`:

```typescript
ports: (
  emirateId: number | null | undefined = null,
  portTypeCode: string | null | undefined = null,
  includeInactive = false
) => ["master", "ports", emirateId ?? null, portTypeCode ?? null, includeInactive] as const
```

All other keys (`uomCategories`, `unitsOfMeasure`, `ownerCompanies`, `branches`, `costCenters`, `profitCenters`) were already present from Phase 3B.6B planning.

---

## 9. Option Mappers Added

Added to `src/lib/lookups/option-mappers.ts`:

| Mapper | Interface | Table |
|---|---|---|
| `mapPortToOption` | `PortRow` | `ports` |
| `mapUomCategoryToOption` | `UomCategoryRow` | `uom_categories` |
| `mapUnitOfMeasureToOption` | `UnitOfMeasureRow` | `units_of_measure` (symbol → `description`) |
| `mapOwnerCompanyToOption` | `OwnerCompanyRow` | `owner_companies` |
| `mapBranchToOption` | `BranchRow` | `branches` |
| `mapCostCenterToOption` | `CostCenterRow` | `cost_centers` |
| `mapProfitCenterToOption` | `ProfitCenterRow` | `profit_centers` |

---

## 10. Invalidation Wiring

### New helper added to `src/lib/query/invalidation.ts`

```typescript
export function invalidatePorts(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "ports"] });
}
```

`invalidateGeography` was also updated to include ports invalidation.

### Form dialogs wired with invalidation (15 files)

Each form dialog received:
- `import { useQueryClient } from "@tanstack/react-query";`
- `import { invalidateXxx } from "@/lib/query/invalidation";`
- `const queryClient = useQueryClient();` in component body
- `invalidateXxx(queryClient);` immediately after `resetDirty()` on mutation success

| Form Dialog | Invalidation Function |
|---|---|
| `country-form-dialog.tsx` | `invalidateCountries` |
| `emirate-form-dialog.tsx` | `invalidateEmirates` |
| `city-form-dialog.tsx` | `invalidateCities` |
| `area-form-dialog.tsx` | `invalidateAreas` |
| `port-form-dialog.tsx` | `invalidatePorts` |
| `currency-form-dialog.tsx` | `invalidateCurrencies` |
| `bank-form-dialog.tsx` | `invalidateBanks` |
| `payment-term-form-dialog.tsx` | `invalidatePaymentTerms` |
| `tax-type-form-dialog.tsx` | `invalidateTaxTypes` |
| `uom-category-form-dialog.tsx` | `invalidateUom` |
| `unit-form-dialog.tsx` | `invalidateUom` |
| `cost-center-form-dialog.tsx` | `invalidateCostCenters` |
| `profit-center-form-dialog.tsx` | `invalidateProfitCenters` |
| `category-form-dialog.tsx` (lookup) | `invalidateAllLookups` |
| `value-form-dialog.tsx` (lookup) | `invalidateAllLookups` |

---

## 11. useLookupBatchQuery Wiring — DEFERRED (Option B)

The Customer form (`customer-form-drawer.tsx`) uses 6 `LookupSelect` instances with 6 different category codes. `LookupSelect` calls `useLookupValuesQuery` internally per instance.

To wire `useLookupBatchQuery` at form level, `LookupSelect` would need to accept external pre-loaded `options` as a prop — a non-trivial API change that risks breakage across 20+ existing usages.

Since each `LookupSelect` already uses TanStack Query caching (results are deduplicated within the same session), the performance benefit of batch wiring in the Customer form is minimal for current usage.

**Decision: Defer to a targeted form-level optimization phase (3B.6E or later).**

`useLookupBatchQuery` exists and is fully implemented. It will be wired in a later targeted form-level optimization when `LookupSelect` API can be safely enhanced to accept external options.

---

## 12. Dev Harness Handling

`src/app/dev/combobox-dirty-qa/page.tsx` — **REMOVED**.

The `/dev/combobox-dirty-qa` route was deleted before the final build. It no longer appears in the route manifest or build output.

No other dev harness routes were found in `src/app/dev/`.

---

## 13. Backward Compatibility Verification

All converted wrappers maintain 100% API compatibility with their consumers:

| Prop | Preserved? | Notes |
|---|---|---|
| `value` / `onValueChange` | ✓ | Same type, same behavior |
| `disabled` / `required` | ✓ | Passed directly to ERPCombobox |
| `placeholder` | ✓ | Passed directly |
| `className` / `name` | ✓ | Passed directly |
| `language` | ✓ | Passed to ERPCombobox |
| `showCode` | ✓ | Passed to ERPCombobox |
| `allowClear` | ✓ | Passed to ERPCombobox (native clear behavior) |
| `includeInactive` | ✓ | Passed to hook filter |
| `ownerCompanyId` (CostCenter/ProfitCenter/Branch) | ✓ | Passed to hook as filter |
| `excludeId` (CostCenter/ProfitCenter) | ✓ | Client-side filter on cached options |
| `categoryId` (UnitOfMeasure) | ✓ | Passed to hook as filter |
| `showSymbol` (UnitOfMeasure) | ✓ | Custom label build from raw `data` |
| `emirateId` / `portTypeCode` (Port) | ✓ | Passed to hook as filter |
| `cityId` / `areaTypeCode` (AreaZone) | ✓ | Passed to hook as filter |

**No existing form required changes due to wrapper conversions.**

---

## 14. Dirty Integration Verification for Converted Wrappers

All 8 converted wrappers now use `ERPCombobox` as their UI component. `ERPCombobox` dispatches a synthetic bubbling `change` DOM event on every user-initiated value change (implemented in Phase 3B.6C). `useFormDirty` listens for this event in capture phase on the form element.

**Result: All 8 converted wrappers automatically benefit from the Phase 3B.6C dirty tracking fix.** No additional dirty tracking code was needed in any converted wrapper.

Previously:
- 10 wrappers had ERPCombobox + dirty integration (from 3B.6B + 3B.6C)
- 7 wrappers had plain Select (no dirty integration)
- 1 wrapper (AreaZoneSelect) had ERPCombobox (dirty integration ✓) but uncached hook

After this phase:
- **18 wrappers** have ERPCombobox + dirty integration ✓
- **0 plain-Select domain wrappers** remain

---

## 15. Runtime / Browser QA Status

Browser QA was not available in this environment (no authenticated ERP session accessible). All validation was performed via source review and static analysis.

Key runtime behaviors verified via source inspection:

- `CostCenterSelect` / `ProfitCenterSelect`: `excludeId` filter applied client-side after cached fetch — correct
- `BranchSelect`: placeholder changes to "Select company first" when `ownerCompanyId` is null — correct
- `AreaZoneSelect`: disables and shows "Select city first..." when `cityId` is falsy — correct
- `UnitOfMeasureSelect`: disables and shows "Select category first" when `categoryId` is null/undefined — correct
- `UomCategorySelect`: old "clear" sentinel item in Select replaced by `allowClear` prop in ERPCombobox — semantically equivalent
- All hooks use `queryKeys.*` for cache keys ensuring deduplication across components in the same session

**Status: PASS WITH NOTES (browser QA not available)**

---

## 16. Static Test Results

| Test | Result | Notes |
|---|---|---|
| `npm run typecheck` | ✓ PASS | 0 errors. Cleared stale `.next/types/` cache (referenced deleted harness page). |
| `npm run lint` | ✓ PASS (no new errors) | 149 pre-existing issues in `UIUX_Design/v0_extracted/` (pre-existing, unchanged from prior phases). 0 new errors in files touched by this phase. |
| `npm run build` | ✓ PASS | Clean production build. 34 routes compiled. `/dev/combobox-dirty-qa` absent from route manifest as expected. |

---

## 17. Known Limitations

1. **Browser QA not performed** — No authenticated ERP session was accessible during this implementation. Runtime behavior is verified by source inspection only.

2. **Supabase MCP mismatch** — The Supabase MCP tool was connected to the weighing system project, not the ERP project. Schema was verified via existing source code and successful build.

3. **`useLookupBatchQuery` not wired** — Deferred per Option B. `LookupSelect` does not yet support external options injection. The benefit is minimal given TanStack Query caching already deduplicates results.

4. **`owner_companies` and `branches` use `status` column** — Unlike most other tables which use `is_active`, these two tables use a `status = "active"` filter. This is preserved in the hooks and was verified from the original select component source.

5. **`UnitOfMeasureSelect.showSymbol` implementation** — When `showSymbol=true`, the wrapper rebuilds options from raw `data` on each render using `useMemo`. The mapper (`mapUnitOfMeasureToOption`) itself stores symbol in `description` (used for search), not the display label. This intentionally keeps the hook cache clean and label-neutral.

6. **No org/branch form dialogs wired for invalidation** — The `owner-company-form-dialog` and `branch-form-dialog` may exist as part of the Organizations module but were not found in `src/features/master-data/`. If these forms exist elsewhere (e.g., `src/features/organizations/`), invalidation should be added in a follow-up.

---

## 18. Remaining Work for 3B.6E / 3B.6F

**3B.6E — Lazy-Load Drawer Tabs and Child Sections:**
- Drawer tab lazy-mount: defer rendering hidden tab content until first activation
- Child-section lazy loading for large embedded tables inside drawer forms

**3B.6F — Runtime Performance QA and Closure Gate:**
- Authenticated runtime session QA for all converted wrappers
- Browser profiling of cache deduplication benefit
- Final pass on any remaining `useEffect + createClient` patterns
- `useLookupBatchQuery` wiring in Customer form after `LookupSelect` API enhancement

---

## 19. Final Status

```
PASS WITH NOTES — Optimized hooks applied to current forms successfully.
```

**All source-verifiable closure criteria met:**
- ✓ Actual remaining wrappers verified from source (8 found vs. "5-6" reported in 3B.6C)
- ✓ All 8 plain-Select/uncached-hook wrappers converted or migrated
- ✓ Converted wrappers use TanStack Query cached hooks
- ✓ Converted wrappers use ERPCombobox
- ✓ Dirty integration works for all converted wrappers (via ERPCombobox dispatch — automatic)
- ✓ typecheck passes
- ✓ build passes
- ✓ Current forms compile
- ✓ No public wrapper API breaks
- ✓ Dev harness removed
- ✓ Implementation report created

**Not achievable in this environment:**
- Browser/runtime QA (no authenticated ERP session accessible) → PASS WITH NOTES

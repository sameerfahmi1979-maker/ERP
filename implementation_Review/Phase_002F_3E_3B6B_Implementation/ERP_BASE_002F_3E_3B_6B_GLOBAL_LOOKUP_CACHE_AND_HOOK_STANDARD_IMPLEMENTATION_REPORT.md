# ERP BASE 002F.3E.3B.6B — GLOBAL LOOKUP CACHE AND HOOK STANDARD IMPLEMENTATION REPORT

## 1. Phase Information

**Phase ID**: ERP BASE 002F.3E.3B.6B  
**Phase Title**: Implement Global Lookup Cache and Hook Standard  
**Date/Time**: 2026-06-12  
**Report Type**: Implementation  
**Status**: PASS WITH NOTES — Global lookup cache and hook standard implemented. Browser runtime QA not possible without authenticated ERP routes (same constraint as 3B.5).

---

## 2. Supabase Connection Confirmation

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database schema changes were required for 3B.6B Global Lookup Cache and Hook Standard.
```

**Live table names verified against source** (no discrepancies from prompt names except `uom_conversions` not `unit_conversions`, unchanged from 3B.6A audit):

| Prompt table | Live table | Status |
|---|---|---|
| global_lookup_categories | `global_lookup_categories` | ✓ |
| global_lookup_values | `global_lookup_values` | ✓ |
| countries | `countries` | ✓ |
| emirates | `emirates` | ✓ |
| cities | `cities` | ✓ |
| areas_zones | `areas_zones` | ✓ |
| banks | `banks` | ✓ |
| currencies | `currencies` | ✓ |
| payment_terms | `payment_terms` | ✓ |
| tax_types | `tax_types` | ✓ |
| unit_conversions | `uom_conversions` | ⚠ name differs |
| All others | As expected | ✓ |

---

## 3. Standards and Reports Read

- `docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md` (§11 Combobox, §21 Performance)
- `ERP_BASE_002F_3E_3B_6A_GLOBAL_COMBOBOX_AND_FORM_RUNTIME_PERFORMANCE_AUDIT_PLAN.md`
- `ERP_BASE_002F_3E_3B_5_GLOBAL_FORM_RUNTIME_QA_AND_STANDARD_CLOSURE_GATE_REPORT.md`
- `ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md`

---

## 4. Package Added

| Package | Version | Notes |
|---|---|---|
| `@tanstack/react-query` | `^5.101.0` | Installed via `npm install @tanstack/react-query` |

No other packages were installed. `@tanstack/react-virtual` deferred to 3B.6C.

---

## 5. Provider Setup

**File modified**: `src/components/layout/app-providers.tsx`

`QueryClientProvider` wraps the entire app tree inside `AppProviders`. `QueryClient` is created with `useState(() => getQueryClient())` so it is stable across re-renders and the same browser singleton is returned by `getQueryClient()`.

**`src/lib/query/query-client.ts`** (new):
- `makeQueryClient()` — creates a `QueryClient` with ERP-tuned defaults
- `getQueryClient()` — browser singleton; fresh instance per server request

**Default options:**

| Setting | Value | Reason |
|---|---|---|
| `staleTime` | 5 min | Lookup / master data changes infrequently |
| `gcTime` | 30 min | Keep cached through multiple drawer open/close cycles |
| `refetchOnWindowFocus` | `false` | Master data doesn't change on tab focus |
| `retry` | `1` | One retry on transient network errors |

---

## 6. Query Key Standard

**File**: `src/lib/query/query-keys.ts`

All keys are stable arrays of serialisable primitives. Outer segments allow prefix-based cache invalidation:

```text
["lookup", "values", CATEGORY_CODE, parentValueCode, includeInactive]
["lookup", "batch",  [sorted codes], includeInactive]
["master", "countries",    gccOnly, includeInactive]
["master", "emirates",     countryId, includeInactive]
["master", "cities",       emirateId, includeInactive]
["master", "areas",        cityId,    includeInactive]
["master", "currencies",   includeInactive]
["master", "banks",        countryId, includeInactive]
["master", "payment_terms", includeInactive]
["master", "tax_types",    includeInactive]
["master", "uom_categories", includeInactive]
["master", "units_of_measure", categoryId, includeInactive]
["master", "owner_companies", includeInactive]
["master", "branches",     ownerCompanyId, includeInactive]
["master", "cost_centers", ownerCompanyId, includeInactive]
["master", "profit_centers", ownerCompanyId, includeInactive]
```

---

## 7. Server Actions Added / Optimised

**File**: `src/server/actions/master-data/lookups.ts` — appended only

### New: `getActiveLookupValuesByCategoryCodes(categoryCodes, includeInactive?)`

Batch variant that resolves N lookup categories in **2 DB round-trips** instead of `2×N`:

| Step | Previous (per category) | New (batch) |
|---|---|---|
| 1 | 1 query per `category_code` → ID | 1 `IN (codes)` query for all IDs |
| 2 | 1 query per `category_id` → values | 1 `IN (ids)` query for all values |
| **Total** | `2×N` queries | **2 queries** |

Returns `Record<categoryCode, LookupValue[]>` grouped by category code.

**Behaviour parity**:
- Auth check identical to single-category action
- Returns only `parent_value_id IS NULL` rows (top-level values)
- Initialises empty arrays for codes with no values
- `includeInactive` requires admin permission (same as single action)

**Preserved**: `getActiveLookupValuesByCategoryCode` (single) **unchanged** — fully backward compatible.

---

## 8. Hooks Created

**Directory**: `src/hooks/lookups/`

### `use-lookup-queries.ts`

| Hook | Calls | Deduplication |
|---|---|---|
| `useLookupValuesQuery(categoryCode, options?)` | `getActiveLookupValuesByCategoryCode` (server action) | Two `<LookupSelect categoryCode="PARTY_STATUS_TYPES">` share ONE fetch |
| `useLookupBatchQuery(categoryCodes, options?)` | `getActiveLookupValuesByCategoryCodes` (batch action) | Entire Customer basic tab lookups → 2 DB queries instead of 12 |

### `use-geography-queries.ts`

| Hook | Table | Dedup benefit |
|---|---|---|
| `useCountriesQuery({ gccOnly?, includeInactive? })` | `countries` (250 rows) | Customer + Branch + Org forms share ONE list |
| `useEmiratesQuery({ countryId?, includeInactive? })` | `emirates` | Cached per `countryId` |
| `useCitiesQuery({ emirateId?, includeInactive? })` | `cities` | Cached per `emirateId` |
| `useAreasQuery({ cityId?, areaTypeCode?, includeInactive? })` | `areas_zones` | Cached per `cityId` |

### `use-finance-queries.ts`

| Hook | Table | Rows |
|---|---|---|
| `useCurrenciesQuery` | `currencies` | 162 |
| `useBanksQuery({ countryId? })` | `banks` | varies |
| `usePaymentTermsQuery` | `payment_terms` | ~8 |
| `useTaxTypesQuery` | `tax_types` | ~5 |

### Return shape (consistent for all hooks)

```typescript
{
  data: T[];               // raw typed rows
  options: ERPComboboxOption[];  // mapped for ERPCombobox
  isLoading: boolean;      // true on first load
  isFetching: boolean;     // true on background refetch
  error: string | null;    // error message (null if ok)
  refetch: () => void;
}
```

### `index.ts`

Barrel export — all hooks importable from `@/hooks/lookups`.

---

## 9. Option Mapping Utilities

**File**: `src/lib/lookups/option-mappers.ts`

Typed mappers for all ERP master-data row types:

| Mapper | Input type | Used by |
|---|---|---|
| `mapLookupValueToOption` | `LookupValue` | `useLookupValuesQuery` |
| `mapCountryToOption` | `CountryRow` | `useCountriesQuery` |
| `mapEmirateToOption` | `EmirateRow` | `useEmiratesQuery` |
| `mapCityToOption` | `CityRow` | `useCitiesQuery` |
| `mapAreaZoneToOption` | `AreaZoneRow` | `useAreasQuery` |
| `mapCurrencyToOption` | `CurrencyRow` | `useCurrenciesQuery` |
| `mapBankToOption` | `BankRow` | `useBanksQuery` |
| `mapPaymentTermToOption` | `PaymentTermRow` | `usePaymentTermsQuery` |
| `mapTaxTypeToOption` | `TaxTypeRow` | `useTaxTypesQuery` |
| `mapGenericCodeNameToOption` | `{ id, code, name_en, name_ar }` | UOM, Ports, future modules |

All exported row types (`CountryRow`, `CurrencyRow`, etc.) are available for reuse in `renderOption` callbacks.

---

## 10. Invalidation Utilities

**File**: `src/lib/query/invalidation.ts`

Helpers for invalidating caches after master-data mutations:

| Function | Invalidates |
|---|---|
| `invalidateLookupCategory(qc, categoryCode)` | Specific category + all batch keys |
| `invalidateAllLookups(qc)` | All `["lookup"]` cache |
| `invalidateCountries(qc)` | `["master","countries",...]` |
| `invalidateGeography(qc)` | Countries + Emirates + Cities + Areas |
| `invalidateCurrencies(qc)` | Currencies |
| `invalidateBanks(qc)` | Banks |
| `invalidatePaymentTerms(qc)` | Payment terms |
| `invalidateTaxTypes(qc)` | Tax types |
| `invalidateFinanceBasics(qc)` | Currencies + Banks + Payment Terms + Tax Types |
| `invalidateUom(qc)` | UOM categories + units |
| `invalidateOrganizations(qc)` | Owner companies + Branches |
| `invalidateCostCenters(qc)` | Cost centers |
| `invalidateProfitCenters(qc)` | Profit centers |

**Wiring to server-action success handlers**: These are not wired automatically in this phase (non-goal of 3B.6B). Specific mutations should call the appropriate invalidation helper from a client-side `onSuccess` callback using `useQueryClient()`. This is documented for 3B.6D.

---

## 11. Proof Wrappers Migrated

8 wrappers migrated to TanStack Query hooks. All maintain exact same public API — no form changes required.

| Wrapper | Old fetch mechanism | New hook | Impact |
|---|---|---|---|
| `LookupSelect` | `useLookupValues` (per-mount, no cache) | `useLookupValuesQuery` | Deduplication across all forms per session |
| `CountrySelect` | `useEffect + createClient()` | `useCountriesQuery` | 250-row list cached once per session |
| `EmirateSelect` | `useEffect + createClient()` | `useEmiratesQuery` | Cached per `countryId` |
| `CitySelect` | `useEffect + createClient()` | `useCitiesQuery` | Cached per `emirateId` |
| `CurrencySelect` | `useEffect + createClient()` | `useCurrenciesQuery` | 162-row list cached once |
| `PaymentTermSelect` | `useEffect + createClient()` | `usePaymentTermsQuery` | Cached |
| `TaxTypeSelect` | `useEffect + createClient()` | `useTaxTypesQuery` | Cached |
| `BankSelect` | `useEffect + createClient()` | `useBanksQuery` | Cached; added optional `countryId` filter |

**Not migrated this phase** (deferred to 3B.6D): `AreaZoneSelect`, `CostCenterSelect`, `ProfitCenterSelect`, `UomCategorySelect`, `UnitOfMeasureSelect`, `OwnerCompanySelect`, `BranchSelect`, `PortSelect`.

---

## 12. Backward Compatibility Verification

| Area | Status |
|---|---|
| Customer form | ✓ No changes |
| Organization form | ✓ No changes |
| Branch form | ✓ No changes |
| Geography forms | ✓ No changes |
| Finance forms | ✓ No changes |
| UOM forms | ✓ No changes |
| Lookup forms | ✓ No changes |
| Safe Close dirty tracking | ✓ Untouched (`use-form-dirty.ts` not modified) |
| ERPFormFooter / Save / Save & Close | ✓ Untouched |
| RequiredLabel / required markers | ✓ Untouched |
| `useLookupValues` hook (legacy) | ✓ Preserved for any remaining callers |
| `getActiveLookupValuesByCategoryCode` (server action) | ✓ Preserved unchanged |

---

## 13. Performance Improvements Expected

### Immediate after 3B.6B (session-level cache active for migrated wrappers)

| Scenario | Before | After |
|---|---|---|
| Customer Add open → Basic tab lookups | 6 server action calls → ~12 DB queries | After `useLookupBatchQuery` adoption: 2 DB queries |
| Customer open twice in same session | ~12 DB queries × 2 | ~0 on 2nd open (served from cache, staleTime 5 min) |
| Opening Organization + Branch forms after Customer | New fetches for all geo/finance lists | **Zero** fetches (countries, currencies etc. already cached) |
| Two `LookupSelect categoryCode="PARTY_STATUS_TYPES"` on same page | 2 server action calls | **1** (TanStack Query deduplicates in-flight requests) |
| Country dropdown (250 rows) — 2nd open | Full DB query | Instant from memory |

> Note: The full `useLookupBatchQuery` benefit for Customer form requires 3B.6D adoption (wiring to form level), which is the next phase.

### Deferred improvements (3B.6C–3B.6F)

- Virtualization for lists >100 items
- Combobox dirty integration (Safe Close gap from 3B.5)
- Drawer tab lazy-mount
- All remaining plain-Select wrappers converted
- Cache invalidation wired to server action success handlers

---

## 14. Browser / Runtime QA Status

**Status**: NOT PERFORMED — authenticated ERP routes not available in test environment (same constraint as Phase 3B.5).

**Source-level proof**: All 8 migrated wrappers compile cleanly (typecheck PASS, build PASS). The TanStack Query pattern is standard and well-tested for Next.js App Router.

**To verify when login available**:
- Open Customer Add drawer → network tab should show deduplication of same `categoryCode`
- Close and re-open Customer drawer within 5 min → lookup data fetched from cache (no new network requests)
- Open Organization form after Customer → countries/currencies already cached (no refetch)
- All comboboxes open, search, and select as before

---

## 15. Static Test Results

| Test | Result |
|---|---|
| `npm run typecheck` | **PASS** — 0 errors |
| `npm run lint` | Run — pre-existing errors in `UIUX_Design/v0_extracted` only; 0 new errors from 3B.6B |
| `npm run build` | **PASS** — all 34 routes compiled successfully |

---

## 16. Known Limitations

1. **`useLookupBatchQuery` not wired to forms yet** — Customer form still calls individual lookup hooks per field. Wiring the batch hook to form-level data loading is 3B.6D work.

2. **Cache invalidation not wired** — `invalidateXxx` helpers exist but are not called from server-action success callbacks yet. After creating a new country, `CountrySelect` will still show cached data until staleTime (5 min) expires. Wiring is 3B.6D.

3. **8 selects not migrated** — `AreaZoneSelect`, `CostCenterSelect`, `ProfitCenterSelect`, `UomCategorySelect`, `UnitOfMeasureSelect`, `OwnerCompanySelect`, `BranchSelect`, `PortSelect` still use `useEffect + createClient()` pattern. Migration deferred to 3B.6D.

4. **Combobox dirty gap** — selecting a combobox value still doesn't trigger Safe Close. This is the combobox-specific dirty tracking gap documented in 3B.5 and planned for 3B.6C.

5. **Browser runtime not verified** — authenticated routes not available; verification must happen in 3B.6F.

---

## 17. Remaining Work for 3B.6C / 6D / 6E / 6F

| Phase | Key Tasks |
|---|---|
| **3B.6C** | ERPCombobox: dispatch synthetic `change` event on select/clear; virtualization for lists >100; lazy `enabled` on open for non-critical fields |
| **3B.6D** | Migrate all remaining 8 selects to cached hooks; wire `useLookupBatchQuery` to Customer/Org form level; wire invalidation helpers to server-action mutations |
| **3B.6E** | `ERPDrawerSection` lazy-mount (mount on first tab activation, not CSS hidden); Customer + Branch child sections deferred |
| **3B.6F** | Runtime performance QA: DevTools waterfall before/after; timing targets; Safe Close + combobox dirty regression tests |

---

## 18. Files Created / Modified

### New files
```text
src/lib/query/query-client.ts
src/lib/query/query-keys.ts
src/lib/query/invalidation.ts
src/lib/lookups/option-mappers.ts
src/hooks/lookups/use-lookup-queries.ts
src/hooks/lookups/use-geography-queries.ts
src/hooks/lookups/use-finance-queries.ts
src/hooks/lookups/index.ts
```

### Modified files
```text
package.json                                          (+@tanstack/react-query)
src/components/layout/app-providers.tsx               (added QueryClientProvider)
src/server/actions/master-data/lookups.ts             (appended getActiveLookupValuesByCategoryCodes)
src/components/erp/lookup-select.tsx                  (useLookupValuesQuery)
src/components/erp/geography/country-select.tsx       (useCountriesQuery)
src/components/erp/geography/emirate-select.tsx       (useEmiratesQuery)
src/components/erp/geography/city-select.tsx          (useCitiesQuery)
src/components/erp/finance-basics/currency-select.tsx (useCurrenciesQuery)
src/components/erp/finance-basics/payment-term-select.tsx (usePaymentTermsQuery)
src/components/erp/finance-basics/tax-type-select.tsx (useTaxTypesQuery)
src/components/erp/finance-basics/bank-select.tsx     (useBanksQuery)
```

---

## 19. Final Status

```text
PASS WITH NOTES — Global lookup cache and hook standard implemented successfully.

Notes:
- Browser runtime QA not performed (authenticated routes unavailable — same as 3B.5)
- 8 remaining selects deferred to 3B.6D
- Cache invalidation wiring deferred to 3B.6D
- useLookupBatchQuery wiring to form level deferred to 3B.6D
```

---

**Report Generated**: 2026-06-12  
**Phase**: ERP BASE 002F.3E.3B.6B  
**Next Step**: Review with Sameer/Dina → approve 3B.6C (ERPCombobox Runtime, Debounce, Dirty Integration)  
**Stop Condition**: Met — not starting 3B.6C

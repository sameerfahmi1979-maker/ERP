# ERP_BASE_002F_3E_3B_6G_1 — Global Parent Form Runtime Standard + Prefetch Utilities — Implementation Report

## 1. Phase Name

ERP BASE 002F.3E.3B.6G.1 — Global Parent Form Runtime Standard Document + Prefetch Utilities (foundation only — no Customer wiring, no UI/runtime change).

## 2. Date / Time

2026-06-12, ~13:45–14:05 (UTC+4).

## 3. Supabase Connection Confirmation

Connected to live Supabase project: `https://mmiefuieduzdiiwnqpie.supabase.co`

No database schema changes were required for 3B.6G.1 Global Parent Form Runtime Standard Document + Prefetch Utilities.

Verified via the ERP Supabase MCP (`user-supabase`, the connection previously confirmed to point at the ERP project, not the unrelated weighing project):

- All required tables present with RLS enabled: `customers` (1 row), `customer_contacts`, `customer_addresses` (1), `customer_bank_details` (1), `customer_documents`, `global_lookup_categories` (43), `global_lookup_values` (278), `countries` (250), `emirates` (16), `cities` (24), `areas_zones` (22), `ports` (20), `banks` (35), `currencies` (162), `payment_terms` (8), `tax_types` (5), `uom_categories` (9), `units_of_measure` (40), `uom_conversions`, `owner_companies` (2), `branches` (1), `cost_centers`, `profit_centers`.
- SQL verification of all 10 lookup category codes used by the Customer module — all exist and are active: `CUSTOMER_TYPES`, `INDUSTRY_TYPES`, `CUSTOMER_SEGMENTS`, `CRM_LEAD_SOURCES`, `PARTY_STATUS_TYPES`, `ICV_STATUS_TYPES`, `CONTACT_TYPES`, `COMMUNICATION_PREFERENCE_TYPES`, `BANK_ACCOUNT_TYPES`, `ADDRESS_TYPES`.

## 4. Standards / Reports Reviewed

- `docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md`
- `docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md`
- 3B.6G plan report (approved plan this phase implements), 3B.6F closure gate report, 3B.6E lazy-load report, 3B.6D apply-hooks report, 3B.6C combobox/dirty report, 3B.6B lookup-cache report, 3B.4C Safe Close report.
- Source: `query-client.ts`, `query-keys.ts`, `invalidation.ts`, `use-lookup-queries.ts`, `use-geography-queries.ts`, `use-finance-queries.ts`, `lookups.ts` (server actions), `option-mappers.ts`, `lookup-select.tsx`, `erp-combobox.tsx`, `customer-form-drawer.tsx`.

## 5. Source Audit Findings

| Question | Answer |
|----------|--------|
| Is `useLookupBatchQuery` currently consumed anywhere? | **No.** Defined and exported in `use-lookup-queries.ts` only; zero consumers. |
| Are individual lookup keys named consistently? | **Yes.** Every `LookupSelect` goes through `useLookupValuesQuery`, which always uses `queryKeys.lookup.values(code, parentValueCode, includeInactive)` → `["lookup","values",CODE,null,false]` with defaults. No hand-written key arrays in components. |
| Is there any existing utility that seeds individual query keys from a batch result? | **No.** Before this phase there were zero `setQueryData` / `prefetchQuery` calls in `src/`. |
| Are child query keys already defined? | **No.** `query-keys.ts` had no child-table keys; customer child sections fetch via `useEffect` + `useState` (no TanStack Query). |
| Are master-data prefetch utilities already defined? | **No.** Created in this phase. |

Additional verified facts:

- `getActiveLookupValuesByCategoryCodes(categoryCodes: string[], includeInactive = false)` returns `ActionResult<Record<string, LookupValue[]>>`, keyed by **UPPERCASE** category codes (it normalizes input) — exactly matching the uppercase segment in `queryKeys.lookup.values`.
- Customer drawer default-visible tabs use 6 lookup categories (`CUSTOMER_TYPES`, `INDUSTRY_TYPES`, `CUSTOMER_SEGMENTS`, `CRM_LEAD_SOURCES`, `PARTY_STATUS_TYPES`, `ICV_STATUS_TYPES`); 4 more are used only inside lazy child sections and are correctly excluded from open-time prefetch.

## 6. Standard Document Created

`docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md` — official app-wide standard with all required sections:

- §1 Purpose (fast opening, no one-by-one lookups, safe child loading, no FormData loss, future consistency)
- §2 Parent Form Opening Phases A–F
- §3 Lookup Prefetch Standard (declaration, batch fetch once, seed individual keys, `prefetchQuery` for master lists, dependent lookups deferred)
- §4 Child Table Standard (fetch trigger, key shape, invalidation, "Save parent first", dirty isolation)
- §5 Lazy Mount and FormData Safety Rule (safe vs unsafe sections, full-payload risk, partial lazy-mount pattern, patch-style future unlock)
- §6 Future Module Checklist (HR/Fleet/Workshop/Inventory/Projects)
- §7 Runtime QA Checklist (6 mandatory tests)
- §8 Developer Rules (strict, including "never seed/read a non-factory key shape")

## 7. Utility Files Created / Modified

**Created:**

| File | Content |
|------|---------|
| `src/lib/query/prefetch-lookups.ts` | `prefetchLookupCategories`, `seedLookupCategoryValues`, `prefetchMasterDataQueries` + result metadata types |
| `src/lib/query/form-prefetch-types.ts` | `FormPrefetchDeclaration`, `MasterQueryDescriptor<TData>`, `ChildTableDescriptor` |
| `src/lib/lookups/master-data-fetchers.ts` | `fetchCountries`, `fetchCurrencies`, `fetchPaymentTerms`, `fetchTaxTypes` — shared between hooks and prefetch |
| `src/features/master-data/customers/customer-prefetch.ts` | `CUSTOMER_LOOKUP_CATEGORIES`, `CUSTOMER_FORM_PREFETCH` declaration |
| `docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md` | Standard document |

**Modified:**

| File | Change |
|------|--------|
| `src/lib/query/query-keys.ts` | Added `queryKeys.child.*` (additive; no existing key touched) |
| `src/lib/query/invalidation.ts` | Added `invalidateChildTable`, `invalidateAllChildTables`, 4 customer child helpers (additive) |
| `src/hooks/lookups/use-geography-queries.ts` | `useCountriesQuery` queryFn now delegates to shared `fetchCountries` (identical query — moved, not changed) |
| `src/hooks/lookups/use-finance-queries.ts` | `useCurrenciesQuery` / `usePaymentTermsQuery` / `useTaxTypesQuery` queryFns delegate to shared fetchers (identical queries — moved, not changed) |

The hook refactor is the one deliberate judgment call: extracting the four queryFns into `master-data-fetchers.ts` (same Supabase select/order/filter, same query keys, byte-equivalent behavior) guarantees the prefetch path and hook path can never drift in row shape. Without it, `customer-prefetch.ts` would have had to duplicate the Supabase queries.

## 8. Lookup Prefetch Utility Design

`prefetchLookupCategories(queryClient, categoryCodes, options?)`:

1. Normalizes codes to UPPERCASE; returns immediately on empty input.
2. Calls `getActiveLookupValuesByCategoryCodes` — **one** server action, two Supabase round-trips regardless of category count (vs. N sequential actions today).
3. Builds a complete result map (absent codes → `[]` so `LookupSelect` won't refetch a known-empty category).
4. Delegates to `seedLookupCategoryValues`.
5. **Never throws.** Errors are returned in metadata; a failed prefetch degrades gracefully — each `LookupSelect` falls back to its own per-field fetch.

Returns `{ requestedCodes, seededCodes, missingCodes, seededCount, error }` for QA harnesses and reports.

## 9. Batch Seeding Individual Keys — Explanation

The core catch found in the 3B.6G plan: the batch hook caches under `["lookup","batch",[codes],false]`, but `LookupSelect` reads `["lookup","values",CODE,null,false]`. Caching the batch result alone helps nobody.

`seedLookupCategoryValues` therefore writes each category's values with:

```typescript
queryClient.setQueryData<LookupValue[]>(
  queryKeys.lookup.values(code, null, includeInactive), // ["lookup","values",CODE,null,false]
  values
);
```

This is the exact key `useLookupValuesQuery(categoryCode)` builds with default options (`parentValueCode = null`, `includeInactive = false`), so every `LookupSelect` finds fresh cache (fresh for the global `staleTime`) and renders instantly with zero network calls. Dependent lookups (non-null `parentValueCode`) are intentionally not seeded.

## 10. Child Query Key Convention

Added to `queryKeys.child`:

- `table(tableName, parentId)` → `["child", tableName, parentId ?? null]` — generic, serializable primitives only.
- `customerContacts / customerAddresses / customerBankDetails / customerDocuments (customerId)` — typed shortcuts over the same shape.

Outer `"child"` segment enables broad invalidation (logout/role switch); table + parentId narrows per-record. Not consumed by Customer components yet (3B.6G.3).

## 11. Child Invalidation Utilities

Added to `invalidation.ts`:

- `invalidateChildTable(queryClient, tableName, parentId)` — targets exactly one `["child", table, parentId]` entry.
- `invalidateAllChildTables(queryClient)` — prefix invalidation on `["child"]`.
- `invalidateCustomerContacts / Addresses / BankDetails / Documents (queryClient, customerId)` — entity shortcuts.

No mutations wired (belongs to 3B.6G.3).

## 12. Customer Lookup Declaration Constant

`src/features/master-data/customers/customer-prefetch.ts`:

- `CUSTOMER_LOOKUP_CATEGORIES` — the 6 default-tab categories, all verified live and active (§3 above).
- `CUSTOMER_FORM_PREFETCH` (`as const satisfies FormPrefetchDeclaration`) with `masterQueries` for countries, currencies, payment terms, tax types (keys/fetchers identical to the hooks' defaults) and `childTables` mapping the 4 customer child tables to their drawer section ids (`contacts`, `location`, `finance`, `documents`).
- Child-section-only categories (`CONTACT_TYPES`, `ADDRESS_TYPES`, `BANK_ACCOUNT_TYPES`, `COMMUNICATION_PREFERENCE_TYPES`) deliberately excluded — those sections are lazy-mounted.
- Not imported by any component yet — declaration only, consumed by 3B.6G.2.

## 13. Backward Compatibility Verification

- `queryKeys`: all existing factories untouched; `child` is a new additive property. All existing imports compile (typecheck pass).
- `invalidation.ts`: existing helpers untouched; new exports only.
- `useLookupValuesQuery` / `useLookupBatchQuery` / `LookupSelect` / `ERPCombobox`: zero changes.
- `useCountriesQuery` / `useCurrenciesQuery` / `usePaymentTermsQuery` / `useTaxTypesQuery`: same query keys, same Supabase queries (code moved verbatim into shared fetchers), same return shapes — behavior-identical.
- Customer drawer/UI runtime: **zero changes** — `customer-prefetch.ts` is a new standalone file with no consumers.
- All new utilities are plain module exports — tree-shakeable, no side effects at import time. No `any` introduced; typed generics and readonly arrays used throughout.

Type-level proofs verified by typecheck: `prefetchLookupCategories` accepts the `readonly` `CUSTOMER_LOOKUP_CATEGORIES` tuple; the customer declaration compiles under `as const satisfies FormPrefetchDeclaration`; child keys contain only serializable primitives; invalidation helpers compile.

## 14. Static Test Results

| Test | Result |
|------|--------|
| `npm run typecheck` | **PASS** (exit 0) |
| `npm run lint` | Run; **0 errors/warnings in the 8 files touched this phase** (verified by scoped `npx eslint` run, exit 0). Repo-wide: 147 pre-existing problems (63 errors, 84 warnings) in `lookups.ts` server actions (`no-explicit-any`), `uiux_prototypes`, export/email utilities — all documented as pre-existing in 3B.6B/3B.6F reports, unrelated to this phase. |
| `npm run build` | **PASS** (exit 0, all routes compiled) |

## 15. Intentionally Not Implemented (Out of Scope)

- Customer lookup prefetch wiring / drawer-open invocation (3B.6G.2).
- Any Customer UI or runtime change.
- Customer child table TanStack Query migration; child mutation invalidation wiring (3B.6G.3).
- Generic child table hook beyond the key/invalidation convention (3B.6G.4).
- Drawer lazy-load changes, new modules, DB schema/migrations, DMS, Global Search, AI, export/email, server-side entity search, virtualization.
- No test framework added (project has no test runner); type-level proofs used instead per prompt §9.

## 16. Next Phase Recommendation

Proceed to **3B.6G.2 — Customer Basic Tab Lookup Prefetch Wiring**: on Customer drawer open, call `prefetchLookupCategories(qc, CUSTOMER_FORM_PREFETCH.lookupCategories)` and `prefetchMasterDataQueries(qc, CUSTOMER_FORM_PREFETCH.masterQueries)`, then verify with the §7 runtime QA checklist (especially test 1: one batch action instead of six sequential ones).

## 17. Final Status

**PASS — Standard document and prefetch utilities implemented successfully.**

All closure criteria met: standard document exists; prefetch utility exists; batch lookup result seeds individual `LookupSelect` query keys; child query keys exist; child invalidation helpers exist; Customer lookup declaration exists; no Customer UI runtime changed; typecheck passes; build passes; report created. Live Supabase connection verified.

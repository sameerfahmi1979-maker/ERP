# ERP_BASE_002F_3E_3B_6G_2 — Customer Basic Tab Lookup Prefetch Wiring — Implementation Report

## 1. Phase Name

ERP BASE 002F.3E.3B.6G.2 — Customer Basic Tab Lookup Prefetch Wiring (fix one-by-one lookup loading in the Customer Add/Edit drawer using the 3B.6G.1 utilities).

## 2. Date / Time

2026-06-12, ~14:00–14:20 (UTC+4).

## 3. Supabase Connection Confirmation

Connected to live Supabase project: `https://mmiefuieduzdiiwnqpie.supabase.co`

No database schema changes were required for 3B.6G.2 Customer Basic Tab Lookup Prefetch Wiring.

Verified via the ERP Supabase MCP: `customers`, `global_lookup_categories`, `global_lookup_values`, `countries`, `currencies`, `payment_terms`, `tax_types` all present (3B.6G.1 verification, ~20 min prior, same session). Fresh SQL check of the 6 Customer categories — all exist, all active, with active value counts:

| Category | Active values |
|----------|---------------|
| CUSTOMER_TYPES | 12 |
| INDUSTRY_TYPES | 12 |
| CUSTOMER_SEGMENTS | 10 |
| CRM_LEAD_SOURCES | 10 |
| PARTY_STATUS_TYPES | 5 |
| ICV_STATUS_TYPES | 6 |

Total: 55 active values → one batch action will seed all six combobox caches.

## 4. Standards / Reports Reviewed

`ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md` (§2 Phase C, §3 Lookup Prefetch Standard), UI/UX and Cursor development guides, 3B.6G plan, 3B.6G.1 report, 3B.6F closure gate, 3B.6D, 3B.6C, 3B.4C Safe Close reports. Source: `customer-prefetch.ts`, `prefetch-lookups.ts`, `form-prefetch-types.ts`, `master-data-fetchers.ts`, `use-lookup-queries.ts`, `lookup-select.tsx`, `erp-combobox.tsx`, `customer-form-drawer.tsx`, `customers-table.tsx`, `query-client.ts`, `src/middleware.ts`.

## 5. Source Audit Findings

| Question | Answer |
|----------|--------|
| Where is the Customer list/page component? | Server page `src/app/(protected)/admin/master-data/customers/page.tsx` renders client component `src/features/master-data/customers/components/customers-table.tsx`. |
| Where is the Add/Edit drawer opened? | Inside `CustomersTable`: Add button in `toolbarSlot`, Edit/View items in the row dropdown — all set `selected`/`formMode`/`isFormOpen` state rendering `<CustomerFormDrawer>`. |
| Can prefetch be triggered on page mount? | Yes — `CustomersTable` is a client component under the global TanStack provider. |
| Can prefetch be triggered before opening the drawer / on Add-Edit click? | Yes — the click handlers are plain functions in `CustomersTable`. |
| Does `CustomerFormDrawer` already have QueryClient access? | Yes (provider wraps the app), but wiring was placed in `CustomersTable` so the cache is warm BEFORE the drawer mounts. |
| Does `CUSTOMER_FORM_PREFETCH` contain the exact category codes used by the Customer form? | Yes — grep confirmed `customer-form-drawer.tsx` uses exactly the 6 declared codes. Child-section codes (`CONTACT_TYPES`, `ADDRESS_TYPES`, `BANK_ACCOUNT_TYPES`, `COMMUNICATION_PREFERENCE_TYPES`) are correctly excluded (lazy tabs). |
| `CUSTOMER_FORM_PREFETCH` / `prefetchLookupCategories` / `prefetchMasterDataQueries` consumed before this phase? | No — declaration and utilities existed unused, as designed in 3B.6G.1. |

## 6. Files Modified

| File | Change |
|------|--------|
| `src/features/master-data/customers/hooks/use-customer-form-prefetch.ts` | **NEW** — `useCustomerFormPrefetch()` hook |
| `src/features/master-data/customers/components/customers-table.tsx` | Wired prefetch: page-mount `useEffect` + `openDrawer()` helper used by Add/Edit/View |
| `src/app/dev/customer-prefetch-qa/page.tsx` | **NEW (dev-only)** — QA harness route, `notFound()` in production |
| `src/app/dev/customer-prefetch-qa/customer-prefetch-qa-client.tsx` | **NEW (dev-only)** — harness client with live prefetch, offline seed proof, 6 LookupSelects, cache inspector |

No changes to `customer-form-drawer.tsx`, `lookup-select.tsx`, `erp-combobox.tsx`, hooks, or server actions.

## 7. Customer Prefetch Hook / Logic Implemented

`useCustomerFormPrefetch()` returns a stable fire-and-forget callback:

```typescript
return useCallback(() => {
  void prefetchLookupCategories(queryClient, CUSTOMER_FORM_PREFETCH.lookupCategories);
  void prefetchMasterDataQueries(queryClient, CUSTOMER_FORM_PREFETCH.masterQueries);
}, [queryClient]);
```

- Uses the declaration constant — no category codes hardcoded in page/table code.
- Safe to call repeatedly: TanStack Query deduplicates in-flight fetches and `prefetchQuery` skips fresh entries (staleTime 5 min).
- Never throws (utilities return error metadata) — failed prefetch degrades to per-field fetching, never breaks the page.

## 8. Trigger Points Added

Per the preferred strategy (both A and B, fire-and-forget, drawer never blocked):

1. **Customers page mount** — `useEffect(() => { prefetchCustomerForm(); }, [prefetchCustomerForm])` in `CustomersTable` (stable dependency; runs once per mount). The cache is typically warm before the user can click Add/Edit.
2. **Add Customer click** — `openDrawer(null, "add")` fires prefetch then opens immediately.
3. **Edit Customer click** — `openDrawer(item, "edit")` same.
4. **View Customer click** — `openDrawer(item, "view")` same (view also renders lookup labels).

The drawer opens synchronously in the same handler — zero delay added; no loading blocker.

## 9. Query Key Seeding Explanation

One batch server action (`getActiveLookupValuesByCategoryCodes`, 2 Supabase round-trips) returns `Record<UPPERCASE_CODE, LookupValue[]>`. `seedLookupCategoryValues` writes each category to `queryKeys.lookup.values(code, null, false)` = `["lookup","values",CODE,null,false]` — byte-identical to the key `useLookupValuesQuery(categoryCode)` (and therefore every `LookupSelect`) reads with default options. Master lists are warmed under the hooks' exact keys (`["master","countries",false,false]`, `["master","currencies",false]`, `["master","payment_terms",false]`, `["master","tax_types",false]`) using the shared fetchers, so row shapes cannot drift.

Before: 6 sequential server actions (Next.js serializes server actions per client) → fields populate one by one.
After: 1 batch action + 6 seeded keys → all comboboxes ready together; reopen within 5 min staleTime = zero network.

## 10. Runtime / Network QA Result

**Authenticated ERP route:** not available in this session (single auth user `sameer@algt.net`, no credentials available to the agent — same limitation as 3B.6F).

**Fallback executed (per prompt §8):** dev harness `/dev/customer-prefetch-qa`, exercised live in the running dev server (localhost:3000) via browser automation. Results:

| Harness test | Result |
|--------------|--------|
| Live `prefetchLookupCategories` (unauthenticated) | Returned `requested 6, seeded 0, missing 6, error: "Authentication required"` — graceful degradation verified: no crash, no broken UI. |
| Live `prefetchMasterDataQueries` (browser Supabase client) | **4/4 master lists warmed** — cache showed `success/idle` entries for the exact hook keys `["master","countries",false,false]`, `["master","currencies",false]`, `["master","payment_terms",false]`, `["master","tax_types",false]`. Real network prefetch proven. |
| Offline seed proof (`seedLookupCategoryValues` with 18 synthetic rows) | `requested 6, seeded 6, values 18`. All six `["lookup","values",CODE,null,false]` keys appeared as `success`/`idle`. |
| Mount 6 Customer `LookupSelect`s after seeding | All six rendered **together, instantly**, with `fetchStatus: idle` — zero per-field fetches fired (an unauthenticated fetch would have produced a visible error block and `error` status; none appeared). Opening `CUSTOMER_TYPES` showed the 3 seeded options; selecting one worked. |

This runtime-proves the critical mechanism end-to-end: batch result → individual key seeding → `LookupSelect` reads seeded cache with no network. The only part not browser-verified is the authenticated batch action itself (existing 3B.6B code, unchanged) and the real Customer drawer waterfall — pending Sameer/Dina's logged-in verification (steps in §11–13 below).

## 11. Cold Load Result

Not verifiable without login. Expected (for manual verification): open `/admin/master-data/customers`, DevTools network open, click Edit Customer → ONE `getActiveLookupValuesByCategoryCodes` action (page-mount prefetch usually fires it even before the click) instead of six sequential category actions; Basic-tab comboboxes populate together.

## 12. Warm Cache Result

Harness-verified: re-mounting the six `LookupSelect`s against seeded cache rendered instantly with `fetchStatus: idle` and zero fetches. Expected in app: close/reopen drawer within 5 min → instant lookup fields, no network.

## 13. Add / Edit / View Behavior Result

All three paths route through the new `openDrawer()` helper, which performs the exact same state updates as before (`setSelected`, `setFormMode`, `setIsFormOpen(true)`) plus a non-blocking prefetch call before them. Drawer opening is not delayed or conditioned on prefetch. No props or drawer logic changed. Typecheck + build pass; dev server compiled the page without errors.

## 14. Safe Close Regression Result

Source-level verification: this phase did not touch `customer-form-drawer.tsx`, `useFormDirty`, `ERPCombobox`, or `LookupSelect`. Prefetch only writes to the TanStack Query cache — it does not mount, edit, or dispatch events on any form element, so dirty tracking is unaffected. (Browser regression test pending authenticated review; harness combobox selection behaved normally.)

## 15. Save / Save & Close Regression Result

Source-level verification: save handlers, FormData collection, and server actions are untouched. Seeded cache only changes where combobox OPTIONS come from, not form values or submission. No duplicate-create risk introduced (no changes to create/update flow).

## 16. Static Test Results

| Test | Result |
|------|--------|
| `npm run typecheck` | **PASS** (exit 0) |
| `npm run lint` | Run. One new error initially introduced by the harness (`react-hooks/set-state-in-effect` in the cache inspector) — **fixed** (deferred via `queueMicrotask`); scoped re-lint of all 4 touched files: clean. Repo-wide total 147 problems (63 errors, 84 warnings) — identical to the pre-phase baseline, all pre-existing and documented in 3B.6B/3B.6F/3B.6G.1 reports. |
| `npm run build` | **PASS** (exit 0; `/dev/customer-prefetch-qa` compiles, returns 404 in production via `notFound()` guard) |

A React "setState during render" dev warning in the harness cache inspector was also caught during browser QA and fixed (subscription callback deferred). Harness re-tested clean after both fixes.

## 17. Known Limitations

1. **Authenticated browser QA not performed** — no login credentials available to the agent. The batch-action-to-seeded-keys mechanism is runtime-proven in the harness; the real drawer waterfall needs a logged-in manual check (~1 min: open Customers, DevTools network, click Edit).
2. **Dev harness retained** at `src/app/dev/customer-prefetch-qa/` (production-guarded, returns 404). Delete together with `/dev/performance-qa` before production deployment, after Sameer/Dina review.
3. Dependent/child-tab lookup categories intentionally not prefetched (per standard §3.5–3.6).
4. Customer child tables still use `useEffect` fetching — unchanged by design; that is 3B.6G.3.

## 18. Next Phase Recommendation

Proceed to **3B.6G.3 — Customer Child Tables TanStack Query Migration**: migrate `CustomerContactsSection` / `CustomerAddressesSection` / `CustomerBankDetailsSection` (and documents) to `useQuery` with `queryKeys.child.*`, `enabled` on tab activation + parent id, and wire the child invalidation helpers into their mutations.

## 19. Final Status

**PASS WITH NOTES — Implemented with non-blocking notes.**

All closure criteria met: Customer uses `CUSTOMER_FORM_PREFETCH`; calls `prefetchLookupCategories` and `prefetchMasterDataQueries`; batch results seed individual `LookupSelect` keys (runtime-proven in harness); Add/Edit/View drawer behavior unchanged; typecheck and build pass; report created. Notes: authenticated in-app network waterfall verification pending manual review (clean PASS withheld per prompt §13).

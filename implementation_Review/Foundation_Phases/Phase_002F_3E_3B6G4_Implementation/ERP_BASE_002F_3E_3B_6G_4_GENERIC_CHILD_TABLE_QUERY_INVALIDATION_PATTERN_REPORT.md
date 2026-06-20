# ERP_BASE_002F_3E_3B_6G_4 — Generic Child Table Query / Invalidation Pattern — Implementation Report

## 1. Phase Name

ERP BASE 002F.3E.3B.6G.4 — Generic Child Table Query / Invalidation Pattern (extract the Customer-proven child-table runtime into reusable generic utilities for all future parent-child modules).

## 2. Date / Time

2026-06-12, ~17:05–17:25 (UTC+4).

## 3. Supabase Connection Confirmation

Connected to live Supabase project: `https://mmiefuieduzdiiwnqpie.supabase.co`

No database schema changes were required for 3B.6G.4 Generic Child Table Query / Invalidation Pattern.

Fresh SQL verification of all party parent/child tables — present in public schema:

| Parent | contacts | addresses | bank_details | documents |
|--------|----------|-----------|--------------|-----------|
| customers | ✅ | ✅ | ✅ | ✅ |
| vendors | ✅ | ✅ | ✅ | ✅ |
| subcontractors | ✅ | ✅ | ✅ | ✅ |
| consultants | ✅ | ✅ | ✅ | ✅ |
| government_authorities | ✅ | ✅ | — (by design, none in DB) | ✅ |
| recruitment_agencies | ✅ | ✅ | ✅ | ✅ |

## 4. Standards / Reports Reviewed

`ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md`, Cursor + UI/UX guides, 3B.6G plan, 3B.6G.1/2/3 reports, 3B.6F closure gate, 3B.4C Safe Close report. Source: `query-keys.ts`, `invalidation.ts`, `form-prefetch-types.ts`, `use-customer-child-queries.ts`, the three Customer child section components, the three customer child server-action files, `customer-prefetch.ts`.

## 5. Source Audit Findings

| Question | Answer |
|----------|--------|
| What generic child-table utilities already exist? | `queryKeys.child.table(tableName, parentId)` and `invalidateChildTable` / `invalidateAllChildTables` (3B.6G.1). No generic HOOK existed — 3B.6G.3 hooks repeated the useQuery block three times. |
| Are `queryKeys.child.*` generic enough? | Yes — `child.table` covers any table; entity helpers produce the identical `["child", table, id]` shape. Unchanged this phase. |
| Are invalidation helpers generic enough? | `invalidateChildTable` is generic; customer helpers already delegated to it. Added `createChildInvalidator(tableName)` factory for one-line future helpers. |
| How were Customer child hooks shaped? | Three structurally identical hooks: `useQuery` keyed by `queryKeys.child.*`, ActionResult-normalizing queryFn, `enabled: !!customerId && (options.enabled ?? true)`, staleTime 30 s / gcTime 10 min, result `{ items, isLoading, isFetching, error, refetch }`. |
| Can Customer hooks refactor to a generic helper without breaking behavior? | Yes — done. Same names, params, return shape (now a superset: `data` alias added), same keys, same timings, same fallback error strings. |
| Which future child tables exist in DB? | All vendor/subcontractor/consultant/government-authority/recruitment-agency child tables (§3) — `government_authority_bank_details` intentionally does not exist. |
| Which are DB-only, not UI-implemented? | ALL of them — grep found zero source references to `vendor_contacts`, `subcontractor_contacts`, `consultant_contacts`, `government_authority_contacts`, `recruitment_agency_contacts`. Customer is the only implemented parent-child UI. |
| `ActionResult` shape | Defined per-module (11 identical copies, no shared import). The generic hook therefore declares a structural `ChildActionResult<TItem>` that matches every module's type without coupling. |

## 6. Generic Hook Created

`src/hooks/child-tables/use-child-table-query.ts` (NEW) — hook approach chosen over a factory (simpler, same line count for consumers, no closure indirection):

```typescript
useChildTableQuery<TItem>({
  tableName,        // key becomes queryKeys.child.table(tableName, parentId)
  parentId,         // null/undefined (Add mode) keeps query disabled
  fetcher,          // existing server action: (parentId) => Promise<ActionResult<TItem[]>>
  errorLabel?,      // "contacts" → fallback "Failed to load contacts"
  enabled?,         // extra gate (default true)
  staleTime?,       // default CHILD_TABLE_STALE_TIME = 30 s
  gcTime?,          // default CHILD_TABLE_GC_TIME = 10 min
})
```

Requirements coverage: TanStack `useQuery`; safe null/undefined parentId (`enabled: !!parentId && enabled`); ActionResult normalized inside queryFn (throws into TanStack, never into UI); error surfaced as `string | null`; `refetchOnWindowFocus: false`; returns `{ items, data, isLoading, isFetching, error, refetch }` (`items` for table UIs, `data` alias per prompt §6). Exported constants keep defaults aligned with the Customer hooks.

## 7. Generic Invalidation Pattern

- `invalidateChildTable(queryClient, tableName, parentId)` — existed (3B.6G.1), verified.
- `invalidateAllChildTables(queryClient)` — existed, verified.
- `createChildInvalidator(tableName)` — **NEW** factory; returns `(queryClient, parentId) => void` delegating to `invalidateChildTable`.
- Customer helpers preserved with identical names and behavior, now one-liners:

```typescript
export const invalidateCustomerContacts = createChildInvalidator("customer_contacts");
export const invalidateCustomerAddresses = createChildInvalidator("customer_addresses");
export const invalidateCustomerBankDetails = createChildInvalidator("customer_bank_details");
export const invalidateCustomerDocuments = createChildInvalidator("customer_documents");
```

(Signature widened from `customerId: number` to `parentId: number | string` — backward compatible for all existing numeric callers.)

## 8. Customer Hook Refactor Status

**Refactored (preferred path).** `use-customer-child-queries.ts` keeps the three public hooks with unchanged names/parameters and delegates to `useChildTableQuery`:

- Query keys identical: `["child","customer_contacts",id]` etc. (`child.table(name, id)` ≡ entity key helpers).
- `enabled`, staleTime/gcTime, fallback error messages ("Failed to load contacts/addresses/bank details") all identical.
- Return shape: superset (adds `data` alias). `CustomerChildQueryOptions` / `CustomerChildQueryResult` re-exported as aliases for backward compatibility.
- **Zero component changes required** — the three Customer sections compile and run against the refactored hooks untouched.

## 9. ChildTableDescriptor Updates

`form-prefetch-types.ts` — three OPTIONAL fields added (additive only; `CUSTOMER_FORM_PREFETCH` compiles unchanged):

```typescript
parentKey?: string;                                          // e.g. "customer_id"
queryKey?: (parentId) => QueryKey;                           // e.g. queryKeys.child.customerContacts
invalidate?: (queryClient: QueryClient, parentId) => void;   // e.g. invalidateCustomerContacts
```

## 10. Standard Document Updates

`docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md` §4 gained rule 6 "Generic helper (3B.6G.4)": new modules MUST build child hooks on `useChildTableQuery` (no copy-paste), with a complete Vendor example (hook + one-line invalidator + mutation call) and a pointer to the Customer hooks as reference implementation.

## 11. Future Module Usage Example

As documented in the standard:

```typescript
export function useVendorContactsQuery(vendorId, options = {}) {
  return useChildTableQuery<VendorContact>({
    tableName: "vendor_contacts",
    parentId: vendorId,
    fetcher: getVendorContacts,
    errorLabel: "contacts",
    enabled: options.enabled,
  });
}
export const invalidateVendorContacts = createChildInvalidator("vendor_contacts");
// after mutation success:
invalidateVendorContacts(queryClient, vendorId);
```

## 12. Backward Compatibility Verification

- Customer sections (`customer-contacts/addresses/bank-details-section.tsx`): untouched, compile clean, import the same hook names and invalidation helpers.
- Query keys byte-identical (verified at runtime — §13).
- `invalidation.ts`: all existing exports preserved; geography/finance/lookup helpers untouched.
- `form-prefetch-types.ts`: additive optional fields only; `CUSTOMER_FORM_PREFETCH` (`as const satisfies FormPrefetchDeclaration`) still compiles.
- No parent drawer, dirty-tracking, save, or prefetch code touched — no fetch-on-open behavior introduced, parent dirty state unaffected.

## 13. Runtime / Browser QA Status

Authenticated route still unavailable; per prompt §11, the existing production-guarded harness `/dev/customer-child-qa` (which mounts the PRODUCTION Customer hooks — now running through the generic helper) was re-run live in the browser after the refactor:

| Test | Result |
|------|--------|
| No fetch before probe mount | Child cache empty (0 entries) until first probe mounted. |
| Enabled gating (customerId=null) | `["child","customer_contacts",null]` stayed `pending/idle` — never fetched. |
| Fetch fires on mount (customerId=1) | Key created and query fired on mount, exactly as pre-refactor. |
| Identical query keys post-refactor | Cache shows the same `["child","customer_contacts",1]` / `customer_addresses` / `customer_bank_details` keys as the 3B.6G.3 run. |
| Targeted invalidation via factory-built helper | "Invalidate bank details ONLY" flagged only `["child","customer_bank_details",1]` invalidated; contacts and addresses stayed `success/idle` untouched. |
| Result shape compatibility | Probes rendered `items/isLoading/isFetching/error` from the generic result without changes. |

In-app authenticated tab-waterfall QA remains pending manual review (unchanged from 3B.6G.3).

## 14. Static Test Results

| Test | Result |
|------|--------|
| `npm run typecheck` | **PASS** (exit 0) |
| `npm run lint` | Run; all 4 touched files lint clean (scoped eslint exit 0). Repo-wide unchanged at 138 problems (60 errors, 78 warnings) — zero new, all pre-existing and documented. |
| `npm run build` | **PASS** (exit 0) |

## 15. Known Limitations

1. No future module migrated yet — vendor/subcontractor/etc. have no UI or server actions in source (DB-only); the pattern awaits 3B.6G.5+.
2. `ActionResult` remains duplicated per module; the generic hook bridges via structural typing. A shared `ActionResult` type is a candidate cleanup for a future housekeeping phase.
3. Authenticated browser QA pending manual review (same environment constraint).
4. Dev harnesses (`/dev/performance-qa`, `/dev/customer-prefetch-qa`, `/dev/customer-child-qa`) retained production-guarded for review; delete before production deployment.

## 16. Next Phase Recommendation

Proceed to **3B.6G.5 — Apply Standard to Existing Forms / Future-Ready Modules**: audit the remaining existing parent forms (e.g. branches/organizations if they own child-like data) against the runtime standard checklist and wire `FormPrefetchDeclaration` constants where lookup-heavy forms exist, then close with 3B.6G.6 runtime QA gate.

## 17. Final Status

**PASS WITH NOTES — Implemented with non-blocking notes.**

All closure criteria met: generic child query hook exists (`useChildTableQuery`); generic invalidation verified plus `createChildInvalidator` factory added; Customer hooks preserve their public API and now run through the generic helper (runtime-verified in harness with identical keys and targeted invalidation); query keys unchanged; standard document updated with the future-module example; typecheck and build pass; report created. Notes: authenticated in-app QA pending manual review (clean PASS withheld per prompt §14).

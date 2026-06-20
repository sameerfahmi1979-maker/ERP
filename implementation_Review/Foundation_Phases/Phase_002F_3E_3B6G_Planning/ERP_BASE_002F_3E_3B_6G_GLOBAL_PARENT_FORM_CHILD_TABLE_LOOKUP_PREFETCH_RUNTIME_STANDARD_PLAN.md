# ERP_BASE_002F_3E_3B_6G — Global Parent Form, Child Table, and Lookup Prefetch Runtime Standard
## Architecture + Audit + Implementation Plan (NO IMPLEMENTATION)

**Phase:** ERP BASE 002F.3E.3B.6G  
**Date:** 2026-06-12, ~13:30–14:00 UTC+4  
**Engineer:** Fable 5 (Cursor Agent)  
**Status:** PASS

---

## 1. Phase Name

ERP BASE 002F.3E.3B.6G — Global Parent Form, Child Table, and Lookup Prefetch Runtime Standard (Plan Only)

---

## 2. Date / Time

2026-06-12, 13:30 PM UTC+4

---

## 3. Supabase Connection Confirmation

```
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database schema changes were made for 3B.6G planning.
```

Connected via `user-supabase` MCP (the `plugin-supabase-supabase` MCP still points to the unrelated weighing system project). All 25 required tables verified, including: `customers` (1), `customer_contacts` (0), `customer_addresses` (1), `customer_bank_details` (1), `customer_documents` (0), `global_lookup_categories` (43), `global_lookup_values` (278), all geography/finance/UOM/org tables, plus the parallel party-master families (vendors, subcontractors, consultants, government_authorities, recruitment_agencies — each with contacts/addresses/documents/bank_details child tables) which makes this standard immediately applicable to 5 more upcoming modules.

---

## 4. Standards / Reports Reviewed

- `docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md`
- `docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md`
- 3B.6A audit plan, 3B.6B/6C/6D/6E implementation reports, 3B.6F closure gate report
- 3B.4C Safe Close runtime investigation, 3B.5 runtime QA closure gate

---

## 5. Source Files Inspected

```
src/components/erp/erp-drawer-form.tsx            (lazyMount runtime)
src/components/erp/combobox/erp-combobox.tsx       (dirty signal)
src/components/erp/lookup-select.tsx               (per-category fetch)
src/hooks/use-form-dirty.ts
src/hooks/lookups/use-lookup-queries.ts            (single + batch hooks)
src/lib/query/query-keys.ts
src/lib/query/invalidation.ts
src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/master-data/customers/components/customer-contacts-section.tsx
src/features/master-data/customers/components/customer-addresses-section.tsx
src/features/master-data/customers/components/customer-bank-details-section.tsx
src/server/actions/master-data/customers.ts        (updateCustomer payload behavior)
+ 24 form dialogs across geography/finance/UOM/lookups/org/users/roles/numbering
```

Grep audits executed: `new FormData` (25 forms), `useLookupBatchQuery` (defined, exported, **never consumed**), `prefetchQuery` (**zero usage**), `LookupSelect` consumers (11 files), child-section `useEffect` fetch patterns (3 files).

---

## 6. Current Issue Explanation — Why Lookups Appear One by One

The Customer Basic tab renders six `LookupSelect` components, each calling `useLookupValuesQuery(categoryCode)`, each with a **distinct query key** → six independent `getActiveLookupValuesByCategoryCode` **server actions**.

Three compounding factors:

1. **Server action serialization.** Next.js processes server actions from one client **sequentially**, not in parallel. Six lookup categories = six sequential round-trips. Each combobox populates as its own call completes → the visible one-by-one cascade.
2. **No prefetch.** Nothing warms the cache before the drawer opens. First open of any form always pays the full cold cost. `queryClient.prefetchQuery` is never used anywhere in the codebase.
3. **Batch exists but is orphaned.** `useLookupBatchQuery` + `getActiveLookupValuesByCategoryCodes` (2 round-trips for N categories) were built in 3B.6B but no consumer was ever wired, deferred in 3B.6D because `LookupSelect`'s API takes a `categoryCode`, not pre-fetched options.

**Key architectural trap identified:** the batch query key `["lookup","batch",[...codes],false]` is **different** from the individual keys `["lookup","values",CODE,null,false]` that `LookupSelect` reads. Prefetching the batch key alone would NOT stop the one-by-one loading — each `LookupSelect` would still fire its own query. The fix must **seed the individual keys** (via `queryClient.setQueryData` from a batch result, or prefetch each individual key). This is the central design decision of 3B.6G.2.

---

## 7. Current Module Audit — Parent/Child Forms Matrix

| Module | Parent Form | Child Tables/Sections | Current Fetch Pattern | Current Risk | Recommended Standard |
|---|---|---|---|---|---|
| Customer | customer-form-drawer (7 tabs) | contacts, addresses, bank details, documents (placeholder) | Child: manual `useEffect`+`useState` per section, deferred by 3B.6E `mountedSections`. Lookups: 6 sequential server actions | One-by-one lookups; no child cache; no refetch dedup on reopen | Full standard: prefetch batch + child TanStack Query |
| Organization | organization-form-dialog (5 sections) | none | Direct `createClient` queries for logo upload etc.; FormData save | All sections always mounted (correct — all have inputs) | Lookup prefetch only if lookup fields added later |
| Branch | branch-form-dialog (5 sections) | none | FormData save; geography cascades cached | None significant | Already conformant after 3B.6D |
| Roles | role-form-dialog, role-detail-drawer | permissions matrix (eager) | Server props / direct fetch | Permissions list is small | No change needed now |
| Users | add-user-dialog, user-edit-dialog (4/2 sections) | none | FormData save | None significant | No change needed now |
| Numbering Rules | numbering-rule-form-dialog (7 sections) | none | FormData; audit lazy since 3B.6E | None | Conformant |
| Geography (5 forms) | country/emirate/city/area/port | none | Cached hooks; audit lazy | None | Conformant |
| Finance Basics (6 forms) | currency/bank/payment-term/tax-type/cost-center/profit-center | none | Cached hooks; audit lazy | None | Conformant |
| UOM (3 forms) | category/unit/conversion | none | Cached hooks; audit lazy | None | Conformant |
| Lookups (2 forms) | category/value | values list (page-level) | Cached hooks; audit lazy | None | Conformant |

**Conclusion:** Customer is the only current form with real child tables — it is the reference implementation candidate. The standard matters most for the **five party-master siblings** (vendors, subcontractors, consultants, government authorities, recruitment agencies) whose DB tables already exist and which will clone the Customer pattern.

---

## 8. Customer Lookup Prefetch Matrix

Actual category codes verified in source (`customer-form-drawer.tsx`):

| Field | Current Component | Lookup Category (actual) | Current Load Pattern | Prefetch Method | Priority |
|---|---|---|---|---|---|
| Customer Type | LookupSelect | `CUSTOMER_TYPES` | Own server action on mount | Batch seed | P0 |
| Industry Type | LookupSelect | `INDUSTRY_TYPES` | Own server action on mount | Batch seed | P0 |
| Customer Segment | LookupSelect | `CUSTOMER_SEGMENTS` | Own server action on mount | Batch seed | P0 |
| Lead Source | LookupSelect | `CRM_LEAD_SOURCES` | Own server action on mount | Batch seed | P0 |
| Status | LookupSelect | `PARTY_STATUS_TYPES` | Own server action on mount | Batch seed | P0 |
| ICV Status (compliance tab) | LookupSelect | `ICV_STATUS_TYPES` | Own server action on mount (tab always mounted) | Batch seed | P1 |
| Country (location tab) | CountrySelect | `countries` table | Cached hook, fires on mount | `prefetchQuery(queryKeys.countries())` | P1 |
| Currency (finance tab) | CurrencySelect | `currencies` table | Cached hook, fires on mount | `prefetchQuery(queryKeys.currencies())` | P1 |
| Payment Term (finance tab) | PaymentTermSelect | `payment_terms` | Cached hook, fires on mount | `prefetchQuery` | P2 |
| Tax Type (finance tab) | TaxTypeSelect | `tax_types` | Cached hook, fires on mount | `prefetchQuery` | P2 |
| Emirate/City/Area | cascades | dependent on parent | Correctly deferred (enabled by parent id) | No prefetch (dependent) | — |

**Note (prompt §8.2 adjustment):** the prompt suggested `CUSTOMER_INDUSTRY_TYPES` / `CUSTOMER_LEAD_SOURCES`; actual source codes are `INDUSTRY_TYPES` and `CRM_LEAD_SOURCES`.

**Where to trigger prefetch — decision:**

| Trigger point | Pros | Cons | Verdict |
|---|---|---|---|
| Customers page mount | Cache warm before any drawer opens; one batch for Add AND Edit | Slight cost if user never opens a form | ✅ **Primary** |
| Row hover | Most "instant" feel | Complex, redundant with page-mount warm | ❌ Skip |
| Edit button click | Minimal waste | Too late — drawer opens before fetch returns | ❌ Skip (covered anyway) |
| Drawer open | Simple | This is the current behavior, just batched | ✅ Fallback (the hooks still run normally if cache is cold) |

---

## 9. Child Table Runtime Matrix

| Child Section | Parent ID Required | Current Fetch | Proposed Query Key | Proposed Invalidations | Lazy Rule |
|---|---|---|---|---|---|
| CustomerContactsSection | ✅ | `useEffect`+`useState`, manual `loadContacts()` re-fetch after every mutation | `["child","customer_contacts",customerId]` | On create/update/delete: invalidate exactly that key | Already lazy (3B.6E lazyMount) — keep |
| CustomerAddressesSection | ✅ | Same manual pattern | `["child","customer_addresses",customerId]` | Same | Already lazy (mountedSections guard) — keep |
| CustomerBankDetailsSection | ✅ | Same manual pattern | `["child","customer_bank_details",customerId]` | Same | Already lazy (mountedSections guard) — keep |
| Documents (placeholder) | ✅ | None (static) | `["child","customer_documents",customerId]` (future DMS) | Future | Already lazy |

**Current gaps the migration fixes:**
- Closing and reopening the same customer re-fetches all visited child sections (no cache).
- Every mutation triggers a full manual reload instead of a targeted invalidation.
- No shared loading/error conventions; each section re-implements `loading` state.

**Proposed generic child query key convention:**

```
["child", <child_table_name>, <parent_id>]
```

Outer `"child"` segment enables broad invalidation (e.g. clear all child caches at logout); table+parent narrows precisely. Mutations invalidate only their own key.

**Cache retention decision:** child data stays cached after drawer close (default `gcTime`), so reopening the same customer is instant; invalidation on mutation keeps it correct. `staleTime` for child tables should be **0 or short (~30s)** — unlike master lookups (10 min), child rows are the user's own editable data and must refetch on tab re-entry after external changes. TanStack still dedups concurrent mounts.

---

## 10. FormData Lazy Safety Matrix

`updateCustomer` (verified in `src/server/actions/master-data/customers.ts`) performs a **full-payload UPDATE** — `dataToUpdate = { ...updateData }` writes every schema field. Any field missing from FormData becomes `null` and **overwrites stored data**. The same pattern applies to all 25 forms using `new FormData(form)`.

| Form | Section | Has FormData Inputs? | Lazy Safe? | Reason | Required Future Refactor |
|---|---|---|---|---|---|
| Customer | basic | ✅ many | ❌ (default tab anyway) | Full-payload save | None needed |
| Customer | location | ✅ (address_line_1/2, po_box, makani) | ❌ stays mounted | Would null address fields | Patch-style save or controlled state |
| Customer | contacts | ❌ child CRUD only | ✅ lazy now | No FormData contribution | None |
| Customer | finance | ✅ (credit_limit, credit_days) | ❌ stays mounted | Would null credit fields | Same refactor |
| Customer | compliance | ✅ (8 ICV fields) | ❌ stays mounted | Would null compliance fields | Same refactor |
| Customer | documents | ❌ placeholder | ✅ lazy now | — | None |
| Customer | audit | ❌ display-only | ✅ lazy now | — | None |
| Branch / Organization | all sections | ✅ | ❌ keep mounted | Full-payload saves | Only if perf requires |
| All simple master forms | audit | ❌ | ✅ lazy now (3B.6E) | — | None |
| All simple master forms | other sections | ✅ | ❌ keep mounted | Small forms — no benefit anyway | None |

**Standing rule (carried from 3B.6E, now formalized):** a section may lazy-mount only if it contributes **zero** named uncontrolled inputs to a full-payload FormData save. The future patch-style save refactor (send only changed fields) is the unlock for full tab laziness — explicitly deferred, not required for 3B.6G.

---

## 11. Global Parent Form Runtime Standard

### 11.1 Parent Form Opening Phases

```
Phase A — Drawer shell opens immediately (no data gate; <300ms)
Phase B — Parent record: Edit/View receive the row from the list page (already
          in props today — no extra fetch); future modules with heavy parents
          may fetch by id with a drawer skeleton
Phase C — Default-tab lookups load as ONE batch (seeded individual keys);
          comboboxes show their built-in loading state together, not one-by-one
Phase D — Default tab renders; fields populate simultaneously when batch lands
Phase E — Hidden tabs lazy-mount on first activation (3B.6E lazyMount)
Phase F — Child tables fetch only when (tab first activated) AND (parent id exists)
```

Skeleton/placeholder rules:

| State | UI |
|---|---|
| Drawer opening | Shell renders instantly; no full-drawer skeleton needed for current modules |
| Lookup batch in flight | Comboboxes show existing `loading` spinner state (already built into ERPCombobox) |
| Child tab, Add mode (no parent id) | "Save parent first" placeholder (already implemented) |
| Child tab, fetch in flight | Section-level loading row (existing pattern, to be standardized in shared child-table wrapper) |
| Display-only tabs | Mount on first visit (lazyMount) — no skeleton needed |

### 11.2 Lookup Prefetch Standard

1. **Every parent form declares its lookup needs** in one constant:

```typescript
// Per-module declaration (reference shape — implement in 3B.6G.1)
export const CUSTOMER_FORM_LOOKUPS = {
  categories: ["CUSTOMER_TYPES", "INDUSTRY_TYPES", "CUSTOMER_SEGMENTS",
               "CRM_LEAD_SOURCES", "PARTY_STATUS_TYPES", "ICV_STATUS_TYPES"],
  masters: [queryKeys.countries(), queryKeys.currencies(),
            queryKeys.paymentTerms(), queryKeys.taxTypes()],
} as const;
```

2. **Batch + seed individual keys.** A new utility `prefetchLookupCategories(queryClient, codes)` calls the existing batch server action **once**, then `queryClient.setQueryData(queryKeys.lookup.values(code), rows)` for each category. Existing `LookupSelect` components then find their individual keys already populated — **zero changes to `LookupSelect`'s API**. This resolves the 3B.6D deferral cleanly.
3. **Trigger on list-page mount** (e.g. Customers page) via a `usePrefetchFormLookups(declaration)` hook; drawer-open cold path still works unchanged.
4. **Master lists** (countries, currencies…) use `queryClient.prefetchQuery` with the same queryFn as their hooks. These run client-side Supabase queries (not server actions), so they already parallelize — prefetch only warms them earlier.
5. **Dependent lookups** (emirate-by-country, city-by-emirate, branch-by-company) are never prefetched; they load on parent selection (current behavior is correct).
6. **Entity search fields** (future: customer picker inside an order form) are out of scope — server-side search standard comes in a later phase.

### 11.3 Child Table Standard

```
1. Child table fetches only when its tab first activates AND parent id exists.
2. Child data uses TanStack Query: ["child", <table>, <parentId>], staleTime ≤30s.
3. Add mode: child tabs show "Save parent first" until parent id exists.
4. Child create/update/delete invalidates ONLY ["child", <table>, <parentId>].
5. Child rows stay cached while drawer is open and across drawer reopen.
6. Child dialogs (add/edit row) keep their own local state — unaffected.
7. Child mutations must NOT invalidate parent or master caches.
```

### 11.4 Lazy Mount Standard (formalizes 3B.6E)

```
SAFE to lazy-mount:
  - child CRUD tables (own data lifecycle, no FormData inputs)
  - documents/attachments placeholders
  - audit/display-only sections (no name attributes)
  - sections with fully controlled state AND patch-safe save logic

UNSAFE (must stay mounted):
  - any section contributing uncontrolled named inputs to a
    full-payload FormData save
```

### 11.5 Cache / Prefetch Standard

| Data class | staleTime | Prefetch | Invalidation |
|---|---|---|---|
| Lookup categories | 10 min (current default) | Batch-seed on list-page mount | `invalidateLookups` on lookup admin mutation |
| Master lists (geo/finance/org/UOM) | 10 min | `prefetchQuery` on list-page mount (P1) | Existing per-domain helpers (3B.6D) |
| Dependent lists (emirates by country…) | 10 min | Never | Existing helpers |
| Child tables | 0–30s | Never (lazy by definition) | Targeted per-key on child mutation |
| Parent records | n/a (props today) | n/a | List page refresh on save (current) |

### 11.6 Future Module Checklist

Every future module (HR, Fleet, Workshop, Inventory, Projects, Procurement, Sales/CRM, DMS, Tasks) must declare before implementation:

```
□ Section classification: default / always-mounted FormData / lazy-safe / child CRUD
□ Lookup category list for the default tab (→ batch prefetch declaration)
□ Master list dependencies (→ prefetchQuery list)
□ Child tables with parent FK (→ ["child", table, parentId] keys)
□ Child mutation → invalidation mapping
□ Add-mode behavior for each child tab ("save parent first")
□ Safe Close: combobox + child-table interactions mark dirty correctly
□ Save audit: full-payload vs patch — determines lazy-mount eligibility
□ Runtime QA: one-by-one loading check, child fetch deferral check
```

| Future Module | Parent Form | Expected Child Tables | Lookup Prefetch Need | Child Query Strategy | Notes |
|---|---|---|---|---|---|
| Vendors | vendor drawer | vendor_contacts, _addresses, _bank_details, _documents | High (clones Customer) | Same keys, table name swapped | Tables already in DB |
| Subcontractors / Consultants / Gov authorities / Recruitment agencies | same pattern | same 3–4 child tables each | High | Identical | Tables already in DB |
| HR / Employees | employee drawer | identity docs, emergency contacts, addresses, EOS, bank/payroll, status history | Very high (many lookups) | `["child", table, employeeId]` | Largest child-table consumer |
| Fleet / Vehicles | vehicle drawer | service history, documents, assignments | Medium | Same | |
| Workshop / Service Jobs | job form | job lines, parts, labor | Medium | Same + line-item editing standard (future) | |
| Inventory / Spare Parts | item form | stock levels, suppliers, conversions | Medium | Same | |
| Projects | project form | milestones, members, documents | Medium | Same | |
| Procurement / Sales | PO/SO forms | line items | High | Line items are NOT child CRUD — transactional lines need their own standard (future phase) | |
| DMS | document form | versions, permissions | Low | Same | |

---

## 12. Implementation Phase Split (proposed)

```
3B.6G.1 — Standard document in docs/standards/ + prefetch utilities
          (prefetchLookupCategories with key seeding, usePrefetchFormLookups,
          child query key factory added to query-keys.ts)
          Small, zero-risk, foundation for everything else.

3B.6G.2 — Customer lookup prefetch wiring
          Declaration constant + list-page prefetch + verify simultaneous
          combobox population. THE user-visible fix for one-by-one loading.

3B.6G.3 — Customer child tables TanStack Query migration
          contacts/addresses/bank-details from useEffect+useState to
          useQuery + targeted invalidation. Includes child invalidation helpers.

3B.6G.4 — Generic child-table pattern extraction
          Shared hook (useChildTableQuery) + conventions doc, derived from
          what 3B.6G.3 proved. (Deliberately AFTER the concrete migration —
          extract from working code, don't design in the abstract.)

3B.6G.5 — Apply to remaining current forms + list-page prefetch for
          geography/finance/UOM admin pages (small win, low risk).

3B.6G.6 — Runtime QA + closure gate (browser verification of simultaneous
          lookup loading, child fetch deferral, cache reuse, Safe Close).
```

Order rationale: G.1+G.2 deliver the visible UX fix fastest; G.3 before G.4 so the generic pattern is extracted from a proven implementation rather than speculation.

---

## 13. Runtime Testing Strategy

Tests for the future 3B.6G.6 gate:

```
1. Customer Edit opens: all 5 Basic-tab lookups populate together (≤2 visible
   loading states resolving simultaneously), not one-by-one.
2. Network proof: ONE batch server action instead of 6 sequential singles.
3. Customers list page mount warms lookup cache (verify via query cache inspector).
4. Child tabs: zero child fetches on drawer open; fetch fires on first tab click.
5. Close + reopen same customer: child data renders from cache; refetch in
   background if stale.
6. Add/edit/delete contact: only ["child","customer_contacts",id] invalidates;
   addresses/bank queries untouched.
7. Safe Close: combobox-only edit AND child-row mutation both leave parent
   dirty state correct (child CRUD must NOT mark parent form dirty — child rows
   save independently).
8. Save / Save & Close: no regression; unmounted-section data loss check on
   Customer (visit only Basic, save, verify location/finance/compliance fields
   unchanged in DB).
```

Performance targets:

```
drawer shell visible           < 300ms
basic lookup batch (cold)      < 500ms (one batched action vs ~6 sequential)
warm-cache edit open           instant (0 lookup requests)
child tab fetch                only on first activation
duplicate category fetch       0 within a drawer session
```

---

## 14. Risks and Assumptions

| # | Risk / Assumption | Mitigation |
|---|---|---|
| 1 | Batch seeding must produce **identical row shape** to single-category fetch, or `LookupSelect` mapping breaks | Both server actions return the same `LookupValue` rows — verify in G.1 with a type-level assertion |
| 2 | `setQueryData` seeds bypass `staleTime` bookkeeping subtleties | Seeded entries get `dataUpdatedAt = now` — fresh for 10 min, same as a direct fetch; acceptable |
| 3 | Customer save is full-payload — any accidental lazy-mount of FormData sections loses data | Standard explicitly forbids it (§10, §11.4); QA test 8 guards it |
| 4 | Child sections currently mix fetch + dialog + mutation in one component; TanStack migration touches mutation flows | Migrate read-path first, keep mutations as server actions + targeted invalidate; no dialog changes |
| 5 | Server action serialization is the actual bottleneck (assumption based on Next.js behavior) | Even if parallelism improves in future Next.js, one batch call remains strictly better |
| 6 | Five party-master sibling modules will clone Customer before the standard lands | Sequence G.1–G.3 before vendor module implementation begins |
| 7 | Transactional line items (PO/SO) treated as child CRUD by mistake | Explicitly excluded — flagged as a separate future standard (§11.6) |

---

## 15. Final Recommendation

Approve the phase split in §12. Highest-value, lowest-risk slice is **G.1 + G.2** (prefetch utilities + Customer wiring): it eliminates the user-visible one-by-one lookup loading with zero changes to component APIs, zero schema changes, and no save-path risk. G.3 then makes child data caching consistent before the vendor/subcontractor/consultant modules clone the Customer pattern.

---

## 16. Final Status

**PASS — Global parent form / child table / lookup prefetch runtime standard plan completed.**

No code was implemented. No database changes were made. Awaiting Sameer/Dina review before starting 3B.6G.1.

# ERP BASE 002F.3E.3B.6A — GLOBAL COMBOBOX AND FORM RUNTIME PERFORMANCE AUDIT PLAN

## 1. Phase Information

**Phase ID**: ERP BASE 002F.3E.3B.6A  
**Phase Title**: Global Combobox and Form Runtime Performance Audit Plan  
**Date/Time**: 2026-06-12  
**Report Type**: Audit / Technical Plan (no implementation)  
**Status**: PASS — Audit and performance optimization plan completed.

---

## 2. Supabase Connection Confirmation

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database changes were required for 3B.6A audit planning.
```

### Live schema notes (row counts at audit time)

| Prompt table name | Live table | Rows | Notes |
|-------------------|------------|------|-------|
| unit_conversions | `uom_conversions` | 0 | Name differs from prompt |
| customers + child tables | `customers`, `customer_contacts`, `customer_addresses`, `customer_bank_details` | 1 / 0 / 1 / 1 | Present |
| All other required tables | Verified | See 3B.5 report | RLS enabled on all |

---

## 3. Standards and Reports Reviewed

**Standards**

- `docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md`
- `docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md` (Sections 11 Combobox, 21 Performance/Caching)

**Reports**

- `ERP_BASE_002F_3E_3B_2D_CUSTOMER_FORM_FINAL_QA_REPORT.md`
- `ERP_BASE_002F_3E_3B_3F_REQUIRED_FOOTER_FINAL_QA_REPORT.md`
- `ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md`
- `ERP_BASE_002F_3E_3B_5_GLOBAL_FORM_RUNTIME_QA_AND_STANDARD_CLOSURE_GATE_REPORT.md`

**Key standard vs implementation gap**: Section 21.1 recommends loading all tab data in parallel on drawer open and caching in parent state. Section 11.7 recommends React Query or SWR for combobox caching. **Neither is implemented today** — this audit plan bridges that gap.

---

## 4. Source Files Inspected

### Core combobox / form runtime

| File | Role |
|------|------|
| `src/components/erp/combobox/erp-combobox.tsx` | Base searchable combobox (cmdk + Popover) |
| `src/components/erp/combobox/types.ts` | Option/prop types |
| `src/components/erp/lookup-select.tsx` | Lookup wrapper → `useLookupValues` + ERPCombobox |
| `src/features/master-data/lookups/hooks/use-lookup-values.ts` | Per-mount fetch hook (no global cache) |
| `src/server/actions/master-data/lookups.ts` | `getActiveLookupValuesByCategoryCode` (2 DB queries per call) |
| `src/components/erp/erp-drawer-form.tsx` | Drawer shell, section nav, `ERPDrawerSection` (CSS hidden tabs) |
| `src/hooks/use-form-dirty.ts` | Document-level dirty tracking (combobox gap documented in 3B.5) |

### Domain wrappers (17 files under `src/components/erp/`)

Geography: `country-select`, `emirate-select`, `city-select`, `area-zone-select`, `port-select`  
Finance: `currency-select`, `payment-term-select`, `tax-type-select`, `bank-select`, `cost-center-select`, `profit-center-select`  
Organizations: `owner-company-select`, `branch-select`  
UOM: `uom-category-select`, `unit-of-measure-select`, `unit-by-category-select`

### Heaviest form reference

- `src/features/master-data/customers/components/customer-form-drawer.tsx`
- Child sections: `customer-contacts-section.tsx`, `customer-addresses-section.tsx`, `customer-bank-details-section.tsx`

### Stack check

- **No** `@tanstack/react-query`, **no** SWR in `package.json`
- `@tanstack/react-table` present (tables only)
- Supabase client used directly inside many wrapper components

---

## 5. Executive Summary

The global combobox **UI foundation is solid** (ERPCombobox + LookupSelect + most geography/finance wrappers). **Performance architecture is not global** — each combobox instance fetches independently on mount, with **no cross-instance cache**, **no tab lazy-loading**, and **no virtualization** for large lists.

**Highest-impact finding**: Opening the Customer drawer (Add mode) mounts **all tab sections simultaneously** (CSS `hidden`, not unmounted) and triggers **~14+ parallel network operations** before the user interacts with anything beyond the Basic tab.

**Second-highest**: `LookupSelect` uses server actions that perform **two Supabase queries per category** (resolve category ID, then fetch values). Six lookup fields on Customer = **12 DB round-trips** for lookups alone, with **no deduplication** if the same category appears twice in one session.

**Third**: Five domain wrappers still use **plain shadcn Select** (not searchable ERPCombobox), and combobox changes **do not mark forms dirty** (Safe Close gap from 3B.5).

This plan defines a **global lookup data layer**, **loading tier rules**, **drawer lazy-load standard**, and a **6-subphase implementation roadmap** (3B.6B–3B.6F).

---

## 6. Performance Audit Answers

### 6.1 Combobox runtime

| Question | Finding |
|----------|---------|
| Load all options immediately? | **Yes** — every wrapper fetches full active list on mount |
| Fetch on mount? | **Yes** — `useEffect` in each domain select; `useLookupValues` on mount |
| Fetch each drawer open? | **Yes** — no session cache; remount or new instance refetches |
| Fetch per field separately? | **Yes** — no shared cache between two `LookupSelect` with same `categoryCode` |
| Search client vs server? | **Client-only** — ERPCombobox filters in-memory via `useMemo`; no server search |
| Debounced search queries? | **N/A today** — no server-side search; keystrokes only filter locally (cheap for small lists, expensive DOM for large lists) |
| Virtualized lists? | **No** — all filtered options rendered as `CommandItem` |
| 250 countries / 278 lookup values at once? | **Yes** — all rows held in memory; all filtered items rendered when popover open |

### 6.2 Query efficiency

| Question | Finding |
|----------|---------|
| Repeated Supabase queries? | **Yes** — same category/country/currency fetched N times per drawer if N instances |
| Global lookup cache? | **No** |
| Server actions reused? | Same action called per instance; no memoization layer |
| Category filter efficient? | Values query uses `category_id` — good; but category resolved by code **every call** |
| Indexes for future scale? | FK indexes likely exist; audit recommends verifying index on `global_lookup_values(category_id, is_active)` and geography FKs before HR/Fleet scale-up |
| RLS overhead? | All tables RLS-enabled; each client/server query pays policy evaluation — acceptable at current scale, monitor at 10k+ rows |
| Unnecessary counts? | No count queries in lookup loaders |

### 6.3 Drawer opening speed

| Question | Finding |
|----------|---------|
| Drawer waits for lookup data? | Drawer **opens immediately** (Base UI Sheet), but many fields show **Loading...** spinners simultaneously |
| Hidden tabs load data? | **Yes** — `ERPDrawerSection` uses `hidden` class; children **remain mounted** and fetch on drawer open |
| Customer child sections immediate? | Contacts/addresses/banks fetch **only when `currentCustomer` exists** (good for Add); still mount in hidden tabs on Edit |
| Tab lazy-load? | **No** — all sections in DOM from first render |
| Too many components on open? | **Yes** — Customer: 7 sections × multiple fields + up to 3 child CRUD sections |
| Combobox popover heavy before open? | Popover content lazy — only trigger renders until open (**good**) |

### 6.4 React rendering

| Question | Finding |
|----------|---------|
| Form re-render on one combobox change? | Customer form holds many `useState` FK ids — **parent re-renders** on each selection; all mounted comboboxes re-render |
| Options memoized? | ERPCombobox memoizes `filteredOptions`; wrappers rebuild `options` array each render (minor) |
| Callbacks memoized? | Mostly inline lambdas in forms — low priority |
| Lookup hooks stable? | `useLookupValues` refetches on dep change only — stable but not shared |
| Popover only when open? | **Yes** |

### 6.5 Future module readiness

| Question | Finding |
|----------|---------|
| HR/Fleet reuse lookup cache? | **Not without 3B.6B** — no cache layer exists |
| Standard small vs large lookup? | Documented in standards (§11.7) but **not enforced in code** |
| Client vs server search rule? | Documented but **not implemented** for entity pickers |
| Prefetch frequent lookups? | **No mechanism** |

---

## 7. Matrix 8.1 — Current Combobox / Lookup Usage

| Module | Form | Field(s) | Component | Data Source | Loads On | Search | ~Size | Risk | Recommendation |
|--------|------|----------|-----------|-------------|----------|--------|-------|------|----------------|
| Customer | customer-form-drawer | Type, Industry, Segment, Lead Source, Status, ICV Status | LookupSelect | Server action → `global_lookup_values` | Drawer open (all tabs mounted) | Client | 5–30 each | **HIGH** duplicate categories | Global lookup cache by categoryCode |
| Customer | customer-form-drawer | Country→Area chain | Country/Emirate/City/AreaZoneSelect | Supabase client direct | Drawer open | Client | 250/16/24/22 | **HIGH** fetch when tab hidden | Tab lazy-load + global geo cache |
| Customer | customer-form-drawer | Currency, Payment Term, Tax Type | *Select wrappers | Supabase client | Drawer open (hidden tab) | Client | 162/8/5 | MEDIUM | Cache finance lists globally |
| Customer | contacts/addresses/banks | Contact/Address/Bank types | LookupSelect | Server action | Edit + section mounted | Client | small | MEDIUM duplicate PARTY_STATUS | Cache + lazy section |
| Geography | emirate, area, port, bank | Country, types | CountrySelect + LookupSelect | Mixed | Drawer open | Client | varies | MEDIUM | Cache + dependent lazy |
| Geography | city | Country, Emirate | CountrySelect, EmirateSelect | Supabase | Drawer open | Client | small | LOW | Dependent fetch OK with cache |
| Finance | bank, tax-type | Country, bank/tax types | CountrySelect + LookupSelect | Mixed | Drawer open | Client | small | LOW | Cache |
| Finance | cost/profit center | Type, parent center, org, branch | LookupSelect + Cost/ProfitCenterSelect + Org selects | Mixed | Drawer open | Client | small–0 rows | MEDIUM | Migrate Cost/Profit/Branch/Owner to ERPCombobox + cache |
| Organization | organization-form-dialog | Country chain, Currency | Geo + CurrencySelect | Supabase | Drawer open | Client | medium | **HIGH** 5 geo + currency | Same as Customer geo cache |
| Branch | branch-form-dialog | Country chain (4 fields) | Geo selects | Supabase | Drawer open | Client | medium | **HIGH** | Geo cache + tab lazy |
| UOM | unit | Category | UomCategorySelect | Supabase | Drawer open | Client | 9 | MEDIUM | Convert to ERPCombobox + cache |
| UOM | conversion | From/To unit | UnitOfMeasureSelect | Supabase | Drawer open | Client | 40 | MEDIUM | Convert + category-filtered cache |
| Lookups | category/value | Scope enums, category picker | Plain Select | Local enums / list | Drawer open | N/A | tiny | LOW | Keep plain Select for enums |
| Numbering | numbering-rule | Module/entity enums | Plain Select | Static/server | Drawer open | N/A | tiny | LOW | Keep plain Select |

---

## 8. Matrix 8.2 — Plain Select Exception Matrix

| Module | Form | Field | Why Plain Select | Keep / Convert | Recommendation |
|--------|------|-------|------------------|----------------|----------------|
| Lookups | category-form-dialog | category_scope, module_code, etc. | Fixed enum / admin metadata | **Keep** | Document as enum exception |
| Lookups | value-form-dialog | category picker, badge enums | Admin FK + enums | **Keep** category picker until server-search needed | Convert category picker to searchable if list grows |
| Numbering | numbering-rule-form-dialog | module, entity type, reset period | Fixed enums | **Keep** | No DB fetch |
| Organizations | owner-company-select | Owner company | Legacy wrapper | **Convert** | ERPCombobox + cached list (2 rows today, scales with tenant) |
| Organizations | branch-select | Branch | Legacy wrapper | **Convert** | ERPCombobox + dependent cache by company |
| Finance | cost-center-select | Parent cost center | Legacy hierarchical picker | **Convert** | ERPCombobox + server filter by company |
| Finance | profit-center-select | Parent profit center | Same | **Convert** | Same |
| UOM | uom-category-select | Category | Pre-3B.2A legacy | **Convert** | ERPCombobox + cache (9 rows) |
| UOM | unit-of-measure-select | Unit | Pre-3B.2A legacy | **Convert** | ERPCombobox + category-filtered cache |
| Geography | port-select | Port | Wrapper exists but forms use other components | **Convert** if used | ERPCombobox + emirate filter |

---

## 9. Matrix 8.3 — Query Duplication Matrix

| Lookup / Data | Current Fetch Locations | Duplicate Risk | Cache Candidate | Priority |
|---------------|-------------------------|----------------|-----------------|----------|
| `global_lookup_values` by categoryCode | Every `LookupSelect` instance via `useLookupValues` → server action | **HIGH** — Customer loads 6 categories; PARTY_STATUS also in child dialogs | **Yes** — key: `lookup:{categoryCode}:{parentValueCode}` | **P0** |
| Category ID resolution | Inside every `getActiveLookupValuesByCategoryCode` call | **HIGH** — doubles query count | **Yes** — key: `lookupCategoryId:{code}` | **P0** |
| `countries` (250 rows) | Every `CountrySelect` mount | **HIGH** — Customer + Branch + Org + multiple geo forms | **Yes** — key: `countries:active` | **P0** |
| `currencies` (162 rows) | Every `CurrencySelect` mount | **HIGH** | **Yes** — key: `currencies:active` | **P1** |
| `emirates` | Every `EmirateSelect`; fetches all when `countryId` null | **MEDIUM** | **Yes** — key: `emirates:{countryId\|all}` | **P1** |
| `cities` | Every `CitySelect` | **MEDIUM** | **Yes** — key: `cities:{emirateId\|all}` | **P1** |
| `areas_zones` | Every `AreaZoneSelect` | **MEDIUM** | **Yes** — key: `areas:{cityId\|all}` | **P1** |
| `banks`, `payment_terms`, `tax_types` | Per wrapper mount | **MEDIUM** | **Yes** | **P1** |
| `uom_categories`, `units_of_measure` | UOM forms | **LOW** today | **Yes** | **P2** |
| `owner_companies`, `branches` | Org/finance forms | **LOW** today | **Yes** when multi-tenant grows | **P2** |
| Customer child records | contacts/addresses/banks sections | Per-section fetch on Edit | Session cache by customerId | **P1** (3B.6E) |

---

## 10. Matrix 8.4 — Drawer Load Matrix

| Form | Lookup / Select Count (approx) | Child Sections | Loads Children Immediately? | Runtime Risk | Recommendation |
|------|----------------------------------|----------------|----------------------------|--------------|----------------|
| **Customer** | 6 Lookup + 4 geo + 3 finance = **13** | Contacts, Addresses, Banks, Documents | Children only if `currentCustomer` (Edit); sections still **mounted hidden** | **CRITICAL** | Tab lazy-mount + lookup cache + parallel prefetch of Basic tab only |
| Organization | 4 geo + 1 currency = **5** | None | N/A | **HIGH** | Geo cache |
| Branch | 4 geo = **4** | None | N/A | **HIGH** | Geo cache |
| Emirate / Area / Port / Bank | 2–3 each | None | N/A | MEDIUM | Dependent lazy + cache |
| Cost / Profit Center | 4 each (lookup + org + branch + parent) | None | N/A | MEDIUM | Convert org selects + cache |
| Role / Users | 0 lookups | None | N/A | LOW | — |
| Numbering Rule | 0 combobox (enums) | None | N/A | LOW | — |
| Country / City / Currency / etc. | 0–2 | None | N/A | LOW–MEDIUM | — |
| UOM Unit / Conversion | 1–2 plain Select | None | N/A | MEDIUM | Convert wrappers |
| Lookup Category / Value | Plain Select | None | N/A | LOW | — |

### Customer Add drawer — estimated network ops on open (today)

```text
6 × LookupSelect     → 6 server action calls → ~12 Supabase queries
1 × CountrySelect    → 1 client query (250 rows)
1 × EmirateSelect    → 1 client query (all emirates, unfiltered)
1 × CitySelect       → 1 client query (all cities)
1 × AreaZoneSelect   → 1 client query
1 × CurrencySelect   → 1 client query (162 rows)
1 × PaymentTermSelect→ 1 client query
1 × TaxTypeSelect    → 1 client query
────────────────────────────────────────────
~14 network operations, ~470+ master-data rows loaded client-side
User only sees Basic tab initially
```

---

## 11. Matrix 8.5 — Future Module Standard Matrix

| Future Module | Expected Lookup Types | Recommended Pattern | Notes |
|---------------|----------------------|---------------------|-------|
| HR / Employees | Employee search, department, job title lookups, country | **Server-side search** for employees; cached lookups for small enums | Min 3 chars, debounce 300ms, max 50 results |
| Fleet / Vehicles | Vehicle search, plate, model, status lookups | **Server-side search** for vehicles | High cardinality |
| Workshop | Job types, bay, technician search | Mixed — cache job types, server search technicians | |
| Spare Parts / Inventory | Item/SKU search, UOM, warehouse, bin | **Server-side search** items; cached UOM/warehouse | Critical performance path |
| Projects | Project search, customer link, status | Server search projects; cached status | |
| Sales / CRM | Customer/opportunity search (existing customer combobox) | **Server-side search** | Reuse entity search hook |
| Procurement | Vendor search, PO status, payment terms | Server search vendors; cache payment terms | |
| Documents / DMS | Document type lookups | Cached LookupSelect | |
| Tasks | Priority, status, assignee search | Cache enums; server search users | |
| AI Center | Model/provider enums | Local constants | No DB |

---

## 12. Combobox Dirty Tracking Gap Plan (from 3B.5)

**Problem**: `useFormDirty` listens for DOM `input`/`change` events. ERPCombobox selection uses Button + Popover — **no native form events**. Combobox-only edits do not trigger Safe Close.

**Global fix (planned for 3B.6C)**:

1. **`ERPCombobox`**: On `handleSelect` / `handleClear`, dispatch a bubbling synthetic event:
   ```typescript
   form?.dispatchEvent(new Event("change", { bubbles: true }));
   ```
   Or call optional `onDirtyMark` prop.

2. **`FormDirtyContext`** (optional enhancement): Provide `markDirty()` from `useFormDirty` via context near `ERPDrawerForm` so wrappers can call without DOM hacks.

3. **`LookupSelect` + all domain wrappers**: Pass through dirty signal; no per-form workaround.

4. **Acceptance**: Safe Close blocks outside click after combobox-only change on Customer, Role-free forms, Geography forms.

---

## 13. Global Performance Architecture Proposal

### 13.1 Recommended data layer: **TanStack Query v5**

**Why TanStack Query** (over custom cache):

- Standards already reference React Query / SWR (§11.7)
- Built-in stale time, deduplication, background refresh, devtools
- Fits Next.js App Router with client providers
- `@tanstack/react-table` already in stack — same ecosystem
- Avoids reinventing cache invalidation on master-data mutations

**Alternative acceptable for minimal deps**: Custom `LookupCacheProvider` with module-level Map + `useSyncExternalStore` — lighter but more maintenance. **Recommend TanStack Query** for ERP scale.

### 13.2 Cache key standard

```text
["lookup", categoryCode, parentValueCode ?? "root", includeInactive ? "all" : "active"]
["master", "countries", includeInactive ? "all" : "active", gccOnly ? "gcc" : "all"]
["master", "currencies", includeInactive ? "all" : "active"]
["master", "emirates", countryId ?? "all"]
["master", "cities", emirateId ?? "all"]
["master", "areas", cityId ?? "all"]
["master", "banks" | "payment_terms" | "tax_types", ...]
["entity", "customers", searchQuery]  // future server search
```

### 13.3 Stale time / refresh

| Tier | Data | staleTime | refetchOnWindowFocus |
|------|------|-----------|----------------------|
| Lookup values | global_lookup_values | 5–10 min | false |
| Geography | countries, emirates | 10 min | false |
| Finance basics | currencies, banks | 10 min | false |
| Org structure | companies, branches | 2 min | true |
| Entity search | customers, items | 0 (per query) | false |

**Invalidation**: On successful master-data create/update/delete server actions, call `queryClient.invalidateQueries({ queryKey: ["master", table] })` or category-specific lookup keys.

### 13.4 Combobox loading tier rules

| Tier | Size threshold | Pattern | Example |
|------|----------------|---------|---------|
| **T0 Static** | — | Local constants, no fetch | Numbering enums, boolean |
| **T1 Small cached** | < 50 rows | TanStack Query + ERPCombobox client filter | payment_terms, tax_types, uom_categories |
| **T2 Medium cached** | 50–300 rows | TanStack Query + ERPCombobox client filter + **virtualization if > 100** | countries, currencies, lookup categories |
| **T3 Dependent lazy** | varies | Fetch when parent selected; cache by parent key | emirates→country, cities→emirate |
| **T4 Server search** | 300+ or unbounded | Debounced API, min 2–3 chars, max 50 results | future customers, items, employees |

### 13.5 Debounce and search standard (for T4)

```text
minimumSearchLength: 2 (3 for entities)
debounceMs: 300
maxResults: 50
loading: skeleton in CommandList
empty: "Type to search…" / "No results"
keyboard: cmdk defaults preserved
clear: allowClear prop unchanged
```

### 13.6 Drawer runtime standard (evolve §21.1)

**New rule** (supersedes “load all tabs in parallel” for combobox-heavy drawers):

```text
1. Drawer opens instantly — never await lookups before showing shell
2. Basic tab fields: prefetch only Basic-tab lookups on open (or first paint)
3. ERPDrawerSection: lazy-mount children on first tab activation (not CSS hidden)
4. Child CRUD sections: mount only when tab first opened AND record id exists
5. Optional: parent prefetch via queryClient.prefetchQuery when tab hover/focus
6. Skeleton placeholders inside fields while TanStack Query loading
```

### 13.7 ERPCombobox runtime improvements (3B.6C)

- Add `@tanstack/react-virtual` when `options.length > 100`
- Memoize `options` mapping in wrappers with `useMemo`
- Avoid rebuilding `renderOption` inline where possible
- Consider `open` lazy fetch: defer TanStack Query `enabled: open || value` for non-critical fields (trade-off: slight delay on first open)

### 13.8 Server action optimization

Refactor `getActiveLookupValuesByCategoryCode`:

- Single query join category + values where possible, OR
- Cache category ID resolution in query layer (eliminates double round-trip)

Optional: add `getLookupValuesBatch(categoryCodes[])` for Customer Basic tab — **one server call** for 6 categories.

---

## 14. Future Development Rule (for standards update in 3B.6B)

Every new ERP form MUST:

1. Use **approved wrappers** only (`LookupSelect`, domain `*Select` on ERPCombobox, or `EntitySearchCombobox` for large lists).
2. Use **TanStack Query hooks** from `src/hooks/lookups/` — **no direct Supabase fetch in form body**.
3. Use **tab lazy-mount** via `ERPDrawerSection` enhancement.
4. Mark dirty on combobox change (automatic via ERPCombobox).
5. Classify each field using **T0–T4 tier** in form PR checklist.
6. No duplicate lookup category fetch in same form without batch API.

---

## 15. Implementation Subphase Plan

| Subphase | Title | Scope | Deliverables |
|----------|-------|-------|--------------|
| **3B.6B** | Global Lookup Cache and Hook Standard | Add TanStack Query provider; create `useLookupQuery`, `useMasterDataQuery` hooks; batch lookup server action; cache invalidation on mutations; update standards doc §21 | Hooks + provider + invalidation wiring |
| **3B.6C** | ERPCombobox Runtime, Debounce, Dirty Integration | Virtualization >100 items; synthetic change event / dirty context; optional lazy `enabled` on open; server-search combobox variant skeleton | ERPCombobox + LookupSelect + dirty Safe Close proof |
| **3B.6D** | Apply Optimized Hooks to Current Forms | Migrate all wrappers to query hooks; convert plain Select wrappers (org, uom, cost/profit); Customer/Org/Branch geo chain | All 23 forms on cached hooks |
| **3B.6E** | Lazy-Load Drawer Tabs and Child Sections | `ERPDrawerSection` mount-on-first-activate; child sections deferred; optional Basic-tab-only prefetch | Customer + multi-tab forms |
| **3B.6F** | Runtime Performance QA and Closure Gate | Network waterfall comparison; timing targets; Safe Close + combobox dirty; typecheck/lint/build | Performance QA report |

**Adjusted split rationale**: Batch lookup API in 6B reduces Customer impact before form-by-form migration in 6D. Lazy tabs in 6E separate from cache work to isolate regressions.

---

## 16. Future Testing Plan (for 3B.6 implementation)

### Browser / network metrics

| Metric | How to measure | Target (adjust after baseline) |
|--------|----------------|--------------------------------|
| Drawer open to interactive Basic tab | Performance API / filmstrip | < 300ms shell; lookups progressive |
| Combobox open (cached) | click → popover visible | < 150ms |
| Combobox search (medium list) | keystroke → filtered render | < 100ms client |
| Server search (future T4) | debounced request → results | < 300ms |
| Network requests on Customer Add open | DevTools count | **≤ 4** (batch lookup + geo prefetch Basic only) vs ~14 today |
| Duplicate lookup fetches same category | DevTools filter | **0** per session |
| Safe Close after combobox-only edit | Manual + harness | Must block close |
| typecheck / lint / build | CI | Pass |

### Before/after checklist

- [ ] Record baseline Customer Add open network waterfall (today ~14 requests)
- [ ] Record baseline time to first combobox interactive
- [ ] After 3B.6D: duplicate category fetches eliminated
- [ ] After 3B.6E: hidden tabs produce zero network until opened
- [ ] After 3B.6C: combobox-only dirty triggers Safe Close
- [ ] Regression: footer, required markers, Save/Save&Close unchanged

---

## 17. Risks and Assumptions

| Risk | Mitigation |
|------|------------|
| TanStack Query adds bundle size | Accept ~13kb gzip; significant DX and cache wins |
| Lazy tabs break `useFormDirty` / hidden required validation | Validate on Save across all tabs; scroll-to-error |
| Stale cache after master-data edit | Strict invalidation in server actions |
| Virtualization breaks cmdk keyboard nav | Test with @tanstack/react-virtual + cmdk patterns |
| RLS policy changes affect cache | Cache is per-user session; no cross-user leak |
| Standards §21.1 conflict with lazy load | Update standards in 3B.6B to progressive loading model |

**Assumptions**

- Current row counts (250 countries, 278 lookup values) remain medium scale for 6–12 months
- HR/Fleet modules will need T4 server search within next planning horizon
- No schema changes required for cache layer (read-only optimization)

---

## 18. Final Recommendation

**Proceed to implementation phase 3B.6B** with this priority order:

1. **P0** — TanStack Query lookup/master hooks + batch lookup API + category ID deduplication  
2. **P0** — Combobox dirty integration (Safe Close completeness)  
3. **P1** — Customer/Org/Branch drawer tab lazy-mount  
4. **P1** — Convert remaining plain Select wrappers to ERPCombobox  
5. **P2** — Virtualization for countries/currencies  
6. **P2** — Server-side entity search foundation for future modules  

The audit confirms: **UI standards are in place; performance architecture is the missing layer.** Fixing it globally in shared hooks—not per-form patches—will benefit all current and future ERP modules.

---

## 19. Final Status

```text
PASS — Audit and performance optimization plan completed.
```

---

**Report Generated**: 2026-06-12  
**Phase**: ERP BASE 002F.3E.3B.6A  
**Next Step**: Review with Sameer/Dina → approve 3B.6B implementation  
**Stop Condition**: Met — no implementation started

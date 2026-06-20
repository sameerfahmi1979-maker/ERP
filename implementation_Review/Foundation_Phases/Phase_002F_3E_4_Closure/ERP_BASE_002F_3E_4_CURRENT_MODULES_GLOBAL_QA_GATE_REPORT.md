# ERP BASE 002F.3E.4 — Current Modules Global QA Gate Report

**Phase:** ERP BASE 002F.3E.4 — Current Modules Global QA Gate
**Date/Time:** 2026-06-12, 18:30 (UTC+4)
**Author:** Fable 5 (Cursor) — Global QA / Closure Gate run

---

## 1. Supabase Connection Confirmation

Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database schema changes were required for ERP BASE 002F.3E.4 Current Modules Global QA Gate.

All 29 expected tables verified live, with RLS enabled and active policies on every table:

| Table | RLS | Policies | Table | RLS | Policies |
|---|---|---|---|---|---|
| user_profiles | ✅ | 5 | banks | ✅ | 4 |
| roles | ✅ | 2 | currencies | ✅ | 4 |
| permissions | ✅ | 2 | payment_terms | ✅ | 4 |
| role_permissions | ✅ | 2 | tax_types | ✅ | 4 |
| user_roles | ✅ | 3 | uom_categories | ✅ | 4 |
| owner_companies | ✅ | 2 | units_of_measure | ✅ | 4 |
| branches | ✅ | 2 | uom_conversions | ✅ | 4 |
| global_numbering_rules | ✅ | 2 | cost_centers | ✅ | 4 |
| global_lookup_categories | ✅ | 3 | profit_centers | ✅ | 4 |
| global_lookup_values | ✅ | 3 | customers | ✅ | 4 |
| countries | ✅ | 4 | customer_contacts | ✅ | 4 |
| emirates | ✅ | 4 | customer_addresses | ✅ | 4 |
| cities | ✅ | 4 | customer_bank_details | ✅ | 4 |
| areas_zones | ✅ | 4 | customer_documents | ✅ | 4 |
| ports | ✅ | 4 | | | |

No table name mismatches found.

---

## 2. Standards / Reports Reviewed

- `docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md` (maintained throughout 3B.6G arc)
- Customer closure: `ERP_BASE_002F_3E_3B_7_CUSTOMER_MODULE_FINAL_QA_AND_CLOSURE_REPORT.md`
- 3B.6G.6 runtime QA closure / Organization & Branch prefetch wiring report
- 3B.6G.5 apply-standard / future-ready modules report
- 3B.6F combobox/form performance closure gate report
- 3B.6G.3B contacts loading investigation report

Customer module remains CLOSED WITH NOTES and is the reference implementation. Nothing in this gate reopened it.

---

## 3. Module Inventory Matrix

29 protected routes inventoried under `src/app/(protected)/`. All are dynamic (ƒ) and built successfully.

| Module | Route | List | Add | Edit | View | Server Actions | Status |
|---|---|---|---|---|---|---|---|
| Dashboard | /dashboard | — | — | — | — | — | OK |
| Users | /admin/users | ✅ | ✅ | ✅ | ✅ | actions/users.ts (5 perm checks) | OK |
| Roles | /admin/roles | ✅ | ✅ | ✅ | ✅ | actions/roles.ts (7) | OK |
| Permissions | /admin/permissions | ✅ | — | — | ✅ | actions/permissions.ts (3) | OK |
| Organizations | /admin/organizations | ✅ | ✅ | ✅ | ✅ | actions/organizations.ts (5) | OK |
| Branches | /admin/branches | ✅ | ✅ | ✅ | ✅ | actions/branches.ts (5) | OK |
| Numbering Rules | /admin/settings/numbering | ✅ | ✅ | ✅ | ✅ | actions/numbering.ts (10) | OK |
| Lookup Categories | /admin/master-data/lookups/categories | ✅ | ✅ | ✅ | ✅ | actions/master-data/lookups.ts (22) | OK |
| Lookup Values | /admin/master-data/lookups/values | ✅ | ✅ | ✅ | ✅ | actions/master-data/lookups.ts | OK |
| Locked System Values | /admin/master-data/lookups/system | ✅ | — | — | ✅ | actions/master-data/lookups.ts | OK |
| Geography (Countries/Emirates/Cities/Areas/Ports) | /admin/master-data/geography/* (5 routes) | ✅ | ✅ | ✅ | ✅ | features/master-data/geography/actions.ts (27) | OK |
| Finance Basics (Currencies/Payment Terms/Tax Types/Banks/Cost/Profit Centers) | /admin/master-data/finance-basics/* (6 routes) | ✅ | ✅ | ✅ | ✅ | features/master-data/finance-basics/actions.ts (37) | OK |
| UOM (Categories/Units/Conversions) | /admin/master-data/uom/* (3 routes) | ✅ | ✅ | ✅ | ✅ | features/master-data/uom/actions.ts (16) | OK |
| Customers (+ contacts/addresses/bank details children) | /admin/master-data/customers | ✅ | ✅ | ✅ | ✅ | actions/master-data/customers.ts (13) + 3 child action files (22 combined) | CLOSED (reference) |
| Audit Logs | /admin/audit | ✅ | — | — | ✅ | queries/audit.ts (page perm-gated) | OK |
| Profile / Settings | /profile, /settings | — | — | ✅ | ✅ | self-service (auth-gated only, by design) | OK |

---

## 4. Source Audit Findings

- 13 server action files in `src/server/actions/**`; all mutation files use `getAuthContext` + `hasPermission`. The only file without `hasPermission` is `audit.ts`, which is the internal `logAudit` helper — it requires an authenticated profile via `getAuthContext` and is not an exposed mutation. Not a bypass.
- Feature-level master-data actions (geography 27, finance-basics 37, UOM 16 permission checks) are fully permission-gated server-side.
- `revalidatePath` used consistently after mutations in all action files.
- No direct Supabase `createClient` calls in any shared selector component (`src/components/erp/**`) — all domain selectors go through cached TanStack hooks.
- `src/server/queries/*` (list/read helpers) carry no inline permission checks; they are invoked from pages that check `hasPermission` first, and RLS is the backstop. Acceptable pattern; documented.

---

## 5. Navigation / Sidebar QA

- All 29 implemented routes are reachable from the sidebar; every sidebar admin link maps 1:1 to an existing `page.tsx`.
- Manual multi-open group behavior intact (`toggleGroup` keeps other groups open).
- Route protection verified in `src/lib/supabase/middleware.ts`: unauthenticated access to `/dashboard`, `/admin/*`, `/settings`, `/profile` redirects to `/login?redirectTo=…`; authenticated users on auth routes redirect to `/dashboard`.
- **Defect found and fixed (blocking per gate spec "no dead menu links"):** 8 future-module sidebar links (`/modules/fleet`, `/modules/hr`, `/modules/workshop`, `/modules/hse`, `/modules/finance`, `/modules/inventory`, `/modules/procurement`, `/modules/documents`) pointed to non-existent routes → 404. Fixed in `src/components/layout/app-sidebar.tsx` by adding a `comingSoon` flag; these items now render disabled with a "Soon" badge (tooltip "(coming soon)" when collapsed) and are no longer clickable links. No routes were created (future modules remain out of scope).

---

## 6. List Page QA (source-based)

All list pages follow the established table standard (server-fetched initial data, status badges, action menus, add buttons permission-aware). Customer, Organization, Branch lists additionally wire form prefetch on mount and on add/edit click. No broken columns or missing empty states found in source. Runtime click-through was not possible (no authenticated browser session) — see §15.

---

## 7. Form Standard QA

Verified by exhaustive source scan across `src/features/**`:

| Check | Result |
|---|---|
| All form dialogs/drawers use `ERPFormFooter` | ✅ 0 files without it |
| All form dialogs/drawers use `RequiredLabel` | ✅ 25/25 form components |
| All form dialogs/drawers use `useFormDirty` | ✅ 0 files without it |
| Add/Edit footer Cancel / Save / Save & Close; View footer Close only | ✅ via shared `ERPFormFooter` mode prop |
| Safe Close on dirty text edit and combobox-only edit | ✅ (verified in 3B.6C/3B.6F; `markDirty` wired to combobox onChange) |
| View mode does not mark dirty | ✅ |
| Sticky footer / no horizontal scroll | ✅ per drawer/dialog standard components |

### Form Standard Matrix

| Form | RequiredLabel | ERPFormFooter | Save | Save&Close | SafeClose | Combobox Dirty | Status |
|---|---|---|---|---|---|---|---|
| Customer drawer | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | CLOSED |
| Organization dialog | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | OK |
| Branch dialog | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | OK |
| Role dialog | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | OK |
| Numbering Rule dialog | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | OK |
| Lookup Category/Value dialogs | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | OK |
| Geography dialogs (5) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (cascading fixed in 3B.6D) | OK |
| Finance Basics dialogs (6) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | OK |
| UOM dialogs (3) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | OK |

---

## 8. Combobox / Lookup Runtime QA

- All domain selectors use `ERPCombobox`/`LookupSelect` or the documented enum `Select` exception.
- No direct Supabase fetches inside selector components — all selectors delegate to cached hooks (`use-lookup-values`, `use-geography-queries`, `use-finance-queries`) backed by shared fetchers in `master-data-fetchers.ts`.
- Dependent comboboxes (country → emirate → city) behave correctly; the 3B.6D regression (emirate cleared on edit init) remains fixed.
- Debounced search, clear, and dirty-event behavior verified in 3B.6C/3B.6F and unchanged since.

---

## 9. Numbering QA

- Numbering rules page + add/edit/view dialogs work; all 10 numbering server actions permission-checked (`numbering.rules.view` / `numbering.rules.manage`).
- `generateNextReference` used by: numbering admin actions, `customers.ts` (customer code), `customer-contacts.ts` (contact code). Codes are server-generated; code fields are read-only in forms; no manual typing path.
- Sequential server-action execution prevents duplicate generation from repeated Save (verified in 3B.7).
- Organizations/Branches use their existing code conventions (no numbering-rule integration claimed or required at this gate).

---

## 10. Permissions / RLS Matrix

| Module | View Perm | Manage Perm | Server Checked | UI Checked | RLS | Status |
|---|---|---|---|---|---|---|
| Users | ✅ | ✅ | ✅ | ✅ | ✅ (5 policies) | OK |
| Roles / Permissions | ✅ | ✅ | ✅ | ✅ | ✅ | OK |
| Organizations | ✅ | ✅ | ✅ | ✅ | ✅ | OK |
| Branches | ✅ | ✅ | ✅ | ✅ | ✅ | OK |
| Numbering | ✅ | ✅ | ✅ | ✅ | ✅ | OK |
| Lookups | ✅ | ✅ | ✅ (22 checks) | ✅ | ✅ | OK |
| Geography | ✅ | ✅ | ✅ (27 checks) | ✅ | ✅ | OK |
| Finance Basics | ✅ | ✅ | ✅ (37 checks) | ✅ | ✅ | OK |
| UOM | ✅ | ✅ | ✅ (16 checks) | ✅ | ✅ | OK |
| Customers + children | ✅ | ✅ | ✅ (35 checks combined) | ✅ | ✅ | CLOSED |

Notes: `/profile` and `/settings` are intentionally auth-gated only (self-service). `/admin/settings/numbering` page has no page-level guard but its data call (`getNumberingRules`) is permission-checked server-side; an unauthorized user sees an empty shell rather than an access-denied card — recorded as a minor non-blocking UX note.

---

## 11. Runtime Performance Matrix

| Area | Cache/Prefetch | Lazy Loading | Invalidation | Status |
|---|---|---|---|---|
| Lookup values (global) | TanStack cache, batch prefetch (`prefetchLookupCategories`) | n/a | category-targeted | OK |
| Master data (countries/currencies/…) | shared fetchers + query keys | n/a | targeted | OK |
| Customer form | page-mount + click prefetch (`useCustomerFormPrefetch`) | drawer tabs lazy-mount | targeted | CLOSED |
| Customer child tables | `useChildTableQuery` (staleTime 5 min, gc 30 min) | lazy (`enabled: !!parentId` + lazyMount) | `createChildInvalidator` targeted | OK |
| Organization form | mount + click prefetch wired (3B.6G.6) | n/a (dialog) | targeted | OK |
| Branch form | mount + click prefetch wired (3B.6G.6) | n/a (dialog) | targeted | OK |

---

## 12. FormData Safety QA

- Customer drawer: child sections lazy-mount safely (children are not FormData fields); parent Basic-tab inputs remain mounted. Saving without visiting all tabs does not wipe hidden data (verified 3B.6E/3B.7).
- The 3B.7 fix (`effectiveCustomerId`) keeping child sections unlocked after Add → Save is intact.
- Organization/Branch multi-section dialogs keep all sections mounted (no lazy unmount of FormData-dependent fields).

---

## 13. Dev Harness Status

| Route | Production Guard | Decision |
|---|---|---|
| /dev/performance-qa | `notFound()` in production ✅ | Retain guarded for manual QA |
| /dev/customer-prefetch-qa | `notFound()` in production ✅ | Retain guarded for manual QA |
| /dev/customer-child-qa | `notFound()` in production ✅ | Retain guarded for manual QA |

All three appear in the build output but return 404 in production. **They must be deleted before production deployment** — carried forward as a standing pre-deployment task.

---

## 14. Bugs Found / Fixed / Deferred

### Issues Matrix

| Issue | Severity | Fixed/Deferred | Notes |
|---|---|---|---|
| 8 dead sidebar links to unbuilt `/modules/*` routes (404 on click) | Blocking (gate: "no dead menu links") | **Fixed** | `comingSoon` flag; disabled items with "Soon" badge in `app-sidebar.tsx` |
| Numbering page shows empty shell instead of access-denied for unauthorized users | Minor | Deferred | Data is still permission-gated server-side; cosmetic only |
| `src/server/queries/*` rely on page-level permission checks + RLS | Informational | Deferred | Acceptable pattern; consider inline checks when queries are reused elsewhere |
| Pre-existing lint errors (60), mostly `no-explicit-any` in `lookups.ts` + warnings in prototypes | Non-blocking | Deferred | Pre-existing, documented in prior phases; none introduced by this phase |
| Browser-authenticated runtime QA unavailable | Non-blocking | Deferred | Manual QA checklist applies (Sameer/Dina) |
| Dev harnesses retained (guarded) | Non-blocking | Deferred | Delete before production deployment |
| Next.js deprecation: `middleware` file convention → `proxy` | Non-blocking | Deferred | Build warning only; migrate in a future maintenance phase |

No other blocking defects found. Save / Save & Close / Safe Close / numbering / invalidation paths all verified intact.

---

## 15. Static Test Results

| Test | Result |
|---|---|
| `npm run typecheck` | ✅ PASS (0 errors) |
| `npm run lint` | ⚠ Ran; 60 errors / 78 warnings — all pre-existing (`lookups.ts` `no-explicit-any`, prototype unused imports). **0 new issues introduced by this phase**; the modified `app-sidebar.tsx` is lint-clean |
| `npm run build` | ✅ PASS — all 38 routes compiled (Next.js 16.2.6 / Turbopack) |

---

## 16. Runtime QA Method Note

No authenticated browser session was available in this environment. QA was performed via: live Supabase verification, exhaustive source audit, existing guarded dev harnesses (from 3B.6F/3B.6G), static build/typecheck, and the accumulated runtime evidence of phases 3B.6C–3B.7. A manual click-through of §7 routes (Customer, Organization, Branch, Role, Numbering, Country, Bank, UOM Unit, Lookup Category Add/Edit/View) is recommended for Sameer/Dina as final human confirmation.

---

## 17. Closure Recommendation

All currently implemented base modules are inventoried, standards-compliant, permission-gated, RLS-protected, and build clean. The Customer module remains closed as the reference implementation; Organization and Branch are not broken and carry prefetch wiring. The single blocking navigation defect found (dead future-module links) was fixed in-phase. The base is stable enough to proceed to the next business / party-master module, subject to the manual click-through note above.

---

## 18. Final Status

```text
PASS WITH NOTES — Gate passed with non-blocking notes.
```

Notes: browser-authenticated runtime QA unavailable (source/harness/static QA used instead); dev harnesses retained guarded and must be deleted before production; pre-existing lint debt documented; numbering page access-denied UX cosmetic gap; middleware→proxy deprecation pending.

**Stop condition honored: no next module started. Awaiting Sameer/Dina review.**

# ERP_BASE_002F_3E_3B_6G_3 — Customer Child Tables TanStack Query Migration — Implementation Report

## 1. Phase Name

ERP BASE 002F.3E.3B.6G.3 — Customer Child Tables TanStack Query Migration (contacts, addresses, bank details from manual `useEffect + useState + reload` to TanStack Query with targeted invalidation).

## 2. Date / Time

2026-06-12, ~16:50–17:10 (UTC+4).

## 3. Supabase Connection Confirmation

Connected to live Supabase project: `https://mmiefuieduzdiiwnqpie.supabase.co`

No database schema changes were required for 3B.6G.3 Customer Child Tables TanStack Query Migration.

Fresh SQL verification this session: `customers`, `customer_contacts`, `customer_addresses`, `customer_bank_details`, `customer_documents`, `global_lookup_categories`, `global_lookup_values` — all present in the public schema.

## 4. Standards / Reports Reviewed

`ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md` (§4 Child Table Standard, §8 rules 2/5), Cursor and UI/UX guides, 3B.6G plan, 3B.6G.1 + 3B.6G.2 reports, 3B.6F closure gate, 3B.6E lazy-load report, 3B.4C Safe Close report. Source: the three child section components, `customer-form-drawer.tsx`, `customer-contacts.ts` / `customer-addresses.ts` / `customer-bank-details.ts` server actions, `query-keys.ts`, `invalidation.ts`, `query-client.ts`.

## 5. Source Audit Findings

| Question | Answer |
|----------|--------|
| Where are child fetch actions defined? | `src/server/actions/master-data/customer-contacts.ts` (`getCustomerContacts(customerId): ActionResult<CustomerContact[]>`), `customer-addresses.ts`, `customer-bank-details.ts` — all auth + permission checked. |
| Where are child mutations defined? | Same three files: `create/update/deleteCustomerContact`, `create/update/deleteCustomerAddress`, `create/update/deleteCustomerBankDetail`. |
| How were sections loading data? | Manual pattern in all three: `useState` for rows + `loading`, `loadX()` async function, `useEffect(() => { loadX(); }, [customerId])`, and `loadX()` re-called after every successful mutation. No caching — every tab visit refetched. |
| Did sections fetch on mount? | Yes — immediately via `useEffect`. |
| Already lazy-mounted by tab activation? | Yes (3B.6E): Contacts tab uses `ERPDrawerSection lazyMount`; Addresses guarded by `currentCustomer && mountedSections.has("location")`; Bank Details by `currentCustomer && mountedSections.has("finance")`. All also require a saved customer. |
| Do `queryKeys.child.customerContacts/Addresses/BankDetails` exist? | Yes — created in 3B.6G.1, previously unconsumed. |
| Do invalidation helpers exist? | Yes — `invalidateCustomerContacts/Addresses/BankDetails` in `invalidation.ts` (3B.6G.1), previously unconsumed. |

## 6. Hooks Created

`src/features/master-data/customers/hooks/use-customer-child-queries.ts` (NEW):

- `useCustomerContactsQuery(customerId, options?)`
- `useCustomerAddressesQuery(customerId, options?)`
- `useCustomerBankDetailsQuery(customerId, options?)`

Each: TanStack `useQuery` keyed by `queryKeys.child.*`; queryFn calls the existing server action and throws on `!success` (handled by TanStack, surfaced as `error: string | null`); `enabled: !!customerId && (options.enabled ?? true)`; returns `{ items, isLoading, isFetching, error, refetch }`. Settings per prompt §6: `staleTime: 30 s` (editable rows must not stay stale), `gcTime: 10 min` (cache survives drawer close/reopen), `refetchOnWindowFocus: false`.

`useCustomerDocumentsQuery` deferred — no documents fetch action/section exists yet (placeholder tab only), per prompt "otherwise defer".

## 7. Components Migrated

All three components, identical surgical changes; ALL UI preserved (layout, empty states, add/edit dialogs, delete confirms, disabled/view mode, toast messages, button labels untouched):

| Component | Removed | Added |
|-----------|---------|-------|
| `customer-contacts-section.tsx` | `contacts`/`loading` state, `loadContacts()`, `useEffect`, `getCustomerContacts` import, 3 × `loadContacts()` calls | `useCustomerContactsQuery(customerId)`, `useQueryClient`, 2 × `invalidateCustomerContacts(queryClient, customerId)` |
| `customer-addresses-section.tsx` | same pattern | `useCustomerAddressesQuery` + `invalidateCustomerAddresses` |
| `customer-bank-details-section.tsx` | same pattern | `useCustomerBankDetailsQuery` + `invalidateCustomerBankDetails` |

Loading UX preserved: same `"Loading …"` text on initial load (`isLoading`); background refetches (`isFetching`) do not block UI. New small non-blocking error line added (`Failed to load …: <message>`) — previously fetch errors were silently swallowed. Verified zero remaining references to `loadContacts/loadAddresses/loadBankDetails/getCustomer*` in the components.

## 8. Query Keys Used

- `["child","customer_contacts",customerId]` via `queryKeys.child.customerContacts(customerId)`
- `["child","customer_addresses",customerId]` via `queryKeys.child.customerAddresses(customerId)`
- `["child","customer_bank_details",customerId]` via `queryKeys.child.customerBankDetails(customerId)`

Exactly the 3B.6G.1 convention; no hand-written key arrays.

## 9. Invalidation Helpers Used

`invalidateCustomerContacts/Addresses/BankDetails(queryClient, customerId)` — called after successful create/update (in `handleSubmit`) and delete (in `handleDelete`). Each targets exactly one `["child", table, customerId]` entry. No customer-list, parent, master, or sibling-child invalidation anywhere.

## 10. Lazy Mount Preservation

`customer-form-drawer.tsx` untouched this phase. Verified in source:

- Contacts: `<ERPDrawerSection id="contacts" … lazyMount>` + `currentCustomer ? <CustomerContactsSection> : "Save customer first…"` (drawer lines 533–538)
- Addresses: `{currentCustomer && mountedSections.has("location") && <CustomerAddressesSection …>}` (lines 524–529)
- Bank details: `{currentCustomer && mountedSections.has("finance") && <CustomerBankDetailsSection …>}` (lines 597–602)

Therefore: **child query cannot fire before section mount** (component not in tree until tab activation) and **child query cannot fire without customerId** (drawer renders sections only with `currentCustomer`, plus the hook's own `enabled: !!customerId` second gate).

## 11. Child Fetch Behavior

- First tab activation with saved customer → one fetch, cached under the child key.
- Switch away/back within 30 s staleTime → instant render from cache, zero refetch; after 30 s → instant render + background revalidate (non-blocking).
- Drawer close/reopen same customer within 10 min gcTime → cached rows render instantly.
- Add mode → section not rendered ("Save customer first…"), no query.
- Different customer → different key → independent fetch/caching.

## 12. Mutation Invalidation Behavior

Runtime-proven in the harness (§14): invalidating contacts marked ONLY `["child","customer_contacts",1]` invalidated while `["child","customer_addresses",1]` and `["child","customer_bank_details",1]` stayed fresh and untouched; invalidating addresses then touched only the addresses key. Active observers refetch immediately (replacing the old manual `loadX()`); inactive keys refetch on next observation.

## 13. Parent Dirty / Safe Close Behavior

- No `markDirty` introduced in child sections; `useFormDirty` and the drawer untouched.
- Child add/edit/delete happens inside the child's own `<Dialog>` (a separate DOM subtree from the parent `<form>`), so child input changes do not bubble into the parent form's dirty listener — unchanged from before this phase.
- Parent field edits and combobox-only edits still mark dirty (3B.6C mechanism untouched).
- Safe Close unaffected: this phase only changed how child rows are fetched, not any form/dirty/save code path.

## 14. Runtime / Browser QA Result

Authenticated route unavailable (unchanged constraint). Per prompt §10, dev harness created at `/dev/customer-child-qa` (production-guarded with `notFound()`) using the PRODUCTION hooks and invalidation helpers, exercised live via browser automation:

| Test | Result |
|------|--------|
| No fetch before probe mount | Cache showed **0 child entries** until a probe mounted. |
| Enabled gating (`customerId=null`) | Probe mounted: `loading=false, fetching=false, error=none`; cache entry `["child","customer_contacts",null]` stayed `pending/idle` — **never fetched**. |
| Fetch on mount with real id (`customerId=1`) | Query fired exactly on mount; unauthenticated session surfaced the server action's permission error through the hook's `error` field (proves fetch trigger + error path + non-throwing behavior). |
| Targeted invalidation — contacts | Only `["child","customer_contacts",1]` flagged invalidated (and auto-refetched as it had an active observer); addresses + bank details keys remained `success/idle`, untouched. |
| Targeted invalidation — addresses | Only the addresses key flagged invalidated; bank details untouched. |

Pending logged-in manual verification (Sameer/Dina, per prompt §10.1–10.5): real Contacts/Location/Finance tab network waterfall and live mutation flows. Harness retained for review; delete with the other `/dev/*` harnesses before production deployment.

## 15. Static Test Results

| Test | Result |
|------|--------|
| `npm run typecheck` | **PASS** (exit 0) |
| `npm run lint` | Run; all 6 touched files lint clean (scoped eslint exit 0). Repo-wide total **dropped from 147 to 138 problems** (60 errors, 78 warnings) — this phase removed several pre-existing unused-variable warnings (`catch (error)` → `catch`) and introduced zero new issues. Remaining issues are pre-existing and documented in earlier reports. |
| `npm run build` | **PASS** (exit 0; `/dev/customer-child-qa` compiles, 404 in production) |

## 16. Known Limitations

1. Authenticated in-app QA (real tab waterfall, live add/edit/delete flows) pending manual review — same environment constraint as 3B.6F/3B.6G.2.
2. Customer Documents has no fetch action/section yet — `useCustomerDocumentsQuery` deferred by design.
3. Two dev harnesses now exist (`/dev/customer-prefetch-qa`, `/dev/customer-child-qa`) plus `/dev/performance-qa` — all production-guarded; delete after review.
4. Child dialogs' `LookupSelect`s (CONTACT_TYPES etc.) fetch on first dialog open — correct per standard §3.6 (lazy-tab categories are not in the open-time batch).

## 17. Next Phase Recommendation

Proceed to **3B.6G.4 — Generic Child Table Query/Invalidation Pattern**: extract the now-proven per-entity hook shape into a generic `useChildTableQuery(tableName, parentId, fetcher, options)` + declaration-driven wiring, so Vendor/Subcontractor/Consultant child sections (which share the identical manual pattern today) migrate without copy-paste.

## 18. Final Status

**PASS WITH NOTES — Implemented with non-blocking notes.**

All closure criteria met: contacts/addresses/bank details use TanStack Query with `queryKeys.child.*`; queries enabled only with customerId; sections remain lazy-mounted; mutations invalidate only their own child query (runtime-proven); manual reload functions fully removed; typecheck and build pass; report created. Notes: authenticated browser QA pending manual review (clean PASS withheld per prompt §14).

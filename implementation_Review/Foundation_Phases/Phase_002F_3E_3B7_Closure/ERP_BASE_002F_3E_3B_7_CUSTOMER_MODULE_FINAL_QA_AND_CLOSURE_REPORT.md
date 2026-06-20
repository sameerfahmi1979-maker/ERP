# ERP BASE 002F.3E.3B.7 Closure Report
## Customer Module Final QA and Closure

**Phase:** ERP BASE 002F.3E.3B.7  
**Date/Time:** 2026-06-12  
**Engineer:** Cursor AI Agent (Sonnet 4.6)  
**Supabase Project:** https://mmiefuieduzdiiwnqpie.supabase.co

---

## 1. Phase Name

**ERP BASE 002F.3E.3B.7 — Customer Module Final QA and Closure**

This is the final QA gate for the Customer module, covering everything built in phases 3B.6A through 3B.6G.6 plus the 3B.6G.3B contacts loading fix.

---

## 2. Supabase Verification

Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co

No database schema changes were required for 3B.7 Customer Module Final QA and Closure.

### Security / RLS

| Table | RLS Enabled | Policies |
|-------|------------|----------|
| `customers` | ✅ | 4 |
| `customer_contacts` | ✅ | 4 |
| `customer_addresses` | ✅ | 4 |
| `customer_bank_details` | ✅ | 4 |
| `customer_documents` | ✅ | 4 |

### Numbering Rules

| Document Type | Active |
|--------------|--------|
| `CUSTOMER` | ✅ |
| `CUSTOMER_CONTACT` | ✅ |

Note: customer addresses and bank details intentionally do not use numbered references (they use plain ids) — confirmed consistent with the server actions.

### Lookup Categories (all active)

`CUSTOMER_TYPES`, `INDUSTRY_TYPES`, `CUSTOMER_SEGMENTS`, `CRM_LEAD_SOURCES`, `PARTY_STATUS_TYPES`, `ICV_STATUS_TYPES`, `CONTACT_TYPES`, `COMMUNICATION_PREFERENCE_TYPES`, `ADDRESS_TYPES`, `BANK_ACCOUNT_TYPES` — 10/10 verified active in live `global_lookup_categories`.

---

## 3. QA Areas and Results

### 3.1 Server Actions QA — PASS

Files: `customers.ts`, `customer-contacts.ts`, `customer-addresses.ts`, `customer-bank-details.ts`

Every action follows the full chain, verified line-by-line:

```
1. Zod schema validation (safeParse with detailed error mapping)
2. getAuthContext() + hasPermission() RBAC check
   - view → "master_data.party_master.view"
   - mutate → "master_data.party_master.manage"
3. Numbering (CUSTOMER / CUSTOMER_CONTACT via generateNextReference)
4. Lock/system protection (is_locked / is_system require system_admin)
5. Primary flag uniqueness (unset previous primary before insert/update)
6. logAudit() with old/new values
7. revalidatePath("/admin/master-data/customers")
```

Actions verified: `getCustomers`, `getCustomerById`, `createCustomer`, `updateCustomer`, `deactivateCustomer`, `reactivateCustomer`, `lockCustomer`, `unlockCustomer`, `deleteCustomer` + full CRUD for contacts/addresses/bank details.

### 3.2 Parent Drawer QA — PASS (1 defect found and fixed)

| Check | Result |
|-------|--------|
| Drawer remounts cleanly per record (`key={mode-id}`) | ✅ |
| Duplicate-create prevention (Save after Add switches to edit with `createdCustomerId`) | ✅ |
| FormData safety: Basic/Location/Finance/Compliance always mounted | ✅ |
| `lazyMount` only on FormData-safe tabs (Contacts, Documents, Audit) | ✅ |
| Partial lazy-mount for embedded child CRUD (location/finance) | ✅ |
| Safe Close: dirty intercepts Escape/outside-click/close button | ✅ |
| Unsaved Changes dialog: Stay / Discard both work | ✅ |
| Save resets dirty, stays open; Save & Close closes on success | ✅ |
| Enter key triggers Save & Close | ✅ |
| List refreshes on drawer close (`handleRefresh` via `onOpenChange`) | ✅ |
| View mode disables all inputs and dirty tracking | ✅ |
| Validation: name + type required (Zod, server-side) | ✅ |

#### Defect found and FIXED during this QA

**Issue:** After Add → **Save** (drawer stays open and switches to edit mode), the Contacts / Additional Addresses / Bank Details sections remained locked with "Save customer first to add contacts" — because they checked the original `customer` prop, which stays `null` until the drawer is reopened. The placeholder text instructed users to save, but saving did not unlock the sections.

**Fix:** Introduced `effectiveCustomerId = currentCustomer?.id ?? createdCustomerId` and switched the three child-section guards to use it.

```typescript
// 3B.7 fix: after Add → Save (drawer stays open), child sections must unlock
// using the newly created id, not just the original customer prop.
const effectiveCustomerId = currentCustomer?.id ?? createdCustomerId;
```

**Result:** Users can now Add Customer → Save → immediately add contacts, addresses, and bank details in the same drawer session without closing/reopening.

**Not changed:** The Audit tab still requires the full customer object (it displays created_at/updated_at fields), so it correctly continues to show its placeholder until the drawer is reopened.

### 3.3 Child Sections QA — PASS

(Carried forward from 3B.6G.3B, re-verified)

| Check | Result |
|-------|--------|
| Contacts/addresses/banks fetch only on tab activation + parentId | ✅ `enabled: !!parentId` + `lazyMount` |
| `staleTime` 5 min / `gcTime` 30 min (3B.6G.3B fix) | ✅ |
| Skeleton loading UI in all three sections | ✅ |
| Dialog lookup prefetch on section mount (CONTACT_TYPES etc.) | ✅ |
| Targeted invalidation only (no parent/sibling cache touched) | ✅ |
| Child mutations do not mark parent dirty | ✅ |

### 3.4 Prefetch / Cache QA — PASS

(Carried forward from 3B.6G.2/6, re-verified)

| Check | Result |
|-------|--------|
| `CUSTOMER_FORM_PREFETCH` fires on page mount + every drawer open | ✅ |
| One batch action seeds 6 lookup categories simultaneously | ✅ |
| 4 master lists (countries/currencies/payment terms/tax types) prefetched in parallel | ✅ |
| Reopen within staleTime = zero network calls | ✅ |
| Prefetch is fire-and-forget — drawer open is never blocked | ✅ |

### 3.5 Permissions QA — PASS

| Check | Result |
|-------|--------|
| List page gated by `master_data.party_master.view` (server-side) | ✅ |
| Add/Edit/Delete buttons hidden without `manage` permission | ✅ |
| Lock/unlock visible only to `system_admin` | ✅ |
| All server actions re-check permissions independently of UI | ✅ |

---

## 4. Files Modified in This Phase

| File | Change |
|------|--------|
| `src/features/master-data/customers/components/customer-form-drawer.tsx` | Added `effectiveCustomerId`; child sections (contacts, addresses, bank details) now unlock immediately after first Save in Add mode |

No other code changes. This was a QA phase; the single fix addresses a defect found during QA.

---

## 5. Static Test Results

| Test | Result |
|------|--------|
| `npx tsc --noEmit` | **PASS** — 0 errors |
| `npm run build` | **PASS** — clean production build |
| `ReadLints` on modified file | **PASS** — 0 errors |
| `npm run lint` | 138 pre-existing issues (documented since 3B.6F) — 0 new |

---

## 6. Dev Harness Status (unchanged)

`/dev/performance-qa`, `/dev/customer-prefetch-qa`, `/dev/customer-child-qa` — all production-guarded with `notFound()`. **Must be deleted before production deployment.** Retained for manual review.

---

## 7. Manual QA Checklist for Sameer (final acceptance)

1. `npm run dev` → open `/admin/master-data/customers`
2. **Add flow:** Add Customer → fill Basic → Save (not Save & Close) → confirm drawer stays open in Edit mode → click Contacts tab → **confirm you can now add a contact immediately** (this is the new fix)
3. **Lookups:** confirm all 6 Basic-tab comboboxes appear populated together (no one-by-one loading)
4. **Child tabs:** click Contacts/Location/Finance — confirm skeleton placeholders then fast data; switch away and back — instant (cached)
5. **Safe Close:** change only Customer Type → press Esc → Unsaved Changes dialog → Stay keeps values → Discard closes
6. **Save & Close:** edit any field → Save & Close → drawer closes, list shows updated row
7. **FormData safety:** edit a customer, change one Basic field, save WITHOUT visiting other tabs → reopen → confirm Compliance/Finance fields kept their values
8. **Permissions (if test user available):** view-only user sees no Add/Edit/Delete buttons

---

## 8. Known Limitations (non-blocking)

1. Authenticated browser QA not executable in agent mode — manual checklist above covers it.
2. Audit tab remains placeholder until drawer reopen after Add (requires full customer object; intentional).
3. Customer Documents tab is a placeholder (DMS is a future phase).
4. `sales_owner_user_profile_id` is hardcoded `null` in save payload (sales-owner picker is a future enhancement).
5. 138 pre-existing lint issues in legacy/prototype files (tracked since 3B.6F).

---

## 9. Customer Module Phase History

| Phase | Scope | Status |
|-------|-------|--------|
| 3B.6A–6F | Combobox/caching/lazy-mount/dirty-tracking foundations | ✅ CLOSED |
| 3B.6G.1 | Runtime standard + prefetch utilities | ✅ CLOSED |
| 3B.6G.2 | Customer lookup prefetch wiring | ✅ CLOSED |
| 3B.6G.3 | Customer child tables TanStack migration | ✅ CLOSED |
| 3B.6G.3B | Contacts loading investigation + fix | ✅ CLOSED |
| 3B.6G.4 | Generic child table pattern | ✅ CLOSED |
| 3B.6G.5 | Standard applied to existing forms + templates | ✅ CLOSED |
| 3B.6G.6 | Org/Branch prefetch wiring + runtime QA | ✅ CLOSED |
| **3B.7** | **Customer module final QA and closure** | **✅ THIS REPORT** |

---

## 10. Final Status

**PASS WITH NOTES**

The Customer module passes final QA:
- Live Supabase verified: RLS + policies on all 5 tables, numbering rules active, all 10 lookup categories active.
- All server actions follow the full validation → RBAC → numbering → audit → revalidation chain.
- Parent drawer, Safe Close, save flows, FormData safety, lazy-mount, prefetch, and child-table caching all verified at source level.
- One genuine workflow defect found during this QA (child sections locked after Add → Save) — **fixed and verified** by typecheck + build.

**Notes (non-blocking):**
- Browser-based acceptance requires manual execution of the checklist in §7 by Sameer/Dina.
- Documents tab (DMS) and sales-owner picker are future-phase items.
- Dev harnesses must be removed before production deployment.

**The Customer module is ready to serve as the reference implementation for Vendor / Subcontractor / Consultant / Government Authority / Recruitment Agency modules.**

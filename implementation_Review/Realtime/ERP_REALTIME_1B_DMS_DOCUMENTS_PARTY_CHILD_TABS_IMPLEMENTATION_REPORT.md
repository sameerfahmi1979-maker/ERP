# ERP REALTIME.1B — DMS Documents + Party Child Tabs Implementation Report

## 1. Executive Summary

ERP REALTIME.1B extends the REALTIME.1A foundation to add Supabase Realtime subscriptions
for four additional tables: `dms_documents`, `party_contacts`, `party_addresses`, and `party_bank_details`.

The DMS document list now auto-refreshes when any user creates/updates/archives a document.
Party child tabs (Contacts, Addresses, Bank Details) now auto-refresh when another user
changes that party's child records — scoped precisely by `party_id` filter so only the
relevant party's tabs refresh.

A built-in dirty-dialog guard (`enabled: !isDialogOpen`) prevents any background refresh
from disrupting open child forms with unsaved data.

No new dependencies, no database migration, no Railway changes.

**Final Decision: CLOSED / PASS WITH NOTES**

Notes:
- Supabase dashboard Realtime toggles for 4 new tables require manual action.
- Two-session browser UAT is deferred to Sameer after enabling the Supabase toggles and env flag.
- RLS restricted-user test deferred to Sameer UAT.

---

## 2. Scope

### Implemented in REALTIME.1B

| Table | Component | Mechanism | Filter |
|---|---|---|---|
| `dms_documents` | `DmsDocumentsTable` | `router.refresh()` via `startTransition` | none (list-level) |
| `party_contacts` | `PartyContactsTab` | `invalidatePartyContacts(queryClient, partyId)` | `party_id=eq.{partyId}` |
| `party_addresses` | `PartyAddressesTab` | `invalidatePartyAddresses(queryClient, partyId)` | `party_id=eq.{partyId}` |
| `party_bank_details` | `PartyBankDetailsTab` | `invalidatePartyBankDetails(queryClient, partyId)` | `party_id=eq.{partyId}` |

### Not Implemented (future phases)

- `employees`, all `hr_*` tables → REALTIME.1C
- `dms_expiry_reminders`, `dms_renewal_requests` → REALTIME.2
- All admin/reference/branding/AI tables → never

---

## 3. REALTIME.1A Foundation Reuse Verification

The REALTIME.1A foundation is fully reused:

| Item | Status |
|---|---|
| `src/hooks/realtime/use-realtime-sync.ts` | Used as-is — no changes |
| `src/components/layout/realtime-provider.tsx` | Used as-is — no changes |
| `src/components/layout/erp-shell.tsx` | Used as-is — no changes |
| `NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED` env var | Reused — no new var needed |

---

## 4. Files Reviewed

| File | Purpose |
|---|---|
| `src/hooks/realtime/use-realtime-sync.ts` | Core hook — verified interface |
| `src/lib/query/invalidation.ts` | `invalidatePartyContacts/Addresses/BankDetails` — all confirmed present |
| `src/features/dms/documents/dms-documents-table.tsx` | Server-props list with `useRouter` + `useTransition` — server-props pattern |
| `src/app/(protected)/dms/documents/page.tsx` | Confirmed server component, `force-dynamic`, feeds `initialDocuments` prop |
| `src/features/master-data/parties/party-contacts-tab.tsx` | TanStack Query via `usePartyContactsQuery`, `isDialogOpen` state confirmed |
| `src/features/master-data/parties/party-addresses-tab.tsx` | TanStack Query via `usePartyAddressesQuery`, `isDialogOpen` state confirmed |
| `src/features/master-data/parties/party-bank-details-tab.tsx` | TanStack Query via `usePartyBankDetailsQuery`, `canView` + `isDialogOpen` state confirmed |
| `src/features/master-data/parties/hooks/use-party-child-queries.ts` | Confirmed `useChildTableQuery` with `["child", tableName, parentId]` key |

---

## 5. Supabase Dashboard Realtime Status

**MANUAL ACTION REQUIRED for REALTIME.1B tables:**

```
Project: https://mmiefuieduzdiiwnqpie.supabase.co
Navigate: Database → Replication → Tables → Enable for each:
  NEW in REALTIME.1B:
  - dms_documents
  - party_contacts
  - party_addresses
  - party_bank_details

  Already required by REALTIME.1A:
  - erp_notifications
  - dms_upload_sessions
  - parties
```

All 7 tables must be enabled before setting `NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED=true`.

---

## 6. Files Changed

| File | Change |
|---|---|
| `src/features/dms/documents/dms-documents-table.tsx` | **MODIFIED** — Added `useRealtimeSync` for `dms_documents`, debounce 500ms, `startTransition(router.refresh)` |
| `src/features/master-data/parties/party-contacts-tab.tsx` | **MODIFIED** — Added `useRealtimeSync` for `party_contacts`, scoped `party_id=eq.{partyId}`, `enabled: !isDialogOpen` |
| `src/features/master-data/parties/party-addresses-tab.tsx` | **MODIFIED** — Added `useRealtimeSync` for `party_addresses`, scoped `party_id=eq.{partyId}`, `enabled: !isDialogOpen` |
| `src/features/master-data/parties/party-bank-details-tab.tsx` | **MODIFIED** — Added `useRealtimeSync` for `party_bank_details`, scoped `party_id=eq.{partyId}`, `enabled: canView && !isDialogOpen` |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | **MODIFIED** — REALTIME.1B entry added |

---

## 7. DMS Documents Realtime Integration

**Component:** `src/features/dms/documents/dms-documents-table.tsx`

**Pattern:** Server-props (B) — same pattern as parties list from REALTIME.1A

**Subscription:**
```typescript
useRealtimeSync({
  table: "dms_documents",
  event: "*",
  debounceMs: 500,
  onEvent: () => {
    startTransition(() => {
      router.refresh();
    });
  },
});
```

**Design choices:**
- Wrapped in `startTransition` so the refresh does not mark the list as "pending/loading" visually
- 500ms debounce handles the AI pipeline's batch inserts gracefully
- Active only while the DMS Documents list page is mounted (component lifecycle)
- Not subscribed inside `DmsDocumentRecordForm` or any upload/intake form

---

## 8. Party Child Tabs Realtime Integration

All three tabs use **Pattern A (TanStack Query)** with per-party scoped filters.

### party_contacts

**Component:** `src/features/master-data/parties/party-contacts-tab.tsx`

```typescript
useRealtimeSync({
  table: "party_contacts",
  event: "*",
  filter: `party_id=eq.${partyId}`,
  enabled: !isDialogOpen,
  debounceMs: 400,
  onEvent: () => invalidatePartyContacts(queryClient, partyId),
});
```

### party_addresses

**Component:** `src/features/master-data/parties/party-addresses-tab.tsx`

```typescript
useRealtimeSync({
  table: "party_addresses",
  event: "*",
  filter: `party_id=eq.${partyId}`,
  enabled: !isDialogOpen,
  debounceMs: 400,
  onEvent: () => invalidatePartyAddresses(queryClient, partyId),
});
```

### party_bank_details

**Component:** `src/features/master-data/parties/party-bank-details-tab.tsx`

```typescript
useRealtimeSync({
  table: "party_bank_details",
  event: "*",
  filter: `party_id=eq.${partyId}`,
  enabled: canView && !isDialogOpen,   // additionally gated on view permission
  debounceMs: 400,
  onEvent: () => invalidatePartyBankDetails(queryClient, partyId),
});
```

**Additional safety for bank details:** subscription is also gated on `canView` (the existing
permission check that already gates the entire bank details section). Users without
`master_data.parties.view_bank_details` or `manage_bank_details` never subscribe.

---

## 9. Dirty Dialog / Unsaved Data Safety

The `enabled: !isDialogOpen` pattern ensures:

1. When user opens Add/Edit child dialog → `isDialogOpen = true` → subscription channel is destroyed
2. While dialog is open → no background Realtime events fire the invalidation
3. When dialog is closed (Save or Cancel) → `isDialogOpen = false` → subscription resumes
4. On resume, TanStack Query's stale-time handling will refetch if data is stale

This protects:
- Open Add dialog with partially typed name → no accidental form reset
- Open Edit dialog with modified fields → no accidental reload of stale data into the form

The `useRealtimeSync` effect re-runs when `enabled` changes (it's in the deps array), 
cleanly creating/destroying the channel as the dialog opens and closes.

---

## 10. Commands and Results

### TypeScript check

```
npx tsc --noEmit
Exit code: 0 — no errors
```

### Production build

```
npm run build
Exit code: 0 — all routes compiled successfully
```

### Test suite

```
npx vitest run
8 test files passed (8)
269 tests passed (269)
```

### Lint on touched files

```
ReadLints: dms-documents-table.tsx, party-contacts-tab.tsx, party-addresses-tab.tsx, party-bank-details-tab.tsx
Result: No linter errors found
```

---

## 11. Browser / Two-Session UAT Results

**Status: DEFERRED — requires manual Supabase dashboard action first**

Pre-conditions not yet met:
- Supabase dashboard Realtime not yet enabled for the 4 new tables (manual action)
- `NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED` not yet set to `true` in production

### UAT-RT1B-01 — DMS Documents INSERT/UPDATE
**Status: DEFERRED** — requires Supabase dashboard action + env flag

### UAT-RT1B-02 — Party Contacts Scoped Refresh
**Status: DEFERRED** — requires Supabase dashboard action

### UAT-RT1B-03 — Party Addresses Scoped Refresh
**Status: DEFERRED** — requires Supabase dashboard action

### UAT-RT1B-04 — Party Bank Details Scoped Refresh
**Status: DEFERRED** — requires Supabase dashboard action

### UAT-RT1B-05 — Dirty Dialog Safety
**Status: PASS (by code design)**
The `enabled: !isDialogOpen` guard prevents subscriptions from firing during open dialogs.
Verified by code inspection: `isDialogOpen` is managed by `setDialogOpen()` wrapper which
syncs with `onChildOpen?.()` in all three tabs.

### UAT-RT1B-06 — Cleanup / Unsubscribe
**Status: PASS (by code design)**
`useRealtimeSync` returns a cleanup function that calls `supabase.removeChannel(channel)`.
Each tab has its own scoped channel. Navigating away from a party record unmounts all three
tab components → all three channels are removed.

### UAT-RT1B-07 — RLS / Permission Safety
**Status: DEFERRED** — restricted-user test deferred to Sameer

---

## 12. Security / RLS Verification

- All subscriptions use `createClient()` (browser, anon key + user session)
- Supabase Realtime enforces RLS: users only receive events for rows their SELECT policy allows
- `party_bank_details` subscription additionally gated on `canView` — extra layer on top of RLS
- No service-role key used
- No `createAdminClient()` used in any Realtime code
- No raw `old_record`/`new_record` payload logged or forwarded to consumers
- All callbacks only call `invalidatePartyXxx()` or `router.refresh()` — no data extraction

---

## 13. What Was Not Implemented

Per scope: `employees`, all `hr_*` tables, `dms_expiry_reminders`, `dms_renewal_requests`,
and all reference/admin/AI tables are explicitly excluded. These belong to future phases.

No optional `use-realtime-party-child-table.ts` convenience wrapper was created — direct
`useRealtimeSync` calls in each tab are simpler and clearer.

---

## 14. Known Limitations

1. **Supabase dashboard toggles**: Manual one-time action per table in Supabase Dashboard.
2. **DMS documents refresh granularity**: `router.refresh()` re-fetches the entire server page
   including categories and document types, not just the document list. Same tradeoff as parties.
   Future optimization: move DMS documents to TanStack Query (Pattern A).
3. **Two-session UAT**: Cannot be verified from Cursor — requires Sameer + two browser sessions.
4. **RLS restricted-user test**: Deferred to Sameer UAT.

---

## 15. Source-of-Truth Update

Updated: `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`

Entry added after REALTIME.1A entry:
```
6. ERP REALTIME.1B - DMS Documents + Party Child Tabs - CLOSED / PASS WITH NOTES.
   Added subscriptions: dms_documents list (router.refresh via startTransition),
   party_contacts/party_addresses/party_bank_details scoped by party_id with
   enabled=!isDialogOpen dirty-guard. Reuses NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED.
   No DB migration. No new packages. No Railway changes.
   See implementation_Review/Realtime/ERP_REALTIME_1B_DMS_DOCUMENTS_PARTY_CHILD_TABS_IMPLEMENTATION_REPORT.md
   Future: REALTIME.1C Employees/HR; REALTIME.2 Tier 2.
```

---

## 16. Acceptance Criteria

| ID | Criterion | Result |
|---|---|---|
| AC-RT1B-01 | REALTIME.1A foundation reused; no duplicate foundation created | **PASS** |
| AC-RT1B-02 | No DB migration created | **PASS** |
| AC-RT1B-03 | No new dependency added | **PASS** |
| AC-RT1B-04 | Existing runtime switch reused and still defaults OFF | **PASS** |
| AC-RT1B-05 | dms_documents list subscription implemented only on list component | **PASS** |
| AC-RT1B-06 | party_contacts subscription implemented with party_id filter | **PASS** |
| AC-RT1B-07 | party_addresses subscription implemented with party_id filter | **PASS** |
| AC-RT1B-08 | party_bank_details subscription implemented with party_id filter | **PASS** |
| AC-RT1B-09 | No record forms/edit dialogs subscribed directly | **PASS** |
| AC-RT1B-10 | No global provider subscriptions added for scoped tables | **PASS** |
| AC-RT1B-11 | Supabase dashboard Realtime status documented for 4 new tables | **PASS (MANUAL ACTION DOCUMENTED)** |
| AC-RT1B-12 | tsc passes | **PASS** |
| AC-RT1B-13 | build passes | **PASS** |
| AC-RT1B-14 | tests pass or unrelated blockers documented | **PASS (269/269)** |
| AC-RT1B-15 | Two-session DMS Documents UAT | **DEFERRED** |
| AC-RT1B-16 | Two-session Party Contacts UAT | **DEFERRED** |
| AC-RT1B-17 | Two-session Party Addresses UAT | **DEFERRED** |
| AC-RT1B-18 | Two-session Party Bank Details UAT | **DEFERRED** |
| AC-RT1B-19 | Dirty dialog safety verified or documented | **PASS (by code design)** |
| AC-RT1B-20 | Cleanup/unsubscribe verified or documented | **PASS (by code design)** |
| AC-RT1B-21 | RLS/security behavior verified or documented | **DEFERRED (restricted-user test)** |
| AC-RT1B-22 | Source-of-truth updated | **PASS** |
| AC-RT1B-23 | Implementation report created | **PASS** |

---

## 17. Recommended Next Step

**Manual actions required before live UAT:**

1. Supabase Dashboard → Database → Replication → Tables → Enable for:
   - `dms_documents`
   - `party_contacts`
   - `party_addresses`
   - `party_bank_details`
   (if not already done from REALTIME.1A: also `erp_notifications`, `dms_upload_sessions`, `parties`)
2. Railway → set `NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED=true` → redeploy
3. Test with two sessions:
   - Open `/dms/documents` in Session A, create/update a document in Session B → verify auto-refresh
   - Open a party record Contacts tab in Session A, add a contact in Session B → verify tab refreshes

**Next phase:**
- **REALTIME.1C** — Employees/HR lists (TanStack Query + server-props hybrid pattern)

---

## 18. Final Decision

**CLOSED / PASS WITH NOTES**

All four REALTIME.1B subscriptions implemented correctly and safely. Build, tsc, and 269 tests pass.
Dirty-dialog guard in place for all three party child tabs. No safety violations. No record forms
subscribed. No global-provider pollution. No DB migration. No new packages.

Deferred: Supabase dashboard toggles (manual), two-session live UAT, RLS restricted-user test.

# ERP Real-Time Data Sync — Implementation Plan

**Plan:** `REALTIME_SYNC_PLAN.md`  
**Status:** PLANNED — awaiting explicit approval from Sameer/Dina  
**Proposed phase code:** `ERP REALTIME.1`  
**Author:** AI Agent  
**Date:** 2026-07-07  
**Railway changes required:** ❌ None  
**New dependencies required:** ❌ None (supabase-js already installed)  

---

## 1. What This Solves

When User A has a list open (Parties, Employees, DMS Documents, etc.) and User B adds or updates a record, User A's screen stays stale until they manually refresh.

This plan implements **Supabase Realtime subscriptions** so that row-level changes in the database broadcast to all connected browsers immediately — the affected list silently re-fetches in the background and shows the new data without any user action.

---

## 2. Architecture Overview

```
User B's browser
  │
  ├─→ Next.js server action (e.g. createParty)
  │     └─→ Supabase DB: INSERT into parties
  │                │
  │                └─→ Supabase Realtime Engine
  │                      └─→ broadcasts INSERT event to all
  │                            subscribed WebSocket clients
  │
User A's browser (already has list open)
  │
  ├─→ Supabase Realtime WebSocket (wss://mmiefuieduzdiiwnqpie.supabase.co)
  │     receives: { eventType: 'INSERT', table: 'parties', new: { id: 42, ... } }
  │
  └─→ `queryClient.invalidateQueries(...)` or `router.refresh()`
        └─→ TanStack Query re-fetches silently in background
              └─→ List updates — no page refresh needed
```

**Railway is not in this path.** The WebSocket connection is entirely `browser → Supabase`. Railway continues serving Next.js pages and server actions exactly as today.

---

## 3. Current State Analysis

### 3.1 How lists are refreshed today

The codebase uses three distinct patterns for list data — each needs a different Realtime integration approach:

| Pattern | Examples | Current refresh method | Realtime approach |
|---------|----------|------------------------|-------------------|
| **A — TanStack Query** | DMS Expiry, Upload Sessions, Party child tabs, HR time, Notifications | `invalidate*(queryClient)` on mutation success | On Realtime event → call same `invalidate*` helper |
| **B — Server-props** | Parties list, DMS Documents list | `router.refresh()` | On Realtime event → call `router.refresh()` |
| **C — Hybrid state** | Employees list | Local `useState` + `fetchEmployees()` via `useTransition` | On Realtime event → call `fetchEmployees()` OR migrate to TanStack Query |

### 3.2 Key files

| File | Role | Realtime relevance |
|------|------|--------------------|
| `src/lib/supabase/client.ts` | Browser Supabase client (anon key) | **Source of WebSocket client** |
| `src/lib/query/query-keys.ts` | All TanStack Query key factories | Maps table → query key |
| `src/lib/query/invalidation.ts` | All `invalidate*` helper functions | Called on Realtime events |
| `src/components/layout/app-providers.tsx` | `QueryClientProvider` root | Realtime provider mounts here or below |
| `src/components/layout/erp-shell.tsx` | Protected app shell (`WorkspaceProvider` wrapper) | Best mount point for `RealtimeProvider` |

### 3.3 Query stale time

The app's default `staleTime` is **5 minutes** (`src/lib/query/query-client.ts`). Without Realtime, a cached list stays stale for 5 minutes even after another user inserts a record. Realtime invalidation bypasses this — it forces an immediate background re-fetch regardless of stale time.

---

## 4. Supabase Dashboard Steps (one-time per table)

Before any code change, Realtime must be enabled on each target table in the Supabase dashboard:

1. Go to `https://supabase.com/dashboard/project/mmiefuieduzdiiwnqpie`
2. Navigate to **Database → Replication** (or **Table Editor → [table] → Realtime toggle**)
3. Enable Realtime for each table in the priority list below

> Supabase Realtime requires `REPLICA IDENTITY FULL` to broadcast old row data for UPDATE/DELETE events. For INSERT tracking only (the most common case), default replica identity is sufficient.

---

## 5. Priority Tiers

### Tier 1 — High collaborative impact (implement first)

These are the tables where multiple users work simultaneously and stale data causes the most confusion:

| Table | Module | List page | Invalidation helper | Pattern |
|-------|--------|-----------|---------------------|---------|
| `parties` | Party Master | `/admin/master-data/parties` | `router.refresh()` | B |
| `party_contacts` | Party Master | Party contacts tab | `invalidatePartyContacts(qc, partyId)` | A |
| `party_addresses` | Party Master | Party addresses tab | `invalidatePartyAddresses(qc, partyId)` | A |
| `party_bank_details` | Party Master | Party bank details tab | `invalidatePartyBankDetails(qc, partyId)` | A |
| `dms_documents` | DMS | `/dms/documents` | `invalidateDmsDocuments(qc)` + `router.refresh()` | B |
| `dms_upload_sessions` | DMS | `/dms/inbox` | `invalidateDmsUploadSessions(qc)` | A |
| `employees` | HR | `/admin/hr/employees` | `invalidateHrEmployees(qc)` | C |
| `erp_notifications` | Notifications | Notification bell | `invalidateMyNotifications(qc)` | A |

### Tier 2 — Medium impact

| Table | Module | Invalidation helper |
|-------|--------|---------------------|
| `dms_expiry_reminders` | DMS Expiry | `invalidateDmsExpiry(qc)` |
| `dms_renewal_requests` | DMS Renewals | `invalidateDmsRenewals(qc)` |
| `hr_leave_requests` | HR Time | `invalidateHrGlobalLeaveRequests(qc)` |
| `hr_attendance_summaries` | HR Attendance | `invalidateHrDailyAttendance(qc)` |
| `hr_candidates` | HR Recruitment | `invalidateHrCandidates(qc)` |

### Tier 3 — Lower priority (admin/lookup tables — infrequent changes)

| Table | Module |
|-------|--------|
| `departments`, `designations`, `work_sites` | Common MD |
| `branches`, `owner_companies` | Org structure |
| `dms_document_types`, `dms_document_categories` | DMS admin |
| `erp_report_templates` | Reports admin |

---

## 6. Component Architecture

### 6.1 `useRealtimeSync` — the core hook

A single reusable hook that:
1. Creates a Supabase browser client instance (singleton pattern)
2. Subscribes to a table's Realtime channel on mount
3. Calls the provided `onEvent` callback for INSERT / UPDATE / DELETE
4. Unsubscribes on component unmount

**Location:** `src/hooks/realtime/use-realtime-sync.ts`

```typescript
// Conceptual interface
export function useRealtimeSync(options: {
  table: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  filter?: string;          // e.g. "parent_id=eq.42" for child-scoped subscriptions
  onEvent: (payload: RealtimePostgresChangesPayload<unknown>) => void;
  enabled?: boolean;
}): void
```

**Key implementation points:**
- Use `supabase.channel('table-changes')` pattern from `supabase-js`
- The channel name should be `realtime:${table}:${filter ?? 'all'}` to allow multiple concurrent subscriptions with different filters
- `useEffect` with `[table, filter, enabled]` deps — re-subscribes if these change
- Cleanup: `supabase.removeChannel(channel)` on unmount
- The Supabase browser client (`createClient()`) is called once and cached in a module-level `ref` or `useState` — never re-created on every render

### 6.2 `RealtimeProvider` — module-level subscriptions

A context provider that mounts once in `ErpShell` and manages global-scope subscriptions (tables that affect every user universally, regardless of which list they're viewing).

**Location:** `src/components/layout/realtime-provider.tsx`

**Subscribes globally to:**
- `erp_notifications` → `invalidateMyNotifications(qc)` — notification bell always needs live updates
- `dms_upload_sessions` → `invalidateDmsUploadSessions(qc)` — inbox badge always needs live updates

**Does NOT subscribe to:** parties, employees, DMS docs (those are scoped to specific list pages)

**Mount point in `ErpShell`:**
```tsx
// src/components/layout/erp-shell.tsx
<QueryClientProvider ...>
  <RealtimeProvider>        {/* ← new, mounts global subs */}
    <WorkspaceProvider>
      <AppSidebar />
      <WorkspaceContent />
    </WorkspaceProvider>
  </RealtimeProvider>
</QueryClientProvider>
```

### 6.3 Per-list `useRealtimeSync` calls

For list pages, the Realtime hook is called directly inside the list component. This means:
- Subscription only exists when the list is mounted (tab is open)
- Filter can scope to specific parent IDs (e.g., party contacts for party ID 42)
- Multiple tabs with different entities each get their own scoped channel

**Example — Parties list (Pattern B — server-props):**
```tsx
// In PartiesTable or a wrapper
useRealtimeSync({
  table: "parties",
  event: "*",
  onEvent: () => router.refresh(),
});
```

**Example — Party contacts tab (Pattern A — TanStack Query):**
```tsx
// In usePartyContactsQuery or in the contacts tab component
useRealtimeSync({
  table: "party_contacts",
  event: "*",
  filter: `party_id=eq.${partyId}`,
  onEvent: () => invalidatePartyContacts(queryClient, partyId),
  enabled: !!partyId,
});
```

**Example — Notifications (global, in RealtimeProvider):**
```tsx
useRealtimeSync({
  table: "erp_notifications",
  event: "INSERT",
  onEvent: () => invalidateMyNotifications(queryClient),
});
```

---

## 7. RLS and Security Behaviour

Supabase Realtime **respects RLS policies** when broadcasting row-level events to subscribed clients. A user will only receive change events for rows their RLS policy allows them to `SELECT`.

This means:
- User with `HR` role subscribing to `employees` will only receive events for employees they have access to
- DMS Manager subscribing to `dms_documents` will only receive events for documents accessible under their RLS
- No extra permission work is needed — existing RLS policies automatically apply to Realtime events

**Important:** The browser client uses the **anon key** with the user's session cookie (same as `src/lib/supabase/client.ts` today with `@supabase/ssr`). RLS is evaluated against the authenticated user's claims. This is secure by default.

---

## 8. Connection Management

### Channels strategy

| Scope | Channel name pattern | Lifetime |
|-------|---------------------|----------|
| Global (notifications, upload inbox) | `realtime:erp_notifications` | Mount of `RealtimeProvider` → unmount |
| List-level (parties, employees, DMS docs) | `realtime:parties:all` | Mount of list component → unmount |
| Entity-level (party child tabs) | `realtime:party_contacts:party_id:42` | Mount of tab → unmount or tab switch |

### Connection count

Supabase's free and pro tiers support up to **200 concurrent WebSocket connections** per project. Each browser tab with an open list = 1 channel subscription. For this ERP, expected concurrent users are low (< 50), so connection limits are not a concern.

### Deduplication

If the same user opens multiple tabs showing the same list (e.g., two browser tabs on `/dms/documents`), they will have two channels for the same table. Both will fire `router.refresh()` / `invalidateQueries()`. This is harmless (idempotent invalidation) but slightly wasteful. Can be optimized later with a channel registry if needed.

---

## 9. Phase Breakdown

### REALTIME.1 — Foundation + Tier 1 tables (implement first)

**Deliverables:**
1. `src/hooks/realtime/use-realtime-sync.ts` — core hook
2. `src/components/layout/realtime-provider.tsx` — global subscriptions (notifications + upload sessions)
3. Wire `RealtimeProvider` into `ErpShell`
4. Add `useRealtimeSync` to `PartiesTable` (parties, Pattern B)
5. Add `useRealtimeSync` to `DmsDocumentsTable` (dms_documents, Pattern B)
6. Add `useRealtimeSync` to `EmployeesTable` (employees, Pattern C)
7. Add `useRealtimeSync` to `usePartyContactsQuery` or party child tab hooks
8. Enable Realtime on 8 Tier 1 tables in Supabase dashboard

**DB changes:** None (Supabase dashboard toggle only)  
**Migration file:** None  
**New npm packages:** None  

### REALTIME.2 — Tier 2 tables (implement after REALTIME.1 is stable)

**Deliverables:**
1. Add `useRealtimeSync` to DMS Expiry dashboard
2. Add `useRealtimeSync` to DMS Renewals table
3. Add `useRealtimeSync` to HR Leave Requests global view
4. Add `useRealtimeSync` to HR Recruitment candidates list
5. Enable Realtime on Tier 2 tables in Supabase dashboard

### REALTIME.3 — Employees table migration (optional, quality improvement)

The employees table uses Pattern C (local state + `useTransition`). For cleanest Realtime integration:
- Migrate `EmployeesTable` to use `useQuery` with `queryKeys.hr.employees.list(filters)`
- Then Realtime invalidation is the same as Pattern A (just call `invalidateHrEmployees(qc)`)
- This is optional — REALTIME.1 can handle employees via calling the existing `fetchEmployees()` callback on event

---

## 10. Debounce and Rate Control

Realtime events can fire rapidly during bulk imports or batch operations. To avoid thrashing the server with hundreds of re-fetches per second:

- **Debounce** invalidation calls — wait 300–500ms after the last event before calling `invalidateQueries`
- Use a `setTimeout` ref pattern (cancel-and-reschedule on each event)
- The `useRealtimeSync` hook should accept an optional `debounceMs` parameter (default: `300`)

**Example:**
```typescript
// Inside useRealtimeSync
const debounceRef = useRef<ReturnType<typeof setTimeout>>();
// On event:
clearTimeout(debounceRef.current);
debounceRef.current = setTimeout(() => onEvent(payload), debounceMs);
```

---

## 11. File Change Summary

### New files

| File | Purpose |
|------|---------|
| `src/hooks/realtime/use-realtime-sync.ts` | Core Realtime subscription hook |
| `src/hooks/realtime/use-realtime-table.ts` | Convenience wrapper with built-in debounce and invalidation |
| `src/components/layout/realtime-provider.tsx` | Global channel provider (notifications, upload sessions) |

### Modified files

| File | Change |
|------|--------|
| `src/components/layout/erp-shell.tsx` | Wrap content in `<RealtimeProvider>` |
| `src/features/master-data/parties/parties-table.tsx` | Add `useRealtimeSync` for `parties` table |
| `src/features/dms/documents/dms-documents-table.tsx` | Add `useRealtimeSync` for `dms_documents` table |
| `src/features/hr/employees/employees-table.tsx` | Add `useRealtimeSync` for `employees` table |
| `src/hooks/child-tables/use-child-table-query.ts` | Optionally wire Realtime per `tableName` param |
| OR each party child tab hook individually | Add `useRealtimeSync` with `filter: \`parent_id=eq.${id}\`` |

---

## 12. What Does NOT Change

| Concern | Answer |
|---------|--------|
| Railway deployment | No changes — WebSocket is browser → Supabase, not through Railway |
| Server actions | No changes — mutations continue using `revalidatePath` + `invalidateQueries` as today |
| RLS policies | No changes — Realtime inherits existing RLS automatically |
| Authentication | No changes — browser client already handles session cookie via `@supabase/ssr` |
| Supabase plan | Pro plan already supports Realtime; no upgrade needed |
| Existing invalidation helpers | No changes — Realtime calls the same helpers already used after mutations |
| Admin client (`createAdminClient`) | Not used for Realtime — only browser client is used |

---

## 13. Testing Approach

Once implemented, verify each table with this manual test:

1. Open User A's browser at the list page (e.g. `/admin/master-data/parties`)
2. In a separate browser/tab logged in as User B, add a new record
3. Switch back to User A's browser — the new record should appear within 1–2 seconds without any page refresh
4. Repeat for UPDATE (edit an existing record) and verify the list updates
5. Check browser DevTools → Network → WS filter to confirm a WebSocket connection to `wss://mmiefuieduzdiiwnqpie.supabase.co`

---

## 14. Risks and Mitigations

| Risk | Probability | Mitigation |
|------|-------------|------------|
| Supabase Realtime table toggle missing on some tables | Low | Verify each table's toggle in dashboard before implementation |
| Event storm during bulk imports (hundreds of events/sec) | Medium | Debounce of 300ms absorbs burst — re-fetch happens once after burst ends |
| RLS edge case: admin sees events they shouldn't | Very Low | Supabase enforces RLS on Realtime broadcast — only permitted rows reach client |
| Channel cleanup on fast tab switching | Low | `useEffect` cleanup (`removeChannel`) runs on unmount — no leaks |
| Supabase Realtime downtime | Very Low | Graceful degradation — lists fall back to 5-min stale cache; manual refresh still works |
| Connection limit exceeded | Very Low | < 50 concurrent users well under 200-connection pro tier limit |

---

## 15. Implementation Checklist

### Supabase Dashboard (before any code)
- [ ] Enable Realtime on `parties`
- [ ] Enable Realtime on `party_contacts`
- [ ] Enable Realtime on `party_addresses`
- [ ] Enable Realtime on `party_bank_details`
- [ ] Enable Realtime on `dms_documents`
- [ ] Enable Realtime on `dms_upload_sessions`
- [ ] Enable Realtime on `employees`
- [ ] Enable Realtime on `erp_notifications`

### Code — REALTIME.1
- [ ] Create `src/hooks/realtime/use-realtime-sync.ts`
- [ ] Create `src/hooks/realtime/use-realtime-table.ts`
- [ ] Create `src/components/layout/realtime-provider.tsx`
- [ ] Wire `RealtimeProvider` into `erp-shell.tsx`
- [ ] Add Realtime to `PartiesTable` (parties)
- [ ] Add Realtime to `DmsDocumentsTable` (dms_documents)
- [ ] Add Realtime to `EmployeesTable` (employees)
- [ ] Add Realtime to party child tab hooks (contacts, addresses, bank details)
- [ ] `tsc --noEmit` → 0 errors
- [ ] Manual UAT: add record as User B → appears in User A's list within 2 seconds
- [ ] Write implementation report to `implementation_Review/`

---

## 16. References

- Supabase Realtime docs: https://supabase.com/docs/guides/realtime
- `supabase-js` channel API: `supabase.channel().on('postgres_changes', ...).subscribe()`
- Browser client: `src/lib/supabase/client.ts`
- Query keys: `src/lib/query/query-keys.ts`
- Invalidation helpers: `src/lib/query/invalidation.ts`
- App shell mount: `src/components/layout/erp-shell.tsx`
- QueryClient provider: `src/components/layout/app-providers.tsx`

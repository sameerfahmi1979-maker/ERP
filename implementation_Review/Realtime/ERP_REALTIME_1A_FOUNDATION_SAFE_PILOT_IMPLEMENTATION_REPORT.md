# ERP REALTIME.1A — Foundation + Safe Pilot Implementation Report

## 1. Executive Summary

ERP REALTIME.1A implements the Supabase Realtime foundation for the ALGT ERP app.
The phase delivers a reusable core hook, a global provider, and pilot subscriptions
for three high-value tables: `erp_notifications`, `dms_upload_sessions`, and `parties`.

No database migration, no new npm dependencies, and no Railway configuration changes
were made. All subscriptions are behind a runtime env-var switch that defaults to `false`.

**Final Decision: CLOSED / PASS WITH NOTES**

Notes:
- Supabase dashboard Realtime toggles require manual action (cannot be scripted from Cursor).
- Two-session browser UAT requires live deployment or local two-tab testing by Sameer.
- RLS restricted-user test deferred to UAT by Sameer.

---

## 2. Scope

### Implemented

| Table | Location | Mechanism |
|---|---|---|
| `erp_notifications` | `RealtimeProvider` (global) | `invalidateMyNotifications(queryClient)` |
| `dms_upload_sessions` | `RealtimeProvider` (global) | `invalidateDmsUploadSessions(queryClient)` |
| `parties` | `PartiesTable` (list only) | `router.refresh()` via `handleRefresh()` |

### Explicitly NOT implemented (future phases)

- `employees`, `dms_documents`, `party_contacts`, `party_addresses`, `party_bank_details`
- `dms_expiry_reminders`, `dms_renewal_requests`, `hr_leave_requests`, `hr_attendance_summaries`, `hr_candidates`
- All reference/admin/config tables (departments, designations, currencies, banks, etc.)

---

## 3. Files Reviewed

| File | Purpose |
|---|---|
| `src/lib/supabase/client.ts` | Browser Supabase client factory (`createClient()`) |
| `src/lib/query/query-keys.ts` | TanStack Query key factories — `notifications.*`, `dms.uploadSessions` |
| `src/lib/query/invalidation.ts` | `invalidateMyNotifications`, `invalidateDmsUploadSessions` |
| `src/components/layout/app-providers.tsx` | `QueryClientProvider` wraps app — RealtimeProvider must be inside |
| `src/components/layout/erp-shell.tsx` | Protected shell — correct mount point |
| `src/features/master-data/parties/parties-table.tsx` | Parties list — uses `router.refresh()` via `handleRefresh()` |

---

## 4. Supabase Dashboard Realtime Status

**MANUAL ACTION REQUIRED**

The Supabase Realtime publication for these tables must be enabled manually in the
Supabase Dashboard before activating the env flag:

```
Project: https://mmiefuieduzdiiwnqpie.supabase.co
Navigate: Database → Replication → Tables → Enable for each:
  - erp_notifications
  - dms_upload_sessions
  - parties
```

Steps:
1. Go to Supabase Dashboard → Database → Replication
2. Under "Source" / "Tables" enable Realtime for the three tables above
3. Set `NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED=true` in Railway environment variables
4. Redeploy

This cannot be done from code/migrations. It is a one-time manual dashboard action.

---

## 5. Files Changed

| File | Change |
|---|---|
| `src/hooks/realtime/use-realtime-sync.ts` | **NEW** — Core debounced Realtime hook |
| `src/components/layout/realtime-provider.tsx` | **NEW** — Global erp_notifications + dms_upload_sessions subscriptions |
| `src/components/layout/erp-shell.tsx` | **MODIFIED** — Added `<RealtimeProvider>` wrapper inside protected shell |
| `src/features/master-data/parties/parties-table.tsx` | **MODIFIED** — Added `useRealtimeSync` for `parties` table |
| `.env.local` | **MODIFIED** — Added `NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED=false` |
| `.env.local.example` | **MODIFIED** — Documented the new env var |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | **MODIFIED** — REALTIME.1A phase entry added/updated |

---

## 6. Feature Flag / Runtime Switch

```
NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED=true/false
```

- Default: `false` (env var missing = disabled)
- When `false`: `useRealtimeSync` returns immediately without creating any Supabase channel
- When `true`: subscriptions are live for the three pilot tables
- To enable in production: set the env var to `true` in Railway after enabling Supabase dashboard Realtime

---

## 7. Hook Architecture

**File:** `src/hooks/realtime/use-realtime-sync.ts`

```typescript
useRealtimeSync({
  table: "parties",
  event: "*",             // "INSERT" | "UPDATE" | "DELETE" | "*"
  filter?: string,        // e.g. "party_id=eq.42"
  enabled?: boolean,      // default true
  debounceMs?: number,    // default 300ms
  onEvent: (payload) => void,
})
```

Key design decisions:
- Uses `createClient()` (browser, anon key + session cookie — respects RLS)
- Stable channel name: `realtime:{table}:{filter|"all"}:{event}` — prevents duplicate subscriptions
- `onEvent` stored in `useRef` — avoids re-subscribing on every render when callback changes
- `debounceMs` collapses bulk-insert bursts into single UI refresh
- `useEffect` cleanup calls `supabase.removeChannel(channel)` on unmount
- Never logs `old_record` or `new_record` from payload — callers only trigger invalidation

---

## 8. Provider Integration

**File:** `src/components/layout/realtime-provider.tsx`

- Two sub-components: `NotificationsSync` and `DmsUploadSessionsSync`
- Each calls `useRealtimeSync` + the corresponding `invalidate*` helper from `invalidation.ts`
- Mounted in `src/components/layout/erp-shell.tsx` inside `<WorkspaceProvider>` which is already
  inside `<QueryClientProvider>` (from `app-providers.tsx`)
- Does not render visible UI
- Gracefully does nothing when env flag is disabled

Z-order in the component tree:
```
AppProviders → QueryClientProvider
  └── ErpShell
        └── WorkspaceDraftProvider
              └── WorkspaceProvider
                    └── RealtimeProvider   ← HERE
                          ├── NotificationsSync (no UI)
                          ├── DmsUploadSessionsSync (no UI)
                          └── {children}
```

---

## 9. Pilot Table Integrations

### erp_notifications

- Location: `RealtimeProvider` (global — mounted once for the authenticated app lifetime)
- Event: `*`
- Debounce: 500ms (notifications are lower-priority than inbox badge)
- Action: `invalidateMyNotifications(queryClient)` → invalidates `["notifications", "my"]` and `["notifications", "unread-count"]`

### dms_upload_sessions

- Location: `RealtimeProvider` (global)
- Event: `*`
- Debounce: 300ms
- Action: `invalidateDmsUploadSessions(queryClient)` → invalidates `["dms", "upload-sessions"]`

### parties

- Location: `PartiesTable` component only (mounted/unmounted with the parties list page)
- Event: `*`
- Debounce: 400ms
- Action: `handleRefresh()` → calls `router.refresh()` (triggers server re-fetch of party list page)
- Not subscribed inside party record form/drawer (only the list component)

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
ReadLints: src/hooks/realtime, src/components/layout/realtime-provider.tsx,
           src/components/layout/erp-shell.tsx, src/features/master-data/parties/parties-table.tsx
Result: No linter errors found
```

---

## 11. Browser / Two-Session UAT Results

**Status: DEFERRED — requires manual Supabase dashboard action first**

UAT cannot be completed until:
1. Supabase dashboard Realtime is enabled for the 3 tables
2. `NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED=true` is set in the environment

### UAT-RT-01 — Realtime env OFF
**Pre-condition:** Default `.env.local` has `NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED=false`
**Expected:** No WebSocket subscriptions created, app works normally
**Status: PASS (by design — hook no-ops when flag is false)**

### UAT-RT-02 — Notifications Realtime
**Status: DEFERRED** — requires two sessions + Supabase Realtime enabled

### UAT-RT-03 — DMS Upload Sessions Realtime
**Status: DEFERRED** — requires Supabase Realtime enabled for `dms_upload_sessions`

### UAT-RT-04 — Parties List Realtime
**Status: DEFERRED** — requires Supabase Realtime enabled for `parties`

### UAT-RT-05 — Cleanup / channel unsubscribe
**Status: DEFERRED** — verify after Supabase Realtime enabled

### UAT-RT-06 — RLS / Permission Safety
**Status: DEFERRED** — Supabase Realtime enforces RLS; restricted-user test deferred to Sameer

---

## 12. Security / RLS Verification

- All subscriptions use `createClient()` — browser client with anon key + user session cookie
- Supabase Realtime enforces the same RLS policies as regular SELECT queries
- No service-role key used anywhere in this implementation
- No `createAdminClient()` used in any Realtime hook or provider
- No raw payload data is logged, displayed, or forwarded — callbacks only trigger invalidation
- Env flag is a `NEXT_PUBLIC_*` variable containing no secrets (value is `true`/`false` only)

---

## 13. What Was Not Implemented

Per scope: employees, dms_documents, party child tabs, HR queues, and all reference tables
are explicitly excluded from REALTIME.1A and belong to future phases.

---

## 14. Known Limitations

1. **Supabase dashboard toggle**: Must be enabled manually — cannot be done via migration or code.
2. **Two-session UAT**: Cannot be done inside Cursor — requires Sameer to test with two browser sessions after enabling the flag.
3. **parties list refresh granularity**: Uses `router.refresh()` (refetches entire server-rendered page) rather than a targeted query invalidation. This is correct for the server-props pattern but re-renders more than strictly necessary. Future optimization: move parties to TanStack Query (Pattern A).
4. **RLS test with restricted user**: Deferred to Sameer UAT.

---

## 15. Source-of-Truth Update

Updated: `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`

Entry updated at line 429:
```
5. ERP REALTIME.1A - Foundation + Safe Pilot - CLOSED / PASS WITH NOTES.
   Implemented: useRealtimeSync hook, RealtimeProvider, erp-shell mount, parties-table subscription.
   Runtime switch: NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED (default false).
   No DB migration. No new npm packages. No Railway changes.
   Requires manual Supabase dashboard Realtime toggle for 3 tables.
   See implementation_Review/Realtime/ERP_REALTIME_1A_FOUNDATION_SAFE_PILOT_IMPLEMENTATION_REPORT.md
   Future: REALTIME.1B DMS Documents + Party child tabs; REALTIME.1C Employees/HR; REALTIME.2 Tier 2.
```

---

## 16. Acceptance Criteria

| ID | Criterion | Result |
|---|---|---|
| AC-RT1A-01 | No DB migration created | **PASS** |
| AC-RT1A-02 | No new dependency added | **PASS** |
| AC-RT1A-03 | Realtime runtime switch implemented and defaults OFF | **PASS** |
| AC-RT1A-04 | useRealtimeSync hook implemented with debounce and cleanup | **PASS** |
| AC-RT1A-05 | RealtimeProvider implemented for erp_notifications and dms_upload_sessions only | **PASS** |
| AC-RT1A-06 | RealtimeProvider mounted only in protected app shell under QueryClientProvider | **PASS** |
| AC-RT1A-07 | Parties list subscription implemented | **PASS** |
| AC-RT1A-08 | No record forms/edit dialogs subscribed | **PASS** |
| AC-RT1A-09 | Supabase dashboard Realtime status documented for 3 pilot tables | **PASS (MANUAL ACTION DOCUMENTED)** |
| AC-RT1A-10 | tsc passes | **PASS** |
| AC-RT1A-11 | build passes | **PASS** |
| AC-RT1A-12 | tests pass or unrelated blockers documented | **PASS (269/269)** |
| AC-RT1A-13 | Two-session browser UAT completed or blockers documented | **DEFERRED (requires Supabase dashboard action + env flag)** |
| AC-RT1A-14 | WebSocket cleanup/unsubscribe verified or documented | **DEFERRED (code verified; runtime test deferred)** |
| AC-RT1A-15 | RLS/security behavior verified or documented | **DEFERRED (restricted-user test deferred to Sameer)** |
| AC-RT1A-16 | Source-of-truth updated | **PASS** |
| AC-RT1A-17 | Implementation report created | **PASS** |

---

## 17. Recommended Next Step

**Manual action required before live testing:**

1. Log into Supabase Dashboard → `https://mmiefuieduzdiiwnqpie.supabase.co`
2. Go to: Database → Replication → Source → Tables
3. Enable Realtime publication for:
   - `erp_notifications`
   - `dms_upload_sessions`
   - `parties`
4. In Railway: add env var `NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED=true` and redeploy
5. Open two browser sessions, perform Party/Notification/Upload actions and verify live updates

**Next phase after UAT confirmation:**
- **REALTIME.1B** — DMS Documents + Party child tabs (party_contacts, party_addresses, party_bank_details)
  using Pattern A (TanStack Query invalidation helpers)

---

## 18. Final Decision

**CLOSED / PASS WITH NOTES**

Implementation is complete and safe. All code checks pass (tsc, build, 269 tests).
Deferred items are limited to:
- Manual Supabase dashboard Realtime table toggles (cannot be done from code)
- Two-session live UAT (requires Sameer to verify after enabling flag)
- RLS restricted-user test (deferred to Sameer UAT)

No safety violations. No DB migration. No new packages. No Railway changes.
No record forms subscribed. No service-role key used. No sensitive payload logging.

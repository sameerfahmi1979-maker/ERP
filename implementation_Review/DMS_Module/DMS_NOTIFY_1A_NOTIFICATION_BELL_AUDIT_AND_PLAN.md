# DMS.NOTIFY.1A — Notification Bell Audit & Implementation Plan

**Prepared:** 2026-07-20
**Auditor:** Senior ERP QA / Next.js + Supabase Realtime specialist
**Repository:** `C:\dev\agt-erp` — branch `main`
**Scope:** Read-only audit. No code, SQL, or migrations created.

---

## 1. Executive Summary

A notification bell **partially exists** in `app-header.tsx` but is a **static stub only** —
it renders a hardcoded red dot with no live data, no unread count, no dropdown, no actions,
and no link to the notifications page.

All server-side infrastructure for a fully working bell is **already in place**:
- `getUnreadNotificationCount()` — server action exists and is tested
- `getMyNotifications()` — server action exists
- `markAllMyNotificationsRead()` — server action exists
- `markNotificationRead()`, `dismissNotification()` — server actions exist
- `erp_notifications` table — live in DB, RLS-enabled, `status = 'unread'` default
- `RealtimeProvider` — already mounted in `ErpShell`, already subscribes to `erp_notifications` INSERT events and calls `invalidateMyNotifications(queryClient)` — the Realtime plumbing is live
- `["notifications", "unread-count"]` TanStack query key defined and mapped in `invalidation.ts`
- `NotificationSeverityBadge` component exists
- `/notifications` full page exists with tabs, mark-all-read, refresh
- DMS notifications bridge to `erp_notifications` via `bridgeDmsDmsNotificationsToGlobal()`

**DMS.NOTIFY.1A is safe to implement without any database migration.**

The only work required is upgrading the static bell stub in `app-header.tsx` into a real
client component that fetches the live count, renders a dropdown of recent unread items,
and hooks into the existing Realtime query invalidation.

---

## 2. Current Notification Architecture

```
erp_notifications (global, all modules)
       ↑
       │ bridgeDmsDmsNotificationsToGlobal()
       │
dms_notification_queue ← generateDmsExpiryNotifications()
       ↑
dms_expiry_reminders  ← generateDmsExpiryRemindersForDocument()

erp_email_queue  ←  bridgeDmsDmsNotificationsToGlobal() [when DMS_EXPIRY_EMAILS flag on]
       ↓
processEmailQueue() → email provider (SETTINGS.2)

erp_notifications
       ↓ (Supabase Realtime — already subscribed in RealtimeProvider)
TanStack queryClient.invalidateQueries(["notifications", "unread-count"])
       ↓
[MISSING] NotificationBell component — currently just a static stub
```

---

## 3. Existing Notification Tables / Migrations

| Table | Migration | Status |
|---|---|---|
| `erp_notifications` | `20260615001626_erp_notifications_1_global_notification_email_delivery_engine.sql` | ✅ Live, RLS enabled, `status` default `'unread'` |
| `erp_email_queue` | Same migration | ✅ Live; RLS narrowed in `20260629100000_erp_users_5_security_hardening_email_queue_rls.sql` |
| `erp_notification_templates` | Same migration | ✅ Live, 18 templates seeded |
| `erp_notification_delivery_logs` | Same migration | ✅ Live |
| `dms_notification_queue` | `20260614224102_erp_dms_8_expiry_renewal_notifications.sql` | ✅ Live |
| DMS→Global bridge columns | `20260615003816_erp_dms_8a_connect_dms_expiry_notifications_to_global_email.sql` | ✅ `bridge_status`, `global_notification_id`, `global_email_queue_id` on `dms_notification_queue` |

**No new table or column is needed for DMS.NOTIFY.1A.**

### `erp_notifications` column reference (key fields for the bell)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT | PK |
| `source_module` | TEXT | e.g. `DMS`, `HR`, `users` |
| `notification_type` | TEXT | e.g. `expiry_reminder`, `expired_document` |
| `severity` | TEXT | `info` / `success` / `warning` / `urgent` / `critical` |
| `title` | TEXT | Display title |
| `message` | TEXT | Body |
| `recipient_user_id` | BIGINT | Target user |
| `status` | TEXT | Default `'unread'` |
| `read_at` | TIMESTAMPTZ | Null if unread |
| `action_url` | TEXT | Link to navigate on click |
| `action_label` | TEXT | Link label |
| `created_at` | TIMESTAMPTZ | For time-ago display |
| `deleted_at` | TIMESTAMPTZ | Soft-delete; filter with `.is("deleted_at", null)` |

---

## 4. Existing Server Actions

### `src/server/actions/notifications/notifications.ts` — all usable as-is

| Action | Purpose | Bell Usage |
|---|---|---|
| `getUnreadNotificationCount()` | Returns `{ count: number }` for `recipient_user_id = me` where `status = 'unread'` | **Bell badge number** |
| `getMyNotifications({ status?, limit? })` | Returns `NotificationRow[]` for current user | **Bell dropdown list** (limit: 10) |
| `markNotificationRead(id)` | Sets `status = 'read'`, `read_at = now()` | **Per-item read button** |
| `markAllMyNotificationsRead()` | Batch-marks all `status = 'unread'` for current user | **Mark-all-read button** |
| `dismissNotification(id)` | Sets `status = 'dismissed'` | **Per-item dismiss button** |

**Also relevant (DMS-specific, already bridged to `erp_notifications`):**

| Action | File | Purpose |
|---|---|---|
| `generateDmsExpiryNotifications()` | `dms/notifications.ts` | Creates `dms_notification_queue` rows from due reminders |
| `bridgeDueDmsNotificationsToGlobal()` | `dms/dms-email-bridge.ts` | Copies to `erp_notifications` + `erp_email_queue` |
| `getUnreadDmsNotificationsCount()` | `dms/notifications.ts` | DMS-specific count from `dms_notification_queue` — **NOT the primary count for the bell** |

> **Important:** The bell should use `getUnreadNotificationCount()` from `notifications.ts`
> (querying `erp_notifications`) — not the DMS-specific `getUnreadDmsNotificationsCount()`
> which queries `dms_notification_queue`. DMS notifications only appear in `erp_notifications`
> after they are bridged. The global table is the correct source for the bell.

---

## 5. Existing Notification UI Components

| Component | File | Reusable in Bell? |
|---|---|---|
| `NotificationSeverityBadge` | `src/features/notifications/notification-severity-badge.tsx` | ✅ Yes — severity color coding |
| `NotificationStatusBadge` | `src/features/notifications/notification-status-badge.tsx` | ✅ Optional — for dropdown |
| `MyNotificationsTable` | `src/features/notifications/my-notifications-table.tsx` | ⚠️ Page-level; too heavy for dropdown — extract action logic only |
| `NotificationsPageClient` | `src/features/notifications/notifications-page-client.tsx` | ⚠️ Page component — linked from bell's "View all" |

### What does NOT exist

| Missing Component | Needed For |
|---|---|
| `NotificationBell` | The actual bell button + dropdown — **primary deliverable of DMS.NOTIFY.1A** |

---

## 6. Protected Layout / Header Integration Status

### Layout chain

```
src/app/(protected)/layout.tsx
    └── <ErpShell>
            └── <RealtimeProvider>   ← erp_notifications Realtime subscription LIVE
            └── <AppHeader>          ← bell stub is HERE
                    └── static <Bell> icon + hardcoded red dot (line 85–88)
```

### Bell stub (current — `src/components/layout/app-header.tsx` lines 84–88)

```tsx
{/* Notifications */}
<Button variant="ghost" size="sm" className="h-9 w-9 p-0 relative">
  <Bell className="h-4 w-4 text-muted-foreground" />
  <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full" />
</Button>
```

**Problems:**
1. Hardcoded red dot — always shows regardless of actual unread count
2. No `useQuery` or server fetch for count
3. No popover/dropdown
4. No navigation to `/notifications`
5. Not linked to Realtime invalidation (Realtime fires but no component consumes it for the bell)
6. No mark-read/dismiss actions

### `AppHeader` props

Currently receives only `displayName` and `email`. To add the bell, `AppHeader` needs
to either:
- **(Recommended)** Internally use `useQuery` to fetch the unread count client-side
  (queries `["notifications", "unread-count"]` which is already in the query keys)
- OR receive `unreadCount` as a prop from `ErpShell` (requires additional server fetch in layout — less clean)

The `useQuery` approach is self-contained and aligns with how the rest of the app works.

---

## 7. DMS Notification Pipeline Status

### Pipeline completeness

| Step | Implemented? | Manual/Auto |
|---|---|---|
| `generateDmsExpiryRemindersForDocument()` | ✅ Yes | Manual per-document or bulk button |
| `generateDmsExpiryNotifications()` | ✅ Yes | Manual — button in `/dms/notifications` |
| `bridgeDueDmsNotificationsToGlobal()` | ✅ Yes | Manual — button in `/dms/notifications` |
| `processEmailQueue()` | ✅ Yes | Manual — button in `/dms/notifications` |
| Automated scheduler (pg_cron / Edge Function) | ❌ No | Not yet — planned in DMS.NOTIFY.1C |

### DMS notifications in `erp_notifications`

When bridging runs, DMS notifications appear in `erp_notifications` with:
- `source_module = 'DMS'`
- `notification_type = 'expired_document'` or `'expiry_reminder'`
- `severity = 'urgent'` or `'warning'`
- `recipient_user_id` = document owner or creator

**These WILL appear in the bell** once bridging runs, because the bell reads from `erp_notifications`.

### Gap for DMS.NOTIFY.1A scope

DMS.NOTIFY.1A does not need to solve the scheduler. The bell will show DMS notifications
that have already been bridged to `erp_notifications`. After DMS.NOTIFY.1C (scheduler),
DMS notifications will appear automatically without any admin action.

---

## 8. Realtime Subscription Status

### What is wired

In `src/components/layout/realtime-provider.tsx`:

```tsx
function NotificationsSync() {
  const queryClient = useQueryClient();
  useRealtimeSync({
    table: "erp_notifications",
    event: "*",
    debounceMs: 500,
    onEvent: () => {
      invalidateMyNotifications(queryClient);  // invalidates ["notifications", "my"] AND ["notifications", "unread-count"]
    },
  });
  return null;
}
```

`invalidateMyNotifications` calls:
```ts
queryClient.invalidateQueries({ queryKey: ["notifications", "my"] });
queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
```

### What this means for the bell

When any row is inserted/updated in `erp_notifications`, the Realtime subscription fires
and invalidates `["notifications", "unread-count"]`. If the bell uses `useQuery` with that
key to fetch its count, **it will update automatically** — no additional Realtime plumbing needed.

**Realtime is already fully wired for the bell.** DMS.NOTIFY.1A requires no changes to `RealtimeProvider`.

---

## 9. Mark-All-Read Status

`markAllMyNotificationsRead()` server action **already exists** in `notifications.ts`:
- Batch-updates all `status = 'unread'` rows to `status = 'read'` for the current user
- Returns `{ count: number }` — count of rows updated
- Calls `revalidatePath("/notifications")`

The bell dropdown should include a "Mark all read" button that calls this action and then
invalidates `["notifications", "unread-count"]` and `["notifications", "my"]`.

**No new server action needed.** ✅

---

## 10. Security / RLS Review

### `erp_notifications` RLS

Current policy (from `20260615001626`):
```sql
CREATE POLICY erp_notifications_authenticated
ON public.erp_notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

**⚠️ FINDING — Broad policy:** The current RLS on `erp_notifications` allows any
authenticated user to read/write ALL notifications, not just their own. This is a
pre-existing issue unrelated to DMS.NOTIFY.1A. The server action correctly filters
by `recipient_user_id = ctx.profile.id` in the application layer, which mitigates
the risk in practice.

**This is a pre-existing security gap. DMS.NOTIFY.1A should NOT attempt to fix it** —
that would require a DB migration which is out of scope for this phase. Document it as
a known issue and schedule as a follow-up.

### `erp_email_queue` RLS

Narrowed in `20260629100000` — scoped to `notifications.email_queue.*` permissions and
global admins. ✅ Correct.

### Bell component security

The bell component will call `getMyNotifications({ limit: 10 })` and
`getUnreadNotificationCount()` which both enforce `ctx.profile` check and
filter by `recipient_user_id`. No additional security concern introduced.

---

## 11. Gaps Found

| # | Gap | Severity | DMS.NOTIFY.1A Scope? |
|---|---|---|---|
| G1 | Bell button is a static stub — no live count, no dropdown | **Critical** | ✅ Fix in this phase |
| G2 | Bell not linked to `/notifications` page | High | ✅ Fix in this phase |
| G3 | Realtime fires but nothing consumes it for the bell (no consumer of `["notifications","unread-count"]` query key) | High | ✅ Fix in this phase |
| G4 | No mark-all-read in bell dropdown | Medium | ✅ Include in this phase |
| G5 | DMS notifications only appear after manual bridge run — no scheduler | Medium | ❌ Deferred to DMS.NOTIFY.1C |
| G6 | `erp_notifications` RLS is broad `authenticated ALL` — any user can read any row at DB level | Low | ❌ Separate security phase |
| G7 | Bell always shows red dot even when 0 unread | High | ✅ Fix in this phase |

---

## 12. Files Required for DMS.NOTIFY.1A Implementation

### New file to create

| File | Purpose |
|---|---|
| `src/components/erp/notification-bell.tsx` | Full bell component — unread count badge, popover dropdown, per-item actions, mark-all-read, "View all" link |

### Existing files to modify

| File | Change Required |
|---|---|
| `src/components/layout/app-header.tsx` | Replace static bell stub (lines 84–88) with `<NotificationBell />` component |

### Files NOT to modify

| File | Reason |
|---|---|
| `src/components/layout/erp-shell.tsx` | No change needed — `AppHeader` already mounted |
| `src/components/layout/realtime-provider.tsx` | Already subscribed and invalidating — no change |
| `src/server/actions/notifications/notifications.ts` | All required actions already exist |
| `src/lib/query/query-keys.ts` | `notifications.unreadCount()` key already defined |
| `src/lib/query/invalidation.ts` | `invalidateMyNotifications` already defined |
| Any `supabase/migrations/*.sql` | No DB changes needed |
| Any `src/app/**/page.tsx` | No page changes needed |

---

## 13. No-DB-Change Confirmation

DMS.NOTIFY.1A **requires zero database migrations.**

Verification:
- ✅ `erp_notifications` table exists with all required columns
- ✅ `status` column has `'unread'` as default
- ✅ `recipient_user_id` index exists for fast per-user queries
- ✅ `read_at`, `dismissed_at`, `archived_at` columns exist
- ✅ `action_url` and `action_label` columns exist for navigation
- ✅ `source_module` and `severity` columns exist for display/filtering
- ✅ Realtime already enabled on the table (subscription in `RealtimeProvider` working)

---

## 14. Implementation Acceptance Criteria

The implementation of DMS.NOTIFY.1A is complete when ALL of the following are true:

| # | Criterion | Verification |
|---|---|---|
| AC1 | Bell button shows live unread count from `erp_notifications` | Count matches `SELECT count(*) FROM erp_notifications WHERE recipient_user_id = ? AND status = 'unread'` |
| AC2 | Badge is hidden (or shows 0) when no unread notifications exist | Count = 0 → no red badge visible |
| AC3 | Badge is red for any `urgent`/`critical` notification; amber for `warning`; grey for `info` | Visual inspection |
| AC4 | Clicking the bell opens a dropdown showing up to 10 most recent unread notifications | Each row shows: severity, title (truncated), time-ago, action link, dismiss button |
| AC5 | Clicking a notification's action link navigates to the document/record | `actionUrl` is used |
| AC6 | Clicking "dismiss" on a notification calls `dismissNotification(id)` and removes it from the dropdown | Network request observable; count decrements |
| AC7 | "Mark all read" button calls `markAllMyNotificationsRead()` and clears the badge | Count = 0 after action |
| AC8 | "View all →" link navigates to `/notifications` | Page loads correctly |
| AC9 | When a new `erp_notifications` row is inserted (e.g. after bridging DMS), the count updates automatically within ~1 second without page refresh | Realtime Supabase subscription fires → `invalidateMyNotifications` → `useQuery` refetches |
| AC10 | No hydration mismatch | Server-renders count as 0 (or deferred); client updates after mount |
| AC11 | Bell is accessible — keyboard navigable, ARIA attributes present | `aria-label="Notifications"`, `aria-haspopup="true"` |
| AC12 | DMS expiry notifications (bridged to `erp_notifications`) appear in the bell | Bridge a DMS notification → verify it appears in bell dropdown |

---

## 15. Recommended Next Step

### Exact implementation plan for `notification-bell.tsx`

```tsx
// src/components/erp/notification-bell.tsx
"use client";

// Uses:
// - useQuery(["notifications", "unread-count"], getUnreadNotificationCount)
// - useQuery(["notifications", "my", { limit: 10, status: "unread" }], getMyNotifications)
// - useTransition for markAllMyNotificationsRead / dismissNotification
// - Popover from shadcn/ui
// - NotificationSeverityBadge from src/features/notifications/
// - Link from next/link for action_url and /notifications
// - formatDistanceToNow from date-fns for time-ago display
// - Bell icon from lucide-react
// - Badge count: red if any urgent/critical, amber if warning, grey if info
// - When count = 0: Bell icon only, no badge
```

### Mount point change in `app-header.tsx`

Replace lines 84–88:
```tsx
{/* Notifications */}
<Button variant="ghost" size="sm" className="h-9 w-9 p-0 relative">
  <Bell className="h-4 w-4 text-muted-foreground" />
  <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full" />
</Button>
```

With:
```tsx
{/* Notifications */}
<NotificationBell />
```

---

## 16. Final Decision

```
DMS.NOTIFY.1A READY FOR IMPLEMENTATION

Exact files:
  NEW:    src/components/erp/notification-bell.tsx
  MODIFY: src/components/layout/app-header.tsx (lines 84–88 only)

No DB migration required.
No server action changes required.
No layout changes required.
No Realtime plumbing changes required — already live.

Known pre-existing issue (not blocking DMS.NOTIFY.1A):
  erp_notifications RLS policy is broad authenticated-ALL.
  App-layer filtering by recipient_user_id mitigates risk in practice.
  Schedule as a separate security hardening phase after DMS.NOTIFY.1A.
```

---

*Audit completed: 2026-07-20 | Read-only inspection — no files modified, no migrations created or applied.*

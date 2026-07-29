# ERP DMS.8 — Expiry, Renewal Tracking, and Notifications
## Implementation Report

**Phase:** ERP DMS.8  
**Date:** 2026-06-15  
**Status:** CLOSED / PASS ✅  
**Gate:** `tsc --noEmit` → 0 errors | `npm run build` → 0 errors  

---

## 1. Executive Summary

DMS.8 delivers enterprise-grade document expiry management to the ALGT ERP DMS. The phase adds:
- A full expiry dashboard (`/dms/expiring`) with 9 summary stat cards and 4 view tabs
- An idempotent reminder schedule engine (7 checkpoints: 90/60/30/14/7/1/0 days before expiry)
- A complete renewal workflow (`/dms/renewals`) with start → in-progress → complete/cancel flow
- An in-app notification foundation (`/dms/notifications`) that is email-ready but does not send real email
- Updated DMS Document Record → Expiry section with live reminder schedule, generate/rebuild buttons, and Start Renewal action

**Microsoft 365 / Office 365:** DMS.8 creates notification records but does NOT call Microsoft Graph or store any email provider secrets. Real email delivery requires the future **ERP SETTINGS.2 — Email Provider / Microsoft 365 Graph Configuration** phase.

---

## 2. DMS.7 Dependency Confirmation

All prior phases confirmed complete:
- DMS.2: `dms_expiry_reminders` base table existed with id, document_id, reminder_days_before, reminder_date, status, sent_at, recipients_json, created_at, updated_at
- DMS.3–7: Admin masters, document record, upload inbox, versioning, party integration all operational
- DMS.7: File integrity, cleanup, versioning UX — all PASS

---

## 3. Existing Notification/Email System Audit

**Finding:** No global notification or email module exists.

Searched for: `notification`, `email`, `smtp`, `graph`, `microsoft`, `outlook`, `office365`, `send_email`

**Result:** Only `src/server/actions/settings/ai-settings.ts` contains any provider config. No email module, no notification center, no SMTP/Graph integration anywhere.

**Decision:** Created `dms_notification_queue` as a DMS-local notification foundation. Channels: `in_app` (active) and `email_ready` (queued for future SETTINGS.2).

---

## 4. Migration / Schema Changes

**File:** `supabase/migrations/20260614224102_erp_dms_8_expiry_renewal_notifications.sql`

### 4.1 `dms_expiry_reminders` Enhancements
New columns (all idempotent via `DO $$ IF NOT EXISTS`):
- `notification_status TEXT DEFAULT 'pending'`
- `last_notification_at TIMESTAMPTZ`
- `retry_count INT DEFAULT 0`
- `dismissed_by BIGINT REFERENCES user_profiles(id)`
- `dismissed_at TIMESTAMPTZ`
- `dismissal_reason TEXT`
- `escalation_level INT DEFAULT 0`
- `assigned_to BIGINT REFERENCES user_profiles(id)`
- `department_code TEXT`

New indexes:
- `UNIQUE (document_id, reminder_days_before)` → idempotent generation
- `(reminder_date, status) WHERE status = 'pending'` → efficient dashboard

### 4.2 `dms_renewal_requests` (NEW)
Tracks document renewal workflows. Status values: `draft`, `requested`, `in_progress`, `waiting_for_document`, `renewed`, `cancelled`, `rejected`. Priority: `normal`, `high`, `urgent`. RLS enabled + forced.

### 4.3 `dms_notification_queue` (NEW)
In-app and email-ready notification records. Channels: `in_app`, `email_ready`. Status: `pending`, `sent`, `read`, `dismissed`, `failed`. RLS enabled + forced.

### 4.4 Permissions Seeded
7 new permissions into `permissions` table (ON CONFLICT DO NOTHING):
`dms.expiry.view`, `dms.expiry.manage`, `dms.expiry.dismiss`, `dms.renewals.view`, `dms.renewals.manage`, `dms.notifications.view`, `dms.notifications.manage`

---

## 5. Expiry Reminder Schedule Implementation

**File:** `src/server/actions/dms/expiry-reminders.ts`

### Schedule Checkpoints
```
-90 days before expiry
-60 days before expiry
-30 days before expiry
-14 days before expiry
-7  days before expiry
-1  day  before expiry
 0  days (expiry day)
```

### Key Functions
| Function | Description |
|---|---|
| `getDmsExpiryDashboardStats()` | Returns 9-stat object (expired/expiring/missing/pending-reminders/dismissed/open-renewals) |
| `getDmsExpiringDocuments(filter)` | Returns expired, expiring (≤90d), or missing-expiry docs |
| `getDmsExpiryReminders(filter)` | Returns reminder rows with document/dismisser/assignee joins |
| `generateDmsExpiryRemindersForDocument(id)` | Upserts 7 reminder rows (idempotent via unique index) |
| `generateDmsExpiryRemindersBulk(opts)` | Loops through all docs with expiry_date, calls per-document generator |
| `rebuildDmsExpiryReminders(id)` | Cancels pending, regenerates; logs `expiry_schedule_rebuilt` |
| `dismissDmsExpiryReminder(id, reason)` | Sets dismissed status + dismissed_by + dismissal_reason |
| `markDmsExpiryReminderHandled(id)` | Sets status=sent, sent_at=now |

**Idempotency:** `upsert({onConflict: 'document_id,reminder_days_before'})` — running generate multiple times produces no duplicates.

---

## 6. Expiry Dashboard Implementation

**Route:** `/dms/expiring`  
**Component:** `src/features/dms/expiry/dms-expiry-dashboard-page-client.tsx`

### Summary Cards (9 cards)
| Card | Source |
|---|---|
| Expired | `dms_documents.expiry_date < today` |
| Expiring ≤7 days | `expiry_date` between today and today+7 |
| Expiring ≤30 days | today+7 to today+30 |
| Expiring ≤60 days | today+30 to today+60 |
| Expiring ≤90 days | today+60 to today+90 |
| Missing Expiry | `expiry_date IS NULL AND status != archived` |
| Pending Reminders | `dms_expiry_reminders.status = 'pending'` |
| Dismissed Reminders | `status = 'dismissed'` |
| Open Renewals | active `dms_renewal_requests` |

### Tabs
- **Expired** — `DmsExpiringDocumentsTable view="expired"` with Start Renewal action
- **Expiring Soon** — `DmsExpiringDocumentsTable view="expiring"` ≤90 days
- **Missing Expiry** — `DmsExpiringDocumentsTable view="missing_expiry"`
- **Renewal Requests** — `DmsRenewalRequestsTable`

Admin buttons (for `dms.admin` or `dms.expiry.manage`): Bulk Generate Reminders, Generate Due Notifications.

---

## 7. Renewal Workflow Implementation

**Route:** `/dms/renewals`  
**File:** `src/server/actions/dms/renewals.ts`

### Dialogs
- **`DmsStartRenewalDialog`**: Priority selector, target date, notes → `createDmsRenewalRequest()`
- **`DmsCompleteRenewalDialog`**: New expiry date, notes → `completeDmsRenewalRequest()` which:
  - Updates `dms_documents.expiry_date`
  - Calls `rebuildDmsExpiryReminders()`
  - Dismisses all pending reminders with reason = renewal no
  - Logs `document_renewed` event

### Status Flow
```
requested → in_progress → waiting_for_document → renewed
                       ↘ cancelled / rejected
```

Renewal number format: `RNW-{doc_no_suffix}-{timestamp_base36}`

---

## 8. Notification Foundation Implementation

**File:** `src/server/actions/dms/notifications.ts`

### Design Decision
No global email provider exists. `dms_notification_queue` is a DMS-local foundation with two channels:
- `in_app` — immediately visible in `/dms/notifications`
- `email_ready` — queued for future SETTINGS.2 email provider (not used yet)

### Key Functions
| Function | Description |
|---|---|
| `getDmsNotifications(filter)` | Fetches notifications with doc + recipient joins |
| `generateDmsExpiryNotifications(opts)` | For due reminders (`reminder_date <= today AND status=pending AND notification_status != sent`): creates `in_app` notification, updates reminder `notification_status=sent` |
| `markDmsNotificationRead(id)` | Sets `status=read, read_at=now` |
| `dismissDmsNotification(id)` | Sets `status=dismissed, dismissed_at=now` |
| `getUnreadDmsNotificationsCount()` | Returns count for badge indicators |

### Notification Content Templates
- **Expiry reminder:** `"DMS Expiry Reminder: {doc_no} — {title}"` + days remaining message
- **Expired:** `"DMS Document Expired: {doc_no} — {title}"` + expiry date message

---

## 9. Office 365 / Email Provider Readiness Decision

**Status:** Email-ready architecture. No real email sent.

| Item | Status |
|---|---|
| Microsoft tenant_id / client_id / client_secret stored in DMS | ❌ Never |
| Real email sent from DMS code | ❌ Not implemented |
| Notification records include recipient_email + subject + message | ✅ Ready for email delivery |
| `channel = 'email_ready'` option available | ✅ Prepared for SETTINGS.2 |
| Next step | Implement **ERP SETTINGS.2 — Email Provider / Microsoft 365 Graph** then **ERP NOTIFICATIONS.1** |

**Recommended sequence after DMS.8:**
1. `ERP SETTINGS.2` — Email Provider / Microsoft 365 Graph Configuration (global, not DMS-only)
2. `ERP NOTIFICATIONS.1` — Global Notification and Email Delivery Engine
3. `ERP DMS.8A` — Connect DMS Expiry Notifications to Email Delivery

---

## 10. Server Actions Created / Updated

| File | Actions |
|---|---|
| `src/server/actions/dms/expiry-reminders.ts` | `getDmsExpiryDashboardStats`, `getDmsExpiringDocuments`, `getDmsExpiryReminders`, `generateDmsExpiryRemindersForDocument`, `generateDmsExpiryRemindersBulk`, `rebuildDmsExpiryReminders`, `dismissDmsExpiryReminder`, `markDmsExpiryReminderHandled` |
| `src/server/actions/dms/renewals.ts` | `getDmsRenewalRequests`, `createDmsRenewalRequest`, `updateDmsRenewalRequest`, `completeDmsRenewalRequest`, `cancelDmsRenewalRequest` |
| `src/server/actions/dms/notifications.ts` | `getDmsNotifications`, `generateDmsExpiryNotifications`, `markDmsNotificationRead`, `dismissDmsNotification`, `getUnreadDmsNotificationsCount` |

---

## 11. UI Components / Routes Created

### New Components
| Path | Description |
|---|---|
| `src/features/dms/expiry/dms-expiry-status-badge.tsx` | Color-coded expiry status badge (expired/expiring/valid) |
| `src/features/dms/expiry/dms-reminder-status-badge.tsx` | Reminder status badge (pending/sent/dismissed) |
| `src/features/dms/expiry/dms-expiry-summary-cards.tsx` | 9-stat grid cards |
| `src/features/dms/expiry/dms-expiring-documents-table.tsx` | Expiring/expired/missing docs table |
| `src/features/dms/expiry/dms-reminder-schedule-table.tsx` | Per-document reminder schedule with dismiss/handled actions |
| `src/features/dms/expiry/dms-expiry-dashboard-page-client.tsx` | Full dashboard page client |
| `src/features/dms/renewals/dms-renewal-status-badge.tsx` | Renewal status badge |
| `src/features/dms/renewals/dms-start-renewal-dialog.tsx` | Start Renewal ERPChildDialogForm |
| `src/features/dms/renewals/dms-complete-renewal-dialog.tsx` | Complete Renewal ERPChildDialogForm |
| `src/features/dms/renewals/dms-renewal-requests-table.tsx` | Renewals table with complete/cancel actions |
| `src/features/dms/renewals/dms-renewal-requests-page-client.tsx` | Renewals page client |
| `src/features/dms/notifications/dms-notifications-table.tsx` | Notifications table with read/dismiss actions |
| `src/features/dms/notifications/dms-notifications-page-client.tsx` | Notifications page client |

### New Routes
| Route | File |
|---|---|
| `/dms/expiring` | `src/app/(protected)/dms/expiring/page.tsx` |
| `/dms/renewals` | `src/app/(protected)/dms/renewals/page.tsx` |
| `/dms/notifications` | `src/app/(protected)/dms/notifications/page.tsx` |

### Updated Components
- `src/features/dms/documents/sections/dms-document-expiry-section.tsx` — Fully rewritten with reminder schedule, generate/rebuild buttons, Start Renewal button
- `src/features/dms/documents/dms-document-record-form.tsx` — Passes `documentId`, `documentNo`, `documentTitle`, `canManage` to expiry section
- `src/components/layout/app-sidebar.tsx` — Added "Expiry & Renewals" + "Notifications" links under Documents
- `src/lib/query/query-keys.ts` — Added DMS.8 query keys (expiryDashboardStats, expiringDocuments, expiryReminders, documentExpiryReminders, renewalRequests, documentRenewals, notifications, notificationsUnreadCount)
- `src/lib/query/invalidation.ts` — Added invalidateDmsExpiry, invalidateDmsDocumentExpiry, invalidateDmsRenewals, invalidateDmsDocumentRenewals, invalidateDmsNotifications

---

## 12. Permissions Used

| Code | Purpose |
|---|---|
| `dms.expiry.view` | View expiry dashboard, reminders |
| `dms.expiry.manage` | Generate, rebuild, handle reminders; bulk generate |
| `dms.expiry.dismiss` | Dismiss reminders |
| `dms.renewals.view` | View renewal requests |
| `dms.renewals.manage` | Create, update, complete, cancel renewals |
| `dms.notifications.view` | View notifications |
| `dms.notifications.manage` | Mark read, dismiss, generate notifications |
| `dms.admin` | Full access to all DMS.8 features |

Fallback: `dms.documents.view` allows viewing expiry dashboard (read-only).

---

## 13. Audit Events Implemented

| Event Type | Trigger |
|---|---|
| `expiry_reminders_generated` | `generateDmsExpiryRemindersForDocument` |
| `expiry_schedule_rebuilt` | `rebuildDmsExpiryReminders` |
| `expiry_reminder_dismissed` | `dismissDmsExpiryReminder` |
| `expiry_reminder_handled` | `markDmsExpiryReminderHandled` |
| `expiry_notification_created` | `generateDmsExpiryNotifications` (per notification) |
| `expiry_notification_read` | `markDmsNotificationRead` |
| `expiry_notification_dismissed` | `dismissDmsNotification` |
| `renewal_request_created` | `createDmsRenewalRequest` |
| `renewal_cancelled` | `cancelDmsRenewalRequest` |
| `document_renewed` | `completeDmsRenewalRequest` |
| `expiry_date_updated` | `completeDmsRenewalRequest` (when new expiry provided) |

All events use `dms_document_events` + `logAudit()`. No file contents, signed URLs, AI data, or secrets logged.

---

## 14. Source of Truth / Rule Updates

- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` — Last updated to DMS.8, new module row added
- `.cursor/rules/erp-dms-standard.mdc` — Updated to V9, Phase DMS.8, Prohibited Patterns V4 (DMS.8 additions), Phase Sequence V7

---

## 15. TypeScript / Lint / Build QA

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run build` | ✅ 0 errors |

**Errors fixed during implementation:**
1. `TS2322`: `effectiveDocId` (`number | null`) passed to `documentId: number` prop — fixed with `?? 0` and conditional `canManage`
2. `TS2554`: `.select("id", { count: "exact", head: true })` chained on `.update()` (wrong API) — replaced with `.select("id")` and `.data?.length`
3. `TS2322`: Return type mismatch between `generateDmsExpiryRemindersForDocument` and `rebuildDmsExpiryReminders` — fixed return type guard

---

## 16. Manual Browser QA Checklist

- [ ] Open `/dms/expiring` → dashboard cards load
- [ ] Expired tab shows documents with past expiry date
- [ ] Expiring Soon tab shows documents expiring ≤90 days
- [ ] Missing Expiry tab shows docs with no expiry date
- [ ] Click "Generate Reminders" for a document → success toast + reminder rows appear
- [ ] Bulk Generate Reminders (admin) → processes multiple docs
- [ ] Dismiss a reminder → status changes to Dismissed
- [ ] Mark reminder as Handled → status changes to Sent
- [ ] Click "Renew" → DmsStartRenewalDialog opens
- [ ] Submit renewal request → appears in Renewal Requests tab and `/dms/renewals`
- [ ] Complete renewal with new expiry date → document expiry_date updates, reminders rebuild
- [ ] Cancel renewal → status = cancelled
- [ ] Generate Due Notifications → notification created in `/dms/notifications`
- [ ] Open `/dms/notifications` → notification list loads
- [ ] Mark notification read → unread dot disappears
- [ ] Dismiss notification → removed from Unread tab
- [ ] Email provider notice banner appears on `/dms/notifications`
- [ ] No real email sent (no SMTP/Graph calls)
- [ ] No Office 365 secrets in any DMS table
- [ ] No OCR/AI button anywhere in DMS.8
- [ ] Open DMS document record → Expiry section shows reminder schedule table
- [ ] Generate Reminders from Expiry section → schedule populates
- [ ] Rebuild Reminders → old pending cancelled, new ones created
- [ ] Start Renewal from expired document banner → dialog opens
- [ ] Party Documents still works (regression)
- [ ] Upload/versioning still works (regression)
- [ ] Sidebar: "Expiry & Renewals" and "Notifications" links visible

---

## 17. Database QA Checklist

- [ ] `dms_expiry_reminders` has new DMS.8 columns
- [ ] `dms_renewal_requests` table exists, RLS enabled+forced
- [ ] `dms_notification_queue` table exists, RLS enabled+forced
- [ ] Generating reminders twice for same document → no duplicate rows (unique index works)
- [ ] `dms_renewal_requests` row created with correct renewal_no
- [ ] `dms_notification_queue` rows created on notification generation
- [ ] `dms_documents.expiry_date` updated on renewal completion
- [ ] Old pending `dms_expiry_reminders` cancelled after renewal
- [ ] `dms_document_events` rows inserted for all events
- [ ] No Microsoft/Office 365 API keys in any DMS table

---

## 18. Issues / Deferred Items

| Item | Status | Notes |
|---|---|---|
| Real email delivery | DEFERRED | Requires SETTINGS.2 (global Email Provider) |
| Microsoft 365 / Office 365 Graph | DEFERRED | Not DMS scope — global ERP settings module |
| `email_ready` channel processing | DEFERRED | Requires NOTIFICATIONS.1 global engine |
| Server-side SHA-256 verification | DEFERRED (from DMS.7) | Heavy for sync server actions — async job in DMS.9+ |
| OCR / AI classification | DEFERRED | DMS.9/DMS.10 scope |
| Department-based notification routing | DEFERRED | Requires department/org chart data (later phase) |
| Escalation logic (escalation_level > 0) | DEFERRED | DMS.8A or NOTIFICATIONS.1 |
| Push/WebSocket real-time notifications | DEFERRED | Supabase Realtime — later phase |

---

## 19. Recommended Next Phase

No global email provider exists. Recommended sequence:

**Immediate next:**
```
ERP SETTINGS.2 — Email Provider / Microsoft 365 Graph Configuration
```
Implements: Supabase-stored encrypted credentials (tenant_id, client_id, client_secret), Graph API token management, test send, global email queue consumer.

**Then:**
```
ERP NOTIFICATIONS.1 — Global Notification and Email Delivery Engine
```

**Then connect DMS:**
```
ERP DMS.8A — Connect DMS Expiry Notifications to Email Delivery
```

**Or skip email and continue DMS OCR:**
```
ERP DMS.9 — OCR Pipeline Foundation
```

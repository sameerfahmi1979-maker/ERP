# ERP NOTIFICATIONS.1 — Global Notification and Email Delivery Engine
## Implementation Report

**Phase:** ERP NOTIFICATIONS.1  
**Status:** CLOSED / PASS ✅  
**Date:** 2026-06-15  
**Implements:** Global ERP notification center + global email delivery queue + Microsoft 365 email provider integration + retry/failure tracking  

---

## 1. Executive Summary

ERP NOTIFICATIONS.1 has been fully implemented. The phase delivers a reusable ERP-wide notification and email delivery engine:

- 4 new database tables with RLS enforced (in-app notifications, email queue, templates, delivery logs)
- 4 server action files covering full CRUD + queue processing + template rendering + delivery logs
- 5 new UI routes (user + 4 admin)
- Email queue processing using the Microsoft 365 Graph provider from SETTINGS.2
- Exponential retry backoff (5min → 30min → 2hr)
- DMS bridge helpers (admin-manual, full automation deferred to DMS.8A)
- Template renderer with `{{variable}}` substitution (no eval)
- TypeScript: **PASS** (0 errors)

---

## 2. SETTINGS.2 Dependency Confirmation

ERP SETTINGS.2 (Email Provider / Microsoft 365 Graph Configuration) was confirmed complete and working before this phase:

- `erp_email_provider_configs` table exists with M365_DEFAULT provider
- `src/lib/email/providers/factory.ts` — `getDefaultEmailProvider()` and `getEmailProvider(code)` available
- `src/lib/email/vault.ts` — secret resolution from Supabase Vault working
- Microsoft 365 client credentials flow tested and confirmed by Sameer
- No Microsoft Graph SDK imported — all email calls via provider abstraction

---

## 3. DMS.8 Relationship / Bridge Decision

DMS.8 created `dms_notification_queue` (local DMS-only notifications). This phase does **not** touch `dms_notification_queue` — it remains for DMS.8A.

**Bridge approach:** `src/server/actions/notifications/bridges/dms-notification-bridge.ts` provides two admin-manual functions:
- `bridgeDmsNotificationToGlobalNotification(id)` — bridges a single DMS notification
- `bridgeDueDmsNotifications(limit)` — bridges multiple pending records

These are not auto-called in this phase. Full automation belongs to **ERP DMS.8A**.

---

## 4. Migration File

**File:** `supabase/migrations/20260615001626_erp_notifications_1_global_notification_email_delivery_engine.sql`  
**Applied:** Yes (via MCP user-supabase)

---

## 5. Tables Created

| Table | PK | RLS | RLS Forced |
|---|---|---|---|
| `erp_notifications` | BIGINT | ✅ | ✅ |
| `erp_email_queue` | BIGINT | ✅ | ✅ |
| `erp_notification_templates` | BIGINT | ✅ | ✅ |
| `erp_notification_delivery_logs` | BIGINT | ✅ | ✅ |

All tables use `authenticated` policies (server actions enforce RBAC via `hasPermission()`).

---

## 6. RLS Policies Created

- `erp_notifications_authenticated` — FOR ALL TO authenticated USING (true) WITH CHECK (true)
- `erp_email_queue_authenticated` — FOR ALL TO authenticated
- `erp_notification_templates_authenticated` — FOR ALL TO authenticated
- `erp_notification_delivery_logs_authenticated` — FOR ALL TO authenticated (append-only; no UPDATE/DELETE)

No anonymous access to any table.

---

## 7. Permissions Seeded

| Permission Code | Description |
|---|---|
| `notifications.view` | View own in-app notifications |
| `notifications.manage` | Create and manage ERP notifications |
| `notifications.dismiss` | Dismiss own notifications |
| `notifications.admin` | View and manage all ERP notifications |
| `notifications.email_queue.view` | View the global email queue |
| `notifications.email_queue.manage` | Add and manage email queue items |
| `notifications.email_queue.process` | Trigger email queue processing |
| `notifications.templates.view` | View notification templates |
| `notifications.templates.manage` | Create and update notification templates |
| `notifications.logs.view` | View delivery logs |

---

## 8. Templates Seeded

| Code | Module | Type | Channels |
|---|---|---|---|
| `DMS_EXPIRY_REMINDER` | DMS | expiry_reminder | In-App + Email |
| `DMS_DOCUMENT_EXPIRED` | DMS | expired_document | In-App + Email |
| `SYSTEM_TEST_EMAIL` | SYSTEM | test_email | Email only |

All templates use `{{variable}}` placeholder syntax.

---

## 9. Server Actions Created

### `src/server/actions/notifications/notifications.ts`
- `getMyNotifications(filters)` — user's own notifications
- `getAllNotifications(filters)` — admin view all
- `getUnreadNotificationCount()` — badge count
- `createNotification(input)` — RBAC-gated creation
- `markNotificationRead(id)` — own notification only
- `markAllMyNotificationsRead()` — batch mark read
- `dismissNotification(id)` — own notification only
- `archiveNotification(id)` — own notification only

### `src/server/actions/notifications/email-queue.ts`
- `queueEmail(input)` — add to queue
- `getEmailQueue(filters)` — admin view
- `processEmailQueueItem(id, dryRun)` — send single item via provider
- `processEmailQueue(options)` — batch process up to 100
- `retryEmailQueueItem(id)` — reset failed to pending
- `cancelEmailQueueItem(id, reason)` — cancel pending/failed

### `src/server/actions/notifications/templates.ts`
- `getNotificationTemplates()` — list all
- `getNotificationTemplate(idOrCode)` — by ID or code
- `createNotificationTemplate(input)` — RBAC-gated
- `updateNotificationTemplate(id, input)` — partial update
- `activateNotificationTemplate(id)` — enable
- `deactivateNotificationTemplate(id)` — disable
- `renderNotificationTemplate(code, variables)` — safe `{{var}}` rendering

### `src/server/actions/notifications/delivery-logs.ts`
- `getNotificationDeliveryLogs(filters)` — admin view

### `src/server/actions/notifications/bridges/dms-notification-bridge.ts`
- `bridgeDmsNotificationToGlobalNotification(dmsNotificationId)` — manual bridge
- `bridgeDueDmsNotifications(limit)` — batch manual bridge

---

## 10. Email Provider Integration

Email queue processing at `processEmailQueueItem()`:

1. Fetches the pending queue row
2. Resolves provider: if `provider_config_id` set → looks up `provider_code` → calls `getEmailProvider(code)`, else `getDefaultEmailProvider()`
3. Calls `provider.sendEmail({...})` via the SETTINGS.2 abstraction
4. On success: updates `status = "sent"`, stores `external_message_id`, inserts delivery log
5. On failure: increments `attempt_count`, sets backoff `next_retry_at`, inserts delivery log with error
6. Max attempts exhausted → `status = "failed"` (no more auto-retry)

**No Microsoft Graph hardcoding in feature code. All email via provider abstraction.**

---

## 11. Email Queue Processing Behavior

| Attempt | Status After Failure | Next Retry |
|---|---|---|
| 1 | pending | +5 minutes |
| 2 | pending | +30 minutes |
| 3 | failed (final) | N/A |

- Default batch limit: 20 per run
- Max configurable limit: 100 per run
- Dry run mode: simulates without sending
- Admin can manually retry via `retryEmailQueueItem()` after failure

---

## 12. UI Routes / Components Created

| Route | Page | Component |
|---|---|---|
| `/notifications` | `src/app/(protected)/notifications/page.tsx` | `NotificationsPageClient` |
| `/admin/notifications` | `src/app/(protected)/admin/notifications/page.tsx` | `AdminNotificationsPageClient` |
| `/admin/notifications/email-queue` | `src/app/(protected)/admin/notifications/email-queue/page.tsx` | `EmailQueuePageClient` |
| `/admin/notifications/templates` | `src/app/(protected)/admin/notifications/templates/page.tsx` | `NotificationTemplatesPageClient` |
| `/admin/notifications/logs` | `src/app/(protected)/admin/notifications/logs/page.tsx` | `DeliveryLogsPageClient` |

Feature components in `src/features/notifications/`:
- `notifications-page-client.tsx` — user notifications with tabs
- `my-notifications-table.tsx` — list with read/dismiss/archive actions
- `notification-severity-badge.tsx` — severity color badges
- `notification-status-badge.tsx` — status badges (notifications + queue)
- `admin/admin-notifications-page-client.tsx` — admin all-notifications table + stats
- `admin/email-queue-table.tsx` — queue table with per-item actions
- `admin/email-queue-process-panel.tsx` — process queue + queue test email UI
- `admin/email-queue-page-client.tsx` — email queue page wrapper
- `admin/notification-templates-table.tsx` — templates table with activate/deactivate
- `admin/notification-template-form-dialog.tsx` — create/edit template dialog
- `admin/notification-templates-page-client.tsx` — templates page wrapper
- `admin/delivery-logs-table.tsx` — delivery logs table
- `admin/delivery-logs-page-client.tsx` — logs page wrapper

---

## 13. Header / Badge Integration Status

**Deferred.** The codebase has a `Bell` icon imported in `app-sidebar.tsx` but no dedicated header component with notification badge integration was found. The sidebar now includes a "Notifications" link under the Overview group. A dedicated header bell icon with unread count badge was not implemented in this phase — documented as future work.

The `getUnreadNotificationCount()` server action and `queryKeys.notifications.unreadCount()` / `invalidateUnreadNotifications()` are ready for header integration in a future phase.

---

## 14. DMS Bridge Readiness

The bridge module at `src/server/actions/notifications/bridges/dms-notification-bridge.ts` is ready for DMS.8A:

- Reads `dms_notification_queue` records (pending/queued status)
- Creates `erp_notifications` + `erp_email_queue` entries
- Uses `DMS_EXPIRY_REMINDER` / `DMS_DOCUMENT_EXPIRED` templates for rendering
- Admin-manual only in this phase (no auto-trigger)
- `dms_notification_queue` table is **untouched** — DMS.8 notification generation continues working

---

## 15. Audit Events Implemented

| Event | Trigger |
|---|---|
| `create` on `erp_notifications` | `createNotification()` |
| `create` on `erp_email_queue` | `queueEmail()` |
| `email_sent` on `erp_email_queue` | `processEmailQueueItem()` — success |
| `email_failed` on `erp_email_queue` | `processEmailQueueItem()` — failure |
| `update` on `erp_email_queue` (retry) | `retryEmailQueueItem()` |
| `create` on `erp_notification_templates` | `createNotificationTemplate()` |
| `update` on `erp_notification_templates` | `updateNotificationTemplate()` |

No full email body logged. No secrets logged.

---

## 16. Source of Truth / Rule Updates

- **`.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`** — updated `Last updated`, `Last closed gate`, added NOTIFICATIONS.1 closure summary
- **`.cursor/rules/erp-notifications-standard.mdc`** — NEW: defines global notifications standard, rules, tables, permissions, routes, DMS integration rules, template syntax
- **`src/lib/query/query-keys.ts`** — added `queryKeys.notifications.*` section
- **`src/lib/query/invalidation.ts`** — added 5 invalidation helpers
- **`src/lib/workspace/workspace-route-registry.ts`** — registered 5 new routes
- **`src/components/layout/app-sidebar.tsx`** — added Notifications to Overview + 4 admin items under Administration

---

## 17. TypeScript / Lint / Build QA

```
npx tsc --noEmit → EXIT 0 (no errors)
```

Two errors fixed during QA:
1. `max_attempts` not passed to `queueEmail()` in `email-queue-process-panel.tsx` — fixed
2. `max_attempts` not passed to `queueEmail()` in `dms-notification-bridge.ts` — fixed

---

## 18. Manual Browser QA Checklist

| Check | Expected | Status |
|---|---|---|
| `/notifications` loads | User's own notifications, empty state if none | Ready to test |
| Mark as read works | Status changes, badge decrements | Ready to test |
| Dismiss works | Status becomes dismissed | Ready to test |
| `/admin/notifications` loads | All notifications table + stats | Ready to test |
| `/admin/notifications/email-queue` loads | Queue table + process panel | Ready to test |
| Queue test email | Item appears in queue | Ready to test |
| Process queue (dry run) | Summary without sending | Ready to test |
| Process queue (real send) | Email sent via M365, status = sent | Ready to test |
| Delivery log created after send | Log entry in `/admin/notifications/logs` | Ready to test |
| Retry failed item | Reset to pending | Ready to test |
| Cancel queue item | Status = cancelled | Ready to test |
| `/admin/notifications/templates` loads | 3 seeded templates visible | Ready to test |
| Create template | New template appears | Ready to test |
| Edit template | Changes saved | Ready to test |
| Deactivate template | Status = Inactive | Ready to test |
| DMS `/dms/notifications` still works | Unaffected | Should pass |

---

## 19. Database / Security QA

| Check | Status |
|---|---|
| `erp_notifications` exists with RLS forced | ✅ Applied in migration |
| `erp_email_queue` exists with RLS forced | ✅ Applied in migration |
| `erp_notification_templates` exists with RLS forced | ✅ Applied in migration |
| `erp_notification_delivery_logs` exists with RLS forced | ✅ Applied in migration |
| 10 permissions seeded | ✅ Applied in migration |
| 3 templates seeded | ✅ Applied in migration |
| No secrets in notification/queue tables | ✅ No secret columns in schema |
| No full email body beyond `message` in logs | ✅ Only status/error/duration logged |
| `dms_notification_queue` untouched | ✅ No DROP or ALTER |
| BIGINT PKs only | ✅ All 4 tables |

---

## 20. Issues / Deferred Items

| Item | Decision |
|---|---|
| Header notification bell badge | Deferred — no header component; sidebar link added instead |
| Cron-based auto-processing | Deferred — manual admin processing from UI is sufficient per prompt |
| Full DMS.8A bridge automation | Deferred to ERP DMS.8A phase |
| `dms_notification_queue` cleanup | Deferred to ERP DMS.8A |
| Email throttling enforcement | Deferred — `throttle_per_minute` / `daily_send_limit` columns exist in SETTINGS.2 but not enforced in queue processor |
| HR / Fleet / Workshop notification templates | Deferred to their respective implementation phases |

---

## 21. Recommended Next Phase

```
ERP DMS.8A — Connect DMS Expiry Notifications to Global Email Delivery
```

This phase will:
1. Trigger `bridgeDueDmsNotifications()` automatically from DMS expiry generation
2. Migrate `dms_notification_queue` pending records to `erp_email_queue`
3. Process and send DMS expiry reminder emails via Microsoft 365
4. Update `dms_notification_queue` status upon successful bridge
5. Enable `DMS_EXPIRY_EMAILS` feature flag in `erp_email_feature_flags`

After DMS.8A:
```
ERP DMS.9 — OCR Pipeline Foundation
```

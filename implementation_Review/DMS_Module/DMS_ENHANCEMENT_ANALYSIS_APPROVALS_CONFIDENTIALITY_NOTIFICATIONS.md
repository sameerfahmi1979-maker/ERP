# DMS Module Enhancement Plan
## Approvals · System Notifications with Expiry Alerts

**Prepared:** 2026-07-20 (Revised)
**Prepared for:** Sameer — ALGT ERP
**Scope:** Document Management System (DMS) — two active enhancement streams
**Status:** ANALYSIS & SUGGESTION — not yet a phase prompt

> **Revision note (2026-07-20):**
> - Confidentiality enforcement removed from active scope — deferred to a future phase.
> - Notification design changed: **system-level automatic processing** replaces per-document
>   recipient selection. Admins configure who receives what once in the system settings;
>   the engine finds all expiring documents and sends to the configured list automatically.

---

## Executive Summary

| # | Feature | DB Foundation | App Code | Gap Level |
|---|---|---|---|---|
| 1 | Document Approvals | **Partial** — tables exist, unused in UI | Almost none | **High** |
| 2 | System Notifications + Expiry Alerts (Auto) | **Strong** — full pipeline exists | Mostly wired; missing: bell, global recipient config, auto-scheduler | **Medium** |
| — | Confidentiality Levels | *(deferred — see note at bottom)* | — | — |

---

---

## PART 1 — Document Approvals

### 1.1 What Already Exists

#### Database Tables (live, in production)

| Table | Purpose |
|---|---|
| `dms_document_approvals` | Audit trail: `document_id`, `workflow_id`, `step_id`, `action`, `actioned_by`, `actioned_at`, `comments` |
| `dms_document_workflows` | Workflow definitions (name, type, is_active) |
| `dms_document_workflow_steps` | Steps per workflow: `step_code`, `step_name`, `requires_role`, `is_initial`, `is_final`, `sort_order` |
| `dms_approve_runs` | Tracks an active approval run per document |

#### `dms_documents.status` values (already defined)

```
draft → pending_review → approved → rejected → active → expired → archived → superseded
```

The status enum already contains `pending_review`, `approved`, `rejected` — the vocabulary is in place.

#### What the application code does NOT yet have

- No server actions for `dms_document_workflows`, `dms_document_workflow_steps`, or `dms_approve_runs`
- No UI screen to configure approval workflows
- No UI to submit a document for review or take an approve/reject action
- No trigger that promotes document `status` when the approver acts
- No notification templates for approval events

---

### 1.2 Proposed Design — DMS.APPROVALS.1

#### Workflow Model

```
Document Author  →  submits for review  →  dms_approve_runs (status = open)
                                                 ↓
                          Approver (required_role or specific user)
                                 ↓           ↓
                             Approve       Reject
                                 ↓           ↓
                        status = approved   status = rejected + comment required
```

#### Approval Roles — Recommended: Role-Based (Phase 1)

Each workflow step has `requires_role` (e.g. `dms.approvals.level1`, `dms.approvals.level2`).
Any user holding that role can approve. This is simple to configure and aligns with the
existing RBAC system.

#### Database Changes Needed

```sql
-- Fill the gap in dms_approve_runs
ALTER TABLE dms_approve_runs
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open'
    CHECK (status IN ('open', 'approved', 'rejected', 'withdrawn')),
  ADD COLUMN IF NOT EXISTS current_step_id BIGINT REFERENCES dms_document_workflow_steps(id),
  ADD COLUMN IF NOT EXISTS submitted_by BIGINT REFERENCES user_profiles(id),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Link document types to their required approval workflow
ALTER TABLE dms_document_types
  ADD COLUMN IF NOT EXISTS approval_workflow_id BIGINT REFERENCES dms_document_workflows(id);
```

#### Server Actions Needed

| Action | File |
|---|---|
| `submitDocumentForApproval(documentId)` | `src/server/actions/dms/approvals.ts` |
| `approveDocument(documentId, runId, comment?)` | `src/server/actions/dms/approvals.ts` |
| `rejectDocument(documentId, runId, reason)` | `src/server/actions/dms/approvals.ts` |
| `withdrawApproval(documentId, runId)` | `src/server/actions/dms/approvals.ts` |
| `getApprovalRunForDocument(documentId)` | `src/server/actions/dms/approvals.ts` |
| `listPendingApprovalsForCurrentUser()` | `src/server/actions/dms/approvals.ts` |
| `getApprovalHistory(documentId)` | `src/server/actions/dms/approvals.ts` |

#### UI Screens Needed

| Screen | Route | Description |
|---|---|---|
| Pending Approvals Queue | `/dms/approvals` | Documents awaiting the current user's approval — same card style as Review Queue |
| Approval panel in Document Record | `/dms/documents/record/[id]` — new section | Approve/Reject with comment, visible only to qualifying approvers |
| Submit for Approval button | Inside document record form | Transitions `draft → pending_review` |
| Approval History tab | Inside document record | Timeline of all actions on the document |
| Workflow Admin | `/admin/dms/approval-workflows` | CRUD for workflows and steps; assign workflow to document types |

#### Notification Templates Needed

| Template Code | When Triggered | Recipients |
|---|---|---|
| `DMS_APPROVAL_REQUESTED` | Document submitted for approval | All users with `requires_role` on current step |
| `DMS_APPROVED` | Document approved | Document owner + submitter |
| `DMS_REJECTED` | Document rejected | Document owner + submitter |
| `DMS_APPROVAL_WITHDRAWN` | Submitter withdraws | Current pending approver(s) |

#### RBAC Permissions Needed

```
dms.approvals.view       — see the approvals queue
dms.approvals.act        — approve or reject (also needs requires_role match)
dms.approvals.admin      — manage workflow configurations
dms.approvals.submit     — submit own documents for approval (default for all DMS users)
```

#### Integration with Existing Review Queue

The existing Review Queue (`dms_review_queue`) handles AI/OCR intake review — a technical
pipeline step. Approvals are a business decision step. They are separate pages but share
the same component styling.

---

### 1.3 Phase Plan — Approvals

| Phase | Name | Scope |
|---|---|---|
| DMS.APPROVALS.1A | DB + Server Actions | Migrate `dms_approve_runs`, write all server actions, insert permissions |
| DMS.APPROVALS.1B | Document Record UI | Submit button, Approve/Reject panel, Approval History tab |
| DMS.APPROVALS.1C | Approvals Queue page | `/dms/approvals` — pending items for current user |
| DMS.APPROVALS.1D | Notifications | Add `DMS_APPROVAL_*` templates + trigger on each action |
| DMS.APPROVALS.2 | Admin Workflow Config | `/admin/dms/approval-workflows` CRUD |

---

---

## PART 2 — System Notifications + Expiry Alerts (Fully Automatic)

### 2.1 What Already Exists — Full Inventory

#### Core Problem Being Solved

Currently, **nothing happens automatically**. An admin must:
1. Go to `/dms/notifications` and click **"Generate Due"**
2. Click **"Bridge to Global"**
3. Click **"Send Emails"**

This means no one receives expiry alerts unless an admin manually runs these three steps.
Additionally, to set up reminders you must open each document individually.

**The new design eliminates all of this**: configure once in the admin settings, and the
system finds and notifies automatically on its own schedule.

---

#### Database (live)

| Table | Purpose |
|---|---|
| `dms_expiry_reminders` | Per-document reminder schedule at 90/60/30/14/7/1/0 days before expiry |
| `dms_notification_queue` | DMS-specific in-app + email notification staging rows |
| `erp_notifications` | Global notification store (bell icon source) |
| `erp_notification_templates` | Template registry with `{{variable}}` variable substitution |
| `erp_email_queue` | Email send queue processed by `processEmailQueue` |
| `erp_notification_delivery_logs` | Delivery attempt logs |
| `erp_email_feature_flags` | On/off flags per email type (`DMS_EXPIRY_EMAILS` already exists) |

#### Existing Templates (from live DB, DMS-relevant)

| Template Code | Type | Email | In-App |
|---|---|---|---|
| `DMS_DOCUMENT_EXPIRED` | `expired_document` | ✓ | ✓ |
| `DMS_EXPIRY_REMINDER` | `expiry_reminder` | ✓ | ✓ |

#### Existing Server Actions Pipeline (live but manual)

```
generateDmsExpiryRemindersForDocument()   ← must be called per document manually
        ↓
    dms_expiry_reminders (rows at 90/60/30/14/7/1/0 days)
        ↓
generateDmsExpiryNotifications()          ← admin clicks "Generate Due"
        ↓
    dms_notification_queue rows
        ↓
bridgeDueDmsNotificationsToGlobal()       ← admin clicks "Bridge to Global"
        ↓
    erp_notifications + erp_email_queue
        ↓
processEmailQueue()                       ← admin clicks "Send Emails"
        ↓
    Email sent to recipient
```

---

### 2.2 Gaps Identified

| Gap | Priority | Description |
|---|---|---|
| **No top-bar notification bell** | Critical | `getUnreadDmsNotificationsCount()` exists but is used nowhere in the header layout |
| **No automated scheduler** | Critical | All three pipeline steps require manual admin clicks |
| **No reminder schedule auto-generation** | Critical | Reminders must be generated per document; bulk generation exists but is manual |
| **No global recipient configuration** | High | Who receives notifications is hardcoded to `created_by`. There is no admin screen to say "send all expiry alerts to role X and user Y" |
| **`recipients_json` on `dms_expiry_reminders` unused** | High | The column exists but is never read or written |
| **No "mark all read" on bell** | Medium | Users must dismiss notifications one by one |
| **No escalation for already-expired** | Medium | `escalation_level` column on `dms_expiry_reminders` exists but is never triggered |
| **HR compliance documents not wired** | Medium | Passports, EIDs, visas, insurance in HR module never trigger expiry notifications |

---

### 2.3 Proposed Design — Fully Automatic System

#### The Core Principle

> **Admin configures the system once. The system does the rest.**
>
> No one needs to go into each document and set notification periods.
> No admin needs to click "Generate", "Bridge", or "Send" buttons.

---

#### A. Global Notification Recipient Configuration

A new admin settings page at **`/admin/dms/notification-settings`** replaces all
per-document recipient work. This page lets you define **who receives what, across all documents**.

```
┌─────────────────────────────────────────────────────────┐
│  DMS Expiry Notification Settings                       │
├─────────────────────────────────────────────────────────┤
│  Notification Windows                                   │
│  Send alerts when a document expires in:                │
│  ☑  90 days   ☑  60 days   ☑  30 days                  │
│  ☑  14 days   ☑  7 days    ☑  1 day    ☑  0 (expired)  │
├─────────────────────────────────────────────────────────┤
│  Global Recipients — receive ALL expiry notifications   │
│  ┌────────────────────────────────────────────────────┐ │
│  │ + Add Recipient                                    │ │
│  │ ○ User         [combobox: search user]             │ │
│  │ ○ Role         [combobox: dms.admin, hr.admin ...] │ │
│  │ ○ Department   [combobox]                          │ │
│  └────────────────────────────────────────────────────┘ │
│  Current recipients:                                    │
│  👤 Sameer (sameer@algt.net)              [Remove]      │
│  🏷 Role: dms.admin                        [Remove]      │
│  🏷 Role: hr.admin                         [Remove]      │
├─────────────────────────────────────────────────────────┤
│  Always include:                                        │
│  ☑  Document Owner                                     │
│  ☑  Document Creator                                   │
│  ☐  Owner's Manager                                    │
├─────────────────────────────────────────────────────────┤
│  Email Feature Flag                                     │
│  ☑  Send email notifications (DMS_EXPIRY_EMAILS)       │
├─────────────────────────────────────────────────────────┤
│  [Save Settings]                                        │
└─────────────────────────────────────────────────────────┘
```

**How it works:**
- When the scheduler runs, it reads this global config
- For every document with a due reminder, it creates one notification per configured recipient
- The "always include" checkboxes ensure the person responsible for the document is always notified
- No per-document configuration is needed at all

**New DB table for this config:**

```sql
CREATE TABLE dms_notification_settings (
  id               BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  setting_key      TEXT UNIQUE NOT NULL,    -- e.g. 'global_expiry_recipients'
  setting_value    JSONB NOT NULL,
  updated_by       BIGINT REFERENCES user_profiles(id),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Example row for global_expiry_recipients:
-- {
--   "reminder_days": [90, 60, 30, 14, 7, 1, 0],
--   "recipient_users": [5, 12],
--   "recipient_roles": ["dms.admin", "hr.admin"],
--   "always_include_owner": true,
--   "always_include_creator": true,
--   "always_include_manager": false
-- }
```

---

#### B. Automatic Reminder Schedule Generation

Currently `generateDmsExpiryRemindersForDocument()` must be called per document.

**New behaviour:** When any document is **created or updated with an expiry date**, the
reminder schedule is automatically generated via a Postgres trigger OR a server action
hook in `createDmsDocument` / `updateDmsDocument`. No manual step needed.

```sql
-- Trigger on dms_documents: auto-generate reminder schedule when expiry_date is set/changed
CREATE OR REPLACE FUNCTION auto_generate_expiry_reminders()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.expiry_date IS NOT NULL AND
      (OLD.expiry_date IS NULL OR OLD.expiry_date != NEW.expiry_date)) THEN
    -- Delete old pending reminders
    DELETE FROM dms_expiry_reminders
    WHERE document_id = NEW.id AND status = 'pending';
    -- Insert fresh reminders for configured windows
    INSERT INTO dms_expiry_reminders (document_id, reminder_days_before, reminder_date, status)
    SELECT NEW.id, days, (NEW.expiry_date - days * INTERVAL '1 day')::DATE, 'pending'
    FROM unnest(ARRAY[90,60,30,14,7,1,0]) AS days
    WHERE (NEW.expiry_date - days * INTERVAL '1 day')::DATE >= CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_expiry_reminders
AFTER INSERT OR UPDATE OF expiry_date ON dms_documents
FOR EACH ROW EXECUTE FUNCTION auto_generate_expiry_reminders();
```

---

#### C. Automated Scheduler — Full End-to-End Auto-Run

All three pipeline steps run on a schedule without any manual intervention.

**Recommended approach: Supabase Edge Function + pg_cron**

```
Every day at 07:00 AM (configurable)
       ↓
Edge Function: dms-daily-notification-run
       ↓
Step 1: generateDmsExpiryNotifications({ limit: 500 })
         — finds all due reminders, reads global recipient config,
           creates one dms_notification_queue row per recipient
       ↓
Step 2: bridgeDueDmsNotificationsToGlobal({ limit: 500 })
         — moves pending rows to erp_notifications + erp_email_queue
       ↓
Step 3: processEmailQueue({ limit: 200 })
         — sends emails via configured email provider (SETTINGS.2)
       ↓
Done — all recipients receive their notifications
```

```sql
-- pg_cron: run daily at 07:00 UTC
SELECT cron.schedule(
  'dms-daily-notification-run',
  '0 7 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.edge_function_url') || '/dms-daily-notification-run',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
  )$$
);
```

> The Edge Function URL and service role key are stored as Supabase secrets, not hardcoded.

The manual "Generate Due", "Bridge to Global", "Send Emails" buttons on `/dms/notifications`
**remain in place** as an emergency/manual override for admins. They are just no longer the
only way to trigger the pipeline.

---

#### D. Top-Bar Notification Bell

The bell lives in the main app header, always visible to all authenticated users.
It shows unread notification count and a quick-access dropdown.

```
┌────────────────────────────────────────────┐
│  🔔  Notifications                    [3]  │
├────────────────────────────────────────────┤
│  🔴 URGENT  DOC-0042 — Passport (Ali)      │
│             Expired 3 days ago             │
│             [View Document]  [Dismiss]     │
├────────────────────────────────────────────┤
│  🟡 WARNING DOC-0031 — Trade Licence       │
│             Expires in 7 days              │
│             [View Document]  [Dismiss]     │
├────────────────────────────────────────────┤
│  🟡 WARNING DOC-0018 — EID Ahmed Hassan    │
│             Expires in 14 days             │
│             [View Document]  [Dismiss]     │
├────────────────────────────────────────────┤
│  [Mark all as read]     [View all →]       │
└────────────────────────────────────────────┘
```

**Badge rules:**
- Red: any `urgent` or `critical` severity unread notification
- Amber: warning-only notifications
- Grey: info-only

**Realtime:** Subscribe to `erp_notifications` INSERT where `recipient_user_id = current_user_id`
so the count updates instantly when a new notification arrives without page refresh.

**Implementation files:**
- `src/components/erp/notification-bell.tsx` — new component
- Root layout (`src/app/(protected)/layout.tsx`) — mount the bell in the header

---

#### E. Auto-Notifications for HR Compliance Documents

The same engine should cover HR compliance document expiry (passports, EIDs, visas, insurance)
because today these also send no automatic alerts.

The scheduler will query:
- `employee_identity_documents` where `expiry_date` is within reminder windows
- `employee_medical_insurances` where `expiry_date` is within reminder windows

Recipients for HR compliance expiry:
- The employee's assigned HR manager
- All users with `hr.admin` permission

This uses the same `erp_notifications` + `erp_email_queue` pipeline, with templates
`HR_EMPLOYEE_COMPLIANCE_EXPIRY` (to be created).

---

### 2.4 Complete Recipient Decision Matrix (Automatic, No Manual Selection)

| Event | How Recipients Are Determined | Who Receives |
|---|---|---|
| DMS document expiry (90/60/30/14/7/1 days) | Reads `dms_notification_settings.global_expiry_recipients` | Configured global list + always-include fields |
| DMS document expired (day 0) | Same as above + escalation | Global list + owner + creator + escalation role |
| Approval requested | Reads `requires_role` from current workflow step | All users with that role |
| Document approved | Document record | Owner + submitter |
| Document rejected | Document record | Owner + submitter |
| HR compliance expiry (passport/EID/visa) | HR settings config | Employee's HR manager + `hr.admin` users |

**No document-level recipient configuration needed by anyone.**

---

### 2.5 Missing Notification Templates to Add

| Template Code | Trigger | Key Variables |
|---|---|---|
| `DMS_APPROVAL_REQUESTED` | Submit for approval | `document_no`, `title`, `submitter_name`, `action_url` |
| `DMS_APPROVED` | Document approved | `document_no`, `title`, `approver_name`, `action_url` |
| `DMS_REJECTED` | Document rejected | `document_no`, `title`, `approver_name`, `rejection_reason`, `action_url` |
| `DMS_APPROVAL_WITHDRAWN` | Submitter withdraws | `document_no`, `title`, `action_url` |
| `HR_EMPLOYEE_COMPLIANCE_EXPIRY` | HR compliance doc expiry | `employee_name`, `document_type`, `expiry_date`, `days_remaining`, `action_url` |
| `HR_DEPENDENT_DOCUMENT_EXPIRY` | Dependent doc expiry | `employee_name`, `dependent_name`, `document_type`, `expiry_date`, `action_url` |

---

### 2.6 Phase Plan — Notifications

| Phase | Name | Scope |
|---|---|---|
| DMS.NOTIFY.1A | Top-bar notification bell | `NotificationBell` component + header integration + Realtime subscription + mark-all-read |
| DMS.NOTIFY.1B | Global recipient settings + auto reminder generation | New `dms_notification_settings` table; `/admin/dms/notification-settings` UI; DB trigger for auto-reminder creation on expiry date set |
| DMS.NOTIFY.1C | Automated scheduler | Supabase Edge Function `dms-daily-notification-run`; pg_cron schedule; update `generateDmsExpiryNotifications` to read global recipient config |
| DMS.NOTIFY.1D | Missing DMS templates | Add `DMS_APPROVAL_*` templates in DB |
| DMS.NOTIFY.2 | HR compliance expiry pipeline | HR document expiry scanning; `HR_EMPLOYEE_COMPLIANCE_EXPIRY` template; HR-scoped recipient logic |

---

---

## PART 3 — Cross-Cutting Concerns

### 3.1 Recommended Implementation Order

```
1. DMS.NOTIFY.1A   — Bell (high visibility, no DB changes, immediate user value)
2. DMS.NOTIFY.1B   — Global recipient config + auto-reminder trigger
3. DMS.NOTIFY.1C   — Scheduler (automates everything configured in 1B)
4. DMS.APPROVALS.1A + 1B — Approvals DB + document record UI
5. DMS.APPROVALS.1C      — Approvals queue page
6. DMS.APPROVALS.1D      — Approval notification templates
7. DMS.NOTIFY.2          — HR compliance expiry pipeline
8. DMS.APPROVALS.2       — Workflow admin configuration UI
```

### 3.2 Shared Components to Reuse

| Component | Already Exists | Used By |
|---|---|---|
| `ERPChildDialogForm` | ✓ | Approval action dialog, recipient add dialog |
| `ERPCombobox` | ✓ | User/role/department picker |
| `dms-document-status-badge.tsx` | ✓ | Approval status display |
| `notification-severity-badge.tsx` | ✓ | Bell dropdown severity icons |
| `my-notifications-table.tsx` | ✓ | "View all" page linked from bell |

### 3.3 RBAC Permissions — All New Permissions

```
-- Approvals
dms.approvals.view
dms.approvals.act
dms.approvals.admin
dms.approvals.submit

-- Notification settings
dms.notifications.settings.manage   — configure global recipient list

-- (Already exist — no change)
dms.notifications.view
dms.notifications.manage
dms.expiry.view
dms.expiry.manage
dms.expiry.dismiss
```

### 3.4 Email Configuration

The system uses **SETTINGS.2** (ERP Email Settings) as the email provider. No changes needed:
- Configured at `/admin/settings` → Email Settings
- `DMS_EXPIRY_EMAILS` feature flag in `erp_email_feature_flags` gates email delivery
- New flags `DMS_APPROVAL_EMAILS` and `HR_COMPLIANCE_EXPIRY_EMAILS` to be added alongside it

---

## PART 4 — Summary of All Required DB Changes

| Migration | Tables / Objects | Phase |
|---|---|---|
| `dms_approve_runs_columns` | Add `status`, `submitted_by`, `submitted_at`, `rejection_reason`, `completed_at` | APPROVALS.1A |
| `dms_document_types_approval_workflow` | Add `approval_workflow_id` FK | APPROVALS.1A |
| `dms_notification_settings_table` | Create `dms_notification_settings` | NOTIFY.1B |
| `dms_auto_expiry_reminder_trigger` | `auto_generate_expiry_reminders()` trigger on `dms_documents` | NOTIFY.1B |
| `erp_notification_templates_approvals` | INSERT `DMS_APPROVAL_*` templates | NOTIFY.1D |
| `erp_email_feature_flags_new` | INSERT `DMS_APPROVAL_EMAILS`, `HR_COMPLIANCE_EXPIRY_EMAILS` | NOTIFY.1D |
| `erp_permissions_new` | INSERT new permission codes | All phases |

---

## PART 5 — Files Affected Reference

### Existing Files to Modify

| File | Change |
|---|---|
| `src/app/(protected)/layout.tsx` | Mount `NotificationBell` in header |
| `src/server/actions/dms/notifications.ts` | Read `dms_notification_settings` for recipients in `generateDmsExpiryNotifications` |
| `src/server/actions/dms/documents.ts` | Call `generateDmsExpiryRemindersForDocument` automatically on create/update when expiry date present (redundant once DB trigger is in place, but keep as fallback) |
| `src/features/dms/documents/dms-document-record-form.tsx` | Add approval action panel section |

### New Files to Create

| File | Purpose |
|---|---|
| `src/components/erp/notification-bell.tsx` | Top-bar bell with dropdown, realtime count, mark-all-read |
| `src/server/actions/dms/approvals.ts` | All approval server actions |
| `src/server/actions/dms/notification-settings.ts` | Read/write `dms_notification_settings` |
| `src/features/dms/approvals/dms-approvals-queue-page-client.tsx` | Pending approvals queue |
| `src/features/dms/approvals/dms-approval-action-panel.tsx` | Approve/Reject panel inside document |
| `src/features/dms/approvals/dms-approval-history-section.tsx` | Approval history timeline |
| `src/app/(protected)/dms/approvals/page.tsx` | Approvals queue route |
| `src/app/(protected)/admin/dms/approval-workflows/page.tsx` | Workflow admin |
| `src/app/(protected)/admin/dms/notification-settings/page.tsx` | Global notification recipient config |
| `supabase/functions/dms-daily-notification-run/index.ts` | Scheduled Edge Function |

---

## APPENDIX — Confidentiality (Deferred)

Confidentiality enforcement (`dms_documents.confidentiality_level`) is **not in scope** for
the current implementation stream. The column, 6 levels, and partial server-side filtering
already exist. Full enforcement (RLS, role matrix, access override UI) will be addressed in
a separate future phase: **DMS.CONFIDENTIALITY.1**.

The existing partial filter (hiding `hr/legal/executive` from non-admins in the document list)
remains in place and is not changed.

---

*Document revised: 2026-07-20 | ALGT ERP DMS Enhancement Plan*
*Next step: Confirm phase order and proceed with implementation prompt for DMS.NOTIFY.1A (notification bell).*

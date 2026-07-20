# DMS.2 — Full Approval System Planning Report

**Phase:** DMS.2 — Full Approval System Planning  
**Date:** 2026-07-20  
**Status:** PLANNING ONLY — No code or SQL modified  
**Prepared by:** Cursor AI Agent (planning mode)

---

## 1. Executive Summary

DMS.2 will implement a complete business document approval workflow on top of the existing DMS infrastructure. All three core approval tables (`dms_document_workflows`, `dms_document_workflow_steps`, `dms_document_approvals`) already exist live in the database, but they are **unused** — the approval section in the document record is a confirmed placeholder. Several critical schema gaps must be addressed before the workflow can be built.

**Key findings:**
- All approval tables exist live but have never been written to by any business logic.
- `dms_document_approvals` is an **audit log** table — it records completed actions, not pending requests. It is missing `status`, `submitted_by`, `submitted_at`, and `reason` columns required for the business workflow.
- `dms_documents` has no `approval_status` column — only `status` (lifecycle) and `review_status` (AI review). A new `approval_status` column (plus `submitted_by`/`submitted_at`) must be added.
- `dms_approve_runs` is confirmed AI-intake-only and must NOT be repurposed.
- Only one approval permission exists (`dms.documents.approve`). Granular approval permissions are missing.
- RLS on `dms_document_approvals` is insufficient for business approvals — select is too permissive and insert blocks submitters.
- Zero approval notification templates exist in the live DB.
- The `DmsDocumentApprovalsSection` UI is a confirmed 19-line placeholder.
- No approval queue page or admin workflow page exists.

**Recommended approach for DMS.2:** Single-step approval using existing tables with schema gap-fill migration. Workflow table support is present but not required for DMS.2 — wire it optionally (if a workflow is assigned to the document type, use it; otherwise use a default single-step flow).

---

## 2. Mandatory Rules / Source Files Reviewed

| File | Found | Role |
|---|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | ✅ | Current phase tracker |
| `.cursor/rules/algt-erp-source-of-truth.mdc` | ✅ | Primary rule file |
| `.cursor/rules/erp-child-dialog-form-standard.mdc` | ✅ | UI dialog standard |
| `.cursor/rules/erp-workspace-save-close-standard.mdc` | ✅ | Save/close standard |
| `.cursor/rules/erp-record-workspace-form-standard.mdc` | ✅ | Record form standard |
| `implementation_Review/DMS_Module/DMS_0_EXISTING_DMS_BASELINE_AND_SCOPE_LOCK.md` | ✅ | DMS baseline |
| `implementation_Review/DMS_Module/DMS_1_FULL_NOTIFICATION_SYSTEM_IMPLEMENTATION_REPORT.md` | ✅ | DMS.1 implementation |
| `implementation_Review/DMS_Module/DMS_1_NOTIFICATION_SYSTEM_REVIEW_FIX_AND_CLOSURE_REPORT.md` | ✅ | DMS.1 closure |
| `supabase/migrations/20260614192000_erp_dms_2_database_foundation_rls_numbering_storage_buckets.sql` | ✅ | Core DMS schema |
| Live Supabase DB via `user-supabase` MCP | ✅ | Column/RLS/permission verification |

---

## 3. Missing Rule / Source Files

| File | Status | Action |
|---|---|---|
| `implementation_Review/DMS_Module/DMS_ENHANCEMENT_ANALYSIS_APPROVALS_CONFIDENTIALITY_NOTIFICATIONS.md` | Not found in repo | Skipped — DMS.0/DMS.1 reports are sufficient |
| Old `028` files | Correctly absent | Not used (028 track abandoned per DMS.0) |

---

## 4. DMS.0 / DMS.1 Carry-Forward Status

| Item | Status |
|---|---|
| DMS.0 — Baseline & Scope Lock | ✅ COMPLETE |
| DMS.1 — Notification System | ✅ ACCEPTED WITH DEPLOYMENT PENDING |
| Old 028 track | ✅ FORMALLY ABANDONED |
| `dms_notification_settings` singleton + trigger | ✅ Applied (closure migration) |
| DMS.1 scheduler deployment | ⚠️ Pending — DO NOT TOUCH in DMS.2 |
| `BIRTH_CERTIFICATE` missing expiry fix | ✅ Applied |
| Absolute URL in expiry email links | ✅ Applied 2026-07-20 |

---

## 5. Existing Approval Database Inventory

### 5.1 `dms_document_approvals` (LIVE — unused)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| id | bigint | NO | PK |
| document_id | bigint | NO | FK → dms_documents |
| workflow_id | bigint | YES | FK → dms_document_workflows |
| step_id | bigint | YES | FK → dms_document_workflow_steps |
| action | text | NO | `approved \| rejected \| returned \| escalated` |
| actioned_by | bigint | YES | FK → user_profiles |
| actioned_at | timestamptz | NO | DEFAULT now() |
| comments | text | YES | Optional comment |
| created_at | timestamptz | NO | DEFAULT now() |

**RLS Policies:**
- `dms_approvals_select` (SELECT): `auth.uid() IS NOT NULL AND current_user_has_permission('dms.documents.view')` — **TOO PERMISSIVE** — any viewer sees all approvals
- `dms_approvals_insert` (INSERT WITH CHECK): `current_user_has_permission('dms.documents.approve') OR current_user_has_role('system_admin')` — **blocks submitters** from creating their own approval requests
- No UPDATE or DELETE policies

**Critical gaps for DMS.2:**
1. ❌ No `status` column (pending/approved/rejected/withdrawn) — it's an immutable audit log, not a request state table
2. ❌ No `submitted_by` / `submitted_at` — no record of who submitted for approval
3. ❌ No `reason` column — mandatory rejection reasons cannot be stored
4. ❌ RLS insert policy blocks regular users from submitting for approval
5. ❌ No UPDATE policy — withdrawal impossible
6. ❌ SELECT policy is too broad — any `dms.documents.view` user sees all approvals

**Classification:** Audit log table. Safe to extend for DMS.2 with additional columns.

### 5.2 `dms_document_workflows` (LIVE — unused)

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| workflow_code | text | UNIQUE |
| name_en | text | |
| name_ar | text | nullable |
| description | text | nullable |
| document_type_id | bigint | nullable FK → dms_document_types |
| is_active | boolean | DEFAULT true |
| created_by/updated_by/deleted_at | audit cols | ✅ Present |

**RLS:** `dms_workflows_select` (SELECT for any authenticated viewer), `dms_workflows_manage` (ALL for `dms.admin` or `system_admin`)  
**Status:** ✅ Schema complete for DMS.2.  
**Row count:** 0 rows (unused)

### 5.3 `dms_document_workflow_steps` (LIVE — unused)

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| workflow_id | bigint | FK CASCADE |
| step_code | text | UNIQUE per workflow |
| step_name | text | |
| is_initial | boolean | marks entry step |
| is_final | boolean | marks terminal step |
| requires_role | text | nullable role_code |
| sort_order | int | |
| is_active | boolean | |
| created_at | timestamptz | |

**Gaps:** Missing `step_type` (approve/review/acknowledge), `updated_at`, `approver_user_id` for direct-user assignment (vs. role-based). These are acceptable for DMS.2 — role-based is sufficient.  
**Status:** ✅ Usable as-is for DMS.2.

### 5.4 `dms_approve_runs` (LIVE — AI INTAKE ONLY)

**Classification:** AI transactional approval/save run tracking. Used only by AI intake Phase 4.  
**Decision:** ❌ MUST NOT be repurposed for business document approvals.

### 5.5 `dms_documents` — Approval-Relevant Status Fields

| Column | Values | Purpose |
|---|---|---|
| `status` | `draft \| pending_review \| approved \| rejected \| active \| expired \| archived \| superseded \| deleted` | Document lifecycle |
| `review_status` | `not_required \| pending \| in_review \| approved \| rejected` | **AI extraction review only** |

**Key decision:** `review_status` is for AI review — must NOT be repurposed for business approvals.  
`status` field already has `pending_review`, `approved`, and `rejected` values which map naturally to approval states.  
**Migration needed:** Add `approval_status` (TEXT nullable), `submitted_by` (BIGINT FK user_profiles), `submitted_at` (TIMESTAMPTZ) to `dms_documents` for tracking the current approval lifecycle independently of the document lifecycle `status`.

---

## 6. Existing Approval UI Inventory

| Component | File | Status |
|---|---|---|
| Document approvals section | `src/features/dms/documents/sections/dms-document-approvals-section.tsx` | ✅ Exists — **PLACEHOLDER ONLY** (19 lines, no logic) |
| Approvals queue page | `src/app/(protected)/dms/approvals/page.tsx` | ❌ Does not exist |
| Admin workflow page | `src/app/(protected)/admin/dms/approval-workflows/page.tsx` | ❌ Does not exist |
| Approval status badge | `src/features/dms/approvals/` | ❌ Directory does not exist |

The document form section nav already includes "Approvals" section (line 203 of `dms-document-record-form.tsx`) pointing to the placeholder component. The section is mounted via `ERPRecordSectionPanel`.

---

## 7. Existing Approval Server Action Inventory

| File | Status |
|---|---|
| `src/server/actions/dms/document-approvals.ts` | ❌ Does not exist |
| Any approval logic in `dms/documents.ts` | Not found |
| Workflow management actions | ❌ None |

**Zero server-side approval logic exists.**

---

## 8. Existing Approval Permission / RBAC Inventory

| Permission Code | Exists | Notes |
|---|---|---|
| `dms.documents.approve` | ✅ Live | Approve or reject documents in workflow |
| `dms.admin` | ✅ Live | Full DMS admin |
| `dms.documents.view` | ✅ Live | View documents |
| `dms.documents.edit` | ✅ Live | Edit documents |
| `dms.approvals.view` | ❌ Missing | |
| `dms.approvals.submit` | ❌ Missing | |
| `dms.approvals.act` | ❌ Missing | |
| `dms.approvals.admin` | ❌ Missing | |
| `dms.approvals.withdraw` | ❌ Missing | |
| `dms.approvals.history.view` | ❌ Missing | |

---

## 9. Existing Approval Notification Inventory

| Template Code | Exists |
|---|---|
| `DMS_APPROVAL_REQUESTED` | ❌ Missing |
| `DMS_APPROVED` | ❌ Missing |
| `DMS_REJECTED` | ❌ Missing |
| `DMS_APPROVAL_WITHDRAWN` | ❌ Missing |
| `DMS_EXPIRY_REMINDER` | ✅ DMS.1 |
| `DMS_DOCUMENT_EXPIRED` | ✅ DMS.1 |

No approval notification templates exist. All must be created in DMS.2F.

---

## 10. Approval Workflow Design Recommendation

### Decision: Single-Step Approval with Optional Workflow Assignment

**DMS.2 implements single-step approval** where any user with `dms.approvals.act` permission can approve/reject pending documents. If a `dms_document_workflows` row is assigned to the document type (via `document_type_id` FK), the workflow steps drive who is eligible (via `requires_role`). If no workflow is assigned, any `dms.approvals.act` user can act.

**Rationale:**
- All three approval tables exist — wire them together properly rather than bypassing them.
- Multi-step sequenced approvals are complex; defer to DMS.2+ sub-phases.
- The `is_initial` / `is_final` flags on steps provide natural entry/exit points.
- `requires_role` on steps enables role-gating without additional tables.

### Approval State Machine

```
draft ──[submit]──► pending_approval ──[approve]──► approved
                         │
                    [reject]──► rejected (requires reason)
                         │
                    [withdraw]──► draft (submitter only, before action)
rejected ──[resubmit]──► pending_approval
```

**Stored in:** `dms_documents.approval_status` (new column)  
**Audit log in:** `dms_document_approvals` (existing table, extended with `status` + `reason` + `submitted_by`/`submitted_at`)

### Self-Approval Rule

By default, the submitter (`submitted_by`) **cannot** act as approver for the same document. Server action enforces this. Can be overridden by `dms.admin`.

### Document Type Approval Flag

`dms_document_types.requires_approval = true` gates whether submit-for-approval is available for that type. Documents of non-approval types remain in `draft`/`active` only.

---

## 11. Approval Table / Migration Gap Analysis

### Required: DMS.2A Migration

**File:** `supabase/migrations/20260720XXXXXX_dms_2a_approval_schema_gap_fill.sql`

#### 1. Add columns to `dms_documents`

```sql
ALTER TABLE dms_documents
  ADD COLUMN IF NOT EXISTS approval_status TEXT,
  -- NULL | pending_approval | approved | rejected | withdrawn
  ADD COLUMN IF NOT EXISTS submitted_by BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
```

Add CHECK constraint: `approval_status IN ('pending_approval', 'approved', 'rejected', 'withdrawn')`  
Add index on `approval_status` for queue queries.

#### 2. Add columns to `dms_document_approvals`

```sql
ALTER TABLE dms_document_approvals
  ADD COLUMN IF NOT EXISTS submitted_by BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  -- Required when action = 'rejected'
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT false;
  -- True for the latest active/pending approval request on the document
```

#### 3. Fix RLS on `dms_document_approvals`

Replace existing SELECT and INSERT policies, add UPDATE and DELETE policies:

- **SELECT**: User can see approvals for documents they own (`submitted_by = current_user`) OR they have `dms.approvals.view` OR `dms.admin`.
- **INSERT**: User can insert if they have `dms.approvals.submit` (for submitting) OR `dms.approvals.act` (for acting as approver) OR `dms.admin`.
- **UPDATE**: Only the approver acting on the record OR `dms.admin` — limited to updating `action`, `comments`, `reason`, `is_current`.
- **DELETE**: Only `dms.admin` or `system_admin`.

#### 4. Seed new permissions

```sql
INSERT INTO permissions (permission_code, permission_name, description, module_code, action_code)
VALUES
  ('dms.approvals.view',         'View DMS Approval Queue',      '...', 'DMS', 'view'),
  ('dms.approvals.submit',       'Submit DMS Documents for Approval', '...', 'DMS', 'create'),
  ('dms.approvals.act',          'Approve/Reject DMS Documents', '...', 'DMS', 'approve'),
  ('dms.approvals.withdraw',     'Withdraw DMS Approval Request','...', 'DMS', 'manage'),
  ('dms.approvals.admin',        'Administer DMS Approvals',     '...', 'DMS', 'admin'),
  ('dms.approvals.history.view', 'View DMS Approval History',    '...', 'DMS', 'view')
ON CONFLICT (permission_code) DO UPDATE SET permission_name = EXCLUDED.permission_name;
```

#### 5. Seed approval notification templates

Seed `DMS_APPROVAL_REQUESTED`, `DMS_APPROVED`, `DMS_REJECTED`, `DMS_APPROVAL_WITHDRAWN` into `erp_notification_templates`.

#### 6. `set_updated_at` trigger on `dms_document_workflows`

The workflows table has `updated_at` but no trigger — attach it.

#### 7. Type regeneration

After migration, `src/types/database.ts` must be regenerated to include new columns on `dms_documents` and `dms_document_approvals`.

---

## 12. Approval Permission Model

| Code | Who Has It | Purpose |
|---|---|---|
| `dms.approvals.submit` | All document editors (anyone with `dms.documents.edit`) | Submit own docs for approval |
| `dms.approvals.view` | All DMS users | View approval queue (own items + approver queue) |
| `dms.approvals.act` | Designated approvers | Approve or reject |
| `dms.approvals.withdraw` | Document owner/submitter | Withdraw pending request before final action |
| `dms.approvals.admin` | `dms.admin` implies this | Override, re-route, force approve |
| `dms.approvals.history.view` | All DMS users | View audit log on document record |
| `dms.documents.approve` | **Existing — keep** | Maps to `dms.approvals.act` or can be made equivalent |

**Decision on `dms.documents.approve`:** Retain it. Map `dms.approvals.act` to the same DB check or treat as alias. Do not remove existing permission.

**Self-approval block:** Enforced in server action — not in RLS. Server action checks `actioned_by != submitted_by` unless `dms.admin`.

**Seed strategy:** Grant `dms.approvals.submit` + `dms.approvals.view` + `dms.approvals.history.view` to all active roles with `dms.documents.view`. Grant `dms.approvals.act` to roles with `dms.documents.approve`. Grant `dms.approvals.admin` to `dms.admin`-holding roles.

---

## 13. Server Action Implementation Plan

**File:** `src/server/actions/dms/document-approvals.ts`

### Actions

#### `getDocumentApprovalState(documentId: number)`
- Returns: `{ approval_status, submitted_by, submitted_at, current_approval_id, workflow, pending_step }`
- Permissions: `dms.documents.view`
- Fetches `dms_documents` approval fields + latest `dms_document_approvals` row where `is_current = true`
- No side effects

#### `submitDocumentForApproval(documentId: number, input?: { comment?: string })`
- Guards: `dms.approvals.submit`, document must exist and not be deleted/archived, `approval_status` must be NULL or `rejected`, `dms_document_types.requires_approval` must be true
- **Idempotency check**: if `approval_status = 'pending_approval'` already, return error
- Transaction:
  1. Set any existing `is_current=true` row to `is_current=false`
  2. Insert `dms_document_approvals` with `action='submitted'`, `submitted_by=currentUser`, `submitted_at=now()`, `is_current=true`
  3. Update `dms_documents.approval_status = 'pending_approval'`, `submitted_by`, `submitted_at`, `status = 'pending_review'`
  4. Insert `dms_document_events` with `event_type='approval_submitted'`
  5. Trigger notification: `DMS_APPROVAL_REQUESTED` → all users with `dms.approvals.act` for this document type

#### `approveDocument(documentId: number, approvalId: number, comment?: string)`
- Guards: `dms.approvals.act`, `approval_status = 'pending_approval'`, `actioned_by != submitted_by` (unless `dms.admin`)
- Validates: approvalId matches `is_current=true` row on this document
- Transaction:
  1. Update `dms_document_approvals` row: `action='approved'`, `actioned_by`, `actioned_at`, `comments`, `is_current=false`
  2. Insert new `dms_document_approvals` row: `action='approved'`, `is_current=false` (final audit entry)
  3. Update `dms_documents.approval_status = 'approved'`, `status = 'approved'`
  4. Insert `dms_document_events` with `event_type='approved'`
  5. Trigger notification: `DMS_APPROVED` → submitted_by + document owner

#### `rejectDocument(documentId: number, approvalId: number, reason: string)`
- Guards: same as `approveDocument`
- Validates: `reason` is non-empty (minimum 5 chars)
- Transaction:
  1. Update `dms_document_approvals`: `action='rejected'`, `reason`, `actioned_by`, `actioned_at`, `is_current=false`
  2. Update `dms_documents.approval_status = 'rejected'`, `status = 'rejected'`
  3. Insert `dms_document_events` with `event_type='rejected'`, `metadata_json={reason}`
  4. Trigger notification: `DMS_REJECTED` → submitted_by + document owner

#### `withdrawDocumentApproval(documentId: number, approvalId: number, reason?: string)`
- Guards: `dms.approvals.withdraw` AND (`current_user = submitted_by` OR `dms.admin`), `approval_status = 'pending_approval'`
- Transaction:
  1. Update `dms_document_approvals`: `action='withdrawn'`, `is_current=false`
  2. Update `dms_documents.approval_status = 'withdrawn'`, `status = 'draft'`
  3. Insert `dms_document_events` with `event_type='approval_withdrawn'`
  4. Trigger notification: `DMS_APPROVAL_WITHDRAWN` → users with `dms.approvals.act` (pending approvers)

#### `getDocumentApprovalHistory(documentId: number)`
- Returns: all `dms_document_approvals` rows for document, joined with `user_profiles` for names
- Permissions: `dms.approvals.history.view` OR document owner
- Ordered by `created_at DESC`

#### `listPendingDocumentApprovalsForCurrentUser(filters?: { documentTypeId?, status? })`
- Returns documents where `approval_status = 'pending_approval'` that the current user can act on
- For approvers: all pending docs where their role matches workflow step `requires_role` (or no workflow = all)
- For submitters: all their own pending docs
- Permissions: `dms.approvals.view`
- Includes: document_no, title, document_type, submitted_by name, submitted_at, days_pending

#### `getApprovalWorkflowForDocumentType(documentTypeId: number)`
- Returns the active `dms_document_workflows` row (if any) for this document type
- Used by UI to know if single-step or multi-step applies

#### `adminListApprovalWorkflows()`
- Returns all `dms_document_workflows` rows including inactive
- Guards: `dms.approvals.admin` or `dms.admin`

#### `adminCreateApprovalWorkflow(input)` / `adminUpdateApprovalWorkflow(id, input)`
- Validates: `workflow_code` unique, steps have exactly one `is_initial=true` and one `is_final=true`
- Sets `updated_at`, `updated_by`
- Guards: `dms.approvals.admin` or `dms.admin`

#### `adminDeleteOrDeactivateApprovalWorkflow(id)`
- Soft-delete preferred: sets `deleted_at`. Hard delete only if no approval history references it.
- Guards: `dms.approvals.admin` or `dms.admin`

### Notification Trigger Pattern

All notification triggers in server actions use:
```ts
await createErpNotification({
  sourceModule: 'DMS',
  sourceEntityType: 'dms_documents',
  sourceEntityId: documentId,
  notificationType: 'DMS_APPROVAL_REQUESTED',  // or specific template code
  recipientUserIds: [...],
  actionUrl: `${APP_URL}/dms/documents/record/${documentId}`,
  actionLabel: 'Review Document',
});
```

No new scheduler or bridge needed — approval notifications are synchronous (triggered directly from server actions on each state change).

---

## 14. Document Record UI Implementation Plan

### Replace Placeholder (DMS.2C)

**File:** `src/features/dms/documents/sections/dms-document-approvals-section.tsx`

Replace 19-line placeholder with a real panel showing:

#### When `approval_status = null` and `requires_approval = true` and user has `dms.approvals.submit`
- "Submit for Approval" button
- Optional comment field
- Info about who can approve

#### When `approval_status = 'pending_approval'`
- Status badge (amber, "Pending Approval")
- Submitted by / submitted at
- For eligible approvers: **Approve** (green) and **Reject** (red, opens reason dialog) buttons
- For submitter: **Withdraw** button (with confirmation)
- Days pending counter

#### When `approval_status = 'approved'`
- Green status badge "Approved"
- Approved by / approved at / comments

#### When `approval_status = 'rejected'`
- Red status badge "Rejected"
- Rejected by / rejected at / rejection reason
- "Resubmit" button for submitter (resets to draft → re-submit flow)

#### Always (when history exists)
- Approval history timeline (DmsApprovalHistorySection)
- Shows all actions with actor, date, comments/reason

### Dialogs (all use `ERPChildDialogForm`)

| Dialog | File | Trigger |
|---|---|---|
| Reject reason dialog | `dms-approval-action-dialog.tsx` | "Reject" button |
| Withdraw confirmation | `dms-approval-action-dialog.tsx` (mode) | "Withdraw" button |
| Submit confirmation | inline in section | "Submit for Approval" |

**No auto-save. Human review mandatory. All approval actions require explicit button clicks with confirmation.**

---

## 15. Approval Queue Implementation Plan

### New Page (DMS.2D)

**Route:** `src/app/(protected)/dms/approvals/page.tsx`  
**Client:** `src/features/dms/approvals/dms-approvals-queue-page-client.tsx`

Features:
- Two tabs: "Pending My Action" / "My Submissions"
- Table with: Document No, Title, Type, Submitted By, Submitted At, Days Pending, Status, Actions
- Sorting on all columns (`useSortPaginate`)
- Pagination (`TablePagination`)
- Column resize (`SortColHeader` with `onResizeStart`)
- Search by document_no / title / submitter name
- Quick approve/reject from row actions (opens same dialogs as document record)
- Filter by document type
- Status filter chips

**Sidebar entry:** Add "Approval Queue" under DMS main navigation.

### Components

| Component | File |
|---|---|
| Queue page client | `src/features/dms/approvals/dms-approvals-queue-page-client.tsx` |
| Action panel | `src/features/dms/approvals/dms-approval-action-panel.tsx` |
| History section | `src/features/dms/approvals/dms-approval-history-section.tsx` |
| Status badge | `src/features/dms/approvals/dms-approval-status-badge.tsx` |
| Action dialogs | `src/features/dms/approvals/dms-approval-action-dialog.tsx` |

---

## 16. Workflow Admin Implementation Plan

### New Page (DMS.2E)

**Route:** `src/app/(protected)/admin/dms/approval-workflows/page.tsx`  
**Client:** `src/features/dms/approvals/admin/dms-approval-workflows-admin-page-client.tsx`

Features:
- List all workflows (active + inactive) with document type assignment
- Create/edit workflow via `ERPChildDialogForm` (size `lg`)
- Steps editor within workflow dialog — add/remove/reorder steps, assign `requires_role`
- Toggle active/inactive
- Sidebar entry under Admin → DMS

Guards: `dms.approvals.admin` or `dms.admin`

---

## 17. Notification / Email Integration Plan

### Templates to Seed (DMS.2A migration)

| Template Code | Subject | Recipients |
|---|---|---|
| `DMS_APPROVAL_REQUESTED` | "Document Submitted for Approval: {{document_no}} — {{title}}" | All users with `dms.approvals.act` for the document type |
| `DMS_APPROVED` | "Document Approved: {{document_no}} — {{title}}" | `submitted_by` + `owner_user_id` |
| `DMS_REJECTED` | "Document Rejected: {{document_no}} — {{title}}" | `submitted_by` + `owner_user_id` |
| `DMS_APPROVAL_WITHDRAWN` | "Approval Withdrawn: {{document_no}} — {{title}}" | Pending approvers |

### Variables per template

All templates receive: `document_no`, `title`, `document_type`, `actor_name`, `action_date`, `action_url`, `comments_or_reason`, `company_name`

### Delivery pattern

Approval notifications are **synchronous** — triggered directly from server actions using the existing `erp_notifications` + `erp_email_queue` pipeline. No separate scheduler needed. The DMS.1 email scheduler picks up queued approval emails in its normal run.

**Do NOT create a second notification queue.**  
**Do NOT duplicate DMS.1 scheduler logic.**

---

## 18. RLS / Security Plan

### New/Updated RLS Policies (DMS.2A)

| Table | Policy | Rule |
|---|---|---|
| `dms_document_approvals` | SELECT | `auth.uid() IS NOT NULL AND (submitted_by = current_user_profile_id() OR actioned_by = current_user_profile_id() OR current_user_has_permission('dms.approvals.view') OR current_user_has_permission('dms.admin'))` |
| `dms_document_approvals` | INSERT | `current_user_has_permission('dms.approvals.submit') OR current_user_has_permission('dms.approvals.act') OR current_user_has_permission('dms.admin')` |
| `dms_document_approvals` | UPDATE | `actioned_by = current_user_profile_id() OR current_user_has_permission('dms.admin')` |
| `dms_document_approvals` | DELETE | `current_user_has_permission('dms.admin') OR current_user_has_role('system_admin')` |

### Security Requirements

- ❌ No frontend-only permission checks — all checked in server actions via `getAuthContext` + `hasPermission`
- ❌ No `service_role` in frontend code
- ❌ No raw storage keys exposed in approval payload
- ✅ Self-approval blocked in server action (not RLS — RLS cannot check related fields easily)
- ✅ Rejection reason mandatory — enforced in Zod schema + server action
- ✅ All approval actions are transactional (use Supabase RPC or sequential await with rollback on error)
- ✅ Cross-company isolation: approval queries include `owning_company_id` filter based on user's company
- ✅ DMS.3 confidentiality enforcement not weakened — approval panel respects existing document access controls
- ✅ Audit log (`dms_document_events`) immutable — existing RLS on events table blocks UPDATE/DELETE

---

## 19. Status Transition Plan

### `dms_documents.status` (lifecycle — existing constraint)

| From | Action | To |
|---|---|---|
| `draft` | submit for approval | `pending_review` |
| `pending_review` | approve | `approved` |
| `pending_review` | reject | `rejected` |
| `pending_review` | withdraw | `draft` |
| `rejected` | resubmit | `pending_review` |

### `dms_documents.approval_status` (new column)

| From | Action | To |
|---|---|---|
| `NULL` | submit | `pending_approval` |
| `pending_approval` | approve | `approved` |
| `pending_approval` | reject | `rejected` |
| `pending_approval` | withdraw | `withdrawn` (+ doc status back to `draft`) |
| `rejected` | resubmit | `pending_approval` |
| `withdrawn` | resubmit | `pending_approval` |

**Status check constraint:** `approval_status IN ('pending_approval', 'approved', 'rejected', 'withdrawn')`  
**No migration of existing live documents needed** — all existing `approval_status = NULL` which is valid initial state.

---

## 20. Audit / Activity Plan

Reuse `dms_document_events` table (already exists, immutable via RLS).

| Event Type | Trigger |
|---|---|
| `approval_submitted` | `submitDocumentForApproval` |
| `approved` | `approveDocument` |
| `rejected` | `rejectDocument` (+ reason in `metadata_json`) |
| `approval_withdrawn` | `withdrawDocumentApproval` |
| `workflow_changed` | `adminUpdateApprovalWorkflow` (log on affected documents) |

All approval actions log their event with `performed_by = current_user`, `metadata_json` includes relevant context (workflow_id, step_id, reason where applicable).

`DmsDocumentAuditSection` (existing) reads from `dms_document_events` — approval events will appear automatically without UI changes needed.

---

## 21. Internal DMS.2 Implementation Order

| Sub-phase | Scope | Dependencies |
|---|---|---|
| **DMS.2A** | DB/RLS/Permissions gap-fill migration | None — no code deps |
| **DMS.2B** | Server actions (`document-approvals.ts`) | Requires DMS.2A schema |
| **DMS.2C** | Document record approval panel + history | Requires DMS.2B actions |
| **DMS.2D** | Approval queue page | Requires DMS.2B actions |
| **DMS.2E** | Workflow admin page | Requires DMS.2A tables |
| **DMS.2F** | Notification templates seed | Part of DMS.2A migration OR separate |
| **DMS.2G** | Runtime QA/UAT | Requires DMS.2A–2F complete |

---

## 22. Files Expected to Be Created

```
src/server/actions/dms/document-approvals.ts
src/features/dms/approvals/dms-approvals-queue-page-client.tsx
src/features/dms/approvals/dms-approval-action-panel.tsx
src/features/dms/approvals/dms-approval-history-section.tsx
src/features/dms/approvals/dms-approval-status-badge.tsx
src/features/dms/approvals/dms-approval-action-dialog.tsx
src/features/dms/approvals/admin/dms-approval-workflows-admin-page-client.tsx
src/app/(protected)/dms/approvals/page.tsx
src/app/(protected)/admin/dms/approval-workflows/page.tsx
supabase/migrations/20260720XXXXXX_dms_2a_approval_schema_gap_fill.sql
```

---

## 23. Files Expected to Be Modified

```
src/features/dms/documents/sections/dms-document-approvals-section.tsx  ← replace placeholder
src/features/dms/documents/dms-document-record-form.tsx  ← pass approval props to section
src/components/layout/app-sidebar.tsx  ← add "Approval Queue" sidebar entry
src/app/(protected)/admin/dms/page.tsx  ← add approval-workflows link
src/types/database.ts  ← regenerate after DMS.2A migration
```

---

## 24. DB Migrations Expected

| Migration File | Content |
|---|---|
| `dms_2a_approval_schema_gap_fill.sql` | Add `approval_status`, `submitted_by`, `submitted_at` to `dms_documents`; add `submitted_by`, `submitted_at`, `reason`, `is_current` to `dms_document_approvals`; new permissions seed; approval notification templates seed; fix RLS on `dms_document_approvals`; add `set_updated_at` trigger to `dms_document_workflows` |

Single migration file. No separate migration needed for DMS.2B–2F (all code-only changes).

---

## 25. Acceptance Criteria

1. ✅ Rules/source files reviewed (confirmed above).
2. ✅ Existing approval tables verified from live DB.
3. ✅ `dms_approve_runs` classified as AI intake only.
4. ✅ Existing approval UI placeholder identified.
5. ✅ Permission model decided (6 new codes + retain `dms.documents.approve`).
6. ✅ Server actions fully planned (11 actions with validation/transaction specs).
7. ✅ UI screens/components fully planned (document section, queue page, admin page).
8. ✅ Notifications/templates fully planned (4 templates, synchronous delivery).
9. ✅ RLS/security planned (4 new/updated policies, self-approval server-side).
10. ✅ Status transitions aligned with existing `status` constraint values.
11. ✅ Implementation order clear (DMS.2A → 2B → 2C → 2D → 2E → 2F → 2G).
12. ✅ Exact implementation prompt included (Section 27).
13. ✅ No code/SQL modified — planning only.

---

## 26. Risks / Blockers

| Risk | Severity | Mitigation |
|---|---|---|
| `src/types/database.ts` stale after DMS.2A migration | Medium | Regenerate types as first step of DMS.2B |
| `dms_documents.status` TEXT column has no CHECK constraint — could conflict with approval status values | Medium | Verify live constraint; migration adds CHECK only if not already present |
| `requires_role` on steps uses free-text `role_code` — must match `roles.role_code` exactly | Low | Validate in `adminCreateApprovalWorkflow` server action |
| Self-approval block only in server action (not RLS) — bypass possible via direct DB access | Low-Med | Acceptable for DMS.2; add RLS enforcement in DMS.3 security hardening |
| DMS.1 scheduler deployment still pending — approval notifications will queue but may not send until resolved | Low | Approval notifications also support in-app bell which works independently of email |
| No `current_user_profile_id()` RLS helper confirmed | Medium | Verify function exists; fallback to subquery if not |

---

## 27. Exact DMS.2 Implementation Prompt Needed Next

```
You are implementing DMS.2A — Approval Schema Gap-Fill.

This is the first sub-phase of DMS.2 — Full Approval System.

Read these before starting:
- implementation_Review/DMS_Module/DMS_2_FULL_APPROVAL_SYSTEM_PLANNING_REPORT.md
- .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md
- supabase/migrations/20260614192000_erp_dms_2_database_foundation_rls_numbering_storage_buckets.sql

Implement ONLY the migration file described in Section 24 of the planning report.

Do NOT implement server actions, UI, or any other code in this sub-phase.

Migration must:
1. Add approval_status (TEXT nullable, CHECK constraint), submitted_by (BIGINT FK), submitted_at (TIMESTAMPTZ) to dms_documents.
2. Add submitted_by (BIGINT FK), submitted_at (TIMESTAMPTZ), reason (TEXT), is_current (BOOLEAN DEFAULT false) to dms_document_approvals.
3. Add index on dms_documents.approval_status.
4. Drop and recreate RLS policies on dms_document_approvals as described in Section 18.
5. Seed 6 new approval permissions as described in Section 12.
6. Seed 4 approval notification templates (DMS_APPROVAL_REQUESTED, DMS_APPROVED, DMS_REJECTED, DMS_APPROVAL_WITHDRAWN) with subject, text_template, html_template, and variable_schema.
7. Attach set_updated_at trigger to dms_document_workflows.
8. Be idempotent (IF NOT EXISTS, ON CONFLICT DO UPDATE where applicable).

After migration:
- Apply to live DB via user-supabase MCP.
- Regenerate src/types/database.ts.
- Create implementation report: implementation_Review/DMS_Module/DMS_2A_SCHEMA_GAP_FILL_IMPLEMENTATION_REPORT.md.
- Update .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md.
```

---

## 28. Final Decision

**DMS.2 PLANNING APPROVED — READY FOR IMPLEMENTATION PROMPT**

All 13 acceptance criteria are satisfied. The approval database foundation exists and is live but unused. Schema gaps are clearly identified. A single migration (DMS.2A) unblocks all subsequent implementation sub-phases. Implementation order is clear: DMS.2A (migration) → DMS.2B (server actions) → DMS.2C (document panel) → DMS.2D (queue page) → DMS.2E (admin page) → DMS.2F (notifications, partly in 2A migration) → DMS.2G (QA).

No blocking issues. No contradictions between planning report and live DB state.

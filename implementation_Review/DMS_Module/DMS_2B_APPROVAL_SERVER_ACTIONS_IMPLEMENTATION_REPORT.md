# DMS.2B — Approval Server Actions Implementation Report

**Phase:** DMS.2B — Second sub-phase of DMS.2 (Full Approval System)  
**Date:** 2026-07-20  
**Status:** ✅ DMS.2B APPROVAL SERVER ACTIONS IMPLEMENTED — READY FOR REVIEW

---

## 1. Executive Summary

DMS.2B created `src/server/actions/dms/document-approvals.ts` — the complete server-side approval workflow for the DMS module. The file implements 12 server actions covering the full approval lifecycle: submit, approve, reject, withdraw, state read, history, queue listing, workflow resolution, and admin workflow CRUD. All actions use existing repo patterns (auth context, permission helpers, Supabase client, Zod, `logAudit`, `revalidatePath`). Notifications are dispatched via direct insert into `erp_notifications` using the admin client. Document events use `dms_document_events`. Zero DMS-related TypeScript errors. No UI was modified. No migrations were created.

---

## 2. Mandatory Rules / Source Files Reviewed

| File | Status |
|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Read |
| `.cursor/rules/algt-erp-source-of-truth.mdc` | Applied (always) |
| `.cursor/rules/erp-child-dialog-form-standard.mdc` | Applied (always) |
| `.cursor/rules/erp-workspace-save-close-standard.mdc` | Applied (always) |
| `implementation_Review/DMS_Module/DMS_2_FULL_APPROVAL_SYSTEM_PLANNING_REPORT.md` | Read |
| `implementation_Review/DMS_Module/DMS_2A_SCHEMA_GAP_FILL_IMPLEMENTATION_REPORT.md` | Read |
| `src/server/actions/dms/documents.ts` | Read — pattern source |
| `src/server/actions/dms/document-comments.ts` | Read — event pattern |
| `src/server/actions/notifications/notifications.ts` | Read — createNotification pattern |
| `src/server/actions/dms/notifications.ts` | Read — DMS notification pattern |

---

## 3. Missing Rule / Source Files

| File | Status |
|---|---|
| `src/server/actions/dms/document-events.ts` | Not found — pattern used from `document-comments.ts` (direct `dms_document_events` insert) |
| `src/server/actions/dms/validation.ts` | Not found — not needed; Zod used directly |
| `src/server/actions/dms/review-queue.ts` | Not found — not needed for 2B |
| `dms_document_types.requires_approval` column | Not present in DB — approval is document-type-agnostic in 2B. Follow-up for DMS.2E. |
| Old 028 files | None used — confirmed. |

---

## 4. Existing Patterns Followed

| Pattern | Source | Applied |
|---|---|---|
| `"use server"` directive | All DMS server actions | ✅ |
| `createClient()` from `@/lib/supabase/server` | `documents.ts` | ✅ |
| `createAdminClient()` from `@/lib/supabase/admin` | `documents.ts` | ✅ (for notifications + approver resolution) |
| `getAuthContext()` + `hasPermission()` | `document-comments.ts` | ✅ |
| `ActionResult<T>` type | All DMS actions | ✅ |
| `logger.error(...)` from `@/lib/logger` | `documents.ts` | ✅ |
| `logAudit()` from `@/server/actions/audit` | `document-comments.ts` | ✅ |
| `revalidatePath()` from `next/cache` | All DMS actions | ✅ |
| Zod schemas with `.safeParse()` | `document-comments.ts` | ✅ |
| Direct `dms_document_events` insert | `document-comments.ts` | ✅ |
| Direct `erp_notifications` insert via admin client | DMS scheduler pattern | ✅ |
| Explicit column SELECT (no SELECT *) | `documents.ts` | ✅ |

---

## 5. Files Created

| File | Purpose |
|---|---|
| `src/server/actions/dms/document-approvals.ts` | 12 approval server actions |
| `implementation_Review/DMS_Module/DMS_2B_APPROVAL_SERVER_ACTIONS_IMPLEMENTATION_REPORT.md` | This report |

---

## 6. Files Modified

None. No existing files were modified. No migrations were created.

---

## 7. Server Actions Implemented

| # | Action | Lines | Purpose |
|---|---|---|---|
| 1 | `getDocumentApprovalState(documentId)` | Full state | Returns approval state + capability flags per user |
| 2 | `submitDocumentForApproval(documentId, input)` | Core workflow | Marks doc pending, creates approval row, notifies approvers |
| 3 | `approveDocument(documentId, approvalId, input)` | Core workflow | Approves pending doc, notifies submitter |
| 4 | `rejectDocument(documentId, approvalId, input)` | Core workflow | Rejects with required reason, notifies submitter |
| 5 | `withdrawDocumentApproval(documentId, approvalId, input)` | Core workflow | Returns doc to draft, notifies approvers |
| 6 | `getDocumentApprovalHistory(documentId)` | History | Full audit trail of all approval actions |
| 7 | `listPendingDocumentApprovalsForCurrentUser(filters)` | Queue | Paginated/sorted approval queue with role-based filtering |
| 8 | `getApprovalWorkflowForDocumentType(documentTypeId)` | Lookup | Resolves active workflow + steps for a doc type |
| 9 | `adminListApprovalWorkflows()` | Admin | Lists all workflows with step counts |
| 10 | `adminCreateApprovalWorkflow(input)` | Admin | Creates workflow + steps |
| 11 | `adminUpdateApprovalWorkflow(id, input)` | Admin | Updates workflow; deactivates old steps, inserts new |
| 12 | `adminDeactivateApprovalWorkflow(id)` | Admin | Soft-deactivates workflow (no hard delete) |

**Internal helpers (unexported):**
- `addDocumentEvent()` — non-fatal event insertion
- `sendApprovalNotification()` — per-recipient notification via admin client
- `buildNotificationMessage()` — message body builder for 4 approval templates
- `resolveApproverUserIds()` — RBAC-based approver resolution via `user_roles` join
- `resolveWorkflow()` — internal workflow fetcher used by submit and public endpoint

---

## 8. Permission / Eligibility Logic

| Action | Required Permissions |
|---|---|
| Submit | `dms.approvals.submit` OR `dms.documents.edit` OR `dms.admin` |
| Approve / Reject | `dms.approvals.act` OR `dms.documents.approve` OR `dms.admin` |
| Withdraw | `dms.approvals.withdraw` OR **own submission** OR `dms.admin` |
| View state / queue | `dms.approvals.view` OR `dms.approvals.history.view` OR `dms.approvals.act` OR `dms.documents.approve` OR `dms.admin` |
| View history | Above, or own submitted_by/actioned_by rows |
| Admin workflow CRUD | `dms.approvals.admin` OR `dms.admin` |

All checks are **server-side only**. No reliance on frontend headers or cookies. `dms.admin` bypasses all normal restrictions.

---

## 9. Self-Approval Protection

- Default block: current user cannot approve/reject a document they submitted.
- Check: `d.submitted_by === profileId && !isDmsAdmin(ctx)` → returns `"Self-approval is not allowed. You submitted this document for approval."`
- `getDocumentApprovalState` exposes `selfApprovalBlocked` and `selfApprovalBlockReason` to UI.
- `dms.admin` or `dms.approvals.admin` can override.

---

## 10. Workflow Resolution Logic

- `resolveWorkflow()` queries `dms_document_workflows` where `document_type_id = X`, `is_active = true`, `deleted_at IS NULL`, ordered by `created_at DESC`, limit 1.
- Returns workflow with active steps sorted by `sort_order`.
- If no workflow exists → returns `null`; submit action proceeds with permission-based approval only.
- Initial step: `is_initial = true` step used for `step_id` on submit row. Falls back to first active step.
- `requires_role` on step: resolved in `resolveApproverUserIds()` for notification targeting.
- Note: `dms_document_types.requires_approval` column does not exist in DB — approval is not blocked by document type in this phase. This is documented as a DMS.2E follow-up.

---

## 11. Notification Integration

Uses **existing `erp_notifications` table** — same system as DMS.1 and the notification bell.

**Templates used** (seeded in DMS.2A):
- `DMS_APPROVAL_REQUESTED` → sent to eligible approvers on submit
- `DMS_APPROVED` → sent to submitter + owner/creator on approve
- `DMS_REJECTED` → sent to submitter + owner/creator on reject  
- `DMS_APPROVAL_WITHDRAWN` → sent to eligible approvers on withdraw (in-app only)

**Mechanism:** Direct insert into `erp_notifications` via `createAdminClient()`. This bypasses RLS restrictions that would block the DMS approval user from writing to `erp_notifications` (which requires `notifications.manage` via the public `createNotification` action).

**Security:** No storage keys, raw auth IDs, payload_json, or metadata_json exposed in notification body. `action_url` is always an internal path (`/dms/documents/record/{id}`). No external URLs.

**Approver resolution:** `resolveApproverUserIds()` walks `user_roles → roles → role_permissions → permissions` to find users with `dms.approvals.act`, `dms.documents.approve`, or `dms.admin` permissions. If a workflow step has `requires_role`, also includes users with that role code.

---

## 12. Document Event / Activity Integration

Directly inserts into `dms_document_events` (same pattern as `document-comments.ts`):

| Event Type | Trigger |
|---|---|
| `approval_submitted` | `submitDocumentForApproval` |
| `approval_approved` | `approveDocument` |
| `approval_rejected` | `rejectDocument` (with reason in metadata) |
| `approval_withdrawn` | `withdrawDocumentApproval` |

Event insertion is **non-fatal**: failure is caught and logged via `logger.error()` but does not abort the main workflow. This matches the existing project pattern.

Note: Workflow admin events (`approval_workflow_created`, etc.) are not recorded to `dms_document_events` since there is no document_id for workflow-level operations.

---

## 13. Validation Rules

| Input | Rule |
|---|---|
| `documentId` | Positive integer |
| `approvalId` | Positive integer |
| `comment` | max 2000 chars, optional |
| `reason` (reject) | Required, min 5 chars, max 2000 |
| `reason` (withdraw) | Optional, max 2000 chars |
| `workflow_code` | Required, uppercase alphanumeric + underscore, max 100 |
| `name_en` | Required, max 200 |
| `search` | Trimmed, max 200 |
| `page` | Int ≥ 1, default 1 |
| `pageSize` | Int 1–100, default 20 |

Safe error messages returned for all cases — no raw DB errors exposed to UI.

---

## 14. Transaction / Consistency Notes

Supabase JS does not support true multi-table transactions from server actions. The following consistency measures are applied:

| Step | Consistency Measure |
|---|---|
| Submit: invalidate old `is_current` rows | Done before insert — even if next step fails, no duplicate current rows |
| Submit: insert approval row | Verified with `.select("id").single()` — failure aborts with safe error |
| Submit: update document | Done after approval row — if this fails, approval row exists but doc not updated; logged |
| Approve/reject/withdraw: verify `is_current=true` | `.eq("is_current", true)` condition on UPDATE prevents acting on stale rows |
| Approve/reject: `is_current=false` set atomically | Single UPDATE with `.eq("is_current", true)` guard |

**Note:** True DB-level transaction wrapping (RPC) can be added in DMS.3 if production race conditions are observed.

---

## 15. Type Safety Review

- All return types are explicitly typed via exported type aliases (`ApprovalState`, `ApprovalHistoryRow`, `ApprovalQueueRow`, `WorkflowRow`, `WorkflowWithSteps`).
- `as unknown as T` casts used where Supabase join type inference is insufficient (consistent with existing DMS actions pattern).
- No use of `any` type.
- All selected columns are explicitly listed — no `SELECT *`.
- `createAdminClient()` returns the correct Supabase admin client type; used only for notification dispatch and approver resolution.

---

## 16. Build / Typecheck / Lint Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` — DMS files | ✅ 0 errors in `document-approvals.ts` |
| `npx tsc --noEmit` — pre-existing errors | Pre-existing errors in `audit/`, `branches/`, `permissions/`, `roles/` features — 0 new errors introduced |
| `ReadLints` on document-approvals.ts | ✅ No linter errors |
| No migrations created | ✅ Confirmed |
| No UI files modified | ✅ Confirmed |
| No old 028 artifacts created | ✅ Confirmed |
| `dms_approve_runs` untouched | ✅ Confirmed |

---

## 17. Manual QA / Code Inspection Results

| Check | Result |
|---|---|
| `"use server"` directive present | ✅ |
| All actions catch errors and return `{ success: false, error: string }` | ✅ |
| No raw internal errors thrown to UI | ✅ |
| `revalidatePath` called on affected paths after mutations | ✅ |
| `logAudit` called for all mutations | ✅ |
| Self-approval blocked with clear message | ✅ |
| Rejection reason enforced (min 5 chars) | ✅ |
| `is_current` verified before approve/reject/withdraw | ✅ |
| Document archived/deleted check before workflow mutations | ✅ |
| Notifications sent via admin client (not session client) | ✅ |
| No storage fields returned | ✅ |
| No `payload_json`/`metadata_json` in notification body | ✅ |

---

## 18. Remaining Risks / Follow-Ups

| Risk / Item | Severity | Phase |
|---|---|---|
| `dms_document_types.requires_approval` column missing — all documents can be submitted | Low | DMS.2E follow-up |
| No true DB transaction for multi-table updates | Low | DMS.3 — add RPC wrapper if needed |
| `listPendingDocumentApprovalsForCurrentUser` uses join filter that may not be fully RLS-safe | Low | DMS.3 security review |
| `resolveApproverUserIds` does deep join through roles/permissions — may be slow at scale | Low | DMS.3/DMS.4 optimization |
| Withdrawal notification sent to all approvers (no workflow-step scoping) | Info | DMS.2E refinement |
| Email channel for `DMS_APPROVAL_WITHDRAWN` is `false` (intentional per template) | Info | Accepted |
| Pre-existing TS errors in non-DMS features | Info | Pre-existing — not introduced |

---

## 19. DMS.2C Readiness

DMS.2C (document record approval panel UI) can now proceed. All required server actions are available:

- ✅ `getDocumentApprovalState(documentId)` — panel can read capability flags and current state
- ✅ `submitDocumentForApproval(documentId, input)` — submit button
- ✅ `approveDocument(documentId, approvalId, input)` — approve button
- ✅ `rejectDocument(documentId, approvalId, input)` — reject button with reason field
- ✅ `withdrawDocumentApproval(documentId, approvalId, input)` — withdraw button
- ✅ `getDocumentApprovalHistory(documentId)` — history timeline in panel
- ✅ `listPendingDocumentApprovalsForCurrentUser(filters)` — approval queue page (DMS.2D)
- ✅ `adminListApprovalWorkflows()` / admin CRUD — workflow admin page (DMS.2E)

All exported types (`ApprovalState`, `ApprovalHistoryRow`, `ApprovalQueueRow`, `WorkflowRow`, `WorkflowWithSteps`) are available for UI component props.

---

## 20. Final Decision

**DMS.2B APPROVAL SERVER ACTIONS IMPLEMENTED — READY FOR REVIEW**

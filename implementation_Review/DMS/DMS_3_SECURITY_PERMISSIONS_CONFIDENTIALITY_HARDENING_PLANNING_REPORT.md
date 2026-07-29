# DMS.3 — Security, Permissions & Confidentiality Hardening Planning Report

**Phase:** DMS.3A — Security/RLS/Confidentiality Baseline Audit & Plan  
**Date:** 2026-07-21  
**Engineer:** Cursor Agent  
**Type:** Planning / Audit Only — No code or SQL was modified.

---

## 1. Executive Summary

This report audits the complete DMS security posture following the closure of DMS.2 (Approval System) and produces a detailed, implementation-ready security hardening plan for DMS.3.

**Critical findings (must fix before DMS.4 UAT):**

| Severity | Finding |
|---|---|
| 🔴 CRITICAL | `erp_notifications` RLS policy = `ALL: true` — every authenticated user can read/write every notification in the system |
| 🔴 CRITICAL | `erp_notification_templates` RLS = `ALL: true` — any authenticated user can modify notification templates |
| 🔴 CRITICAL | `erp_email_send_logs` and `erp_notification_delivery_logs` RLS = `ALL: true` |
| 🔴 CRITICAL | `dms_documents` SELECT RLS ignores `confidentiality_level` — confidential/HR/legal/executive documents visible to anyone with `dms.documents.view` |
| 🟠 HIGH | Per-level permissions `dms.documents.view.hr/finance/legal/executive` exist in DB but are NOT enforced in RLS or server actions |
| 🟠 HIGH | `owning_company_id` on `dms_documents` but NO RLS enforces company isolation |
| 🟠 HIGH | `listDocumentFiles` server action returns `storage_bucket` and `storage_path` raw — leaks internal storage paths to the UI |
| 🟡 MEDIUM | Approval notifications expose full document title/number to recipient regardless of their confidentiality access |
| 🟡 MEDIUM | No `action_url` allowlist helper — currently only safe paths used, but no systematic guard |
| 🟡 MEDIUM | Self-approval blocked in server actions only, not at RLS/DB level |
| 🟡 MEDIUM | `requires_role` in workflow steps is free-text with no FK validation |
| 🟡 MEDIUM | `dms_document_files/versions/comments/events/metadata_values` child table RLS uses `dms.documents.view` — no confidentiality cascade |

---

## 2. Mandatory Rules / Source Files Reviewed

| File | Found |
|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | ✓ |
| `.cursor/rules/algt-erp-source-of-truth.mdc` | ✓ |
| `.cursor/rules/erp-child-dialog-form-standard.mdc` | ✓ |
| `.cursor/rules/erp-workspace-save-close-standard.mdc` | ✓ |
| `AGENTS.md` / `CLAUDE.md` | ✓ |
| `src/server/actions/dms/documents.ts` | ✓ |
| `src/server/actions/dms/document-files.ts` | ✓ |
| `src/server/actions/dms/document-approvals.ts` | ✓ |
| `src/server/actions/dms/notifications.ts` | ✓ |
| `src/server/actions/dms/dms-email-bridge.ts` | ✓ |
| `implementation_Review/DMS_Module/DMS_2F_FINAL_APPROVAL_SYSTEM_QA_AND_CLOSURE_REPORT.md` | ✓ |
| Live DB via `user-supabase` MCP | ✓ — policies, permissions, storage buckets, confidentiality schema |

---

## 3. Missing Rule / Source Files

| File | Status |
|---|---|
| `implementation_Review/DMS_Module/DMS_0_EXISTING_DMS_BASELINE_AND_SCOPE_LOCK.md` | Not found — predates current structure |
| `implementation_Review/DMS_Module/DMS_ENHANCEMENT_ANALYSIS_APPROVALS_CONFIDENTIALITY_NOTIFICATIONS.md` | Not found |
| `docs/system-foundation/security/**` | Not found |
| `docs/system-foundation/dms/**` | Not found |
| `supabase/functions/dms-expiry-scheduler/index.ts` | Not verified via MCP |

No missing files block the audit. All critical evidence sourced from live DB and code inspection.

---

## 4. DMS.0–DMS.2 Carry-Forward Security Status

| Risk | Source | Status |
|---|---|---|
| DMS.1 scheduler not deployed | DMS.1 | Pending — not in DMS.3 scope |
| `erp_notifications` RLS too broad | DMS.1 | CONFIRMED CRITICAL — plan in DMS.3E |
| Notification redaction for confidential docs | DMS.1 | Not implemented — plan in DMS.3E |
| Approval action_url not allowlisted | DMS.2B | Not implemented — plan in DMS.3E |
| Self-approval blocked at code level only | DMS.2B | Accepted for DMS.3 — consider DB trigger |
| `requires_role` free-text | DMS.2E | Deferred — no blocker |
| `dms_document_types.requires_approval` missing | DMS.2 | Not implemented — plan in DMS.3B/C |
| Approval transaction/race risk | DMS.2B | Low risk — plan DB-level note |
| Browser QA pending | DMS.2F | DMS.4 scope |

---

## 5. Current DMS Permission Catalog

**Total DMS permissions in DB: 68** (live count from `permissions` table)

### Confidentiality-level permissions (already seeded, NOT yet enforced):

| Permission | Intended Use |
|---|---|
| `dms.documents.view` | View any document (base) |
| `dms.documents.view.internal` | View internal-level documents |
| `dms.documents.view.company` | View company-level documents |
| `dms.documents.view.hr` | View HR-confidential documents |
| `dms.documents.view.finance` | View finance-confidential documents |
| `dms.documents.view.legal` | View legal-confidential documents |
| `dms.documents.view.executive` | View executive-confidential documents |
| `dms.documents.manage_security` | Manage access rules |

> **Critical gap:** These 6 per-level permissions exist in the DB but are **not checked** in any server action or RLS policy. The entire confidentiality model is dormant.

### Approval permissions (active and enforced):

`dms.approvals.act`, `dms.approvals.admin`, `dms.approvals.history.view`, `dms.approvals.submit`, `dms.approvals.view`, `dms.approvals.withdraw`, `dms.documents.approve`

### Missing permissions (proposed in DMS.3):

| Permission | Reason |
|---|---|
| `dms.notifications.view_own` | Currently absent — needed for recipient-only notification RLS |
| `dms.notifications.admin` | Currently absent — needed for admin notification management RLS |
| `dms.files.download` | Already present (`dms.documents.download`) — rename/alias may be needed |
| `dms.documents.view_sensitive` | Optional unified "view any confidential doc" — can rely on per-level permissions instead |

---

## 6. Current RLS Policy Inventory

### dms_documents
| Policy | Cmd | Current Qual | Gap |
|---|---|---|---|
| `dms_documents_select` | SELECT | `dms.documents.view OR system_admin` | ❌ No confidentiality filter, no company filter |
| `dms_documents_insert` | INSERT | (none) | ⚠ Open insert — relies on server action guards |
| `dms_documents_update` | UPDATE | `dms.documents.edit OR system_admin` | ❌ No company scope check |
| `dms_documents_delete` | DELETE | `dms.documents.delete OR system_admin` | ❌ No company scope check |

### dms_document_files
| Policy | Cmd | Gap |
|---|---|---|
| `dms_files_select` | SELECT | `dms.documents.preview` — no confidentiality check |
| `dms_files_insert` | INSERT | Open |

### dms_document_versions / comments / events / metadata_values / links / tags
All use `dms.documents.view` for SELECT with no confidentiality cascade — **will expose confidential document content via child tables**.

### dms_document_content / dms_document_content_chunks
`dms_document_content` SELECT: `dms.documents.view` — **no confidentiality filter** ❌  
`dms_document_content_chunks` SELECT: ✅ Already has confidentiality check — excludes `hr/legal/executive` unless admin. **Good — template for other tables.**

### dms_document_approvals
SELECT: broad permission set including `submitted_by`/`actioned_by` row ownership — no confidentiality or company check.

### dms_document_workflows / workflow_steps
SELECT: `dms.documents.view` — reasonable. MANAGE: `dms.admin OR system_admin` — correct.

### dms_workflow_document_types (new junction table)
⚠ **No RLS policy currently set.** Junction table created in latest commit — needs policies added in DMS.3D.

### erp_notifications — CRITICAL
| Policy | Cmd | Gap |
|---|---|---|
| `erp_notifications_authenticated` | ALL | `true` — **any authenticated user can read/write all notifications** |

### erp_notification_templates — HIGH
| Policy | Cmd | Gap |
|---|---|---|
| `erp_notification_templates_authenticated` | ALL | `true` — any authenticated user can modify templates |

### erp_email_queue
SELECT/UPDATE: `notifications.email_queue.*` permissions — acceptable. No personal data leak noted.

### erp_email_send_logs / erp_notification_delivery_logs — HIGH
Both use `ALL: true` — full read/write to any authenticated user. Logs may contain sensitive email addresses and subjects.

### dms_notification_queue
SELECT: `dms.documents.view OR dms.admin` — too broad (any doc viewer sees all queued notifications).

---

## 7. Current DMS Server Action Security Inventory

### `src/server/actions/dms/documents.ts`
| Action | Permission Check | Company Check | Confidentiality Check | Gap |
|---|---|---|---|---|
| `listDocuments` | `dms.documents.view` | None | Partial — excludes `hr/legal/executive` from content search; no filter on main list | ❌ Non-admin user can list all confidential docs |
| `getDocument` | `dms.documents.view` | None | Partial — AI summary redacted for confidential | ❌ Confidential doc visible to `dms.documents.view` holder |
| `createDocument` | `dms.documents.edit` | None | N/A | Low risk |
| `updateDocument` | `dms.documents.edit` | None | None | Low risk |

### `src/server/actions/dms/document-files.ts`
| Action | Gap |
|---|---|
| `listDocumentFiles` | Returns `storage_bucket` and `storage_path` in response — **raw internal paths exposed to client** |
| `getSignedDownloadUrl` | Uses `adminClient.storage` for signed URL — correct pattern. Returns `signedUrl` only, not raw path — good. But no confidentiality check before issuing URL. |

### `src/server/actions/dms/document-approvals.ts`
| Action | Gap |
|---|---|
| All approval actions | No confidentiality check before showing approval state — approver can see doc title/details regardless of confidentiality level |
| `sendApprovalNotification` | Message includes `document_no`, `title`, `document_type`, `actor_name` — no redaction for confidential docs |
| `action_url` | Always `/dms/documents/record/${id}` — safe, but no systematic `assertInternalActionUrl()` guard |

### Other DMS actions
AI actions (`ai-search.ts`, `semantic-search.ts`, `document-content.ts`, `ai-summary.ts`) — need audit in DMS.3C/D for confidentiality enforcement. `dms_document_content_chunks` RLS already has a check, but the server action layer is not verified.

---

## 8. Current DMS UI Exposure Inventory

| Component | Risk |
|---|---|
| `DmsDocumentList` | Shows all documents visible per RLS — no confidentiality badge or access gate in current UI |
| `DmsDocumentRecord` | Shows full document including confidential fields to `dms.documents.view` holders |
| `DmsApprovalActionPanel` | Shows document title/status regardless of confidentiality |
| `DmsApprovalsQueuePageClient` | Queue rows show document title/number — no confidentiality redaction |
| `DmsDocumentFilesSection` | May display file names — if confidential, name should be redacted |
| Notification bell | Displays notification `title` and `message` from `erp_notifications` — could expose confidential document details |
| `DmsNotificationsPage` | Lists notifications — same exposure risk as bell |

---

## 9. Storage / File Access Security Inventory

| Item | Status |
|---|---|
| Buckets: `dms-documents`, `dms-temp`, `erp-branding-assets` | All `public: false` ✅ |
| Signed URL creation | Uses `createAdminClient().storage.from(bucket).createSignedUrl(path, expiresIn)` ✅ |
| Raw `storage_path` exposed | ❌ `listDocumentFiles` returns `storage_path` and `storage_bucket` in the API response |
| Confidentiality check before download | ❌ None — `getSignedDownloadUrl` checks `dms.documents.preview/download` but not confidentiality level |
| Storage RLS policies | Cannot enumerate from MCP; assume bucket-level private is in place |
| Temp uploads | `dms-temp` bucket — ensure no long-lived temp files for sensitive documents |

---

## 10. Notification Security Inventory

| Item | Status |
|---|---|
| `erp_notifications` RLS | 🔴 CRITICAL: `ALL: true` |
| `erp_notification_templates` RLS | 🔴 HIGH: `ALL: true` |
| `erp_notification_delivery_logs` RLS | 🔴 HIGH: `ALL: true` |
| Notification content (approval) | Message includes full doc title, number, actor — no redaction |
| `action_url` | Internal paths only (`/dms/documents/record/N`) — safe but no helper |
| `payload_json` / `metadata_json` | Not exposed in notification bell or list UI — ✅ |
| Bell unread count | Counts all `status='unread'` for current user (if recipient scoping works) — blocked by RLS issue |
| Email body content | `dms-email-bridge.ts` — needs review; likely builds email body from notification message |
| DMS notification queue | SELECT too broad (`dms.documents.view`) |

---

## 11. Approval Security Inventory

| Item | Status |
|---|---|
| Self-approval block | ✅ Server-side (`isSelfApproval` check in server actions) |
| Self-approval at DB level | ❌ No DB trigger or RLS enforcement |
| Approval RLS SELECT | ✅ Reasonable — permission-based + row ownership (`submitted_by/actioned_by`) |
| Approval visibility for confidential docs | ❌ Approver sees confidential doc title/state without confidentiality check |
| Approval queue company scope | ❌ `listPendingDocumentApprovalsForCurrentUser` does not filter by company |
| `requires_role` validation | ❌ Free-text, not FK-validated |
| Transaction safety | ⚠ Multi-table updates without DB transaction — low race risk for single-approver workflows |
| `dms_document_types.requires_approval` | ❌ Column does not exist — cannot enforce mandatory approval by doc type |
| `dms_workflow_document_types` RLS | ❌ No policies set on new junction table |

---

## 12. Cross-Company Isolation Review

| Item | Status |
|---|---|
| `dms_documents.owning_company_id` | ✅ Column exists, NOT NULL allowed (nullable) |
| RLS enforces company scope | ❌ No RLS policy on `dms_documents` filters by `owning_company_id` |
| Server actions filter by company | ❌ `listDocuments` does not apply a `owning_company_id` filter |
| Approval queue company scope | ❌ `listPendingDocumentApprovalsForCurrentUser` has no company filter |
| Notification pipeline company scope | ❌ DMS expiry notifications may cross company boundaries |
| `current_user_company_id()` DB helper | Status unknown — not verified in this audit pass |

**Note:** If this is a single-company deployment currently, the cross-company risk is low-to-zero today. For multi-company future-proofing this is a DMS.3D/later item.

---

## 13. Confidentiality Field / Model Review

**DB field:** `dms_documents.confidentiality_level TEXT NOT NULL`

**Zod-validated levels (from `documents.ts`):**
```
internal | company | hr | finance | legal | executive
```

**DB constraint:** No CHECK constraint found explicitly listing these values — the Zod enum is the only enforcement. A DB CHECK constraint should be added.

**Partial server-side enforcement already present:**
- `CONFIDENTIAL_LEVELS = ["hr", "legal", "executive"]` defined in `documents.ts`
- AI summary redacted for these levels if non-admin
- Content search excludes them for non-admin
- `dms_document_content_chunks` RLS excludes these levels unless admin/system_admin

**Per-level permissions already seeded (NOT enforced yet):**
`dms.documents.view.internal`, `dms.documents.view.company`, `dms.documents.view.hr`, `dms.documents.view.finance`, `dms.documents.view.legal`, `dms.documents.view.executive`

---

## 14. Proposed Confidentiality Enforcement Model

### Levels and access tiers

| Level | Who Can View | Notes |
|---|---|---|
| `internal` | All users with `dms.documents.view` + `dms.documents.view.internal` | Default/base level |
| `company` | `dms.documents.view.company` or above | Company-general docs |
| `hr` | `dms.documents.view.hr` | HR records, employment, salaries |
| `finance` | `dms.documents.view.finance` | Financial statements, invoices |
| `legal` | `dms.documents.view.legal` | Contracts, legal disputes |
| `executive` | `dms.documents.view.executive` | Board docs, executive-only |
| Any level | `dms.admin` or `system_admin` | Always override |

### Access rules
1. Document owner (`owner_user_id`) can always view their own document.
2. Document creator (`created_by`) can always view their created document.
3. An active approver (`submitted_by` or `actioned_by` in `dms_document_approvals`) can view the document being approved, regardless of level — BUT only after submission.
4. `dms.admin` and `system_admin` view all.
5. Linked entity users (e.g., party employees) cannot view confidential docs solely by entity link — they need the appropriate level permission.
6. Files, metadata values, OCR content, AI summary, and content chunks follow the same confidentiality rule as the parent document.

### Implementation approach
Use a **DB helper function** `current_user_can_view_document_confidentiality(level TEXT)` that returns TRUE if the user has the corresponding `dms.documents.view.{level}` permission or `dms.admin`. Apply this in:
1. `dms_documents` SELECT RLS policy (check both `dms.documents.view` AND confidentiality).
2. All child table SELECT policies that join back to `dms_documents`.
3. Server action layer: `listDocuments` and `getDocument` — add confidentiality filter.

---

## 15. Proposed Sensitive Permission Model

**Recommended additions for DMS.3B:**

| Permission | Purpose | Priority |
|---|---|---|
| `dms.notifications.view_own` | Scope notification reads to `recipient_user_id = current_user_profile_id()` | 🔴 Critical (fixes RLS) |
| `dms.notifications.admin` | Admin can view/manage all notifications | 🔴 Critical (fixes RLS) |

**Existing permissions to activate (already in DB, not enforced):**
- `dms.documents.view.hr`, `.finance`, `.legal`, `.executive`, `.company`, `.internal` — activate in RLS DMS.3D

**Not needed (per-level granularity already sufficient):**
- `dms.documents.view_sensitive` — the per-level model is more granular and already seeded.

---

## 16. Proposed Notification RLS Hardening Plan

**Current state:** `erp_notifications` policy `erp_notifications_authenticated` = `ALL: true`

**Proposed replacement policies:**

```
-- SELECT: recipients see own, admins see all
erp_notifications SELECT: 
  recipient_user_id = current_user_profile_id()
  OR current_user_has_permission('notifications.admin')
  OR current_user_is_global_admin()

-- INSERT: system/admin only (all app inserts go via admin client already)
erp_notifications INSERT: 
  current_user_has_permission('notifications.admin') OR service_role

-- UPDATE: recipient can mark read; admin can manage
erp_notifications UPDATE:
  recipient_user_id = current_user_profile_id()
  OR current_user_has_permission('notifications.admin')

-- DELETE: admin only
erp_notifications DELETE:
  current_user_has_permission('notifications.admin') OR system_admin
```

**For `erp_notification_templates`:**
```
-- SELECT: any authenticated (templates are config, not sensitive)
-- INSERT/UPDATE/DELETE: notifications.admin or system_admin
```

**For `erp_email_send_logs` and `erp_notification_delivery_logs`:**
```
-- SELECT/DELETE: notifications.admin or system_admin
-- INSERT: service_role or system processes only
```

**For `dms_notification_queue`:**
```
-- SELECT: current user is the document owner/creator/recipient, OR dms.admin
```

---

## 17. Proposed DMS Document/File RLS Hardening Plan

### dms_documents SELECT — add confidentiality check
```sql
-- New policy replaces dms_documents_select:
auth.uid() IS NOT NULL
AND (current_user_has_permission('dms.documents.view') OR current_user_has_role('system_admin'))
AND (
  -- Document is not restricted (internal/company level)
  confidentiality_level IN ('internal', 'company')
  -- OR user has the matching level permission
  OR current_user_has_permission('dms.documents.view.' || confidentiality_level)
  -- OR user is owner/creator
  OR owner_user_id = current_user_profile_id()
  OR created_by = current_user_profile_id()
  -- OR admin override
  OR current_user_has_permission('dms.admin')
  OR current_user_has_role('system_admin')
)
```

### Child table policies — template
Each of `dms_document_files`, `dms_document_versions`, `dms_document_comments`, `dms_document_events`, `dms_document_metadata_values`, `dms_document_links`, `dms_document_tags`, `dms_document_content` needs a sub-select join to `dms_documents` with the same confidentiality check (similar to the existing `dms_document_content_chunks` policy — use that as the template).

### dms_document_files — remove storage_path leak
Server action `listDocumentFiles` should NOT return `storage_bucket` and `storage_path` to the client. These should be stripped from the response type.

### dms_workflow_document_types — add missing RLS
```
SELECT: dms.documents.view (viewing workflow type assignments)
INSERT/UPDATE/DELETE: dms.admin OR system_admin
```

### Add DB CHECK constraint
```sql
ALTER TABLE dms_documents
  ADD CONSTRAINT dms_documents_confidentiality_check
  CHECK (confidentiality_level IN ('internal','company','hr','finance','legal','executive'));
```

---

## 18. Proposed Approval RLS / Transaction Safety Plan

### Approval confidentiality check
In server actions, before showing approval state or queue row for a document:
1. Check that the current user can view the document at its `confidentiality_level`.
2. If they cannot (non-approver, non-admin), return `{ canSubmit: false, canApprove: false, ... }` with a generic "access restricted" message.
3. In the approval queue listing, if user lacks document confidentiality access, show the row with redacted title ("Restricted Document") but allow Approve/Reject action if they are the approver.

### Self-approval at DB level (optional)
A DB trigger on `dms_document_approvals` can enforce `actioned_by != submitted_by` for `action IN ('approved', 'rejected')`. Low priority — server-side check already works.

### Transaction safety
The multi-table approval flow (update `dms_documents`, insert/update `dms_document_approvals`) has a low race risk in single-approver scenarios. For DMS.3G consideration: wrap in a Postgres function/RPC if parallel approval acts become a concern. Not blocking for DMS.3.

### `dms_document_types.requires_approval`
Add column in DMS.3B migration: `BOOLEAN NOT NULL DEFAULT false`. No RLS change needed — used in UI/server action logic to determine if approval is mandatory before finalizing a document.

---

## 19. Proposed Internal Action URL Allowlisting Plan

### Helper function (new file: `src/lib/security/action-url.ts`)
```ts
const ALLOWED_PREFIXES = [
  '/dms/',
  '/notifications',
  '/admin/dms/',
  '/hr/',
  '/parties/',
  '/finance/',
  '/dashboard',
];

export function assertInternalActionUrl(url: string): string {
  if (!url) return '/notifications';
  // Block absolute URLs, protocol-relative, javascript:, data:
  if (/^(https?:|\/\/|javascript:|data:)/i.test(url)) {
    throw new Error(`Invalid action_url: external or unsafe URL rejected`);
  }
  const isAllowed = ALLOWED_PREFIXES.some((p) => url.startsWith(p));
  if (!isAllowed) throw new Error(`action_url not on allowlist: ${url}`);
  return url;
}
```

### Apply to:
- `sendApprovalNotification` in `document-approvals.ts`
- DMS expiry notification creation
- HR compliance notification creation
- Any email `action_url` generation in `dms-email-bridge.ts`

---

## 20. Proposed Redaction Plan

### Server-side redaction helper
```ts
function redactForConfidentiality<T extends { title: string; documentNo: string }>(
  doc: T,
  userCanViewConfidential: boolean,
  level: string,
): T {
  const sensitiveLevel = ['hr', 'finance', 'legal', 'executive'].includes(level);
  if (sensitiveLevel && !userCanViewConfidential) {
    return { ...doc, title: '[Restricted Document]', documentNo: '—' };
  }
  return doc;
}
```

### Apply to:
1. `sendApprovalNotification` — redact document title in notification body if `confidentiality_level` is sensitive and recipient lacks the matching `dms.documents.view.{level}` permission.
2. `listPendingDocumentApprovalsForCurrentUser` — if user is an approver on the document, they should see full details (by definition their role grants access). Safe — no change needed for approvers.
3. Notification bell display: the `message` field already has the document title embedded. After RLS fix, recipients will only see their own notifications — adequate.
4. `listDocumentFiles` — strip `storage_bucket` and `storage_path` from response.
5. AI/OCR/search results: check if document is confidential before returning AI summary, OCR text, or semantic search snippet.

---

## 21. Required DB Migrations

| # | Migration | Tables | Priority |
|---|---|---|---|
| M1 | Add `dms_document_types.requires_approval BOOLEAN NOT NULL DEFAULT false` | `dms_document_types` | Medium |
| M2 | Add `dms_documents` confidentiality CHECK constraint | `dms_documents` | Medium |
| M3 | Replace `erp_notifications` RLS with recipient-scoped policies | `erp_notifications` | 🔴 Critical |
| M4 | Replace `erp_notification_templates` RLS | `erp_notification_templates` | High |
| M5 | Replace `erp_email_send_logs` / `erp_notification_delivery_logs` RLS | Both tables | High |
| M6 | Add `dms_workflow_document_types` RLS policies | `dms_workflow_document_types` | High |
| M7 | Add confidentiality helper function `current_user_can_view_doc_confidentiality(level)` | DB functions | High |
| M8 | Harden `dms_documents` SELECT RLS with confidentiality check | `dms_documents` | High |
| M9 | Harden child table SELECT RLS (files, versions, comments, events, metadata, links, tags, content) | 9 tables | High |
| M10 | (Optional) DB trigger for self-approval block | `dms_document_approvals` | Low |

---

## 22. Required Server Action Changes

| File | Change | Priority |
|---|---|---|
| `document-files.ts` | Strip `storage_bucket` / `storage_path` from `listDocumentFiles` response type and return | 🔴 High |
| `document-files.ts` | Add confidentiality check in `getSignedDownloadUrl` before issuing signed URL | High |
| `documents.ts` | Add per-level permission check in `listDocuments` and `getDocument` | High |
| `document-approvals.ts` | Add confidentiality check in `getDocumentApprovalState`, `listPendingDocumentApprovalsForCurrentUser` | Medium |
| `document-approvals.ts` | Add `assertInternalActionUrl()` in `sendApprovalNotification` | Medium |
| New: `src/lib/security/action-url.ts` | `assertInternalActionUrl()` helper | Medium |
| `documents.ts` | Add `owning_company_id` filter to `listDocuments` if multi-company | Low (single-company now) |
| `dms-email-bridge.ts` | Audit email body content for confidential doc title exposure | Medium |

---

## 23. Required UI Changes

| Component | Change | Priority |
|---|---|---|
| `DmsDocumentList` | Show confidentiality badge; grey-out/hide docs user can't access (backed by server) | Medium |
| `DmsApprovalsQueuePageClient` | Show "[Restricted]" placeholder for doc title if user lacks confidentiality access | Low (server-side redaction first) |
| Notification bell / `DmsNotificationsPage` | No UI change needed once RLS is hardened — bell naturally shows only recipient's notifications | Medium (after RLS) |
| `DmsDocumentFilesSection` | Do not display `storage_path` or `storage_bucket` values to UI | High |

---

## 24. Required Storage Policy Changes

| Item | Change |
|---|---|
| `dms-documents` bucket | Verify no public-access storage policy; keep `public: false` |
| `dms-temp` bucket | Confirm temp files are cleaned up and not accessible after session expiry |
| Storage policies (INSERT/SELECT/UPDATE/DELETE on `storage.objects`) | Audit in DMS.3F — requires `supabase storage` CLI or migration review |
| Signed URL expiry | `getSignedDownloadUrl` uses `300s` for preview, `3600s` for download — confirm these are acceptable |

---

## 25. Required Tests / QA

| Test | When |
|---|---|
| Notification visibility: user A cannot read user B's notifications (after RLS fix) | DMS.3E |
| Confidential document not visible to `dms.documents.view` holder without level permission (after RLS) | DMS.3D |
| `listDocumentFiles` does not return `storage_path` | DMS.3F |
| `getSignedDownloadUrl` denies download for confidential doc without level permission | DMS.3F |
| `assertInternalActionUrl` rejects `http://`, `https://`, `javascript:`, `//`, external domains | DMS.3E |
| Self-approval blocked server-side confirmed (browser QA) | DMS.4 |
| Approval queue does not expose company B's documents to company A users | DMS.3D |
| Notification bell count reflects only current user's notifications | DMS.3E |

---

## 26. DMS.3 Implementation Sub-Phase Plan

| Sub-phase | Scope | Dependencies |
|---|---|---|
| **DMS.3A** (this report) | Security/RLS/Confidentiality Baseline Audit & Plan | Done ✅ |
| **DMS.3B** | Permission catalog additions + `dms_document_types.requires_approval` migration | None |
| **DMS.3C** | DMS Document Confidentiality server action enforcement (`listDocuments`, `getDocument`, `getSignedDownloadUrl`, strip storage_path) | 3B |
| **DMS.3D** | RLS hardening: `dms_documents`, child tables, `dms_workflow_document_types`, confidentiality DB helper function | 3C |
| **DMS.3E** | Notification RLS (`erp_notifications`), `assertInternalActionUrl()`, approval notification redaction | 3B, 3D |
| **DMS.3F** | Storage bucket policy audit + DMS.1 scheduler security review | 3D |
| **DMS.3G** | Approval transaction/race safety review + optional DB-level self-approval trigger | 3D |
| **DMS.3H** | Security regression QA across all hardened areas | All above |

**Recommended merging:** DMS.3B + DMS.3C can be combined (small changes). DMS.3D is the largest migration — keep separate. DMS.3E is high priority (notification RLS is critical) — do not delay.

---

## 27. Risks / Blockers

| Risk | Severity | Notes |
|---|---|---|
| `erp_notifications` RLS `ALL: true` — any authenticated user can read any notification right now | 🔴 Critical | Fix in DMS.3E immediately |
| Confidentiality RLS hardening may expose currently-visible documents as "hidden" to existing users | 🟠 High | Requires role assignment review before cutover |
| Storage policy enumeration not possible via MCP — may need CLI | 🟡 Medium | Use `supabase storage` CLI in DMS.3F |
| `current_user_can_view_doc_confidentiality()` DB function may be slow if called per-row | 🟡 Medium | Use `current_user_has_permission()` which is already optimized |
| Multi-company isolation is unimplemented — entire document list is single-company implicitly | 🟡 Low for now | Revisit before multi-company rollout |

---

## 28. Exact Next Implementation Prompt Needed

**DMS.3B + DMS.3C Implementation Prompt:**

> Implement DMS.3B (permission and `requires_approval` migration) and DMS.3C (server action confidentiality enforcement).
>
> Scope:
> 1. Migration: Add `dms_document_types.requires_approval BOOLEAN NOT NULL DEFAULT false` and `dms_documents` confidentiality CHECK constraint.
> 2. Add `dms.notifications.view_own` and `dms.notifications.admin` permissions (seeded, not yet applied to RLS — that is DMS.3E).
> 3. In `src/server/actions/dms/documents.ts`: add per-level permission check in `listDocuments` and `getDocument` using existing `dms.documents.view.{level}` permissions.
> 4. In `src/server/actions/dms/document-files.ts`: strip `storage_bucket` and `storage_path` from `listDocumentFiles` response; add confidentiality check in `getSignedDownloadUrl`.
> 5. No RLS changes yet (DMS.3D).
> 6. No notification RLS yet (DMS.3E).
> 7. No UI changes required — server-side hardening only.
>
> Reference: `implementation_Review/DMS_Module/DMS_3_SECURITY_PERMISSIONS_CONFIDENTIALITY_HARDENING_PLANNING_REPORT.md`

---

## 29. Final Decision

**DMS.3 PLANNING APPROVED — READY FOR SECURITY HARDENING IMPLEMENTATION**

The audit found significant security gaps — most critically `erp_notifications` with `ALL: true` RLS — but all gaps have clear, low-risk remediation paths using existing DB infrastructure (the confidentiality-level permissions, `current_user_has_permission()` helper, and server action pattern). No new architecture is required. Implementation should begin with DMS.3B/3C (server-side enforcement) followed immediately by DMS.3E (notification RLS) as the highest-priority fix.

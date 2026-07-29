# DMS.2D — Approval Queue Page Implementation Report

## 1. Executive Summary

DMS.2D is implemented. The `/dms/approvals` page is live. It provides a full approval queue
with tab-based status filters, search, sortable columns, per-row approve/reject/withdraw actions
(via the DMS.2C `DmsApprovalActionDialog`), pagination, and a sidebar entry — all backed by
DMS.2B server actions. No SQL migrations were created.

**Final decision:** DMS.2D APPROVAL QUEUE PAGE IMPLEMENTED — READY FOR REVIEW

---

## 2. Mandatory Rules / Source Files Reviewed

| File | Found |
|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | ✅ |
| `.cursor/rules/algt-erp-source-of-truth.mdc` | ✅ |
| `.cursor/rules/erp-child-dialog-form-standard.mdc` | ✅ |
| `.cursor/rules/erp-workspace-save-close-standard.mdc` | ✅ |
| `implementation_Review/DMS_Module/DMS_2B_APPROVAL_SERVER_ACTIONS_IMPLEMENTATION_REPORT.md` | ✅ |
| `implementation_Review/DMS_Module/DMS_2C_DOCUMENT_APPROVAL_PANEL_IMPLEMENTATION_REPORT.md` | ✅ |
| `src/server/actions/dms/document-approvals.ts` | ✅ |
| DMS.2C approval UI components | ✅ All 4 found |
| `src/components/layout/app-sidebar.tsx` | ✅ |
| `src/app/(protected)/dms/review-queue/page.tsx` | ✅ (pattern reference) |
| `src/app/(protected)/dms/notifications/page.tsx` | ✅ (pattern reference) |
| `src/lib/query/query-keys.ts` | ✅ |

## 3. Missing Rule / Source Files

None material to DMS.2D. The `src/app/(protected)/dms/approvals/` directory did not exist prior to this phase — created.

## 4. Existing UI/List Patterns Followed

- Route page pattern: `export const dynamic = "force-dynamic"; export const revalidate = 0;` server component with auth check → `redirect("/access-denied")` → render client component
- `ERPPageHeader` with breadcrumbs matching existing DMS pages
- Table UI: thead with sort headers (ArrowUp/Down/UpDown icons, cursor-pointer), tbody with hover highlight, sticky-top header
- Sort: local toggle `asc`/`desc` for each column, defaulting to `submitted_at desc`
- Pagination: Previous/Next buttons with page/total counter
- Loading: skeleton rows (5 rows)
- Error: centered error card with Retry
- Empty: icon + message
- `useTransition` for non-blocking server action calls (matches review-queue pattern)
- `TooltipTrigger` without `asChild` (Base UI pattern — this project does not support `asChild` on Tooltip)
- Sidebar entry: same `{ label, icon, path, requiredAnyPermissions }` object shape

## 5. Files Created

| File | Purpose |
|---|---|
| `src/app/(protected)/dms/approvals/page.tsx` | Route — permission check, ERPPageHeader, renders `DmsApprovalsQueuePageClient` |
| `src/features/dms/approvals/dms-approvals-queue-page-client.tsx` | Full queue UI: tabs, search, table, row actions, pagination, dialog integration |

## 6. Files Modified

| File | Change |
|---|---|
| `src/components/layout/app-sidebar.tsx` | Added "Approval Queue" entry between "Review Queue" and "Expiry & Renewals" |
| `src/lib/query/query-keys.ts` | Added `approvalState`, `approvalHistory`, `approvalsQueue` keys under `dms` namespace |

## 7. Route Implementation

```
/dms/approvals
```

- Server component page with `dynamic = "force-dynamic"` and `revalidate = 0`
- Permission check: `dms.approvals.view | dms.approvals.act | dms.approvals.submit | dms.approvals.withdraw | dms.approvals.admin | dms.approvals.history.view | dms.documents.approve | dms.admin | system_admin`
- Redirects to `/access-denied` on failure
- Passes `canAct` and `isAdmin` boolean props to client (server-resolved, not re-checked on client)

## 8. Queue Client / Table Implementation

**`DmsApprovalsQueuePageClient`** (`"use client"`)

- **State**: rows, total, loaded, loadError, filters (status, search, sortBy, sortDir, page), dialog state
- **Fetch**: `listPendingDocumentApprovalsForCurrentUser(filters)` via `useTransition` — fires on mount and on every filter/page/sort change
- **Columns**: Doc No (link), Title, Type, Submitted At (tooltip with full date), Submitted By, Status, Days Pending, Actions
- **No direct Supabase client usage** — server actions only
- **No internal user IDs exposed** — display names only

## 9. Filters / Search / Pagination

| Feature | Implementation |
|---|---|
| Tab filter (status) | `pending_approval` / `all` / `approved` / `rejected` / `withdrawn` — passes to server action |
| Search | Free-text, passed as `search` param to server action (server-side `ilike` on `title` and `document_no`) |
| Sort | `submitted_at` (default desc), `document_no`, `title` — server-side sort via `sortBy` + `sortDirection` params |
| Pagination | Page/pageSize (20 per page), Previous/Next buttons, total record count display |

## 10. Row Actions / Dialog Integration

| Action | Condition | Dialog Mode |
|---|---|---|
| View Document | Always | Link to `/dms/documents/record/{documentId}` |
| Approve | `(canAct \|\| row.canAct) && status === "pending_approval"` | `approve` — `DmsApprovalActionDialog` |
| Reject | `(canAct \|\| row.canAct) && status === "pending_approval"` | `reject` — required reason ≥ 5 chars |
| Withdraw | `row.canWithdraw && status === "pending_approval"` | `withdraw` — optional reason |

- Buttons disabled when `row.currentApprovalId` is null (tooltip explains why)
- On success: `fetchQueue`, `invalidateQueries` for `approvalsQueue`, `approvalState(documentId)`, `approvalHistory(documentId)`, `notifications`

## 11. Navigation Integration

Added to `src/components/layout/app-sidebar.tsx` DMS section:

```ts
{ label: "Approval Queue", icon: ClipboardCheck, path: "/dms/approvals",
  requiredAnyPermissions: ["dms.approvals.view", "dms.approvals.act", "dms.approvals.submit",
    "dms.approvals.withdraw", "dms.approvals.admin", "dms.documents.approve", "dms.admin"] }
```

Placed between "Review Queue" and "Expiry & Renewals".

## 12. Server Actions Consumed

| Action | Usage |
|---|---|
| `listPendingDocumentApprovalsForCurrentUser(filters)` | Primary fetch with all filter/sort/pagination params |
| `approveDocument(documentId, approvalId, input)` | Via `DmsApprovalActionDialog` in approve mode |
| `rejectDocument(documentId, approvalId, input)` | Via `DmsApprovalActionDialog` in reject mode |
| `withdrawDocumentApproval(documentId, approvalId, input)` | Via `DmsApprovalActionDialog` in withdraw mode |

`getDocumentApprovalState` not used (row already contains capability flags from the list action).

## 13. Permission / Capability Rendering

- `canAct` resolved **server-side** in the page component — never re-evaluated on client
- `row.canAct` and `row.canWithdraw` returned by the server action per-row — UI gates on both
- Admin/non-admin branching for "All" tab defaulting
- No frontend-only permission logic; all capability signals come from the server

## 14. Loading / Error / Empty States

| State | Implementation |
|---|---|
| Loading | 5 skeleton rows with shimmer while `isPending \|\| !loaded` |
| Error | Centered error text + Retry button |
| Empty (pending tab) | Icon + "No pending approvals for you right now." |
| Empty (search) | "No results matching your search." |
| Empty (other) | "No approval records found." |

## 15. Security Notes

- No direct Supabase browser queries anywhere in DMS.2D
- No raw storage keys, payload_json, metadata_json, or private file paths exposed
- No internal user IDs shown — display names only
- Server action RLS enforces visibility; UI merely reflects returned rows
- `canAct` is passed from server component (auth-resolved); `row.canAct` / `row.canWithdraw` come from server action
- `currentApprovalId` is used only for action calls, never displayed

## 16. Type Safety Review

- `ApprovalQueueRow` imported from `@/server/actions/dms/document-approvals` — no re-declaration
- `row.approvalStatus` cast to union type matching `DmsApprovalStatusBadge`'s `ApprovalStatus` prop
- No `any` types introduced
- `ApprovalDialogMode` imported from `DmsApprovalActionDialog`

## 17. Build / Typecheck / Lint Results

```
npx tsc --noEmit → 0 DMS.2D-related errors
```

Pre-existing errors in unrelated modules (audit, branches, permissions, user-management) are unchanged and unrelated to this phase.

## 18. Manual QA / Code Inspection Results

- Route renders with `ERPPageHeader` matching existing DMS pages ✅
- Tabs: 5 status tabs including "Pending My Action" default ✅
- Search debounce is user-driven (fires on change) ✅
- Sort columns: submitted_at (default desc), document_no, title ✅
- Actions: approve (green), reject (red), withdraw (slate) — color-coded ✅
- Action buttons disabled + tooltip when `currentApprovalId` is null ✅
- `DmsApprovalActionDialog` reused — no logic duplication ✅
- TanStack Query invalidation after success ✅
- No sidebar broad changes beyond the single DMS entry ✅

## 19. Remaining Risks / Follow-Ups

| Risk | Severity | Notes |
|---|---|---|
| `listPendingDocumentApprovalsForCurrentUser` inner join on `dms_document_approvals` may exclude documents with no approval row yet | Low | Documents never submitted won't appear — correct behavior |
| `days_pending` can be negative for timezone edge cases | Low | Clamped by `Math.floor` — visual artifact only |
| No admin-only "All Submissions" view for docs submitted by others | Low | `isAdmin` prop available for future scoping |

## 20. DMS.2E Readiness

DMS.2E (Approval Workflow Admin Page) can now begin. Existing infrastructure:
- `adminListApprovalWorkflows()`, `adminCreateApprovalWorkflow()`, `adminUpdateApprovalWorkflow()`, `adminDeactivateApprovalWorkflow()` server actions from DMS.2B are ready
- `WorkflowRow` and `WorkflowWithSteps` types are exported
- Sidebar "DMS Admin" subsection exists and accepts new entries
- Route: `src/app/(protected)/admin/dms/approval-workflows/page.tsx` is the recommended path

---

## 21. Final Decision

**DMS.2D APPROVAL QUEUE PAGE IMPLEMENTED — READY FOR REVIEW**

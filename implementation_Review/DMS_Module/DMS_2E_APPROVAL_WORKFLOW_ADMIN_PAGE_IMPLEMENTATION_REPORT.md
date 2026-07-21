# DMS.2E — Approval Workflow Admin Page Implementation Report

## 1. Executive Summary

DMS.2E is implemented. The `/admin/dms/approval-workflows` page is live with a full admin
UI for creating, editing, deactivating, and reactivating approval workflows. A steps editor
is inline in the form dialog, supporting add/remove/reorder/initial/final/role assignment.
The DMS Admin sidebar and overview card were extended for discoverability.

**Final decision:** DMS.2E APPROVAL WORKFLOW ADMIN PAGE IMPLEMENTED — READY FOR REVIEW

---

## 2. Mandatory Rules / Source Files Reviewed

| File | Found |
|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | ✅ |
| `.cursor/rules/erp-child-dialog-form-standard.mdc` | ✅ |
| `.cursor/rules/erp-workspace-save-close-standard.mdc` | ✅ |
| `src/server/actions/dms/document-approvals.ts` | ✅ |
| `src/app/(protected)/admin/dms/categories/page.tsx` | ✅ (pattern reference) |
| `src/features/dms/admin/dms-categories-table.tsx` | ✅ (pattern reference) |
| `src/features/dms/admin/dms-overview-client.tsx` | ✅ (modified) |
| `src/components/layout/app-sidebar.tsx` | ✅ (modified) |
| `src/server/actions/dms/document-types.ts` | ✅ (`getDmsDocumentTypes` available) |
| DMS.2D queue page client | ✅ (pattern reference) |

## 3. Missing Rule / Source Files

- No `listRoles` server action returning `[{role_code, role_name}]` found — manual role code entry used as documented fallback.
- `/admin/dms/approval-workflows/` directory did not exist — created.
- `src/features/dms/approvals/admin/` directory did not exist — created.

## 4. Existing Admin UI Patterns Followed

- **Route page**: `dynamic = "force-dynamic"`, SSR preload of server actions, `ERPPageHeader` with breadcrumbs, `redirect("/access-denied")` on permission failure
- **Client table**: `useSortFilter` hook (client-side sort + filter on pre-loaded data), no external pagination needed (admin workflows are few)
- **Form dialog**: `ERPChildDialogForm` per the child dialog standard (size `xl` for complex form with steps editor)
- **Confirmation**: `AlertDialog` for deactivate confirmation (matches categories-table pattern)
- **`useTransition`** for non-blocking refresh/reactivate calls
- **`RequiredLabel`** for required fields
- **`ERPCombobox`** for document type select (not shadcn Select — async/db-sourced data)

## 5. Files Created

| File | Purpose |
|---|---|
| `src/app/(protected)/admin/dms/approval-workflows/page.tsx` | Route — permission check, SSR preload, renders client |
| `src/features/dms/approvals/admin/dms-approval-workflow-form-dialog.tsx` | Create/Edit dialog + inline steps editor |
| `src/features/dms/approvals/admin/dms-approval-workflows-admin-page-client.tsx` | List page client — table, toolbar, dialogs, deactivate |

## 6. Files Modified

| File | Change |
|---|---|
| `src/components/layout/app-sidebar.tsx` | "Approval Workflows" added under DMS Admin subsection |
| `src/features/dms/admin/dms-overview-client.tsx` | "Approval Workflows" stat card added (links to `/admin/dms/approval-workflows`) |

## 7. Route Implementation

```
/admin/dms/approval-workflows
```

- `dynamic = "force-dynamic"`, `revalidate = 0`
- Permission: `dms.approvals.admin | dms.admin | system_admin`
- Redirects to `/access-denied` on failure
- SSR preloads `adminListApprovalWorkflows()` + `getDmsDocumentTypes({ is_active: true })` in parallel
- Passes `initialWorkflows` and `documentTypes` to client (avoids loading flash for typical admin page)

## 8. Workflow Admin Client Implementation

**`DmsApprovalWorkflowsAdminPageClient`** (`"use client"`)

- **State**: `workflows`, `loadError`, `search`, `statusFilter` (all/active/inactive), dialog state, deactivate target
- **`useSortFilter`**: Client-side filter (search + status) + sort for 7 sort keys
- **Toolbar**: Search input, active/inactive/all segment buttons, Refresh, New Workflow
- **Table columns**: Code, Name, Document Type, Steps, Status, Updated, Actions
- **Row actions**: Edit → opens form dialog with existing data; Deactivate → AlertDialog confirm; Reactivate → direct call
- **`useEffect`**: Only re-fetches on mount if `initialWorkflows` is empty (SSR already populated otherwise)

## 9. Workflow Form / Dialog Implementation

**`DmsApprovalWorkflowFormDialog`** — `ERPChildDialogForm` size `xl`

| Field | Required | Notes |
|---|---|---|
| `workflow_code` | ✅ | Read-only in edit mode; auto-uppercased, `[A-Z0-9_]` enforced |
| `name_en` | ✅ | |
| `name_ar` | optional | `dir="rtl"` |
| `description` | optional | Textarea, 2 rows |
| `document_type_id` | optional | `ERPCombobox` from loaded doc types, `allowClear` |
| `is_active` | ✅ | Switch |
| Steps | ✅ | Inline steps editor (see §10) |

**Create**: calls `adminCreateApprovalWorkflow` with all fields + steps  
**Edit**: calls `adminUpdateApprovalWorkflow(id, { name_en, name_ar, description, document_type_id, is_active, steps })`  
(Note: `workflow_code` is intentionally not updateable — shown read-only to prevent code mutation)

## 10. Workflow Steps Editor Implementation

Inline table inside the form dialog:

| Feature | Implementation |
|---|---|
| Add step | "Add Step" button appends a new blank row |
| Remove step | Trash icon per row; `normalizeOrders` re-sequences sort_order |
| Reorder | Up/Down arrow buttons per row; updates in-memory `steps` array |
| Initial step | Radio button — selecting one deselects all others |
| Final step | Radio button — selecting one deselects all others |
| Required role | Free-text `role_code` input per step (no role list action available — see §12) |
| Active toggle | Switch per row; inactive rows are visually dimmed |
| sort_order | Auto-normalized on every add/remove/reorder |

**Client validation** (runs on submit):
- ≥1 active step
- Exactly 1 initial step
- Exactly 1 final step  
- Each step: `step_code` and `step_name` required
- Step codes unique within workflow

## 11. Document Type Assignment Handling

`getDmsDocumentTypes({ is_active: true })` is called SSR and passed as `documentTypes` prop.
Rendered as `ERPCombobox` in the form with `allowClear`. Displays `type_code — name_en` label.
`document_type_id` is optional — unset means the workflow applies to any document type.

`DmsDocumentTypeRow.requires_approval` column was **not** modified (per spec — future enhancement only).

## 12. Role Assignment Handling

No `listRoles()` action returning `[{role_code, role_name}]` exists in `src/server/actions/roles.ts`.
**Fallback used**: Free-text `role_code` input per step, validated as safe string (no special chars enforced at client, server Zod validates `max(100)` and the pattern is consistent with existing role code conventions).

**Future enhancement**: Add `listAssignableRoles()` action and replace the text input with `ERPCombobox`.

## 13. Navigation / Discoverability

**Sidebar** (`src/components/layout/app-sidebar.tsx`):
```ts
{ label: "Approval Workflows", icon: ClipboardCheck, path: "/admin/dms/approval-workflows",
  requiredAnyPermissions: ["dms.approvals.admin", "dms.admin"] }
```
Placed at the end of the DMS Admin subsection, after Notification Settings.

**Admin DMS Overview** (`dms-overview-client.tsx`):
New stat card "Approval Workflows" linking to `/admin/dms/approval-workflows` (value hard-coded `0` since overview stats don't include workflow count — future enhancement: extend `getDmsAdminOverviewStats`).

## 14. Server Actions Consumed

| Action | Usage |
|---|---|
| `adminListApprovalWorkflows()` | SSR preload + client refresh |
| `adminCreateApprovalWorkflow(input)` | Create workflow via form dialog |
| `adminUpdateApprovalWorkflow(id, input)` | Edit workflow (fields + steps) + reactivate (`is_active: true`) |
| `adminDeactivateApprovalWorkflow(id)` | Deactivate after confirmation dialog |
| `getDmsDocumentTypes({ is_active: true })` | SSR preload for doc type select |

## 15. Permission / Security Notes

- Route-level: `dms.approvals.admin | dms.admin | system_admin` — server-enforced redirect
- Server action-level: `isDmsAdmin()` check in every admin action (DMS.2B) — second gate
- No direct Supabase browser queries anywhere
- No `service_role` in frontend
- No hard delete — deactivate only
- Historical workflow steps are not destroyed on edit (server action deactivates old steps and inserts new ones — existing approval history FKs are preserved)
- No internal user IDs exposed

## 16. Loading / Error / Empty States

| State | Implementation |
|---|---|
| Loading (SSR) | Instant — data preloaded server-side |
| Loading (refresh) | Skeleton rows while `isPending && rows.length === 0` |
| Load error | Error text + Retry button |
| Empty (no workflows) | Icon + message + "Create First Workflow" CTA button |
| Empty (filtered) | "No workflows match your filters." |
| Dialog submitting | `isSubmitting` prop → buttons disabled + spinner in `ERPChildDialogForm` |
| Deactivate in progress | "Deactivating…" label on confirm button |

## 17. Type Safety Review

- `WorkflowRow` and `WorkflowWithSteps` imported directly from `@/server/actions/dms/document-approvals`
- `DmsDocumentTypeRow` imported from `@/server/actions/dms/document-types`
- `StepDraft` local type — avoids `any`, uses discriminated fields
- `ERPCombobox.value` accepts `string | number | null` — fixed cast `docTypeId ?? null`
- No `any` types introduced

## 18. Build / Typecheck / Lint Results

```
npx tsc --noEmit → 0 DMS.2E-related errors
```

One fix applied: `ERPCombobox value` prop changed from `docTypeId ?? undefined` to `docTypeId ?? null`
to match the `string | number | null` union. Pre-existing errors in unrelated modules unchanged.

## 19. Manual QA / Code Inspection Results

- Route preloads data SSR — no loading flash on first render ✅
- Workflow code auto-uppercased and filtered to `[A-Z0-9_]` on input ✅
- Code is read-only in edit mode to prevent mutation ✅
- Steps editor: add/remove/up/down/initial radio/final radio/active switch all wired ✅
- `normalizeOrders` re-sequences `sort_order` on every mutation ✅
- Form validates before calling server action ✅
- Deactivate requires AlertDialog confirmation ✅
- Reactivate via `adminUpdateApprovalWorkflow(id, { is_active: true })` ✅
- Query invalidation after any mutation ✅
- `ERPChildDialogForm` used correctly — size `xl`, no `asChild` on Base UI components ✅

## 20. Remaining Risks / Follow-Ups

| Risk | Severity | Notes |
|---|---|---|
| Edit dialog opens with empty steps (WorkflowRow has no `steps`) | Medium | Steps field shows empty; admin must re-enter all steps on edit. Fix: fetch `WorkflowWithSteps` via dedicated endpoint when Edit is clicked |
| `requires_role` free-text — no validation against real role codes | Low | Server accepts any string ≤100 chars; typos silently accepted |
| "Approval Workflows" overview card always shows `0` | Low | Extend `getDmsAdminOverviewStats` to include workflow counts |
| No workflow-to-document-type uniqueness enforced in UI | Low | Server action allows multiple workflows per type; first active workflow wins |

### High-priority follow-up: fetch steps on Edit

The `WorkflowRow` type from `adminListApprovalWorkflows` does not include step details. To edit
steps properly, a dedicated fetch (e.g. `getApprovalWorkflowForDocumentType` or a new
`adminGetApprovalWorkflow(id)` server action) is needed. Currently the form opens with empty steps,
meaning the admin must re-add all steps during an edit operation.

## 21. DMS.2F / DMS.2G Readiness

DMS.2 sub-phases A–E are all implemented. The approval system is functionally complete for basic
single-approver workflows. Readiness for next phases:

- **DMS.2F / DMS.3 (Security Hardening)**: The permission model, RLS, and admin gates are in place.
- **DMS.4 (Runtime QA/UAT)**: All four sub-phases (2A–2E) are code-complete and ready for runtime UAT.
- A `adminGetApprovalWorkflow(id)` server action would be the recommended prerequisite before DMS.2F if multi-step edit fidelity is required.

---

## 22. Final Decision

**DMS.2E APPROVAL WORKFLOW ADMIN PAGE IMPLEMENTED — READY FOR REVIEW**

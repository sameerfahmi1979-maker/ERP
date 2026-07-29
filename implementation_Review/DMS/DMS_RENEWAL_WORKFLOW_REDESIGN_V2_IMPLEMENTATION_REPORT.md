# DMS Renewal Workflow Redesign (v2) — Implementation Report

**Phase:** DMS RENEWAL.2
**Date:** 2026-07-03
**Status:** CLOSED / PASS ✅
**Plan:** `dms_renewal_workflow_redesign_9ee6cea5.plan.md` (user-approved plan; not modified)

## 1. Problem Statement

Two gaps existed in the DMS renewal workflow:

1. **One-time documents had no way to opt out of renewal.** Every document type implicitly allowed "Start Renewal", even for documents that are inherently one-time (e.g. a Visit Visa) and should never be renewed — a brand-new document must be uploaded instead.
2. **Completing a renewal never actually linked to a real replacement document.** `completeDmsRenewalRequest` only updated the *same* document's `expiry_date`. The existing `replacement_document_id` column on `dms_renewal_requests` was silently unused, `dms_documents.status = 'superseded'` was never set by any code path, and there was no column linking an old document to the document that replaced it.

## 2. Decisions Implemented (confirmed with Sameer before implementation)

1. **Config level:** a type-level `is_renewable` toggle on Document Types (same pattern as `requires_expiry_tracking`) — applies to every document of that type.
2. **Completion flow:** "pick existing" — the user uploads the new/renewed file through the normal existing upload flow first, then searches and picks that document from a combobox inside the "Complete Renewal" dialog to link it.
3. **Old document disposition:** status becomes `superseded`; the document stays visible in lists with a banner linking to the new document.

## 3. Database Changes

Migration: `supabase/migrations/20260703000000_dms_renewal_workflow_v2.sql` (applied live via Supabase MCP `apply_migration`).

| Table | Column | Type | Default | Notes |
|---|---|---|---|---|
| `dms_document_types` | `is_renewable` | `BOOLEAN NOT NULL` | `true` | Non-breaking — every existing type keeps today's implicit "renewable" behavior until an admin explicitly flips it off. |
| `dms_documents` | `superseded_by_document_id` | `BIGINT NULL REFERENCES dms_documents(id)` | `NULL` | Set only when a renewal is completed. Partial index `dms_documents_superseded_by_idx` added (`WHERE superseded_by_document_id IS NOT NULL`). |

Verified live via `execute_sql` after migration: both columns present with correct types/defaults.

## 4. Part 1 — "Renewable" Flag on Document Types

### Server action (`src/server/actions/dms/document-types.ts`)
- `DmsDocumentTypeRow.is_renewable: boolean` added.
- `documentTypeSchema` extended with `is_renewable: z.boolean().default(true)`.
- `duplicateDmsDocumentType` now copies `is_renewable` from the source type.

### Admin UI (`src/features/dms/admin/dms-document-types-table.tsx`)
- New `Switch` + `Label` "Renewable" next to "Requires Expiry Tracking" / "Requires Approval".
- Inline warning note shown in the form when the switch is off, explaining the one-time-document behavior.
- Table now shows a "One-time" outline badge in the Expiry column when `is_renewable === false`.

### Enforcement — server (defense in depth)
`createDmsRenewalRequest` (`src/server/actions/dms/renewals.ts`) now joins `document_type:dms_document_types!document_type_id(is_renewable, name_en)` and returns a clear error (`"{Type name} does not support renewal requests — it is a one-time document. Upload a new document instead."`) before creating any renewal request, if the document's type is non-renewable.

### Enforcement — UI
- **Document Expiry section** (`src/features/dms/documents/sections/dms-document-expiry-section.tsx`): the "Start Renewal" button is now hidden when `isRenewable === false` (or the document is already `superseded`); a muted notice ("One-time document — this document type does not support renewal…") is shown instead.
- **Expiry Dashboard** (`src/features/dms/expiry/dms-expiring-documents-table.tsx` + `getDmsExpiringDocuments` in `src/server/actions/dms/expiry-reminders.ts`): `document_type:dms_document_types!document_type_id(name_en, is_renewable)` added to the select; `DmsExpiringDocumentRow.is_renewable` added; the row-level "Renew" button is replaced with a small "One-time" label when the type is non-renewable. Expiry tracking/reminders themselves are unaffected — non-renewable documents still surface as expiring/expired.
- **Document Record Form** (`src/features/dms/documents/dms-document-record-form.tsx`, `getDmsNewDocumentDefaults` in `documents.ts`): `is_renewable` threaded from the document type list into the local `DocumentType` interface and passed to `DmsDocumentExpirySection` as `isRenewable`.

## 5. Part 2 — Link Renewal Completion to a Real Replacement Document

### Replacement search (`searchDmsDocumentsForRenewalReplacement`, `src/server/actions/dms/renewals.ts`)
New server action, scoped and filtered:
- `document_type_id = documentTypeId`, `deleted_at IS NULL`.
- Excludes the original document itself.
- Excludes any document already linked as another renewal's `replacement_document_id` on a `renewed` request (prevents double-linking the same new document to two renewals).
- Optional free-text search across `document_no` / `title`.
- Returns `{ id, document_no, title, expiry_date, status }[]` (capped at 50, most recent first).

### `completeDmsRenewalRequest` (`src/server/actions/dms/renewals.ts`)
- `replacement_document_id` is now **required** in `CompleteRenewalSchema` (was optional and unused).
- Validates: replacement exists / not deleted, replacement ≠ original, replacement is the same `document_type_id` as the original, replacement not already claimed by a different completed renewal.
- `new_expiry_date` is now auto-derived from the replacement document's `expiry_date` when not explicitly supplied (still overridable from the dialog).
- On success:
  - `dms_renewal_requests`: `status='renewed'`, `replacement_document_id`, `completed_at`, `new_expiry_date`.
  - **Old document** (`document_id`): `status='superseded'`, `superseded_by_document_id = replacement_document_id`. New `document_superseded` event logged.
  - Pending reminders on the old document dismissed (unchanged behavior).
  - Reminder schedule rebuilt on the **replacement** document (not the old one) if it has an expiry date.
  - `document_renewed` event + audit log payload extended with `replacement_document_id`.
  - `revalidatePath` extended to also revalidate the replacement document's record route.
- `DmsRenewalRequestRow.document` extended with `document_type_id` (needed to scope the replacement search from the table).

### `DmsCompleteRenewalDialog` UI (`src/features/dms/renewals/dms-complete-renewal-dialog.tsx`)
- New required `documentTypeId` prop (passed from `DmsRenewalRequestsTable`).
- New required `ERPCombobox` "Replacement Document" wired to `searchDmsDocumentsForRenewalReplacement` via `useQuery` (scoped to the original document's type, excluding itself), loaded when the dialog opens.
- Selecting a replacement auto-fills "New Expiry Date" from its `expiry_date` (kept editable) — implemented via the combobox's `onValueChange` handler directly (not a `useEffect`) to avoid a synchronous-setState-in-effect lint violation.
- Submit calls `completeDmsRenewalRequest` with the selected `replacement_document_id`; client-side guard shows a toast if no replacement is selected.
- Updated info box text to reflect the new behavior (link replacement → mark original superseded → rebuild reminders → dismiss old pending reminders).

### Old document banner (`src/features/dms/documents/sections/dms-document-expiry-section.tsx`)
- New `documentStatus` + `supersededBy` props.
- When `documentStatus === 'superseded'`, a purple banner is shown: "This document has been renewed and superseded" with a "View new document" button that opens the replacement document via the existing workspace `openTab` pattern (`/dms/documents/record/{id}?mode=view`). If the link is missing (data inconsistency), a fallback message is shown instead of the button.
- Wired from `dms-document-record-form.tsx` using `doc.status` and the new `doc.superseded_by` join.
- `documents.ts`: `DmsDocumentRow` extended with `superseded_by_document_id` + `superseded_by?: { id, document_no, title }`; `getDmsDocumentRecordData`'s select extended with `superseded_by:dms_documents!superseded_by_document_id(id, document_no, title)` and `document_type:...is_renewable`.

## 6. Files Created

- `supabase/migrations/20260703000000_dms_renewal_workflow_v2.sql`
- `implementation_Review/DMS_RENEWAL_WORKFLOW_REDESIGN_V2_IMPLEMENTATION_REPORT.md` (this report)

## 7. Files Modified

- `src/server/actions/dms/document-types.ts`
- `src/features/dms/admin/dms-document-types-table.tsx`
- `src/server/actions/dms/renewals.ts`
- `src/server/actions/dms/documents.ts`
- `src/server/actions/dms/expiry-reminders.ts`
- `src/features/dms/documents/sections/dms-document-expiry-section.tsx`
- `src/features/dms/documents/dms-document-record-form.tsx`
- `src/features/dms/expiry/dms-expiring-documents-table.tsx`
- `src/features/dms/renewals/dms-complete-renewal-dialog.tsx`
- `src/features/dms/renewals/dms-renewal-requests-table.tsx`

## 8. Out of Scope (per plan, flagged not blocking)

- Superseded documents are not made read-only/locked for editing — only visually flagged. Can be a fast follow.
- No new `dms_document_types` seed values are guessed for "Visit Visa" — existing types (e.g. `VISA`) must be toggled off manually by an admin post-migration since exact one-time type codes are org-specific.

## 9. Validation

- `npx tsc --noEmit -p tsconfig.json`: **PASS (0 errors)**.
- `npx eslint` on all modified files: **PASS** (0 new errors; pre-existing unrelated unused-import warnings in `dms-document-record-form.tsx`, `dms-expiring-documents-table.tsx`, `documents.ts` were not introduced by this change and left untouched).
- Migration applied live to Supabase project `mmiefuieduzdiiwnqpie` via `user-supabase` MCP `apply_migration`; columns verified present via `execute_sql`.
- No RLS changes required (existing `dms_document_types` / `dms_documents` policies already cover the new columns since they use `USING (true)` broad DMS policies established in earlier phases).
- No new permissions required — reused existing `dms.documents.manage_types` (document type admin) and `dms.renewals.manage` (renewal completion).

## 10. Next Recommended Step

Sameer should review the live Document Types admin screen and manually flip `is_renewable = false` for any genuinely one-time document types (e.g. Visit Visa, if modeled as its own type) — no such flip was made automatically by this phase.

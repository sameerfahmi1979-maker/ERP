# ERP DMS.11 — Option A AI-First Upload-Session Intake, Review, and Confirm-Save
## Implementation Report

**Phase:** ERP DMS.11  
**Status:** CLOSED / PASS ✅  
**Date:** 2026-06-15  
**Implemented by:** Cursor Agent (DMS.11 implementation prompt)  
**Build status:** ✅ PASS (0 TS errors, build succeeds)  
**Route live:** `/dms/intake/[sessionCode]`  

---

## 1. Executive Summary

DMS.11 implements the Option A AI-first intake workflow: **Upload → AI Fill → User Reviews → Approve & Save → Final Document Created**.

Previously, creating a document required manual entry of title, document type, and category BEFORE AI could run. AI suggestions appeared in a separate read-only tab with no way to apply them directly to the form.

DMS.11 introduces a dedicated intake route (`/dms/intake/[sessionCode]`) where:
1. The user uploads a file from `/dms/inbox`
2. Clicks **Upload & AI Fill** (new primary action)
3. System synchronously runs OCR extraction + AI classification/extraction on the temp file
4. User is redirected to the AI Review screen with all fields pre-filled
5. User reviews, corrects, and clicks **Approve & Save**
6. System creates the final `dms_documents` record and everything downstream

**No document record exists before user approval.** This is the core Option A principle.

---

## 2. DMS.10A Dependency Confirmation

DMS.10A investigation recommended Option B (Draft Document First) for safety. Sameer decided to implement **Option A** (Upload Session First) to match the user experience requirement: no document record before approval.

Key DMS.10A findings that were addressed:
- ✅ OCR/AI both run on temp file without creating a document first
- ✅ Review form is editable (not a separate read-only tab)
- ✅ No metadata is saved before user approval
- ✅ Manual creation fallback preserved

---

## 3. Why Option A Was Implemented

Option A was chosen by Sameer because it delivers the cleanest user experience:
- No partial/draft documents appear in the document repository
- The user only sees a final document after they explicitly approve
- The intake review screen is purpose-built for AI-assisted review (not repurposed from the existing record form)

---

## 4. Schema Changes

**Migration:** `supabase/migrations/20260615040000_erp_dms_11_ai_first_intake.sql`

### `dms_upload_sessions` — new columns

| Column | Type | Purpose |
|---|---|---|
| `document_id` | `BIGINT NULL → dms_documents` | Set after `approveAiIntakeAndCreateDocument` |
| `ai_job_id` | `BIGINT NULL → dms_ai_extraction_jobs` | AI job created during intake |
| `ai_result_id` | `BIGINT NULL → dms_ai_extraction_results` | AI result to review |
| `intake_status` | `TEXT NOT NULL DEFAULT 'uploaded'` | 11-state lifecycle |
| `review_status` | `TEXT NOT NULL DEFAULT 'not_started'` | 6-state review lifecycle |
| `review_started_at` | `TIMESTAMPTZ NULL` | When review began |
| `review_completed_at` | `TIMESTAMPTZ NULL` | When review completed |
| `reviewed_by` | `BIGINT NULL → user_profiles` | Who approved |
| `discarded_at` | `TIMESTAMPTZ NULL` | When discarded |
| `discard_reason` | `TEXT NULL` | Optional discard reason |

**Intake statuses:** `uploaded` → `ocr_processing` → `ai_processing` → `review_pending` → `review_in_progress` → `approved` | `discarded` | `failed`

**Review statuses:** `not_started` → `pending` → `in_review` → `approved` | `discarded` | `failed`

### `dms_ai_extraction_jobs` — new column

| Column | Type | Purpose |
|---|---|---|
| `upload_session_id` | `BIGINT NULL → dms_upload_sessions` | Links intake job to session (no document_id needed) |

### `dms_ai_extraction_results` — new column

| Column | Type | Purpose |
|---|---|---|
| `upload_session_id` | `BIGINT NULL → dms_upload_sessions` | Links AI result to session before document is created |

### New table: `dms_intake_review_values`

Persists user's in-progress review edits across sessions (for the Save Draft feature).

| Column | Type | Purpose |
|---|---|---|
| `id` | `BIGINT GENERATED ALWAYS AS IDENTITY PK` | |
| `upload_session_id` | `BIGINT NOT NULL → dms_upload_sessions` | |
| `field_scope` | `TEXT NOT NULL` | `document` / `metadata` / `tag` / `link` |
| `field_code` | `TEXT NOT NULL` | Field identifier |
| `field_label` | `TEXT NULL` | Human-readable label |
| `field_type` | `TEXT NULL` | `text` / `date` / `number` etc. |
| `suggested_value_json` | `JSONB NULL` | What AI suggested |
| `reviewed_value_json` | `JSONB NULL` | What user edited to |
| `confidence_score` | `NUMERIC(5,4) NULL` | AI confidence 0-1 |
| `confidence_label` | `TEXT NULL` | `high` / `medium` / `low` / `needs_manual_review` |
| `source_snippet` | `TEXT NULL` | Source text from document |
| `review_status` | `TEXT NOT NULL DEFAULT 'pending'` | `pending` / `accepted` / `edited` / `rejected` |

**Why `dms_intake_review_values` is needed:** In Option A, there is no `dms_documents` record to store draft state against. The `dms_intake_review_values` table provides draft persistence for the review screen so users can close the browser and return to their in-progress review.

---

## 5. Server Actions — `src/server/actions/dms/ai-intake.ts`

### `startAiIntakeFromUploadSession(uploadSessionId, allowDuplicate?)`

Core intake trigger action. Called from the Upload Inbox when user clicks "Upload & AI Fill".

1. Validates session exists and is not cancelled/completed/discarded/approved
2. Checks AI provider is configured
3. Downloads temp file from `dms-temp` bucket (admin client)
4. Extracts PDF text (via `pdf-parse v1.1.1`) or base64-encodes images
5. Creates `dms_ai_extraction_jobs` row with `upload_session_id` (no `document_id`)
6. Calls AI provider (`getDmsAiProvider()`) with extracted content + all document type candidates
7. Stores result in `dms_ai_extraction_results` with `upload_session_id`
8. Updates session: `intake_status = review_pending`, `ai_result_id`
9. Returns `{ sessionCode, status }` for redirect

**Synchronous** — AI call completes before returning. Client shows loading state.

### `getAiIntakeSession(sessionCode)`

Loads full intake session data for the review page:
- Session metadata
- AI result (`dms_ai_extraction_results` with suggested type join)
- Draft review values (`dms_intake_review_values`)

### `getIntakeSessionSignedUrl(uploadSessionId)`

Generates a 5-minute signed URL to the temp file for the preview button.

### `saveAiIntakeDraft(uploadSessionId, draftValues[])`

Upserts user's in-progress edits to `dms_intake_review_values`. Updates `review_status = in_review`. Safe to call repeatedly.

### `retryAiIntake(uploadSessionId)`

Resets `intake_status → uploaded` then calls `startAiIntakeFromUploadSession` again.

### `discardAiIntake(uploadSessionId, reason?)`

Sets `intake_status = discarded`, `review_status = discarded`, `discarded_at`, `discard_reason`. Cannot discard an already-approved intake.

### `approveAiIntakeAndCreateDocument(input)` — the final save

The complete document creation action. Called when user clicks "Approve & Save".

**Input:**
- `uploadSessionId`, `title`, `documentTypeId`
- Optional: `description`, `issueDate`, `expiryDate`, `confidentialityLevel`
- Optional: `owningCompanyId`, `owningBranchId`, `partyId`
- Optional: `metadataValues[]` (definitionId + fieldType + rawValue)
- Optional: `tagIds[]`, `links[]`
- Optional: `aiResultId` (the result to mark accepted)

**Steps:**
1. Validates permissions (requires `dms.documents.review_ai` or `dms.documents.upload`)
2. Validates date order (expiry ≥ issue)
3. Idempotency: if session is already `approved` with a `document_id`, returns existing document
4. Loads document type (for type_code, category_id, default_confidentiality)
5. Generates document_no via `generate_next_reference_number('MASTER_DMS_DOCUMENT')`
6. Inserts `dms_documents` (status = `active`)
7. Downloads temp file from `dms-temp`, uploads to `dms-documents` with final path
8. If storage fails: deletes the document record, returns error
9. Creates `dms_document_versions` v1
10. Creates `dms_document_files`
11. Updates `dms_documents.current_version_id`
12. Saves accepted metadata values (filters empty strings, uses field_type to determine value column)
13. Saves accepted tag IDs
14. Saves accepted ERP links
15. Generates expiry reminders (90/60/30/14/7/1 days before)
16. Marks AI result: `ai_status = accepted`, `review_action = accepted`, `document_id = new doc id`
17. Updates upload session: `status = completed`, `intake_status = approved`, `review_status = approved`, `document_id`, `reviewed_by`, `completed_at`
18. Inserts document events: `document_created_from_ai_intake`, `ai_intake_approved`, `file_uploaded`, `version_uploaded`, `metadata_updated`
19. Audit log
20. Revalidates `/dms/documents`, `/dms/inbox`, `/dms/intake/[sessionCode]`
21. Returns `{ documentId, documentNo }`

---

## 6. Upload Inbox Changes

**`src/features/dms/upload/dms-upload-inbox-page-client.tsx`**

- Added import: `startAiIntakeFromUploadSession`
- Added `ai_processing` phase to `UploadState` union type
- Added `handleAiFill(session)` function: calls `startAiIntakeFromUploadSession`, shows processing banner, on success navigates to `/dms/intake/[sessionCode]`
- Updated "ready" banner: **primary button is now "Upload & AI Fill"** (violet), secondary is "Attach to existing document", ghost is "Create Manually"
- Added `ai_processing` banner: violet spinner + "AI is analyzing your document…" message
- Passes `onAiFill={handleAiFill}` to `DmsUploadSessionTable`

**`src/features/dms/upload/dms-upload-session-table.tsx`**

- Added `onAiFill?: (session) => void` prop
- Added "AI Fill" button (violet) as first action per row when session is actionable
- Added `Bot` icon import

---

## 7. Intake Review Route and UI

### Route

**`src/app/(protected)/dms/intake/[sessionCode]/page.tsx`**

Server component. Calls `getAiIntakeSession(sessionCode)`. If not found: 404. If already approved: redirects to `/dms/documents/record/[documentId]`.

### Components — `src/features/dms/intake/`

| File | Purpose |
|---|---|
| `dms-ai-intake-page-client.tsx` | Main page: header, panels, footer, approve/discard/retry logic |
| `dms-ai-intake-review-form.tsx` | Right panel editable form with all document fields |
| `dms-ai-intake-field-row.tsx` | Field row: label + confidence badge + source tooltip + content + low-confidence highlight |
| `dms-ai-intake-metadata-section.tsx` | Dynamic metadata fields loaded on document type change |
| `dms-ai-intake-status-badge.tsx` | 11-variant intake status badge |

**Page layout:**
- **Header**: AI Bot icon, session code (mono), intake status badge, classification confidence badge, duplicate warning badge, action buttons (Re-run AI | Save Draft | Approve & Save | Discard)
- **Left panel** (1/3): File info card (filename, size, MIME, status), Preview File button (signed URL), AI Analysis Summary card (suggested type, classification reason, confidence, expiry suggestion, field count), Duplicate warning card with link to existing document
- **Right panel** (2/3): Editable review form inside a card
- **Footer**: Discard | Save Draft | Approve & Save

**Review form sections:**
1. **Document Classification**: Document Type combobox (AI-suggested, shows confidence badge), Category (derived, read-only display)
2. **Document Details**: Title (text, AI-suggested), Description (textarea, AI-suggested), Issue Date + Expiry Date (date inputs, side-by-side), Confidentiality (select)
3. **Ownership**: Owning Company (`OwnerCompanySelect`), Owning Branch (`BranchSelect`, cascades from company)
4. **Metadata Fields**: Loaded dynamically when document type changes via `getMetadataDefinitionsForType`

**Confidence badge behavior:**
- Each field with an AI suggestion shows a `DmsAiConfidenceBadge` (High/Medium/Low/Manual Review)
- Low confidence fields show amber ring + "⚠ Needs Review" warning text
- Source snippet shows in a `Tooltip` when hovering the ℹ icon

**Processing/failed states:**
- If `intake_status` is in a processing variant: shows spinner with "AI is analyzing…" message
- If `intake_status === "failed"`: shows error panel with Retry AI + Create Manually buttons
- Re-run AI button in header resets intake_status and re-triggers the full pipeline

---

## 8. OCR/AI Flow

For Option A, the OCR step runs internally within `startAiIntakeFromUploadSession` — it is NOT a separate user-facing step.

**File processing logic:**
- **PDF**: Downloads from `dms-temp`, extracts text via `pdf-parse/lib/pdf-parse.js` (v1.1.1), stores text in `ocrText`
- **Images (JPG/PNG/WEBP/GIF)**: Downloads from `dms-temp`, base64-encodes, passes as `imageFiles[]` to AI vision model
- **Unsupported types**: Passes empty content (AI handles gracefully)
- **AI provider**: Uses `getDmsAiProvider()` same as DMS.10. Uses all active document types as classification candidates. No current type code (unknown before intake).

**OCR text is NOT stored in `dms_upload_sessions`** — it is held in memory only for the AI call. This respects the "never log OCR text" rule.

---

## 9. Approve & Save Behavior

See §5 for full step list. Key behaviors:

- **Idempotent**: If called twice (double-click), the second call finds `intake_status = approved` with `document_id` set and returns the existing document instead of creating a duplicate.
- **Transactional as possible**: If file copy to `dms-documents` fails, the `dms_documents` record is deleted and an error is returned.
- **Metadata columns**: Mapped by `fieldType` — `text/textarea` → `value_text`, `number/decimal` → `value_number`, `date` → `value_date`, `datetime` → `value_datetime`, `boolean` → `value_boolean`, `json` → `value_json`.
- **Empty values skipped**: Metadata values with empty `rawValue` are not inserted.
- **No metadata before approval**: `dms_document_metadata_values` is only written inside `approveAiIntakeAndCreateDocument`.

---

## 10. Metadata Save Behavior

Only accepted/edited metadata fields are saved. The form tracks `{ definitionId → { fieldType, rawValue } }`. On approve, only entries with non-empty `rawValue` are upserted to `dms_document_metadata_values`.

---

## 11. ERP Links Behavior

Links passed in `approveAiIntakeAndCreateDocument.links[]` are inserted to `dms_document_links`. Entity context from URL query params (e.g., `?entity_type=party&entity_id=123`) is not currently auto-populated in the intake form but the server action supports it fully — the caller can pass pre-accepted links.

---

## 12. Expiry Reminder Generation

After document creation, if `expiryDate` is provided, expiry reminders are upserted for days-before: `[90, 60, 30, 14, 7, 1]`. Uses `onConflict: "document_id,reminder_days_before"` for idempotency.

---

## 13. Manual Fallback Behavior

If the AI provider is not configured, `startAiIntakeFromUploadSession` returns `{ success: false, data: { status: "provider_not_configured" } }`. The inbox client detects this and:
1. Shows a toast: "No AI provider configured. Create the document manually instead."
2. Keeps `uploadState.phase = "ready"` so the user can still use "Attach to existing" or "Create Manually"

If AI analysis fails mid-process, the intake review page shows a "Failed" state with "Retry AI" and "Create Manually" fallback buttons.

---

## 14. Security and Privacy

- **OCR text is NEVER logged** — only held in memory during the server action
- **AI prompts are NEVER logged**
- **API keys are NEVER returned** to the client
- **Confidential documents**: Since document type is unknown before AI, intake is always permitted to start. If AI suggests HR/Legal/Executive type, the user can still approve (enforcement deferred to standard document RBAC after creation)
- **Signed URLs** for preview: 5-minute expiry, generated via `adminClient.storage.createSignedUrl`
- **No metadata written before approval** — `dms_document_metadata_values`, `dms_document_tags`, `dms_document_links` are only created in `approveAiIntakeAndCreateDocument`

---

## 15. Audit Events

All intake events use `logAudit()` with `entity_name: "dms_upload_sessions"`:

| Event | When |
|---|---|
| `ai_intake_started` | `startAiIntakeFromUploadSession` begins |
| `ai_intake_failed` (provider not configured) | `startAiIntakeFromUploadSession` → no provider |
| `ai_intake_ai_completed` | AI result stored, session → review_pending |
| `ai_intake_ai_failed` | AI call threw error |
| `ai_intake_discarded` | `discardAiIntake` |

Post-document creation events in `dms_document_events`:
- `document_created_from_ai_intake`
- `ai_intake_approved`
- `file_uploaded`
- `version_uploaded`
- `metadata_updated`

Post-document creation audit log: `logAudit(module_code: "DMS", entity_name: "dms_documents", action: "create")`.

---

## 16. Source of Truth and Rule Updates

**Updated:**
- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` — DMS.11 closure entry added as latest closed gate
- `.cursor/rules/erp-dms-ai-first-upload-standard.mdc` — Required flow updated to reflect Option A implementation

---

## 17. TypeScript/Lint/Build QA

```
npx tsc --noEmit    → Exit 0 (0 errors)
npm run build       → Exit 0, all routes compile
```

Key fixes applied during QA:
- `TooltipTrigger` — removed invalid `asChild` prop, wrapped with `<span>` instead
- `ERPCombobox.onValueChange` — uses `Number(v)` instead of `parseInt(v)` (v is `string | number | null`)
- `Select.onValueChange` — `v` is `string | null` in this shadcn version; used `if (v !== null) onChange(...)` guard
- `BranchSelect` — prop is `ownerCompanyId` not `companyId`
- `dms-ai-intake-metadata-section.tsx` `MetadataValue` — removed `definitionId` (it's the Record key, not the value)
- Review form IIFE spreads replaced with explicit JSX props to avoid TypeScript spread inference issues

---

## 18. Manual QA Checklist

- [ ] Upload PDF from `/dms/inbox`
- [ ] Click "Upload & AI Fill" — violet loading banner appears
- [ ] Intake screen opens at `/dms/intake/[sessionCode]`
- [ ] OCR/AI processing status visible (or already at review_pending)
- [ ] AI fields prefilled: document type, title, description, dates
- [ ] Confidence badges visible per field
- [ ] Low-confidence fields show amber ring + "Needs Review" warning
- [ ] User can edit all fields
- [ ] Document type change triggers metadata field reload
- [ ] Preview File generates signed URL
- [ ] Save Draft saves to `dms_intake_review_values`
- [ ] Approve & Save creates `dms_documents` row
- [ ] File moved to `dms-documents` bucket
- [ ] `dms_document_versions` v1 created
- [ ] `dms_document_files` row created
- [ ] Metadata values saved (non-empty only)
- [ ] Expiry reminders generated if expiry date provided
- [ ] AI result marked `accepted`
- [ ] Upload session: `status=completed`, `intake_status=approved`, `document_id` set
- [ ] Redirect to final document
- [ ] Manual fallback (Create Manually) still works
- [ ] No duplicate documents on repeated Approve & Save click (idempotent)
- [ ] Discard intake works, session marked `discarded`
- [ ] AI failure shows retry + manual fallback buttons
- [ ] No AI provider configured shows clear message and graceful fallback

---

## 19. Database QA Checklist

- [ ] `dms_upload_sessions.document_id` populated after approval
- [ ] `dms_upload_sessions.review_status = approved` after approval
- [ ] `dms_upload_sessions.intake_status = approved` after approval
- [ ] `dms_ai_extraction_results.upload_session_id` populated (not null for intake results)
- [ ] `dms_ai_extraction_results.document_id` populated after approval
- [ ] `dms_ai_extraction_results.ai_status = accepted` after approval
- [ ] `dms_document_metadata_values` NOT created before approval
- [ ] `dms_document_metadata_values` created after approval (for accepted non-empty fields)
- [ ] No active `dms_documents` before approval (no draft docs in repo)
- [ ] No OCR/prompt text in audit logs
- [ ] `dms_document_events` contains `document_created_from_ai_intake` and `ai_intake_approved`
- [ ] `dms_document_versions.version_number = 1`, `is_current = true`
- [ ] `dms_document_files.file_role = original`, `storage_bucket = dms-documents`
- [ ] `dms_intake_review_values` entries created on Save Draft
- [ ] `dms_expiry_reminders` created if expiry_date provided

---

## 20. Issues and Deferred Items

| Item | Status | Notes |
|---|---|---|
| Entity context auto-fill in intake form | Deferred to DMS.12 | URL `?entity_type=...&entity_id=...` params not yet parsed by intake page; server action supports links[] |
| Tag picker in intake form | Deferred | Tags saved by ID array; no UI to search/add tags in intake form yet |
| Async AI processing (background job) | Not implemented | AI runs synchronously (same as DMS.10); for large files, client may time out; implement async queue in DMS.13+ |
| Metadata field re-mapping on type change | Not implemented | When user changes type, AI-suggested field values for the OLD type are cleared; re-mapping to new type's fields by matching field_code is a future enhancement |
| Intake queue view (`/dms/inbox/review`) | Not implemented | No admin view of all pending intakes; can be added in DMS.12 |
| Confidentiality escalation for AI-suggested sensitive types | Not implemented | If AI suggests HR/Legal/Executive, a confirmation prompt could be shown before approve |

---

## 21. Recommended Next Phase

**ERP DMS.12 — Full-Text Search and Advanced Search**

DMS.12 will:
- Index OCR text for full-text search across documents
- Advanced filters: by type, category, date range, party, owner, status, expiry, metadata fields
- Search across document title, OCR text, metadata values
- Prepare groundwork for semantic/vector search in DMS.13+

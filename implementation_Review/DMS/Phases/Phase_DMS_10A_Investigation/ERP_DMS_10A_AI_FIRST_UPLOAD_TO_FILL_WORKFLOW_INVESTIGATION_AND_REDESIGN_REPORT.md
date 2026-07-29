# ERP DMS.10A — AI-First Upload-to-Fill Workflow Investigation and Redesign Report

**Phase:** ERP DMS.10A  
**Type:** Investigation and architecture recommendation only — NO implementation  
**Date:** 2026-06-15  
**Status:** CLOSED / INVESTIGATION COMPLETE  
**Author:** Cursor — from live source audit  

---

## 1. Executive Summary

The current DMS system forces users to manually fill a form **before** uploading a file and **before** AI can run. Sameer's requirement is the inverse: upload the file first, let AI read it and fill the form, then the user reviews and approves. This report audits the current workflow, identifies all gaps, and proposes the safest corrected architecture (Option B — Draft Document First) for implementation in DMS.11.

---

## 2. Sameer's Requirement Restated

```
1. User clicks Upload Document.
2. User uploads/scans a file.
3. AI reads the file (text extraction + vision).
4. AI fills the form: type, category, title, description, dates, metadata, tags.
5. User reviews AI-filled form with confidence badges.
6. User corrects only wrong or missing fields.
7. User approves.
8. System saves the final DMS document, metadata, links, expiry reminders, audit.
```

**Core rule:** AI must reduce keyboard entry. User should upload and review, not type.

---

## 3. Current DMS Workflow Audit

### 3.1 Route A — New Document from `/dms/documents/record/new`

| Step | What happens | Manual entry required? |
|---|---|---|
| 1 | User navigates to New Document | — |
| 2 | Full metadata form appears completely empty | — |
| 3 | User types title (REQUIRED) | YES — keyboard required |
| 4 | User selects Document Type (REQUIRED) | YES — combobox, no AI suggestion |
| 5 | User selects Category (REQUIRED) | YES — combobox, no AI suggestion |
| 6 | User sets status, confidentiality, dates | Optional but fully manual |
| 7 | User clicks Save → `dms_documents` created as `draft` | — |
| 8 | User navigates to Files section | — |
| 9 | User uploads file (separate step, separate screen) | — |
| 10 | User navigates to AI Analysis tab | — |
| 11 | User clicks "Run AI Analysis" | Manual trigger |
| 12 | AI runs and shows suggestions in AI Analysis tab | AI runs here — too late |
| 13 | User must manually copy AI suggestions to form | YES — no "Apply" button |

**Verdict:** This route requires 5+ manual fields filled BEFORE AI ever runs. AI runs after the document is already saved.

---

### 3.2 Route B — Upload Inbox `/dms/inbox` → Create New Document

| Step | What happens | Manual entry required? |
|---|---|---|
| 1 | User navigates to `/dms/inbox` | — |
| 2 | User drops file in dropzone | — |
| 3 | File uploads to `dms-temp` bucket, `dms_upload_sessions` created | — |
| 4 | Two buttons appear: "Attach to existing" / "Create new document" | — |
| 5 | User clicks "Create new document" | — |
| 6 | `DmsCreateDocumentFromUploadDialog` opens | — |
| 7 | Dialog shows: Title (REQUIRED), Document Type (REQUIRED), Description, Issue Date, Expiry Date | YES — still manual |
| 8 | User fills form and clicks Create | — |
| 9 | `createDocumentFromUpload` runs: creates `dms_documents`, copies file from temp → permanent, creates versions + files | — |
| 10 | User redirected to document record | — |
| 11 | User navigates to AI Analysis tab | Manual navigation |
| 12 | User clicks "Run AI Analysis" | Manual trigger |
| 13 | AI results shown in AI Analysis tab | — |
| 14 | User manually copies AI results into form fields | YES — no apply button |

**Verdict:** Slightly better than Route A (file is available sooner), but still requires title + type BEFORE AI runs. AI still runs after document creation. There is no "AI fills the form" workflow — AI only shows suggestions in a separate tab.

---

## 4. Current Upload Inbox Audit

**File:** `src/features/dms/upload/dms-upload-inbox-page-client.tsx`

The `DmsUploadInboxPageClient` component:
- Handles file upload to `dms-temp` via signed URL (correct, fast)
- Detects duplicates via SHA-256 hash (correct)
- Shows "Attach to existing" or "Create new document" after upload (correct)
- The "Create new document" dialog (`DmsCreateDocumentFromUploadDialog`) requires:
  - `title` (required, manual)
  - `document_type_id` (required, manual)
  - `description` (optional, manual)
  - `issue_date` (optional, manual)
  - `expiry_date` (optional, manual)
- **No AI is involved in the creation dialog at all**

`dms_upload_sessions` table columns (from `DmsUploadSessionRow` type):
- `id, session_code, status, original_filename, mime_type, file_size_bytes, sha256_hash`
- `temp_storage_path, is_duplicate, duplicate_document_id`
- `uploaded_by, uploaded_at, expires_at, completed_at`
- **Missing:** `document_id` (no link from session to created document)
- **Missing:** `ai_job_id` (no link from session to AI result)
- **Missing:** `intake_status` / `review_status`

---

## 5. Current OCR / AI Flow Audit

**Current flow (post-DMS.10):**

1. `dms_document_files` must exist (file must be attached to document)
2. User opens document record → AI Analysis tab
3. User clicks "Run AI Analysis"
4. `runDmsAiAnalysisForDocument(documentId)` server action:
   - Fetches all files for the document from `dms_document_files`
   - Downloads each file from `dms-documents` bucket (admin client)
   - Extracts PDF text OR base64-encodes images
   - Calls AI provider
   - Saves result to `dms_ai_extraction_jobs` + `dms_ai_extraction_results`
5. AI results shown in AI Analysis tab (suggestions only)
6. No "apply suggestions" button — user manually fills fields

**Is AI review integrated into upload flow?** No. Completely separate.  
**Is OCR automatic after upload?** No. Manual trigger.  
**Is AI automatic after OCR?** No. Manual trigger.  
**Are AI suggestions shown in an approval screen?** No. In a tab inside the document record only.  

---

## 6. Gap Analysis

| Gap | Severity | Impact |
|---|---|---|
| Title is required before upload in both routes | HIGH | Blocks AI-first flow |
| Document Type is required before upload | HIGH | Blocks AI-first flow |
| AI only runs after document is created | HIGH | AI can't help during creation |
| No "Apply AI suggestion" button | HIGH | User must manually copy suggestions |
| No AI review screen in upload flow | HIGH | Upload-to-fill not supported |
| AI triggered manually (not automatic) | MEDIUM | Extra clicks |
| No intake_status / review_status on upload sessions | MEDIUM | Can't track intake state |
| No link from upload_session to created document | MEDIUM | No traceability |
| `DmsCreateDocumentFromUploadDialog` has no AI integration | HIGH | Main creation path bypasses AI |

**Current workflow matches Sameer's requirement: NO.**  
The system was built sequentially (metadata first → upload second → AI third). The target is inverted (upload first → AI second → review third → save fourth).

---

## 7. Option A — Upload Session First, Document Created After Approval

**Flow:**
```
Upload file
→ dms_upload_sessions (file in dms-temp)
→ OCR + AI runs on temp file
→ AI extraction result linked to upload_session_id (NOT document_id)
→ AI Review screen (no dms_documents record yet)
→ User approves
→ createDocumentFromAiReview() creates dms_documents
→ All metadata, files, links, expiry reminders saved
```

**Pros:**
- Cleanest from user perspective
- No incomplete document records in the system
- True AI-first intake — the document only exists if approved

**Cons:**
- Significant refactor: `dms_ai_extraction_jobs.document_id` would be null during intake
- AI server action must be adapted to run on `upload_session_id`, not `document_id`
- New server action needed: `createDocumentFromAiReview()`
- New AI Review route/page needed (no document exists yet to reference)
- Risk: complex rollback if user abandons mid-review

**Risk level: HIGH**

---

## 8. Option B — Draft Document Created Immediately, Finalized After Approval

**Flow:**
```
Upload file
→ dms_upload_sessions (file in dms-temp)
→ Auto-create dms_documents with status="draft" and temp title from filename
→ Attach file (dms-temp → dms-documents, create versions + files)
→ Auto-trigger AI analysis on the draft document
→ Redirect to AI Review screen (= specialized view of document record)
→ AI-filled form shown with confidence badges
→ User reviews, corrects
→ User approves → status becomes "active" or "pending_review"
→ Accepted metadata, links, expiry reminders saved
→ Audit event written
```

**Pros:**
- Reuses all existing DMS.4/DMS.5/DMS.9/DMS.10 server actions
- `runDmsAiAnalysisForDocument` already works on document ID
- `dms_documents` already supports `status: "draft"` 
- Minimal schema changes needed
- Lower risk — incremental improvement of the existing Inbox flow
- All existing AI infrastructure stays intact

**Cons:**
- Creates draft records that users might abandon (need cleanup)
- Needs `draft` + `pending_ai_review` status tracking
- The creation dialog must change: title becomes auto-generated (not required), type/category pre-filled by AI instead of user

**Risk level: LOW–MEDIUM**

---

## 9. Recommendation — Option B

**Option B — Draft Document First** is recommended for ALGT now.

**Rationale:**
1. DMS.4/5/9/10 infrastructure is solid and tested. Option A would require discarding or deeply refactoring it.
2. The existing `runDmsAiAnalysisForDocument` already downloads files and runs the full OCR+AI pipeline in one action — this is exactly what DMS.11 needs.
3. Adding `status: "pending_ai_review"` is a low-risk status extension.
4. The inbox "Create new document" dialog needs to be eliminated or replaced with a one-click "Upload and Let AI Fill" flow — not a full refactor.
5. The final "AI Review" screen can reuse the existing `DmsDocumentRecordForm` overview section — pre-populated with AI suggestions shown as editable fields with confidence badges.

---

## 10. Target AI-First User Journey (DMS.11 Target State)

### Entry point

Replace the Upload Inbox "Create new document" dialog with a single button:

```
"Upload & AI Fill"
```

### Revised step-by-step journey

```
Step 1 — Upload File
  - User drops file on Inbox dropzone (same as today)
  - File uploads to dms-temp (same as today)
  - Instead of showing "Create new document" dialog:
    → Show a single "Upload & AI Fill" button

Step 2 — Draft Created Automatically
  - User clicks "Upload & AI Fill"
  - System creates dms_documents with:
      status = "draft"
      title  = original_filename (stripped of extension, max 200 chars)
      document_type_id = NULL (to be filled by AI)
      category_id = NULL (to be filled by AI)
  - File is copied from dms-temp to dms-documents bucket
  - dms_document_versions v1 + dms_document_files created
  - upload_session marked completed with document_id

Step 3 — AI Analysis Auto-Triggered
  - runDmsAiAnalysisForDocument(documentId) called automatically
  - AI processes the file (PDF text + vision for images)
  - dms_ai_extraction_jobs + dms_ai_extraction_results created
  - On completion → redirect to AI Review screen

Step 4 — AI Review Screen
  - Route: /dms/documents/record/[id]?mode=ai-review
  - OR: /dms/ai-review/[id]  (new dedicated route)
  - Left panel (optional, future): file preview
  - Right panel: form fields pre-populated with AI suggestions
      Document Type   [AI: Trade License] [confidence: High 94%] [Accept | Edit]
      Category        [AI: Legal / Compliance] [confidence: Medium 78%] [Accept | Edit]
      Title           [AI: Trade License — Alliance Gulf] [confidence: High 91%] [Edit]
      Issue Date      [AI: 2026-01-15] [confidence: High 96%] [Accept | Edit]
      Expiry Date     [AI: 2027-01-14] [confidence: High 95%] [Accept | Edit]
      Confidentiality [AI: internal] [confidence: Medium 72%] [Accept | Edit]
      Metadata fields [...] [per-field confidence]
  - Footer: [Save Draft] [Approve & Save] [Re-run AI] [Discard]

Step 5 — Approve & Save
  - User clicks "Approve & Save"
  - Accepted document type / category / title / dates → update dms_documents
  - Accepted metadata fields → insert dms_document_metadata_values
  - Accepted tags → insert dms_document_tags
  - Generate expiry reminders if expiry_date set
  - Mark dms_ai_extraction_results.ai_status = "accepted"
  - Set dms_documents.status = "active" (or "pending_review" if approval workflow needed)
  - Write audit event: "document_ai_reviewed_and_approved"
  - Redirect to final document record
```

---

## 11. Required Screen Redesign

### Current screens affected

| Screen | Current state | Required change |
|---|---|---|
| `/dms/inbox` | Upload → Manual dialog | Add "Upload & AI Fill" button; keep existing "Attach to existing" |
| `DmsCreateDocumentFromUploadDialog` | Requires title + type | Either replace with AI-first flow or make all fields optional (AI fills later) |
| `/dms/documents/record/[id]` | AI in separate tab | AI Review mode: fields shown with AI values + confidence badges |
| AI Analysis tab | Shows suggestions, no apply | Add "Apply to Form" per-field or bulk apply |

### New screen required

**AI Review Mode for `/dms/documents/record/[id]?mode=ai-review`**

Layout:
```
Header:
  "AI-Assisted Document Review"
  Document No (auto-generated)
  Status badge: "Pending AI Review"
  [Re-run AI] [Save Draft] [Approve & Save]

Body — Overview section in AI Review mode:
  Document Type    ← pre-filled from AI, editable ERPCombobox, confidence badge
  Category         ← pre-filled from AI, editable ERPCombobox, confidence badge
  Title            ← pre-filled from AI, editable Input, confidence badge
  Description      ← pre-filled from AI, editable Textarea
  Issue Date       ← pre-filled from AI, editable date Input
  Expiry Date      ← pre-filled from AI, editable date Input
  Confidentiality  ← pre-filled from AI
  Owning Company   ← from session context / user profile
  Related Party    ← from session entity context (party linked at upload)

  Metadata section:
    Per-field AI suggestions with confidence badges
    Each field is an editable control pre-populated by AI
```

---

## 12. Required Database / Schema Changes

### To `dms_upload_sessions`

```sql
ALTER TABLE public.dms_upload_sessions
  ADD COLUMN IF NOT EXISTS document_id BIGINT
    REFERENCES public.dms_documents(id) ON DELETE SET NULL;
```

This allows tracing which document was created from an upload session, and linking the AI results back to the intake session.

### To `dms_documents` — status values

Current check constraint statuses (from DMS.2 migration):
```
draft | pending_review | approved | rejected | active | expired | archived | superseded
```

Add `pending_ai_review`:
```sql
ALTER TABLE public.dms_documents
  DROP CONSTRAINT IF EXISTS dms_documents_status_check;

ALTER TABLE public.dms_documents
  ADD CONSTRAINT dms_documents_status_check
  CHECK (status IN (
    'draft', 'pending_ai_review', 'pending_review',
    'approved', 'rejected', 'active', 'expired', 'archived', 'superseded'
  ));
```

This allows documents created by the AI intake flow to be in `pending_ai_review` until the user approves them.

### To `dms_ai_extraction_jobs`

No structural change needed. The existing `document_id` FK covers all cases once the draft document is created before AI runs.

### New table — NOT needed

`dms_intake_cases` is not required. The combination of `dms_upload_sessions` (with `document_id`) + `dms_documents` (with `status = "pending_ai_review"`) + `dms_ai_extraction_jobs` (with existing `document_id`) is sufficient.

---

## 13. Required Server Action Changes

### New action: `createDraftDocumentFromUpload`

```typescript
// Creates a minimal draft document from an upload session.
// title = original_filename (stripped).
// document_type_id = null, category_id = null.
// status = "pending_ai_review"
// Copies file from dms-temp → dms-documents.
// Marks upload_session.document_id = newDocId.
// Returns { documentId, documentNo }
export async function createDraftDocumentFromUpload(uploadSessionId: number): Promise<ActionResult<{...}>>
```

### Modified action: `createDocumentFromUpload` (existing)

Update to:
1. Accept `documentTypeId = null` / `categoryId = null` (make non-required)
2. Accept `status = "pending_ai_review"` instead of forcing `"draft"`
3. Set `upload_session.document_id` after creation

### Modified action: `runDmsAiAnalysisForDocument` (existing)

Already works. No structural change needed. Will be called automatically after `createDraftDocumentFromUpload`.

### New action: `applyAiResultToDocument`

```typescript
// Applies accepted AI suggestions to dms_documents + metadata values.
// Sets status = "active" (or "pending_review" for approval workflows).
// Marks dms_ai_extraction_results.ai_status = "accepted".
// Generates expiry reminders if expiry_date is set.
// Writes audit event: "document_ai_reviewed_and_approved".
export async function applyAiResultToDocument(
  documentId: number,
  aiResultId: number,
  accepted: { documentTypeId?: number; categoryId?: number; title?: string; ... },
  metadataValues: { fieldId: number; value: string }[]
): Promise<ActionResult>
```

---

## 14. Required Phase Plan Update

| Phase | Previous plan | Revised plan |
|---|---|---|
| DMS.11 | AI Review Queue and Confirm-Save Workflow | AI-First Upload-to-Fill → Review → Approve → Save |
| DMS.12 | (unplanned) | Full-Text Search and Advanced Search |

### DMS.11 — Revised Scope

**Title:** AI-First Upload-to-Fill Review and Confirm-Save Workflow

**Scope:**
1. DB: Add `document_id` to `dms_upload_sessions` + add `pending_ai_review` status to `dms_documents`
2. New server action: `createDraftDocumentFromUpload` (minimal draft, auto-title from filename, status=`pending_ai_review`)
3. Update inbox "Create new document" button → "Upload & AI Fill" (one-click, no dialog)
4. After draft creation: auto-trigger `runDmsAiAnalysisForDocument`
5. New AI Review UI inside the document record form:
   - `mode=ai-review` → shows form pre-populated with AI suggestions
   - Per-field confidence badges next to every AI-suggested value
   - Fields are editable (user can correct)
   - "Approve & Save" button calls `applyAiResultToDocument`
6. Old "Create new document" dialog remains available as fallback for users who want manual entry

**What DMS.11 must NOT do:**
- Auto-save without user review
- Remove manual creation path
- Change AI confidence scoring logic (already in DMS.10)

### DMS.11A — Recommendation

Split is NOT recommended. DMS.11 as a single combined phase (upload → AI → review → approve) is the right scope. It is cohesive and deliverable as one phase. Splitting into "DMS.11 review only" + "DMS.11A make inbox AI-first" would create awkward half-finished states.

---

## 15. DMS.11 Revised Scope Summary

```
DB changes:
  - dms_upload_sessions: ADD document_id BIGINT FK
  - dms_documents: ADD status value "pending_ai_review"

New server actions:
  - createDraftDocumentFromUpload (replaces dialog-based createDocumentFromUpload for AI flow)
  - applyAiResultToDocument (confirm-save: writes metadata, changes status, writes audit)

Modified UI:
  - DmsUploadInboxPageClient: add "Upload & AI Fill" button (alongside existing actions)
  - DmsCreateDocumentFromUploadDialog: keep as fallback, make type/category optional
  - DmsDocumentRecordForm: add ai-review mode (pre-populated fields + confidence badges)
  - New ERPRecordSectionPanel for "AI Review" section in record form

Modified server action:
  - createDocumentFromUpload: accept null type/category, accept pending_ai_review status

No changes to:
  - runDmsAiAnalysisForDocument (already works perfectly)
  - AI provider abstraction (DMS.10)
  - DMS admin masters (DMS.3)
  - OCR tab (can remain; AI Review is the primary path now)
```

---

## 16. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| AI fails (no provider configured) | Medium | Show manual fallback form; never block document creation |
| AI returns low-confidence results | Medium | User reviews all fields; confidence badges make uncertain fields obvious |
| User abandons review screen, draft document left in system | Medium | Cleanup job deletes `pending_ai_review` docs older than 7 days with no files; or user cancels explicitly |
| AI analysis takes too long (large files) | Low | Show loading state; user can wait or use manual path |
| Missing required fields after AI review | Low | "Approve & Save" validates type + category required; shows inline error |
| Status check constraint change breaks existing data | Low | `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT` is safe on Postgres; no existing rows have `pending_ai_review` |

---

## 17. Acceptance Criteria for DMS.11

```
1. User can upload a file and reach AI-pre-filled review form in ≤ 3 clicks.
2. No keyboard entry required before AI fills the form.
3. AI-filled fields show confidence badges.
4. All fields are editable before approval.
5. "Approve & Save" writes final document, metadata, expiry reminders, audit.
6. AI suggestions are NEVER auto-saved without user action.
7. Manual creation path (existing dialog) remains as fallback.
8. Status "pending_ai_review" used for draft documents in AI intake flow.
9. dms_upload_sessions.document_id links session to created document.
10. tsc + build pass.
11. TS: 0 errors.
```

---

## 18. Hard Rejection Criteria for DMS.11

```
1. Implementing AI auto-save without review → REJECT
2. Removing manual document creation path → REJECT
3. Requiring user to fill type/category before AI runs → REJECT
4. Not writing audit event on approval → REJECT
5. Allowing partial AI apply without user confirmation → REJECT
```

---

## 19. Next Cursor Prompt Recommendation

When Sameer approves DMS.11, use this prompt:

```
ERP DMS.11 — AI-First Upload-to-Fill Review and Confirm-Save Workflow

Read:
  - .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md
  - implementation_Review/ERP_DMS_10A_AI_FIRST_UPLOAD_TO_FILL_WORKFLOW_INVESTIGATION_AND_REDESIGN_REPORT.md
  - docs/standards/ERP_DMS_AI_FIRST_UPLOAD_TO_FILL_WORKFLOW_STANDARD.md

Implement:
  1. Migration: add document_id to dms_upload_sessions + pending_ai_review status to dms_documents
  2. New server action: createDraftDocumentFromUpload
  3. New server action: applyAiResultToDocument
  4. Update createDocumentFromUpload to accept null type/category + pending_ai_review status
  5. Modify DmsUploadInboxPageClient: add "Upload & AI Fill" button
  6. Modify DmsCreateDocumentFromUploadDialog: make type/category optional (AI fills)
  7. Add AI Review mode to DmsDocumentRecordForm (pre-populated fields + confidence badges + Approve & Save footer)
  8. Run tsc + build
  9. Update SOT + create implementation report
```

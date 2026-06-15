# ERP DMS 13 — Multi-File Batch Upload → Draft Intake Queue (Planning)

**Document:** `implementation_Review/ERP_DMS_13_MULTI_FILE_BATCH_UPLOAD_TO_DRAFT_INTAKE_PLAN.md`
**Status:** 📐 **PLAN ONLY — AWAITING SAMEER/DINA APPROVAL.** No code, no migration executed.
**Author:** Cursor (Lead Engineer)
**Date:** 2026-06-15
**Module:** DMS (Document Management System)
**Depends on:** DMS.5 (Upload Inbox), DMS.9 (OCR), DMS.10 (AI Classification), DMS.11 (AI-First Single-File Intake), DMS.12.1 (Content Text), SETTINGS.1 (AI provider)
**Governing standard:** `docs/standards/ERP_DMS_AI_FIRST_UPLOAD_TO_FILL_WORKFLOW_STANDARD.md`

---

## 1. Objective & User Story

> **As a DMS user**, I want to upload **many files at once** (e.g. 10 Emirates IDs), have the AI read each one and create a **separate draft document** pre-filled with the extracted data, so I can then **review them one-by-one**, correct any data, and **approve each draft individually** when satisfied.

Concretely (one-by-one approval is the governing rule — see §21):

1. User selects **multiple files**.
2. System **uploads and AI-processes each file independently**.
3. System creates **one `pending_ai_review` draft per file**.
4. The **Batch Review Queue** lists all drafts in the batch with their AI status, confidence, and per-draft actions.
5. User **opens one draft** in the individual review screen.
6. User **reviews and edits** the AI-filled fields.
7. User clicks **Approve & Save** for **that single draft only** → document becomes `active`.
8. User returns to the queue (optionally via **Review Next Pending Draft**) and reviews the next draft.
9. **No other draft is approved automatically.** There is no bulk approval, no approve-selected, no approve-all, and no confidence-based auto-approval.

This is the **batch / draft-first** extension of the existing single-file "Upload & AI Fill" flow (DMS.11), which today creates **no** document until the user approves a single file. The batch flow is **added beside** the single-file flow and must not break it (see §10.2 in the update prompt / §22 here).

---

## 2. Scope

### In scope
- Multi-file selection in the Upload Inbox dropzone (drag-drop + browse).
- A new lightweight **batch** grouping so the N files uploaded together can be tracked and reviewed as a unit.
- Per-file AI intake that **creates a draft document** (`pending_ai_review`) with AI-suggested core fields + persisted field-level suggestions.
- A **Batch Review Queue** UI (list of the batch's drafts with status/confidence/per-draft actions).
- **Individual draft review** inside the existing review screen.
- **Individual Approve & Save only** — one draft at a time.
- **Discard one draft at a time.**
- **Re-run AI one draft at a time.**
- A **Review Next Pending Draft** helper (opens the next pending draft in the review screen; never approves).
- Entity-context carry-through (so a batch uploaded from a Party record links every resulting document to that party — same as today's single flow).
- Feature flag gating.

### Out of scope (explicitly deferred / prohibited)
- **Bulk approval is not allowed.**
- **Approve selected is not allowed.**
- **Approve all valid is not allowed.**
- **Automatic approval based on AI confidence is not allowed.**
- **Bulk approval must not be added in future** unless Sameer explicitly changes this governance rule (see §21).
- `pgvector` / embeddings / semantic search (DMS 12.5 — now implemented; not part of this phase).
- Background/queued asynchronous processing workers (we will use **client-orchestrated sequential** calls — see §16).
- New AI provider capabilities or prompt redesign (reuse DMS.10/11 `extractFileContent` + provider).
- Any change to the single-file intake screen's contract beyond what is shared.
- ZIP archive upload / folder upload / email-attachment ingestion.
- OCR engine changes.

---

## 3. Alignment With ERP Rules & Standards (non-negotiable)

This plan is written to comply with the **Source of Truth** (`.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` §6.2) and existing standards. Key obligations:

| Rule | How this plan complies |
|---|---|
| **BIGINT PKs only** | New `dms_upload_batches.id` is `BIGINT GENERATED ALWAYS AS IDENTITY`. |
| **RLS enabled + forced** on all ERP tables | New table gets `ENABLE` + `FORCE ROW LEVEL SECURITY` with the same policy shape as `dms_upload_sessions`. |
| **No schema changes without phase approval** | Migration here is **REVIEW-ONLY**. Nothing is applied until this plan is approved. |
| **Server mutations** = `getAuthContext()` + `hasPermission()` + Zod + `logAudit()` + `revalidatePath()` | Every new action follows this contract (§10). |
| **Global numbering** for human references | `document_no` continues via `generate_next_reference_number('MASTER_DMS_DOCUMENT')`. Batch code uses a random opaque code like `session_code` (no new numbering rule required). |
| **No hardcoded dropdowns** | Review form reuses `ERPCombobox`-backed selects (document type, category, party). |
| **Workspace form standard (UI.4C/4E.2)** | Draft review reuses `ERPRecordWorkspaceForm` / existing intake screen; unsaved-draft preservation honored. |
| **AI-First Upload-to-Fill Standard** | No AI value is committed to an **active** document without explicit user **Approve & Save**. Confidence badges shown. OCR text / prompts / raw AI responses never logged. API keys never returned. |
| **Every phase produces a report** | A closure report will be created on completion and the SOT updated. |

### Specific AI-First standard reconciliation

The standard (§7) already describes `createDraftDocumentFromUpload()` producing a document with `status = "pending_ai_review"`, AI filling it, and the user approving it to `active`. **DMS.11 chose the no-document-until-approve variant (Option A).** This plan implements the **draft-first variant** the standard anticipated, applied in **batch** — fully consistent with the documented status model (§3 of the standard) and the prohibited-patterns list (§6). The only nuance: AI-suggested values are written to the **draft** document and to `dms_intake_review_values` (field-level), which is permitted because the document is `pending_ai_review` (not `active`) and nothing reaches an active document or `dms_document_metadata_values` until the user approves.

---

## 4. Current Architecture (what already exists — reuse, don't rebuild)

| Concern | Existing asset | Reuse plan |
|---|---|---|
| Single-file upload + signed URL + SHA-256 dedupe | `createDmsUploadSession()` in `upload-sessions.ts` | Wrap/loop for batch; keep dedupe per file. |
| Temp storage | `dms-temp` bucket, `sessions/{code}/{file}` path | Unchanged. Batch files keyed under their own session codes. |
| Content extraction (PDF text/vision, images, DOCX, XLSX) | `extractFileContent()` (used in `ai-intake.ts`) | Reuse verbatim per file. |
| AI provider abstraction | `getDmsAiProvider()`, `OpenAiDmsAdapter` | Reuse. |
| Single-file AI intake | `startAiIntakeFromUploadSession()` | Refactor shared core into a helper; add a draft-creating variant. |
| AI suggestion storage | `dms_ai_extraction_results` (+ `dms_ai_extraction_jobs`), `upload_session_id` FK | Reuse per file. |
| Field-level review draft persistence | `dms_intake_review_values` table + `saveAiIntakeDraft()` | Reuse to store AI-suggested field values per draft. |
| Single-file review screen | `/dms/intake/[sessionCode]` + `dms-ai-intake-page-client.tsx` | Reuse for per-draft review; or document record form (decision §8). |
| Approve → create document | `approveAiIntakeAndCreateDocument()` | Refactor to "finalize existing draft" path (see §10). |
| Inbox UI | `dms-upload-inbox-page-client.tsx`, `dms-upload-dropzone.tsx`, `dms-upload-session-table.tsx` | Extend dropzone to multi-file; add batch panel. |
| Sessions schema | `dms_upload_sessions` already has `document_id, ai_job_id, ai_result_id, intake_status, review_status, reviewed_by, discarded_at, discard_reason` | Add only `batch_id`. |
| Document status | `dms_documents.status` — **no DB CHECK constraint** (verified live) | `"pending_ai_review"` and `"draft"` already usable; no constraint migration needed. |

**Key finding:** the schema is already ~90% ready. The single missing structural piece is a **batch grouping**.

---

## 5. Gap Analysis

| Gap | Needed change |
|---|---|
| Dropzone accepts only one file | Add `multiple` mode + per-file list UI + per-file hashing. |
| No way to group files uploaded together | New `dms_upload_batches` table + `dms_upload_sessions.batch_id`. |
| Intake never creates a document (Option A) | New per-file action that creates a **draft** document and pre-fills AI fields. |
| No batch review queue | New route + client to list a batch's drafts and act on them. |
| Approve assumes "create new doc" | Refactor approve to **finalize an existing draft** (idempotent, draft→active). |
| Documents list would show drafts mixed in | Add `pending_ai_review` filtering + a draft badge (mostly already supported by status filters). |
| Long multi-file AI runtime vs. server action timeout | Client-orchestrated sequential per-file calls with progress (no single long action). |

---

## 6. Proposed UX Flow

```
┌─ Upload Inbox ──────────────────────────────────────────────┐
│ [ Dropzone: drag/drop or browse — MULTIPLE files allowed ]   │
│                                                              │
│ Selected files (10):                                         │
│   • emirates_id_01.pdf   2.0 MB   ✓ hashed                   │
│   • emirates_id_02.jpg   1.4 MB   ✓ hashed   ⚠ duplicate     │
│   • ...                                                      │
│   [ Upload & AI Fill All ]   [ Clear ]                       │
└──────────────────────────────────────────────────────────────┘
        │  (per file, sequential, with progress)
        ▼
  Uploading 3/10…  →  AI analyzing 3/10…  →  Draft created 3/10…
        │
        ▼
┌─ Batch Review Queue  (batch ALGT-…/ "10 files")─────────────┐
│  #  Title (AI)            Type (AI)     Conf.  Status   Act. │
│  1  Resume — J. Wanzala   CV            high   draft   [Review & Approve][Discard][Re-run AI]
│  2  Emirates ID — A. Ali  Emirates ID   high   draft   [Review & Approve][Discard][Re-run AI]
│  3  (low confidence)      —             low    draft   [Review & Approve][Discard][Re-run AI]⚠
│  ...                                                         │
│  [ Review Next Pending Draft ]   [ Refresh ]                 │
└──────────────────────────────────────────────────────────────┘
        │  "Review & Approve" OPENS the individual review screen
        │  (it does NOT approve from the queue)
        ▼
  Edit fields → Approve & Save (this one draft only) → status = active → row turns green
        │
        ▼
  Return to queue → review the next draft individually
```

**The Batch Review Queue is a control panel and progress tracker, not an approval shortcut.** Every `Review & Approve` action opens the individual review screen; approval happens there, for one draft only.

Copy standards (from the AI-First standard §8): primary action label **"Upload & AI Fill"** (here pluralized **"Upload & AI Fill All"**), per-draft **"Review & Approve"** (opens the review screen) then **"Approve & Save"** inside it, **"Discard"**, **"Re-run AI"**, **"Review Next Pending Draft"**, **"Create Manually"** remains the fallback. There is no **"Approve all valid"** button.

---

## 7. State / Status Model

### Document (`dms_documents.status`)
- `pending_ai_review` — draft created by batch intake, AI-filled, awaiting human approval.
- `active` — approved via Approve & Save.
- (existing values unchanged: `draft`, `pending_review`, `approved`, `rejected`, `expired`, `archived`, `superseded`.)

### Upload session (`dms_upload_sessions.intake_status`) — existing vocabulary reused
`uploaded → ocr_processing → ai_processing → review_pending → approved | discarded | failed`

For draft-first, on draft creation we set `intake_status = "review_pending"`, `document_id = <draft>`, and the document carries `pending_ai_review`. On approval: `intake_status = "approved"`, document `active`.

### Batch (`dms_upload_batches.status`) — new
- `processing` — files still being uploaded/AI-analyzed.
- `ready_for_review` — all files processed (each draft or failed).
- `partially_approved` — some drafts approved, some pending.
- `completed` — all drafts approved or discarded.
- `cancelled` — batch abandoned.

---

## 8. Design Decisions (recommended option first)

### D1 — How is a draft reviewed? **(RECOMMENDED: reuse the existing `/dms/intake/[sessionCode]` review screen, backed by a created draft document)**
- **Option A (recommended):** Keep the rich intake review screen (confidence badges, source snippets, low-confidence highlighting — already built for DMS.11) but have it operate on a **draft that already exists**. Approve finalizes the draft (draft→active) instead of creating from scratch. *Pros:* best UX, satisfies AI-First standard §4 fully, minimal new UI. *Cons:* requires refactoring `approveAiIntakeAndCreateDocument` into "finalize draft".
- **Option B:** Review via the standard `ERPRecordWorkspaceForm` document record (already shows AI Analysis tab). *Pros:* one form to maintain. *Cons:* no inline confidence badges on each field; weaker alignment with AI-First §4.
- **Decision needed from Sameer/Dina.**

### D2 — Batch grouping storage **(RECOMMENDED: new `dms_upload_batches` table + `batch_id` FK)**
- Cleaner than a free-text tag column; supports batch status, counts, audit, and the review-queue route. Lightweight (≤10 columns).

### D3 — Processing model **(RECOMMENDED: client-orchestrated sequential per-file calls)**
- Avoids a single multi-minute server action (Next.js/Vercel-style timeout risk). Each file = one ~10–30s call. UI shows `n/total` progress. See §16.

### D4 — Max files per batch **(RECOMMENDED: 10)**
- **Recommended v1 cap: 10 files per batch.** This can be increased later after UAT confirms AI cost, runtime, accuracy, and review workload.
- Reason: keeps AI cost controlled, keeps review workload manageable, easier to debug early batch behaviour, and reduces timeout/progress complexity. Configurable constant; dropzone rejects beyond the cap with a clear message.

### D5 — Do we pre-write AI core fields onto the draft document? **(RECOMMENDED: yes, core fields only)**
- Write `title`, `document_type_id`, `category_id`, `issue_date`, `expiry_date`, `confidentiality_level` to the **draft** doc so the review form is pre-populated and the queue is readable. **AI metadata values stay in `dms_intake_review_values` (review/draft storage)** until the user approves the individual draft — never written to `dms_document_metadata_values` (active metadata) for a non-approved doc (AI-First §6).

### D6 — Approval model: one-by-one only (Sameer decision)

Bulk approval is not allowed.

Even if AI confidence is high and validation passes, every draft must be opened in the review screen and approved individually by the user.

Reason:
- Prevents accidental activation of wrong AI extractions
- Protects Emirates ID, passport, HR, legal, medical, compliance, and project documents
- Keeps the human accountable for each active document
- Ensures each document has its own clear approval audit trail
- Avoids creating many active documents with wrong metadata in one mistake

The Batch Review Queue may provide:
- Review button per draft
- Review Next Pending Draft button
- status filters
- progress indicators
- discard one draft
- re-run AI for one draft

The Batch Review Queue must not provide:
- Approve all
- Approve selected
- Approve high-confidence
- automatic activation
- direct row-level approval without opening the review screen

---

## 9. Database Changes (REVIEW-ONLY — not executed until approved)

### 9.1 New table `dms_upload_batches`
```sql
CREATE TABLE IF NOT EXISTS public.dms_upload_batches (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_code         TEXT NOT NULL UNIQUE,
  status             TEXT NOT NULL DEFAULT 'processing'
                       CHECK (status IN ('processing','ready_for_review',
                                         'partially_approved','completed','cancelled')),
  total_files        INTEGER NOT NULL DEFAULT 0 CHECK (total_files >= 0),
  processed_files    INTEGER NOT NULL DEFAULT 0 CHECK (processed_files >= 0),
  approved_files     INTEGER NOT NULL DEFAULT 0 CHECK (approved_files >= 0),
  failed_files       INTEGER NOT NULL DEFAULT 0 CHECK (failed_files >= 0),
  -- optional entity-context carry-through (mirror inbox behavior)
  entity_type        TEXT NULL,
  entity_id          BIGINT NULL,
  created_by         BIGINT NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ NULL
);

ALTER TABLE public.dms_upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_upload_batches FORCE ROW LEVEL SECURITY;

-- Policies mirror dms_upload_sessions: SELECT for dms.documents.view/dms.admin,
-- INSERT/UPDATE for dms.documents.upload/dms.admin (uploaded scope or admin).
-- (Full policy SQL drafted in the migration file at implementation time.)

CREATE INDEX IF NOT EXISTS idx_dms_upload_batches_created_by
  ON public.dms_upload_batches (created_by);
CREATE INDEX IF NOT EXISTS idx_dms_upload_batches_status
  ON public.dms_upload_batches (status) WHERE deleted_at IS NULL;
```

### 9.2 Alter `dms_upload_sessions`
```sql
ALTER TABLE public.dms_upload_sessions
  ADD COLUMN IF NOT EXISTS batch_id BIGINT NULL
    REFERENCES public.dms_upload_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dms_upload_sessions_batch
  ON public.dms_upload_sessions (batch_id) WHERE batch_id IS NOT NULL;
```

### 9.3 No change required to `dms_documents.status`
Verified live: there is **no CHECK constraint** on `dms_documents.status`, so `pending_ai_review` is already storable. (Only `ai_summary_status` has a CHECK.)

### 9.4 Feature flag
Insert one `erp_ai_feature_flags` row, e.g. `DMS_BATCH_INTAKE`, `ON CONFLICT DO NOTHING`. **Recommended default:** enabled for **admin/UAT testing only** at first, or **inserted disabled** by default if the system does not yet support user-level feature rollout. Do not expose batch upload broadly before UAT.

> Migration file name (when approved): `supabase/migrations/2026XXXXXXXXXX_erp_dms_13_batch_upload_intake.sql`. A **review-only** copy will first be placed in `implementation_Review/sql_review/` per the established pattern (cf. DMS 12.0 cleanup SQL).

---

## 10. Server Action Contracts (new file `src/server/actions/dms/batch-intake.ts`)

All actions: `"use server"`, `getAuthContext()`, `hasPermission()`, Zod input validation, `logAudit()` (no OCR text / prompts / AI raw output), `revalidatePath("/dms/inbox")`.

### `createDmsUploadBatch(input)`
- **Input:** `{ files: { original_filename, mime_type, file_size_bytes, sha256_hash }[] (1..MAX), entityType?, entityId? }`
- **Permission:** `dms.documents.upload` or `dms.admin`.
- **Does:** creates `dms_upload_batches` (status `processing`, `total_files`), then one `dms_upload_sessions` per file (reusing the existing dedupe + signed-URL logic), each with `batch_id`.
- **Returns:** `{ batchId, batchCode, sessions: { sessionId, sessionCode, signedUrl, token, path, isDuplicate, duplicateDocument }[] }`
- **Note:** mirrors `createDmsUploadSession` per file; client uploads each via `uploadToSignedUrl` exactly as today.

### `startAiIntakeAndCreateDraft(input)`
- **Input:** `{ uploadSessionId, allowDuplicate? }`
- **Permission:** `dms.documents.upload` or `dms.admin`.
- **Does (per file):**
  1. Reuse the shared intake core (extracted from `startAiIntakeFromUploadSession`): download from `dms-temp` → `extractFileContent()` → AI structured extraction → store `dms_ai_extraction_jobs` + `dms_ai_extraction_results` (with `raw_ocr_text`, `upload_session_id`).
  2. Resolve AI-suggested document type/category to IDs where possible (reuse name-match logic).
  3. `generate_next_reference_number('MASTER_DMS_DOCUMENT')` → `document_no`.
  4. Insert `dms_documents` with `status = "pending_ai_review"`, core AI fields pre-filled (title, type, category, dates, confidentiality), `owner_user_id`, entity-context (if any).
  5. Persist field-level AI suggestions + confidence to `dms_intake_review_values`.
  6. Copy file `dms-temp → dms-documents`, create `dms_document_versions` v1 + `dms_document_files` (same as approve path today). *(Decision D7 below.)*
  7. Set session `document_id`, `intake_status = "review_pending"`, `review_status = "pending"`; bump batch `processed_files`.
  8. Write `content_text` via `writeDocumentContentTextSystem` (source `ai_intake`) and OCR-complete flags (the fix already in `ai-intake.ts`).
- **Returns:** `{ documentId, documentNo, status, confidence }`
- **Failure isolation:** on error, set session `intake_status = "failed"`, bump batch `failed_files`, return error — **the client continues with the next file.**

> **Decision D7 — copy file to `dms-documents` at draft creation vs. at approval.**
> **Recommended:** copy at **draft creation** (so the draft is a real, viewable document with its file/version). *Alternative:* keep file in `dms-temp` until approval (cheaper if many drafts are discarded) — more bookkeeping. Discarding a draft soft-deletes the draft document and handles file rows/storage according to the **approved DMS delete standard** (see `discardDraftIntake` below). **Approval needed.**

### `finalizeDraftIntake(input)`  *(refactor of `approveAiIntakeAndCreateDocument` — see §22 backward-compatibility rule)*
- **Input:** `{ uploadSessionId | documentId, title, documentTypeId, categoryId, description?, issueDate?, expiryDate?, confidentialityLevel?, owningCompanyId?, owningBranchId?, partyId?, metadataValues[], tagIds[], links[], aiResultId? }`
- **Approves one draft only.** It must operate on **exactly one** `uploadSessionId` **or** exactly one `documentId`. **It must never accept an array of draft IDs.**
- **Permission:** `dms.documents.review_ai` or `dms.documents.upload` or `dms.admin`.
- **Does:** validates required fields + dates; updates the **existing draft** doc to `active` with confirmed values; inserts `dms_document_metadata_values` (now allowed — user approved this single draft); applies tags/links; generates expiry reminders; marks AI result `accepted`; session `intake_status = "approved"`; bumps batch `approved_files`; cleans `dms-temp`. Records its own approval user/timestamp/audit event. Idempotent if already approved.
- **Returns:** `{ documentId, documentNo }`

### `discardDraftIntake(input)`
- **Input:** `{ uploadSessionId | documentId, reason? }` — **one draft only.**
- **Does:** discarding a draft **soft-deletes the draft document and handles file rows/storage according to the approved DMS delete standard**. Permanent Supabase Storage deletion is allowed **only if** the approved DMS delete standard explicitly permits it. Marks session `intake_status = "discarded"`, updates batch counts. Audit `delete`.

### `getNextPendingDraftInBatch(batchId)`  *(optional helper)*
- **Does:** returns the next `pending_ai_review` draft in the batch so the UI can open it in the **individual review screen**. **It does not approve anything.**
- **Permission:** `dms.documents.view` / `dms.admin`.

> **No bulk approval action exists.** There is intentionally no `bulkApproveBatchDrafts` (or any equivalent). See §21 governance rule.

### `getDmsUploadBatch(batchCode)` / `getDmsUploadBatchDrafts(batchId)`
- **Read:** batch header + its sessions joined to draft documents (id, document_no, title, type name, status, confidence, missing-required flag). `dms.documents.view`/`dms.admin`. Confidential docs respect existing visibility rules.

---

## 11. Client / UI Components

### Modify
| File | Change |
|---|---|
| `dms-upload-dropzone.tsx` | Add `multiple` prop; accept multiple files; per-file validation + SHA-256; render a selectable file list with remove; emit `onFilesSelected(files[])`. Keep single-file mode for entity tabs if desired. |
| `dms-upload-inbox-page-client.tsx` | New `batch` upload state machine: create batch → upload each → call `startAiIntakeAndCreateDraft` sequentially with progress → navigate to batch review queue. Keep existing single-file actions intact. |
| `dms-upload-session-table.tsx` | Show `batch_id` grouping / a "View batch" link where applicable. |
| `documents` list filters | Ensure `pending_ai_review` is filterable + a clear **"AI Draft"** badge. `pending_ai_review` drafts may appear in the main Documents list **only** with the "AI Draft" badge and filter — they must **not** look like active approved documents. |

### Create
| File | Purpose |
|---|---|
| `src/server/actions/dms/batch-intake.ts` | All batch server actions (§10). |
| `src/app/(protected)/dms/inbox/batch/[batchCode]/page.tsx` | Batch Review Queue route (server component; permission gate; loads batch + drafts). |
| `src/features/dms/upload/dms-batch-review-queue-client.tsx` | Queue UI: per-draft rows (title, type, confidence, status), per-row **Review & Approve** (opens review screen) / **Discard** / **Re-run AI**, **Review Next Pending Draft** button, status filters, progress, refresh. **No bulk-approve / approve-selected / approve-all controls.** |
| `src/features/dms/upload/dms-batch-upload-progress.tsx` | Inline progress panel (`uploading n/total`, `AI n/total`, per-file success/fail chips). |
| `src/features/dms/upload/dms-batch-upload-constants.ts` | `MAX_BATCH_FILES`, labels. |
| Workspace route registry entry | Register `/dms/inbox/batch/[batchCode]` as a `record`-style tab (`entityType: dms_upload_batch`) per UI.4 conventions. |
| Query keys / invalidation | `dms.uploadBatch(code)`, `dms.uploadBatchDrafts(id)` + invalidators. |

### Review screen
Per Decision D1 (recommended Option A): reuse `/dms/intake/[sessionCode]` + `dms-ai-intake-page-client.tsx`, adjusted so "Approve & Save" calls `finalizeDraftIntake` (draft already exists). The earlier tab-conversion fix (intake tab → document tab on approve) and force-close-on-save fix both apply here too.

---

## 12. Permissions & RLS

- Reuse existing DMS permissions: `dms.documents.upload`, `dms.documents.view`, `dms.documents.review_ai`, `dms.admin`. **No new permissions needed.**
- `dms_upload_batches` RLS (ownership-scoped — avoid broad access):
  - **A user can view/manage their own batches** (`created_by = current user`).
  - **`dms.admin` can view/manage all batches.**
  - **Users with `dms.documents.upload` can create batches.**
  - **Avoid** a broad policy where every `dms.documents.view` user can see **all** upload batches; batch visibility is owner-scoped + admin, not org-wide.
- Draft documents obey existing `dms_documents` RLS. Confidential types (`hr`, `legal`, `executive`) remain admin-gated for AI Q&A/content per current rules.

---

## 13. Security & AI Governance

- **Never auto-approve.** Drafts stay `pending_ai_review`; only an explicit **per-draft** user approval (Approve & Save inside the individual review screen) promotes that **one** draft to `active`. No bulk/selected/all/confidence-based approval exists (see §21).
- **No metadata committed early (strengthened).** AI may pre-fill core **draft** document fields, but **AI metadata values must remain in review/draft storage (`dms_intake_review_values`) until the user approves the individual draft.** Do **not** write AI metadata to active metadata tables (`dms_document_metadata_values`) before that single draft's approval.
- **No sensitive logging.** OCR text, AI prompts, raw AI JSON, and answers are **never** written to `logAudit` or `erp_ai_usage_logs` payloads (only counts/model/duration/version), consistent with DMS.10–12.
- **API keys never returned to client.**
- **Cost guardrails:** `MAX_BATCH_FILES` cap; sequential processing; feature flag; an amber cost note in the UI (like the AI Summary bulk panel).
- **Duplicate handling:** per-file SHA-256 dedupe surfaces a warning chip; user may proceed (admin intent) or skip that file.

---

## 14. Error Handling & Edge Cases

| Case | Behavior |
|---|---|
| One file's AI fails | That session → `failed`, batch `failed_files++`; **other files continue**. Queue shows the failed row with **Re-run AI**. |
| AI provider not configured | Batch still creates sessions; each file falls back to a manual draft (status `draft`, AI status failed) so the user can fill manually. |
| File exceeds size / wrong type | Rejected client-side before batch creation. |
| Duplicate file | Warning chip; user chooses include/skip; `allowDuplicate` flag passed through. |
| User closes browser mid-batch | Already-created drafts persist (resumable via the batch queue route). Unprocessed sessions remain `uploaded`; queue offers **Resume AI**. |
| Discarded draft | Soft-delete the draft document + handle file rows/storage per the **approved DMS delete standard**; session `discarded`. Affects only that one draft. |
| Low-confidence extraction | Draft created but flagged; **remains pending until individually reviewed** in the review screen (no auto/bulk approval exists). |
| Approval validation fails (missing type/category) | Blocked with toast; draft stays pending. |

---

## 15. Performance & Concurrency

- **Client-orchestrated sequential** per-file `startAiIntakeAndCreateDraft` calls (Decision D3) keep each request within normal action timeouts and give live progress.
- Optional **limited concurrency (e.g. 2 at a time)** can be added later if provider rate limits allow; v1 stays sequential for predictability and cost clarity.
- Batch counts (`processed/approved/failed`) updated per call so the queue reflects progress without a giant transaction.
- No N+1 in the queue read (single joined query: sessions → draft docs → type name).

---

## 16. Feature Flag & Rollout

- Gate the entire batch feature behind `DMS_BATCH_INTAKE` (`erp_ai_feature_flags`). When off, the inbox shows only today's single-file flow.
- **Sub-phasing (recommended build order):**

| Sub-phase | Scope |
|---|---|
| **13.1** | Batch table, `batch_id` on sessions, multi-file dropzone, batch creation (`createDmsUploadBatch`), sequential upload progress. No AI draft creation yet unless safe. |
| **13.2** | Per-file AI processing and draft document creation (`startAiIntakeAndCreateDraft`) + `finalizeDraftIntake` refactor. Existing single-file intake must remain working. |
| **13.3** | Batch Review Queue with **Review (& Approve)**, **Review Next Pending Draft**, **Discard**, **Re-run AI**. Approval only inside the individual review screen. |
| **13.4** | One-by-one review workflow polish, queue filters, status indicators, QA, report, and Source of Truth update. **No bulk approval.** |

Each sub-phase ends with `npm run typecheck` + `npm run build` PASS and respects the "stop for approval between phases" rule.

---

## 17. Open Questions for Sameer / Dina (approval gate)

1. **Review screen (D1):** reuse the rich intake review screen (recommended) or the standard record form?
2. **File copy timing (D7):** copy to `dms-documents` at draft creation (recommended) or defer to approval?
3. **Max files per batch (D4):** confirm **10** (recommended v1 cap) or set a different cap.
4. **Feature flag default:** enable for **admin/UAT only** first (recommended), or insert disabled until 13.4 closes?
5. **Draft visibility:** `pending_ai_review` drafts appear in the main Documents list **with an "AI Draft" badge + filter** (recommended), or hidden until approved?
6. **Batch code:** opaque random code (recommended, like `session_code`) or a numbered `MASTER_DMS_BATCH` reference?

**Confirmed decisions (no longer open):**
- **Bulk approval: NOT ALLOWED. Sameer confirmed approval must be one-by-one.** Every draft is opened individually and approved with Approve & Save (see §21).

---

## 18. Testing & Acceptance

### Automated
- `npx tsc --noEmit` — 0 errors.
- `npm run build` — PASS.

### Manual UAT checklist
- [ ] Upload 10 mixed files (PDF + images) in one action; all 10 sessions + batch created.
- [ ] Progress shows `uploading n/10` then `AI n/10`; one intentionally-bad file fails without blocking others.
- [ ] 10 (or 9) draft documents created with `pending_ai_review`, AI-prefilled title/type/dates.
- [ ] Batch Review Queue lists all drafts with confidence + status.
- [ ] **Batch queue has no bulk approval button.**
- [ ] **Batch queue has no approve-selected action.**
- [ ] **User must open a draft review screen before approval** (no row-level direct approval).
- [ ] Open a draft → edit a wrong field → **Approve & Save** → status `active`; queue row turns green.
- [ ] **Approving one draft does not approve any other draft.**
- [ ] **`finalizeDraftIntake` accepts only one draft/session/document** (no array input).
- [ ] **`Review Next Pending Draft` opens the next draft only** (does not approve it).
- [ ] **Each approved document has a separate approval user / timestamp / audit log entry.**
- [ ] **Low-confidence drafts remain pending until individually reviewed.**
- [ ] **Queue progress updates after each individual approval.**
- [ ] **Discard affects only one draft** and follows the approved DMS delete standard for file/storage handling.
- [ ] Duplicate file shows warning; include/skip both work.
- [ ] Entity context: a batch started from a Party record links every resulting active document to that party.
- [ ] No OCR text / prompts / AI raw output in audit logs or usage logs.
- [ ] Feature flag off → only single-file flow visible.

---

## 19. File Change Inventory (at implementation time)

**New**
- `supabase/migrations/2026XXXXXXXXXX_erp_dms_13_batch_upload_intake.sql` (+ review-only copy in `implementation_Review/sql_review/`)
- `src/server/actions/dms/batch-intake.ts`
- `src/app/(protected)/dms/inbox/batch/[batchCode]/page.tsx`
- `src/features/dms/upload/dms-batch-review-queue-client.tsx`
- `src/features/dms/upload/dms-batch-upload-progress.tsx`
- `src/features/dms/upload/dms-batch-upload-constants.ts`

**Modified**
- `src/features/dms/upload/dms-upload-dropzone.tsx` (multi-file)
- `src/features/dms/upload/dms-upload-inbox-page-client.tsx` (batch state machine)
- `src/features/dms/upload/dms-upload-session-table.tsx` (batch link/badge)
- `src/server/actions/dms/ai-intake.ts` (extract shared intake core; refactor approve → `finalizeDraftIntake`)
- `src/server/actions/dms/upload-sessions.ts` (optional: shared per-file session creation helper)
- `src/lib/workspace/workspace-route-registry.ts` (register batch route)
- `src/lib/query/query-keys.ts` + `invalidation.ts` (batch keys)
- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` (phase row + completion log on closure)

---

## 20. Out of Scope / Future
- Asynchronous server-side batch workers / cron.
- ZIP / folder / email-attachment ingestion.
- Semantic dedupe (near-duplicate detection) — leverages DMS 12.5 pgvector.
- Auto-approval of ultra-high-confidence drafts (governance risk; **permanently excluded** — see §21).
- Bulk approval / approve-selected / approve-all (governance risk; **permanently excluded** unless Sameer explicitly changes the rule).

---

## 21. One-by-One Approval Governance Rule

Batch upload improves intake speed, but it does not weaken document approval governance.

Every AI-created draft document must be reviewed and approved individually. This rule applies even when AI confidence is high.

The ERP must not provide:
- bulk approval
- approve selected
- approve all valid
- confidence-based automatic approval
- direct queue approval without opening the review screen

Each document must have its own human approval event and audit trail.

> This is a confirmed governance decision by Sameer. It must not be reversed or worked around in implementation, and bulk approval must not be reintroduced in any future phase unless Sameer explicitly changes this rule.

---

## 22. Protect Existing Single-File Flow (non-negotiable)

DMS 13 must **not** break the existing single-file **Upload & AI Fill** flow (DMS.11). The batch draft-first flow is **added beside** the current single-file flow.

- Shared helpers may be extracted **only if fully backward compatible** and tested.
- Do **not** globally replace `approveAiIntakeAndCreateDocument` unless the replacement is backward compatible and verified against the existing single-file path.
- The single-file intake screen contract must continue to work unchanged for users not using batch upload.

---

## Plan Update Log

### 2026-06-15 — Sameer decision: one-by-one approval only
- Removed all bulk approval capability from the plan.
- Replaced "Approve all valid" with "Review Next Pending Draft".
- Removed `bulkApproveBatchDrafts`.
- Added governance rule (§21) that every AI-created draft must be individually reviewed and approved.
- Updated UX flow, scope, design decisions (D4/D6), server actions, sub-phases, testing, and open questions.
- Updated v1 batch cap recommendation from 20 to **10** files.
- Clarified that existing single-file intake must remain working (§22).
- Clarified storage/discard behaviour must follow the approved DMS delete standard.
- Strengthened batch RLS ownership guidance (owner-scoped + admin).
- Strengthened metadata safety (AI metadata stays in review/draft storage until individual approval).
- Set feature-flag default recommendation to admin/UAT-only (or disabled) before broad rollout.
- Reinforced "AI Draft" badge/filter requirement for `pending_ai_review` drafts in the Documents list.

---

*End of plan. No code or migration has been executed. **Status remains PLAN ONLY.** Awaiting Sameer/Dina approval on §17 before implementation begins.*

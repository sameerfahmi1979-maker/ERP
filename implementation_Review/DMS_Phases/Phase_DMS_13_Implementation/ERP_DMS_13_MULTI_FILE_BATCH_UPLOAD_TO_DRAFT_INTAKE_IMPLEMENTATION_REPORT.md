# ERP DMS 13 — Multi-File Batch Upload → Draft Intake Queue — Implementation Report

**Phase:** ERP DMS 13
**Title:** Multi-File Batch Upload → Draft Intake Queue
**Status:** CLOSED / PASS ✅
**Date:** 2026-06-15
**Prepared by:** Cursor AI for Sameer Fahmi
**Prompt:** `ChatGPT/CURSOR_PROMPT_ERP_DMS_13_MULTI_FILE_BATCH_UPLOAD_DRAFT_INTAKE_IMPLEMENTATION.md`
**Plan:** `implementation_Review/ERP_DMS_13_MULTI_FILE_BATCH_UPLOAD_TO_DRAFT_INTAKE_PLAN.md`

---

## 1. Phase Title and Objective

Allow users to upload multiple documents in one batch, AI-process each file
independently, create one `pending_ai_review` draft document per file, and
review/approve each draft **individually**. Batch upload speeds up intake; it
does **not** weaken governance. Every document is still reviewed and approved
**one by one**.

---

## 2. Files Created

| File | Purpose |
|---|---|
| `supabase/migrations/20260615120000_erp_dms_13_batch_upload_intake.sql` | Migration: `dms_upload_batches` table, `batch_id` on sessions, RLS, feature flag |
| `implementation_Review/sql_review/ERP_DMS_13_BATCH_UPLOAD_INTAKE_PROPOSED_SCHEMA.sql` | Review-only copy of the schema |
| `src/server/actions/dms/batch-intake.ts` | All batch server actions (create / start-draft / finalize / discard / rerun / next / reads / flag) |
| `src/features/dms/upload/dms-batch-upload-progress.tsx` | Per-file batch upload/AI progress component |
| `src/features/dms/upload/dms-batch-review-queue-client.tsx` | Batch Review Queue UI (no bulk approval) |
| `src/app/(protected)/dms/inbox/batch/[batchCode]/page.tsx` | Batch Review Queue route (server component) |

## 3. Files Modified

| File | Change |
|---|---|
| `src/features/dms/upload/dms-upload-dropzone.tsx` | Added `multiple` / `onFilesSelected` / `maxFiles` props + selected-files list with per-file remove. **Single-file mode preserved.** |
| `src/features/dms/upload/dms-upload-inbox-page-client.tsx` | Added Single/Batch mode toggle + batch state machine (create batch → upload each → `startAiIntakeAndCreateDraft` each → navigate to queue). Single-file flow untouched. |
| `src/features/dms/upload/dms-upload-constants.ts` | Added `DMS_MAX_BATCH_FILES = 10`. |
| `src/features/dms/intake/dms-ai-intake-page-client.tsx` | `Approve & Save` and `Discard` branch to `finalizeDraftIntake` / `discardDraftIntake` when the session already has a draft document (batch); otherwise the existing single-file actions run unchanged. |
| `src/app/(protected)/dms/inbox/page.tsx` | Reads `isDmsBatchIntakeEnabled()` and passes `batchEnabled` to the inbox client. |
| `src/features/dms/documents/dms-document-status-badge.tsx` | `pending_ai_review` renders a distinct violet **"AI Draft"** badge. |
| `src/lib/workspace/workspace-route-registry.ts` | Registered `/dms/inbox/batch/[batchCode]` as a record-style workspace tab (`dms_upload_batch`). |
| `src/lib/query/query-keys.ts` | Added `dms.uploadBatch`, `dms.uploadBatchDrafts`, `dms.batchUploadProgress`. |

---

## 4. Migration Created / Applied

Migration `20260615120000_erp_dms_13_batch_upload_intake.sql` was **applied to
the live Supabase project** (`mmiefuieduzdiiwnqpie`) via the `user-supabase`
MCP and verified:

- `dms_upload_batches` table exists (BIGINT identity PK, `batch_code` UNIQUE,
  status CHECK `processing|ready_for_review|partially_approved|completed|cancelled`,
  counts with `>= 0` CHECKs, `entity_type`/`entity_id`, `created_by` FK, soft-delete).
- Indexes `idx_dms_upload_batches_created_by`, `idx_dms_upload_batches_status` (partial, `deleted_at IS NULL`).
- `dms_upload_sessions.batch_id` added (nullable FK, `ON DELETE SET NULL`) + partial index `idx_dms_upload_sessions_batch`.
- No change to `dms_documents.status` (verified there is no CHECK constraint on `status`; `pending_ai_review` is storable).

Verification query confirmed: `batch_table = dms_upload_batches`, `has_batch_id = 1`,
`policy_count = 3`, `flag_enabled = true`, `rls_enabled = true`, `rls_forced = true`.

---

## 5. RLS Policies Added

`dms_upload_batches` — RLS **enabled and forced**. Three ownership-scoped policies:

- **insert** — `current_user_has_permission('dms.documents.upload') OR dms.admin OR system_admin`.
- **select** — `auth.uid() IS NOT NULL AND (created_by = current_user_profile_id() OR dms.admin OR system_admin)`. (Owner-scoped + admin; **not** every `dms.documents.view` user.)
- **update** — `created_by = current_user_profile_id() OR dms.admin OR system_admin` (USING + WITH CHECK).

No existing RLS policy was weakened or disabled.

---

## 6. Feature Flag Status

`DMS_BATCH_INTAKE` inserted (idempotent, `ON CONFLICT DO NOTHING`):
`is_enabled = true`, `requires_human_review = true`, `min_confidence_threshold = 0.000`.
The batch UI is gated by this flag (server reads it; the inbox only shows the
Batch mode toggle when enabled). The platform has no user-level rollout table,
so flag + UI gating is the rollout control.

---

## 7. Server Actions Added (`src/server/actions/dms/batch-intake.ts`)

| Action | Behaviour |
|---|---|
| `createDmsUploadBatch(input)` | Max **10** files. Creates one `dms_upload_batches` row + one `dms_upload_sessions` row per file (reuses `createDmsUploadSession` dedupe + signed-URL logic, then tags `batch_id`). Returns signed upload data per file. Does not upload content. |
| `startAiIntakeAndCreateDraft(input)` | Processes **one** file: delegates to the proven `startAiIntakeFromUploadSession` (OCR + AI), then creates **one** `pending_ai_review` draft document with AI-suggested core fields, links the session, stores field-level suggestions in `dms_intake_review_values`, bumps batch counts. Failure is isolated per file. |
| `finalizeDraftIntake(input)` | Approves **exactly one** draft. Zod `.refine()` accepts **exactly one** of `uploadSessionId` / `documentId` and **never an array**. Promotes the draft to `active`, copies file dms-temp→dms-documents (+ version v1 + file row + content text), writes approved metadata/tags/links/reminders, marks AI accepted, marks session approved. Idempotent if already active. |
| `discardDraftIntake(input)` | Discards **one** draft. Soft-deletes the draft document + file rows, marks versions not current, purges storage objects — exactly per the approved DMS delete standard (same behaviour as `deleteDmsDocument`). Marks session `discarded`. |
| `rerunBatchDraftAi(uploadSessionId)` | Re-runs AI for **one** draft (wraps `retryAiIntake`, audits `dms_batch_ai_rerun`). |
| `getNextPendingDraftInBatch(batchId)` | Returns the next still-pending draft/session. **Does not approve anything.** |
| `getDmsUploadBatch(batchCode)` / `getDmsUploadBatchDrafts(batchId)` | RLS-scoped reads for the queue. |
| `isDmsBatchIntakeEnabled()` | Flag check for server-component UI gating. |

**No bulk-approval action exists.** There is no `bulkApproveBatchDrafts`,
`approveSelectedDrafts`, `approveAllValidDrafts`, or any equivalent.

---

## 8. UI Components / Routes Added

- **Multi-file dropzone** (`multiple` mode) — drag/drop up to 10 files, per-file hash + validation, selected list with remove + clear-all.
- **Upload Inbox batch flow** — Single / Multiple-Files (Batch) toggle (shown only when flag enabled); "Upload & AI Fill All (n)" button; sequential client-orchestrated upload + AI; live progress; auto-navigates to the queue.
- **`DmsBatchUploadProgress`** — per-file phase chips (waiting/uploading/AI/done/failed) + created/failed counts.
- **Batch Review Queue route** `/dms/inbox/batch/[batchCode]` + **`DmsBatchReviewQueueClient`** — batch header + 6 count cards (total/processed/pending/approved/failed/discarded), per-row actions **Review & Approve** (opens `/dms/intake/[sessionCode]`), **Re-run AI**, **Discard**; header buttons **Review Next Pending Draft** + **Refresh**. **No bulk approval button.**
- **AI Draft badge** — `pending_ai_review` documents render a violet "AI Draft" badge so they never look active.

---

## 9. One-by-One Approval Enforcement

- The queue has **no** bulk/approve-selected/approve-all control. It is a tracking + review launcher only.
- **Review & Approve** navigates to the per-draft review screen `/dms/intake/[sessionCode]`. Approval happens **inside** that screen via the existing **Approve & Save** action.
- `finalizeDraftIntake` operates on exactly one draft and rejects arrays at the schema level.
- Each approval produces its own `dms_document_events` + `logAudit` entry with its own approver/timestamp.
- No confidence-based automatic approval anywhere; AI never finalizes a document.

---

## 10. Confirmation: No Bulk Approval Exists

Verified by code search — the only occurrences of "bulk" in batch code are
`bulkGenerate*` (unrelated DMS 12.x embedding/summary admin tools) and prose
stating bulk approval is **not** allowed. No approval action accepts an array.

---

## 11. Existing Single-File Flow Regression Result

- The single-file dropzone path (`onFileSelected`) is unchanged and still used by default.
- `startAiIntakeFromUploadSession` is **reused, not modified** — the batch draft action calls it.
- `approveAiIntakeAndCreateDocument` and `discardAiIntake` remain the path for non-batch sessions (`session.document_id == null`), selected via a runtime branch in the intake client.
- The intake route still redirects approved sessions to the document record.
- TypeScript + build pass; no behavioural change to the single-file intake.

---

## 12. File / Storage Handling Behaviour

- **Draft creation:** the file stays in `dms-temp` (mirrors single-file flow); the intake review screen previews from `dms-temp`. No permanent copy at draft stage.
- **Approval (`finalizeDraftIntake`):** copies `dms-temp` → `dms-documents`, creates version v1 + `dms_document_files` row + content text (idempotent on `current_version_id`).
- **Discard (`discardDraftIntake`):** soft-deletes the draft + file rows and purges storage objects — exactly the approved DMS delete standard (identical to `deleteDmsDocument`). No new permanent-deletion behaviour was introduced beyond that standard.

---

## 13. Security / Logging Notes

- No OCR text, AI prompts, raw AI responses, content text, extracted personal values, file content, or API keys are logged. Only safe metadata (batch/session/document ids, batch code, counts, status, ai_result_id) is logged.
- Audit events used: `dms_batch_created`, `dms_batch_draft_created`, `dms_batch_draft_failed`, `dms_batch_draft_approved`, `dms_batch_draft_discarded`, `dms_batch_ai_rerun`.
- Batch visibility is owner-scoped + admin (RLS forced). Reads use the user-scoped client; only internal count bookkeeping uses the admin client.
- No pgvector / semantic-search changes. No new AI provider architecture. No new OCR engine.

---

## 14. Known Limitations

1. **Draft type fallback:** `dms_documents.document_type_id` and `category_id` are NOT NULL, so a draft must carry a type/category at creation. If the AI cannot classify a file, the draft is created with the first active document type (and its category) as a placeholder — the user **must** correct it during the mandatory individual review before approval.
2. **Entity-context carry-through:** at draft stage only `party` context maps to `party_id`. Other entity links can be added during the per-draft review.
3. **Batch creation is fail-fast:** if a session/signed-URL cannot be prepared for any file (client pre-validates, so rare), the batch is rolled back. Per-file *AI* failures are isolated and do not stop the batch.
4. **Re-run AI** regenerates the AI result; the user reviews the refreshed suggestions in the review screen (draft core fields are corrected on approval).

---

## 15. Manual QA Checklist Results

> The following are governance/structural checks verified against the code and live schema. Full interactive UAT (uploading real files) is recommended by Sameer/Dina with the flag enabled for an admin/UAT user.

| Check | Result |
|---|---|
| Batch queue has no bulk-approval button | ✅ No such control rendered |
| User must open the review screen before approval | ✅ Review & Approve only navigates; no inline approve |
| Approving one draft activates only that document | ✅ `finalizeDraftIntake` is single-draft |
| `finalizeDraftIntake` accepts exactly one draft/session/document, never arrays | ✅ Zod `.refine()` enforces XOR; no array input |
| `Review Next Pending Draft` opens the next draft only | ✅ `getNextPendingDraftInBatch` returns one, approves nothing |
| Each approval has its own audit + document event | ✅ Per-document `dms_batch_draft_approved` |
| Low-confidence drafts remain pending until individually reviewed | ✅ Status stays `pending_ai_review`; no auto-approve |
| Discard affects only one draft and follows the DMS delete standard | ✅ Soft-delete + storage purge, single draft |
| Existing single-file intake still works | ✅ Unchanged path, branch on `document_id` |
| RLS enabled + forced, owner-scoped | ✅ Verified on live DB |
| AI metadata not written to active tables before approval | ✅ Suggestions stay in `dms_intake_review_values` |

---

## 16. `npx tsc --noEmit` Result

**PASS** — 0 errors.

## 17. `npm run build` Result

**PASS** — compiled successfully; route `/dms/inbox/batch/[batchCode]` present in the build output; TypeScript validated during build.

---

## 18. Hard Rejection Criteria — Status

| # | Criterion | Status |
|---|---|---|
| 1 | Any bulk approval feature | ✅ None |
| 2 | Any approve-selected feature | ✅ None |
| 3 | Any approve-all feature | ✅ None |
| 4 | Confidence-based automatic approval | ✅ None |
| 5 | Drafts becoming active without individual review | ✅ Prevented |
| 6 | Existing single-file intake breaks | ✅ Intact |
| 7 | AI metadata written to active tables before approval | ✅ Not done |
| 8 | RLS weakened/disabled | ✅ Not done |
| 9 | Permanent storage deletion without approved standard | ✅ Only via DMS delete standard |
| 10 | Sensitive text/content logged | ✅ Not logged |
| 11 | TypeScript fails | ✅ Passes |
| 12 | Build fails | ✅ Passes |
| 13 | Unrelated modules modified | ✅ Scoped to DMS upload/intake |

---

## 19. Addendum — Batch Discoverability + Multi-Select Discard (post-UAT feedback)

Follow-up changes after initial closure, in response to the feedback "batch review screen is not available under documents… if I will not process them now I will lose them… batch review should have multi-select so I can select multiple to discard… make sure RLS policy and user policy is set."

**A. Batches are no longer lost — dedicated Batch Intake list.**
- New RLS-scoped server action `listDmsUploadBatches(limit=100)` returns the user's batches (admins see all via policy) with **live per-draft counts** (pending / approved / discarded / failed) aggregated in a single sessions query.
- New route `/dms/inbox/batches` (`src/app/(protected)/dms/inbox/batches/page.tsx`) + client `dms-batch-list-client.tsx` — table of all batches with status, file/pending/approved/discarded counts, created date, and a Review/Open action per row. Unfinished batches remain reachable until every draft is resolved.
- Discoverability: added **"Batch Intake"** link to the sidebar Documents group (`app-sidebar.tsx`), a quick-link card on the DMS dashboard (`/dms`), and a route-registry entry (`/dms/inbox/batches`, list/singleton). Verified the new exact route does not collide with the existing `/dms/inbox/batch/[batchCode]` pattern (build shows both routes).

**B. Multi-select discard (DISCARD-ONLY — still no bulk approval).**
- New server action `discardDraftIntakeBulk({ uploadSessionIds[], reason? })` (max 50). The single-draft discard body was refactored into a shared `performDraftDiscard()` helper so bulk simply loops it; each batch is recomputed once at the end.
- Discard remains fully compliant with the approved DMS delete standard (soft-delete document + files, storage purge). It is explicitly **not** an approval path — governance (one-by-one approval) is unchanged; there is still no bulk-approve / approve-selected / approve-all.
- Batch Review Queue UI: added per-row checkboxes (enabled only for discardable drafts — not approved/active/already-discarded), a header select-all-discardable checkbox, and a **"Discard Selected (N)"** button with a confirm dialog. Approval is still strictly one-at-a-time via the per-draft review screen. Banner updated to state multi-select is for discarding only.

**C. RLS / user policy verification (live DB).**
- `dms_upload_batches`: RLS **ENABLED + FORCED**. Policies confirmed: `insert` (dms.documents.upload | dms.admin | system_admin), `select` and `update` (`created_by = current_user_profile_id()` OR dms.admin OR system_admin). The list/queue reads use the RLS-bound client, so users only see their own batches (admins see all). Bulk discard re-checks `canDiscard` and operates through the same per-row document/session RLS as the single discard.

**Verification:** TypeScript PASS (0 errors); `npm run build` PASS — both `/dms/inbox/batches` and `/dms/inbox/batch/[batchCode]` present in route output.

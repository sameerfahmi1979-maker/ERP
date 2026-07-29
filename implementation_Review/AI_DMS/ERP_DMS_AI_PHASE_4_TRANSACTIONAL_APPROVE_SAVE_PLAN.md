# ERP DMS AI Phase 4 - Transactional Approve & Save Command Chain Plan

## 1. Executive Summary

Phase 4 should make the DMS AI Intake Approve & Save command chain transactional where Postgres can be transactional, recoverable where storage cannot be transactional, and auditable across every state transition.

The current single-file approval path, `approveAiIntakeAndCreateDocument`, creates the production document only after human approval, which preserves the human-review-first rule. The gap is that the implementation performs many sequential Supabase and Storage operations from TypeScript. Some failures delete the newly-created `dms_documents` row, but file storage, version/file rows, metadata, tags, links, reminders, AI result updates, session updates, and audit/event rows are not protected by a single transaction.

The recommended future implementation is **Hybrid Option C: server-side storage saga + atomic Postgres RPC for core DB writes**. The server action should validate, prepare payloads, copy the temp file to final private storage, call one RPC for the core DB state transition, and remove the copied final file if the RPC fails. OCR/content sync and later AI orchestration remain post-commit best-effort.

## 2. Planning Scope and Non-Implementation Rule

This file is planning only. No source code, UI, migration, schema, RLS, or server-action implementation is included.

Phase 4 implementation must not build Phase 5+ orchestration automation, apply-to-metadata from document AI tabs, semantic chunks, review queue UI, ERP mapping, Azure OCR wiring, OCR history, page-level OCR, bulk auto-approve, or any AI auto-save behavior.

## 3. Files and Source-of-Truth Reviewed

Reviewed:

| File | Purpose |
|---|---|
| `ChatGPT/ERP_DMS_AI_PHASE_4_TRANSACTIONAL_APPROVE_SAVE_PLANNING_PROMPT.md` | Phase 4 planning prompt and required structure |
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | Post Phase 3 DMS AI state |
| `ERP_DMS_AI_PHASE_3_METADATA_AWARE_CLASSIFICATION_PLAN.md` | Prior planning pattern and boundary |
| `implementation_Review/ERP_DMS_AI_PHASE_1_STABILIZATION_IMPLEMENTATION_REPORT.md` | Phase 1 safety/RLS baseline |
| `implementation_Review/ERP_DMS_AI_PHASE_2_METADATA_DEFINITIONS_UPGRADE_IMPLEMENTATION_REPORT.md` | Phase 2 metadata/RLS baseline |
| `implementation_Review/ERP_DMS_AI_PHASE_3_METADATA_AWARE_CLASSIFICATION_IMPLEMENTATION_REPORT.md` | Phase 3 classification baseline |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Global ERP source of truth |
| `.cursor/rules/erp-dms-ai-first-upload-standard.mdc` | AI-first upload governance |
| `.cursor/rules/erp-dms-standard.mdc` | DMS storage, RLS, numbering, audit standards |
| `.cursor/rules/erp-ai-settings-standard.mdc` | AI provider and key handling |
| `.cursor/rules/erp-common-ai-standard.mdc` | Common AI human-review and logging rules |
| `src/server/actions/dms/ai-intake.ts` | Single-file AI intake and approval |
| `src/server/actions/dms/batch-intake.ts` | Batch draft creation and finalization |
| `src/server/actions/dms/upload-sessions.ts` | Temp upload session creation |
| `src/server/actions/dms/documents.ts` | Document repository actions and event helper |
| `src/server/actions/dms/standard-file-name.ts` | Standard filename resolution |
| `src/lib/dms/standard-file-name.ts` | Filename builder and validation |
| `src/lib/dms/resolve-standard-file-name.ts` | Pure filename context resolver |
| `src/lib/dms/ocr/persist-file-ocr-result.ts` | OCR/content persistence helper |
| `src/server/actions/dms/document-content.ts` | Document content text sync |
| `src/server/actions/dms/orchestration.ts` | Best-effort post-draft pipeline |
| `supabase/migrations/*dms*` | Local DMS schema, RLS, storage, and AI migrations |
| Live Supabase via `user-supabase` | Table columns, constraints, RLS policies, storage buckets |

Missing or not found as standalone files:

| Requested file | Finding |
|---|---|
| `ERP_DMS_AI_A_TO_Z_AUDIT_FUNCTION_MAP_AND_ENHANCEMENT_PLAN.md` | Not found at repository root |
| `ERP_DMS_AI_FULL_AUDIT_AND_ENHANCEMENT_PLAN.md` | Not found at repository root |
| `ALGT_ERP_CURSOR_PHASE_PROMPT_MASTER_STANDARD_V2.md` | Not found by direct review |
| `erp-ai-human-review-first-standard.mdc` | No standalone file found; rules are present in DMS/Common AI standards |
| `erp-dms-standard-file-naming.mdc` | No standalone file found; implemented in `standard-file-name.ts` and `standard-file-name` action |
| `erp-database-standard.mdc`, `erp-supabase-standard.mdc`, `erp-rls-standard.mdc`, `erp-audit-log-standard.mdc`, `erp-numbering-standard.mdc` | No standalone `.mdc` files found in `.cursor/rules` |

## 4. Phase 1, Phase 2, and Phase 3 Output Reviewed

Phase 1 stabilized DMS AI with scoped intake review RLS, fixed phantom understanding table references, aligned the metadata loader, and created the DMS AI source of truth.

Phase 2 upgraded `dms_metadata_definitions`, normalized labels, backfilled RLS parity for DMS.14 tables, enriched prompts, and preserved human-review-first behavior.

Phase 3 made classification metadata-aware, stored alternatives/evidence in `raw_response_json.classification`, added type-change metadata re-run, and kept production metadata writes behind human approval.

Phase 4 must build on these outcomes by hardening only the approval/final-save command chain.

## 5. Current Approve & Save Architecture

Single-file approval is implemented in `src/server/actions/dms/ai-intake.ts` as `approveAiIntakeAndCreateDocument(input)`.

Batch finalization is implemented in `src/server/actions/dms/batch-intake.ts` as `finalizeDraftIntake(input)`. Batch draft creation uses `startAiIntakeAndCreateDraft`, which creates a `dms_documents` draft (`status = pending_ai_review`) before finalization.

Both flows:

- Validate user auth and permissions in TypeScript.
- Resolve and validate standard filename before final approval.
- Copy the temp object from `dms-temp` to `dms-documents`.
- Create or update document/version/file rows.
- Save metadata, tags, links, reminders.
- Mark AI result accepted.
- Sync OCR/content text best-effort.
- Mark upload session approved.
- Write document events and audit log rows.

No shared approve service currently owns the common command chain. Single-file and batch code duplicate storage, metadata, tags, links, reminders, AI result acceptance, content sync, and audit patterns.

## 6. Current Single-File Approve Flow Audit

`approveAiIntakeAndCreateDocument` sequence:

1. Zod validates input.
2. `getAuthContext()` and `canApproveIntake()` require `dms.documents.review_ai`, `dms.documents.upload`, or `dms.admin`.
3. Dates are validated.
4. `dms_upload_sessions` is loaded.
5. If `intake_status = approved` and `document_id` points to a document, the action returns the existing document. This is partial idempotency.
6. Discarded sessions and missing `temp_storage_path` are rejected.
7. `dms_document_types` is loaded and checked active.
8. `generate_next_reference_number('MASTER_DMS_DOCUMENT')` generates `document_no`.
9. `resolveStandardFileNameForIntakeApprove` and `validateStandardFileName` resolve/validate final `file_name`.
10. `dms_documents` is inserted with `status = active`.
11. Temp object is downloaded from `dms-temp`.
12. Final object is uploaded to `dms-documents` with `upsert: false`.
13. `dms_document_versions` v1 is inserted.
14. `dms_document_files` original row is inserted.
15. `dms_documents.current_version_id` is updated.
16. `dms_document_metadata_values` rows are upserted.
17. `dms_document_tags` rows are inserted.
18. `dms_document_links` rows are inserted.
19. `dms_expiry_reminders` rows are upserted.
20. `dms_ai_extraction_results` is updated to `ai_status = accepted`.
21. OCR/content sync runs best-effort through `persistFileOcrResult` or `writeDocumentContentTextSystem`.
22. `dms_upload_sessions` is updated to `status = completed`, `intake_status = approved`, `review_status = approved`, and `document_id = documentId`.
23. `dms_document_events` rows are inserted.
24. `logAudit` inserts the ERP audit row.
25. Paths are revalidated and the document ID/number is returned.

Transactional status:

| Step group | Current protection |
|---|---|
| Validation before writes | Safe, no writes until after number generation and filename validation |
| Number allocation | RPC updates numbering state before document insert; gaps can happen |
| Document insert through file row | Sequential; some failures delete only `dms_documents` |
| Final storage upload | External to DB; not rolled back by DB |
| Version/file failures after upload | Deletes `dms_documents`, but does not remove copied final storage object |
| Metadata/tags/links/reminders | Mostly non-fatal or unchecked; partial state possible |
| AI result/session accepted state | Unchecked update errors; partial state possible |
| Events/audit | Unchecked for document events; audit failure can surface only through helper behavior |
| OCR/content sync | Explicitly best-effort and non-fatal |

## 7. Current Batch Finalize Flow Audit

`finalizeDraftIntake` differs from single-file approval because `startAiIntakeAndCreateDraft` already created a `dms_documents` draft and linked `dms_upload_sessions.document_id`.

Batch draft creation sequence:

1. Runs `startAiIntakeFromUploadSession`.
2. Reads the AI result.
3. Chooses AI-suggested type or first active fallback type.
4. Generates `document_no`.
5. Inserts `dms_documents` with `status = pending_ai_review`.
6. Updates `dms_upload_sessions.document_id`.
7. Updates AI result `document_id`.
8. Writes draft values in `dms_intake_review_values`.
9. Inserts `batch_draft_created` event and audit log.

Batch finalization sequence:

1. Validates input/auth/permission.
2. Loads upload session and draft document.
3. Returns success if document/session already active/approved.
4. Requires document status `pending_ai_review`.
5. Loads active document type.
6. Resolves/validates standard filename.
7. Updates existing draft document to `status = active`.
8. If there is no `current_version_id`, downloads from `dms-temp`, uploads to `dms-documents`, inserts version/file rows, and updates `current_version_id`.
9. Upserts metadata, inserts tags/links, upserts reminders.
10. Marks AI result accepted.
11. Syncs OCR/content best-effort.
12. Updates upload session approved.
13. Inserts one `batch_draft_approved` event.
14. Recomputes batch status.
15. Writes audit log.

Batch-specific gaps:

- The draft document can be promoted to active before storage copy succeeds; the code tries to revert status to `pending_ai_review` on storage download/upload failure only.
- If version/file row creation fails after final storage upload, the copied object is not removed.
- Metadata/tag/link/reminder insert errors are not consistently checked.
- Finalization duplicates the single-file approve logic rather than sharing a core approve service/RPC.
- Batch draft creation consumes document numbers before final approval, so skipped numbers are more likely and should be treated as acceptable under numbering rules.

## 8. Current Database Schema and Table Audit

Live Supabase was checked via `user-supabase`. All DMS primary keys are BIGINT identity or composite BIGINT keys where expected.

| Table | PK / key constraints | Core role in approval |
|---|---|---|
| `dms_documents` | BIGINT `id`; unique `document_no`; FKs to document type/category/company/branch/party/current version | Canonical approved document or batch draft |
| `dms_document_versions` | BIGINT `id`; unique `(document_id, version_number)` | Version v1 created on approve/finalize |
| `dms_document_files` | BIGINT `id`; FKs document/version/user | Final file metadata, storage path, OCR fields |
| `dms_document_metadata_values` | BIGINT `id`; unique `(document_id, definition_id)` | Approved metadata values |
| `dms_document_tags` | Composite PK `(document_id, tag_id)` | Approved tags |
| `dms_document_links` | BIGINT `id`; active unique index `(document_id, entity_type, entity_id)` where not deleted | ERP entity links |
| `dms_expiry_reminders` | BIGINT `id`; unique `(document_id, reminder_days_before)` | Reminder schedule |
| `dms_upload_sessions` | BIGINT `id`; unique `session_code`; FKs document/job/result/batch/user | Intake lifecycle and idempotency anchor |
| `dms_upload_batches` | BIGINT `id`; unique `batch_code`; status check | Batch tracking |
| `dms_ai_extraction_jobs` | BIGINT `id`; FKs session/document/file/provider/user | AI job tracking |
| `dms_ai_extraction_results` | BIGINT `id`; FK job/session/document/type/user | AI result accepted status |
| `dms_intake_review_values` | BIGINT `id`; FK upload session; indexed by session | Draft review values |
| `dms_document_events` | BIGINT `id`; FK document/user | DMS event log |
| `audit_logs` | BIGINT `id`; FKs profile/company/branch | ERP audit trail |
| `global_numbering_rules` | BIGINT `id`; unique `rule_code` | `MASTER_DMS_DOCUMENT` sequence state |

Important live columns for Phase 4:

- `dms_upload_sessions.document_id`, `ai_job_id`, `ai_result_id`, `intake_status`, `review_status`, `review_completed_at`, `reviewed_by`, `batch_id`, `orchestration_status`, `orchestration_steps_json`.
- No current `approve_run_id`, `approve_status`, or `approve_error` columns.
- No current `dms_approve_runs` table.
- No current unique constraint on `dms_upload_sessions.document_id` or `dms_ai_extraction_results.upload_session_id` that by itself prevents duplicate final document creation from a race.

RLS summary from live policies:

- `dms_documents`: select/view, insert/upload, update/edit, delete/delete or system admin.
- `dms_document_files`: select/preview, insert/upload.
- `dms_document_versions`: select/view, insert/upload.
- `dms_document_metadata_values`, `dms_document_tags`, `dms_document_links`: select/view, manage/edit.
- `dms_expiry_reminders`: select/view; manage/admin.
- `dms_upload_sessions`: select/update/insert primarily upload/system admin.
- `dms_intake_review_values`: scoped select via session owner or review/admin/system admin; write via upload/review/admin/system admin.
- `dms_ai_extraction_results`: select/manage via review_ai/system admin.
- `dms_document_events`: select/view; insert authenticated.
- `audit_logs`: scoped `audit.view` policies.

## 9. Current Storage Flow Audit

Storage buckets verified live:

| Bucket | Public | Size limit | Notes |
|---|---:|---:|---|
| `dms-temp` | false | 50 MB | Temporary upload sessions |
| `dms-documents` | false | 50 MB | Final document files |

Temp path pattern:

```text
sessions/{sessionCode}/{safeFilename}
```

Final path pattern in code:

```text
{owningCompanyId_or_0}/{year}/{typeCode}/{documentId}/v{versionNumber}/original.{ext}
```

The final display file name is stored in `dms_document_files.file_name`; storage path uses `original.{ext}` and does not include the standard display filename.

Storage is not atomic with Postgres. Current single-file and batch flows download from `dms-temp` then upload to `dms-documents` with `upsert: false`. The temp object is not deleted during approve. Cleanup is handled separately by DMS cleanup logic.

Failure observations:

- If storage download fails after single-file document insert, code deletes `dms_documents`.
- If final upload fails after single-file document insert, code deletes `dms_documents`.
- If final upload succeeds but a later DB insert fails, final storage object can become orphaned.
- In batch finalize, if final upload fails, status is reverted to draft; if DB rows fail after upload, final object can become orphaned and draft/active state can diverge.

## 10. Current Standard File Naming and Numbering Audit

Numbering:

- `generate_next_reference_number` is called with `MASTER_DMS_DOCUMENT`.
- The DMS standard requires document numbers to be generated server-side.
- `global_numbering_rules.allow_gaps` is true in live schema, so skipped numbers are acceptable and should not be reused.
- Number allocation happens before core document writes in the single-file path and before draft creation in batch draft creation.

Standard filename:

- `resolveStandardFileNameForIntakeApprove` loads document type, AI result fields, metadata definitions, batch entity context, owner/entity data, metadata values, and user override.
- `validateStandardFileName` enforces owner, document number token, and expiry token where required.
- Format implemented by `standard-file-name.ts`: `{Document_type}_{Owner}_{DOC_NO}_{Expiry}.{ext}`.
- No-expiry types use `NoExpiry`.
- Filename is display metadata in `dms_document_files.file_name`; storage path remains deterministic and not user-supplied.

Duplicate name handling:

- `bulkRenameDocumentsToStandardFileNames` uses `dedupeFileName` within a bulk run.
- Approve-time code does not explicitly dedupe `file_name` across documents, but storage path uniqueness is based on `documentId` and version path.

## 11. Current Error Handling and Partial Failure Audit

| Failure | Current behavior |
|---|---|
| Validation/auth/type/date/name failure | Returns error before production document/storage writes |
| Number generation failure | Returns error before document insert |
| Single-file document insert failure | Returns error |
| Temp storage download failure | Deletes inserted document; no event/audit |
| Final storage upload failure | Deletes inserted document; no final object if upload failed |
| Version insert failure after upload | Deletes document only; final storage object can remain |
| File row insert failure after upload/version | Deletes document only; final storage object can remain |
| `current_version_id` update failure | Not checked |
| Metadata upsert failure | Logged non-fatal in single-file; unchecked in batch |
| Tag/link insert failure | Unchecked |
| Reminder upsert failure | Unchecked |
| AI result accepted update failure | Unchecked |
| OCR/content sync failure | Caught and logged as non-fatal |
| Upload session final update failure | Unchecked; document may be active but session not approved |
| Document events failure | Unchecked |
| Audit failure | Depends on `logAudit`; no compensation |
| Batch status recompute failure | Best effort / unchecked |

The highest-risk partial states are:

- Final file object exists with no DB file row.
- Active document exists without `current_version_id`.
- Active document exists but upload session is not approved.
- Metadata/tags/links/reminders missing after success response.
- AI result remains pending after approved document is created.
- Duplicate documents can be created if two requests race before `intake_status` changes to approved.

## 12. Transaction Strategy Options Compared

| Option | Description | Pros | Cons |
|---|---|---|---|
| A. Full Postgres RPC transaction | Move all DB writes into one function | Strong DB atomicity; easy rollback for DB state | Cannot include Supabase Storage; JSON payload complexity; SECURITY DEFINER/RLS complexity |
| B. TypeScript saga with compensation | Keep all logic in server action | Easier incremental refactor; storage compensation possible | DB core still not atomic; many unchecked steps unless heavily refactored |
| C. Hybrid RPC + server saga | Server action validates/copies storage; RPC commits core DB state | Best balance; storage handled outside DB; core DB writes atomic; reusable by single/batch | Requires migration, RPC payload design, idempotency locks, careful grants |

## 13. Recommended Transaction Strategy

Recommend **Option C: Hybrid RPC + Server Saga**.

Rationale:

- Postgres cannot roll back Supabase Storage object writes.
- The most important DB state must be atomic: document, version, file, metadata, tags, links, reminders, AI result accepted, upload session approved, event rows.
- A server action should remain responsible for auth, path validation, standard filename resolution, storage copy, and storage cleanup on DB failure.
- The RPC should be idempotent and own duplicate prevention by locking the upload session row.

## 14. Target Approve & Save Command Chain

Target sequence:

1. Validate auth and permission.
2. Validate Zod input.
3. Load and lock-eligible upload session context.
4. If already approved with document, return existing document.
5. Reject discarded/cancelled/expired sessions.
6. Validate active document type/category.
7. Validate date and required field rules.
8. Generate or reserve `document_no`.
9. Resolve and validate standard filename.
10. Verify temp storage path exists and final path is deterministic.
11. Prepare core DB payload in memory.
12. Copy `dms-temp` object to `dms-documents` with `upsert: false`.
13. Call atomic RPC `approve_dms_ai_intake`.
14. If RPC fails, remove the copied final object where possible and record sanitized failure status.
15. If RPC succeeds, run OCR/content sync as post-commit best-effort.
16. Optionally trigger only the existing feature-flagged orchestration hook later; do not automate new tabs in Phase 4.
17. Revalidate paths and return final `documentId` and `documentNo`.

## 15. Transaction Boundary Plan

Inside the atomic DB transaction/RPC:

- Lock `dms_upload_sessions` row by ID.
- Detect already approved session and return existing document.
- Verify status transition is still allowed.
- Insert/update `dms_documents`.
- Insert `dms_document_versions`.
- Insert `dms_document_files`.
- Update `dms_documents.current_version_id`.
- Upsert `dms_document_metadata_values`.
- Insert/upsert `dms_document_tags`.
- Insert/upsert `dms_document_links`.
- Upsert `dms_expiry_reminders`.
- Update `dms_ai_extraction_results` to accepted.
- Update `dms_upload_sessions` to approved with `document_id`.
- Insert core `dms_document_events`.
- Optionally insert a compact audit row if existing audit helper cannot participate.

Outside the DB transaction:

- Auth context and permission checks in server action.
- File download/upload/copy in Supabase Storage.
- Cleanup of copied final file if RPC fails.
- OCR/content sync.
- Summary/intelligence/embedding/tag/link suggestions.
- UI revalidation and routing.

## 16. Storage Compensation Plan

Storage compensation must be explicit because DB rollback cannot remove storage objects.

Plan:

1. Build final path only from trusted server data: company/year/type/document/version/extension.
2. Use `upsert: false`.
3. Track `finalBucket` and `finalPath` in memory before RPC call.
4. If final upload succeeds but RPC fails, call `admin.storage.from("dms-documents").remove([finalPath])`.
5. Log sanitized compensation outcome to `dms_approve_runs` or session approve fields.
6. Do not delete from `dms-temp` during approval; existing cleanup handles temp lifecycle.
7. If cleanup fails, retain a recoverable `approve_status = failed_storage_cleanup` or approve-run event for admin cleanup.
8. Never remove an object when the RPC succeeded and `dms_document_files` points to it.

## 17. Idempotency and Retry Plan

Recommended idempotency anchors:

- `dms_upload_sessions.id` is the primary idempotency key.
- Add `dms_upload_sessions.approve_run_id` and/or `dms_approve_runs`.
- Add a partial unique guard so only one approved document may be created per upload session.
- RPC must `SELECT ... FOR UPDATE` the upload session row.
- If `intake_status = approved` and `document_id` exists, return existing document.
- If approve status is `processing` and run is recent, return a clear "approval already in progress" error.
- If a previous run copied storage but DB failed, retry should either reuse the same deterministic final path after cleanup or clean before retry.
- If DB succeeded but the client lost the response, retry returns the approved document.

Recommended new migration artifacts:

- `dms_approve_runs` for detailed run/stage tracking.
- `dms_upload_sessions.approve_run_id`, `approve_status`, `approve_error`, `approved_at`.
- Optional partial unique index on approved session/document state if expressible without blocking drafts.

## 18. UI / UX Plan

Minimal UI changes only:

- Disable Approve & Save while request is pending.
- Prevent double-click by local pending state and server idempotency.
- Show clear failure messages with retry guidance.
- If session already approved, show existing document and route/open the record.
- Do not redesign intake review screen.
- Do not add long progress UI in Phase 4 unless approve runs become visible; a simple step message is enough.
- Keep human review required; no auto-approve, no bulk approve.

## 19. RLS / Security Plan

Permission boundary:

- Server action must require `dms.documents.review_ai` or `dms.documents.upload` or `dms.admin` or `system_admin` as currently allowed.
- If RPC is `SECURITY DEFINER`, it must validate caller identity using `auth.uid()` and/or profile helper functions.
- Grant execute only to `authenticated`.
- Keep RLS enabled and forced on all tables.
- Avoid broad service-role-only logic except storage operations already performed by admin client after app-layer authorization.
- Do not accept arbitrary final storage paths from the client.
- Do not log OCR text, prompts, full raw AI response, API keys, or sensitive extracted values.

RPC security choices:

- Prefer a private helper function in an unexposed schema if project convention allows it.
- If in `public`, keep a narrow function signature, strict validation, and limited grants.
- Server action should still perform permission checks before RPC.

## 20. Audit Logging Plan

Add stage-level audit without sensitive content:

| Event | Storage |
|---|---|
| `approve_save_started` | `dms_approve_runs`, optional `audit_logs` |
| `approve_save_validation_passed` | `dms_approve_runs` |
| `approve_save_storage_copied` | `dms_approve_runs` |
| `approve_save_db_transaction_started` | `dms_approve_runs` |
| `approve_save_db_transaction_completed` | `dms_approve_runs`, `dms_document_events` |
| `approve_save_post_commit_started` | `dms_approve_runs` |
| `approve_save_completed` | `dms_approve_runs`, `dms_document_events`, `audit_logs` |
| `approve_save_failed` | `dms_approve_runs`, sanitized error |
| `approve_save_retry` | `dms_approve_runs` |
| `approve_save_already_approved` | `dms_approve_runs` or audit only |

Do not store OCR text, full prompts, raw AI output, or reviewed field values in approve-run stage logs. Counts and IDs are acceptable.

## 21. Batch Alignment Plan

Phase 4 implementation should include batch finalization alignment only to the extent needed to reuse the same core approve service/RPC. It should not implement bulk approval.

Recommended:

- Extract shared preparation and validation code into `src/lib/dms/approve/*`.
- Single-file approve and batch finalize both call the same RPC for core DB writes.
- Batch draft creation may remain as-is initially, but finalization should not have a separate DB write chain.
- Recompute batch status after successful core commit.
- Keep one-by-one approval rule.

If implementation time is constrained, prioritize single-file approve first, then batch finalize in the same Phase 4 only if the RPC can support "existing draft document" mode safely.

## 22. Post-Commit and Orchestration Boundary

Phase 4 core transaction should end when the document/file/metadata/session/AI-result state is consistent.

Post-commit best-effort:

- `persistFileOcrResult`
- `writeDocumentContentTextSystem`
- existing feature-flagged `runDmsAiOrchestrationPostDraft` hook, only if already used

Defer:

- AI summary automation changes
- document intelligence automation changes
- semantic chunks
- embedding workflow changes
- tag/link suggestion automation changes
- apply-to-metadata
- review queue UI

## 23. Proposed Database Changes / RPC Plan

Recommended migration name:

```text
erp_dms_ai_phase4_transactional_approve_save
```

Recommended table:

```text
dms_approve_runs
```

Proposed columns:

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT identity PK | Project standard |
| `upload_session_id` | BIGINT FK `dms_upload_sessions(id)` | Required |
| `document_id` | BIGINT FK `dms_documents(id)` | Nullable until success |
| `ai_result_id` | BIGINT FK `dms_ai_extraction_results(id)` | Nullable |
| `run_key` | TEXT unique | Idempotency/run correlation |
| `status` | TEXT | `started`, `storage_copied`, `db_committed`, `completed`, `failed`, `failed_storage_cleanup` |
| `stage` | TEXT | Last stage |
| `final_storage_bucket` | TEXT | Usually `dms-documents` |
| `final_storage_path` | TEXT | No signed URL |
| `error_code` | TEXT | Sanitized |
| `error_message` | TEXT | Sanitized/truncated |
| `metadata_json` | JSONB | Counts/IDs only |
| `started_by` | BIGINT FK `user_profiles(id)` | User |
| `started_at` | TIMESTAMPTZ | Default now |
| `completed_at` | TIMESTAMPTZ | Nullable |
| `created_at`, `updated_at` | TIMESTAMPTZ | Standard |

Recommended upload session columns:

| Column | Type | Notes |
|---|---|---|
| `approve_run_id` | BIGINT FK `dms_approve_runs(id)` | Latest run |
| `approve_status` | TEXT | Recovery state |
| `approve_error` | TEXT | Sanitized last error |
| `approved_at` | TIMESTAMPTZ | Distinct from `completed_at` |

Recommended RPC:

```text
approve_dms_ai_intake(p_payload jsonb)
```

RPC responsibilities:

- Lock upload session.
- Return existing approved document if already approved.
- Validate allowed transition.
- Apply core DB writes atomically.
- Return `document_id`, `document_no`, and status.

Fresh install compatibility:

- All migration SQL must be idempotent where possible.
- RLS enabled and forced on new table.
- Policies scoped to upload owner/review/admin/system admin.

Rollback:

- New nullable columns can be left unused if rollback needed.
- `dms_approve_runs` is additive audit/recovery data; do not drop in production rollback unless explicitly approved.

## 24. Proposed Server Action and Service Refactor Plan

Proposed files:

| File | Role |
|---|---|
| `src/server/actions/dms/ai-intake.ts` | Keep exported action wrapper; reduce inline approve chain |
| `src/server/actions/dms/batch-intake.ts` | Keep exported batch wrapper; call shared approve service |
| `src/lib/dms/approve/approve-ai-intake.ts` | Main orchestration service |
| `src/lib/dms/approve/approve-ai-intake-payload.ts` | RPC payload builder/types |
| `src/lib/dms/approve/approve-ai-intake-storage.ts` | Storage copy/cleanup helpers |
| `src/lib/dms/approve/approve-ai-intake-validation.ts` | Reusable validation helpers |
| `src/lib/dms/approve/approve-ai-intake-events.ts` | Run/event metadata helpers |

Server action responsibilities:

- Auth, permission, Zod input.
- Load user/profile context.
- Call approve service.
- Revalidate paths.
- Return `ActionResult`.

Shared service responsibilities:

- Load session/type/AI context.
- Resolve filename and document number.
- Prepare final path and RPC payload.
- Copy storage.
- Call RPC.
- Cleanup on RPC failure.
- Run post-commit best-effort content sync.

## 25. Backward Compatibility Plan

- Existing upload sessions without approve columns continue to load because new columns are nullable/defaulted.
- Existing approved sessions continue to return by `intake_status = approved` and `document_id`.
- Existing batch drafts remain valid; finalization must support existing `pending_ai_review` documents.
- Existing AI results remain accepted by the same `ai_status/review_action` fields.
- Existing `raw_response_json` schema is unchanged.
- Existing `dms_document_files.file_name` display behavior remains unchanged.
- `MASTER_DMS_DOCUMENT` remains the numbering source; gaps remain allowed.

## 26. Implementation Sequence for Future Phase 4 Execution

1. Read this plan and Phase 4 implementation prompt.
2. Create additive migration for approve-run state, RLS, indexes, and RPC.
3. Apply migration to local/live environment only when implementation prompt authorizes it.
4. Add TypeScript approve service modules.
5. Refactor `approveAiIntakeAndCreateDocument` to call shared service.
6. Refactor `finalizeDraftIntake` to call same service or supported RPC mode.
7. Add UI pending-state/double-click guard only if existing form is insufficient.
8. Add focused tests/manual fault-injection checklist.
9. Run typecheck/build/lint as requested by implementation prompt.
10. Write implementation report and update DMS AI source of truth.

## 27. Acceptance Criteria for Future Implementation

| ID | Criterion |
|---|---|
| AC-01 | Approve & Save prevents duplicate document creation from the same upload session |
| AC-02 | If validation fails, no storage or DB writes happen |
| AC-03 | If storage copy fails, no final DB document is created or promoted |
| AC-04 | If DB transaction fails after storage copy, copied final file is cleaned up where possible |
| AC-05 | Core DB writes are atomic or protected by explicit saga compensation |
| AC-06 | Document, version, file, metadata, tags, links, reminders, AI result, and session statuses remain consistent |
| AC-07 | Standard file naming remains enforced |
| AC-08 | Original filename remains preserved on upload session; final display name remains in file row |
| AC-09 | User double-click does not create duplicate documents |
| AC-10 | Retry after uncertain failure returns existing document or resumes safely |
| AC-11 | Human approval remains required before final save |
| AC-12 | AI cannot approve or final-save automatically |
| AC-13 | Permissions and RLS remain safe |
| AC-14 | No unrelated Phase 5+ orchestration automation is implemented |
| AC-15 | Typecheck/build pass after implementation |

## 28. Full Test Plan

| Test | Purpose | Setup | Steps | Expected DB state | Expected storage state | Expected UI state | Risk covered |
|---|---|---|---|---|---|---|---|
| TP-01 successful single approve | Verify happy path | One review-pending upload session with temp file and AI result | Click Approve & Save | Document active; version/file/metadata/session/AI result consistent | Final object exists; temp remains for cleanup | Routes to document record | Baseline |
| TP-02 missing permission | Ensure auth gate | User without upload/review/admin | Submit approve | No DB writes | No storage writes | Permission error | Security |
| TP-03 invalid session | Reject bad session | Use deleted/missing session | Submit approve | No DB writes | No storage writes | Error shown | Validation |
| TP-04 already approved session | Idempotent retry | Session approved with document_id | Submit approve again | Same document returned; no duplicate | No new object | Opens existing document | Retry |
| TP-05 double-click approve | Race prevention | Slow network/browser double click | Trigger two requests | One document only; second returns existing/in-progress | One final object | Button disabled / no duplicate | Duplicate prevention |
| TP-06 standard filename failure | Stop before writes | Required owner/doc/expiry missing | Submit approve | No document/version/file/session approval | No final object | Missing segment message | Naming |
| TP-07 temp file missing | Storage precondition | Session temp path points to missing object | Submit approve | No final document committed | No final object | Temp file error | Storage |
| TP-08 storage upload failure | Stop before DB commit | Force final upload failure | Submit approve | No core DB commit | No final object | Storage error | Storage |
| TP-09 RPC document insert failure | Cleanup after copy | Force DB/RPC failure after storage copy | Submit approve | No partial DB state | Final object removed or cleanup failure recorded | Retry-safe error | Compensation |
| TP-10 metadata failure | Atomic rollback | Invalid metadata definition payload | Submit approve | Whole core transaction rolls back | Final object cleaned | Error shown | DB atomicity |
| TP-11 AI result update failure | Atomic rollback | Force AI result FK/status failure | Submit approve | No approved document/session without AI acceptance | Final object cleaned | Error shown | Consistency |
| TP-12 session update failure | Atomic rollback | Force session update conflict | Submit approve | No active document without approved session | Final object cleaned | Error shown | Consistency |
| TP-13 audit/event failure | Define behavior | Force event insert failure | Submit approve | Either full rollback or approved with run failure per design | Final object matches DB | Clear result | Audit |
| TP-14 post-commit OCR failure | Non-fatal post-commit | Make OCR/content sync fail | Submit approve | Core approve remains committed | Final object exists | Success with optional warning/log | Boundary |
| TP-15 retry after storage copied DB failed | Recovery | Simulate copied final path and failed RPC | Retry approve | Either cleanup then commit or safe resume | No orphan after retry | Success or clear cleanup error | Recovery |
| TP-16 retry after DB succeeded response failed | Response-loss idempotency | Kill client after RPC success | Retry approve | Existing approved document returned | Existing final object reused | Existing doc opens | Network |
| TP-17 tags/links/reminders saved | Ensure side tables inside transaction | Use tags, links, expiry | Submit approve | All side rows present | Final object exists | Document tabs show values | Completeness |
| TP-18 batch finalize happy path | Align batch | Existing batch draft | Finalize one draft | Draft active; session approved; batch counts updated | Final object exists | One draft approved | Batch |
| TP-19 batch finalize storage failure | Batch compensation | Existing draft, storage failure | Finalize | Draft not left active incorrectly | No final object | Retry possible | Batch recovery |
| TP-20 existing metadata preserved | Avoid data loss | Draft with user-edited values | Approve | Approved metadata equals reviewed values | Final object exists | Values visible in record | Human review |
| TP-21 typecheck | Compile safety | Implementation complete | `npm run typecheck` | N/A | N/A | Pass | TS |
| TP-22 lint | Code quality | Implementation complete | `npm run lint` | N/A | N/A | No new relevant errors documented | Quality |
| TP-23 build | Production build | Implementation complete | `npm run build` | N/A | N/A | Pass | Release |

Each failure test must verify both database state and storage state after the failure. Storage orphan checks should query/list the deterministic final path.

## 29. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| RPC JSON payload becomes too complex | Define narrow typed payload and validate both TypeScript and SQL side |
| SECURITY DEFINER bypasses RLS too broadly | Server-side permission check plus internal caller validation and narrow grants |
| Storage cleanup fails after RPC failure | Persist approve-run status for admin cleanup and retry |
| Number gaps increase | Accept gaps under `global_numbering_rules.allow_gaps`; never reuse numbers |
| Batch draft path differs too much | Support existing-draft mode explicitly or defer batch refactor with documented gap |
| Audit logs store sensitive values | Store IDs/counts/status only; no OCR/prompt/raw field values |
| Race condition still possible | Lock upload session row in RPC and make approved retry return existing document |

## 30. What Must Not Be Implemented in Phase 4

```text
async job queue
AI tab automation
AI Analysis apply-to-metadata
semantic chunks
review queue UI
ERP mapping UI
ERP mapping apply logic
child rule tables
Azure OCR wiring
OCR history
page-level OCR
bulk auto-approve
auto-save AI results
auto-overwrite approved metadata
major UI redesign
unrelated refactoring
full orchestration unification
AI tab status automation
public AI API routes
direct OpenAI SDK usage in DMS feature code
```

## 31. Recommended Next Cursor Implementation Prompt

Use a Phase 4 implementation prompt that requires:

1. Read this plan, current source of truth, Phase 3 report, DMS standards, AI settings standard, and relevant migrations.
2. Implement Hybrid Option C only.
3. Add the additive migration and RPC.
4. Refactor single-file approve first.
5. Align batch finalize with the same core service/RPC if feasible in the same phase.
6. Add storage compensation and idempotency.
7. Keep OCR/content sync post-commit best-effort.
8. Do not implement Phase 5+ features.
9. Run typecheck and build.
10. Create implementation report and update source of truth.

## 32. Final Recommendation

Proceed with Phase 4 implementation using **Hybrid Option C**: a TypeScript approval saga for validation and storage, plus a narrow atomic Postgres RPC for core DB writes.

The minimum production-safe outcome is:

- One core approve path shared by single-file and batch finalization where feasible.
- Session-row locking and idempotency.
- Atomic DB consistency for document, version, file, metadata, links, tags, reminders, AI result, upload session, and event state.
- Explicit storage cleanup if DB commit fails.
- Human-review-first governance preserved.

Planning status: complete. Ready for ChatGPT review before implementation.

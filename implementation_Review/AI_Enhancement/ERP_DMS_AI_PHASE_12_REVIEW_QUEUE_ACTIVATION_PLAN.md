# ERP DMS AI Phase 12 — Review Queue Activation Plan

**Created:** 2026-06-25  
**Author:** Cursor AI Agent (planning-only mode)  
**Status:** PLANNING — no implementation performed  
**Prior phase:** Phase 11 — Semantic Chunking and Embeddings (LIVE PASS / CLOSED)  
**Next phase:** Phase 13 — Validation, Conflict Detection, Owner Matching (FUTURE)

---

## 1. Executive Summary

Phase 12 activates the existing but completely unused `dms_review_queue` table into a functional, human-first AI review workflow. The queue aggregates actionable items from five live sources: AI intake (low confidence/missing required fields), AI Analysis pending review, OCR failures, semantic indexing failures, and failed/stalled AI job queue entries.

The activation requires:
1. **One migration** to extend the current 14-column stub table with ~19 additional columns (review_type, idempotency_key, source/reason fields, assignment tracking, resolution tracking, SLA fields).
2. **New server actions** in `src/server/actions/dms/review-queue.ts` (read/write queue + upsert helper).
3. **New Review Queue page** at `/dms/review-queue` — list, filter, and item detail drawer.
4. **Queue generation hooks** inserted as best-effort non-blocking calls in five existing trigger points.
5. **Minimal notifications** via `erp_notifications` for critical/high items and assignment events.
6. **No ERP record writes. No auto-approval. No auto-resolve. Human-review-first.**

The `DMS_AI_REVIEW` feature flag already exists in the live database (`is_enabled = true`) — confirming intent. Zero code references it today. Phase 12 wires it up.

---

## 2. Planning Scope and Non-Implementation Rule

This document is a **planning-only artifact**.

No source code, migrations, schema changes, server actions, UI components, or feature flag modifications are introduced in this document or in the conversation that produced it.

This plan will be uploaded to ChatGPT for review before any implementation begins.

---

## 3. Files and Source-of-Truth Reviewed

### Source-of-truth documents read:
- `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` (post-Phase-11, 2026-06-25)
- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` (workspace rules)
- `implementation_Review/ERP_DMS_AI_PHASE_11_UAT_BLOCKER_FIX_AND_FINAL_VERIFICATION_REPORT.md`
- `implementation_Review/ERP_DMS_AI_PHASE_11_SEMANTIC_CHUNKING_AND_EMBEDDINGS_IMPLEMENTATION_REPORT.md`

### Migrations read:
- `20260614192000_erp_dms_2_database_foundation_rls_numbering_storage_buckets.sql` — defines `dms_review_queue` (Section 14), RLS policies
- `20260615040000_erp_dms_11_ai_first_intake.sql` — intake columns, `dms_intake_review_values`
- `20260615020000_erp_dms_10_ai_classification_extraction_foundation.sql` — `dms_ai_extraction_results.ai_status`, DMS AI permissions
- `20260622130000_erp_dms_ai_phase7_apply_history.sql` — `dms_ai_metadata_apply_runs`, `dms_ai_metadata_apply_items`
- `20260622150000_erp_dms_ai_phase9_job_queue.sql` — `dms_ai_job_queue`, job statuses
- `20260622152000_erp_dms_ai_phase9_feature_flags.sql` — DMS_AI_JOB_QUEUE flags
- `20260615001626_erp_notifications_1_global_notification_email_delivery_engine.sql` — `erp_notifications`, `erp_email_queue`
- `20260614224102_erp_dms_8_expiry_renewal_notifications.sql` — `dms_notification_queue`
- `20260622100000_erp_dms_14_rls_parity_backfill.sql` — RLS parity for expiry/notif/renewal tables
- `20260616180000_erp_common_ai_0_governance_feature_flags_permissions.sql` — Common AI permissions
- `20260625100000_erp_dms_ai_phase11_semantic_chunks.sql` — `dms_document_content_chunks`

### Server actions read (headers/permission sections):
- `src/server/actions/dms/ai-intake.ts` — intake permission helpers, review lifecycle
- `src/server/actions/dms/ai-analysis.ts` — AI extraction result types, `ai_status` lifecycle
- `src/server/actions/dms/ai-jobs.ts` — Phase 9 job queue server actions
- `src/server/actions/dms/orchestration.ts` — orchestration permission helpers
- `src/server/actions/dms/notifications.ts` — DMS notification types and helpers
- `src/server/actions/dms/intelligence-admin.ts` — admin backfill/stats patterns

### Library files read:
- `src/lib/dms/ai-jobs/job-types.ts` — job types, statuses, retry error codes
- `src/lib/dms/ai-jobs/job-runner.ts` — enqueueing patterns, error sanitization
- `src/lib/dms/metadata/metadata-diff.ts` — diff state taxonomy
- `src/lib/dms/semantic/semantic-indexer.ts` — indexing result shape (partial/failed)

### Live database verified via Supabase MCP (`user-supabase`):
- `dms_review_queue` column list — confirmed 14 columns, 0 rows
- `pg_class` — `relrowsecurity = true`, `relforcerowsecurity = true`
- `pg_policies` — 2 policies (select + manage), both gated on `dms.documents.review_ai OR system_admin`
- `pg_indexes` — 2 indexes (status, assigned_to)
- `erp_ai_feature_flags` — `DMS_AI_REVIEW = true` (already live)
- `permissions` — full DMS permission list, no dedicated review_queue permissions yet

### UI/features directories scanned:
- `src/features/dms/admin/` — 12 admin UI files, no review_queue file
- `src/features/dms/intake/` — 7 intake UI files
- `src/features/dms/documents/sections/` — 20 document section files
- `src/app/(protected)/dms/` — inbox, inbox/batches, documents routes; NO review-queue route

### Code search results:
- `grep "dms_review_queue" src/` → **0 matches** (table is completely unused in application code)
- `grep "DMS_AI_REVIEW" src/` → **0 matches** (feature flag exists in DB but is not checked anywhere)

---

## 4. Current Review Queue Inventory

### 4.1 Table Schema — Live Verified

```
Table: public.dms_review_queue
RLS: enabled + FORCE ROW LEVEL SECURITY = true
Row count: 0
```

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | bigint (identity PK) | NOT NULL | — |
| upload_session_id | bigint FK → dms_upload_sessions.id | YES | — |
| document_id | bigint FK → dms_documents.id | YES | — |
| assigned_to | bigint FK → user_profiles.id | YES | — |
| priority | text | NOT NULL | `'normal'` |
| status | text | NOT NULL | `'pending'` |
| queued_at | timestamptz | NOT NULL | `now()` |
| review_started_at | timestamptz | YES | — |
| review_completed_at | timestamptz | YES | — |
| notes | text | YES | — |
| created_by | bigint FK → user_profiles.id | YES | — |
| created_at | timestamptz | NOT NULL | `now()` |
| updated_at | timestamptz | NOT NULL | `now()` |
| deleted_at | timestamptz | YES | — |

**Documented status values** (from migration comment): `pending | in_review | completed | cancelled`  
**Documented priority values** (from migration comment): `urgent | high | normal | low`

### 4.2 Current RLS Policies

| Policy | Command | Gate |
|---|---|---|
| `dms_review_queue_select` | SELECT | `auth.uid() IS NOT NULL AND (review_ai OR system_admin)` |
| `dms_review_queue_manage` | ALL | `review_ai OR system_admin` |

### 4.3 Current Indexes

| Index | Column |
|---|---|
| `idx_dms_review_queue_status` | `status` |
| `idx_dms_review_queue_assigned` | `assigned_to` WHERE NOT NULL |

### 4.4 Application Code References

**Zero.** The table exists in the database but is not imported, queried, or referenced anywhere in `src/`. There are no:
- Server actions for it
- Type definitions for it
- UI components for it
- Route pages for it

### 4.5 Feature Flag Status

`DMS_AI_REVIEW` feature flag exists in `erp_ai_feature_flags` with `is_enabled = true`.  
It is not checked by any code. Phase 12 must wire this flag to gate the entire review queue.

### 4.6 Assessment: Schema Is Insufficient for Production Use

The current table is a **minimal stub** created in DMS.2 (June 2026) as a placeholder. It lacks:
- Any way to identify **why** an item is in the queue (`review_type`, `reason_code`, `reason_message`)
- Any way to identify **which source** created the item (`source_type`, `source_id`)
- **Idempotency key** — duplicates cannot be prevented
- Linkages to `dms_ai_extraction_results` (AI result), `dms_ai_job_queue` (Phase 9 jobs), `dms_metadata_definitions` (field-level review)
- Assignment timestamps (`assigned_at`), reviewer identity (`reviewed_by`, `reviewed_at`)
- Resolution data (`resolved_at`, `resolution_code`, `resolution_note`)
- SLA field (`due_at`)
- AI confidence (`confidence`)
- Safe metadata payload (`payload_json`)
- `updated_by` for audit

**Status vocabulary is also insufficient.** The current status set `pending | in_review | completed | cancelled` needs renaming and extension.

**Conclusion:** The table must be extended by migration before any application code can use it. The existing columns are safe to keep; only additive changes are needed.

---

## 5. Current AI Review Sources

The following review-worthy conditions already exist in live code. Phase 12 will selectively tap these as queue item sources.

### 5.1 AI Intake — Low Confidence / Missing Required

**Table:** `dms_upload_sessions` + `dms_intake_review_values` + `dms_ai_extraction_results`

**Trigger points:**
- After AI intake completes, `intake_status` → `review_pending`
- User reviews on `/dms/intake/[sessionCode]`
- `dms_intake_review_values` rows per field with `confidence_score`, `review_status`
- `dms_metadata_definitions.review_required_if_missing = true` — field is required by policy
- `dms_metadata_definitions.review_required_if_low_confidence = true` — field requires review if AI confidence is below threshold
- `dms_metadata_definitions.ai_confidence_threshold` — per-field threshold
- `dms_ai_extraction_results.classification_confidence` — overall classification confidence (`high | medium | low`)

**Review-worthy conditions:**
1. Classification confidence is `low` or `medium` (alternative types exist)
2. Any intake field where `review_required_if_missing = true` AND AI value is null
3. Any intake field where `review_required_if_low_confidence = true` AND confidence below threshold

**Current code location:** `src/server/actions/dms/ai-intake.ts` — `startAiIntakeFromUploadSession`, `rerunMetadataExtractionForIntakeSession`

**Phase 12 scope:** Create queue items for intake sessions that reach `review_pending` with low-confidence or missing required fields. Each field that triggers review gets its own queue item (idempotency key per field per session).

### 5.2 AI Analysis — Pending Review / Apply-to-Metadata Diff Issues

**Table:** `dms_ai_extraction_results`

**Status lifecycle:** `pending_review` → `accepted` / `superseded`

**Trigger points:**
- After `runDmsAiAnalysisForDocument()` produces a result with `ai_status = 'pending_review'`
- After `applyAiAnalysisToMetadata()` — diff items with status `conflict` or `low_confidence` are blocked from apply

**Review-worthy conditions:**
1. AI extraction result reaches `pending_review` with low overall confidence
2. Metadata diff contains `conflict` rows (AI value fails type conversion)
3. Metadata diff contains `low_confidence` rows on `review_required_if_low_confidence` fields
4. Metadata diff contains `new` rows on `is_required` fields that are not being applied

**Phase 12 scope:** Create queue items per result (one item) for classification review and per-field items for conflict/low-confidence fields.

### 5.3 OCR Failures

**Table:** `dms_document_files` (per-file OCR), `dms_ai_extraction_jobs` (job tracking)

**Review-worthy conditions:**
1. File OCR fails (`status = 'failed'` on extraction job with `run_source = 'ocr'`)
2. File has no `ocr_text` after OCR job ran
3. Admin backfill reports file OCR failure (from `adminBackfillMissingOcrText`)

**Phase 12 scope:** Create queue items for OCR-failed files. One item per file (idempotency by file_id).

### 5.4 Semantic Indexing Failures

**Table:** `dms_ai_job_queue` (Phase 9), `dms_document_content_chunks`

**`SemanticDocumentIndexResult.status`**: `"indexed" | "skipped" | "partial" | "failed"`

**Review-worthy conditions:**
1. `semantic_document_index` job fails permanently (`job_status = 'failed'`, attempts exhausted)
2. Semantic indexer returns `status = 'partial'` with `chunksFailed > 0`

**Phase 12 scope:** Create one queue item per document for a failed/partial semantic indexing attempt.

### 5.5 AI Job Queue Failures

**Table:** `dms_ai_job_queue` (Phase 9)

**Job statuses:** `queued | running | retry_scheduled | completed | failed | cancelled | superseded`

**Review-worthy conditions:**
1. Any job reaches `job_status = 'failed'` (all retry attempts exhausted)
2. Jobs in `retry_scheduled` status for more than a configurable duration (potential stuck jobs)

**Job types in scope:**
- `post_approve_orchestration` — failed orchestration after approval
- `ocr_backfill` — failed OCR backfill
- `semantic_document_index` — failed semantic indexing
- `ai_summary`, `ai_intelligence`, `embedding`, `tag_suggestions`, `link_suggestions` — informational failures (lower priority)

**Phase 12 scope:** Create one queue item per failed job (idempotency by job_id). Priority mapped from job type criticality.

### 5.6 Out-of-Scope for Phase 12 (Deferred)

| Review source | Deferred to |
|---|---|
| Validation/conflict detection (schema vs. metadata) | Phase 13 |
| Owner matching conflicts (AI entity vs. party master) | Phase 13 |
| Token/cost anomalies | Phase 14 |
| Apply-to-ERP readiness items | Phase 16 |
| Duplicate document detection items | Phase 13 |

---

## 6. Current Gaps and Risks

| Gap | Severity | Notes |
|---|---|---|
| `dms_review_queue` schema insufficient | HIGH | 19 columns missing; migration required before any code can write items |
| No idempotency key on table | HIGH | Duplicate items will be created on retries without it |
| Status vocabulary mismatches planning needs | MEDIUM | `completed` should be split to `resolved` + `dismissed`; `superseded` needs to be added |
| No review_type column | HIGH | Cannot distinguish intake/analysis/ocr/semantic/job items |
| No dedicated permissions | MEDIUM | Current RLS uses only `dms.documents.review_ai`; no granular view/manage/assign/resolve split |
| No server actions | HIGH | Zero code in `src/server/actions/dms/` for review queue operations |
| No UI page or route | HIGH | `/dms/review-queue` does not exist |
| No sidebar entry | MEDIUM | DMS sidebar has no Review Queue link |
| `DMS_AI_REVIEW` flag not checked | LOW | Flag is live and enabled; no code reads it |
| No notification integration | LOW | `erp_notifications` exists but no review-queue events are emitted |
| No queue generation hooks in existing actions | HIGH | No existing action calls any helper to create queue items |
| dms_review_queue has no `review_type` check constraint | MEDIUM | Should be added when column is added to prevent garbage values |

---

## 7. Recommended Queue Item Types

Based on the live code audit, the following `review_type` values are recommended for Phase 12:

```
intake_classification_review      — low-confidence classification at intake
intake_metadata_review            — low-confidence or missing required field at intake
ai_analysis_metadata_review       — conflict/low-confidence diff row from AI Analysis
ocr_failure_review                — file-level OCR failure
semantic_index_review             — document-level semantic indexing failure (partial or failed)
ai_job_failure_review             — Phase 9 job queue entry in 'failed' status
```

Future Phase 13/16 reserved values (do NOT insert in Phase 12 migration):

```
validation_conflict_review        — Phase 13
owner_matching_review             — Phase 13
apply_to_erp_review               — Phase 16
```

**Implementation rule:** The `review_type` column must have a CHECK constraint in the migration. The constraint should list only Phase 12 values initially; Phase 13+ types are added by later migrations.

**No frontend-only enums.** All valid types must be enforced at DB level.

---

## 8. Queue Status Workflow

### 8.1 Recommended Status Vocabulary

Replace the current `pending | in_review | completed | cancelled` with:

```
open          — item created, awaiting assignment or direct action
assigned      — assigned to a specific reviewer (assigned_to populated)
in_review     — reviewer has started reviewing
resolved      — reviewer took a positive action (accepted, applied, corrected)
dismissed     — reviewer confirmed the item is not actionable (no correction needed)
superseded    — source issue no longer applies (e.g. document re-approved, job requeued successfully)
cancelled     — queue item explicitly cancelled by admin (not by resolution)
```

**Migration strategy:** The current values `pending`, `in_review`, `completed`, `cancelled` must be either:
- Remapped: rename `pending` → `open`, rename `completed` → `resolved` via a check constraint that accepts both during transition
- Or added to the check constraint alongside old values with a comment marking old values as deprecated

**Recommended:** Add all 7 new status values via a new `CHECK (status IN (...))` constraint. Map any future upsert to the new vocabulary. The old values will not exist in practice (table has 0 rows now).

### 8.2 State Machine

```
                  ┌──────────────────────────────────────┐
                  │           Trigger event fires         │
                  └──────────────────┬───────────────────┘
                                     │ upsertDmsReviewQueueItem()
                                     ▼
                              ┌─────────┐
                              │  open   │◄──────────── idempotent upsert
                              └────┬────┘              (skip if already open/assigned/in_review)
                       ┌───────────┼───────────┐
                       ▼           ▼           ▼
                  ┌──────────┐ (direct)  ┌──────────────┐
                  │ assigned │           │  superseded  │  ← source issue resolved externally
                  └────┬─────┘           └──────────────┘
                       ▼
                  ┌──────────┐
                  │ in_review│
                  └────┬─────┘
              ┌────────┼────────┐
              ▼        ▼        ▼
         ┌──────────┐ ┌──────────────┐ ┌────────────┐
         │ resolved │ │  dismissed   │ │  cancelled │
         └──────────┘ └──────────────┘ └────────────┘
```

### 8.3 Transition Rules

| From | To | Who |
|---|---|---|
| (new item) | `open` | System (upsert helper) |
| `open` | `assigned` | Reviewer/admin with `assign` permission |
| `open` | `in_review` | Reviewer without explicit assignment |
| `assigned` | `in_review` | Assigned reviewer |
| `in_review` | `resolved` | Reviewer |
| `in_review` | `dismissed` | Reviewer |
| Any active state | `superseded` | System (when source issue resolves) |
| Any active state | `cancelled` | Admin |

**Active states** = `open`, `assigned`, `in_review`

---

## 9. Priority and SLA Plan

### 9.1 Priority Values (keep existing: urgent/high/normal/low)

The existing `priority` column already uses the right vocabulary. Rename `urgent` → keep as-is (or alias to `critical`). For consistency with planned prompt values:

| Priority | Trigger condition |
|---|---|
| `critical` (or `urgent`) | Classification completely failed on compliance/legal document; confidential document flags |
| `high` | Missing required metadata field; OCR failure on compliance document |
| `normal` | Low-confidence AI suggestion; post-approve orchestration failure |
| `low` | Semantic indexing warning (partial); non-critical job failure |

**Note:** The migration comment documents `urgent | high | normal | low`. Plan uses `urgent` as the existing top tier (rename to `critical` is optional, not required).

### 9.2 SLA Field

The `due_at` column (to be added in migration) enables future SLA enforcement. Phase 12 populates it based on priority:
- `urgent/critical` → 24h from queued_at
- `high` → 72h
- `normal` → 7 days
- `low` → no SLA (null)

SLA enforcement (alerting/overdue detection) is deferred to Phase 14.

### 9.3 Source Confidence Linkage

The `confidence` column (to be added) stores the raw confidence score from the originating AI result. This enables:
- Sorting by confidence ascending (lowest confidence first)
- Filtering items below a threshold
- Display in the reviewer UI without exposing full AI output

---

## 10. Duplicate and Idempotency Rules

### 10.1 Idempotency Key Schema

Add column: `idempotency_key TEXT` with a UNIQUE constraint.

Add unique index: `CREATE UNIQUE INDEX idx_dms_review_queue_idempotency_key ON dms_review_queue(idempotency_key) WHERE deleted_at IS NULL AND status NOT IN ('resolved','dismissed','cancelled','superseded');`

**Note:** The partial index allows a new item to be created for the same key if the previous one was closed. This correctly models: "OCR failed again after a re-run — new review item needed."

### 10.2 Key Format Per Review Type

```
intake_classification:{upload_session_id}:classification
intake_metadata:{upload_session_id}:field:{metadata_definition_id}
ai_analysis:{ai_result_id}:classification
ai_analysis:{ai_result_id}:field:{metadata_definition_id}
ocr_file:{document_file_id}
semantic_doc:{document_id}
ai_job:{job_id}
```

### 10.3 Upsert Strategy

The `upsertDmsReviewQueueItem()` helper function (to be implemented) will:
1. Attempt `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING` when status filter allows (active item exists → skip)
2. Or `INSERT ... ON CONFLICT (idempotency_key) DO UPDATE SET reason_message = EXCLUDED.reason_message, updated_at = NOW()` if there is merit to updating the active item's description
3. Return `{ inserted: true | false, itemId: number | null }` — non-fatal on failure (errors logged, never propagated to user-facing actions)

### 10.4 Supersede Logic

When a source issue resolves externally (e.g. intake session is approved, job re-runs successfully), the queue item status should be updated to `superseded` via a background helper. This is a best-effort write that does not block the primary user action.

---

## 11. Queue Generation Triggers

### 11.1 Trigger Point 1 — Intake Review Pending

**Location:** `src/server/actions/dms/ai-intake.ts` — `startAiIntakeFromUploadSession()` (end of function, after `intake_status` → `review_pending`)

**Items to create:**
- One `intake_classification_review` item if `classification_confidence = 'low'` or alternatives exist
- One `intake_metadata_review` item per `dms_intake_review_values` row where:
  - `review_required_if_missing = true` AND `suggested_value_json IS NULL`
  - OR `review_required_if_low_confidence = true` AND `confidence_score < ai_confidence_threshold`

**Priority:** `high` for missing required; `normal` for low confidence

**Generation mode:** Inline helper call, wrapped in `try/catch` — non-fatal

### 11.2 Trigger Point 2 — AI Analysis Result Created

**Location:** `src/server/actions/dms/ai-analysis.ts` — `runDmsAiAnalysisForDocument()` (after result written with `ai_status = 'pending_review'`)

**Items to create:**
- One `ai_analysis_metadata_review` item per diff field where state is `conflict` or `low_confidence` (on `review_required_if_low_confidence` fields)

**Generation mode:** Inline helper call, non-fatal

**Important:** Only create items if the result status is `pending_review`. If result is immediately accepted (no such case in current code) or has no interesting diff fields, no item is needed.

### 11.3 Trigger Point 3 — OCR Failure

**Location:** `src/server/actions/dms/ocr.ts` — `triggerDmsOcrForFile()` (on error/failure branch) and `adminBackfillMissingOcrText()` result processor

**Items to create:**
- One `ocr_failure_review` item per failed file

**Idempotency:** `ocr_file:{file_id}` — prevents duplicate items on retry

**Priority:** `high` for compliance document types; `normal` otherwise

**Generation mode:** Inline helper call after OCR job error is recorded, non-fatal

### 11.4 Trigger Point 4 — Semantic Indexing Failure

**Location:** `src/lib/dms/ai-jobs/handlers/semantic-document-index.handler.ts` — on handler failure, OR `src/lib/dms/semantic/semantic-indexer.ts` — when `result.status === 'failed' || result.chunksFailed > 0`

**Items to create:**
- One `semantic_index_review` item per document with failed/partial indexing
- Include `confidence = result.chunksCreated / (result.chunksCreated + result.chunksFailed)` as a coverage ratio

**Priority:** `low` (semantic indexing failure is not a blocking compliance issue)

**Generation mode:** Called from the Phase 9 job handler result processing, non-fatal

### 11.5 Trigger Point 5 — AI Job Queue Permanent Failure

**Location:** `src/lib/dms/ai-jobs/job-runner.ts` — in the permanent failure path (after all retries exhausted)

**Items to create:**
- One `ai_job_failure_review` item per permanently failed job

**Priority mapping:**
| Job type | Priority |
|---|---|
| `post_approve_orchestration` | `high` |
| `ocr_backfill` | `high` |
| `semantic_document_index` | `low` |
| `ai_summary`, `ai_intelligence`, `embedding` | `normal` |
| `tag_suggestions`, `link_suggestions` | `low` |

**Generation mode:** Non-fatal call in job runner's permanent failure branch

### 11.6 Generation Mode — Non-Blocking Pattern

All queue item creation calls must follow this pattern:

```typescript
// Non-fatal queue item creation — NEVER propagates to user-facing error
try {
  await upsertDmsReviewQueueItem(adminClient, {
    reviewType: "ocr_failure_review",
    idempotencyKey: `ocr_file:${fileId}`,
    documentId,
    uploadSessionId: null,
    aiResultId: null,
    aiJobId: null,
    metadataDefinitionId: null,
    fieldCode: null,
    reasonCode: "ocr_failed",
    reasonMessage: `OCR failed for file ${fileId}: ${sanitizedError}`,
    priority: "high",
    confidence: null,
    payloadJson: { fileId, documentId, errorCode: sanitizedErrorCode },
  });
} catch (queueError) {
  logger.warn("review-queue", "Failed to create review queue item (non-fatal)", { queueError });
}
```

---

## 12. Server Action Plan

All actions in `src/server/actions/dms/review-queue.ts` (new file).

### 12.1 Read Actions

| Action | Signature | Permission |
|---|---|---|
| `getDmsReviewQueueItems` | `(filters: ReviewQueueFilters) → paginated list` | `dms.documents.review_ai OR dms.admin` |
| `getDmsReviewQueueCounts` | `() → count by status/type` | `dms.documents.review_ai OR dms.admin` |
| `getDmsReviewQueueItem` | `(id: number) → item detail + source links` | `dms.documents.review_ai OR dms.admin` |

### 12.2 Mutation Actions

| Action | Signature | Permission |
|---|---|---|
| `assignDmsReviewQueueItem` | `(id, userId) → void` | `dms.documents.review_ai OR dms.admin` |
| `startDmsReviewQueueItem` | `(id) → void` | `dms.documents.review_ai OR dms.admin` |
| `resolveDmsReviewQueueItem` | `(id, { resolutionCode, resolutionNote }) → void` | `dms.documents.review_ai OR dms.admin` |
| `dismissDmsReviewQueueItem` | `(id, reason) → void` | `dms.documents.review_ai OR dms.admin` |
| `bulkAssignDmsReviewQueueItems` | `(ids[], userId) → count` | `dms.admin OR system_admin` |
| `bulkDismissDmsReviewQueueItems` | `(ids[], reason) → count` | `dms.admin OR system_admin` |
| `rebuildDmsReviewQueue` | `(scope: RebuildScope) → summary` | `dms.admin OR system_admin` |

### 12.3 Internal Helper (Not a Server Action)

```
upsertDmsReviewQueueItem(adminClient, input: ReviewQueueUpsertInput) → { inserted: boolean; itemId: number | null }
```

- Uses `createAdminClient()` — no user session needed
- Wraps `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING`
- Returns result without throwing — callers wrap in `try/catch`
- Does NOT log audit (creation is system-initiated; mutations log audit)

### 12.4 Audit Requirements

All mutation actions must call `logAudit()` with:
- `event_type`: e.g. `dms_review_queue_item_resolved`
- `entity_type`: `dms_review_queue`
- `entity_id`: queue item id
- `detail_json`: safe metadata only — `{ review_type, resolution_code, document_id }` — NO full OCR, chunk text, or AI content

### 12.5 Filter Type

```typescript
type ReviewQueueFilters = {
  status?: string[];
  reviewType?: string[];
  priority?: string[];
  assignedTo?: number | 'me' | 'unassigned';
  documentId?: number;
  uploadSessionId?: number;
  sourceModule?: string;
  confidentiality?: string;
  createdAfter?: string;
  createdBefore?: string;
  dueBefore?: string;
  page?: number;
  pageSize?: number; // max 50
};
```

### 12.6 Resolution Code Vocabulary

```
accepted_as_is       — item reviewed, original AI result accepted
corrected_manually   — reviewer corrected the value manually
ocr_retriggered      — reviewer triggered OCR retry (item superseded when job succeeds)
job_retriggered      — reviewer retried the failed job
semantics_rebuilt    — reviewer triggered semantic rebuild
no_action_needed     — item reviewed, no action required
data_not_available   — source data not available to review
wrong_document_type  — document type was changed, item is stale
```

---

## 13. UI / UX Plan

### 13.1 Route Decision

**Recommendation: `/dms/review-queue`** (not `/dms/inbox/review`)

Rationale:
- The inbox is for active upload sessions (single + batch)
- The review queue is a separate operational workflow for AI quality assurance
- A distinct route avoids confusion between "new uploads awaiting intake" and "AI findings awaiting human review"
- The sidebar can have two DMS entries: `Inbox` (upload/intake) and `Review Queue` (AI findings)

### 13.2 Page Layout

```
/dms/review-queue
├── Page header: "DMS Review Queue" + item count badge + "Rebuild" button (admin only)
├── Dashboard cards row:
│   ├── Open (with count)
│   ├── Assigned to Me (count)
│   ├── Critical/High (count)
│   ├── Overdue (count, when due_at < now())
│   └── Resolved Today (count)
├── Filter bar:
│   ├── Status (multi-select: open / assigned / in_review)
│   ├── Review Type (multi-select)
│   ├── Priority (multi-select)
│   ├── Assigned To (me / unassigned / specific user)
│   ├── Source Module (intake / ai_analysis / ocr / semantic / ai_job)
│   └── Date range (created)
├── Queue table (paginated, 25/page):
│   ├── Priority badge
│   ├── Review type badge
│   ├── Document number / upload session code link
│   ├── Reason summary
│   ├── Confidence % (if available)
│   ├── Assigned to (user avatar or "Unassigned")
│   ├── Age (relative time from queued_at)
│   ├── Due date (if set)
│   └── Action buttons: Assign to Me / Open Detail
└── Item Detail Drawer (slides in from right)
    └── (see Section 14)
```

### 13.3 Queue Table — Sorting

Default sort: `priority DESC, queued_at ASC` (critical oldest first).

Other sort options: by review type, by document, by assigned user, by confidence ASC.

### 13.4 Empty State

When filters produce no results: show friendly message with filter reset button. Do NOT show a blank table.

### 13.5 Sidebar Integration

Add to DMS sidebar:

```
DMS
├── Inbox (existing)
├── Batches (existing)
├── All Documents (existing)
├── Review Queue ← NEW (show count badge of open+assigned items)
└── Admin (existing)
```

The Review Queue sidebar item is only visible to users with `dms.documents.review_ai` or `dms.admin`.

---

## 14. Item Detail Drawer Plan

The detail drawer opens from the queue table row click. It is a read-only + action panel, not a full form.

### 14.1 Drawer Header

```
[Priority badge] [Review Type badge]
Document: DMS-2025-00142 (link to /dms/documents/record/[id])
Queued: 3 hours ago by System
Status: open
```

### 14.2 Drawer Body — Sections

**1. Review Reason**
- `reason_code` (human-readable label)
- `reason_message` (safe explanation text)
- `confidence` (displayed as % if available)

**2. Source Link**
| Review Type | Link |
|---|---|
| `intake_classification_review` | `/dms/intake/[sessionCode]` |
| `intake_metadata_review` | `/dms/intake/[sessionCode]#field-[fieldCode]` |
| `ai_analysis_metadata_review` | `/dms/documents/record/[id]#ai-analysis` |
| `ocr_failure_review` | `/dms/documents/record/[id]#ocr` |
| `semantic_index_review` | `/dms/documents/record/[id]#semantic` |
| `ai_job_failure_review` | `/admin/dms/intelligence#jobs` |

**3. Field Information** (for field-level items only)
- Field name (from `metadata_definition_id`)
- AI suggested value (from `payload_json.aiValue` — safe, non-confidential summary)
- Current value (from `payload_json.currentValue` — safe summary)
- Diff state badge (`conflict | low_confidence | new | missing`)

**4. Assignment Panel**
- Current assignee avatar/name
- "Assign to Me" button
- "Assign to..." dropdown (admin only)

**5. Audit Timeline**
- Created at (system)
- Assigned at + by whom
- Review started at
- Resolution event

### 14.3 Drawer Footer — Action Buttons

```
[Dismiss]  [Resolve ▼]
                ├── Mark as Reviewed — No Action Needed
                ├── Accepted as-is
                ├── Corrected Manually
                ├── Retriggered OCR / Job / Semantic
                └── Wrong Document Type
```

Resolution notes field (textarea, optional, max 500 chars).

### 14.4 Confidentiality Guard

- Source document links that open confidential documents (hr/legal/executive) must check the user's confidentiality permissions before rendering the link
- `payload_json.aiValue` and `payload_json.currentValue` must NOT contain full OCR text, chunk text, or raw AI responses — only short safe summaries (max 200 chars)
- If the user cannot view the source document, show: "Source document is confidential. Contact a DMS admin."

---

## 15. Permissions and RLS Plan

### 15.1 Existing Permission Used

`dms.documents.review_ai` — "Review AI Extractions" — already gating the RLS policies.

Phase 12 uses this permission for the primary reviewer role (view, assign, resolve, dismiss own assignments).

### 15.2 New Permissions to Add (Phase 12 Migration)

| Permission Code | Name | Action |
|---|---|---|
| `dms.review_queue.view` | View DMS Review Queue | Read queue items |
| `dms.review_queue.manage` | Manage DMS Review Queue | Assign, resolve, dismiss |
| `dms.review_queue.bulk` | Bulk Manage DMS Review Queue | Bulk assign/dismiss |
| `dms.review_queue.admin` | Admin DMS Review Queue | Rebuild, cancel, full access |

**Mapping:**
- Users with `dms.documents.review_ai` get `dms.review_queue.view` + `dms.review_queue.manage`
- Users with `dms.admin` or `system_admin` get all four
- These are additive permissions; `dms.documents.review_ai` continues to work as-is for backward compat

**Implementation note:** Do not remove the existing `dms.documents.review_ai` gate from RLS policies in Phase 12. Add the new permissions and update the server action checks to accept either.

### 15.3 Updated RLS Policies

Replace the broad `ALL` policy with split `SELECT / INSERT / UPDATE` policies:

```sql
-- SELECT: users with view or manage permission, or admin
CREATE POLICY dms_review_queue_select ON dms_review_queue
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      current_user_has_permission('dms.review_queue.view')
      OR current_user_has_permission('dms.review_queue.manage')
      OR current_user_has_permission('dms.documents.review_ai')
      OR current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
    )
  );

-- INSERT: system inserts via admin client (bypasses RLS) — no user-facing insert
-- Items are created by upsertDmsReviewQueueItem() using createAdminClient()

-- UPDATE: manage/admin users only (assignment, resolution)
CREATE POLICY dms_review_queue_update ON dms_review_queue
  FOR UPDATE
  USING (
    current_user_has_permission('dms.review_queue.manage')
    OR current_user_has_permission('dms.documents.review_ai')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );
```

**RLS: FORCE ROW LEVEL SECURITY remains ON. No anon access.**

### 15.4 Confidential Item Filtering

Queue items linked to confidential documents (hr/legal/executive) should include a `document_confidentiality` column in the `payload_json` or as a joined column (from `dms_documents.confidentiality_level`).

Server action `getDmsReviewQueueItems()` must apply confidentiality filtering:
- If user has `dms.admin` or `system_admin` → no filter
- Otherwise → filter out items where `document_confidentiality IN ('hr', 'legal', 'executive')` for confidentiality levels the user cannot view

This matches the pattern already used in `documents.ts` (line 166), `document-qa.ts` (line 98), and `ai-summary.ts` (lines 60–67).

---

## 16. Notification Plan

### 16.1 Notification Infrastructure Available

`erp_notifications` table exists with `source_module`, `severity`, `title`, `message`, `recipient_user_id`, `action_url`, and `channel_in_app / channel_email` columns. RLS policy is `authenticated` (broad). This table is the recommended notification channel.

### 16.2 Phase 12 Notification Events

| Event | Severity | Recipients | Channel |
|---|---|---|---|
| New `urgent/high` queue item created | `warning` / `error` | Users with `dms.admin` OR `dms.review_queue.admin` | In-app only |
| Queue item assigned to user | `info` | Assigned user | In-app only |

### 16.3 What Is NOT Built in Phase 12

- Email notifications (deferred — requires email template setup)
- Overdue/SLA notifications (deferred — Phase 14)
- Digest/summary notifications (deferred)
- Push notifications (deferred)

### 16.4 Notification Helper Function

Create `createDmsReviewQueueNotification(adminClient, event)` — a non-fatal helper that inserts into `erp_notifications`. Wraps in `try/catch`. Never blocks queue item creation or resolution.

---

## 17. Audit Trail Plan

### 17.1 Audited Events

All queue mutations must call `logAudit()` in `src/server/actions/audit.ts`:

| Event | audit event_type |
|---|---|
| Item created (system) | `dms_review_queue_item_created` |
| Item assigned | `dms_review_queue_item_assigned` |
| Item started | `dms_review_queue_item_started` |
| Item resolved | `dms_review_queue_item_resolved` |
| Item dismissed | `dms_review_queue_item_dismissed` |
| Item superseded | `dms_review_queue_item_superseded` |
| Item cancelled | `dms_review_queue_item_cancelled` |
| Bulk assignment | `dms_review_queue_bulk_assigned` |
| Bulk dismiss | `dms_review_queue_bulk_dismissed` |
| Queue rebuild | `dms_review_queue_rebuilt` |

### 17.2 Audit Payload — Safe Fields Only

```json
{
  "review_queue_item_id": 12345,
  "review_type": "intake_metadata_review",
  "status_from": "open",
  "status_to": "resolved",
  "resolution_code": "corrected_manually",
  "document_id": 789,
  "upload_session_id": 456,
  "field_code": "expiry_date"
}
```

**NEVER include in audit payload:**
- Full OCR text
- Raw AI response content
- Chunk text
- AI confidence raw output
- Document content_text

---

## 18. Data Model / Migration Plan

### 18.1 Migration File

Proposed filename: `20260625200000_erp_dms_ai_phase12_review_queue_activation.sql`

**IMPORTANT:** This section describes columns to ADD. The 14 existing columns are retained without modification.

### 18.2 Columns to Add to `dms_review_queue`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `idempotency_key` | TEXT | YES | — | Unique (partial index — see §10.2) |
| `review_type` | TEXT | NOT NULL | `'intake_classification_review'` | CHECK constraint (§7) |
| `source_type` | TEXT | YES | — | `intake / ai_analysis / ocr_file / semantic_doc / ai_job` |
| `source_id` | TEXT | YES | — | Flexible: could be bigint, uuid, or compound |
| `ai_result_id` | BIGINT FK → dms_ai_extraction_results.id | YES (SET NULL) | — | — |
| `ai_job_id` | BIGINT FK → dms_ai_job_queue.id | YES (SET NULL) | — | Phase 9 job |
| `metadata_definition_id` | BIGINT FK → dms_metadata_definitions.id | YES (SET NULL) | — | For field-level items |
| `field_code` | TEXT | YES | — | Denormalized for display without join |
| `reason_code` | TEXT | YES | — | Machine-readable reason (§12.6 vocabulary) |
| `reason_message` | TEXT | YES | — | Safe human-readable summary, max 1000 chars |
| `confidence` | NUMERIC(5,4) | YES | — | AI confidence score (0.0000–1.0000) |
| `payload_json` | JSONB | YES | — | Safe metadata only — no full text |
| `assigned_at` | TIMESTAMPTZ | YES | — | When assigned (distinct from queued_at) |
| `reviewed_by` | BIGINT FK → user_profiles.id | YES (SET NULL) | — | — |
| `reviewed_at` | TIMESTAMPTZ | YES | — | When review action taken |
| `resolved_at` | TIMESTAMPTZ | YES | — | When resolved/dismissed/superseded |
| `resolution_code` | TEXT | YES | — | (§12.6 vocabulary) |
| `resolution_note` | TEXT | YES | — | Reviewer free text, max 500 chars |
| `due_at` | TIMESTAMPTZ | YES | — | Optional SLA deadline |
| `updated_by` | BIGINT FK → user_profiles.id | YES (SET NULL) | — | Who last mutated the row |

### 18.3 Status Column — Check Constraint Update

Replace (or add alongside) the existing implicit status values with an explicit CHECK:

```sql
ALTER TABLE dms_review_queue
  ADD CONSTRAINT dms_review_queue_status_check
  CHECK (status IN ('open','assigned','in_review','resolved','dismissed','superseded','cancelled',
                    'pending','completed')); -- last two retained for any pre-existing rows
```

Note: Since the table has 0 rows, the backward-compat values (`pending`, `completed`) are optional to include. Recommended to include them to prevent any future breakage if an old migration re-runs.

### 18.4 Review Type Check Constraint

```sql
ALTER TABLE dms_review_queue
  ADD CONSTRAINT dms_review_queue_review_type_check
  CHECK (review_type IN (
    'intake_classification_review',
    'intake_metadata_review',
    'ai_analysis_metadata_review',
    'ocr_failure_review',
    'semantic_index_review',
    'ai_job_failure_review'
  ));
```

### 18.5 New Indexes to Add

```sql
-- Idempotency (partial — allows same key on closed items)
CREATE UNIQUE INDEX idx_dms_review_queue_idempotency_key
  ON dms_review_queue (idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND deleted_at IS NULL
    AND status NOT IN ('resolved','dismissed','cancelled','superseded');

-- Core filtering
CREATE INDEX idx_dms_review_queue_review_type
  ON dms_review_queue (review_type);

CREATE INDEX idx_dms_review_queue_priority
  ON dms_review_queue (priority);

CREATE INDEX idx_dms_review_queue_document_id
  ON dms_review_queue (document_id)
  WHERE document_id IS NOT NULL;

CREATE INDEX idx_dms_review_queue_upload_session_id
  ON dms_review_queue (upload_session_id)
  WHERE upload_session_id IS NOT NULL;

CREATE INDEX idx_dms_review_queue_ai_result_id
  ON dms_review_queue (ai_result_id)
  WHERE ai_result_id IS NOT NULL;

CREATE INDEX idx_dms_review_queue_ai_job_id
  ON dms_review_queue (ai_job_id)
  WHERE ai_job_id IS NOT NULL;

CREATE INDEX idx_dms_review_queue_queued_at
  ON dms_review_queue (queued_at DESC);

CREATE INDEX idx_dms_review_queue_due_at
  ON dms_review_queue (due_at)
  WHERE due_at IS NOT NULL;

-- Active items dashboard
CREATE INDEX idx_dms_review_queue_active
  ON dms_review_queue (status, priority, queued_at)
  WHERE status IN ('open','assigned','in_review') AND deleted_at IS NULL;
```

### 18.6 New Permissions Seed

```sql
INSERT INTO permissions (permission_code, permission_name, module_code, action_code, description, is_active)
VALUES
  ('dms.review_queue.view',  'View DMS Review Queue',         'DMS', 'view',   'View DMS AI review queue items',           true),
  ('dms.review_queue.manage','Manage DMS Review Queue',        'DMS', 'manage', 'Assign, resolve, dismiss queue items',     true),
  ('dms.review_queue.bulk',  'Bulk Manage DMS Review Queue',   'DMS', 'manage', 'Bulk assign/dismiss queue items',          true),
  ('dms.review_queue.admin', 'Admin DMS Review Queue',         'DMS', 'admin',  'Rebuild queue, cancel items, full access', true)
ON CONFLICT (permission_code) DO NOTHING;
```

### 18.7 Feature Flag Usage Migration

No new feature flag is needed. `DMS_AI_REVIEW` already exists. The migration should add a comment:

```sql
UPDATE erp_ai_feature_flags
  SET notes = 'Phase 12 — Review Queue Activation. Controls visibility of /dms/review-queue page and queue generation triggers.'
  WHERE feature_code = 'DMS_AI_REVIEW';
```

---

## 19. Review Queue Rebuild / Backfill Plan

### 19.1 Purpose

The `rebuildDmsReviewQueue(scope)` admin action scans current sources and creates missing queue items for any open review-worthy conditions that don't already have an active queue item.

### 19.2 Scope Options

```typescript
type RebuildScope = {
  intake?:      boolean; // scan review_pending upload sessions
  aiAnalysis?:  boolean; // scan pending_review AI results
  ocr?:         boolean; // scan failed OCR jobs
  semantic?:    boolean; // scan failed/partial semantic jobs
  jobs?:        boolean; // scan permanently failed AI queue jobs
  dryRun?:      boolean; // report what would be created without creating
  batchSize?:   number;  // default 50
};
```

### 19.3 Rebuild Algorithm

For each enabled scope:
1. Query source table for review-worthy rows (e.g. `dms_ai_extraction_jobs WHERE status = 'failed'`)
2. For each row, compute the idempotency key
3. Check if an active item already exists for that key
4. If not → call `upsertDmsReviewQueueItem()` (non-destructive)
5. If active item exists → skip (no update)
6. Supersede stale items whose source is no longer review-worthy (e.g. session was approved)

### 19.4 Supersede Logic During Rebuild

When scanning a scope, also check for active queue items whose source has been resolved:
- Intake items where session `intake_status = 'approved'` → supersede
- AI analysis items where result `ai_status = 'accepted'` or `'superseded'` → supersede
- OCR items where file now has `ocr_text IS NOT NULL` → supersede
- Semantic items where job `job_status = 'completed'` → supersede
- AI job items where job `job_status = 'completed'` → supersede

### 19.5 No Destructive Deletes

Rebuild never deletes queue rows. `deleted_at` soft-delete is reserved for explicit admin cancel. Superseding sets `status = 'superseded'`.

---

## 20. Integration With Existing Screens

### 20.1 Intake Review Screen (`/dms/intake/[sessionCode]`)

- **Source link target** for `intake_classification_review` and `intake_metadata_review` items
- No code change needed in Phase 12 — the intake screen already exists
- Future: could show a "This session has open review queue items" banner (post-Phase 12 enhancement)

### 20.2 Document AI Analysis Tab (`/dms/documents/record/[id]#ai-analysis`)

- **Source link target** for `ai_analysis_metadata_review` items
- No code change needed in Phase 12 — the AI tab exists
- Future: could show a "Related queue items" count in the tab (post-Phase 12)

### 20.3 Document OCR Tab

- **Source link target** for `ocr_failure_review` items
- No code change needed in Phase 12

### 20.4 Document Semantic Tab

- **Source link target** for `semantic_index_review` items
- No code change needed in Phase 12

### 20.5 Admin Intelligence Page (`/admin/dms/intelligence`)

- **Source link target** for `ai_job_failure_review` items (links to job queue panel)
- No code change needed in Phase 12
- Future: add a "Review Queue Summary" card to the intelligence admin page

### 20.6 Workspace Route Registry

Add the new review queue route to `src/lib/workspace/workspace-route-registry.ts`:

```typescript
{
  moduleCode: 'DMS_REVIEW_QUEUE',
  path: '/dms/review-queue',
  label: 'Review Queue',
  icon: 'ClipboardList',
  permission: 'dms.documents.review_ai',
}
```

---

## 21. Performance and Index Plan

### 21.1 Index Coverage

Phase 12 adds 10 new indexes (see §18.5). The key performance scenarios are:

| Query pattern | Index covering it |
|---|---|
| Dashboard count by status | `idx_dms_review_queue_active` (partial, status+priority) |
| Filter by review_type | `idx_dms_review_queue_review_type` |
| Filter by priority | `idx_dms_review_queue_priority` |
| Filter by assigned_to | existing `idx_dms_review_queue_assigned` |
| Filter by document | `idx_dms_review_queue_document_id` |
| Filter by session | `idx_dms_review_queue_upload_session_id` |
| Sort by queued_at | `idx_dms_review_queue_queued_at` |
| SLA/overdue filter | `idx_dms_review_queue_due_at` |
| Idempotency check on upsert | `idx_dms_review_queue_idempotency_key` (unique partial) |

### 21.2 JSON Filtering Avoidance

`payload_json` must NOT be used in WHERE clauses. All filter criteria must use dedicated typed columns. `payload_json` is display-only.

### 21.3 Pagination

All list queries must use keyset pagination (not OFFSET for large tables). Default page size: 25. Maximum: 50.

### 21.4 Count Queries

Dashboard count queries should be separate from list queries. Use lightweight `SELECT COUNT(*) WHERE status IN (...)` queries, not full row fetches.

---

## 22. Recommended Phase 12 Implementation Scope

### 22.1 In Scope for Phase 12

| Area | Details |
|---|---|
| DB migration | Extend `dms_review_queue` with 20 columns, check constraints, 10 indexes, 4 new permissions |
| `upsertDmsReviewQueueItem()` | Internal helper — non-fatal upsert into queue |
| `review-queue.ts` server actions | All 9 actions (read + mutation + rebuild) |
| Review Queue page | `/dms/review-queue` — list, filters, dashboard cards |
| Item Detail Drawer | Read + action panel with source links and resolution controls |
| Sidebar entry | DMS → Review Queue with count badge |
| Queue generation hooks | 5 trigger points in existing server actions/handlers |
| Notifications | `createDmsReviewQueueNotification()` for critical/high items + assignment |
| Feature flag check | All queue generation and UI gated on `DMS_AI_REVIEW` flag |
| Workspace route registry | New `DMS_REVIEW_QUEUE` entry |

### 22.2 Out of Scope for Phase 12 (Defer)

| Item | Defer to |
|---|---|
| Validation/conflict detection (Phase 13 types) | Phase 13 |
| Owner matching review items | Phase 13 |
| Token/cost/observability items | Phase 14 |
| Apply-to-ERP items | Phase 16 |
| SLA alerting / overdue notifications | Phase 14 |
| Email notifications | Separate notification phase |
| Digest/summary email | Separate notification phase |
| Review queue analytics dashboard | Phase 14/15 |
| Automated supersede job (cron) | Phase 14/15 |
| Full workflow approval engine | Phase 16 |

---

## 23. Implementation Sequence for Future Phase 12 Execution

The implementation must follow this sequence to avoid forward-dependency issues:

```
Step 1:  DB Migration
         ├── Add 20 columns to dms_review_queue
         ├── Add check constraints (status, review_type)
         ├── Add 10 indexes
         ├── Add 4 permissions
         ├── Drop old broad RLS policies, add new split SELECT/UPDATE
         └── Update DMS_AI_REVIEW feature flag notes

Step 2:  Internal helper
         └── src/lib/dms/review-queue/review-queue-upsert.ts
             upsertDmsReviewQueueItem() + createDmsReviewQueueNotification()

Step 3:  Server actions
         └── src/server/actions/dms/review-queue.ts
             All 9 read/mutation/rebuild actions

Step 4:  Queue generation hooks
         ├── src/server/actions/dms/ai-intake.ts  (trigger 1)
         ├── src/server/actions/dms/ai-analysis.ts (trigger 2)
         ├── src/server/actions/dms/ocr.ts         (trigger 3)
         ├── src/lib/dms/ai-jobs/handlers/semantic-document-index.handler.ts (trigger 4)
         └── src/lib/dms/ai-jobs/job-runner.ts    (trigger 5)

Step 5:  Review Queue Page + components
         ├── src/app/(protected)/dms/review-queue/page.tsx
         ├── src/features/dms/review-queue/dms-review-queue-page-client.tsx
         ├── src/features/dms/review-queue/dms-review-queue-table.tsx
         ├── src/features/dms/review-queue/dms-review-queue-filters.tsx
         ├── src/features/dms/review-queue/dms-review-queue-dashboard-cards.tsx
         └── src/features/dms/review-queue/dms-review-queue-item-drawer.tsx

Step 6:  Sidebar + workspace registry
         ├── Add DMS Review Queue sidebar entry (with DMS_AI_REVIEW flag check)
         └── Add workspace route registry entry

Step 7:  Typecheck + build verification
         └── tsc --noEmit  (must pass with zero errors)
```

---

## 24. Acceptance Criteria for Future Implementation

| # | Criterion |
|---|---|
| AC-01 | `dms_review_queue` schema is verified in live DB post-migration with all 34 columns present |
| AC-02 | `upsertDmsReviewQueueItem()` can be called with all 6 review_type values; creates or skips correctly |
| AC-03 | Low-confidence AI intake on a field with `review_required_if_low_confidence = true` creates an `intake_metadata_review` item |
| AC-04 | Missing required field at intake creates an `intake_metadata_review` item |
| AC-05 | AI Analysis result with `conflict` diff row creates an `ai_analysis_metadata_review` item |
| AC-06 | OCR failure creates an `ocr_failure_review` item |
| AC-07 | Semantic indexing partial/failed creates a `semantic_index_review` item |
| AC-08 | Phase 9 job permanently failed creates an `ai_job_failure_review` item |
| AC-09 | Calling upsert twice with the same idempotency key does NOT create a second item |
| AC-10 | `/dms/review-queue` page loads, shows open items with all filters working |
| AC-11 | Reviewer can assign, start, resolve, and dismiss individual items via drawer |
| AC-12 | Bulk assign and bulk dismiss work for admin users |
| AC-13 | Source links in drawer open the correct intake/document/admin page |
| AC-14 | Queue items for hr/legal/executive documents are hidden from users without confidentiality access |
| AC-15 | Anonymous requests get no data (RLS enforced) |
| AC-16 | All mutations produce an audit log entry with `event_type` and safe payload |
| AC-17 | Notifications created for `urgent/high` items reaching admin users |
| AC-18 | Assignment notification created for assigned user |
| AC-19 | No ERP record write occurs at any point in the review workflow |
| AC-20 | No auto-approval, auto-save, or auto-resolve occurs |
| AC-21 | `DMS_AI_REVIEW` feature flag = false disables queue generation and hides the page |
| AC-22 | `tsc --noEmit` passes with zero type errors |
| AC-23 | Next.js build completes without error |

---

## 25. Full Test Plan

### Test 1 — Intake Low Confidence Creates Queue Item
- **Purpose:** Verify intake review trigger creates item for low-confidence classification
- **Setup:** Upload a document, mock AI to return `classification_confidence = 'low'`
- **Steps:** Complete AI intake → check `dms_review_queue`
- **Expected result:** One `intake_classification_review` item with `priority = 'normal'`, linked `upload_session_id`
- **DB expected state:** `dms_review_queue` has 1 row with `status = 'open'`
- **UI expected state:** Queue page shows 1 open item of type "Classification Review"
- **Risk covered:** Intake review trigger wiring

### Test 2 — Missing Required Field Creates Queue Item
- **Purpose:** Verify missing required metadata field creates intake_metadata_review item
- **Setup:** Document type with `is_required = true, review_required_if_missing = true` field; AI extracts no value for it
- **Steps:** Complete AI intake → check queue
- **Expected result:** One `intake_metadata_review` item with `priority = 'high'`, `field_code` set, linked `metadata_definition_id`
- **Risk covered:** Required field detection

### Test 3 — Duplicate Item Not Created on Re-run
- **Purpose:** Verify idempotency key prevents duplicates
- **Setup:** Active queue item for `intake_metadata:{session_id}:field:{def_id}`
- **Steps:** Call `upsertDmsReviewQueueItem()` again with same key
- **Expected result:** `{ inserted: false, itemId: <existing_id> }` — no new row
- **DB expected state:** Still 1 row with original id
- **Risk covered:** Idempotency rule

### Test 4 — Item Links to Intake Session
- **Purpose:** Verify source link in drawer navigates to correct intake page
- **Setup:** Create intake_classification_review item with `upload_session_id = 42`, `sessionCode = 'ABC123'`
- **Steps:** Open drawer → click "View Source" link
- **Expected result:** Browser navigates to `/dms/intake/ABC123`
- **Risk covered:** Source link correctness

### Test 5 — Assignment Works
- **Purpose:** Verify `assignDmsReviewQueueItem` updates assignment fields
- **Steps:** Assign item to user ID 5
- **Expected result:** `assigned_to = 5`, `assigned_at` populated, `status = 'assigned'`
- **DB expected state:** Correct columns updated
- **Audit expected:** `dms_review_queue_item_assigned` event in audit_logs
- **Risk covered:** Assignment workflow

### Test 6 — Resolve Works
- **Purpose:** Verify resolution closes item with correct fields
- **Steps:** Resolve item with `resolution_code = 'accepted_as_is'`, note "Reviewed and confirmed"
- **Expected result:** `status = 'resolved'`, `resolved_at` populated, `reviewed_by` = current user, `resolution_code = 'accepted_as_is'`
- **Risk covered:** Resolution workflow

### Test 7 — Dismiss Works
- **Purpose:** Verify dismiss closes item
- **Steps:** Dismiss item with reason "Not applicable to this document type"
- **Expected result:** `status = 'dismissed'`, `resolution_note` = provided reason
- **Risk covered:** Dismiss workflow

### Test 8 — Confidential Item Hidden from Non-Admin
- **Purpose:** Verify confidential document items are not exposed to unpermissioned users
- **Setup:** Item linked to document with `confidentiality_level = 'hr'`; user has `dms.documents.review_ai` but NOT `dms.documents.view.hr`
- **Steps:** `getDmsReviewQueueItems()` for this user
- **Expected result:** Item is not in result list
- **Risk covered:** Confidentiality gate

### Test 9 — RLS Denies Anon
- **Purpose:** Verify anonymous access is rejected
- **Steps:** Direct Supabase client call to `dms_review_queue` without auth
- **Expected result:** 0 rows returned (RLS blocks)
- **Risk covered:** RLS enforcement

### Test 10 — Bulk Actions Audit
- **Purpose:** Verify bulk dismiss writes a single audit event with count
- **Steps:** Bulk dismiss 5 items
- **Expected result:** 5 items dismissed; 1 `dms_review_queue_bulk_dismissed` audit entry with `detail_json.count = 5`
- **Risk covered:** Bulk audit completeness

### Test 11 — Rebuild Creates Items and Supersedes Stale
- **Purpose:** Verify rebuild finds open conditions and closes stale items
- **Setup:** 3 sessions with `intake_status = 'review_pending'` (one already has active item); 1 session was approved
- **Steps:** `rebuildDmsReviewQueue({ intake: true })`
- **Expected result:** 2 new items created; 1 existing item untouched; 1 approved-session item superseded
- **Risk covered:** Rebuild idempotency and supersede logic

### Test 12 — OCR Failure Item Created
- **Purpose:** Verify OCR failure trigger creates `ocr_failure_review` item
- **Setup:** Trigger OCR for a file; mock OCR provider to return an error
- **Steps:** Check queue after failure
- **Expected result:** 1 `ocr_failure_review` item with `source_type = 'ocr_file'`, file reference in `payload_json`
- **Risk covered:** OCR trigger wiring

### Test 13 — Semantic Failed Item Created
- **Purpose:** Verify semantic handler creates `semantic_index_review` item on failure
- **Setup:** Force `semantic-document-index` job handler to return `success: false`
- **Steps:** Check queue after job processes
- **Expected result:** 1 `semantic_index_review` item
- **Risk covered:** Semantic trigger wiring

### Test 14 — AI Job Failed Item Created
- **Purpose:** Verify permanent job failure creates `ai_job_failure_review` item
- **Setup:** `post_approve_orchestration` job with all retries exhausted
- **Steps:** Check queue after job marked failed
- **Expected result:** 1 `ai_job_failure_review` item with `priority = 'high'`
- **Risk covered:** Job failure trigger wiring

### Test 15 — UI Filters Work
- **Purpose:** Verify all filter combinations return correct results
- **Steps:** Filter by status=open, by review_type=ocr_failure_review, by priority=high, by assigned_to=me
- **Expected result:** Each filter returns correctly filtered set
- **Risk covered:** Server action filter logic

### Test 16 — Typecheck and Build
- **Purpose:** Verify no TypeScript errors introduced
- **Steps:** `tsc --noEmit` + `next build`
- **Expected result:** Zero errors
- **Risk covered:** Build integrity

### Test 17 — Feature Flag Off Disables Queue
- **Purpose:** Verify DMS_AI_REVIEW = false disables queue generation
- **Setup:** Set `DMS_AI_REVIEW = false` in `erp_ai_feature_flags`
- **Steps:** Complete an intake with low confidence
- **Expected result:** No new items created in `dms_review_queue`
- **Risk covered:** Feature flag gate

---

## 26. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Queue generation blocks user actions on failure | HIGH | All generation calls are non-fatal (try/catch, errors logged only) |
| Duplicate items on concurrent intake completions | MEDIUM | Unique partial index on idempotency_key prevents duplicates; `INSERT ON CONFLICT DO NOTHING` |
| Confidential document content exposed in payload_json | HIGH | Strict payload assembly — only IDs + short text summaries; no OCR/chunk/AI content |
| Queue becomes too large (unbounded growth) | MEDIUM | Rebuild supersede logic; admin can bulk-dismiss; future Phase 15 archival job |
| Status migration breaks existing rows | LOW | Table has 0 rows; no existing data to migrate |
| Performance degradation on list query | MEDIUM | 10 targeted indexes + partial indexes for active items; keyset pagination |
| DMS_AI_REVIEW flag misconfigured | LOW | Flag is already `is_enabled = true`; gate is additive (false = no items created, not broken) |
| Reviewer accidentally resolves without action | MEDIUM | Resolution code is required; resolution_note is recommended; no auto-apply to source data |
| RLS policy update breaks existing review_ai access | MEDIUM | New policies are additive; `dms.documents.review_ai` remains in both SELECT and UPDATE policies |
| Notification creation failure | LOW | Notification helper is non-fatal; queue item creation succeeds regardless |

---

## 27. What Must Not Be Implemented in Phase 12

The following items are **explicitly forbidden** in Phase 12 implementation:

```
✗ Validation/conflict detection engine (Phase 13)
✗ Owner matching engine (Phase 13)
✗ Token/cost dashboard (Phase 14)
✗ Full observability dashboard (Phase 14/15)
✗ Apply-to-ERP writes (Phase 16 — NEVER in Phase 12)
✗ Auto-approval of any kind
✗ Auto-save of metadata from queue resolution
✗ Auto-resolve by AI
✗ Changing OCR routing or provider selection
✗ Changing semantic chunking algorithm or configuration
✗ Moving intake/OCR/semantic workflows to be queue-backed
✗ Deleting source documents or files during resolution
✗ Broad new RLS policies that weaken existing confidentiality gates
✗ Major UI redesign of existing DMS screens (intake, documents, admin)
✗ Full email notification engine (use erp_notifications in-app only)
✗ SLA alerting or overdue notifications (Phase 14)
```

---

## 28. Corrected Roadmap After Phase 12

```
Phase 9   — Async AI Job Queue / Workflow Runner              CLOSED
Phase 10A — OCR Pipeline Upgrade / Azure OCR Wiring            CLOSED
Phase 10B — Queue-backed Admin OCR Backfill                    CLOSED
Phase 11  — Semantic Chunking and Embeddings                   CLOSED / LIVE PASS
Phase 12  — Review Queue Activation                            THIS PHASE → IMPLEMENTATION PENDING
Phase 13  — Validation, Conflict Detection, Owner Matching      FUTURE
Phase 14  — Token / Cost / Observability                       FUTURE
Phase 15  — Testing, Performance, Hardening                    FUTURE
Phase 16  — Human-Reviewed Apply-to-ERP Records                FUTURE / HIGH-RISK
```

---

## 29. Recommended Next Cursor Implementation Prompt

After ChatGPT review and approval of this plan, the Cursor implementation prompt should specify:

1. Target migration file name and timestamp
2. Confirmation that the plan has been approved by ChatGPT and Sameer
3. File list to create/modify (from §23 implementation sequence)
4. Confirmation of `upsertDmsReviewQueueItem` helper placement (`src/lib/dms/review-queue/`)
5. Page design decisions (layout preferences, component library choices)
6. Whether to create a Playwright UAT screenplay or a manual test checklist

---

## 30. Final Recommendation

**Phase 12 is safe to implement after ChatGPT review.**

**Schema gap is addressable in a single well-scoped migration.** The existing `dms_review_queue` table requires only additive changes — no dropping or renaming of existing columns. With 0 rows in the live table, there are zero data migration risks.

**The feature flag `DMS_AI_REVIEW` is already live and enabled.** This is the safest rollout strategy: deploy the Phase 12 code, then flip the flag to control activation.

**The five trigger points are well-isolated.** Each is a non-fatal fire-and-forget call that cannot break the primary user workflow even if the queue write fails.

**Human-review-first is preserved end-to-end.** No queue item resolution auto-applies, auto-saves, or auto-approves anything. All resolution actions are explicit human decisions. No ERP records are touched.

**Recommended Phase 12 implementation scope is the minimum viable set** to activate the review queue meaningfully — without over-engineering a full workflow engine or notification system before the basic queue is proven in production.

---

*This plan contains no implementation. It is a planning artifact only. No source code, migration, schema, UI, or server action was created or modified during its production.*

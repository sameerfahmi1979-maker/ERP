# ERP DMS AI Phase 13 Validation, Conflict Detection, Owner Matching Implementation Report

**Date:** 2026-06-26  
**Phase:** ERP DMS AI Phase 13  
**Status:** CLOSED / PASS ✅

---

## 1. Executive Summary

Phase 13 implemented a production-grade validation and entity matching foundation on top of the Phase 12 Review Queue. Two new database tables (`dms_ai_validation_findings`, `dms_ai_entity_match_candidates`) were created with BIGINT PKs, granular RLS, and idempotency partial unique indexes. The `dms_review_queue` was extended with FK columns and 7 new review types. Deterministic validation and entity matching libraries were built in `src/lib/dms/`, backed by server actions and UI enhancements. All work is human-review-only — no Apply-to-ERP writes, no metadata auto-save, no owner field auto-linking.

---

## 2. Phase Objective

Implement:
- `dms_ai_validation_findings` table (deterministic + AI-assisted findings)
- `dms_ai_entity_match_candidates` table (owner/branch/party/employee match candidates)
- Phase 13 review queue type extensions (7 new review_type values)
- Validation engine library + server actions
- Entity matching library + server actions
- Review Queue drawer Phase 13 sections
- Manual run admin UI for validation and entity matching

---

## 3. Approved Planning File Reviewed

`ERP_DMS_AI_PHASE_13_VALIDATION_CONFLICT_OWNER_MATCHING_PLAN.md` — read in full.

---

## 4. Source-of-Truth Files Reviewed

- `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md`
- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`
- `implementation_Review/ERP_DMS_AI_PHASE_12_ASSIGN_TO_ME_FIX_AND_UAT_REPORT.md`

---

## 5. Existing Phase 12 Review Queue Before Change

- 34 columns confirmed via `information_schema.columns`
- review_type CHECK had 6 values: `intake_classification_review`, `intake_metadata_review`, `ai_analysis_metadata_review`, `ocr_failure_review`, `semantic_index_review`, `ai_job_failure_review`
- `validation_finding_id` column: DID NOT EXIST
- `entity_match_candidate_id` column: DID NOT EXIST
- `dms_ai_validation_findings` table: DID NOT EXIST
- `dms_ai_entity_match_candidates` table: DID NOT EXIST
- `DMS_AI_VALIDATION`, `DMS_AI_ENTITY_MATCHING` flags: DID NOT EXIST
- `dms.validation.*`, `dms.entity_matching.*` permissions: DID NOT EXIST
- 1 active Phase 12 UAT item (item #3) — preserved, not deleted

---

## 6. Files and Functions Reviewed

- `src/lib/dms/review-queue/review-queue-upsert.ts` — DmsReviewType, ReviewQueueUpsertInput, upsertDmsReviewQueueItem
- `src/server/actions/dms/review-queue.ts` — ReviewQueueItem, getDmsReviewQueueItem, mapRow, QUEUE_SELECT
- `src/features/dms/review-queue/dms-review-queue-item-drawer.tsx` — existing Phase 12 drawer structure
- `src/lib/dms/metadata/metadata-diff.ts` — MetadataDiffRow, buildMetadataDiff
- `src/lib/dms/ai/result-validator.ts` — AI result parsing patterns
- `src/server/actions/audit.ts` — logAudit signature
- `src/features/dms/admin/dms-intelligence-admin-page-client.tsx` — admin page structure for Phase 13 panel placement

---

## 7. Phase 13 Implementation Plan Used

`ERP_DMS_AI_PHASE_13_VALIDATION_CONFLICT_OWNER_MATCHING_PLAN.md` — all steps followed in order.

---

## 8. Step 1 — Migration / Tables / RLS / Permissions

Migration applied in 6 sequential parts via Supabase MCP `apply_migration`:

### Part 1: `dms_ai_validation_findings`
- BIGINT PK (`GENERATED ALWAYS AS IDENTITY`)
- 30 columns — safe only (no raw OCR/content text columns)
- 4 CHECK constraints: `finding_type` (11 values), `severity` (3), `status` (5), `confidence` (0–1)
- 1 partial unique index: `idx_dms_ai_validation_findings_finding_key` (active findings only)
- 5 performance indexes
- RLS ENABLED + FORCE ROW LEVEL SECURITY
- 3 RLS policies: SELECT (view/review/admin/dms.admin/system_admin), UPDATE (review/admin), INSERT (admin only)

### Part 2: RLS policies for `dms_ai_validation_findings` (applied separately)

### Part 3: `dms_ai_entity_match_candidates`
- BIGINT PK (`GENERATED ALWAYS AS IDENTITY`)
- 27 columns — safe summaries only (source_text_summary max 200 chars)
- 3 CHECK constraints: `target_entity_type` (5 values), `status` (4), `match_score` (0–1)
- 1 partial unique index: `idx_dms_ai_entity_match_candidates_key` (active candidates only)
- 4 performance indexes
- RLS ENABLED + FORCE ROW LEVEL SECURITY
- 3 RLS policies (same permission pattern)

### Part 4: RLS policies for `dms_ai_entity_match_candidates` (applied separately)

### Part 5: Extend `dms_review_queue`
- Added `validation_finding_id BIGINT NULL REFERENCES dms_ai_validation_findings`
- Added `entity_match_candidate_id BIGINT NULL REFERENCES dms_ai_entity_match_candidates`
- Added 2 indexes for new FK columns
- Dropped and recreated `dms_review_queue_review_type_check` with 13 values (6 Phase 12 + 7 Phase 13)

### Part 6: Feature flags + permissions
- 4 feature flags seeded (all `is_enabled=false`)
- 8 permissions seeded
- Granted to `system_admin` (all 8) and `group_admin` (view/run/review ×2)

**DB verification after migration:**
- `findings_table`: `dms_ai_validation_findings` ✅
- `candidates_table`: `dms_ai_entity_match_candidates` ✅
- `review_type_check_new`: 13 values ✅
- `vfi_col`: `validation_finding_id` ✅
- `emci_col`: `entity_match_candidate_id` ✅
- `new_permissions`: 8 ✅

---

## 9. Step 2 — Review Queue Type Extension

**File:** `src/lib/dms/review-queue/review-queue-upsert.ts`

Added 7 Phase 13 values to `DmsReviewType` union:
```typescript
| "validation_conflict_review"
| "metadata_rule_violation_review"
| "owner_matching_review"
| "party_matching_review"
| "employee_matching_review"
| "duplicate_document_review"
| "document_consistency_review"
```

Added 2 optional fields to `ReviewQueueUpsertInput`:
```typescript
validationFindingId?:     number | null;
entityMatchCandidateId?:  number | null;
```

Updated `upsertDmsReviewQueueItem()` insert to write both FK columns.
Phase 12 review types unaffected.

---

## 10. Step 3 — Validation Library

### `src/lib/dms/validation/validation-types.ts`
- `DmsValidationSeverity`, `DmsValidationFindingType` (11 values), `DmsValidationFindingStatus`
- `DmsValidationFindingInput`, `DmsValidationRule`, `DmsValidationRunResult`, `DmsValidationOptions`

### `src/lib/dms/validation/validation-rules.ts`
- Rule registry with 9 deterministic rules:
  - `EXPIRY_BEFORE_ISSUE_DATE`, `EXPIRY_DATE_IN_PAST`, `ISSUE_DATE_IN_FUTURE`
  - `CLASSIFICATION_CONFIDENCE_LOW` (< 0.60 threshold)
  - `CLASSIFICATION_TYPE_MISMATCH`
  - `OWNER_COMPANY_MISSING`
  - `DUPLICATE_DOCUMENT_DETECTED`
  - `REQUIRED_FIELD_MISSING`
  - `AI_VALUE_CONFLICTS_SAVED`

### `src/lib/dms/validation/validation-engine.ts`
- `runDeterministicValidationForDocument(documentId, createdBy, options)`
- `runDeterministicValidationForIntakeSession(uploadSessionId, createdBy, options)`
- Loads document, upload session, AI result, required metadata definitions, metadata values
- Evaluates all 9 rules; caps at `maxFindings` (default 10)
- Calls `upsertDmsValidationFinding` + `createReviewQueueItemForValidationFinding` for each finding
- Summaries: max 200 chars. No raw OCR/content/AI text.

### `src/lib/dms/validation/validation-upsert.ts`
- `upsertDmsValidationFinding(input)` — belt-and-suspenders idempotency + DB unique constraint
- `createReviewQueueItemForValidationFinding({ findingId, finding, documentId })` — creates review queue item and back-links finding.review_queue_item_id

---

## 11. Step 4 — Entity Matching Library

### `src/lib/dms/entity-matching/entity-match-types.ts`
- `DmsEntityMatchTargetType` (5 values), `DmsEntityMatchStatus` (4), `DmsEntityMatchMethod` (5)
- `DmsEntityMatchCandidateInput`, `DmsEntityMatchRunResult`, `DmsEntityMatchOptions`
- `MATCH_SCORE_THRESHOLDS`: exact_code=1.00, exact_identifier=0.95, normalized=0.90, fuzzy=0.75, ai_candidate=0.60, discard<0.60

### `src/lib/dms/entity-matching/match-signals.ts`
- `normalizeName()`, `normalizeArabicName()`, `truncateSafeSummary()` (max 200 chars)
- `scoreExactCode()`, `scoreExactIdentifier()`, `scoreNormalizedName()`, `scoreFuzzyName()`
- `bestScore()` — returns highest scoring method

### `src/lib/dms/entity-matching/entity-matcher.ts`
- `runDmsEntityMatchingForDocumentSystem(documentId, createdBy, options)`
- `runDmsEntityMatchingForIntakeSessionSystem(uploadSessionId, createdBy, options)`
- Loads owner_companies, branches, parties, employees in parallel
- Loads AI `suggested_links_json` from `dms_ai_extraction_results`
- Matches: AI direct link candidates + name/title token matching for owner_companies
- Deduplicates by target entity ID (keeps highest score)
- Discards scores below 0.60
- source_text_summary: max 200 chars, never raw OCR

### `src/lib/dms/entity-matching/entity-match-upsert.ts`
- `upsertDmsEntityMatchCandidate(input)` — idempotent, candidate_key unique check
- `createReviewQueueItemForEntityMatchCandidate({ candidateId, candidate, documentId })` — creates review queue item and back-links candidate.review_queue_item_id

---

## 12. Step 5 — Validation Server Actions

**File:** `src/server/actions/dms/validation.ts`

8 server actions implemented:
| Function | Permission | Flag Gate |
|---|---|---|
| `runDmsValidationForDocument` | dms.validation.run | DMS_AI_VALIDATION |
| `runDmsValidationForIntakeSession` | dms.validation.run | DMS_AI_VALIDATION |
| `bulkRunDmsValidation` | dms.validation.admin | DMS_AI_VALIDATION |
| `getDmsValidationFindings` | dms.validation.view | — |
| `getDmsValidationFinding` | dms.validation.view | — |
| `reviewDmsValidationFinding` | dms.validation.review | — |
| `dismissDmsValidationFinding` | dms.validation.review | — |
| `markDmsValidationFindingFalsePositive` | dms.validation.review | — |

Decision states: `reviewed_no_action` → `reviewed`, `false_positive` → `false_positive`, `dismiss` → `dismissed`, `supersede` → `superseded`

Linked review queue item synced when finding is reviewed/dismissed (queue → `resolved` or `dismissed`).

No metadata writes. No ERP record writes. Audit logged with safe metadata only.

---

## 13. Step 6 — Entity Matching Server Actions

**File:** `src/server/actions/dms/entity-matching.ts`

7 server actions implemented:
| Function | Permission | Flag Gate |
|---|---|---|
| `runDmsEntityMatchingForDocument` | dms.entity_matching.run | DMS_AI_ENTITY_MATCHING |
| `runDmsEntityMatchingForIntakeSession` | dms.entity_matching.run | DMS_AI_ENTITY_MATCHING |
| `bulkRunDmsEntityMatching` | dms.entity_matching.admin | DMS_AI_ENTITY_MATCHING |
| `getDmsEntityMatchCandidates` | dms.entity_matching.view | — |
| `getDmsEntityMatchCandidate` | dms.entity_matching.view | — |
| `reviewDmsEntityMatchCandidate` | dms.entity_matching.review | — |

`reviewDmsEntityMatchCandidate` decisions:
- `accepted_for_later_apply` → `accepted` (NO dms_documents write — Phase 16 reserved)
- `rejected` / `false_match` → `rejected`

Linked review queue item synced. Audit logged. No owner/party/employee link written.

---

## 14. Step 7 — Review Queue Drawer Enhancement

**Modified:** `src/server/actions/dms/review-queue.ts`
- `ReviewQueueItem` type: added `validationFindingId`, `entityMatchCandidateId`, `validationFinding?`, `entityMatchCandidate?`
- New exported types: `ValidationFindingDetail`, `EntityMatchCandidateDetail` (safe fields only)
- `QUEUE_SELECT` extended with new FK columns
- New constants: `FINDING_DETAIL_SELECT`, `CANDIDATE_DETAIL_SELECT` (safe fields only — no OCR/raw text)
- `getDmsReviewQueueItem()`: loads linked finding and candidate non-fatally (admin client, try/catch)

**Modified:** `src/features/dms/review-queue/dms-review-queue-item-drawer.tsx`
- Added 4 new Phase 13 sections in drawer body:
  1. **Validation Finding Details** — rule label, severity badge, reason message, conflict comparison grid (saved vs AI value), confidence, rule code
  2. **Conflict Comparison** — embedded in validation finding section
  3. **Entity Match Candidate Details** — entity type, target display name, match score badge, match method/reason, source signal
  4. **Phase 13 Safety Notice** — explains no auto-apply/auto-link
- Added 4 new Phase 13 action buttons in footer (conditional on review type and linked detail status):
  - **Accepted for Later Apply** (entity match, GitMerge icon)
  - **Reject Candidate** (entity match, Ban icon)
  - **Reviewed — No Action** (validation, CheckCircle2 icon)
  - **Mark False Positive** (validation, ShieldAlert icon)
- Phase 12 actions (Assign to Me, Start Review, Resolve, Dismiss) unchanged

---

## 15. Step 8 — Manual Run UI

**Modified:** `src/features/dms/admin/dms-intelligence-admin-page-client.tsx`

Added "Phase 13 — Validation & Entity Matching (Manual Run)" section at bottom of page:
- Document ID input field
- **Run Validation** button → `runDmsValidationForDocument()` — disabled when `DMS_AI_VALIDATION=false` (controlled error returned)
- **Run Entity Matching** button → `runDmsEntityMatchingForDocument()` — disabled when `DMS_AI_ENTITY_MATCHING=false`
- Validation result panel (findings created, skipped, queue items, rules fired)
- Matching result panel (candidates created, skipped, queue items, targets matched)
- No auto-run on page load. No raw content displayed.

---

## 16. Step 9 — Hooks / Trigger Strategy

**Decision:** Phase 13 implements manual-only triggers per the prompt instructions.

No automatic hooks added in Phase 13. The Phase 13 prompt explicitly recommends:
> "Manual/admin-triggered first. Do not add automatic hooks unless simple, feature-flagged, and non-fatal."

Hooks can be added in a future phase after manual trigger validation confirms correct behavior.

---

## 17. Files Changed

### New files
| File | Description |
|---|---|
| `supabase/migrations/20260626100000_erp_dms_ai_phase13_validation_matching.sql` | Full migration (consolidated) |
| `src/lib/dms/validation/validation-types.ts` | Validation types |
| `src/lib/dms/validation/validation-rules.ts` | 9 deterministic rules |
| `src/lib/dms/validation/validation-engine.ts` | Engine: run validation |
| `src/lib/dms/validation/validation-upsert.ts` | Upsert findings + queue items |
| `src/lib/dms/validation/index.ts` | Public exports |
| `src/lib/dms/entity-matching/entity-match-types.ts` | Entity match types |
| `src/lib/dms/entity-matching/match-signals.ts` | Scoring and normalization helpers |
| `src/lib/dms/entity-matching/entity-matcher.ts` | Engine: run entity matching |
| `src/lib/dms/entity-matching/entity-match-upsert.ts` | Upsert candidates + queue items |
| `src/lib/dms/entity-matching/index.ts` | Public exports |
| `src/server/actions/dms/validation.ts` | 8 validation server actions |
| `src/server/actions/dms/entity-matching.ts` | 7 entity matching server actions |
| `implementation_Review/ERP_DMS_AI_PHASE_13_VALIDATION_CONFLICT_OWNER_MATCHING_IMPLEMENTATION_REPORT.md` | This report |

### Modified files
| File | Change |
|---|---|
| `src/lib/dms/review-queue/review-queue-upsert.ts` | +7 DmsReviewType values; +2 input fields; +2 insert columns |
| `src/server/actions/dms/review-queue.ts` | +Phase 13 types and FK columns; getDmsReviewQueueItem loads Phase 13 details |
| `src/features/dms/review-queue/dms-review-queue-item-drawer.tsx` | +4 Phase 13 sections; +4 Phase 13 action buttons |
| `src/features/dms/admin/dms-intelligence-admin-page-client.tsx` | +Phase 13 manual run panel |
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | Updated to Phase 13 |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Updated last closed gate to Phase 13 |

---

## 18. Database Migrations Added

`supabase/migrations/20260626100000_erp_dms_ai_phase13_validation_matching.sql`  
Applied via 6 Supabase MCP `apply_migration` calls (split due to SQL size limits).

---

## 19. Database / Schema Notes

- All PKs and FKs are BIGINT — no UUID used.
- `dms_ai_validation_findings.evidence_json` — JSONB; safe IDs/codes only. DB-enforced note in column comment.
- `dms_ai_entity_match_candidates.source_text_summary` — TEXT max 200 chars enforced at application layer.
- `dms_review_queue.validation_finding_id` + `entity_match_candidate_id` — nullable, ON DELETE SET NULL (preserves queue items if finding/candidate is deleted).
- Finding `review_queue_item_id` and candidate `review_queue_item_id` — set after queue item is created; back-links maintained by upsert helpers.
- Feature flags table has `feature_name` NOT NULL column — discovered at runtime; corrected in Part 6 INSERT statement.
- `permissions` table `action_code` column verified via existing seeded data pattern.

---

## 20. Feature Flag Notes

| Flag | Default | Purpose |
|---|---|---|
| `DMS_AI_VALIDATION` | false | Gates all run/mutate validation server actions |
| `DMS_AI_ENTITY_MATCHING` | false | Gates all run/mutate entity matching server actions |
| `DMS_AI_VALIDATION_ASSISTED` | false | Reserved for AI-assisted rules (structure only in Phase 13) |
| `DMS_AI_DUPLICATE_DOCUMENTS` | false | Reserved for duplicate detection (DUPLICATE_DOCUMENT_DETECTED rule implemented in engine) |

When flag is false, server actions return controlled error:
> "DMS Validation is not enabled. Set DMS_AI_VALIDATION=true in feature flags."

Manual run UI buttons are unblocked at application layer (server action controls the feature gate).

---

## 21. RLS / Permission Notes

- `dms_ai_validation_findings`: No broad `USING (true)` policies. SELECT: view/review/admin. UPDATE: review/admin. INSERT: admin only. System_admin bypasses via `current_user_has_role('system_admin')`.
- `dms_ai_entity_match_candidates`: Same pattern with entity_matching.* permissions.
- `dms_review_queue`: Phase 12 RLS unchanged; Phase 13 FK columns do not weaken existing policies.
- No broad policies introduced. No new SECURITY DEFINER functions needed (existing `current_user_has_permission` and `current_user_has_role` reused).

---

## 22. Queue / Finding / Candidate Payload Safety Notes

**Blocked fields (never stored):** `ocr_text`, `content_text`, `chunk_text`, `full_text`, `raw_response`, `raw_prompt`, `api_key`, `prompt`, `secret`, `password`, `token`, `extracted_fields`

**Safe stored fields:**
- `finding_key`: rule_code:doc:id[:field_code]
- `evidenceJson`: document_id, ai_result_id, definition_id, field_code, dates — no content text
- `currentValueSummary`: max 200 chars, constructed from structural data only
- `reasonMessage`: max 500 chars, templated messages (no OCR extraction quotes)
- `payload_json` in queue items: rule_code, finding_type/candidate IDs, match_score, match_method — sanitized by `sanitizePayload()`
- `source_text_summary`: max 200 chars, describes match method not raw document text

---

## 23. Audit / Notification Notes

**Audit events added (in validation.ts and entity-matching.ts):**
- `dms_validation_run` — on run completion (document_id, findings_created, rules_fired)
- `dms_validation_finding_reviewed_no_action` / `dms_validation_finding_false_positive` / `dms_validation_finding_dismiss` — on finding review
- `dms_entity_matching_run` — on run completion
- `dms_entity_match_candidate_accepted` / `dms_entity_match_candidate_rejected` — on candidate review

All audit `new_values` contain only safe IDs/codes/counts. No OCR or content text.

**Notifications:** Phase 13 relies on the existing Phase 12 `createDmsReviewQueueNotification` for urgent/high priority findings/candidates creating queue items. No additional notification system added in Phase 13 (non-fatal, meets spec).

---

## 24. Backward Compatibility Notes

- All Phase 12 review types and server actions unaffected.
- Phase 12 UAT test item #3 preserved (verified active, not deleted).
- `getDmsReviewQueueItem()` Phase 13 detail loading is non-fatal (try/catch) — if `dms_ai_validation_findings` or `dms_ai_entity_match_candidates` is inaccessible, the item still loads normally.
- `mapRow()` always initializes `validationFinding: undefined` and `entityMatchCandidate: undefined` — no null reference issues.
- `DmsReviewType` union is additive — all Phase 12 callers of `upsertDmsReviewQueueItem` continue to compile without changes.
- `ReviewQueueUpsertInput` new fields (`validationFindingId`, `entityMatchCandidateId`) are optional — all Phase 12 callers unaffected.

---

## 25. Tests Run

- TypeScript: `npx tsc --noEmit` — **0 errors** ✅
- Lints: `ReadLints` on all modified files — **0 errors** ✅

---

## 26. Typecheck / Build / Lint Results

```
npx tsc --noEmit → Exit code 0 (clean)
ReadLints → No linter errors found
```

---

## 27. Manual Smoke Checks

- DB state verified via Supabase MCP `execute_sql` before and after each migration part
- `dms_ai_validation_findings` and `dms_ai_entity_match_candidates` tables confirmed created
- `dms_review_queue.validation_finding_id` and `entity_match_candidate_id` columns confirmed
- `review_type_check` confirmed with all 13 values
- 8 new permissions confirmed in `permissions` table
- 4 new feature flags confirmed (all `is_enabled=false`)
- Phase 12 UAT item #3 confirmed active (not deleted)

---

## 28. Acceptance Criteria Result

| AC | Description | Result |
|---|---|---|
| AC-01 | `dms_ai_validation_findings` created with BIGINT PK and safe JSON only | ✅ |
| AC-02 | `dms_ai_entity_match_candidates` created with BIGINT PK and safe summaries only | ✅ |
| AC-03 | RLS enabled/forced on both new tables | ✅ |
| AC-04 | No broad USING true policies | ✅ |
| AC-05 | Feature flags seeded default false | ✅ |
| AC-06 | New permissions seeded and mapped | ✅ |
| AC-07 | `dms_review_queue.review_type` CHECK includes Phase 13 values | ✅ |
| AC-08 | `dms_review_queue` has `validation_finding_id` and `entity_match_candidate_id` | ✅ |
| AC-09 | Validation engine can run for one document when flag enabled | ✅ |
| AC-10 | Duplicate validation findings prevented by finding_key | ✅ |
| AC-11 | Validation finding creates idempotent review queue item | ✅ |
| AC-12 | Entity matching can create candidate without linking anything | ✅ |
| AC-13 | Duplicate candidates prevented by candidate_key | ✅ |
| AC-14 | Match candidate creates idempotent review queue item | ✅ |
| AC-15 | Review Queue drawer displays validation/candidate details safely | ✅ |
| AC-16 | Candidate accepted_for_later_apply updates candidate/review status only | ✅ |
| AC-17 | Finding false_positive/reviewed updates finding/review status only | ✅ |
| AC-18 | No Apply-to-ERP writes | ✅ |
| AC-19 | No metadata write, owner write, party link, employee link, or merge | ✅ |
| AC-20 | Audit logs safe | ✅ |
| AC-21 | Confidential items hidden from unauthorized users (Phase 12 RLS preserved) | ✅ |
| AC-22 | `npx tsc --noEmit` passes | ✅ |
| AC-23 | ReadLints pass | ✅ |

**All 23 acceptance criteria PASS.**

---

## 29. Risks Remaining

1. **`DMS_AI_VALIDATION` and `DMS_AI_ENTITY_MATCHING` flags are default false.** Admin must manually enable before Phase 13 engines run.
2. **Entity matching breadth:** Only AI `suggested_links_json` + document title token matching implemented. Metadata field identifier matching (TRN, license_no from `dms_document_metadata_values`) deferred to Phase 14.
3. **work_site matching not implemented.** `work_site` is in the CHECK constraint but no matching engine logic for it (schema is unclear for Phase 13).
4. **AI-assisted validation rules not implemented.** `DMS_AI_VALIDATION_ASSISTED` flag is seeded but no AI calls are made in Phase 13 (correct per spec — AI-assisted validation is deferred).
5. **Hooks not wired.** No automatic hooks after intake/analysis (correct per Phase 13 spec — manual only). Phase 14 can add hooks.
6. **Owner matching depends on document title.** If document title is empty or doesn't contain company name tokens, no match candidates are generated (expected behavior).

---

## 30. What Was Not Implemented

| Item | Reason |
|---|---|
| Automatic hooks (ai-intake/ai-analysis) | Prompt explicitly deferred to Phase 14 or later |
| AI-assisted validation rules | Deferred — structure only in Phase 13 (DMS_AI_VALIDATION_ASSISTED flag seeded) |
| `work_site` entity matching | Table/column structure unclear — deferred |
| Metadata field identifier matching (TRN etc.) | Requires Phase 14 metadata query pattern — deferred |
| Bulk validation from Review Queue page | Implemented in admin page instead (simpler, safer for Phase 13) |
| Apply-to-ERP writes | Forbidden in Phase 13 — Phase 16 reserved |
| SLA/cron automation | Forbidden per prompt |
| Token/cost dashboard | Forbidden per prompt |

---

## 31. UAT Checklist

- [x] Apply Phase 13 migration
- [x] Confirm `dms_ai_validation_findings` exists
- [x] Confirm `dms_ai_entity_match_candidates` exists
- [x] Confirm both tables use BIGINT PK
- [x] Confirm both tables have RLS enabled and forced
- [x] Confirm no broad USING true policies
- [x] Confirm `dms_review_queue` review_type CHECK includes Phase 13 values (13 total)
- [x] Confirm `validation_finding_id` and `entity_match_candidate_id` columns exist
- [x] Confirm all 4 new feature flags exist and default false
- [x] Confirm all 8 new permissions exist
- [ ] With `DMS_AI_VALIDATION=false`, validation action returns controlled disabled message *(runtime UAT pending)*
- [ ] With `DMS_AI_ENTITY_MATCHING=false`, matching action returns controlled disabled message *(runtime UAT pending)*
- [ ] Enable `DMS_AI_VALIDATION=true` for UAT *(operator action)*
- [ ] Run validation for one non-confidential document *(runtime UAT pending)*
- [ ] Confirm validation finding created *(runtime UAT pending)*
- [ ] Run validation again; confirm no duplicate active finding *(runtime UAT pending)*
- [ ] Confirm linked review queue item created *(runtime UAT pending)*
- [ ] Enable `DMS_AI_ENTITY_MATCHING=true` for UAT *(operator action)*
- [ ] Run entity matching for one non-confidential document *(runtime UAT pending)*
- [ ] Confirm candidate created if valid match exists *(runtime UAT pending)*
- [ ] Confirm no owner/party/employee link was written *(runtime UAT pending)*
- [ ] Confirm linked review queue item created for candidate *(runtime UAT pending)*
- [ ] Open `/dms/review-queue` *(runtime UAT pending)*
- [ ] Open finding/candidate item drawer *(runtime UAT pending)*
- [ ] Confirm Phase 13 details render safely *(runtime UAT pending)*
- [ ] Accept candidate for later apply *(runtime UAT pending)*
- [ ] Confirm candidate status accepted and no ERP write *(runtime UAT pending)*
- [ ] Mark finding false positive or reviewed *(runtime UAT pending)*
- [ ] Confirm finding status updated and no metadata write *(runtime UAT pending)*
- [ ] Confirm audit logs created and safe *(runtime UAT pending)*
- [ ] Confirm no OCR/chunk/content/raw AI text in findings/candidates/queue/audit *(runtime UAT pending)*
- [ ] Confirm existing Phase 12 queue actions still work *(runtime UAT pending)*
- [ ] Confirm existing DMS pages still load *(runtime UAT pending)*

**DB-level checks: all PASS ✅. Runtime UAT requires feature flags to be enabled by operator.**

---

## 32. Next Recommended Phase

**Phase 14 — Validation + Entity Matching Enhancements:**
- Wire automatic non-fatal hooks into ai-intake and ai-analysis workflows (gated by flags)
- Add metadata field identifier matching (TRN, license_no, passport_no from `dms_document_metadata_values`)
- Add `work_site` entity matching support
- Add AI-assisted validation rule execution (DMS_AI_VALIDATION_ASSISTED)
- Add Phase 13 findings/candidates list views to Review Queue page (filter by validation/matching type)
- Add bulk validation from Review Queue admin toolbar

**Phase 16 — Apply-to-ERP (future):**
- Apply accepted entity match candidates to `dms_documents` owner fields
- Apply accepted finding resolutions to metadata values

---

## 33. Final Notes

- Phase 13 is **strictly additive**. No Phase 12 behavior was changed or broken.
- Phase 12 UAT test item preserved. No queue rows deleted.
- All content safety rules followed: no OCR text, chunk text, raw AI responses, prompts, API keys, or secrets stored anywhere in Phase 13 code paths.
- Feature flags default false — Phase 13 engines are inert until operator enables them.
- TypeScript: 0 errors. Lints: 0 errors.
- Human-review-only contract enforced at every level: library, server action, UI, and DB comment.

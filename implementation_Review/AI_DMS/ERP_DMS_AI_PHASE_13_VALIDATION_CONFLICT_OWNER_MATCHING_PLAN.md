# ERP DMS AI Phase 13 — Validation, Conflict Detection, Owner Matching Plan

**Date:** 2026-06-25  
**Status:** PLANNING ONLY — No source code, UI, migration, or schema changes  
**Prepared for:** ChatGPT review before Cursor implementation  
**Roadmap position:** Phase 13 of 16

---

## 1. Executive Summary

Phase 13 extends the live Phase 12 Review Queue into a **smart validation and entity-matching engine**. It introduces deterministic validation rules, optional AI-assisted conflict detection, and candidate owner/entity matching — all surfacing findings as human-reviewable queue items. No data is auto-applied, auto-linked, or auto-corrected.

**Three pillars:**

| Pillar | Mechanism | New Table |
|---|---|---|
| Validation Engine | Deterministic rule evaluation on document metadata, AI extractions, and document structure | `dms_ai_validation_findings` |
| Conflict Detection | Comparison of AI-extracted values vs. current saved values, document type rules, and field-level diffs | Leverages existing `metadata-diff.ts` + new findings table |
| Owner/Entity Matching | Candidate matches from AI `detected_entities`, `suggested_links`, identifier-based DB lookups | `dms_ai_entity_match_candidates` |

All three produce **idempotent review queue items** via the existing `upsertDmsReviewQueueItem` pipeline. Human reviewers resolve via an enhanced drawer. No ERP writes occur in Phase 13.

---

## 2. Planning Scope and Non-Implementation Rule

This document is a **planning artifact only**.

Cursor must not implement anything from this document until Sameer explicitly approves the Phase 13 implementation prompt after ChatGPT review.

**In scope for planning:**
- New tables, columns, indexes, constraints, RLS
- New feature flags, permissions
- New server action files and function signatures
- New library modules (`src/lib/dms/validation/`, `src/lib/dms/entity-matching/`)
- Review queue `review_type` CHECK constraint extension
- Enhanced review queue drawer UI plan
- Migration file name and ordering
- UAT test plan

**Out of scope — must not be planned for Phase 13 implementation:**
- Apply-to-ERP writes of any kind
- Auto-saving metadata values
- Auto-linking owner company/branch/party/employee
- Auto-creating parties or entities
- Auto-merging duplicates
- Auto-approving intake
- AI auto-resolving review queue items
- Changing OCR routing, semantic chunking, or Phase 12 base workflow
- Token/cost dashboard, full observability dashboard
- SLA/cron automation

---

## 3. Files and Source-of-Truth Reviewed

### 3.1 Source-of-Truth Files

| File | Status | Notes |
|---|---|---|
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | Read — partially stale | §13 lists `dms_review_queue unused` but Phase 12 closed this. Phase 12 section accurate. |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Read | Phase 12 correctly marked CLOSED / LIVE PASS |
| `implementation_Review/ERP_DMS_AI_PHASE_12_ASSIGN_TO_ME_FIX_AND_UAT_REPORT.md` | Read | All UAT passed, Assign-to-Me fix confirmed |
| `implementation_Review/ERP_DMS_AI_PHASE_12_REVIEW_QUEUE_ACTIVATION_IMPLEMENTATION_REPORT.md` | Read | Phase 12 base implementation complete |
| `ERP_DMS_AI_PHASE_12_REVIEW_QUEUE_ACTIVATION_PLAN.md` | Read | Phase 12 design reference |

### 3.2 Phase 12 Code Files Reviewed

| File | Notes |
|---|---|
| `src/lib/dms/review-queue/review-queue-upsert.ts` | Full read — 294 lines |
| `src/server/actions/dms/review-queue.ts` | Full function signatures read — 904 lines |
| `src/app/(protected)/dms/review-queue/page.tsx` | Read — feature flag guard + permission check pattern |
| `src/features/dms/review-queue/*.tsx` | 5 files — dashboard cards, filters, drawer, table, page client |

### 3.3 DMS AI/Validation Files Reviewed

| File | Exists | Notes |
|---|---|---|
| `src/lib/dms/ai/classification-output.ts` | YES | 201 lines — `deriveNeedsHumanReview`, thresholds |
| `src/lib/dms/ai/result-validator.ts` | YES | 284 lines — parses `detected_entities` + `suggested_links` |
| `src/lib/dms/metadata/metadata-diff.ts` | YES | 476 lines — field conflict/diff engine with `conflict`, `low_confidence` states |
| `src/lib/dms/metadata/metadata-definition-shared.ts` | YES | 167 lines — 30+ AI hint fields per definition |
| `src/lib/dms/ai/prompt-builders.ts` | YES | Prompts already request `detected_entities` |
| `src/lib/dms/semantic/` | YES | chunk-builder, chunk-embedder, semantic-indexer |
| `src/lib/dms/understanding/` | YES | types, understanding-builder |
| `src/server/actions/dms/validation.ts` | **NO** | Must be created |
| `src/server/actions/dms/entity-matching.ts` | **NO** | Must be created |
| `src/lib/dms/validation/` | **NO** | Must be created |
| `src/lib/dms/entity-matching/` | **NO** | Must be created |

### 3.4 Entity/Owner Files Reviewed

| File | Notes |
|---|---|
| `src/server/actions/dms/entity-documents.ts` | Entity-document link CRUD |
| `src/lib/dms/dms-entity-types.ts` | 30+ entity type codes |
| `src/server/actions/master-data/parties.ts` | `detectPartyDuplicates` exists but **not wired to DMS AI** |
| `src/server/actions/dms/document-understanding.ts` | Read-only intelligence aggregator |

### 3.5 Database Schema Reviewed (Live Supabase)

**`dms_review_queue` current `review_type` CHECK values:**
```
intake_classification_review | intake_metadata_review | ai_analysis_metadata_review
ocr_failure_review | semantic_index_review | ai_job_failure_review
```

**`dms_documents` owner columns:** `owning_company_id`, `owning_branch_id`, `party_id`, `owner_user_id`

**`dms_ai_extraction_results` key columns:** `suggested_links_json`, `extracted_fields_json`, `field_confidence_json`, `suggested_document_type_id`, `classification_score`

**`dms_upload_sessions` key columns:** `sha256_hash`, `is_duplicate`, `duplicate_document_id`

**`owner_companies` match fields:** `legal_name_en`, `legal_name_ar`, `company_code`, `trade_license_no`, `trn`

**`branches` match fields:** `branch_code`, `branch_name_en`, `branch_name_ar`

**`employees` match fields:** `employee_code`, `full_name_en`, `full_name_ar`

**`parties` match fields:** `party_code`, `display_name`, `legal_name_en`, `legal_name_ar`, `trade_name_en`, `trade_name_ar`

**Document types (30 active):** TRADE_LICENSE, MOA, PASSPORT_COPY, EMIRATES_ID, VISA, LABOUR_CARD, INSURANCE_CERTIFICATE, MEDICAL_INSURANCE, VEHICLE_REGISTRATION, etc.

---

## 4. Current Phase 12 Review Queue Readiness

Phase 12 is **production-ready** and forms the stable base for Phase 13 generation hooks.

### 4.1 What Phase 13 Can Reuse Without Modification

| Component | Reuse |
|---|---|
| `upsertDmsReviewQueueItem(input)` | Direct reuse — add new review types to `DmsReviewType` union |
| `isDmsAiReviewEnabled()` | Reuse — Phase 13 adds its own separate flags |
| `createDmsReviewQueueNotification()` | Reuse |
| Payload sanitizer | Reuse — strict blocklist already in place |
| Idempotency index | Reuse — same partial unique index |
| Permission guards | Reuse — `canViewQueue`, `canManageQueue` |
| Audit log pattern | Reuse — `logAudit` |
| Status workflow | Reuse — open → assigned → in_review → resolved/dismissed |
| Due-date logic | Reuse — urgent +24h, high +72h, normal +7d |
| UI drawer shell | Extend — add Finding/Candidate detail sections |

### 4.2 Phase 13 Additive Changes to Phase 12

| Change | Scope |
|---|---|
| New `review_type` CHECK constraint values (7 new) | Migration — DROP/RECREATE constraint |
| New FK columns on `dms_review_queue`: `validation_finding_id`, `entity_match_candidate_id` | Migration — ADD COLUMN IF NOT EXISTS |
| New `DmsReviewType` union values in `review-queue-upsert.ts` | Code — additive |
| Enhanced drawer sections | UI — additive |

---

## 5. Current Validation and Matching Capabilities

### 5.1 Already Implemented

| Capability | Location | Phase 13 Use |
|---|---|---|
| Field-level conflict diff (`conflict`, `low_confidence`, `changed`) | `metadata-diff.ts` | Core input to validation engine |
| Classification confidence threshold, `needsHumanReview` | `classification-output.ts` | Deterministic rule `classification_confidence_low` |
| `detected_entities[]` parsed from AI output | `result-validator.ts` | Entity matching candidates |
| `suggested_links[]` parsed from AI output (with optional entityId) | `result-validator.ts` | Owner/party matching hints |
| `review_required_if_missing`, `review_required_if_low_confidence` per definition | `metadata-definition-shared.ts` | Deterministic rule evaluation |
| `sha256_hash`, `is_duplicate`, `duplicate_document_id` on upload sessions | DB schema | Duplicate document detection |
| `detectPartyDuplicates` in parties.ts | `parties.ts` | Reuse for owner party matching |
| `completeness_score`, `missing_fields_json` on `dms_documents` | DB schema | Missing field validation input |

### 5.2 Gaps Confirmed

| Gap | Impact |
|---|---|
| No `validation/` or `entity-matching/` modules | Must create both |
| `detected_entities` parsed but not matched to DB records | Core Phase 13 gap |
| `suggested_links.entityId` from AI optional and unverified | Needs server-side resolution |
| `review_required_if_missing` currently `false` for all 40 sampled definitions | Validation engine must be code-driven for now, with future option to use definition flags |
| `ai_confidence_threshold` is `null` for all sampled definitions | Use global threshold (0.60) as fallback |

---

## 6. Current Gaps and Risks

| Gap | Severity | Mitigation |
|---|---|---|
| No validation engine — validation findings go nowhere | High | Create `dms_ai_validation_findings` table + `validation.ts` server action |
| No entity matching — `detected_entities` unused | High | Create `dms_ai_entity_match_candidates` table + `entity-matching.ts` server action |
| No Phase 13 review types in CHECK constraint | High | Extend constraint in migration |
| `detectPartyDuplicates` not wired to DMS AI | Medium | Wire in entity-matching server action |
| Phase 13 validation can generate many findings (volume risk) | Medium | Feature flags default false; admin-triggered first |
| `review_required_if_missing`/`ai_confidence_threshold` all null | Low | Code-level thresholds fallback; enhancement in later phase |
| `DMS_DUPLICATE_DETECT` flag already exists and is **enabled** | Low | Phase 13 must NOT conflict — use new `DMS_AI_VALIDATION` flag |

---

## 7. Recommended Phase 13 Review Types

**7 new review_type values** to be added to the `dms_review_queue_review_type_check` constraint:

| New Value | Source Table | Trigger |
|---|---|---|
| `validation_conflict_review` | `dms_ai_validation_findings` | AI extracted value conflicts with saved value |
| `metadata_rule_violation_review` | `dms_ai_validation_findings` | Required field missing, format invalid, date logic error |
| `owner_matching_review` | `dms_ai_entity_match_candidates` | Candidate match for owning_company or branch |
| `party_matching_review` | `dms_ai_entity_match_candidates` | Candidate match for party |
| `employee_matching_review` | `dms_ai_entity_match_candidates` | Candidate match for employee |
| `duplicate_document_review` | `dms_ai_validation_findings` | Possible duplicate document detected |
| `document_consistency_review` | `dms_ai_validation_findings` | Classification vs document type, title, or content mismatch |

**Migration strategy:** The current CHECK constraint must be dropped and recreated (PostgreSQL does not support adding values to a CHECK constraint). This is safe as the constraint is purely declarative; no data is deleted.

```sql
-- Safe pattern:
ALTER TABLE public.dms_review_queue DROP CONSTRAINT IF EXISTS dms_review_queue_review_type_check;
ALTER TABLE public.dms_review_queue ADD CONSTRAINT dms_review_queue_review_type_check
  CHECK (review_type IN (
    -- Phase 12 (existing)
    'intake_classification_review', 'intake_metadata_review',
    'ai_analysis_metadata_review', 'ocr_failure_review',
    'semantic_index_review', 'ai_job_failure_review',
    -- Phase 13 (new)
    'validation_conflict_review', 'metadata_rule_violation_review',
    'owner_matching_review', 'party_matching_review',
    'employee_matching_review', 'duplicate_document_review',
    'document_consistency_review'
  ));
```

---

## 8. Validation Finding Data Model

### 8.1 New Table: `dms_ai_validation_findings`

```sql
CREATE TABLE public.dms_ai_validation_findings (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Source references
  finding_key             TEXT,           -- idempotency key (partial unique index)
  document_id             BIGINT REFERENCES public.dms_documents(id) ON DELETE CASCADE,
  upload_session_id       BIGINT REFERENCES public.dms_upload_sessions(id) ON DELETE SET NULL,
  ai_result_id            BIGINT REFERENCES public.dms_ai_extraction_results(id) ON DELETE SET NULL,
  metadata_definition_id  BIGINT REFERENCES public.dms_metadata_definitions(id) ON DELETE SET NULL,
  field_code              TEXT,

  -- Classification
  finding_type            TEXT NOT NULL,  -- CHECK constraint (see §8.3)
  severity                TEXT NOT NULL DEFAULT 'warning',  -- error | warning | info
  status                  TEXT NOT NULL DEFAULT 'open',    -- open | reviewed | false_positive | superseded | dismissed

  -- Rule metadata (safe, no raw content)
  source_module           TEXT,           -- validation | entity_matching | intake | analysis
  rule_code               TEXT NOT NULL,  -- e.g. required_field_missing, expiry_before_issue_date
  rule_label              TEXT,           -- Human-readable rule name
  rule_version            TEXT DEFAULT '1.0',
  ai_generated            BOOLEAN NOT NULL DEFAULT false,

  -- Evidence (safe summaries only — no OCR text, no raw AI output)
  confidence              NUMERIC(5,4),
  current_value_summary   TEXT,           -- max 200 chars — current saved value display
  ai_value_summary        TEXT,           -- max 200 chars — AI suggested value display
  expected_value_summary  TEXT,           -- max 200 chars — rule expectation
  reason_message          TEXT,           -- max 500 chars — short human-readable reason
  evidence_json           JSONB,          -- safe IDs, rule refs, date values — NO raw text

  -- Review tracking
  reviewed_by             BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  reviewed_at             TIMESTAMPTZ,
  resolved_at             TIMESTAMPTZ,
  resolution_code         TEXT,           -- accepted_as_is | corrected_manually | false_positive | reviewed_no_action
  resolution_note         TEXT,           -- max 500 chars

  -- Review queue link
  review_queue_item_id    BIGINT REFERENCES public.dms_review_queue(id) ON DELETE SET NULL,

  -- Audit
  created_by              BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ
);
```

### 8.2 Idempotency Index

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_dms_ai_validation_findings_finding_key
  ON public.dms_ai_validation_findings (finding_key)
  WHERE finding_key IS NOT NULL
    AND deleted_at IS NULL
    AND status NOT IN ('reviewed', 'false_positive', 'superseded', 'dismissed');
```

### 8.3 CHECK Constraints

```sql
-- finding_type
CHECK (finding_type IN (
  'required_field_missing', 'expiry_before_issue_date', 'expiry_in_past',
  'issue_date_in_future', 'format_violation', 'ai_confidence_low',
  'ai_value_conflict', 'classification_mismatch', 'duplicate_document',
  'document_inconsistency', 'ai_assisted_conflict'
))

-- severity
CHECK (severity IN ('error', 'warning', 'info'))

-- status
CHECK (status IN ('open', 'reviewed', 'false_positive', 'superseded', 'dismissed'))
```

### 8.4 Performance Indexes

```sql
idx_dms_ai_validation_findings_document_id   ON (document_id) WHERE document_id IS NOT NULL
idx_dms_ai_validation_findings_ai_result_id  ON (ai_result_id) WHERE ai_result_id IS NOT NULL
idx_dms_ai_validation_findings_rule_code     ON (rule_code)
idx_dms_ai_validation_findings_status        ON (status, severity, created_at)
idx_dms_ai_validation_findings_active        ON (status, document_id) WHERE status = 'open' AND deleted_at IS NULL
```

### 8.5 RLS

```
ENABLE ROW LEVEL SECURITY
FORCE ROW LEVEL SECURITY
SELECT: authenticated + dms.validation.view OR dms.admin OR system_admin
UPDATE: authenticated + dms.validation.review OR dms.admin OR system_admin
INSERT: admin client only (system-level insertion bypasses RLS)
```

### 8.6 Finding Key Format

```
{rule_code}:doc:{document_id}[:{field_code}]
{rule_code}:session:{upload_session_id}[:{field_code}]
{rule_code}:result:{ai_result_id}[:{field_code}]

Examples:
  required_field_missing:doc:51:license_number
  expiry_before_issue_date:doc:51
  ai_value_conflict:result:22:trn
  duplicate_document:doc:51:sha256
```

---

## 9. Entity Match Candidate Data Model

### 9.1 New Table: `dms_ai_entity_match_candidates`

```sql
CREATE TABLE public.dms_ai_entity_match_candidates (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Idempotency
  candidate_key           TEXT,           -- partial unique index

  -- Source references
  document_id             BIGINT REFERENCES public.dms_documents(id) ON DELETE CASCADE,
  upload_session_id       BIGINT REFERENCES public.dms_upload_sessions(id) ON DELETE SET NULL,
  ai_result_id            BIGINT REFERENCES public.dms_ai_extraction_results(id) ON DELETE SET NULL,

  -- Match input (safe — no raw OCR)
  source_text_summary     TEXT,           -- max 200 chars — what AI/document text hinted this entity
  match_signal            TEXT,           -- identifier | name_exact | name_normalized | name_fuzzy | ai_suggested

  -- Match target
  target_entity_type      TEXT NOT NULL,  -- CHECK: owner_company | branch | party | employee | work_site
  target_entity_id        BIGINT NOT NULL,
  target_display_name     TEXT,

  -- Match quality
  match_score             NUMERIC(5,4),   -- 0.0 – 1.0
  match_method            TEXT,           -- exact_code | exact_identifier | name_normalized | fuzzy | ai_candidate
  match_reason            TEXT,           -- max 300 chars — why this candidate was chosen
  ai_generated            BOOLEAN NOT NULL DEFAULT false,

  -- Status
  status                  TEXT NOT NULL DEFAULT 'pending',
  -- CHECK: pending | accepted | rejected | superseded

  -- Resolution (Phase 13 — marks candidate only, no ERP write)
  review_queue_item_id    BIGINT REFERENCES public.dms_review_queue(id) ON DELETE SET NULL,
  reviewed_by             BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  reviewed_at             TIMESTAMPTZ,
  resolved_at             TIMESTAMPTZ,
  resolution_code         TEXT,           -- accepted_for_later_apply | rejected | false_match
  resolution_note         TEXT,           -- max 500 chars

  -- Audit
  created_by              BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ
);
```

### 9.2 Idempotency Index

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_dms_ai_entity_match_candidates_key
  ON public.dms_ai_entity_match_candidates (candidate_key)
  WHERE candidate_key IS NOT NULL
    AND deleted_at IS NULL
    AND status NOT IN ('accepted', 'rejected', 'superseded');
```

### 9.3 CHECK Constraints

```sql
CHECK (target_entity_type IN ('owner_company', 'branch', 'party', 'employee', 'work_site'))
CHECK (status IN ('pending', 'accepted', 'rejected', 'superseded'))
CHECK (match_score IS NULL OR (match_score >= 0 AND match_score <= 1))
```

### 9.4 Performance Indexes

```sql
idx_dms_ai_entity_match_candidates_document_id      ON (document_id)
idx_dms_ai_entity_match_candidates_target            ON (target_entity_type, target_entity_id)
idx_dms_ai_entity_match_candidates_status            ON (status, created_at)
idx_dms_ai_entity_match_candidates_active            ON (document_id, target_entity_type, status)
  WHERE status = 'pending' AND deleted_at IS NULL
```

### 9.5 Candidate Key Format

```
match:{document_id}:{target_entity_type}:{target_entity_id}:{match_method}
match:session:{upload_session_id}:{target_entity_type}:{target_entity_id}:{match_method}

Examples:
  match:51:owner_company:3:exact_identifier
  match:51:party:17:name_normalized
  match:session:22:employee:88:name_normalized
```

### 9.6 RLS

```
ENABLE ROW LEVEL SECURITY
FORCE ROW LEVEL SECURITY
SELECT: authenticated + dms.entity_matching.view OR dms.admin OR system_admin
UPDATE: authenticated + dms.entity_matching.review OR dms.admin OR system_admin
INSERT: admin client only
```

---

## 10. Deterministic Validation Rule Set

All rules below are implementable from existing DB schema, metadata definitions, and document record data. No AI required.

### 10.1 Phase 13 Rule Registry

| Rule Code | Trigger | Severity | Source |
|---|---|---|---|
| `required_field_missing` | `is_required=true` metadata field has no value after save | error | `dms_document_metadata_values` + definitions |
| `expiry_before_issue_date` | `expiry_date` < `issue_date` on `dms_documents` or in AI extraction | error | Document record |
| `expiry_date_in_past` | `expiry_date` < today AND `status != archived` | warning | Document record |
| `issue_date_in_future` | `issue_date` > today | warning | Document record |
| `emirates_id_format` | `emirates_id_number` not matching pattern `^784-\d{4}-\d{7}-\d{1}$` | error | Metadata value |
| `uae_trn_format` | `trn` not matching `^\d{15}$` | error | Metadata value |
| `passport_number_format` | `passport_number` < 6 chars or > 20 chars | warning | Metadata value |
| `ai_classification_confidence_low` | `classification_score < 0.60` | warning | `dms_ai_extraction_results` |
| `ai_field_confidence_low` | Field in `field_confidence_json` < definition `ai_confidence_threshold` (default 0.60) | warning | Extraction result + definitions |
| `ai_value_conflicts_saved` | AI-extracted field value differs from current saved metadata value | warning | `buildMetadataDiff()` diff output |
| `classification_type_mismatch` | `suggested_document_type_id` differs from `document_type_id` | warning | `dms_ai_extraction_results` vs `dms_documents` |
| `ocr_text_missing` | Document has AI status `completed` but `ocr_text_available = false` | warning | `dms_documents` |
| `semantic_index_missing` | Document has `ocr_text_available = true` but no semantic chunks | info | `dms_semantic_chunks` join |
| `owner_company_missing` | `owning_company_id IS NULL` on saved document | info | `dms_documents` |
| `party_missing_for_party_document` | Party-type document (PASSPORT_COPY, EMIRATES_ID, VISA, LABOUR_CARD) has `party_id IS NULL` | warning | Document type + `party_id` |
| `duplicate_document_detected` | `dms_upload_sessions.is_duplicate = true` or same identifier found on another active document | error | Upload session + identifier search |
| `insurance_policy_number_missing` | INSURANCE_CERTIFICATE or MEDICAL_INSURANCE without `policy_number` metadata | error | Document type + metadata |
| `document_no_missing` | `document_no IS NULL` on saved document | info | `dms_documents` |

### 10.2 Rule Evaluation Input Sources

| Input | Source |
|---|---|
| Current metadata values | `dms_document_metadata_values` JOIN `dms_metadata_definitions` |
| AI extracted field values | `dms_ai_extraction_results.extracted_fields_json`, `field_confidence_json` |
| Field-level diff | `buildMetadataDiff(definitions, currentValues, extracted, fieldConfidence)` → already returns `conflict` / `low_confidence` / `changed` per field |
| Document record | `dms_documents` (dates, status, type, owner columns) |
| Classification result | `dms_ai_extraction_results.classification_score`, `suggested_document_type_id` |
| Upload session | `dms_upload_sessions.is_duplicate`, `sha256_hash`, `duplicate_document_id` |

---

## 11. AI-Assisted Validation Rule Set

AI-assisted validation is **optional, feature-flag-gated, and non-blocking**.

**Feature flag:** `DMS_AI_VALIDATION_ASSISTED` — default `false`

### 11.1 Phase 13 AI-Assisted Rules (Conservative Set)

| Rule Code | Description | AI Method |
|---|---|---|
| `ai_company_name_mismatch` | Extracted company name doesn't resemble any known owner_company or party | Fuzzy name compare + AI confirmation prompt |
| `ai_document_type_looks_wrong` | AI classification contradicts extracted content signals | Low-overhead classification re-check |
| `ai_extracted_name_no_match` | Passport/Emirates ID name not found among employees or parties | Name comparison |

**Strict constraints for all AI-assisted rules:**
- Feature flag `DMS_AI_VALIDATION_ASSISTED = false` by default
- Finding `ai_generated = true`
- AI prompt and raw response are **never stored** — only the finding summary
- JSON validation on AI output before using
- Finding created, not auto-applied
- Max 3 AI calls per document per validation run
- Blocked from running on `confidential_level = executive` or `hr` documents by default

---

## 12. Entity and Owner Matching Strategy

### 12.1 Supported Target Entity Types (Phase 13)

| Entity Type | DB Table | Match Fields |
|---|---|---|
| `owner_company` | `owner_companies` | `company_code` (exact), `trade_license_no` (exact), `trn` (exact), `legal_name_en`/`legal_name_ar` (normalized/fuzzy) |
| `branch` | `branches` | `branch_code` (exact), `branch_name_en`/`branch_name_ar` (normalized) |
| `party` | `parties` | `party_code` (exact), `display_name`, `legal_name_en`, `trade_name_en` (normalized/fuzzy) |
| `employee` | `employees` | `employee_code` (exact), `full_name_en`/`full_name_ar` (normalized/fuzzy) |
| `work_site` | (deferred — table schema unknown) | Deferred to later phase if needed |

### 12.2 Match Signal Priority and Score

| Signal | Score | Method |
|---|---|---|
| Exact `company_code` / `employee_code` / `party_code` match | 1.00 | Exact code |
| Exact identifier (`trade_license_no`, `trn`, `emirates_id_number`, `passport_number`) | 0.95 | Exact DB field |
| Exact normalized name match (EN) | 0.90 | Lower, trim, remove punctuation |
| Exact normalized name match (AR) | 0.90 | Unicode normalize |
| `suggested_links[]` from AI with `entityId` present + high confidence | 0.85 | AI-provided with verification |
| Fuzzy name match (Levenshtein distance ≤ 2 on normalized) | 0.75 | Fuzzy |
| `detected_entities[]` from AI (name match to known entity names) | 0.65 | AI detected, name search |
| `suggested_links[]` from AI without entityId (name only) | 0.60 | AI candidate, unverified |
| Below 0.60 | Not queued | Discarded silently |

### 12.3 Matching Input Sources

| Source | Data |
|---|---|
| `dms_ai_extraction_results.suggested_links_json` | `[{ entityType, entityId?, entityName, confidence, reason }]` |
| `dms_ai_extraction_results.raw_response_json` (safe fields only) | `detected_entities[].name`, `detected_entities[].identifier` — field codes from AI, not OCR content |
| `dms_document_metadata_values` | `license_number`, `trn`, `passport_number`, `emirates_id_number`, `full_name` |
| `dms_documents.owning_company_id`, `party_id` | Context for verifying existing links |
| `dms_upload_sessions.uploaded_by` | Context entity (if entity_type/entity_id present on session) |

### 12.4 Match Resolution (Phase 13 Only)

Accepting a candidate in Phase 13:
- Updates `dms_ai_entity_match_candidates.status = 'accepted'`
- Updates `resolution_code = 'accepted_for_later_apply'`
- Creates audit log entry
- **Does NOT write** `dms_documents.owning_company_id` or any other ERP field

This is explicitly deferred to Phase 16 (Apply-to-ERP) unless Sameer approves earlier.

---

## 13. Conflict Detection Strategy

### 13.1 Conflict Sources

| Conflict Type | Left Side | Right Side | Detection |
|---|---|---|---|
| AI field vs saved metadata | `extracted_fields_json` | `dms_document_metadata_values` | `buildMetadataDiff()` → `conflict` state |
| AI classification vs current type | `suggested_document_type_id` | `dms_documents.document_type_id` | Direct comparison |
| AI owner suggestion vs current owner | `suggested_links[]` entityType owner_company | `dms_documents.owning_company_id` | Link ID comparison |
| AI party suggestion vs current party | `suggested_links[]` entityType party | `dms_documents.party_id` | Link ID comparison |
| Expiry vs issue date | `dms_documents.expiry_date` | `dms_documents.issue_date` | Date comparison |
| Duplicate file hash | `sha256_hash` | Other sessions' hash | `dms_upload_sessions.is_duplicate` |
| Duplicate identifier | `passport_number` / `emirates_id` metadata | Other documents' metadata | SQL cross-document query |

### 13.2 `metadata-diff.ts` Integration

The existing `buildMetadataDiff()` already returns per-field diff states. Phase 13 must **wrap** this output to create validation findings:

```typescript
// Pseudo-code — not implemented yet
const diffs = buildMetadataDiff(definitions, currentValues, extracted, fieldConfidence);
for (const diff of diffs) {
  if (diff.diffState === 'conflict') {
    await createValidationFinding({
      ruleCode: 'ai_value_conflicts_saved',
      fieldCode: diff.fieldCode,
      currentValueSummary: truncate(diff.currentValueRaw, 200),
      aiValueSummary: truncate(diff.aiValueConverted, 200),
      confidence: diff.confidence,
    });
  }
  if (diff.diffState === 'low_confidence') {
    await createValidationFinding({ ruleCode: 'ai_field_confidence_low', ... });
  }
}
```

---

## 14. Review Queue Integration Plan

### 14.1 Finding → Queue Item Creation Pattern

Every validation finding and every entity match candidate with score ≥ 0.60 must generate an idempotent queue item using the existing `upsertDmsReviewQueueItem`.

**Mapping:**

| Finding/Candidate | `review_type` | `source_type` | `source_id` | Priority |
|---|---|---|---|---|
| `required_field_missing` | `metadata_rule_violation_review` | `validation_finding` | finding ID | high |
| `expiry_before_issue_date` | `metadata_rule_violation_review` | `validation_finding` | finding ID | error → urgent |
| `ai_value_conflicts_saved` | `validation_conflict_review` | `validation_finding` | finding ID | normal |
| `classification_type_mismatch` | `document_consistency_review` | `validation_finding` | finding ID | normal |
| `duplicate_document_detected` | `duplicate_document_review` | `validation_finding` | finding ID | high |
| Entity match (owner_company/branch) | `owner_matching_review` | `entity_match_candidate` | candidate ID | normal |
| Entity match (party) | `party_matching_review` | `entity_match_candidate` | candidate ID | normal |
| Entity match (employee) | `employee_matching_review` | `entity_match_candidate` | candidate ID | normal |

**Priority escalation:** severity=error → priority=urgent; severity=warning → priority=high; severity=info → priority=normal.

### 14.2 Queue Idempotency Key Plan

```
validation_finding:{finding_id}
validation_doc:{document_id}:{rule_code}[:{field_code}]
match_candidate:{candidate_id}
match_doc:{document_id}:{target_entity_type}:{target_entity_id}:{match_method}
```

### 14.3 New FK Columns on `dms_review_queue`

```sql
ADD COLUMN IF NOT EXISTS validation_finding_id      BIGINT
  REFERENCES public.dms_ai_validation_findings(id) ON DELETE SET NULL;
ADD COLUMN IF NOT EXISTS entity_match_candidate_id  BIGINT
  REFERENCES public.dms_ai_entity_match_candidates(id) ON DELETE SET NULL;
```

These columns allow the drawer to load the finding or candidate details without a `source_type`/`source_id` text-based lookup.

---

## 15. Enhanced Review Queue Drawer Plan

The existing `dms-review-queue-item-drawer.tsx` must be extended with Phase 13 sections. All existing Phase 12 sections remain unchanged.

### 15.1 New Drawer Sections

**Section: Validation Finding Details** (shown when `validation_finding_id` is set)

| Field | Display |
|---|---|
| Rule Code | Badge (e.g. "Required Field Missing") |
| Severity | Color-coded badge (error=red, warning=amber, info=blue) |
| Field | `field_label_en` from definition |
| Current Saved Value | `current_value_summary` (truncated, read-only) |
| AI Suggested Value | `ai_value_summary` (truncated, read-only) |
| Rule Expectation | `expected_value_summary` |
| AI Confidence | Percentage bar |
| Reason | `reason_message` |

**Section: Entity Match Candidate Details** (shown when `entity_match_candidate_id` is set)

| Field | Display |
|---|---|
| Target Type | Label (Owner Company / Branch / Party / Employee) |
| Candidate Name | `target_display_name` |
| Match Score | Percentage progress bar |
| Match Method | Badge (Exact Code / Name Match / AI Suggested) |
| Match Reason | `match_reason` |
| AI Generated | Badge if `ai_generated = true` |

**Section: Conflict Comparison Table** (shown for `validation_conflict_review`)

| Column | Content |
|---|---|
| Field | `field_code` |
| Current Saved | `current_value_summary` |
| AI Extracted | `ai_value_summary` |
| Confidence | `confidence` % |
| Diff State | Badge |

### 15.2 Resolution Actions (Phase 13 — Safe Only)

| Action | Updates | Does NOT Write |
|---|---|---|
| "Accepted for Later Apply" (candidate) | `candidate.status = accepted`, `review_item.status = resolved` | Nothing in `dms_documents` |
| "Rejected Candidate" | `candidate.status = rejected`, `review_item.status = dismissed` | Nothing |
| "Mark False Positive" (finding) | `finding.status = false_positive`, `review_item.status = dismissed` | Nothing |
| "Reviewed — No Action" (finding) | `finding.status = reviewed`, `review_item.status = resolved` | Nothing |
| "Supersede" | `finding/candidate.status = superseded`, `review_item.status = superseded` | Nothing |

### 15.3 Forbidden Drawer Actions in Phase 13

The following buttons must **not** appear in Phase 13:
- "Apply Metadata" / "Save to Document"
- "Link Party" / "Set Owner" / "Link Employee"
- "Merge Documents"
- "Auto Fix"
- "Apply to ERP"

Resolution labels must say:
- "Accepted for Later Apply" — NOT "Applied" or "Linked"
- "Rejected" — NOT "Removed"
- "False Positive" — NOT "Dismissed as Invalid"

---

## 16. Server Action Plan

### 16.1 New Files

| File | Purpose |
|---|---|
| `src/lib/dms/validation/validation-engine.ts` | Core rule evaluation logic |
| `src/lib/dms/validation/validation-rules.ts` | Rule definitions and registry |
| `src/lib/dms/validation/validation-upsert.ts` | Idempotent finding creation (uses admin client) |
| `src/lib/dms/entity-matching/entity-matcher.ts` | Match candidate generation |
| `src/lib/dms/entity-matching/entity-match-upsert.ts` | Idempotent candidate creation |
| `src/lib/dms/entity-matching/match-signals.ts` | Score computation, signal types |
| `src/server/actions/dms/validation.ts` | Server actions for validation |
| `src/server/actions/dms/entity-matching.ts` | Server actions for entity matching |

### 16.2 `src/server/actions/dms/validation.ts` — Function Signatures

```typescript
// Run validation for one document (all enabled rules)
runDmsValidationForDocument(documentId: number, options?: {
  ruleScope?: string[];   // optional rule code filter
  dryRun?: boolean;
}): Promise<ActionResult<{ findingCount: number; findings: ValidationFindingSummary[] }>>

// Run validation for one intake session
runDmsValidationForIntakeSession(uploadSessionId: number, options?: {
  dryRun?: boolean;
}): Promise<ActionResult<ValidationRunSummary>>

// Bulk admin validation run
bulkRunDmsValidation(input: {
  documentIds?: number[];
  uploadSessionIds?: number[];
  dryRun?: boolean;
  maxDocuments?: number;  // cap at 20 for Phase 13
}): Promise<ActionResult<BulkValidationSummary>>

// Fetch findings
getDmsValidationFindings(filters?: ValidationFindingsFilter):
  Promise<ActionResult<{ findings: ValidationFinding[]; total: number }>>

getDmsValidationFinding(id: number): Promise<ActionResult<ValidationFinding>>

// Review actions
reviewDmsValidationFinding(id: number, decision: {
  resolutionCode: 'reviewed_no_action' | 'false_positive';
  resolutionNote?: string;
}): Promise<ActionResult>

dismissDmsValidationFinding(id: number, reason: string): Promise<ActionResult>

markDmsValidationFindingFalsePositive(id: number, reason: string): Promise<ActionResult>
```

### 16.3 `src/server/actions/dms/entity-matching.ts` — Function Signatures

```typescript
// Run matching for one document
runDmsEntityMatchingForDocument(documentId: number, options?: {
  entityTypes?: string[];    // filter: owner_company, party, employee, branch
  minScore?: number;         // default 0.60
  dryRun?: boolean;
}): Promise<ActionResult<EntityMatchRunSummary>>

// Run matching for intake session
runDmsEntityMatchingForIntakeSession(uploadSessionId: number, options?: {
  dryRun?: boolean;
}): Promise<ActionResult<EntityMatchRunSummary>>

// Bulk matching
bulkRunDmsEntityMatching(input: {
  documentIds?: number[];
  dryRun?: boolean;
  maxDocuments?: number;
}): Promise<ActionResult<BulkEntityMatchSummary>>

// Fetch candidates
getDmsEntityMatchCandidates(filters?: EntityMatchFilter):
  Promise<ActionResult<{ candidates: EntityMatchCandidate[]; total: number }>>

// Review actions
reviewDmsEntityMatchCandidate(id: number, decision: {
  resolutionCode: 'accepted_for_later_apply' | 'rejected' | 'false_match';
  resolutionNote?: string;
}): Promise<ActionResult>  // NOTE: does NOT write dms_documents owner fields
```

### 16.4 All Server Actions Must

- Be feature-flag gated (`DMS_AI_VALIDATION` or `DMS_AI_ENTITY_MATCHING`)
- Check permissions (`dms.validation.run` or `dms.entity_matching.run`)
- Use `createAdminClient()` for finding/candidate inserts
- Use `createClient()` for reads (RLS applies)
- Log audit via `logAudit()` with safe payload only
- Be non-fatal when triggered from workflow hooks
- Not store raw OCR text, AI prompts, or API keys

---

## 17. Feature Flags and Permissions Plan

### 17.1 New Feature Flags

| Feature Code | Default | Purpose |
|---|---|---|
| `DMS_AI_VALIDATION` | `false` | Gates all deterministic validation (rule evaluation, finding creation) |
| `DMS_AI_ENTITY_MATCHING` | `false` | Gates all entity/owner matching |
| `DMS_AI_VALIDATION_ASSISTED` | `false` | Gates AI-assisted validation rules (subset of DMS_AI_VALIDATION) |
| `DMS_AI_DUPLICATE_DOCUMENTS` | `false` | Gates duplicate document detection via validation engine |

**Note:** `DMS_DUPLICATE_DETECT` already exists (is_enabled=true) and relates to an existing duplicate system. The new `DMS_AI_DUPLICATE_DOCUMENTS` flag specifically gates the validation-engine route to deconflict. Existing system is untouched.

**Seed pattern:**
```sql
INSERT INTO public.erp_ai_feature_flags (feature_code, is_enabled, notes, created_at, updated_at)
VALUES
  ('DMS_AI_VALIDATION',           false, 'Phase 13 — Deterministic validation engine', NOW(), NOW()),
  ('DMS_AI_ENTITY_MATCHING',      false, 'Phase 13 — Entity/owner match candidates', NOW(), NOW()),
  ('DMS_AI_VALIDATION_ASSISTED',  false, 'Phase 13 — AI-assisted validation (requires DMS_AI_VALIDATION)', NOW(), NOW()),
  ('DMS_AI_DUPLICATE_DOCUMENTS',  false, 'Phase 13 — Duplicate document validation route', NOW(), NOW())
ON CONFLICT (feature_code) DO NOTHING;
```

### 17.2 New Permissions

| Permission Code | Module | Action | Description |
|---|---|---|---|
| `dms.validation.view` | DMS | view | View DMS validation findings |
| `dms.validation.run` | DMS | run | Run validation engine for documents |
| `dms.validation.review` | DMS | review | Accept/reject/false-positive validation findings |
| `dms.validation.admin` | DMS | admin | Bulk validation runs, supersede findings |
| `dms.entity_matching.view` | DMS | view | View entity match candidates |
| `dms.entity_matching.run` | DMS | run | Run entity matching for documents |
| `dms.entity_matching.review` | DMS | review | Accept/reject match candidates |
| `dms.entity_matching.admin` | DMS | admin | Bulk matching, supersede candidates |

**Role grants:**
- `system_admin`: all 8
- `group_admin`: view + run + review for both validation and entity_matching

---

## 18. Trigger and Rollout Strategy

### 18.1 Recommended Phase 13 Trigger Order

| Stage | Trigger | When |
|---|---|---|
| **1** | Admin manual run for single document | Phase 13 launch — all flags default false |
| **2** | Admin bulk backfill (up to 20 docs) | After manual testing verified |
| **3** | Non-fatal hook after AI intake reaches `review_pending` | After bulk verified; flags still false by default |
| **4** | Non-fatal hook after AI analysis `pending_review` | Same |
| **5** | Review Queue rebuild scope extension | Admin-triggered |

### 18.2 Non-Fatal Hook Pattern (same as Phase 12)

```typescript
// In ai-intake.ts (Phase 13 additive hook — non-breaking)
try {
  const validationEnabled = await isDmsAiValidationEnabled();
  if (validationEnabled && uploadSession.document_id) {
    await runDmsValidationForDocument(uploadSession.document_id, { dryRun: false });
  }
} catch (hookErr) {
  logger.warn({ error: hookErr }, '[Phase13] Non-fatal validation hook failed');
  // Never throws — intake is not blocked
}
```

### 18.3 Volume Protection

- Bulk validation capped at 20 documents per admin call in Phase 13
- Max 10 findings per document per validation run (configurable via options)
- Max 5 entity match candidates per document
- Feature flags default false — operator must explicitly enable

---

## 19. Migration Plan

### 19.1 Migration File

```
supabase/migrations/20260626100000_erp_dms_ai_phase13_validation_matching.sql
```

### 19.2 Migration Sections

**Section 1 — Extend `dms_review_queue.review_type` CHECK**
- DROP old constraint
- ADD new constraint with all 13 values (6 Phase 12 + 7 Phase 13)

**Section 2 — Add FK columns to `dms_review_queue`**
- `ADD COLUMN IF NOT EXISTS validation_finding_id`
- `ADD COLUMN IF NOT EXISTS entity_match_candidate_id`
- Index both columns

**Section 3 — Create `dms_ai_validation_findings`**
- Full DDL as specified in §8
- Idempotency index (partial unique)
- Performance indexes
- CHECK constraints
- ENABLE + FORCE ROW LEVEL SECURITY
- RLS policies (SELECT, UPDATE, INSERT)
- Comment on key columns

**Section 4 — Create `dms_ai_entity_match_candidates`**
- Full DDL as specified in §9
- Idempotency index (partial unique)
- Performance indexes
- CHECK constraints
- ENABLE + FORCE ROW LEVEL SECURITY
- RLS policies
- Comment on key columns

**Section 5 — Seed feature flags**
- 4 new flags, default false
- `ON CONFLICT (feature_code) DO NOTHING`

**Section 6 — Seed permissions**
- 8 new permissions
- `ON CONFLICT (permission_code) DO UPDATE ...`
- Grant to `system_admin` (all 8)
- Grant to `group_admin` (view + run + review for both)

**Section 7 — Comments**
- Column comments for `dms_ai_validation_findings.evidence_json` (NEVER store raw content)
- Column comments for `dms_ai_entity_match_candidates.source_text_summary` (max 200 chars)

### 19.3 Migration Safety Rules

- BIGINT only for all PKs/FKs — no UUID
- No text raw content fields — no `ocr_text`, `content_text`, `raw_response`
- All new tables: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
- No `USING (true)` policies
- All policies tied to explicit permission checks
- Idempotent throughout (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`)

---

## 20. RLS and Confidentiality Plan

### 20.1 `dms_ai_validation_findings` RLS Policies

```sql
-- SELECT: view permission or admin
CREATE POLICY dms_ai_validation_findings_select ON public.dms_ai_validation_findings
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      current_user_has_permission('dms.validation.view')
      OR current_user_has_permission('dms.validation.review')
      OR current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
    )
  );

-- UPDATE: review permission
CREATE POLICY dms_ai_validation_findings_update ON public.dms_ai_validation_findings
  FOR UPDATE TO authenticated
  USING (
    current_user_has_permission('dms.validation.review')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  )
  WITH CHECK (
    current_user_has_permission('dms.validation.review')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

-- INSERT: admin client only (bypasses RLS via createAdminClient)
CREATE POLICY dms_ai_validation_findings_insert ON public.dms_ai_validation_findings
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_has_permission('dms.validation.admin')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );
```

### 20.2 `dms_ai_entity_match_candidates` RLS Policies

Same pattern, substituting `dms.entity_matching.*` permissions.

### 20.3 Confidentiality Rules

- Findings for documents with `confidentiality_level IN ('hr', 'legal', 'executive')` must be excluded from SELECT for non-admin users — add `AND (NOT is_confidential OR is_admin_user)` in server-side filter (mirror Phase 12 pattern in `getDmsReviewQueueItems`)
- `evidence_json` must never contain raw OCR text, chunk content, AI prompts, or API keys
- `source_text_summary` and `match_reason` capped at 200–300 chars (application enforced)

---

## 21. Audit and Notification Plan

### 21.1 Audit Events

| Action | `action` value | `new_values` (safe only) |
|---|---|---|
| Validation run | `dms_validation_run` | `{ document_id, finding_count, rule_codes[] }` |
| Finding reviewed | `dms_validation_finding_reviewed` | `{ finding_id, resolution_code }` |
| Finding false positive | `dms_validation_finding_false_positive` | `{ finding_id, reason_summary }` |
| Entity matching run | `dms_entity_matching_run` | `{ document_id, candidate_count, entity_types[] }` |
| Candidate accepted | `dms_entity_match_candidate_accepted` | `{ candidate_id, target_entity_type, target_entity_id }` |
| Candidate rejected | `dms_entity_match_candidate_rejected` | `{ candidate_id, target_entity_type }` |

**Forbidden in audit `new_values`:** ocr_text, raw_response, content, prompt, api_key, secret, password, token, chunk_text.

### 21.2 Notifications

- High-severity findings (error) → in-app notification to users with `dms.validation.review` permission
- `channel_in_app = true`, `channel_email = false`
- Notification type: `dms_validation_finding_created`
- Never expose raw content in notification body

---

## 22. Performance and Index Plan

### 22.1 `dms_ai_validation_findings` Indexes

| Index | Type | Columns |
|---|---|---|
| `idx_dms_ai_validation_findings_finding_key` | Partial unique | `finding_key` WHERE active status |
| `idx_dms_ai_validation_findings_document_id` | Standard | `document_id` |
| `idx_dms_ai_validation_findings_ai_result_id` | Partial | `ai_result_id` WHERE NOT NULL |
| `idx_dms_ai_validation_findings_rule_code` | Standard | `rule_code` |
| `idx_dms_ai_validation_findings_status` | Standard | `(status, severity, created_at)` |
| `idx_dms_ai_validation_findings_active` | Partial | `(status, document_id)` WHERE open AND not deleted |

### 22.2 `dms_ai_entity_match_candidates` Indexes

| Index | Type | Columns |
|---|---|---|
| `idx_dms_ai_entity_match_candidates_key` | Partial unique | `candidate_key` WHERE active status |
| `idx_dms_ai_entity_match_candidates_document` | Standard | `document_id` |
| `idx_dms_ai_entity_match_candidates_target` | Standard | `(target_entity_type, target_entity_id)` |
| `idx_dms_ai_entity_match_candidates_status` | Standard | `(status, created_at)` |
| `idx_dms_ai_entity_match_candidates_active` | Partial | `(document_id, target_entity_type, status)` WHERE pending AND not deleted |

### 22.3 `dms_review_queue` New FK Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_dms_review_queue_validation_finding_id
  ON public.dms_review_queue (validation_finding_id)
  WHERE validation_finding_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_review_queue_entity_match_candidate_id
  ON public.dms_review_queue (entity_match_candidate_id)
  WHERE entity_match_candidate_id IS NOT NULL;
```

---

## 23. Recommended Phase 13 Implementation Scope

### 23.1 Must-Have (Core)

| Item | Rationale |
|---|---|
| Migration: extend review_type CHECK, new FK columns, two new tables, flags, permissions | Foundation |
| `src/lib/dms/validation/validation-rules.ts` — rule registry | Needed before engine |
| `src/lib/dms/validation/validation-engine.ts` — deterministic rules only | MVP |
| `src/lib/dms/validation/validation-upsert.ts` — idempotent finding insert | Core |
| `src/server/actions/dms/validation.ts` — run + review + get actions | Required for UI |
| `src/lib/dms/entity-matching/entity-matcher.ts` — identifier + name matching | MVP |
| `src/lib/dms/entity-matching/entity-match-upsert.ts` — idempotent candidate insert | Core |
| `src/server/actions/dms/entity-matching.ts` — run + review + get actions | Required |
| Enhanced review queue drawer (finding + candidate detail sections) | Required for human review |
| Admin UI: "Run Validation" and "Run Entity Matching" button on document record | Required for manual trigger |

### 23.2 Should-Have (Phase 13 Extension)

| Item | Rationale |
|---|---|
| Bulk validation + matching admin panel | Improves admin workflow |
| Review queue rebuild scope extension for validation + matching | Admin backfill |
| Non-fatal generation hooks in ai-intake and ai-analysis | Automated generation (flags default false) |
| Dashboard card for validation findings count | Operator awareness |

### 23.3 Must-Defer (Phase 16 or Later)

| Item | Reason |
|---|---|
| Apply-to-ERP (write `owning_company_id`, `party_id` from accepted candidate) | Phase 16 |
| Auto-link owner on high-confidence match | Phase 16 |
| AI-assisted validation rules (`DMS_AI_VALIDATION_ASSISTED`) | Defer until deterministic rules are stable |
| SLA-based auto-escalation of stale findings | Phase 15 |
| Token cost tracking for validation AI calls | Phase 14 |

---

## 24. Implementation Sequence for Future Phase 13 Execution

```
Step 1 — Apply migration (new tables, CHECK constraint extension, FK columns, flags, permissions)
Step 2 — Create src/lib/dms/validation/validation-rules.ts (rule registry, rule types)
Step 3 — Create src/lib/dms/validation/validation-engine.ts (deterministic rules)
Step 4 — Create src/lib/dms/validation/validation-upsert.ts (finding creation)
Step 5 — Create src/server/actions/dms/validation.ts (server actions)
Step 6 — Create src/lib/dms/entity-matching/match-signals.ts (score logic)
Step 7 — Create src/lib/dms/entity-matching/entity-matcher.ts (matching logic)
Step 8 — Create src/lib/dms/entity-matching/entity-match-upsert.ts (candidate creation)
Step 9 — Create src/server/actions/dms/entity-matching.ts (server actions)
Step 10 — Extend dms-review-queue-item-drawer.tsx with finding/candidate sections
Step 11 — Add "Run Validation" + "Run Entity Matching" trigger to document record AI tab
Step 12 — TypeScript check (npx tsc --noEmit)
Step 13 — ReadLints on all changed files
Step 14 — Schema verification via Supabase MCP
Step 15 — UAT (admin triggers, finding creation, idempotency, drawer, accept/reject/FP)
Step 16 — Create implementation report and update source-of-truth files
```

---

## 25. Acceptance Criteria for Future Implementation

| AC | Criterion |
|---|---|
| AC-01 | `dms_ai_validation_findings` created with BIGINT PK, safe JSON only, no raw text columns |
| AC-02 | `dms_ai_entity_match_candidates` created with BIGINT PK, safe JSON only |
| AC-03 | RLS enabled and forced on both new tables |
| AC-04 | No `USING (true)` policies anywhere |
| AC-05 | No anon access to new tables |
| AC-06 | 4 new feature flags seeded, default false |
| AC-07 | 8 new permissions seeded and granted to system_admin |
| AC-08 | 7 new review_type values added to CHECK constraint |
| AC-09 | `validation_finding_id` and `entity_match_candidate_id` FK columns added to `dms_review_queue` |
| AC-10 | `runDmsValidationForDocument(51)` creates at least one finding without error |
| AC-11 | Second call with same document does not create duplicate finding (idempotency) |
| AC-12 | Finding creates idempotent review queue item |
| AC-13 | `runDmsEntityMatchingForDocument(51)` creates candidate without linking entity |
| AC-14 | Candidate creates idempotent review queue item |
| AC-15 | Review queue drawer shows finding and candidate details safely |
| AC-16 | `reviewDmsEntityMatchCandidate(id, 'accepted_for_later_apply')` does NOT write `dms_documents` |
| AC-17 | `markDmsValidationFindingFalsePositive(id)` only updates finding status |
| AC-18 | Audit logs contain no OCR text, raw response, prompt, or API key |
| AC-19 | Confidential document findings hidden from non-admin users |
| AC-20 | `npx tsc --noEmit` passes with 0 errors |
| AC-21 | All new files pass ReadLints |

---

## 26. Full UAT / Test Plan

### 26.1 Schema / DB Verification

- [ ] New tables exist with all required columns
- [ ] Partial unique indexes on `finding_key` and `candidate_key`
- [ ] CHECK constraints on `finding_type`, `severity`, `status` (validation), `target_entity_type`, `status` (candidates)
- [ ] RLS enabled + FORCE on both new tables
- [ ] No broad `USING (true)` policies
- [ ] All 4 new feature flags present (is_enabled=false)
- [ ] All 8 new permissions present and granted to system_admin
- [ ] `dms_review_queue` has 13 review_type values in CHECK constraint
- [ ] `validation_finding_id` and `entity_match_candidate_id` FK columns on `dms_review_queue`

### 26.2 Feature Flag Gate Verification

- [ ] With `DMS_AI_VALIDATION=false`: `runDmsValidationForDocument` returns controlled error "not enabled"
- [ ] With `DMS_AI_ENTITY_MATCHING=false`: `runDmsEntityMatchingForDocument` returns controlled error
- [ ] Re-enable flags → actions work

### 26.3 Validation Engine UAT

- [ ] Run validation for document 51 → at least one finding created (expect `required_field_missing` or similar)
- [ ] Run again → same findings, NOT duplicated (idempotency key blocks)
- [ ] Query: `SELECT count(*) FROM dms_ai_validation_findings WHERE document_id = 51` consistent
- [ ] Each finding → review queue item created with matching review_type
- [ ] Duplicate idempotency: `SELECT finding_key, count(*) FROM dms_ai_validation_findings GROUP BY finding_key HAVING count(*) > 1` = 0 rows

### 26.4 Entity Matching UAT

- [ ] Run entity matching for document 51 → at least one candidate created (if extracted name matches owner_company/party)
- [ ] Candidate score ≥ 0.60
- [ ] Second run → no duplicate candidate
- [ ] Candidate → review queue item with `owner_matching_review` or `party_matching_review`
- [ ] `dms_documents.owning_company_id` unchanged after candidate creation

### 26.5 Review Queue Drawer UAT

- [ ] Queue item with `validation_finding_id` opens drawer with Finding Details section
- [ ] Queue item with `entity_match_candidate_id` opens drawer with Candidate Match section
- [ ] `validation_conflict_review` item shows Conflict Comparison table
- [ ] No raw OCR text visible in drawer
- [ ] "Accepted for Later Apply" button visible (not "Apply" or "Link")
- [ ] Clicking "Accepted for Later Apply" on a candidate → `candidate.status = accepted`, no DB write to `dms_documents`
- [ ] "Mark False Positive" on finding → `finding.status = false_positive`, no metadata write

### 26.6 Audit and Notification UAT

- [ ] Audit log for `dms_validation_run` contains only safe metadata
- [ ] Audit log for `dms_entity_match_candidate_accepted` contains only `{ candidate_id, target_entity_type, target_entity_id }`
- [ ] No `ocr_text`, `raw_response`, `content_text` in any audit `new_values`
- [ ] Notification created for high/error severity finding if implemented
- [ ] Notification `channel_email = false`

### 26.7 RLS Confidentiality UAT

- [ ] anon query on `dms_ai_validation_findings` → 0 rows
- [ ] anon query on `dms_ai_entity_match_candidates` → 0 rows
- [ ] Policy text: SELECT uses `auth.uid() IS NOT NULL AND permission_check` (no USING true)

### 26.8 Regression Checks

- [ ] `/dms/review-queue` still loads
- [ ] `/dms/documents` still loads
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] ReadLints on all new/changed files → 0 errors
- [ ] Existing Phase 12 hooks (ai-intake, ai-analysis, ocr, job-runner) unmodified behavior

---

## 27. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Validation generates many findings rapidly (volume flood) | High | Feature flags default false; bulk capped at 20 docs; max 10 findings per doc |
| `detected_entities` quality depends on AI prompt accuracy | Medium | Use only as candidate hint (score 0.60–0.65); require human confirmation |
| `metadata-diff.ts` `buildMetadataDiff()` may be slow for large definitions | Medium | Validate on a single result, not all historical results |
| CHECK constraint recreation may conflict if migration re-run | Low | Use idempotent DO $$ IF NOT EXISTS $$ pattern for drop+recreate check |
| `DMS_DUPLICATE_DETECT` conflict with `DMS_AI_DUPLICATE_DOCUMENTS` | Low | Use separate flag; Phase 13 validation route is additive |
| AI-assisted validation rules produce false positives | Medium | Default false; require `DMS_AI_VALIDATION_ASSISTED=true` explicit enable |
| Candidates accepted but Phase 16 not implemented | Low | Document clearly — "Accepted for Later Apply" is a soft marker only; no ERP side effect |
| `owner_companies` has no `deleted_at` — stale companies may match | Low | Filter by `status = 'active'` in matching query |

---

## 28. What Must Not Be Implemented in Phase 13

The following are **strictly forbidden** in Phase 13 implementation:

```
Apply-to-ERP writes of any kind
Writing to dms_documents.owning_company_id / owning_branch_id / party_id
Auto-saving metadata values from AI suggestions
Auto-linking owner company, branch, party, or employee
Auto-creating parties based on detected entities
Auto-merging duplicate documents
Auto-approving intake sessions
AI auto-resolving review queue items
Changing existing OCR routing or pipeline
Changing Phase 12 review queue base workflow
Changing or removing Phase 12 review types
Deleting documents or files
Broad RLS USING (true) policies
Token / cost / observability dashboard
SLA enforcement automation or cron jobs
Phase 14 / 15 / 16 scope items
```

---

## 29. Corrected Roadmap After Phase 13

| Phase | Feature | Status After Phase 13 |
|---|---|---|
| 9 | Async AI Job Queue / Workflow Runner | CLOSED |
| 10A | OCR Pipeline Upgrade / Azure OCR Wiring | CLOSED |
| 10B | Queue-backed Admin OCR Backfill | CLOSED |
| 11 | Semantic Chunking and Embeddings | CLOSED |
| 12 | Review Queue Activation | CLOSED / LIVE PASS |
| **13** | **Validation, Conflict Detection, Owner Matching** | **NEXT → CLOSED** |
| 14 | Token / Cost / Observability | FUTURE |
| 15 | Testing, Performance, Hardening | FUTURE |
| 16 | Human-Reviewed Apply-to-ERP Records | FUTURE / HIGH-RISK |

---

## 30. Recommended Next Cursor Implementation Prompt

After ChatGPT reviews and approves this plan, the implementation prompt for Cursor should:

1. Reference this plan file explicitly
2. Execute all 16 steps from §24 in sequence
3. Enforce all non-implementation rules from §28
4. Include the UAT test checklist from §26
5. Require the implementation report in `implementation_Review/ERP_DMS_AI_PHASE_13_VALIDATION_CONFLICT_OWNER_MATCHING_IMPLEMENTATION_REPORT.md`
6. Reference the acceptance criteria from §25 for the final decision gate
7. Set final decision to `LIVE PASS / CLOSED` only when all AC-01 through AC-21 pass

---

## 31. Final Recommendation

**Recommended scope for Phase 13 implementation:**

Phase 13 is a **medium-complexity phase**. The foundational infrastructure (`metadata-diff.ts`, `result-validator.ts`, Phase 12 review queue) is solid. The primary implementation work is:

1. Two new DB tables with proper RLS and idempotency
2. Two new library module directories (`validation/`, `entity-matching/`)
3. Two new server action files (`validation.ts`, `entity-matching.ts`)
4. Enhanced review queue drawer (additive — no existing UI broken)
5. One migration covering all DB changes

**Human review discipline** is maintained throughout: all Phase 13 actions create findings and candidates visible to human reviewers. No data is auto-applied. All "accept" actions are soft markers for Phase 16 Apply-to-ERP.

**Feature flags default false** — operators must explicitly enable `DMS_AI_VALIDATION` and `DMS_AI_ENTITY_MATCHING` after verifying implementation in their environment.

**Recommended Phase 13 verdict after ChatGPT review:** Proceed to implementation if plan is approved as-is.

# ERP DMS AI Phase 3 — Metadata-Aware Classification Plan

**Document type:** Planning only — no implementation in this phase  
**Date:** 2026-06-22  
**Author:** Cursor planning agent (codebase audit)  
**Prompt:** `ChatGPT/ERP_DMS_AI_PHASE_3_METADATA_AWARE_CLASSIFICATION_PLANNING_PROMPT.md`  
**Prerequisites:** Phase 1 closed, Phase 2 closed — `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md`, `implementation_Review/ERP_DMS_AI_PHASE_2_METADATA_DEFINITIONS_UPGRADE_IMPLEMENTATION_REPORT.md`

---

## 1. Executive Summary

Phase 3 will upgrade **Pass 1 document classification** so it uses Phase 2 metadata definition hints (field labels, Arabic labels, AI keywords, formats, negative keywords, validation hints) aggregated per document type — not only static type fingerprints and type master names.

**Current gap confirmed:** Intake Pass 1 sends `metadataFields: []` and type candidates as `type_code + name_en + description + static TYPE_CLASSIFICATION_FINGERPRINTS` (7 hardcoded types). Phase 2 enrichment applies only in Pass 2 extraction after type is resolved. Classification accuracy for similar UAE document types (Emirates ID vs passport vs visa, TRN vs VAT certificate, etc.) can improve materially without changing extraction output schema.

**Recommended approach:**

1. **Hybrid pre-ranking (Option C):** Deterministic score all active types → send top **12** metadata-aware candidate packets + **mandatory common UAE types** not already included (Emirates ID, passport, visa, trade license, medical insurance).
2. **No DB migration initially:** Store alternatives and evidence inside `raw_response_json.classification` (extend existing sanitized payload). Use existing scalar columns for primary type/confidence/reason.
3. **Keep two-pass intake flow:** Enhanced Pass 1 (classify + transcribe) → resolve type → Pass 2 (type-specific extraction). Add **optional Pass 2 skip** when classification confidence is very low and no type resolved.
4. **New server action:** `rerunMetadataExtractionForIntakeSession` when user changes document type in review — with explicit merge modes (`fill_missing_only` default).
5. **Prompt version bump:** `v3.3` — classification section enriched; `extracted_fields_json` / `field_confidence_json` unchanged.

**Estimated implementation scope (future execution):** ~3 new lib files, ~6 modified files, ~2 intake UI components, 0 migrations (preferred), prompt/validator/type updates. No async queue, no apply-to-metadata, no auto-save.

---

## 2. Planning Scope and Non-Implementation Rule

This document is **planning only**.

| Allowed in planning phase | Forbidden until approved implementation prompt |
|---------------------------|------------------------------------------------|
| Read/analyze codebase and DB schema (read-only) | Source code changes |
| Compare options and recommend architecture | Migrations |
| Define acceptance criteria and test plan | UI changes |
| Produce implementation sequence | Server action changes |
| Audit current classification flow | Prompt version bump in code |

Human-review-first rules remain unchanged: AI suggests type and fields; humans approve before final save.

---

## 3. Files and Source-of-Truth Reviewed

### Found and reviewed

| File | Relevance |
|------|-----------|
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | Post–Phase 2 workflow baseline (v3.2 prompts, shared loader) |
| `implementation_Review/ERP_DMS_AI_PHASE_1_STABILIZATION_IMPLEMENTATION_REPORT.md` | Phase 1 closure |
| `implementation_Review/ERP_DMS_AI_PHASE_2_METADATA_DEFINITIONS_UPGRADE_IMPLEMENTATION_REPORT.md` | Phase 2 closure, metadata columns |
| `ERP_DMS_AI_PHASE_2_METADATA_DEFINITIONS_UPGRADE_PLAN.md` | Phase 2 planning pattern reference |
| `ChatGPT/ERP_DMS_AI_PHASE_3_METADATA_AWARE_CLASSIFICATION_PLANNING_PROMPT.md` | This phase scope |
| `ChatGPT/AI_ENHANCMENT/ERP_DMS_AI_A_TO_Z_AUDIT_FUNCTION_MAP_AND_ENHANCEMENT_PLAN.md` | Roadmap context |
| `ChatGPT/AI_ENHANCMENT/ERP_DMS_AI_FULL_AUDIT_AND_ENHANCEMENT_PLAN.md` | Audit context |
| `ChatGPT/ALGT_ERP_CURSOR_PHASE_PROMPT_MASTER_STANDARD.md` | Master standard (V1) |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Global ERP tracker (referenced) |
| `src/server/actions/dms/ai-intake.ts` | Two-pass intake, type resolution, result storage |
| `src/server/actions/dms/ai-analysis.ts` | Single-pass analysis on existing documents |
| `src/lib/dms/ai/prompt-builders.ts` | Combined prompt, v3.2, candidate + field lists |
| `src/lib/dms/ai/classification-resolver.ts` | Aliases, heuristics, TYPE_CLASSIFICATION_FINGERPRINTS |
| `src/lib/dms/ai/result-validator.ts` | Parses classification + fields from AI JSON |
| `src/lib/dms/ai/openai-dms-adapter.ts` | Calls buildCombinedPrompt + validateAiOutput |
| `src/lib/dms/ai/types.ts` | DmsClassificationResult, DmsAiInput |
| `src/lib/dms/ai/load-metadata-fields.ts` | Context-aware metadata loader |
| `src/lib/dms/metadata/metadata-definition-shared.ts` | Phase 2 shared mapper/select |
| `src/features/dms/intake/dms-ai-intake-review-form.tsx` | Type selector, no re-extraction on change |
| `src/features/dms/intake/dms-ai-intake-metadata-section.tsx` | Reloads definitions on type change |
| `supabase/migrations/20260614192000_erp_dms_2_database_foundation_rls_numbering_storage_buckets.sql` | `dms_document_types`, `dms_ai_extraction_results` |
| `supabase/migrations/20260615020000_erp_dms_10_ai_classification_extraction_foundation.sql` | Extended result columns |
| `supabase/migrations/20260622102000_erp_dms_ai_phase2_metadata_definitions_upgrade.sql` | Phase 2 metadata columns |

### Missing (not invented)

| File | Status |
|------|--------|
| `ALGT_ERP_CURSOR_PHASE_PROMPT_MASTER_STANDARD_V2.md` | Not in repo (V1 exists) |
| `ERP_DMS_AI_A_TO_Z_AUDIT_FUNCTION_MAP_AND_ENHANCEMENT_PLAN.md` | At `ChatGPT/AI_ENHANCMENT/` not repo root |
| `erp-ai-human-review-first-standard.mdc` | Not found as standalone `.mdc` (rules embedded in workspace standards) |

---

## 4. Phase 1 and Phase 2 Output Reviewed

**Phase 1 delivered:**
- Unified metadata loader in intake + analysis
- Intake review RLS backfill
- `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md`

**Phase 2 delivered:**
- Upgraded `dms_metadata_definitions` (Hybrid Option D columns)
- Canonical `field_label_en` / `field_label_ar`
- Shared `metadata-definition-shared.ts`
- Prompt v3.2 with enriched **extraction** field list
- Intake grouping/warnings by `field_group` and review flags
- DMS.14 RLS parity migrations in repo

**Phase 3 builds on Phase 2 by feeding aggregated metadata hints into **classification**, not only extraction.**

---

## 5. Current Classification Architecture

```
Upload session / document
        │
        ▼
ai-intake.ts / ai-analysis.ts
        │
        ├── Load active dms_document_types (intake: limit 50, analysis: limit 30)
        │
        ├── INTAKE Pass 1 ─────────────────────────────────────────────
        │     provider.analyze({
        │       typeCandidates: [{ typeCode, nameEn, description }],
        │       metadataFields: [],          ← EMPTY — no Phase 2 hints in Pass 1
        │       currentTypeCode: null
        │     })
        │     prompt-builders: candidateList + TYPE_CLASSIFICATION_FINGERPRINTS (7 types)
        │     + static SYSTEM_PROMPT classification rules
        │
        ├── resolveSuggestedDocumentType()  ← post-AI alias + heuristic override
        │
        ├── INTAKE Pass 2 (if type resolved) ───────────────────────────
        │     loadMetadataFieldsForDocumentType(typeId, "intake")
        │     provider.analyze({ metadataFields: enriched Phase 2 fields, ... })
        │     Merge extraction; keep Pass 1 classification + transcription
        │
        ├── Build extracted_fields_json / field_confidence_json (field_code keyed)
        │
        └── Store dms_ai_extraction_results
              suggested_document_type_id, classification_score/confidence/reason
              raw_response_json (sanitized subset)
```

**AI Analysis (existing document):** Single `analyze()` call with `metadataFields` loaded for **current** `document_type_id` (if set) — classification and extraction in one prompt. Does **not** use two-pass or empty-metadata Pass 1 pattern.

**Provider chain:** `getDmsAiProvider()` → `OpenAiDmsAdapter.analyze()` → `buildCombinedPrompt()` → OpenAI → `validateAiOutput()`.

---

## 6. Current Document Type Schema Audit

**Table:** `dms_document_types` (verified from foundation migration + Arabic enhancement migration)

| Column | Type | Used in classification today |
|--------|------|------------------------------|
| `id` | BIGINT PK | Resolved to `suggested_document_type_id` |
| `type_code` | TEXT UNIQUE | AI output `suggested_type_code`; prompt candidate list |
| `name_en` | TEXT NOT NULL | Prompt candidate label |
| `name_ar` | TEXT | **Not sent to AI** in current prompt |
| `description` | TEXT | Truncated to 80 chars in prompt |
| `category_id` | BIGINT FK | Loaded but `categoryName` always `null` in candidates |
| `requires_expiry_tracking` | BOOLEAN | Not in prompt |
| `default_confidentiality` | TEXT | Not in prompt |
| `ai_extraction_schema` | JSONB | **Not used** in runtime classification/extraction path (legacy/schema doc) |
| `is_active` | BOOLEAN | Filter for candidates |
| `deleted_at` | TIMESTAMPTZ | Soft-delete filter |

**No DB columns for:** type aliases, classification hints, fingerprint overrides (aliases live in code: `TYPE_CODE_ALIASES`, `TYPE_CLASSIFICATION_FINGERPRINTS`).

**Admin:** `src/server/actions/dms/document-types.ts` exposes `ai_extraction_schema` in types but runtime AI path uses `dms_metadata_definitions` via shared loader.

---

## 7. Current Metadata Definition Usage in Classification

| Question | Current answer |
|----------|----------------|
| Metadata loaded before classification (intake)? | **No** — Pass 1 uses `metadataFields: []` |
| Field labels in classification prompt? | **No** (Pass 1) |
| `ai_keywords` in classification? | **No** (Pass 1) |
| `ai_possible_labels_*` in classification? | **No** (Pass 1) |
| `ai_expected_format` in classification? | **No** (Pass 1) |
| Validation hints in classification? | **No** (Pass 1) |
| Classification document-type only? | **Yes** — type master + static fingerprints + system rules |
| Pass 1 ignores field-level metadata? | **Yes** — Phase 2 fields used only in Pass 2 |

**Pass 2 and ai-analysis** use full Phase 2 field list via `loadMetadataFieldsForDocumentType()`.

---

## 8. Current AI Prompt and Output Schema Audit

**Prompt version:** `v3.2` (`src/lib/dms/ai/prompt-builders.ts`)

**Pass 1 candidate list format (today):**
```
- EMIRATES_ID: Emirates ID (description…) | fingerprint: 784-YYYY-…
```
- Max **30** candidates in prompt slice (intake loads 50 but prompt slices to 30)
- Fingerprints only for 10 hardcoded `type_code` keys

**Pass 1 output schema (via result-validator):**
```json
{
  "classification": {
    "suggested_type_code": "EMIRATES_ID",
    "confidence_score": 0.94,
    "confidence_label": "high",
    "reason": "..."
  }
}
```

**Stored columns (`dms_ai_extraction_results`):**
- `suggested_document_type_id`, `classification_confidence` (label), `classification_score`, `classification_reason`
- `extracted_fields_json`, `field_confidence_json` — field_code keyed
- `raw_response_json` — sanitized: `{ classification, suggested_title, suggested_description, field_count, warnings }`
- **No** alternatives column; **no** classification_evidence column

**Confidence thresholds (code):** `confidenceLabelFromScore`: ≥0.85 high, ≥0.65 medium, ≥0.40 low, else needs_manual_review.

**Post-AI resolution:** `resolveSuggestedDocumentType()` may override AI using Emirates ID regex, text signal scoring, alias map — independent of metadata definitions.

---

## 9. Problems and Gaps Confirmed

| # | Gap | Impact |
|---|-----|--------|
| G1 | Pass 1 ignores Phase 2 metadata hints | Similar types misclassified; keywords/formats not used until after type chosen |
| G2 | Static fingerprints cover ~10 types only | Other active types have name/description only |
| G3 | All active types (up to 30 in prompt) sent without ranking | Token bloat; weak types dilute attention |
| G4 | `name_ar`, category not in candidate packet | Arabic-only documents weaker classification |
| G5 | No alternative types stored/displayed | Reviewer cannot see runner-up suggestions |
| G6 | Type change in review reloads field definitions but **does not re-run extraction** | Wrong metadata values persist until manual edit |
| G7 | ai-analysis single-pass uses current type's metadata in same prompt | Re-classification of mis-typed documents biased toward current type |
| G8 | `ai_extraction_schema` on document type unused | Duplication risk if both schema and metadata definitions maintained |
| G9 | No classification-specific audit events | Harder to trace type corrections and re-runs |

---

## 10. Target Metadata-Aware Classification Architecture

```
OCR / vision transcription + filename
        │
        ▼
classification-score.ts (deterministic pre-rank)
        │  signals: filename, OCR keywords, metadata rollup, fingerprints, negative keywords
        ▼
classification-candidate-builder.ts
        │  top N + mandatory common types → compact metadata packet per type
        ▼
Pass 1 AI call (prompt v3.3)
        │  enriched candidate packets (NOT full field-by-field extraction list)
        │  metadataFields: [] or minimal (classify-only mode)
        ▼
validateAiOutput + extended classification parser
        │  primary type + alternatives + evidence + needs_human_review
        ▼
resolveSuggestedDocumentType (retain heuristics as safety net)
        │
        ├── confidence OK → Pass 2 extraction (unchanged field_code output)
        └── low confidence / no type → review UI flags; Pass 2 optional
        │
        ▼
User review ── type change ──► rerunMetadataExtractionForIntakeSession (Pass 2 only)
```

**Target classifier output (logical model — not all new DB columns):**

| Field | Storage (recommended) |
|-------|----------------------|
| `primary_document_type_id` | Existing `suggested_document_type_id` |
| `primary_document_type_code` | Existing resolution + raw JSON |
| `primary_document_type_confidence` | Existing `classification_score` |
| `classification_reason` | Existing `classification_reason` |
| `alternative_document_types_json` | **New:** inside `raw_response_json.classification` |
| `classification_evidence_json` | **New:** inside `raw_response_json.classification` |
| `needs_human_review` | Derived from score + flags; store in raw JSON |
| `review_reason` | raw JSON + optional UI badge |

---

## 11. Candidate Type Metadata Packet Design

**Proposed TypeScript shape** (`DmsClassificationCandidatePacket`):

```typescript
{
  document_type_id: number;
  type_code: string;
  name_en: string;
  name_ar: string | null;
  category_code: string | null;      // from join dms_document_categories
  description: string | null;        // max 120 chars
  aliases: string[];                 // from TYPE_CODE_ALIASES reverse lookup + type_code variants, max 5
  fingerprint: string | null;        // TYPE_CLASSIFICATION_FINGERPRINTS[type_code], max 200 chars
  expected_keywords: string[];       // rollup: ai_keywords + ai_possible_labels_en, max 12 unique
  expected_keywords_ar: string[];    // rollup: ai_keywords_ar labels, max 8
  expected_field_labels_en: string[];// top 8 by sort_order, ai_extractable fields
  expected_field_labels_ar: string[];// top 6 Arabic labels
  expected_formats: string[];        // distinct ai_expected_format, max 4
  negative_keywords: string[];       // rollup ai_negative_keywords, max 6
  metadata_field_count: number;
  required_field_count: number;
  pre_rank_score: number;            // deterministic score 0–1 (for ordering, not shown to user)
}
```

**Include in packet:**
- Aggregated signals from `dms_metadata_definitions` where `is_active`, `deleted_at IS NULL`, `is_ai_extractable !== false`
- Type master: `name_en`, `name_ar`, `description`, category name
- Code-level aliases and fingerprints (until type-level alias column exists)

**Exclude from packet (prevent bloat):**
- Full `options_json`, `validation_json`, `ai_rules_json` per field
- Non-AI fields (`is_ai_extractable = false`) except labels for disambiguation
- Raw OCR text, document content
- ERP mapping fields (none exist)

**Truncation rules:**
- Total prompt budget for candidate section: ~**4,000 characters** (~800 tokens)
- Max **12** ranked candidates + up to **5** mandatory common types (deduped)
- Each packet rendered as compact JSON line or structured bullet block (implementation choice)

---

## 12. Pre-Classification Candidate Ranking Options

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A** | Send all active types with full metadata packet | Complete coverage | Token explosion; latency; cost; attention dilution |
| **B** | Pre-rank top N only | Controlled tokens; faster | Rare types may never reach AI |
| **C (recommended)** | Hybrid: top **12** by score + mandatory UAE common types | Balance accuracy/cost | Slightly more complex builder |

**Deterministic scoring signals** (`classification-score.ts`):

| Signal | Weight (initial) | Source |
|--------|------------------|--------|
| Filename token match vs `type_code` / aliases | +0.25 | `originalFilename` |
| OCR text vs rollup `ai_keywords` | +0.20 per hit (cap) | Pass 1 transcription or pre-OCR text |
| OCR vs `expected_formats` regex | +0.30 | e.g. Emirates ID pattern |
| Arabic keyword match | +0.15 | `expected_keywords_ar` |
| Negative keyword penalty | −0.25 per hit | Rollup `ai_negative_keywords` |
| `TYPE_CLASSIFICATION_FINGERPRINTS` signal overlap | +0.20 | classification-resolver patterns |
| `inferTypeCodeFromText` match | +0.35 boost | Existing heuristic |
| Category filename hint (e.g. "HR", "VAT") | +0.10 | Optional |

**Mandatory common types (always include if active):**  
`EMIRATES_ID`, `PASSPORT_COPY`, `VISA`, `TRADE_LICENSE`, `MEDICAL_INSURANCE`, `TRN_CERTIFICATE`, `VAT_CERTIFICATE`, `LABOUR_CARD`

---

## 13. Recommended Classification Strategy

**Adopt Hybrid Option C** with enhanced Pass 1 only:

1. Before Pass 1, load **all active types** (id, code, names, category) — same as today.
2. Load **aggregated metadata rollups** per type in one query (grouped by `document_type_id`) — new builder; reuse `DMS_METADATA_DEFINITION_SELECT` fields.
3. Run deterministic pre-rank → select candidate set (12 + mandatory).
4. Build compact packets → new prompt section `CLASSIFICATION CANDIDATES (metadata-aware)`.
5. Pass 1 AI: transcribe + classify using packets; **do not** send full per-field extraction list (keep `metadataFields: []`).
6. Parse extended classification output (alternatives optional in JSON).
7. Apply `resolveSuggestedDocumentType()` as safety net (keep existing behavior).
8. Pass 2 unchanged structurally — load type-specific fields via existing loader.
9. **ai-analysis alignment (Phase 3 scope):** When re-running analysis on document with **null or wrong type**, use same candidate builder for classification portion; if document already has confirmed type, skip re-classification unless user explicitly requests "re-classify".

**Do not** merge Pass 1 and Pass 2 into single call for intake — two-pass preserves transcription-first flow and limits extraction token use.

---

## 14. Proposed AI Output Schema

**Extend `classification` object in AI JSON (backward compatible — new keys optional):**

```json
{
  "classification": {
    "suggested_type_code": "EMIRATES_ID",
    "confidence_score": 0.94,
    "confidence_label": "high",
    "reason": "Detected UAE ID number pattern and Emirates ID labels.",
    "alternative_document_types": [
      {
        "document_type": "VISA",
        "confidence": 0.41,
        "reason": "UAE government document but visa file number not detected."
      }
    ],
    "classification_evidence": {
      "matched_keywords": ["ID Number", "United Arab Emirates"],
      "matched_patterns": ["784-YYYY-NNNNNNN-N"],
      "negative_matches": ["passport number not found"]
    },
    "needs_human_review": false,
    "review_reason": null
  }
}
```

**Validator changes (`result-validator.ts`):**
- Parse optional `alternative_document_types` (max 3, truncate reason 200 chars)
- Parse optional `classification_evidence` (truncate arrays)
- Derive `needs_human_review` if absent: `confidence_score < 0.60` OR `confidence_label === "needs_manual_review"`

**Unchanged:** `fields[]`, `field_confidence_json` mapping, `extracted_fields_json` keys = `field_code`.

---

## 15. Alternative Document Types Storage Plan

| Option | Description | Recommendation |
|--------|-------------|----------------|
| **A** | Store in `raw_response_json.classification` | **Preferred Phase 3** — no migration |
| B | New `alternative_document_types_json` column | Defer unless query/index needed |
| C | Inside `extracted_fields_json` internal key | **Reject** — pollutes approved metadata path |
| D | Session-only / no persist | **Reject** — lost on refresh |

**Implementation detail:** Extend `sanitizedResponse` in `ai-intake.ts` to include:
```typescript
classification: {
  ...existing,
  alternative_document_types?: [...],
  classification_evidence?: {...},
  needs_human_review?: boolean,
  review_reason?: string | null,
}
```

**UI reads** from `aiResult.raw_response_json` or typed helper `getClassificationReviewMeta(aiResult)`.

**Optional Phase 3.1 migration** (only if reporting needs SQL queries on alternatives): add nullable JSONB column with index — not required for intake review UI.

---

## 16. Low Confidence and Human Review Plan

**Threshold policy (align with existing labels, add explicit review flags):**

| Score | Label | Pass 2 | UI |
|-------|-------|--------|-----|
| ≥ 0.85 | high | Run | Green badge; alternatives collapsed |
| 0.60 – 0.84 | medium | Run | Amber badge; show reason + top 2 alternatives |
| 0.40 – 0.59 | low | Run with warning | Orange badge; "Confirm document type" emphasis |
| < 0.40 | needs_manual_review | Optional (warn if skipped) | Red badge; type required before approve |
| null type | — | Skip Pass 2 | Generic intake; user must pick type |

**UI (intake review — incremental, no redesign):**
- Classification card above document type combobox: confidence badge, reason text, expandable alternatives list
- Low-confidence banner linking to type selector
- No auto-block on approve unless `documentTypeId` null (existing validation)

**Server:** Set `needs_human_review` in stored JSON; do not add new blocking server gate beyond existing approve validation.

---

## 17. Type Change and Metadata Re-Extraction Plan

**Current behavior:** `handleDocTypeChange` updates `documentTypeId` + `categoryId`; metadata section reloads empty/new definitions; **AI-suggested values for old type remain** in form state until user edits.

**Target behavior:**

1. User changes document type away from AI suggestion → show **non-blocking confirmation**: "Document type changed. Re-run AI field extraction for the new type?"
2. User chooses:
   - **Re-run now** → call `rerunMetadataExtractionForIntakeSession`
   - **Keep current values** → only reload field definitions (today's behavior)
3. Re-run uses existing OCR/transcription from `raw_ocr_text` or session — **no new OCR**
4. Pass 1 classification result **preserved** unless user explicitly clicks "Re-classify" (optional secondary action — defer to Phase 3.1 if scope tight)

**Proposed action:**

```typescript
rerunMetadataExtractionForIntakeSession(
  uploadSessionId: number,
  documentTypeId: number,
  options: {
    mergeMode: "fill_missing_only" | "replace_ai_values" | "keep_user_values";
  }
): Promise<ActionResult<{ extractedFieldsJson; fieldConfidenceJson; reviewValues }>>
```

| mergeMode | Behavior |
|-----------|----------|
| `fill_missing_only` (default) | New AI values only for fields user hasn't edited; fill empty fields |
| `replace_ai_values` | Replace all AI-sourced values; preserve user-edited fields if tracked |
| `keep_user_values` | No AI merge; only refresh definition list (equivalent to today) |

**User-edited tracking:** Compare `dms_intake_review_values` against initial AI snapshot on session (store `ai_snapshot_json` on first result or diff by `updated_at`).

**Permissions:** Same as intake review — `dms.documents.upload` OR `dms.documents.review_ai`.

---

## 18. Proposed Server Action Changes

### `ai-intake.ts`

| Aspect | Current | Planned |
|--------|---------|---------|
| Pass 1 candidates | Flat type list | Metadata-aware packets via builder |
| Pre-rank | None | `classification-score.ts` |
| Storage | Basic sanitized classification | Extended classification JSON |
| New export | — | Wire rerun action (or separate file re-export) |

**Risk:** Pass 1 latency +200–500ms for metadata rollup query — mitigate with single grouped SQL query.

### `ai-analysis.ts`

| Aspect | Current | Planned |
|--------|---------|---------|
| Classification | Single call with current type metadata | When `document_type_id` null: intake-style candidate packets; when set: optional skip re-classify |
| Pass 2 | N/A | Consider align two-pass for misclassification — **Phase 3 minimal:** enrich candidate list only |

### `metadata-definitions.ts`

| Aspect | Planned |
|--------|---------|
| Change | **None required** — read-only rollup via new lib |
| Optional | `getMetadataRollupForDocumentTypes(typeIds[])` helper if placed here vs lib |

### New actions

| Action | Input | Output | Permissions |
|--------|-------|--------|-------------|
| `rerunMetadataExtractionForIntakeSession` | sessionId, typeId, mergeMode | updated extraction JSON + review values | upload / review_ai |
| `getClassificationAlternatives` | aiResultId or sessionId | parsed alternatives + evidence | view / upload |
| `confirmDocumentTypeAndRerunExtraction` | sessionId, typeId, mergeMode | combined confirm + rerun | upload / review_ai |

**RLS impact:** None — same tables as intake; no new tables.

**Audit:** See §24.

---

## 19. Proposed AI Library Changes

| File | Purpose | Needed? |
|------|---------|---------|
| `classification-candidate-builder.ts` | Build packets from types + metadata rollups | **Yes** |
| `classification-score.ts` | Deterministic pre-rank | **Yes** |
| `classification-output.ts` | Types + parse helpers for extended classification | **Yes** |
| `prompt-builders.ts` | v3.3 candidate section; classify vs extract instructions | **Modify** |
| `classification-resolver.ts` | Keep heuristics; optionally consume evidence | **Minor modify** |
| `result-validator.ts` | Parse alternatives/evidence | **Modify** |
| `types.ts` | Extend `DmsClassificationResult` | **Modify** |
| `load-metadata-fields.ts` | Add `loadMetadataRollupForDocumentTypes()` or separate query fn | **Modify or sibling** |
| `metadata-definition-shared.ts` | Rollup aggregation helpers | **Modify** |
| `openai-dms-adapter.ts` | No change if prompt builder handles all | **Unlikely** |

**Test strategy:** Unit tests for scoring + packet truncation; fixture OCR snippets for Emirates ID vs passport disambiguation.

---

## 20. Proposed Database Changes or No-Migration Approach

**Recommended: No migration for Phase 3 implementation.**

| Data | Storage |
|------|---------|
| Primary classification | Existing columns |
| Alternatives + evidence | `raw_response_json.classification` |
| needs_human_review | Derived + stored in raw JSON |

**Optional future migration (not Phase 3 default):**

```sql
-- ONLY if SQL reporting required later
ALTER TABLE dms_ai_extraction_results
  ADD COLUMN IF NOT EXISTS alternative_document_types_json JSONB,
  ADD COLUMN IF NOT EXISTS classification_evidence_json JSONB;
```

**Rules satisfied:** No PK/FK change; no historical data deletion; no OCR/prompt content in new JSON — evidence contains keyword/pattern labels only.

**Do not** add document-type alias columns in Phase 3 — use code-level aliases + metadata rollup first.

---

## 21. Proposed Intake Review UI / UX Changes

| Change | Component | Notes |
|--------|-----------|-------|
| Classification confidence card | `dms-ai-intake-review-form.tsx` | Reason + badge (uses existing `DmsAiIntakeFieldRow` patterns) |
| Alternatives list (top 3) | New small collapsible under type row | Read-only; click sets type + triggers confirm dialog |
| Low-confidence warning | Banner / `Alert` | When `needs_human_review` or score < 0.60 |
| Re-run extraction button | Near metadata section | Calls new server action |
| Type-change confirm dialog | `AlertDialog` | mergeMode selection |
| Pass 2 skipped notice | When no type resolved | "Metadata extraction skipped — select a type and re-run" |

**Admin metadata UI:** No changes expected — Phase 2 fields already feed rollup.

**Document record AI tab:** Display alternatives read-only in AI Analysis status panel — **optional Phase 3 stretch**; not required for AC pass if intake is primary path.

**Standards:** Keep `ERPCombobox`, existing badges, no nested buttons in dropdown triggers, Inter font.

---

## 22. Prompt Version and Compatibility Plan

| Item | Plan |
|------|------|
| Current | v3.2 (Phase 2 extraction enrichment) |
| Phase 3 | **v3.3** — metadata-aware classification candidate section |
| Pass 2 extraction field list | Unchanged format from v3.2 |
| `extracted_fields_json` | Unchanged — field_code keys only |
| `field_confidence_json` | Unchanged schema |
| Historical jobs | Old results load without alternatives — UI handles missing keys |
| `prompt_version` column | New jobs record v3.3; old jobs remain v3.2 |

**Compatibility rule:** `result-validator` treats missing `alternative_document_types` as empty array.

---

## 23. RLS / Security Impact Plan

- No new tables; no RLS policy changes expected.
- Classification evidence must not store raw OCR paragraphs — keyword/pattern summaries only.
- Re-run extraction respects existing intake review value RLS.
- Confidentiality gates on document AI analysis unchanged.
- API keys remain env-only.

---

## 24. Audit Logging Plan

Map to existing `logAudit()` pattern (`module_code: "DMS"`):

| Event | Trigger | new_values sketch |
|-------|---------|-------------------|
| `classification_started` | Pass 1 begin | session_id, candidate_count, prompt_version |
| `classification_completed` | Pass 1 end | suggested_type_code, score, needs_human_review |
| `classification_low_confidence` | score < 0.60 | session_id, score, reason |
| `classification_type_changed_by_user` | User picks different type | from_type_id, to_type_id |
| `metadata_extraction_rerun_started` | Re-run action | session_id, type_id, merge_mode |
| `metadata_extraction_rerun_completed` | Re-run success | fields_updated_count |
| `metadata_extraction_values_replaced` | mergeMode replace | field_codes[] |
| `metadata_extraction_values_kept` | mergeMode keep | — |

Also use existing `dms_document_events` for post-approval analysis where applicable.

---

## 25. Backward Compatibility Plan

| Scenario | Handling |
|----------|----------|
| Old intake sessions (v3.2 jobs) | Load without alternatives; UI shows reason/score only |
| Missing `raw_response_json.classification.alternative_document_types` | Empty list |
| Pass 2 results from before Phase 3 | Unchanged |
| Approve flow | Unchanged — human approval required |
| `resolveSuggestedDocumentType` heuristics | Retained — may override AI as today |
| Admin metadata definitions | Rollup ignores inactive/deleted fields |

---

## 26. Implementation Sequence for Future Phase 3 Execution

| Step | Task | Depends on |
|------|------|------------|
| 0 | Read Phase 3 implementation prompt + this plan | — |
| 1 | Add `classification-score.ts` + unit fixtures | — |
| 2 | Add metadata rollup query + `classification-candidate-builder.ts` | Phase 2 shared module |
| 3 | Add `classification-output.ts` types + validator extensions | Step 1–2 |
| 4 | Update `prompt-builders.ts` → v3.3 classification section | Step 2 |
| 5 | Wire Pass 1 in `ai-intake.ts` (candidates + storage) | Steps 1–4 |
| 6 | Add `rerunMetadataExtractionForIntakeSession` server action | Pass 2 logic reuse |
| 7 | Intake UI: classification card, alternatives, re-run dialog | Step 6 |
| 8 | Align `ai-analysis.ts` candidate enrichment (minimal) | Steps 1–4 |
| 9 | Audit events + typecheck/build/lint | All |
| 10 | Implementation report + SOT update | Step 9 pass |

**No Step 0 migration** in default plan.

---

## 27. Acceptance Criteria for Future Implementation

| ID | Criterion |
|----|-----------|
| AC-01 | Classification uses document type metadata and metadata field hints |
| AC-02 | Classification uses Phase 2 metadata fields where useful |
| AC-03 | Prompt version bumped to v3.3 |
| AC-04 | Pass 2 metadata extraction still uses field_code output |
| AC-05 | extracted_fields_json remains backward compatible |
| AC-06 | field_confidence_json remains backward compatible |
| AC-07 | Low confidence classification flagged for review |
| AC-08 | Top alternative document types stored or available in review |
| AC-09 | User can change document type in intake review |
| AC-10 | Changing type can re-run metadata extraction only |
| AC-11 | User-edited values not overwritten without confirmation |
| AC-12 | AI cannot approve or final-save metadata |
| AC-13 | Existing old AI intake results still load |
| AC-14 | No unrelated Phase 4+ features implemented |
| AC-15 | Typecheck/build pass after implementation |

---

## 28. Full Test Plan

### TP-01 — Emirates ID classification

| Field | Value |
|-------|-------|
| **Purpose** | Verify metadata-aware packet beats passport when ID pattern present |
| **Input** | Image/PDF with 784-YYYY-NNNNNNN-N, Arabic الهوية الإماراتية |
| **Steps** | Upload → AI intake → review classification |
| **Expected** | `EMIRATES_ID`, confidence ≥ 0.85, alternatives may include VISA low score |
| **DB** | suggested_document_type_id = Emirates ID type id |
| **UI** | High confidence badge, reason mentions ID pattern |
| **Risk** | G1 misclassification |

### TP-02 — Passport classification

| Field | Value |
|-------|-------|
| **Purpose** | Distinguish passport MRZ from Emirates ID |
| **Input** | Passport scan with MRZ P<… lines |
| **Expected** | `PASSPORT_COPY`, not EMIRATES_ID |
| **Risk** | G1, negative keywords |

### TP-03 — UAE Residence Visa

| Field | Value |
|-------|-------|
| **Input** | Visa page with UID, GDRFA, إقامة |
| **Expected** | `VISA` or configured visa type_code |
| **Risk** | Similarity to Emirates ID |

### TP-04 — Medical Insurance

| Field | Value |
|-------|-------|
| **Input** | Insurance card with member ID, TPA, network |
| **Expected** | `MEDICAL_INSURANCE` |
| **Risk** | G2 static fingerprint dependency |

### TP-05 — Trade License

| Field | Value |
|-------|-------|
| **Input** | DED licence with رخصة تجارية |
| **Expected** | `TRADE_LICENSE` |
| **Risk** | Arabic-only classification |

### TP-06 — TRN certificate

| Field | Value |
|-------|-------|
| **Input** | TRN document with 15-digit TRN pattern |
| **Expected** | `TRN_CERTIFICATE` over generic certificate |
| **Risk** | TRN vs VAT confusion |

### TP-07 — Birth Certificate

| Field | Value |
|-------|-------|
| **Input** | Birth certificate scan |
| **Expected** | Correct type if seeded active; else medium confidence + review |
| **Risk** | Option C mandatory list omission |

### TP-08 — Marriage Certificate

| Field | Value |
|-------|-------|
| **Input** | Marriage certificate |
| **Expected** | Classified or low confidence with alternatives |
| **Risk** | Rare type ranking |

### TP-09 — Wrong classification correction

| Field | Value |
|-------|-------|
| **Steps** | AI suggests wrong type → user selects correct type → re-run extraction |
| **Expected** | New field values for correct type; audit `classification_type_changed_by_user` |
| **Risk** | G6 |

### TP-10 — Low confidence classification

| Field | Value |
|-------|-------|
| **Input** | Ambiguous scan |
| **Expected** | needs_human_review, score < 0.60, UI warning |
| **Risk** | G5 |

### TP-11 — No matching type

| Field | Value |
|-------|-------|
| **Input** | Unrecognized document |
| **Expected** | null type, Pass 2 skipped, user must select type |
| **Risk** | Pass 2 empty fields |

### TP-12 — Arabic-only document

| Field | Value |
|-------|-------|
| **Input** | Arabic trade licence |
| **Expected** | Classification uses `expected_keywords_ar` / name_ar |
| **Risk** | G4 |

### TP-13 — Mixed Arabic/English

| Field | Value |
|-------|-------|
| **Input** | Bilingual Emirates ID |
| **Expected** | EMIRATES_ID with high confidence |
| **Risk** | Label rollup |

### TP-14 — Filename indicates type

| Field | Value |
|-------|-------|
| **Input** | `sameer_eid_2026.pdf` with poor OCR |
| **Expected** | Pre-rank boosts EMIRATES_ID |
| **Risk** | Over-reliance on filename — reason should mention both |

### TP-15 — OCR vs filename conflict

| Field | Value |
|-------|-------|
| **Input** | Filename `passport.pdf` but content is Emirates ID |
| **Expected** | Content wins via pattern + negative keywords |
| **Risk** | Filename overweight |

### TP-16 — Negative keyword prevents wrong type

| Field | Value |
|-------|-------|
| **Input** | Document with "passport number" label on non-passport |
| **Expected** | EMIRATES_ID not downgraded incorrectly; evidence shows negative_matches |
| **Risk** | False penalty |

### TP-17 — Expected format match

| Field | Value |
|-------|-------|
| **Input** | Valid Emirates ID format |
| **Expected** | +score from format signal in evidence |
| **Risk** | Regex false positive |

### TP-18 — Document type changed by user

| Field | Value |
|-------|-------|
| **Steps** | Change type without re-run |
| **Expected** | Definitions reload; values unchanged until re-run |
| **Risk** | Stale values |

### TP-19 — Metadata re-run after type change

| Field | Value |
|-------|-------|
| **Steps** | Change type → re-run fill_missing_only |
| **Expected** | New fields populated; user edits preserved |
| **Risk** | AC-11 violation |

### TP-20 — User values preserved vs replaced

| Field | Value |
|-------|-------|
| **Steps** | Test both merge modes |
| **Expected** | replace vs keep behavior matches spec |
| **Risk** | Data loss |

### TP-21 — AI output schema backward compatibility

| Field | Value |
|-------|-------|
| **Input** | Load v3.2 session |
| **Expected** | No crash; missing alternatives handled |
| **Risk** | AC-13 |

### TP-22 — Old intake result still loads

| Field | Value |
|-------|-------|
| **Steps** | Open pre-Phase 3 session |
| **Expected** | Review form renders |
| **Risk** | Regression |

### TP-23 — typecheck

| Command | `npm run typecheck` — PASS |

### TP-24 — lint

| Command | `npm run lint` — document pre-existing vs new |

### TP-25 — build

| Command | `npm run build` — PASS |

---

## 29. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Prompt token overflow | Medium | Hybrid top-N + char budget; truncate packets |
| Pre-rank excludes correct rare type | Medium | Mandatory common types; user manual override |
| Re-run overwrites user edits | High if wrong merge | Default `fill_missing_only`; confirm dialog |
| ai-analysis scope creep | Medium | Minimal candidate enrichment only in Phase 3 |
| Duplicate alias maintenance | Low | Document: code aliases + metadata rollup, not DB yet |
| Latency increase | Medium | Single rollup SQL; cache per intake session |
| False confidence from filename | Medium | Weight content signals higher than filename |

---

## 30. What Must Not Be Implemented in Phase 3

```text
async job queue
AI tab automation
AI Analysis apply-to-metadata
semantic chunks
review queue UI (/dms/inbox/review)
ERP mapping UI
ERP mapping apply logic
child rule tables
Azure OCR wiring
OCR history
page-level OCR
bulk auto-approve
auto-save AI results to production metadata
auto-overwrite approved metadata
major UI redesign
unrelated refactoring
new document type alias DB column (defer)
Pass 1 + Pass 2 merged into single call for intake (defer)
```

---

## 31. Recommended Next Cursor Implementation Prompt

Create: `ChatGPT/ERP_DMS_AI_PHASE_3_METADATA_AWARE_CLASSIFICATION_IMPLEMENTATION_PROMPT.md`

**Suggested implementation prompt structure (mirror Phase 2):**

1. Master standard + read-first files (this plan, SOT, Phase 2 report)
2. Strict scope (forbidden list from §30)
3. Steps 0–10 matching §26 implementation sequence
4. Required report: `ERP_DMS_AI_PHASE_3_METADATA_AWARE_CLASSIFICATION_IMPLEMENTATION_REPORT.md`
5. SOT update: `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md`
6. Acceptance criteria §27
7. Final screen response template (no full report paste)

**Step 0 explicit:** Confirm no migration unless implementation discovers query requirement for alternatives.

---

## 32. Final Recommendation

Proceed with **Phase 3 implementation** using **Hybrid Option C pre-ranking**, **metadata-aware candidate packets** built from Phase 2 `dms_metadata_definitions` rollups, **prompt v3.3**, **extended classification JSON in existing `raw_response_json`**, and **`rerunMetadataExtractionForIntakeSession`** for type-change workflows — all without weakening human-review-first governance.

This delivers the highest accuracy-to-cost ratio while reusing Phase 2 investments and avoiding schema churn. Defer DB columns for alternatives, document-type alias master data, and ai-analysis two-pass refactor to later phases if operational reporting requires them.

**Planning status:** COMPLETE — ready for ChatGPT review and implementation prompt authoring.

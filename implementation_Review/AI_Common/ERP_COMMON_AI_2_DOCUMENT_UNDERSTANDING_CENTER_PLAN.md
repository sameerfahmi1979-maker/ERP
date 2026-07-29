# ERP COMMON AI.2 — AI Document Understanding Center Plan

**Phase:** ERP COMMON AI.2 — Planning  
**Date:** 2026-06-17  
**Status:** PLAN ONLY — not implemented  
**Basis:** Deep audit of DMS document record UI, DMS intelligence schema, COMMON AI.1 registry, DMS AI ORCH.1 pipeline, live DB schema, and feature flags.

> **PLAN ONLY — No source files changed. No migrations applied. No flags enabled.**

---

## 1. Executive Summary

**Goal:** Add an "Understanding" tab to the DMS document record that presents a unified, human-readable intelligence view of a document — aggregating all existing DMS AI outputs (OCR, summary, classification, completeness, risk, embedding, tags, links, orchestration status) and previewing COMMON AI.1 field update candidates for the linked entity.

**Key decisions:**
- **Read-only** — AI.2 never writes, applies, or auto-generates anything
- **No new AI calls** — uses existing outputs only; links to existing action buttons for generation
- **No DB migration** in v1 — live aggregation from existing tables
- **One phase** — implementable safely in one Cursor run
- **Feature flag:** `ERP_AI_DOC_UNDERSTANDING` — already seeded (`is_enabled = false`), no migration needed
- **New tab** — added after "AI Analysis" and before "Approvals" in the document record

---

## 2. Current DMS Intelligence Capability Inventory

### Data available on `dms_documents` (all confirmed in live DB)

| Column | Type | Safe to show | AI.2 use |
|---|---|---|---|
| `document_no` | text | ✅ | Document Identity |
| `title` | text | ✅ | Document Identity |
| `status` | text | ✅ | Document Identity |
| `confidentiality_level` | text | ✅ (label only) | Document Identity + gate check |
| `issue_date` / `expiry_date` | date | ✅ | Document Identity + Risk |
| `ocr_last_run_at` | timestamptz | ✅ | OCR Status |
| `ocr_text_available` | boolean | ✅ | OCR Status |
| `ai_summary` | text | ✅ with confidentiality gate | AI Summary |
| `ai_summary_status` | text | ✅ | AI Summary |
| `completeness_score` | numeric | ✅ | Completeness |
| `missing_fields_json` | jsonb | ✅ (labels only, no raw) | Completeness |
| `ai_risk_score` | numeric | ✅ | Risk |
| `ai_risk_level` | text | ✅ | Risk |
| `ai_risk_reasons_json` | jsonb | ✅ (labels only) | Risk |
| `summary_embedding_status` | text | ✅ | Embedding Status |
| `summary_embedding_model` | text | ✅ | Embedding Status |
| `summary_embedding_source` | text | ✅ | Embedding Status |

### Data from related tables

| Source | Data | Safe | AI.2 use |
|---|---|---|---|
| `dms_document_content` | `is_truncated`, `char_count`, `content_text_source` | ✅ metadata only | OCR/Text Status |
| `dms_document_files` | `ocr_status` per file, `ocr_confidence`, `ocr_page_count`, `mime_type`, count | ✅ | OCR Status |
| `dms_document_types` | `type_code`, `name_en`, `name_ar` | ✅ | Document Identity |
| `dms_document_categories` | `name_en` | ✅ | Document Identity |
| `dms_ai_extraction_results` | `ai_status`, `classification_reason`, `classification_score`, `suggested_title`, field count | ✅ | AI Analysis Status |
| `dms_document_metadata_values` | field codes + values | ✅ (labels, not raw sensitive) | Completeness |
| `dms_document_tags` | tag names | ✅ | Tags |
| `dms_ai_tag_suggestions` | pending count, tag names, confidence | ✅ | Tag Suggestions |
| `dms_document_links` | entity_type, entity_id, accepted links | ✅ | Entity Links |
| `dms_ai_link_suggestions` | pending count, entity names, confidence | ✅ | Link Suggestions |
| `dms_upload_sessions` | `orchestration_status`, `orchestration_steps_json` | ✅ metadata only | ORCH.1 Status |
| `erp_ai_field_suggestions` | pending count by entity | ✅ | COMMON AI.1 candidates |
| `owner_companies` / `parties` / `branches` / `work_sites` | display_name | ✅ | Entity Identity |

---

## 3. Current Document Record UI Audit

### Existing tabs (17 sections in `dms-document-record-form.tsx`)

```
Overview | Metadata | Links | Tags | Versions | Files | Expiry |
OCR/Text | Extracted Text | AI Summary | Intelligence | Semantic |
Ask AI | AI Analysis | Approvals | Comments | Audit
```

### Gap Analysis — why Understanding tab is needed

| Problem | Current state | AI.2 solution |
|---|---|---|
| Intelligence scattered | Users must visit 6+ tabs to understand a document | One tab shows complete picture |
| No action guidance | No "what should I do next?" | Recommended Actions section |
| No field update preview | COMMON AI.1 is on entity form, not document | AI.2 previews candidates from document perspective |
| No entity context | Links tab shows linked entities but no entity health | AI.2 shows entity + which fields document can update |
| No orchestration status | ORCH.1 progress card only on intake page | AI.2 shows final orchestration result on document |
| No holistic readiness | Each AI feature checked separately | AI.2 shows one overall readiness score |

### Where to place the Understanding tab

**Placement:** After "AI Analysis" (`id: "ai"`) and before "Approvals" (`id: "approvals"`)

```
[...] | Intelligence | Semantic | Ask AI | AI Analysis | 🆕 Understanding | Approvals | [...]
```

Rationale: The Understanding tab synthesizes all AI data, so it belongs after all AI processing tabs. It should be visible to any user with document view access (not disabled by childLocked since it reads existing data).

---

## 4. Gap Analysis

| Gap | Root cause | AI.2 fix |
|---|---|---|
| No unified intelligence view | Intelligence spread across 6 tabs | `getDmsDocumentUnderstanding()` aggregates all |
| Users don't know what's missing | No single "gaps" view | Completeness section + Recommended Actions |
| No entity-document relationship view | DMS doesn't show what ERP records a document can update | Field Update Candidates section |
| No orchestration result visible after intake | ORCH.1 card only shown during intake review | AI.2 reads `dms_upload_sessions.orchestration_steps_json` |
| No semantic readiness indicator | Embedding status is buried in Semantic tab | AI.2 shows "Ready for semantic search: Yes/No" |
| No overall "document health" signal | Risk + completeness on separate tabs | AI.2 shows combined health summary card |

---

## 5. Proposed AI.2 Architecture

### Design principles

1. **Aggregation-only** — reads from existing tables, no new AI calls
2. **Single server action** — `getDmsDocumentUnderstanding(documentId)` loads all intelligence in one round-trip
3. **Lazy-loaded** — Understanding tab uses `lazyMount` like other tabs; data only loaded when tab opened
4. **No new tables** — live aggregation, no cache table in v1
5. **Confidentiality-aware** — gates inherited from existing DMS rules
6. **Action-linked** — every "missing" indicator links to the correct existing button/tab to fix it
7. **Feature-flagged** — gated by `ERP_AI_DOC_UNDERSTANDING` (already exists, currently `false`)

### Component architecture

```
DmsDocumentUnderstandingSection (tab content)
  ├── DmsUnderstandingHealthCard      (overall health summary)
  ├── DmsUnderstandingIdentityCard    (document + entity identity)
  ├── DmsUnderstandingOcrCard         (OCR + text status)
  ├── DmsUnderstandingSummaryCard     (AI summary status + text)
  ├── DmsUnderstandingExtractionCard  (AI classification + field extraction)
  ├── DmsUnderstandingCompletenessCard(completeness score + missing fields)
  ├── DmsUnderstandingRiskCard        (risk level + reasons)
  ├── DmsUnderstandingEmbeddingCard   (embedding status + similarity readiness)
  ├── DmsUnderstandingTagsLinksCard   (tags + link suggestions)
  ├── DmsUnderstandingEntityCard      (linked entity profile)
  ├── DmsUnderstandingFieldCandidates (COMMON AI.1 field update preview)
  └── DmsUnderstandingActionsCard     (recommended next actions)
```

---

## 6. Understanding Data Model / View Model

```typescript
interface DmsDocumentUnderstanding {
  documentId: number;
  generatedAt: string; // ISO timestamp of this aggregation

  // ── Section 1: Document Identity
  identity: {
    documentNo: string;
    title: string;
    typeCode: string | null;
    typeName: string | null;
    typeNameAr: string | null;
    categoryName: string | null;
    status: string;
    confidentialityLevel: string;
    issueDate: string | null;
    expiryDate: string | null;
    daysUntilExpiry: number | null; // computed
    expiryStatus: "valid" | "expiring_soon" | "expired" | "unknown";
  };

  // ── Section 2: OCR / Text Status
  ocrStatus: {
    ocrLastRunAt: string | null;
    ocrTextAvailable: boolean;
    fileCount: number;
    filesWithOcr: number;
    contentTextAvailable: boolean;
    contentTextCharCount: number | null;
    contentTextTruncated: boolean;
    contentTextSource: string | null;
  };

  // ── Section 3: AI Summary
  summaryStatus: {
    status: string | null; // pending/complete/failed/skipped
    summaryText: string | null; // null for non-admin confidential
    isConfidentialRedacted: boolean;
    summaryModel: string | null;
  };

  // ── Section 4: AI Classification / Extraction
  extractionStatus: {
    hasResult: boolean;
    aiStatus: string | null;
    classificationConfidence: number | null;
    classificationReason: string | null;
    extractedFieldCount: number;
    lowConfidenceFieldCount: number;
    needsHumanReview: boolean;
  };

  // ── Section 5: Completeness
  completeness: {
    score: number | null; // 0-1
    missingFieldLabels: string[]; // safe labels only, no raw values
    hasRequiredMetadata: boolean;
    totalMetadataFields: number;
    filledMetadataFields: number;
  };

  // ── Section 6: Risk
  risk: {
    riskLevel: string | null; // none/low/medium/high/critical
    riskScore: number | null;
    riskReasonLabels: string[]; // safe labels, no raw values
    isExpired: boolean;
    isExpiringSoon: boolean;
  };

  // ── Section 7: Semantic / Embedding
  embedding: {
    status: string | null; // pending/complete/failed/skipped/not_required
    model: string | null;
    source: string | null;
    readyForSemanticSearch: boolean;
  };

  // ── Section 8: Tags and Links
  tagsLinks: {
    tagCount: number;
    tagNames: string[];
    pendingTagSuggestions: number;
    linkCount: number;
    linkedEntities: Array<{
      entityType: string;
      entityId: number;
      entityDisplayName: string | null;
      isPrimary: boolean;
    }>;
    pendingLinkSuggestions: number;
  };

  // ── Section 9: Orchestration Status (ORCH.1)
  orchestrationStatus: {
    available: boolean;
    status: string | null;
    steps: Array<{ step: string; status: string; durationMs?: number }>;
    completedSteps: number;
    failedSteps: number;
  };

  // ── Section 10: Field Update Candidates (COMMON AI.1 preview)
  fieldCandidates: {
    entityType: string | null;
    entityId: number | null;
    registryAvailable: boolean;
    candidateFields: Array<{
      fieldLabel: string;
      targetField: string;
      targetTable: string;
      documentTypeHints: string[];
      hasPendingSuggestion: boolean;
      pendingSuggestionId: number | null;
      safetyClassification: string;
    }>;
    pendingSuggestionCount: number;
    hasAiReviewTab: boolean; // whether entity type supports COMMON AI.1
  };

  // ── Overall health (computed)
  health: {
    score: number; // 0-100 composite
    label: "Excellent" | "Good" | "Needs Attention" | "Critical";
    hasOcr: boolean;
    hasSummary: boolean;
    hasIntelligence: boolean;
    hasEmbedding: boolean;
    hasLinks: boolean;
    warningCount: number;
  };

  // ── Recommended actions
  actions: Array<{
    actionCode: string;
    label: string;
    description: string;
    priority: "high" | "medium" | "low";
    linkToTab?: string; // section id to navigate to
    linkToRoute?: string; // route if external
    condition: string; // why this action is recommended
  }>;
}
```

---

## 7. Server Action Design

### Primary action

**File to create:** `src/server/actions/dms/document-understanding.ts`

```typescript
getDmsDocumentUnderstanding(documentId: number): Promise<ActionResult<DmsDocumentUnderstanding>>
```

**Flow:**
1. `getAuthContext()` + `hasPermission(ctx, "dms.documents.view")` OR `dms.admin`
2. `isERP_AI_DOC_UNDERSTANDING_enabled()` — gate check (flag currently false; returns disabled message if off)
3. Load core document + type + category from `dms_documents` + joins
4. Confidentiality check: hr/legal/executive require `dms.admin` for AI summary text
5. Load OCR status: file count + OCR status from `dms_document_files`, content from `dms_document_content` (metadata only: char_count, is_truncated — NOT content_text itself)
6. Load AI summary: status + text (conditional on confidentiality gate)
7. Load extraction result: latest from `dms_ai_extraction_results` — status, confidence, field count only. Never raw extracted values.
8. Load completeness/risk: from `dms_documents` columns (score, safe labels from `missing_fields_json` and `ai_risk_reasons_json`)
9. Load embedding: from `dms_documents.summary_embedding_status/model/source`
10. Load tags: `dms_document_tags` count + names (safe)
11. Load tag suggestions: `dms_ai_tag_suggestions` pending count
12. Load entity links: `dms_document_links` + entity display names
13. Load link suggestions: `dms_ai_link_suggestions` pending count
14. Load orchestration: `dms_upload_sessions` by `document_id` — `orchestration_status`, `orchestration_steps_json` (safe metadata only)
15. Load COMMON AI.1 field candidates: from registry for matched entity_type (no DB query — from `getCommonAiEntityRegistry`). Check `erp_ai_field_suggestions` for pending suggestion count per entity.
16. Compute health score + recommended actions
17. Return `DmsDocumentUnderstanding` view model

**Never included in response:**
- Raw OCR text
- content_text body
- Prompt text
- Raw AI response
- Vector values
- Sensitive extracted personal values
- API keys

### Optional secondary action (Phase 2 consideration)

```typescript
previewDmsDocumentFieldUpdateCandidates(documentId: number)
```

Not required in Phase 1. The field candidates preview is computed client-side from the main understanding action.

---

## 8. UI Design

### Tab placement in `dms-document-record-form.tsx`

```typescript
// Add after { id: "ai", label: "AI Analysis" }:
{ id: "understanding", label: "Understanding", icon: <Sparkles className="h-3.5 w-3.5" />, disabled: childLocked }
```

Note: Do NOT disable with `childLocked` flag since this tab reads existing intelligence and doesn't interact with child dialogs. However, keep consistent with existing pattern — if document is unsaved (new), show "Save first" message.

### Panel layout

The tab renders `DmsDocumentUnderstandingSection`:

```
┌─────────────────────────────────────────────────────────────────┐
│  ✨ Document Intelligence Summary              ERP_AI_DOC_UNDERSTANDING │
│                                                                  │
│  [Health Card: Overall 72% — Needs Attention]                    │
│                                                                  │
│  ┌────────────────────┐ ┌────────────────────┐                  │
│  │ 📄 Document        │ │ 🔗 Linked Entity   │                  │
│  │ DMS-2026-000042    │ │ Alliance Gulf Group │                  │
│  │ Trade License      │ │ Type: company       │                  │
│  │ Expiry: 31/12/2026 │ │ [Open AI Review →] │                  │
│  └────────────────────┘ └────────────────────┘                  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ OCR & Text    [✓ Text available · 4,231 chars]          │    │
│  │ AI Summary    [✓ Complete · GPT-4.1 · 2026-06-17]      │    │
│  │ Classification[✓ High confidence · TRADE_LICENSE 0.94] │    │
│  │ Completeness  [▓▓▓▓▓▓▓░░░ 71% · 3 fields missing]      │    │
│  │ Risk          [🟡 Medium · Expiring in 197 days]        │    │
│  │ Embedding     [✓ Ready for semantic search]             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────┐ ┌──────────────────────┐             │
│  │ Tags (3)             │ │ Field Update Candidates│             │
│  │ #trade-license       │ │ 5 ERP fields match    │             │
│  │ #uae-compliance      │ │ 0 pending suggestions │             │
│  │ + 2 pending AI tags  │ │ [Open AI Review →]    │             │
│  └──────────────────────┘ └──────────────────────┘             │
│                                                                  │
│  ⚡ Recommended Actions                                          │
│  1. [HIGH] Review 2 pending AI tag suggestions → Tags tab       │
│  2. [MED] Fill missing: 'main_activity', 'trade_name_ar'        │
│  3. [MED] Generate AI field suggestions → Entity AI Review tab  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Document Understanding Sections (Detailed)

### Section 1: Overall Health Card
- Composite score 0–100 (based on: OCR available, summary complete, intelligence run, embedding ready, at least one link, risk ≤ medium)
- Color: ✅ Excellent (85+), 🟢 Good (65-84), 🟡 Needs Attention (40-64), 🔴 Critical (<40)
- Shows: score, label, 5 status icons in a row (OCR / Summary / Intelligence / Embedding / Links)
- Does NOT show a "Refresh" button — data reflects latest stored state

### Section 2: Document Identity
- Document No, Title, Type (En + Ar), Category, Status badge, Confidentiality badge
- Issue date, Expiry date with days-until-expiry and color urgency
- Owning company / branch / party (first primary link)

### Section 3: OCR & Text Status
- Per-file OCR status summary (N of M files have OCR text)
- content_text: available/missing, char count, is_truncated, source
- Action link: "Run OCR → OCR/Text tab" if missing

### Section 4: AI Summary
- Status badge: pending / complete / failed / skipped
- Summary text: shown if available and allowed. Redacted message for non-admin on hr/legal/executive
- Model name, generated_at
- Action link: "Generate Summary → AI Summary tab" if missing

### Section 5: AI Classification & Extraction
- Classification status badge
- Suggested type + confidence score
- Extracted field count + low-confidence count
- "Needs human review" warning if any field has needs_manual_review confidence
- Action link: "View Full AI Analysis → AI Analysis tab"

### Section 6: Completeness
- Score as progress bar (0-100%)
- Missing field labels (safe field labels only — no raw DB values)
- Required fields not filled count
- Action link: "Fill Missing → Metadata tab"

### Section 7: Risk
- Risk level badge: none / low / medium / high / critical
- Risk score as percentage
- Risk reason labels (safe: "Expiring soon", "Missing required metadata", "No content text")
- Expiry countdown if risk includes expiry
- Action link: "Set Expiry Date → Expiry tab" if expiry missing

### Section 8: Semantic Embedding
- Status: ready / pending / failed / not_required
- Model name, source (ai_summary vs content_text)
- "Ready for Semantic Search: Yes / No"
- Action link: "Generate Embedding → Semantic tab" if missing

### Section 9: Tags and Links
- Tags: count + tag names (up to 5 shown, +N more)
- Pending AI tag suggestions count + confidence range
- Accepted entity links: type + display name
- Pending AI link suggestions count
- Action links: "Review Tags → Tags tab", "Review Links → Links tab"

### Section 10: ORCH.1 Pipeline Status
- Shows only if orchestration was run (orchestration_status not 'pending')
- Step-by-step result: content_sync, ai_summary, intelligence, embedding, tag_suggestions, link_suggestions
- If complete_with_warnings: which steps failed
- If failed: which critical step failed

### Section 11: Field Update Candidates (COMMON AI.1 preview)
- Shows if document is linked to a company or party entity
- Lists registered AI-eligible fields from COMMON AI.1 registry for that entity type
- For each field: label, relevance to this document type
- Shows: pending suggestion count from `erp_ai_field_suggestions` for that entity
- Action link: "Open AI Review & Update → go to entity record → AI Review tab"
- Important: Read-only preview. Does NOT call `generateAiFieldSuggestions`.

### Section 12: Recommended Actions
Dynamic list generated by server action based on understanding state:

| Priority | Condition | Action |
|---|---|---|
| HIGH | No OCR text | Run OCR (AI) → OCR/Text tab |
| HIGH | ai_summary_status != complete | Generate Summary → AI Summary tab |
| HIGH | risk_level = critical | Review document immediately |
| HIGH | Expired | Renew document → Expiry tab |
| MED | Pending tag suggestions > 0 | Review Tag Suggestions → Tags tab |
| MED | Pending link suggestions > 0 | Review Link Suggestions → Links tab |
| MED | completeness_score < 0.6 | Fill missing fields → Metadata tab |
| MED | No entity linked | Add entity link → Links tab |
| MED | No embedding | Generate Embedding → Semantic tab |
| LOW | Field candidates available, no suggestions | Generate Field Suggestions → Entity AI Review |
| LOW | ORCH.1 had warnings | Retry failed pipeline steps → intake screen or manual buttons |

---

## 10. Entity Link Understanding

### How AI.2 determines linked entities

1. Query `dms_document_links` for this document → get `entity_type`, `entity_id`, `is_primary`
2. For each link, load entity display name from:
   - `company` → `owner_companies.trade_name` or `legal_name_en`
   - `party` → `parties.display_name`
   - `branch` → `branches.legal_branch_name` or `name_en`
   - `site` → `work_sites.site_name`
3. Show: entity type badge, entity name, primary badge if `is_primary = true`
4. Show: pending AI link suggestions from `dms_ai_link_suggestions`

### Handling unlinked documents

If `dms_document_links` returns 0 rows → show "Document has no linked entity. This document cannot update ERP records until it is linked." with action link to Links tab.

### Handling multiple links

Show all accepted links. For field candidates, use the first `company` or `party` link (Stage 1 COMMON AI.1 entities). If no Stage 1 entity linked, show "Field candidates require linking this document to an Organization or Party."

---

## 11. Field Update Candidate Preview

### Source

Uses `getCommonAiEntityRegistry(entityType)` from `src/lib/ai/common/registry/index.ts` — no DB query for the registry itself.

Checks `erp_ai_field_suggestions` for existing pending suggestions:
```sql
SELECT COUNT(*), target_field, field_label
FROM erp_ai_field_suggestions
WHERE entity_type = ? AND entity_id = ? AND status = 'pending' AND deleted_at IS NULL
GROUP BY target_field, field_label;
```

### Display

For each registered field in the entity registry:
- Field label
- Safety classification badge (business_safe / requires_review)
- Document type hints (does this field match this document type?)
- Whether a pending suggestion already exists

### Document-field relevance matching

A field is "highly relevant" if the document's type_code appears in the field's `documentTypeHints` array. Otherwise "general candidate."

### Action

Single button: "Generate Suggestions for [Entity Name] → Open Organization/Party AI Review tab"

This does NOT call `generateAiFieldSuggestions` in AI.2. It navigates the user to the entity record's AI Review & Update tab where they can run it manually.

---

## 12. Relationship to COMMON AI.1 Field Suggestions

| Aspect | COMMON AI.1 | COMMON AI.2 |
|---|---|---|
| Location | Entity record → AI Review & Update tab | Document record → Understanding tab |
| Perspective | Entity-centric (which documents can update this entity) | Document-centric (which entities can this document update) |
| Generate | Yes — user clicks Generate on entity | No — read-only preview |
| Apply | Yes — user accepts and applies | No — links to entity AI Review tab |
| Read suggestions | From `erp_ai_field_suggestions` (entity filter) | From `erp_ai_field_suggestions` (entity filter, count only) |

COMMON AI.1 and AI.2 are complementary, not overlapping. AI.2 provides the document side of the lens.

---

## 13. Relationship to DMS AI ORCH.1

ORCH.1 is the pipeline that processes documents after upload (OCR, summary, intelligence, embedding, tags, links).

AI.2 uses ORCH.1 results:
- Reads `dms_upload_sessions.orchestration_status` and `orchestration_steps_json`
- Displays orchestration result in Section 10
- If ORCH.1 failed steps → shows in Recommended Actions as "Retry failed pipeline steps"
- AI.2 does NOT re-trigger ORCH.1; links to existing "Run AI pipeline" button in intake review or manual admin buttons

---

## 14. Database Impact Review

### Recommendation: No new tables in v1

| Table needed | Data | Already available |
|---|---|---|
| Document core | Identity, status, dates, confidentiality | ✅ `dms_documents` |
| Intelligence | Scores, risk, summary status | ✅ `dms_documents` columns |
| OCR | File count, per-file OCR status | ✅ `dms_document_files` |
| Content text | Char count, source, truncated flag | ✅ `dms_document_content` |
| AI extraction | Classification result, field count | ✅ `dms_ai_extraction_results` |
| Tags | Applied tags | ✅ `dms_document_tags` |
| Tag suggestions | Pending count | ✅ `dms_ai_tag_suggestions` |
| Entity links | Accepted links | ✅ `dms_document_links` |
| Link suggestions | Pending count | ✅ `dms_ai_link_suggestions` |
| Orchestration | ORCH.1 status | ✅ `dms_upload_sessions` |
| Field candidates | Registry + suggestion count | ✅ `erp_ai_field_suggestions` + registry |

### Performance assessment

The `getDmsDocumentUnderstanding` action makes ~10 DB queries (most are small lookups by document_id). Expected total response time: 100–300ms. No new indexes required — all queries use existing document_id indexes.

### Optional cache table (not recommended in v1)

`dms_document_understanding_snapshots` would be justified if:
- Understanding computation exceeds 1 second consistently
- Users need snapshot history for compliance
- AI.2 expands to aggregate across multiple documents

**Decision: No new table. Live aggregation only.**

---

## 15. SQL Review — Recommended / Optional

See: `implementation_Review/sql_review/ERP_COMMON_AI_2_OPTIONAL_MIGRATION_REVIEW.sql`

No migration is recommended. The `ERP_AI_DOC_UNDERSTANDING` flag exists and is `false` — AI.2 simply enables it during UAT.

---

## 16. RLS / Permission / Confidentiality Design

### Permission boundary (server action)

```typescript
// Minimum required:
hasPermission(ctx, "dms.documents.view") OR hasPermission(ctx, "dms.admin")

// AI summary text for hr/legal/executive:
if (CONFIDENTIAL_LEVELS.includes(doc.confidentiality_level) && !isAdmin) {
  understanding.summaryStatus.summaryText = null;
  understanding.summaryStatus.isConfidentialRedacted = true;
}
```

### What non-admin users can see

| Data | Non-admin user | dms.admin |
|---|---|---|
| Document identity | ✅ | ✅ |
| OCR/text status | ✅ | ✅ |
| Summary text (non-confidential) | ✅ | ✅ |
| Summary text (hr/legal/executive) | ❌ Redacted | ✅ |
| Completeness score + labels | ✅ | ✅ |
| Risk score + labels | ✅ | ✅ |
| Extraction confidence | ✅ | ✅ |
| Extracted field values | ❌ Never shown | ❌ Never shown in AI.2 |
| Tags, links | ✅ | ✅ |
| Orchestration steps | ✅ (safe metadata) | ✅ |
| Field candidates | ✅ (labels only) | ✅ |

### RLS tables used — all already RLS ENABLED + FORCED

All 9 tables queried have RLS ENABLED + FORCED (verified in live DB). No new RLS policies needed.

---

## 17. Feature Flag Design

### `ERP_AI_DOC_UNDERSTANDING`

- **Already seeded** by COMMON AI.0 migration — `is_enabled = false`
- **No new flag needed**
- Admin enables via Admin → AI Settings → Feature Flags

When flag is OFF:
- Understanding tab is visible but shows: "AI Document Understanding is not enabled. Contact your administrator to enable ERP_AI_DOC_UNDERSTANDING."
- No DB queries run
- No AI calls

When flag is ON:
- `getDmsDocumentUnderstanding` runs full aggregation
- All sections visible with proper confidentiality gates

---

## 18. Performance and Caching Design

### Response time estimate

| Query | Expected time | Notes |
|---|---|---|
| dms_documents (with joins) | 10-20ms | Index on id |
| dms_document_files | 5-15ms | Index on document_id |
| dms_document_content | 5-10ms | Index on document_id |
| dms_ai_extraction_results | 5-15ms | Index on document_id |
| dms_document_metadata_values | 10-20ms | Count query |
| dms_document_tags | 5-10ms | |
| dms_ai_tag_suggestions | 5-10ms | Pending count |
| dms_document_links | 10-20ms | With entity name lookup |
| dms_ai_link_suggestions | 5-10ms | Pending count |
| dms_upload_sessions | 5-15ms | By document_id |
| erp_ai_field_suggestions | 5-15ms | Count by entity |
| **Total** | **~70-150ms** | Well within acceptable range |

**Decision: No caching in v1. Lazy-loaded tab (only queries when user opens the tab).**

### TanStack Query integration

```typescript
queryKeys.dms.documentUnderstanding(documentId)
// staleTime: 60_000 — refresh once per minute if tab stays open
```

---

## 19. Error Handling Design

| State | UI Response |
|---|---|
| Flag disabled | Show disabled message card, no queries |
| Document not found | "Document not found or access denied" |
| Permission denied | "You do not have permission to view this document" |
| Confidential document (non-admin) | Show all data except AI summary text; show redaction notice |
| No OCR text available | Show in OCR section as "Not yet extracted" + action link |
| No AI summary | Show "Summary not generated" + action link |
| No intelligence evaluated | Show "Not evaluated" + action link |
| No entity links | Show "No entity linked" + action link to Links tab |
| ORCH.1 never ran | Orchestration section shows "Pipeline not run for this document" |
| ORCH.1 data missing (pre-ORCH.1 document) | Hide orchestration section entirely |
| Field candidates: no Stage 1 entity linked | Show "Link to Organization or Party to see field candidates" |
| Server error | Toast + retry button |

---

## 20. Testing and UAT Plan

### Source-level checks

1. TypeScript passes (0 errors)
2. Build passes
3. `getDmsDocumentUnderstanding` returns correct structure
4. `ERP_AI_DOC_UNDERSTANDING=false` → returns disabled gracefully
5. Confidential document → summary text is null for non-admin
6. No raw OCR/content_text in response
7. Understanding tab visible in document record section nav

### UAT — with flag disabled

1. Open any document record
2. Confirm Understanding tab is visible
3. Confirm "Feature disabled" message is shown
4. Confirm existing tabs are unchanged

### UAT — with flag enabled

1. Enable `ERP_AI_DOC_UNDERSTANDING` flag
2. Open a document with full AI processing complete (Trade License with OCR, summary, intelligence)
3. Confirm all sections render: Identity, OCR, Summary, Completeness, Risk, Embedding, Tags, Links
4. Confirm health score is computed
5. Open a document with no AI processing → confirm "Not evaluated" states with action links
6. Open a confidential (hr/legal) document as non-admin → confirm summary is redacted
7. Open a document linked to an Organization → confirm field candidates appear
8. Confirm clicking "Open AI Review" navigates to organization record → AI Review & Update tab
9. Open a document with ORCH.1 data → confirm orchestration steps display
10. Open a document with ORCH.1 warnings → confirm failed steps visible in Recommended Actions
11. Disable flag → confirm graceful degradation

---

## 21. Risks and Mitigations

| Risk | Probability | Mitigation |
|---|---|---|
| `dms_upload_sessions` has no row for older documents | High | Guard: only show ORCH.1 section if session with document_id found |
| Linked entity deleted | Medium | Null-safe entity name resolution |
| COMMON AI.1 registry import in server action | Low | Registry is server-safe TypeScript; works in server actions |
| Large missing_fields_json causes slow response | Low | Only extract labels, cap to 10 entries |
| Summary text shown for confidential document | Low | Double gate: confidentiality check at server + component level |
| Users confuse AI.2 "Generate" with actual generation | Medium | Clear "Preview only" label on field candidates; button links away to entity |

---

## 22. Implementation File Plan

### New files to create

```
src/server/actions/dms/document-understanding.ts    — server action
src/lib/dms/understanding/types.ts                  — DmsDocumentUnderstanding types
src/lib/dms/understanding/understanding-builder.ts  — health + actions computation
src/features/dms/documents/sections/dms-document-understanding-section.tsx — tab content
src/features/dms/documents/sections/understanding/  — sub-components:
  dms-understanding-health-card.tsx
  dms-understanding-identity-card.tsx
  dms-understanding-ocr-card.tsx
  dms-understanding-summary-card.tsx
  dms-understanding-extraction-card.tsx
  dms-understanding-completeness-card.tsx
  dms-understanding-risk-card.tsx
  dms-understanding-embedding-card.tsx
  dms-understanding-tags-links-card.tsx
  dms-understanding-orch-card.tsx
  dms-understanding-field-candidates-card.tsx
  dms-understanding-actions-card.tsx
```

### Modified files

```
src/features/dms/documents/dms-document-record-form.tsx  — add Understanding tab
src/lib/query/query-keys.ts   — add queryKeys.dms.documentUnderstanding(id)
src/lib/query/invalidation.ts — add invalidateDmsDocumentUnderstanding()
```

---

## 23. Exact Step-by-Step Cursor Implementation Sequence

1. Create `src/lib/dms/understanding/types.ts` — `DmsDocumentUnderstanding` + sub-types
2. Create `src/lib/dms/understanding/understanding-builder.ts` — health score + actions computation (pure functions, no DB)
3. Create `src/server/actions/dms/document-understanding.ts` — `getDmsDocumentUnderstanding()` server action
4. Add query key + invalidation helper
5. Create sub-components (health, identity, ocr, summary, extraction, completeness, risk, embedding, tags-links, orch, field-candidates, actions)
6. Create `DmsDocumentUnderstandingSection` — main tab component using TanStack Query
7. Add tab to `dms-document-record-form.tsx` section list
8. Run typecheck + build
9. Update SOT + create implementation report

---

## 24. Acceptance Criteria

```text
1. ERP_AI_DOC_UNDERSTANDING flag exists (confirmed) — no migration needed.
2. getDmsDocumentUnderstanding server action exists and returns DmsDocumentUnderstanding.
3. Flag disabled → graceful disabled message, no queries run.
4. Flag enabled → all 12 sections render correctly.
5. Confidential document (non-admin) → summary text is null/redacted.
6. Document without OCR → OCR section shows "Not extracted" + action link.
7. Document without summary → summary section shows "Not generated" + action link.
8. Health score computed correctly (0-100).
9. Recommended actions populated based on actual document state.
10. Field candidates show COMMON AI.1 registry fields for linked company/party.
11. ORCH.1 steps displayed if session data available.
12. No raw OCR/content_text/prompt/AI response in UI or server response.
13. All 17 existing document record tabs remain unchanged.
14. Understanding tab placed correctly (after AI Analysis, before Approvals).
15. TypeScript/build pass.
16. SOT updated.
17. Implementation report created.
```

---

## 25. Rollback Plan

1. Disable `ERP_AI_DOC_UNDERSTANDING` flag → Understanding tab shows disabled message or hides content
2. Remove tab from section list in `dms-document-record-form.tsx`
3. All existing DMS tabs remain functional — AI.2 is purely additive
4. No DB changes to roll back

---

## 26. Handoff Summary

### Key decisions for Sameer/ChatGPT approval

| Decision | Recommended | Alternative |
|---|---|---|
| Implementation phases | One phase | Split into 1 (server) + 2 (UI) |
| New DB table | No — live aggregation | Yes — snapshot cache table |
| New feature flag | No — use `ERP_AI_DOC_UNDERSTANDING` | Yes — new flag |
| Field candidates | Preview only, link to entity | Generate suggestions in place |
| Summary for confidential | Redacted (existing rule preserved) | Show all for any authenticated user |
| Tab placement | After AI Analysis, before Approvals | After Ask AI |
| Orchestration section | Only if session data exists | Always show (empty state) |

### Questions for Sameer

1. Should Understanding tab be visible but disabled when flag=off, or completely hidden?
2. Should the field candidates section allow triggering `generateAiFieldSuggestions` from within AI.2?
3. Should there be a dedicated `/dms/documents/[id]/understanding` route in addition to the tab?
4. Is snapshot caching required from Day 1 (e.g. for compliance audit purposes)?

---

**End of Plan**

# ERP COMMON AI.3 — AI Duplicate / Conflict Detection Plan

**Phase:** ERP COMMON AI.3 — Planning  
**Date:** 2026-06-17  
**Status:** PLAN ONLY — not implemented  
**Basis:** Deep audit of existing duplicate logic, live DB schema, Common AI.1/AI.2 foundations, and COMMON AI.0 permissions.

> **PLAN ONLY — No source files changed. No migrations applied. No flags enabled.**

---

## 1. Executive Summary

**Goal:** Build a safe, review-based AI.3 system that detects duplicate ERP records (parties, organizations, branches, work sites), duplicate DMS documents, wrong document links, and field value conflicts between ERP records and linked DMS document content.

**Core principle:** Create review candidates only — no automatic merge, update, delete, or unlink.

**Architecture:** Two-tier detection — deterministic rules first (fast, free, high confidence), AI-assisted rules second (for name similarity, Arabic/English variants, cross-entity content conflicts). All candidates stored in `erp_ai_duplicate_candidates`. Review via admin UI at `/admin/ai/duplicates`.

**Key findings from audit:**
- `ERP_AI_DUPLICATE_DETECT` flag already exists (`false`)
- `ai.duplicates.view` and `ai.duplicates.review` permissions already exist
- `detectPartyDuplicates` server action already exists (inline form-time check only, no persistent storage)
- `detect_possible_party_duplicates` DB RPC exists (party name/email/phone)
- `erp_ai_duplicate_candidates` table does NOT exist — migration required
- `party_licenses.license_number` exists; `party_licenses.dms_license_document_id` exists (DMS link)
- `party_bank_details.iban` exists; `party_contacts.email` / `phone` exist

---

## 2. Current Duplicate/Conflict Capability Inventory

### Existing duplicate logic

| Capability | Location | Type | Scope | Gap |
|---|---|---|---|---|
| Party duplicate on create | `detectPartyDuplicates()` in `parties.ts` | Deterministic (RPC) | Name + email + phone only | No persistent storage; form-only; no TRN/IBAN/license check |
| DMS file hash duplicate | `dms_upload_sessions.sha256_hash` | Deterministic | Exact file content match | Only checked during upload — no cross-document scan |
| DMS AI link suggestions | `dms_ai_link_suggestions` | AI-assisted | Document → party matching | Pending state, manual accept — not stored as duplicate candidate |
| COMMON AI.1 `conflict_detected` | `erp_ai_field_suggestions.suggestion_type` | AI-assisted | Per-field conflict | Only created during generation; no cross-record comparison |
| IBAN on bank details | Upload warning only | Form-time | Single party | No stored cross-party IBAN duplicate scan |

### Gaps

- No persistent duplicate candidate storage
- No organization/branch/site duplicate detection
- No DMS document-to-ERP field conflict detection
- No cross-entity DMS link validation
- No admin review UI for duplicates
- No scheduled or on-demand full scan
- No record-level duplicate warnings

---

## 3. Current App and DB Audit Findings

### Existing RPC function

`detect_possible_party_duplicates(p_legal_name_en, p_trade_name_en, p_main_email, p_main_mobile, p_main_phone, p_trn, p_license_number, p_iban, p_website, p_exclude_party_id)` — exists in DB, supports TRN, license, IBAN parameters (though these aren't all used in the current server action). This can be leveraged for AI.3 party duplicate scanning.

### Party child tables available for matching

| Table | Key fields | Used in AI.3 |
|---|---|---|
| `party_tax_registrations` | `party_id`, `trn` | Same-TRN duplicate detection |
| `party_licenses` | `party_id`, `license_number`, `expiry_date`, `dms_license_document_id` | Same-license duplicate + expiry conflict |
| `party_bank_details` | `party_id`, `iban`, `bank_id` | Same-IBAN duplicate |
| `party_contacts` | `party_id`, `email`, `phone` | Same-email/phone detection |

### DMS tables available for conflict detection

| Table | Key fields | Used in AI.3 |
|---|---|---|
| `dms_document_links` | `document_id`, `entity_type`, `entity_id`, `is_primary` | Multi-entity link conflicts |
| `dms_upload_sessions` | `sha256_hash`, `document_id` | File hash duplicate |
| `dms_ai_extraction_results` | `document_id`, `classification_score`, `suggested_title` | AI-extracted entity name conflict |
| `dms_documents` | `document_no`, `title`, `expiry_date`, `ai_summary` | Document duplicate detection |

---

## 4. Scope for AI.3 v1

### In scope

| Entity | Detection types |
|---|---|
| `party` | Duplicate name, TRN, license number, IBAN, email/phone; field conflict with DMS |
| `company` (owner_companies) | Duplicate trade name; field conflict with linked trade license |
| `branch` | Duplicate license reference |
| `site` | Duplicate site name/address |
| `dms_document` | Duplicate file hash; same document linked to conflicting entities; document-to-ERP field conflicts |

### Included detection methods

- Deterministic: exact match on TRN, IBAN, license number, email, SHA256 hash
- Deterministic: normalized name match (case-insensitive, trim, collapse spaces)
- Deterministic: DMS document linked to 2+ companies/parties simultaneously
- Deterministic: expiry date conflict between `party_licenses.expiry_date` and linked DMS `expiry_date`
- AI-assisted: name similarity with Arabic/English variants (for party/company names)
- AI-assisted: DMS AI extracted entity name vs. linked entity name mismatch

---

## 5. Out of Scope / Deferred Entities

| Entity | Reason deferred |
|---|---|
| Employee | HR module not yet implemented |
| Vehicle / Equipment | Fleet module not yet implemented |
| Workshop / Inventory | Not implemented |
| Finance / Projects / HSE | Not implemented |
| Automatic merge | Never in v1 |
| Merge wizard | Deferred to v2 |
| Auto-unlink | Never in v1 |
| Bulk fix tools | Deferred to v2 |

---

## 6. Detection Types and Candidate Taxonomy

### Detection type codes

| Type Code | Description | Detection method | Confidence |
|---|---|---|---|
| `duplicate_party_trn` | Two parties share same TRN | Deterministic | 1.00 |
| `duplicate_party_iban` | Two parties share same IBAN | Deterministic | 1.00 |
| `duplicate_party_license` | Two parties share same license number | Deterministic | 1.00 |
| `duplicate_party_email` | Two parties share same primary email | Deterministic | 0.90 |
| `duplicate_party_name` | Two parties have same/similar normalized name | Deterministic + AI | 0.70–1.00 |
| `duplicate_company_name` | Two owner_companies share same trade name | Deterministic | 0.95 |
| `duplicate_branch_license` | Two branches share same trade_license_branch_ref | Deterministic | 1.00 |
| `duplicate_site_name` | Two work sites share same name in same emirate/area | Deterministic | 0.85 |
| `duplicate_document_hash` | Two DMS documents have same file SHA256 | Deterministic | 1.00 |
| `duplicate_document_link` | Same DMS document linked to 2+ unrelated entities | Deterministic | 0.95 |
| `conflict_license_expiry` | party_licenses.expiry_date ≠ linked DMS document expiry_date | Deterministic | 0.95 |
| `conflict_trn_value` | party_tax_registrations.trn ≠ TRN in linked DMS document | Deterministic | 0.90 |
| `conflict_company_name` | DMS AI extracted entity name ≠ linked company/party name | AI-assisted | 0.60–0.95 |
| `wrong_document_link` | DMS document linked to entity but AI summary mentions different entity | AI-assisted | 0.60–0.90 |
| `similar_name` | Two records share similar-sounding Arabic/English name variants | AI-assisted | 0.60–0.85 |

### Candidate key design (deduplication)

Each candidate gets a deterministic `candidate_key`:

```
{candidate_type}:{entity_type_a}:{entity_id_a}:{entity_type_b or doc}:{entity_id_b or doc_id}:{conflict_field?}
```

Examples:
- `duplicate_party_trn:party:12:party:45`
- `conflict_license_expiry:party:12:dms_document:88:expiry_date`
- `duplicate_document_hash:dms_document:30:dms_document:51`

This key is stored and indexed to prevent re-inserting already-known candidates on re-scan.

---

## 7. Deterministic Detection Rules

### Rule 1: Same TRN across parties

```sql
SELECT a.id AS entity_id_a, b.id AS entity_id_b
FROM party_tax_registrations a
JOIN party_tax_registrations b ON a.trn = b.trn AND a.id < b.id
JOIN parties pa ON pa.id = a.party_id AND pa.deleted_at IS NULL
JOIN parties pb ON pb.id = b.party_id AND pb.deleted_at IS NULL
WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL AND a.trn IS NOT NULL AND a.trn != '';
```

Confidence: 1.00. Evidence: TRN value (safe — business registration number, not personal).

### Rule 2: Same IBAN across parties

```sql
SELECT a.party_id AS entity_id_a, b.party_id AS entity_id_b, a.iban
FROM party_bank_details a
JOIN party_bank_details b ON a.iban = b.iban AND a.party_id < b.party_id
WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL AND a.iban IS NOT NULL;
```

Confidence: 1.00. Evidence: masked IBAN (show first 4 + last 4 chars only — never full IBAN in log).

### Rule 3: Same license number across parties

```sql
SELECT a.party_id, b.party_id, a.license_number
FROM party_licenses a
JOIN party_licenses b ON LOWER(TRIM(a.license_number)) = LOWER(TRIM(b.license_number)) AND a.party_id < b.party_id
WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL AND a.license_number IS NOT NULL;
```

Confidence: 1.00.

### Rule 4: Same trade name across owner_companies

```sql
SELECT a.id, b.id, a.trade_name
FROM owner_companies a
JOIN owner_companies b ON LOWER(REGEXP_REPLACE(TRIM(a.trade_name), '\s+', ' ', 'g')) =
                          LOWER(REGEXP_REPLACE(TRIM(b.trade_name), '\s+', ' ', 'g')) AND a.id < b.id
WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL AND a.trade_name IS NOT NULL AND a.trade_name != '';
```

Confidence: 0.95.

### Rule 5: Same normalized party display_name

```sql
SELECT a.id, b.id, a.display_name
FROM parties a
JOIN parties b ON LOWER(REGEXP_REPLACE(TRIM(a.display_name), '\s+', ' ', 'g')) =
                  LOWER(REGEXP_REPLACE(TRIM(b.display_name), '\s+', ' ', 'g')) AND a.id < b.id
WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL AND a.display_name IS NOT NULL;
```

Confidence: 0.90.

### Rule 6: Same branch license reference

```sql
SELECT a.id, b.id, a.trade_license_branch_ref
FROM branches a
JOIN branches b ON LOWER(TRIM(a.trade_license_branch_ref)) = LOWER(TRIM(b.trade_license_branch_ref)) AND a.id < b.id
WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL AND a.trade_license_branch_ref IS NOT NULL;
```

Confidence: 1.00.

### Rule 7: DMS document file hash duplicates

```sql
SELECT a.document_id, b.document_id
FROM dms_upload_sessions a
JOIN dms_upload_sessions b ON a.sha256_hash = b.sha256_hash AND a.document_id < b.document_id
WHERE a.sha256_hash IS NOT NULL AND a.document_id IS NOT NULL AND b.document_id IS NOT NULL
  AND a.deleted_at IS NULL AND b.deleted_at IS NULL;
```

Confidence: 1.00. Evidence: SHA256 hash.

### Rule 8: DMS document linked to 2+ unrelated entities

```sql
SELECT document_id, ARRAY_AGG(entity_type || ':' || entity_id) AS linked_entities
FROM dms_document_links
WHERE deleted_at IS NULL
GROUP BY document_id
HAVING COUNT(DISTINCT entity_type || ':' || entity_id) >= 2
  AND COUNT(DISTINCT entity_type) >= 2;  -- different entity types (not just primary vs secondary for same entity)
```

Confidence: 0.95. Review whether all links are intentional.

### Rule 9: Party license expiry vs DMS document expiry conflict

```sql
SELECT pl.party_id, pl.expiry_date AS erp_expiry, d.expiry_date AS dms_expiry, d.id AS document_id
FROM party_licenses pl
JOIN dms_document_links dl ON dl.entity_type = 'party' AND dl.entity_id = pl.party_id
JOIN dms_documents d ON d.id = dl.document_id
JOIN dms_document_types dt ON dt.id = d.document_type_id AND dt.type_code IN ('TRADE_LICENSE', 'LICENSE')
WHERE pl.deleted_at IS NULL AND d.deleted_at IS NULL AND dl.deleted_at IS NULL
  AND pl.expiry_date IS NOT NULL AND d.expiry_date IS NOT NULL
  AND pl.expiry_date != d.expiry_date
  AND ABS(pl.expiry_date - d.expiry_date) > 30;  -- allow 30-day buffer
```

Confidence: 0.90. Evidence: both dates shown for comparison (safe business data).

---

## 8. AI-Assisted Detection Rules

### AI Rule A: Arabic/English name similarity

Used when deterministic match is insufficient (e.g., "Mohammed Ahmed Trading" vs "محمد أحمد للتجارة").

**Implementation:**
1. Prefilter candidates from deterministic scan (same first 3 chars, or trigram similarity > 0.5)
2. For filtered candidates, call `getDmsAiProvider().callStructuredCompletion()` with prompt:
   - Input: name_a, name_b, optional context (type, location)
   - Output: `{ are_same_entity: boolean, confidence: 0-1, reason: string }`
3. Zod validate output
4. Create candidate if `confidence >= 0.7`

**Cost control:** Only run after deterministic prefilter narrows scope. Cap to 50 AI calls per scan run.

**No prompt/response logging.**

### AI Rule B: DMS extracted entity name vs. linked entity name mismatch

**Implementation:**
1. For each DMS document with `dms_document_links` (entity_type ∈ company/party) AND `ai_summary_status = complete`:
2. Load entity display name from linked entity
3. Check if AI summary mentions a significantly different entity name
4. If `dms_ai_extraction_results.classification_reason` contains an entity name that doesn't match linked entity → create candidate
5. Confidence scoring from extraction confidence

**Scope:** Only documents with completed AI analysis and single primary link.

---

## 9. Candidate Data Model

### `erp_ai_duplicate_candidates`

```sql
CREATE TABLE public.erp_ai_duplicate_candidates (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Detection classification
  candidate_type       TEXT NOT NULL,          -- type code from taxonomy
  detection_method     TEXT NOT NULL,          -- 'deterministic' | 'ai' | 'hybrid'
  candidate_key        TEXT NOT NULL,          -- deduplication key (UNIQUE where pending)

  -- Primary entity (always present)
  entity_type_a        TEXT NOT NULL,          -- company | party | branch | site | dms_document
  entity_id_a          BIGINT NOT NULL,

  -- Secondary entity (may be null for doc-only candidates)
  entity_type_b        TEXT,
  entity_id_b          BIGINT,

  -- Evidence (safe business metadata)
  conflict_field       TEXT,                   -- which field conflicts
  value_a              TEXT,                   -- safe sanitized value from entity A
  value_b              TEXT,                   -- safe sanitized value from entity B
  confidence_score     NUMERIC(5,4) NOT NULL DEFAULT 0.80,
  evidence_json        JSONB,                  -- safe metadata: doc IDs, field codes, labels
  ai_reason            TEXT,                   -- safe AI reason (no OCR/prompts)

  -- Source DMS reference (optional)
  source_document_id   BIGINT REFERENCES public.dms_documents(id) ON DELETE SET NULL,

  -- Lifecycle
  status               TEXT NOT NULL DEFAULT 'pending',
  review_decision      TEXT,                   -- confirmed_duplicate | confirmed_conflict | not_duplicate | needs_more_review | ignored
  review_notes         TEXT,

  -- Human tracking
  reviewed_by          BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  reviewed_at          TIMESTAMPTZ,
  resolved_by          BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  resolved_at          TIMESTAMPTZ,

  -- Audit
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by           BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  deleted_at           TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT erp_ai_dup_type_chk CHECK (candidate_type IN (
    'duplicate_party_trn', 'duplicate_party_iban', 'duplicate_party_license',
    'duplicate_party_email', 'duplicate_party_name',
    'duplicate_company_name', 'duplicate_branch_license', 'duplicate_site_name',
    'duplicate_document_hash', 'duplicate_document_link',
    'conflict_license_expiry', 'conflict_trn_value',
    'conflict_company_name', 'wrong_document_link', 'similar_name'
  )),
  CONSTRAINT erp_ai_dup_method_chk CHECK (detection_method IN ('deterministic', 'ai', 'hybrid')),
  CONSTRAINT erp_ai_dup_status_chk CHECK (status IN (
    'pending', 'reviewed', 'confirmed_duplicate', 'confirmed_conflict',
    'ignored', 'resolved', 'superseded', 'failed'
  )),
  CONSTRAINT erp_ai_dup_confidence_chk CHECK (confidence_score >= 0 AND confidence_score <= 1)
);
```

### Indexes

```sql
CREATE INDEX idx_erp_ai_dup_candidates_status ON erp_ai_duplicate_candidates(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_erp_ai_dup_candidates_entity_a ON erp_ai_duplicate_candidates(entity_type_a, entity_id_a) WHERE deleted_at IS NULL;
CREATE INDEX idx_erp_ai_dup_candidates_entity_b ON erp_ai_duplicate_candidates(entity_type_b, entity_id_b) WHERE entity_type_b IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_erp_ai_dup_candidates_type ON erp_ai_duplicate_candidates(candidate_type, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_erp_ai_dup_candidates_doc ON erp_ai_duplicate_candidates(source_document_id) WHERE source_document_id IS NOT NULL AND deleted_at IS NULL;

-- Unique pending candidates per key (prevents duplicate detection creating duplicate records)
CREATE UNIQUE INDEX uq_erp_ai_dup_candidates_pending_key
  ON erp_ai_duplicate_candidates(candidate_key)
  WHERE status = 'pending' AND deleted_at IS NULL;
```

### Event table recommendation

**Verdict: Include in v1 as append-only audit trail.**

`erp_ai_duplicate_candidate_events` — lean table:

```sql
CREATE TABLE public.erp_ai_duplicate_candidate_events (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  candidate_id    BIGINT NOT NULL REFERENCES public.erp_ai_duplicate_candidates(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL CHECK (event_type IN ('detected','reviewed','confirmed','ignored','resolved','superseded')),
  event_data_json JSONB,                        -- safe metadata only
  actor_user_id   BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_erp_ai_dup_events_candidate ON erp_ai_duplicate_candidate_events(candidate_id);
```

**Rationale:** Audit trail is important for compliance (knowing who reviewed a duplicate and when). The standard `audit_logs` table could hold this but the specialized events table is cleaner and consistent with `erp_ai_field_suggestion_events`.

---

## 10. Candidate Status Lifecycle

```
pending ──→ reviewed ──→ confirmed_duplicate
         │           ──→ confirmed_conflict
         │           ──→ not_duplicate
         │           ──→ needs_more_review ──→ reviewed (loop)
         │           ──→ ignored
         │           ──→ resolved
pending ──→ superseded (when re-scan produces same key with new data)
pending ──→ failed (scan error)
```

**Resolution types** (stored in `review_decision`):
- `confirmed_duplicate` — user confirms these are duplicates
- `confirmed_conflict` — user confirms this is a real field conflict
- `not_duplicate` — user confirms false positive
- `ignored` — acknowledged but not acting on it
- `needs_more_review` — requires additional information
- `resolved` — action was taken (documented in notes), record kept for audit

---

## 11. Database Impact Review

### New tables required

1. `erp_ai_duplicate_candidates` — **Required for v1**
2. `erp_ai_duplicate_candidate_events` — **Recommended for v1** (audit trail)

### Tables read only (no schema changes)

- `parties`, `party_licenses`, `party_tax_registrations`, `party_bank_details`, `party_contacts`
- `owner_companies`, `branches`, `work_sites`
- `dms_documents`, `dms_document_links`, `dms_upload_sessions`
- `dms_ai_extraction_results`, `erp_ai_field_suggestions`

### Existing DB function reusable

`detect_possible_party_duplicates` RPC — can be called from batch scan for party duplicate detection. Wraps deterministic rules in SQL.

---

## 12. SQL Review — Recommended / Optional

See: `implementation_Review/sql_review/ERP_COMMON_AI_3_OPTIONAL_MIGRATION_REVIEW.sql`

Migration required (new tables).

---

## 13. RLS / Permission / Confidentiality Design

### Permissions (already seeded by COMMON AI.0)

- `ai.duplicates.view` — view candidates list and details
- `ai.duplicates.review` — change status, add review decision
- `ai.common.admin` — scan, bulk operations, supersede

### RLS for `erp_ai_duplicate_candidates`

**SELECT:** User has `ai.duplicates.view` AND (entity_a or entity_b is viewable by user). For simplicity in v1: any user with `ai.duplicates.view` can see all non-deleted candidates.

**INSERT:** `ai.common.admin` or `system_admin` only (scan creates records).

**UPDATE:** `ai.duplicates.review` or `ai.common.admin` (for status changes).

**DELETE:** No hard delete — soft delete via `deleted_at`, admin only.

### Confidentiality for DMS evidence

When displaying DMS document evidence in the review UI:
- hr/legal/executive documents: show document title and type only; redact AI summary for non-admin
- Safe evidence fields: document_no, title, type code, entity names, dates

---

## 14. Server Action Design

**File to create:** `src/server/actions/ai/common/duplicate-detection.ts`

### Actions

```typescript
// Run a full duplicate scan (all entities, all deterministic rules + optional AI)
scanForDuplicates(input: { scope?: 'all' | 'entity_type'; entityType?: string; dryRun?: boolean; limit?: number }): Promise<ActionResult<ScanResult>>

// Scan duplicates for a single entity
scanDuplicateCandidatesForEntity(input: { entityType: string; entityId: number }): Promise<ActionResult<ScanResult>>

// Read candidate list with filters
getDuplicateCandidates(input: { status?: string; candidateType?: string; entityType?: string; limit?: number; offset?: number }): Promise<ActionResult<DuplicateCandidateRow[]>>

// Read single candidate detail
getDuplicateCandidateDetail(input: { candidateId: number }): Promise<ActionResult<DuplicateCandidateDetail>>

// Change candidate status (review decision)
reviewDuplicateCandidate(input: { candidateId: number; decision: string; notes?: string }): Promise<ActionResult>

// Mark candidate resolved (after manual action taken)
markDuplicateCandidateResolved(input: { candidateId: number; notes?: string }): Promise<ActionResult>

// Ignore candidate (false positive)
ignoreDuplicateCandidate(input: { candidateId: number; notes?: string }): Promise<ActionResult>

// Supersede old pending candidates (before inserting new scan results)
supersedeDuplicateCandidates(input: { entityType?: string; entityId?: number }): Promise<ActionResult<{ supersededCount: number }>>
```

### Permission pattern for each

```typescript
getAuthContext() → hasPermission() → flagCheck(ERP_AI_DUPLICATE_DETECT) → Zod validate → business logic → logAudit() → revalidatePath()
```

---

## 15. Detection Engine Design

**File to create:** `src/lib/ai/common/duplicate-detection/`

```
types.ts                    — candidate types, scan result types
deterministic-rules.ts      — all deterministic SQL-based detection functions
ai-rules.ts                 — AI-assisted detection (name similarity, content conflict)
candidate-builder.ts        — build + upsert candidates, candidate key generation
scan-engine.ts              — orchestrate full or scoped scan
```

### Scan engine flow

```
scanForDuplicates()
  ↓
1. Supersede old pending candidates in scope (if not dry-run)
2. Run deterministic rules (SQL-based, no AI cost):
   - party TRN duplicates
   - party IBAN duplicates
   - party license duplicates
   - party name duplicates
   - company name duplicates
   - branch license ref duplicates
   - document hash duplicates
   - multi-entity document links
   - expiry date conflicts
3. For each deterministic result → build candidate_key → upsert candidate
4. Run AI-assisted rules (if ERP_AI_DUPLICATE_DETECT flag on AND provider configured):
   - Name similarity (prefiltered by trigram > 0.5)
   - DMS entity name mismatch (for docs with completed AI analysis)
5. Return scan summary: detected_count, skipped_existing, ai_calls_made
```

---

## 16. Review UI Design

### Route recommendation

**`/admin/ai/duplicates`** — dedicated admin duplicate management page

Rationale: This is cross-module (parties, companies, DMS) and belongs at admin-level, not under `/admin/dms/`. Consistent with `/admin/ai/*` namespace for Common AI features.

### UI components

```
src/app/(protected)/admin/ai/duplicates/page.tsx              — page (server component)
src/features/ai/common/duplicate-detection/                   — feature folder
  duplicate-candidates-page-client.tsx                        — main client component
  duplicate-candidate-list.tsx                                — filterable list with status/type filters
  duplicate-candidate-detail.tsx                              — side-by-side comparison panel
  duplicate-candidate-action-bar.tsx                          — Confirm / Ignore / Resolve / Open Record
  duplicate-candidate-evidence-card.tsx                       — safe evidence display
  duplicate-candidate-status-badge.tsx                        — status badges
  duplicate-candidate-type-badge.tsx                          — type badges
  duplicate-scan-card.tsx                                     — "Run Scan" button + progress
  index.ts                                                    — barrel
```

### UI features

- Filters: status, candidate_type, entity_type_a, confidence range
- Side-by-side comparison: field-by-field comparison of entity A vs entity B
- Evidence: source document title/type/number (no raw OCR/AI response)
- Action buttons: Confirm Duplicate | Confirm Conflict | Not a Duplicate | Ignore | Mark Resolved
- **No Merge button in v1**
- Scan controls: Run Full Scan / Scan Entity Type / Dry Run mode
- Count cards: Total Pending, High Confidence (>0.9), Confirmed, Ignored

---

## 17. Record-Level Alert Design

### Where to show duplicate warnings

| Location | When | What to show |
|---|---|---|
| Party record (Overview section) | Pending duplicate candidates exist for this party | Small amber badge "N duplicate candidate(s)" + link to `/admin/ai/duplicates?entity=party:id` |
| Organization record (Overview) | Pending candidates for this company | Same pattern |
| DMS document record → Understanding tab (AI.2) | Pending wrong_document_link or conflict candidates for this document | Card in Recommended Actions + link |
| DMS document record → Links section | Multiple entity links detected | Inline warning |

### Implementation approach

- Record-level alert: add one server action `getDuplicateCandidateCountForEntity(entityType, entityId)` — reads pending count only (fast)
- Called from Overview section of record forms when count > 0
- Small async component — does not block main form load

---

## 18. Integration with DMS AI.2 Understanding Center

AI.3 integrates with AI.2:

1. The Understanding tab already has a "Recommended Actions" section
2. AI.3 adds a new data source to `getDmsDocumentUnderstanding()`:
   - Load pending duplicate candidates where `source_document_id = documentId` OR `entity_id_a` = linked entity
   - If count > 0: add to `actions` list with high priority: "N duplicate/conflict candidate(s) detected"
3. AI.2 Understanding section shows a "Conflicts & Duplicates" status line in the health card

**No new tab or page needed for AI.2 integration** — just additional data in the existing understanding view model.

---

## 19. Integration with COMMON AI.1 Field Suggestions

AI.3 uses COMMON AI.1 `conflict_detected` suggestion type:

- When `erp_ai_field_suggestions.suggestion_type = 'conflict_detected'`, AI.3 can surface this as a `conflict_company_name` or similar candidate
- AI.3 reads existing field suggestions — does not create new ones
- When AI.3 detects a conflict and COMMON AI.1 has a related pending suggestion, AI.3 evidence_json includes the suggestion_id for cross-reference

---

## 20. Feature Flag Design

### `ERP_AI_DUPLICATE_DETECT` (already seeded, `is_enabled = false`)

When OFF:
- `scanForDuplicates` returns controlled "feature disabled" error
- Review UI shows disabled message
- Record-level alerts still show existing candidates (if any from previous runs)
- `getDuplicateCandidates` still works for review of already-detected candidates

When ON:
- Full scan available
- AI-assisted rules run (if AI provider configured)
- Record-level scanning on entity save (optional future)

---

## 21. Audit and Logging Design

### Allowed safe metadata in logs and events

- entity_type, entity_id, candidate_type, detection_method
- confidence_score, candidate_key
- review_decision, review_notes (user's own text)
- scan summary: count_detected, count_skipped, count_ai_calls

### Never logged

- Raw OCR text
- content_text body
- Prompt text
- Raw AI response
- Full IBAN (masked only: first4 + last4)
- Full TRN (business number — generally safe but treat as sensitive)

### Audit events (in `erp_ai_duplicate_candidate_events`)

- `detected` — created during scan
- `reviewed` — human reviewed
- `confirmed` — human confirmed as duplicate/conflict
- `ignored` — human marked as not actionable
- `resolved` — human resolved (took action)
- `superseded` — replaced by re-scan

---

## 22. Performance and Cost Control

### Deterministic rules — zero AI cost

Run in SQL — fast, no API calls. Batch 100 records at a time. Total deterministic scan for typical ERP (<1000 parties, <100 companies): <5 seconds.

### AI-assisted rules — controlled cost

- Only run after deterministic prefilter narrows candidates
- Max 50 AI calls per scan run (configurable)
- Skip if `ERP_AI_DUPLICATE_DETECT` disabled
- Skip if AI provider not configured
- Use `callStructuredCompletion` with temperature=0, max tokens=200

### Estimated cost per full scan

Deterministic only: $0.00  
AI name similarity (50 candidates): ~$0.05 (negligible)  
AI content conflict (10 documents): ~$0.10  
**Total typical scan: < $0.20**

---

## 23. Error Handling and Idempotency

### Candidate deduplication

`candidate_key` + unique partial index (`WHERE status = 'pending'`) prevents duplicates on re-scan. If a candidate already exists with status `pending`, the scan skips insertion.

### Supersede before re-scan

Before inserting new candidates for a scope, run `supersedeDuplicateCandidates()` — changes pending to `superseded` so re-scan gets fresh pending list. Superseded records are retained for audit.

### Failed scan steps

Individual detection rule failures are logged with `status = 'failed'` on the scan summary. Failed rules do not abort the full scan — deterministic rules run independently.

---

## 24. Testing and UAT Plan

### Pre-UAT (source-level)

1. TypeScript/build pass
2. `scanForDuplicates` with `dryRun=true` returns candidates without inserting
3. Flag disabled → controlled "feature disabled" response
4. No raw sensitive content in candidate records

### UAT scenarios

| Scenario | Setup | Expected |
|---|---|---|
| Two parties same TRN | Create 2 party_tax_registration rows with same TRN | `duplicate_party_trn` candidate created |
| Two parties similar Arabic name | Create 2 parties with Arabic/English name variants | `similar_name` candidate created (AI) |
| Same DMS doc linked to 2 parties | Link one document to 2 different party entities | `duplicate_document_link` candidate created |
| Trade license expiry mismatch | party_licenses.expiry_date ≠ linked DMS document expiry | `conflict_license_expiry` candidate created |
| Duplicate file upload | Upload same file twice | `duplicate_document_hash` candidate created |
| Ignore candidate | Reviewer clicks Ignore | Status → ignored, event logged |
| Confirm candidate | Reviewer clicks Confirm Duplicate | Status → confirmed_duplicate, audit logged |
| Resolve candidate | After manual fix, click Resolve | Status → resolved |
| Non-admin confidential doc | Reviewer sees candidate for hr doc | Document title visible, summary redacted |
| Permissions test | user without ai.duplicates.view | Access denied |
| Re-scan | Run scan twice | Old pending superseded, new pending created |

---

## 25. Risks and Mitigations

| Risk | Probability | Mitigation |
|---|---|---|
| High false positive rate for name similarity | Medium | Use confidence threshold ≥ 0.70; let users ignore easily |
| Arabic name similarity requires careful prompt | Medium | Explicitly test with UAE name variants in UAT |
| TRN uniqueness assumption wrong (one party multiple TRNs) | Low | TRN per party_tax_registrations row — compare across parties only |
| IBAN false positive (shared business account) | Low | Flag as "review" not "confirmed duplicate"; let user decide |
| Large party DB makes scan slow | Low | Batch scan with pagination; index on TRN/license fields |
| AI provider not configured — AI rules skip silently | Low | Show "AI rules skipped — provider not configured" in scan summary |

---

## 26. Implementation File Plan

### New files to create

```
src/lib/ai/common/duplicate-detection/types.ts
src/lib/ai/common/duplicate-detection/candidate-builder.ts
src/lib/ai/common/duplicate-detection/deterministic-rules.ts
src/lib/ai/common/duplicate-detection/ai-rules.ts
src/lib/ai/common/duplicate-detection/scan-engine.ts

src/server/actions/ai/common/duplicate-detection.ts

src/features/ai/common/duplicate-detection/duplicate-candidates-page-client.tsx
src/features/ai/common/duplicate-detection/duplicate-candidate-list.tsx
src/features/ai/common/duplicate-detection/duplicate-candidate-detail.tsx
src/features/ai/common/duplicate-detection/duplicate-candidate-action-bar.tsx
src/features/ai/common/duplicate-detection/duplicate-candidate-status-badge.tsx
src/features/ai/common/duplicate-detection/duplicate-candidate-type-badge.tsx
src/features/ai/common/duplicate-detection/duplicate-scan-card.tsx
src/features/ai/common/duplicate-detection/index.ts

src/app/(protected)/admin/ai/duplicates/page.tsx
```

### Modified files

```
src/lib/query/query-keys.ts           — add ai.duplicateCandidates keys
src/lib/query/invalidation.ts         — add invalidateDuplicateCandidates()
src/server/actions/dms/document-understanding.ts  — add duplicate count to understanding
src/features/organizations/organization-workspace-form.tsx  — add record-level alert
src/features/master-data/parties/party-workspace-form.tsx   — add record-level alert
src/app/(protected)/admin/ai/ (new route group)
```

### DB migration

```
supabase/migrations/<timestamp>_erp_common_ai_3_duplicate_candidates.sql
```

---

## 27. Exact Step-by-Step Cursor Implementation Sequence

1. Create and apply DB migration (erp_ai_duplicate_candidates + events tables, RLS, indexes)
2. Create `src/lib/ai/common/duplicate-detection/types.ts`
3. Create `candidate-builder.ts` (candidate_key generator + upsert helper)
4. Create `deterministic-rules.ts` (all 9 deterministic SQL-based detection functions)
5. Create `ai-rules.ts` (name similarity + content conflict, using getDmsAiProvider)
6. Create `scan-engine.ts` (orchestrates full scan + scoped scan)
7. Create `src/server/actions/ai/common/duplicate-detection.ts` (7 server actions)
8. Add query keys + invalidation helpers
9. Create admin page + UI components
10. Add sidebar link: "AI Duplicates" under Admin
11. Add record-level duplicate alert to Organization form
12. Add record-level duplicate alert to Party form
13. Update `getDmsDocumentUnderstanding` to include duplicate candidate count
14. Run typecheck + build
15. Update SOT + create implementation report

---

## 28. Acceptance Criteria

```text
1. erp_ai_duplicate_candidates table exists with BIGINT PK, constraints, indexes, RLS ENABLED+FORCED.
2. erp_ai_duplicate_candidate_events table exists (append-only, RLS).
3. ERP_AI_DUPLICATE_DETECT flag exists (already confirmed) and is false by default.
4. ai.duplicates.view + ai.duplicates.review permissions exist (already confirmed).
5. scanForDuplicates() runs deterministic rules without AI cost.
6. Deterministic rules detect: TRN, IBAN, license number, company/party name, branch license, document hash, multi-entity links, expiry conflicts.
7. AI-assisted rules run only when flag enabled + provider configured + prefilter applied.
8. candidate_key prevents duplicate pending candidates on re-scan.
9. supersedeDuplicateCandidates() supersedes pending before re-scan.
10. Admin review UI exists at /admin/ai/duplicates.
11. Review actions: Confirm, Ignore, Resolve, Not a Duplicate.
12. No auto-merge, auto-delete, auto-unlink, or auto-update.
13. Record-level alert on Organization and Party forms.
14. AI.2 Understanding tab shows duplicate candidate count.
15. Confidential document evidence redacted for non-admin.
16. No raw OCR/content_text/prompt/AI response logged or displayed.
17. SOT updated.
18. Implementation report created.
19. TypeScript/build pass.
```

---

## 29. Rollback Plan

1. Disable `ERP_AI_DUPLICATE_DETECT` flag → scan stops; review UI shows disabled message
2. Remove admin route from sidebar
3. `erp_ai_duplicate_candidates` table can remain (data preserved, not displayed)
4. No writes to existing party/DMS tables → no rollback of data changes needed
5. Record-level alert component shows nothing if no candidates

---

## 30. Handoff Summary

### Key decisions for Sameer/ChatGPT approval

| Decision | Recommended | Alternative |
|---|---|---|
| One-phase implementation | Yes | Split DB + logic + UI |
| New candidate table | Yes — required | Use existing audit_logs |
| Event table | Yes — v1 | Defer to v2 |
| Admin UI route | /admin/ai/duplicates | /admin/dms/intelligence/duplicates |
| AI-assisted rules in v1 | Yes — name similarity + content conflict | Deterministic only |
| Record-level alerts | Yes — Organization + Party | Defer to v2 |
| AI.2 integration | Yes — add count to Understanding | Separate feature |
| Max AI calls per scan | 50 | Configurable parameter |

---

**End of Plan**

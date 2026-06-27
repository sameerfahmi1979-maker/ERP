# ERP DMS AI Phase 17 — Apply Correction Proposal Plan

**Phase**: ERP DMS AI Phase 17 — Apply Correction Proposal  
**Plan Date**: 2026-06-27  
**Plan Author**: AI Architect Agent (Cursor)  
**Status**: PLANNING ONLY — No source code, migration, or schema changes made.  
**Planned Next Gate**: Sameer/Dina review and approval → Phase 17 Implementation Prompt → UAT → Closure

---

## 1. Executive Summary

Phase 17 adds a safe, human-reviewed **Apply Correction Proposal** layer on top of the existing Phase 16 Apply-to-ERP engine. It allows a user to review a previously applied AI change, propose a correction (manual value or pre-filled from the original "before" summary), and apply that correction through the same allowlist, conflict detection, and governance gates used by the original apply engine.

**Core design principle**: There is no automatic rollback, no one-click undo, no background reversal. Every correction must be explicitly proposed, reviewed, and confirmed by a human user. The correction is applied only after re-reading the live target record, passing all allowlist and conflict checks, and requiring a new explicit confirmation checkbox.

**Critical finding from code inspection**: The existing `dms_ai_erp_apply_items` table stores only **string summaries** (max 200 chars) for `current_value_summary`, `proposed_value_summary`, and `applied_value_summary` — not raw typed values. This has a direct impact on Mode B (Restore Previous Value):

- For **date fields**: the summary IS the ISO `YYYY-MM-DD` string → exact restore is feasible via Mode B.
- For **bigint/number fields**: the summary is the integer/number string → exact restore is feasible via Mode B.
- For **text fields**: the summary may be truncated at 200 characters if the original value exceeded that limit → Mode B pre-fills the summary string; user should verify it is complete before confirming.
- **No raw typed `old_value_json` is stored** in the current schema. Phase 17 introduces `correction_value_json` (scalar typed) for the new correction proposal only; it does not retroactively restore raw old values for older applied items.

---

## 2. Planning Scope and Non-Implementation Rule

This document is planning only. Phase 17 has **not been implemented**.

No source code was changed. No migrations were created. No DB schema was modified. No UI components were built.

This plan must be reviewed and approved by Sameer/Dina before any implementation begins.

Implementation must follow a dedicated Phase 17 implementation Cursor prompt.

---

## 3. Files and Source-of-Truth Reviewed

### Source of Truth Files Reviewed

| File | Status |
|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Read (grep on DMS/Phase16 sections) |
| `implementation_Review/ERP_DMS_AI_PHASE_16_TIER_2_RUNTIME_UAT_AND_CLOSURE_REPORT.md` | Read in full |

### Implementation Files Read

| File | Notes |
|---|---|
| `src/lib/dms/apply-to-erp/types.ts` | Full read — all types |
| `src/lib/dms/apply-to-erp/apply-target-registry.ts` | Full read — allowlist, forbidden patterns |
| `src/lib/dms/apply-to-erp/apply-conflict-detector.ts` | Full read — all conflict detectors |
| `src/lib/dms/apply-to-erp/apply-value-normalizer.ts` | Full read — masking, normalization |
| `src/lib/dms/apply-to-erp/apply-source-resolver.ts` | Full read — proposal builders |
| `src/lib/dms/apply-to-erp/apply-audit.ts` | Full read — audit event builders |
| `src/server/actions/dms/apply-to-erp.ts` | Full read — all server actions |
| `src/features/dms/apply-to-erp/dms-apply-to-erp-run-history.tsx` | Full read — history UI |
| `supabase/migrations/20260629000000_erp_dms_ai_phase16_human_reviewed_apply_to_erp.sql` | Partial read — schema |
| `supabase/migrations/20260630000000_erp_dms_ai_phase16_tier2_party_writeback.sql` | Located (not repeated in full) |

### Files NOT Found (listed as missing per planning prompt instruction)

| Expected File | Status |
|---|---|
| `implementation_Review/ERP_DMS_AI_PHASE_16_TIER_2_PARTY_LICENSES_TAX_WRITEBACK_IMPLEMENTATION_REPORT.md` | Not found (UAT closure report found instead) |
| `implementation_Review/ERP_DMS_AI_PHASE_16_TIER_1_RUNTIME_UAT_AND_CLOSURE_REPORT.md` | Not found as standalone file (content referenced in SOT) |
| `implementation_Review/ERP_DMS_AI_PHASE_16_HUMAN_REVIEWED_APPLY_TO_ERP_IMPLEMENTATION_REPORT.md` | Not found |
| `implementation_Review/ERP_DMS_AI_PHASE_16_TIER_2_PAYLOAD_SAFETY_CHECKS.sql` | Not found |
| `implementation_Review/ERP_DMS_AI_PHASE_16_TIER_2_SECURITY_RLS_QA_CHECKS.sql` | Not found |
| `src/features/dms/apply-to-erp/dms-apply-to-erp-confirm-dialog.tsx` | Not read (referenced in prompt) |
| `src/features/dms/apply-to-erp/dms-apply-to-erp-preview.tsx` | Not read (referenced in prompt) |
| `src/features/dms/apply-to-erp/dms-party-target-selector.tsx` | Not read (referenced in prompt) |
| `src/lib/dms/apply-to-erp/__tests__/` | Not read (tests) |

Missing files do not block Phase 17 planning. Core engine, types, schema, and audit helpers were fully inspected.

---

## 4. Current Apply History Data Adequacy

### What `dms_ai_erp_apply_items` currently stores

| Column | Type | Present? | Notes |
|---|---|---|---|
| `id` | BIGINT PK | ✅ | |
| `apply_run_id` | BIGINT FK | ✅ | Links to apply run |
| `source_type` | TEXT | ✅ | |
| `source_id` | BIGINT | ✅ | |
| `source_field_code` | TEXT | ✅ | |
| `target_table` | TEXT | ✅ | e.g., `party_licenses` |
| `target_field` | TEXT | ✅ | e.g., `remarks` |
| `target_record_id` | BIGINT | ✅ | Child row ID (license/tax ID) |
| `target_display_label` | TEXT | ✅ | Human-readable label |
| `current_value_summary` | TEXT (≤200) | ✅ | Value BEFORE apply — summary only |
| `proposed_value_summary` | TEXT (≤200) | ✅ | AI-proposed value — summary only |
| `applied_value_summary` | TEXT (≤200) | ✅ | Value written — summary only |
| `value_type` | TEXT | ✅ | `text \| date \| number \| boolean \| bigint` |
| `confidence` | NUMERIC | ✅ | AI confidence score |
| `status` | TEXT | ✅ | `applied \| skipped \| conflict \| failed \| forbidden` |
| `confirmed` | BOOLEAN | ✅ | Human confirmed this item |
| `applied_at` | TIMESTAMPTZ | ✅ | When write occurred |
| `applied_by` | BIGINT FK | ✅ | User who applied |
| `requires_confirmation` | BOOLEAN | ✅ | |
| `skip_reason` | TEXT | ✅ | |
| `failure_reason` | TEXT | ✅ | |
| `created_at` | TIMESTAMPTZ | ✅ | |
| `updated_at` | TIMESTAMPTZ | ✅ | |

### What `dms_ai_erp_apply_runs` stores (relevant fields)

| Column | Present? | Notes |
|---|---|---|
| `run_code` | ✅ | e.g., `APPLY-20260626194951-CSQF3` |
| `target_module` | ✅ | `dms_document \| dms_metadata \| party` |
| `target_table` | ✅ | |
| `target_record_id` | ✅ | For party module: stores partyId (parent), not child record ID |
| `requested_by` | ✅ | |
| `confirmed_by` | ✅ | |
| `completed_at` | ✅ | |

### Critical Data Adequacy Finding

**Only summaries are stored — not raw typed values.**

The `current_value_summary`, `proposed_value_summary`, and `applied_value_summary` fields are all `TEXT` columns with a 200-character maximum enforced at the application layer. There is no `old_value_json JSONB` or any typed raw value stored.

**Implications for Phase 17:**

| Value Type | Mode B (Restore Previous) | Reason |
|---|---|---|
| `date` | ✅ Feasible | Summary IS the ISO YYYY-MM-DD string. If valid ISO date, restore is exact. |
| `bigint` | ✅ Feasible | Summary is the integer string representation. |
| `number` | ✅ Feasible | Summary is the numeric string. |
| `boolean` | ✅ Feasible | Summary is `"true"` or `"false"`. |
| `text` | ⚠️ Partial only | If original value > 200 chars, summary was truncated. Restoration may be partial. User must verify. |

**Decision**: Mode B is permitted but must display a clear warning for `text` type fields that the pre-filled value is a summary (potentially truncated). Mode B must not be silently presented as guaranteed exact restore for text fields.

**For the new `correction_value_json` column** introduced in Phase 17, only scalar typed values are stored:
- `string`, `number`, `boolean`, ISO date string, bigint as integer
- No raw OCR, no content, no AI response, no embeddings

---

## 5. Correction Modes

### Mode A — Manual Correction Proposal (Required, always supported)

```
1. User opens an applied item from apply history.
2. System shows:
   - original value before apply (current_value_summary from item)
   - applied value (applied_value_summary from item)
   - current live value (reloaded fresh from DB at correction source load time)
3. User manually enters the correction value.
4. System validates, conflict-checks, and creates a correction proposal (no target write yet).
5. User reviews the proposal details and confirms.
6. System applies the correction.
```

Always supported. Works even when only summaries are stored.

### Mode B — Restore Previous Value Proposal (Optional, value-type conditional)

```
1. User opens an applied item from apply history.
2. System shows the current_value_summary (pre-apply value).
3. User clicks "Use Previous Value" button.
4. System pre-fills the correction value input with current_value_summary string.
5. For text fields: system shows warning banner:
   "This value is a summary (up to 200 characters). Verify it is complete before confirming."
6. Human still reviews and confirms. No automatic apply.
```

**Disabled** when:
- `current_value_summary` is null (field was null/empty before original apply)
- `value_type = "text"` AND summary ends with `"..."` (truncation indicator)

**Enabled** when:
- `value_type` is `date`, `bigint`, `number`, or `boolean` — summary IS the exact typed value
- `value_type = "text"` AND summary does NOT end with `"..."` AND length < 200 chars

### Mode C — Re-apply AI Value (Lower priority, out of Phase 17 core scope)

```
User may choose the applied_value_summary again (e.g., to re-apply a previously conflicted item).
```

This can be implemented as a simple pre-fill of the correction value with `applied_value_summary`. Not a separate code path. May be included in Phase 17 UI as a "Use Applied Value" button alongside "Use Previous Value".

---

## 6. Data Model Options and Recommendation

### Option A — Dedicated `dms_ai_erp_apply_correction_proposals` table (Recommended)

**Advantages:**
- Separate lifecycle (draft → pending_confirmation → applied/conflict/cancelled/failed)
- Clear linkage to original apply item without polluting apply history
- Correction proposals can be browsed independently
- No ambiguity with apply run statuses

**Disadvantages:**
- Requires a new migration

### Option B — Reuse `dms_ai_erp_apply_runs` with `source_type = 'correction_proposal'`

**Advantages:**
- No new table
- Reuses existing apply history UI

**Disadvantages:**
- The `source_type` CHECK constraint must be extended (migration required regardless)
- Correction lifecycle is more complex than apply run lifecycle (needs to store original_apply_item_id as a FK)
- Mixing correction proposals and apply runs makes history harder to read
- The single `target_record_id` on a run does not naturally accommodate the `original_apply_item_id` linkage

### Recommendation: Option A (Dedicated Table)

Use a dedicated `dms_ai_erp_apply_correction_proposals` table for proposal lifecycle tracking. When a correction is actually applied, create a new `dms_ai_erp_apply_run` with `source_type = 'correction_proposal'` (requires CHECK constraint extension) linked back to the correction proposal. This keeps apply history complete while giving correction proposals their own lifecycle.

### Recommended Table: `dms_ai_erp_apply_correction_proposals`

```sql
CREATE TABLE IF NOT EXISTS public.dms_ai_erp_apply_correction_proposals (
  id                              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Unique correction proposal code (generated at application layer)
  proposal_code                   TEXT,

  -- Linkage to original apply
  original_apply_run_id           BIGINT NOT NULL
                                    REFERENCES public.dms_ai_erp_apply_runs(id) ON DELETE RESTRICT,
  original_apply_item_id          BIGINT NOT NULL
                                    REFERENCES public.dms_ai_erp_apply_items(id) ON DELETE RESTRICT,

  -- Document context (denormalized from run for convenience)
  document_id                     BIGINT
                                    REFERENCES public.dms_documents(id) ON DELETE CASCADE,

  -- Target coordinates (denormalized from original item for read-only display)
  target_module                   TEXT NOT NULL,
  target_table                    TEXT NOT NULL,
  target_field                    TEXT NOT NULL,
  target_record_id                BIGINT,
  value_type                      TEXT NOT NULL,

  -- History snapshots (summaries only — no raw content)
  original_before_summary         TEXT,   -- current_value_summary from original item (pre-apply value)
  original_applied_summary        TEXT,   -- applied_value_summary from original item
  current_value_summary           TEXT,   -- live value at correction source load time
  proposed_correction_summary     TEXT,   -- human-entered correction value summary (max 200 chars)

  -- Safe typed correction value for write (scalar only)
  correction_value_json           JSONB,  -- { "v": <string|number|boolean|ISO-date> } — scalar only

  -- Correction mode: 'manual' | 'restore_previous' | 'reapply_ai_value'
  correction_mode                 TEXT NOT NULL DEFAULT 'manual',

  -- Proposal status
  status                          TEXT NOT NULL DEFAULT 'draft',
  -- Values: 'draft' | 'pending_confirmation' | 'applied' | 'conflict' | 'cancelled' | 'failed'

  -- Conflict info (populated when status = 'conflict')
  conflict_status                 TEXT,
  conflict_reason                 TEXT,

  -- Linked apply run created when correction was applied (nullable until applied)
  correction_apply_run_id         BIGINT
                                    REFERENCES public.dms_ai_erp_apply_runs(id) ON DELETE SET NULL,

  -- Actors
  requested_by                    BIGINT NOT NULL
                                    REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  confirmed_by                    BIGINT
                                    REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  applied_by                      BIGINT
                                    REFERENCES public.user_profiles(id) ON DELETE SET NULL,

  -- Timestamps
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at                    TIMESTAMPTZ,
  applied_at                      TIMESTAMPTZ,
  cancelled_at                    TIMESTAMPTZ,
  failed_at                       TIMESTAMPTZ,
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Safe failure message (max 500 chars, no raw content)
  failure_reason                  TEXT
);
```

### `correction_value_json` Safety Contract

```
correction_value_json must contain a single scalar:
  { "v": "string value" }             for text and date fields
  { "v": 123 }                        for number and bigint fields
  { "v": true }                       for boolean fields

FORBIDDEN in correction_value_json:
  raw OCR text
  AI prompt
  AI raw response
  embedding vectors
  full document content
  IBAN or account numbers
  any nested objects beyond { "v": scalar }
```

### Status Values

| Status | Meaning |
|---|---|
| `draft` | Proposal created, values being entered (not yet submitted) |
| `pending_confirmation` | User has submitted proposal, awaiting human confirmation click |
| `applied` | Correction confirmed and written to target record |
| `conflict` | Live target value changed after proposal was created; correction blocked |
| `cancelled` | User or admin cancelled the proposal |
| `failed` | Write attempted but failed (DB error or validation failure) |

---

## 7. Feature Flags

### Required New Feature Flags

| Flag Code | Default | Purpose |
|---|---|---|
| `DMS_AI_APPLY_CORRECTION_PROPOSALS` | `false` | Master gate: enables the entire correction proposal feature |
| `DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS` | `false` | Sub-flag: enables "Use Previous Value" (Mode B) pre-fill button |

Both flags default `false`. Phase 17 is completely invisible when flags are off.

### Flag Check Logic

```
For ANY correction proposal action:
  → check DMS_AI_APPLY_CORRECTION_PROPOSALS = true
  → AND original target's sub-flags still enabled
  → AND master DMS_AI_APPLY_TO_ERP = true (correction reuses the apply engine)

For Mode B "Use Previous Value" pre-fill button:
  → additionally check DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS = true
```

The master Apply-to-ERP flag (`DMS_AI_APPLY_TO_ERP`) must remain enabled for corrections to run, because the correction apply step creates a new apply run through the existing engine.

---

## 8. Permission Model

### New Permissions Required

| Permission Code | Purpose |
|---|---|
| `dms.apply_correction.view` | View correction proposals and correction history |
| `dms.apply_correction.create` | Create a new correction proposal |
| `dms.apply_correction.run` | Submit and apply a confirmed correction |
| `dms.apply_correction.admin` | Cancel any correction; view all corrections regardless of requestor |

### Compound Permission Requirements

Applying a correction requires ALL of:

```
dms.apply_correction.run
AND dms.apply_to_erp.run (original apply permission — still required)
AND <target-specific permission from APPLY_TARGET_REGISTRY>
```

Examples:

| Target | Required permissions |
|---|---|
| `party_licenses.expiry_date` | `dms.apply_correction.run` + `dms.apply_to_erp.run` + `master_data.parties.manage_licenses` |
| `party_tax_registrations.effective_to` | `dms.apply_correction.run` + `dms.apply_to_erp.run` + `master_data.parties.manage_tax` |
| `dms_documents.owning_company_id` | `dms.apply_correction.run` + `dms.apply_to_erp.run` + `dms.documents.edit` |
| `party_licenses.*` (admin path) | `dms.apply_correction.admin` OR `dms.admin` OR `system_admin` |

### Role Grants (to seed in migration)

```sql
-- system_admin gets all correction permissions
-- group_admin gets view + create + run (not admin)
-- dms_admin role gets correction.view + correction.create + correction.run
```

---

## 9. Correction Engine Architecture

### Library Files to Create

```
src/lib/dms/apply-correction/
  types.ts                         — CorrectionProposal types, status, modes, error codes
  correction-source-loader.ts      — load apply item + run + reload live target value
  correction-value-builder.ts      — validate/normalize correction value (scalar-only safety)
  correction-conflict-detector.ts  — correction-specific conflict checks (reuses + extends Phase 16 detectors)
  correction-engine.ts             — orchestration: create proposal, apply proposal
  correction-audit.ts              — safe audit event builders for correction events
  index.ts                         — barrel exports
```

### Key Types (to define in `types.ts`)

```typescript
export type CorrectionMode = "manual" | "restore_previous" | "reapply_ai_value";

export type CorrectionProposalStatus =
  | "draft"
  | "pending_confirmation"
  | "applied"
  | "conflict"
  | "cancelled"
  | "failed";

export type CorrectionErrorCode =
  | "not_authenticated"
  | "permission_denied"
  | "feature_flag_disabled"
  | "invalid_input"
  | "original_item_not_found"
  | "original_item_not_applied"
  | "correction_proposal_not_found"
  | "correction_already_applied"
  | "correction_already_cancelled"
  | "target_forbidden"
  | "target_not_allowlisted"
  | "target_record_not_found"
  | "target_field_conflict"
  | "target_value_changed_after_proposal"
  | "correction_value_invalid"
  | "correction_value_not_scalar";

export type CorrectionSourceData = {
  originalApplyRunId:       number;
  originalApplyItemId:      number;
  documentId:               number | null;
  targetModule:             string;
  targetTable:              string;
  targetField:              string;
  targetRecordId:           number | null;
  targetDisplayLabel:       string | null;
  valueType:                string;
  originalBeforeSummary:    string | null;  // current_value_summary from original item
  originalAppliedSummary:   string | null;  // applied_value_summary from original item
  currentLiveValueSummary:  string | null;  // reloaded fresh from DB
  restorePreviousEnabled:   boolean;        // Mode B button eligibility
};

export type CreateCorrectionProposalInput = {
  originalApplyItemId:      number;
  correctionMode:           CorrectionMode;
  proposedCorrectionValue:  unknown;        // raw input from user; normalizer will validate
  humanReviewNotes?:        string;         // optional free-text notes (max 500 chars)
};

export type ApplyCorrectionConfirmation = {
  humanReviewConfirmed:     boolean;        // must be true (literal)
  replaceExistingConfirmed: boolean;        // must confirm if target now has a value
};
```

### `correction-source-loader.ts`

Responsibilities:
- Accept `applyItemId`
- Load the `dms_ai_erp_apply_items` row (must have `status = 'applied'`)
- Load the parent `dms_ai_erp_apply_runs` row
- Re-read the live target record from DB (fresh SELECT)
- Build a safe `CorrectionSourceData` object (no raw content)
- Determine `restorePreviousEnabled` based on value type and summary truncation detection
- Return read-only data; NO write operations

**Rejection conditions:**
- Item not found → `original_item_not_found`
- Item `status !== 'applied'` → `original_item_not_applied`
- Target record deleted → `target_record_not_found`
- Target table now forbidden → `target_forbidden`
- Target table/field no longer in allowlist → `target_not_allowlisted`

### `correction-value-builder.ts`

Responsibilities:
- Accept the user's proposed correction value (raw)
- Validate it is a scalar (string, number, boolean, ISO date, bigint) — reject arrays, objects, null coercions to sensitive values
- Normalise using the existing `normalizeApplyValue()` from Phase 16
- Apply TRN masking if field is a TRN field (using existing `maskTrnSummary()`)
- Build `correction_value_json: { v: <scalar> }` for DB storage
- Build `proposed_correction_summary` (truncated to 200 chars)
- Return validation result (valid/invalid with reason)

**Safety rule**: The `correction_value_json` payload must NEVER contain:
- Raw OCR text, AI prompt, AI response, embedding vectors, document content
- Objects with more than one key `v`
- Arrays
- Values that match SENSITIVE_FIELD_CODES patterns

### `correction-conflict-detector.ts`

Responsibilities:
- Extend the existing conflict detectors from Phase 16
- Provide a unified `detectCorrectionConflict()` function that:
  - Calls the appropriate Phase 16 detector for the target table
  - Adds correction-specific conflicts:
    - `correction_already_applied` — proposal already in `applied` status
    - `correction_already_cancelled` — proposal in `cancelled` status
    - `target_value_changed_after_proposal` — live value differs from `current_value_summary` captured at proposal creation time
    - `original_item_not_applied` — original apply item is not in `applied` status

**Reuse pattern:**
```typescript
import {
  detectDmsDocumentFieldConflict,
  detectPartyLicenseFieldConflict,
  detectPartyTaxFieldConflict,
} from "@/lib/dms/apply-to-erp/apply-conflict-detector";
```

### `correction-engine.ts`

Orchestration logic. Two key operations:

**1. `createCorrectionProposal(input, ctx)`**:
- Feature flag check
- Permission check (`dms.apply_correction.create`)
- Load correction source (calls `correction-source-loader`)
- Validate correction value (calls `correction-value-builder`)
- Insert proposal row with `status = 'pending_confirmation'`
- Write audit event `dms_apply_correction_proposal_created`
- Return proposal ID — NO target write

**2. `executeCorrectionProposal(proposalId, confirmation, ctx)`**:
- Feature flag check
- Permission check (`dms.apply_correction.run` + target permission)
- Reload proposal row (must be `pending_confirmation`)
- Reload original apply item (must still be `applied`)
- Reload live target record fresh from DB
- Conflict detection on live value vs `current_value_summary` at proposal creation time
- Conflict detection using the same Phase 16 detectors
- Normalize and validate correction value from `correction_value_json`
- Allowlist check (same `validateApplyTarget()`)
- **Write correction to target record** (identical UPDATE pattern as Phase 16 `applyDmsApplyToErpRun()`)
- Create a new `dms_ai_erp_apply_runs` row with `source_type = 'correction_proposal'` linked to the correction proposal
- Update proposal status to `applied`
- Write audit event `dms_apply_correction_applied`
- `revalidatePath()` for the affected document and party pages

### `correction-audit.ts`

Safe audit event builders — no raw content, summary fields max 200 chars.

Events:
```
dms_apply_correction_source_viewed
dms_apply_correction_proposal_created
dms_apply_correction_applied
dms_apply_correction_conflict
dms_apply_correction_cancelled
dms_apply_correction_failed
```

Each event stores: `proposal_id`, `original_apply_run_id`, `original_apply_item_id`, `target_table`, `target_field`, `target_record_id`, `original_before_summary`, `original_applied_summary`, `correction_summary`, `confirmed_by`. NO raw content.

---

## 10. Server Action Plan

### File: `src/server/actions/dms/apply-correction.ts`

```
"use server"
```

### Actions

#### `getApplyCorrectionSource(applyItemId: number)`

```
READ-ONLY.
- Auth check
- Feature flag: DMS_AI_APPLY_CORRECTION_PROPOSALS
- Permission: dms.apply_correction.view OR dms.apply_correction.create
- Load apply item → apply run → target record (fresh DB read)
- Return CorrectionSourceData
- Log: dms_apply_correction_source_viewed
- No write operations
```

#### `createApplyCorrectionProposal(input: CreateCorrectionProposalInput)`

```
WRITES to dms_ai_erp_apply_correction_proposals only. NO target record write.
- Auth check
- Feature flag: DMS_AI_APPLY_CORRECTION_PROPOSALS
- Permission: dms.apply_correction.create
- Load and validate original apply item (status must be 'applied')
- Validate correction value (scalar-only, normalizer)
- Allowlist check (same as apply engine)
- Forbidden check (same as apply engine)
- Insert proposal row with status='pending_confirmation'
- Log: dms_apply_correction_proposal_created
- Return { proposalId, proposalCode }
```

#### `getApplyCorrectionProposal(proposalId: number)`

```
READ-ONLY.
- Auth check
- Permission: dms.apply_correction.view
- Load proposal row
- Return CorrectionProposal
```

#### `listApplyCorrectionProposals(filters)`

```
READ-ONLY.
- Auth check
- Permission: dms.apply_correction.view
- Filters: documentId, originalApplyRunId, status, page, pageSize
- Return { proposals, total }
```

#### `applyCorrectionProposal(proposalId: number, confirmation: ApplyCorrectionConfirmation)`

```
THE ONLY ACTION THAT WRITES TO TARGET RECORDS in Phase 17.
- Auth check
- Feature flags: DMS_AI_APPLY_CORRECTION_PROPOSALS + DMS_AI_APPLY_TO_ERP + target sub-flags
- Permission: dms.apply_correction.run + dms.apply_to_erp.run + target permission
- Human confirmation: humanReviewConfirmed must be literal true
- Load proposal (must be pending_confirmation)
- Load original apply item (must still be applied)
- Reload target record fresh from DB
- Conflict detection:
    a. Proposal already applied/cancelled → reject
    b. Target record deleted/inactive → conflict
    c. Current live value != current_value_summary stored in proposal → conflict
       (field changed between proposal creation and now)
    d. Party mismatch for Tier 2 targets → conflict
    e. Target field no longer in allowlist → forbidden
    f. replaceExistingConfirmed required if field now has value → conflict if not provided
- Normalise correction_value_json.v
- Execute the target record UPDATE (same pattern as Phase 16 applyDmsApplyToErpRun())
- Create new dms_ai_erp_apply_runs row (source_type='correction_proposal', status='completed')
- Create new dms_ai_erp_apply_items row (linked to correction apply run)
- Update correction proposal: status='applied', applied_at, applied_by, correction_apply_run_id
- Log: dms_apply_correction_applied
- revalidatePath() for document and party pages
```

#### `cancelApplyCorrectionProposal(proposalId: number)`

```
STATUS CHANGE ONLY. No target record write.
- Auth check
- Permission: dms.apply_correction.run (own proposals) OR dms.apply_correction.admin (any)
- Proposal must be in draft or pending_confirmation
- Update status to 'cancelled', cancelled_at
- Log: dms_apply_correction_cancelled
```

---

## 11. UI / UX Plan

### Components to Create

```
src/features/dms/apply-correction/
  dms-apply-correction-source-card.tsx      — shows old/applied/current summaries
  dms-apply-correction-proposal-form.tsx    — correction value input + mode selector
  dms-apply-correction-confirm-dialog.tsx   — confirmation dialog with checkbox
  dms-apply-correction-history.tsx          — list of correction proposals for a document
  dms-apply-correction-status-badge.tsx     — status badge (draft/pending/applied/conflict/cancelled/failed)
  index.ts                                  — barrel exports
```

### UI Placement

| Location | What to Show |
|---|---|
| Apply-to-ERP run history expanded item row | "Propose Correction" button (if item.status === 'applied' and flag enabled) |
| DMS Document AI tab → Apply History | Same button on applied items |
| Party License tab → Apply History (if visible) | Same button |
| Party Tax Registration tab → Apply History (if visible) | Same button |
| Review Queue drawer → applied runs | Same button |

### Source Card (`dms-apply-correction-source-card.tsx`)

Displays:
```
┌─────────────────────────────────────────────────────────────────┐
│ Correction Source — party_licenses.remarks                      │
├──────────────────────┬──────────────────────────────────────────┤
│ Original Apply Run   │ APPLY-20260626194951-CSQF3               │
│ Target Record        │ Party License PTYLIC-000002               │
│ Value Before Apply   │ (empty / null)                           │
│ Applied Value        │ Verified – entity match: Taqa Al Mansoory│
│ Current Live Value   │ Verified – entity match: Taqa Al Mansoory│
│ Detected Conflict?   │ None (current = applied)                 │
└──────────────────────┴──────────────────────────────────────────┘
```

Shows a **warning banner** if `currentLiveValue !== originalAppliedSummary`:
```
⚠ The target field has changed since the original apply.
  Applied: "..."
  Current: "..."
  Review carefully before proposing a correction.
```

### Proposal Form (`dms-apply-correction-proposal-form.tsx`)

```
Correction Mode:
  ○ Enter correction manually  [always available]
  ○ Use previous value         [only if restorePreviousEnabled]
  ○ Use applied value again    [always available if applied_summary not null]

Correction Value:
  [text input or date picker based on value_type]

[For text fields with Mode B warning]:
⚠ The previous value is a summary (up to 200 characters).
  Verify it is complete and accurate before confirming.

[Submit] → calls createApplyCorrectionProposal
```

Allowed button labels: "Propose Correction", "Review Correction", "Apply Correction", "Cancel Correction"  
Forbidden labels: "Undo", "Rollback", "Auto Revert", "Restore Automatically", "One-click Revert"

### Confirmation Dialog (`dms-apply-correction-confirm-dialog.tsx`)

Based on `ERPChildDialogForm` standard (per workspace child dialog standard rule).

Must show:
- Original apply run reference
- Target table / field / record
- Old summary (before original apply)
- Applied summary (what was written)
- Current live value
- Proposed correction value
- Conflict warning (if any)
- Human responsibility warning: "You are manually correcting an AI-applied value. This action will directly update the ERP record."
- Checkbox: "I have reviewed the original value, applied value, and current value. I confirm the proposed correction is correct."
- "Apply Correction" button (disabled until checkbox checked)

### Correction History (`dms-apply-correction-history.tsx`)

List of correction proposals for a document or apply run. Shows:
- Proposal code
- Target table / field
- Correction mode
- Status badge
- Created by / applied by
- Expand to show details

---

## 12. Conflict Detection and Server Revalidation

### Correction-Specific Conflict Checks

In addition to the Phase 16 conflict detectors (all reused), Phase 17 adds:

| Conflict | Check | Handling |
|---|---|---|
| Proposal already applied | `proposal.status === 'applied'` | Reject with `correction_already_applied` |
| Proposal already cancelled | `proposal.status === 'cancelled'` | Reject with `correction_already_cancelled` |
| Original apply item no longer applied | `originalItem.status !== 'applied'` | Block correction — source integrity broken |
| Target value changed after proposal created | `live_value_summary !== proposal.current_value_summary` | Set proposal to `conflict`, require user re-review |
| Target record deleted | `row === null` | Block correction |
| Target record inactive (Tier 2) | `is_active === false` | Block correction |
| Party mismatch (Tier 2) | `row.party_id !== expectedPartyId` | Block correction |
| Target table now forbidden | `isForbiddenTarget()` returns true | Block correction |
| Target field no longer allowlisted | `validateApplyTarget()` returns false | Block correction |
| Correction value invalid | normalizer returns `valid: false` | Block correction with reason |
| Correction value contains non-scalar | value is array or object | Block correction |
| Feature flag disabled | `DMS_AI_APPLY_CORRECTION_PROPOSALS` false | Block entire operation |
| Missing target permission | permission check fails | Block correction |

### Server Revalidation Sequence (inside `applyCorrectionProposal`)

```
1. Reload proposal row (fresh DB read)
2. Reload original apply item (fresh DB read)
3. Reload target record (fresh DB read — same SELECT as Phase 16)
4. Run all conflict checks in order (fail fast)
5. Normalize correction_value_json.v
6. Allowlist validation
7. Write target record UPDATE
8. Update proposal + create correction apply run + audit
```

No client-side value is trusted without server reload.

---

## 13. Audit and History Plan

### Audit Events

All events go through the existing `logAudit()` function.

| Event Code | Trigger |
|---|---|
| `dms_apply_correction_source_viewed` | User loads correction source card |
| `dms_apply_correction_proposal_created` | `createApplyCorrectionProposal` succeeds |
| `dms_apply_correction_applied` | `applyCorrectionProposal` write succeeds |
| `dms_apply_correction_conflict` | Conflict detected during apply; proposal set to conflict |
| `dms_apply_correction_cancelled` | `cancelApplyCorrectionProposal` called |
| `dms_apply_correction_failed` | Write attempted but DB error occurred |

### Safe Audit Metadata (per event)

```typescript
{
  proposal_id:              number,
  proposal_code:            string,
  original_apply_run_id:    number,
  original_apply_item_id:   number,
  target_table:             string,
  target_field:             string,
  target_record_id:         number | null,
  original_before_summary:  string | null,     // max 200 chars
  original_applied_summary: string | null,     // max 200 chars
  current_value_summary:    string | null,     // max 200 chars
  correction_summary:       string | null,     // max 200 chars
  confirmed_by:             number | null,
  // For Tier 2 party targets:
  party_id?:                number,
  target_child_code?:       string,
}
```

### What is NEVER logged

- Raw OCR text
- AI prompt
- AI raw response
- Embedding vectors
- Full document content
- IBAN / account numbers
- Salary / medical values
- correction_value_json full object (only the summary string)

---

## 14. Data Safety and Privacy Plan

### Summary Length Limits

| Field | Max Length |
|---|---|
| `proposed_correction_summary` | 200 chars |
| `original_before_summary` | 200 chars |
| `original_applied_summary` | 200 chars |
| `current_value_summary` | 200 chars |
| `failure_reason` | 500 chars |
| `conflict_reason` | 500 chars |
| `correction_value_json` | Scalar only — string max 200 chars for text type |

### TRN / Sensitive Field Handling

- `tax_registration_number` corrections: use existing `maskTrnSummary()` for all summaries
- `correction_value_json.v` for TRN fields: stored as the actual typed value (needed for write), never in a summary column
- Summary columns for TRN fields: always masked (first4****last4)

### Forbidden Content Check

Before inserting `correction_value_json`, validate:
- Value is a scalar (string, number, boolean)
- String value does not match `SENSITIVE_FIELD_CODES` or `FORBIDDEN_FIELD_PATTERNS` patterns from the existing target registry
- String value max 200 chars for `text` type fields (per field `maxLength` from allowlist)

### No Raw Content Storage Rule

`correction_value_json` is NOT a general JSON blob. It is a strict scalar wrapper:
```json
{ "v": "2027-06-26" }
```
If any implementation attempt sets a non-scalar value here, the `correction-value-builder.ts` must reject it with `correction_value_not_scalar` error code.

---

## 15. Migration Plan

### Migration File

```
supabase/migrations/20260701000000_erp_dms_ai_phase17_apply_correction_proposal.sql
```

### Migration Sections

**Section 1**: Extend `dms_ai_erp_apply_runs.source_type` CHECK constraint  
Add `'correction_proposal'` to the allowed values (requires DROP + RE-ADD of constraint).

**Section 2**: Create `dms_ai_erp_apply_correction_proposals` table (per schema above)

**Section 3**: CHECK constraints

```sql
-- status check
CHECK (status IN ('draft', 'pending_confirmation', 'applied', 'conflict', 'cancelled', 'failed'))

-- correction_mode check
CHECK (correction_mode IN ('manual', 'restore_previous', 'reapply_ai_value'))

-- target_module check
CHECK (target_module IN ('dms_document', 'dms_metadata', 'party'))
```

**Section 4**: Indexes

```sql
-- primary lookup patterns
CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_corrections_apply_item
  ON public.dms_ai_erp_apply_correction_proposals (original_apply_item_id);

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_corrections_apply_run
  ON public.dms_ai_erp_apply_correction_proposals (original_apply_run_id);

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_corrections_document
  ON public.dms_ai_erp_apply_correction_proposals (document_id);

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_corrections_target
  ON public.dms_ai_erp_apply_correction_proposals (target_table, target_record_id);

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_corrections_status_created
  ON public.dms_ai_erp_apply_correction_proposals (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_corrections_requested_by
  ON public.dms_ai_erp_apply_correction_proposals (requested_by);
```

**Section 5**: RLS

```sql
ALTER TABLE public.dms_ai_erp_apply_correction_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_ai_erp_apply_correction_proposals FORCE ROW LEVEL SECURITY;

-- SELECT: dms.apply_correction.view OR dms.apply_to_erp.view OR admin roles
CREATE POLICY "dms_ai_erp_corrections_select" ON public.dms_ai_erp_apply_correction_proposals
  FOR SELECT TO authenticated
  USING (current_user_has_permission('dms.apply_correction.view')
      OR current_user_has_permission('dms.apply_to_erp.view')
      OR current_user_has_permission('dms.admin')
      OR current_user_has_permission('system_admin')
      OR current_user_has_permission('group_admin'));

-- INSERT: dms.apply_correction.create OR admin
CREATE POLICY "dms_ai_erp_corrections_insert" ON public.dms_ai_erp_apply_correction_proposals
  FOR INSERT TO authenticated
  WITH CHECK (current_user_has_permission('dms.apply_correction.create')
           OR current_user_has_permission('dms.admin')
           OR current_user_has_permission('system_admin'));

-- UPDATE: dms.apply_correction.run OR admin
CREATE POLICY "dms_ai_erp_corrections_update" ON public.dms_ai_erp_apply_correction_proposals
  FOR UPDATE TO authenticated
  USING (current_user_has_permission('dms.apply_correction.run')
      OR current_user_has_permission('dms.apply_correction.admin')
      OR current_user_has_permission('dms.admin')
      OR current_user_has_permission('system_admin'))
  WITH CHECK (current_user_has_permission('dms.apply_correction.run')
           OR current_user_has_permission('dms.apply_correction.admin')
           OR current_user_has_permission('dms.admin')
           OR current_user_has_permission('system_admin'));

-- NO DELETE policy — correction history is append-only
```

**Section 6**: Feature flags

```sql
INSERT INTO public.erp_ai_feature_flags (feature_code, feature_name, is_enabled)
VALUES
  ('DMS_AI_APPLY_CORRECTION_PROPOSALS', 'DMS AI: Apply Correction Proposals', false),
  ('DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS', 'DMS AI: Apply Correction Restore Previous Value', false)
ON CONFLICT (feature_code) DO NOTHING;
```

**Section 7**: Permissions

```sql
INSERT INTO public.erp_permissions (permission_code, module_code, label, description)
VALUES
  ('dms.apply_correction.view',   'dms', 'View Apply Corrections',   'View correction proposals and history'),
  ('dms.apply_correction.create', 'dms', 'Create Apply Corrections',  'Create new correction proposals'),
  ('dms.apply_correction.run',    'dms', 'Apply Corrections',         'Confirm and apply a correction proposal'),
  ('dms.apply_correction.admin',  'dms', 'Administer Apply Corrections', 'Cancel any correction; view all corrections')
ON CONFLICT (permission_code) DO NOTHING;

-- Grant to system_admin and group_admin
INSERT INTO public.erp_role_permissions (role_code, permission_code)
VALUES
  ('system_admin', 'dms.apply_correction.view'),
  ('system_admin', 'dms.apply_correction.create'),
  ('system_admin', 'dms.apply_correction.run'),
  ('system_admin', 'dms.apply_correction.admin'),
  ('group_admin',  'dms.apply_correction.view'),
  ('group_admin',  'dms.apply_correction.create'),
  ('group_admin',  'dms.apply_correction.run')
ON CONFLICT DO NOTHING;
```

---

## 16. Test and UAT Plan

### Unit Tests (to create)

```
src/lib/dms/apply-correction/__tests__/
  correction-source-loader.test.ts
  correction-value-builder.test.ts
  correction-conflict-detector.test.ts
```

#### `correction-source-loader.test.ts`

```
✅ rejects non-applied items (status != 'applied')
✅ rejects items where original apply run is missing
✅ rejects items where target record is now deleted
✅ rejects items where target table is now forbidden
✅ returns correct current live value from DB reload
✅ restorePreviousEnabled = true for date, bigint, number, boolean types
✅ restorePreviousEnabled = false when current_value_summary is null
✅ restorePreviousEnabled = false when text summary ends with "..." (truncation)
✅ restorePreviousEnabled = true when text summary < 200 chars and no ellipsis
```

#### `correction-value-builder.test.ts`

```
✅ rejects null/undefined values
✅ rejects array values (not scalar)
✅ rejects object values (not scalar)
✅ rejects values matching forbidden field patterns
✅ rejects text values exceeding maxLength
✅ accepts valid text string
✅ accepts valid ISO date
✅ accepts valid integer for bigint field
✅ accepts valid boolean
✅ applies TRN masking to summary for tax_registration_number
✅ builds correction_value_json = { v: <scalar> }
```

#### `correction-conflict-detector.test.ts`

```
✅ conflict if proposal already in 'applied' status
✅ conflict if proposal already in 'cancelled' status
✅ conflict if original apply item not in 'applied' status
✅ conflict if current live value differs from current_value_summary in proposal
✅ conflict if target record deleted
✅ conflict if party_licenses row has wrong party_id
✅ conflict if party_licenses row is_active = false
✅ conflict if party_tax_registrations row has wrong party_id
✅ conflict if target table is now forbidden
✅ no conflict when live value = proposal.current_value_summary and all checks pass
✅ reuses Phase 16 detectPartyLicenseFieldConflict (wrapper call)
✅ reuses Phase 16 detectPartyTaxFieldConflict (wrapper call)
✅ reuses Phase 16 detectDmsDocumentFieldConflict (wrapper call)
```

### Runtime UAT Plan

```
Step 1: Feature flag OFF — correction UI and actions blocked
Step 2: Enable DMS_AI_APPLY_CORRECTION_PROPOSALS
Step 3: Navigate to an applied apply run in apply history
Step 4: Click "Propose Correction" on an applied item
Step 5: Source card shows old/applied/current values correctly
Step 6: Mode A — enter manual correction value
Step 7: createApplyCorrectionProposal writes ONLY to correction_proposals table (no target write)
Step 8: Confirm dialog requires checkbox — clicking "Apply Correction" without checkbox → error
Step 9: Check checkbox → Apply Correction
Step 10: applyCorrectionProposal: verify target field updated in DB
Step 11: Verify new dms_ai_erp_apply_runs row created (source_type='correction_proposal')
Step 12: Mode B (if enabled) — Use Previous Value pre-fill
Step 13: Text field Mode B warning shown when summary may be truncated
Step 14: Conflict test — modify target field manually in DB, then apply correction → conflict detected
Step 15: Forbidden target test — attempt correction on a non-allowlisted field → blocked
Step 16: Feature flags restored to false
Step 17: Audit log payloads: verify no raw OCR/content/AI response in new_values
Step 18: RLS SQL QA — no broad USING (true), no anon access, no DELETE policy
Step 19: TypeScript build: 0 errors
Step 20: Vitest: all correction unit tests pass, all Phase 16 tests still pass
```

---

## 17. Performance and Index Plan

### Query Patterns and Index Coverage

| Query Pattern | Index Used |
|---|---|
| `WHERE original_apply_item_id = ?` | `idx_dms_ai_erp_corrections_apply_item` |
| `WHERE original_apply_run_id = ?` | `idx_dms_ai_erp_corrections_apply_run` |
| `WHERE document_id = ?` | `idx_dms_ai_erp_corrections_document` |
| `WHERE target_table = ? AND target_record_id = ?` | `idx_dms_ai_erp_corrections_target` |
| `WHERE status = ? ORDER BY created_at DESC` | `idx_dms_ai_erp_corrections_status_created` |
| `WHERE requested_by = ?` | `idx_dms_ai_erp_corrections_requested_by` |

### Expected Volume

- Low volume: correction proposals are rare (only for applied items; most apply runs have 1-5 items)
- Expected: < 1000 correction proposals in first year
- No special partitioning or VACUUM tuning required

### Server Action Performance

- `getApplyCorrectionSource`: 2 SELECT queries (item + run) + 1 fresh target SELECT = 3 queries
- `createApplyCorrectionProposal`: 3 SELECTs + 1 INSERT + 1 logAudit = ~5 operations
- `applyCorrectionProposal`: ~8 SELECTs + 2 UPDATEs + 2 INSERTs + 1 logAudit = ~13 operations
- All operations use `createAdminClient()` for writes; `createClient()` for RLS-respecting reads

---

## 18. Recommended Phase 17 Implementation Scope

Phase 17 core scope (must be completed before UAT):

| Component | Priority |
|---|---|
| Migration: new table + feature flags + permissions + RLS + source_type extension | P0 |
| `src/lib/dms/apply-correction/types.ts` | P0 |
| `src/lib/dms/apply-correction/correction-source-loader.ts` | P0 |
| `src/lib/dms/apply-correction/correction-value-builder.ts` | P0 |
| `src/lib/dms/apply-correction/correction-conflict-detector.ts` | P0 |
| `src/lib/dms/apply-correction/correction-engine.ts` | P0 |
| `src/lib/dms/apply-correction/correction-audit.ts` | P0 |
| `src/lib/dms/apply-correction/index.ts` | P0 |
| `src/server/actions/dms/apply-correction.ts` (all 5 actions) | P0 |
| Unit tests (3 test files) | P0 |
| `dms-apply-correction-source-card.tsx` | P1 |
| `dms-apply-correction-proposal-form.tsx` | P1 |
| `dms-apply-correction-confirm-dialog.tsx` | P1 |
| `dms-apply-correction-status-badge.tsx` | P1 |
| `dms-apply-correction-history.tsx` | P1 |
| Wire "Propose Correction" button into apply history UI | P1 |
| Wire "Propose Correction" button into Review Queue drawer | P2 |
| Wire correction history into Party License / Tax tab | P2 |

---

## 19. Implementation Sequence for Future Phase 17 Execution

```
1. Apply migration (Section: source_type extension + new table + flags + permissions + RLS)
2. Create src/lib/dms/apply-correction/ library files (types → source-loader → value-builder → conflict-detector → engine → audit → index)
3. Create src/server/actions/dms/apply-correction.ts
4. Run existing Phase 16 unit tests — must still all pass
5. Write and run correction unit tests (3 files)
6. Create UI components in src/features/dms/apply-correction/
7. Wire "Propose Correction" button into dms-apply-to-erp-run-history.tsx (applied items only)
8. tsc --noEmit → 0 errors
9. Build check → 0 errors
10. Runtime UAT (20 steps per UAT plan)
11. Create closure report
12. Update ALGT_ERP_SOURCE_OF_TRUTH.md
13. Restore feature flags to false
```

---

## 20. Acceptance Criteria for Future Implementation

| Code | Criterion |
|---|---|
| AC-01 | `DMS_AI_APPLY_CORRECTION_PROPOSALS` feature flag defaults `false`. When false, no correction UI appears and all correction server actions return `feature_flag_disabled`. |
| AC-02 | Correction source can only be an apply item with `status = 'applied'`. Any other status returns `original_item_not_applied` error. |
| AC-03 | `createApplyCorrectionProposal` writes ONLY to `dms_ai_erp_apply_correction_proposals`. It does NOT write to any ERP target table (`party_licenses`, `party_tax_registrations`, `dms_documents`, etc.). |
| AC-04 | Applying a correction requires `humanReviewConfirmed: true` (literal boolean, validated server-side via Zod). Sending `false` or omitting it returns `invalid_input`. |
| AC-05 | Correction applies only to fields in the existing `APPLY_TARGET_REGISTRY` allowlist. Any field outside the allowlist returns `target_not_allowlisted`. |
| AC-06 | `applyCorrectionProposal` reloads the target record from the DB immediately before the write. No cached or client-supplied current value is trusted. |
| AC-07 | If the live target field value differs from `proposal.current_value_summary` (captured at proposal creation), the correction is blocked with `target_field_conflict`. Proposal status is set to `conflict`. |
| AC-08 | Fields in `FORBIDDEN_TABLE_PATTERNS` or `FORBIDDEN_FIELD_PATTERNS` cannot be correction targets. Server returns `target_forbidden`. This is tested by a unit test. |
| AC-09 | Every correction operation (created, applied, conflict, cancelled, failed) writes to `audit_logs` via `logAudit()`. No raw OCR/content/AI response appears in audit `new_values`. |
| AC-10 | There is no automatic rollback, undo, background reversal, or AI-decided correction path anywhere in Phase 17 code or migration. Every write requires a human-confirmed `applyCorrectionProposal` call. |
| AC-11 | `correction_value_json` contains only `{ "v": <scalar> }`. The `correction-value-builder.ts` rejects arrays, objects, and values matching sensitive field patterns. A dedicated unit test covers this. |
| AC-12 | `tsc --noEmit` passes with 0 errors. Vitest passes with all Phase 16 tests still green and all new Phase 17 correction tests green. Build completes without errors. |

---

## 21. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `source_type` CHECK constraint extension breaks existing rows | Low | High | Migration uses DROP+RE-ADD pattern idempotently; existing rows keep valid source types |
| Summary truncation causes Mode B to pre-fill incomplete text value | Medium | Medium | UI shows explicit truncation warning; user must verify before confirming |
| User applies correction to a field changed by another user between proposal creation and confirmation | Medium | Medium | Server revalidation detects `target_value_changed_after_proposal` and blocks correction; proposal status set to `conflict` |
| Permission explosion (compound permission checks) | Low | Low | Permissions are AND-combined; clear precedence: correction.run + apply_to_erp.run + target permission |
| RLS policy misconfiguration on new table | Low | High | Migration explicitly sets ENABLE ROW LEVEL SECURITY + FORCE ROW LEVEL SECURITY; SQL QA step in UAT |
| Correction value accidentally stores raw AI content | Low | High | `correction-value-builder.ts` validates scalar-only and checks against sensitive field patterns; unit tested |
| `correction_apply_run_id` FK null until applied | Expected | None | Nullable by design; only populated after successful `applyCorrectionProposal` |

---

## 22. What Must Not Be Implemented in Phase 17

The following are explicitly forbidden in all Phase 17 implementation work:

```
❌ Automatic rollback of any kind
❌ "Undo" button or one-click revert
❌ Background job that reverts applied values
❌ AI-decided correction without human review
❌ Bulk correction across multiple records in one operation
❌ Correction targeting fields not in APPLY_TARGET_REGISTRY
❌ Correction targeting FORBIDDEN_TABLE_PATTERNS or FORBIDDEN_FIELD_PATTERNS
❌ Correction without target module permission check
❌ Correction if current target value changed and conflict not resolved by user
❌ Storing raw OCR text, AI prompt, AI response, or embedding in any correction table column
❌ Direct editing of audit_logs rows
❌ Direct editing of dms_ai_erp_apply_items or dms_ai_erp_apply_runs rows to fake history
❌ Correction of HR/employee/payroll/salary tables
❌ Correction of party_bank_details, iban, account_number fields
❌ DELETE policy on dms_ai_erp_apply_correction_proposals
❌ Broad USING (true) or anon RLS policies
```

---

## 23. Corrected Roadmap After Phase 17

```
Phase 9    — Async AI Job Queue / Workflow Runner                  CLOSED ✅
Phase 10A  — OCR Pipeline Upgrade / Azure OCR Wiring              CLOSED ✅
Phase 10B  — Queue-backed Admin OCR Backfill                       CLOSED ✅
Phase 11   — Semantic Chunking and Embeddings                      CLOSED ✅
Phase 12   — Review Queue Activation                               CLOSED ✅
Phase 13   — Validation, Conflict Detection, Owner Matching        CLOSED / LIVE PASS ✅
Phase 14   — Token / Cost / Observability                          CLOSED / LIVE PASS ✅
Phase 15   — Testing, Performance, Hardening                       CLOSED / LIVE PASS ✅
Phase 16.1 — Human-Reviewed Apply-to-ERP Tier 1                    CLOSED / LIVE PASS ✅
Phase 16.2 — Party Licenses and Tax Registration Write-back        CLOSED / LIVE PASS ✅
Phase 17   — Apply Correction Proposal                             PLANNING → IMPLEMENTATION NEXT
Phase 18   — (TBD by Sameer/Dina)
```

---

## 24. Recommended Next Cursor Implementation Prompt

The Phase 17 implementation prompt should instruct Cursor to:

```
1. Read this planning file (ERP_DMS_AI_PHASE_17_APPLY_CORRECTION_PROPOSAL_PLAN.md) in full.
2. Read .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md.
3. Read the Phase 16 implementation and the source files listed in Section 3 of this plan.
4. Apply the migration per Section 15 (in this exact order: source_type extension → new table → constraints → indexes → RLS → feature flags → permissions).
5. Create all library files in src/lib/dms/apply-correction/ per Section 9.
6. Create src/server/actions/dms/apply-correction.ts per Section 10.
7. Run existing Phase 16 unit tests — must still all pass.
8. Write and run Phase 17 correction unit tests per Section 16.
9. Create UI components in src/features/dms/apply-correction/ per Section 11.
10. Wire "Propose Correction" button into dms-apply-to-erp-run-history.tsx.
11. tsc --noEmit → 0 errors. Build → 0 errors. Vitest → all pass.
12. Create UAT closure report in implementation_Review/.
13. Update ALGT_ERP_SOURCE_OF_TRUTH.md.
14. Restore all Phase 17 feature flags to false.
```

---

## 25. Final Recommendation

**Phase 17 is ready to plan and implement.**

The existing Phase 16 apply engine provides a solid, reusable foundation. The planned Phase 17 architecture:

- Reuses the `APPLY_TARGET_REGISTRY` allowlist (no new targets)
- Reuses all four Phase 16 conflict detectors (wraps them)
- Reuses `normalizeApplyValue()` and `maskTrnSummary()` from the value normalizer
- Reuses the `logAudit()` audit pattern
- Reuses `ERPChildDialogForm` for the confirmation dialog (per workspace child form standard)
- Does NOT introduce automatic rollback at any layer
- Does NOT store raw content in any new column

The key governance constraint on Phase 17 is the **summary-only storage** of Phase 16 apply history. Phase 17 correctly acknowledges this by:
- Storing a new `correction_value_json: { v: scalar }` in the proposal table (for the new correction only)
- Displaying a clear Mode B warning for text fields where the pre-apply summary may be truncated
- Never claiming to "restore the exact original value" — only to "use the pre-apply summary as a starting point"

After Sameer/Dina review and approval of this plan, implementation can proceed using the Phase 17 implementation Cursor prompt.

---

*Plan created: 2026-06-27. Planning only. No source code, migration, schema, or UI changes made.*

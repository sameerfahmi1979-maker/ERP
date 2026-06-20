# ERP COMMON AI.3 — AI Duplicate / Conflict Detection — Planning Report

**Phase:** ERP COMMON AI.3 — Planning  
**Date:** 2026-06-17  
**Status:** PLAN COMPLETE — Awaiting Sameer/ChatGPT Review  

---

## Files Reviewed

### Source Code

- `src/server/actions/master-data/parties.ts` — `detectPartyDuplicates()` function and `detect_possible_party_duplicates` RPC
- `src/server/actions/dms/ai-links.ts` — Smart link suggestions (party matching from document content)
- `src/server/actions/dms/document-understanding.ts` — AI.2 Understanding view model
- `src/server/actions/ai/common/field-suggestions.ts` — `conflict_detected` suggestion type in COMMON AI.1
- `src/lib/ai/common/registry/` — COMMON AI.1 entity registry

### DB Tables Reviewed (live DB)

| Table | Key finding |
|---|---|
| `erp_ai_feature_flags` | `ERP_AI_DUPLICATE_DETECT` exists, `is_enabled=false` ✅ |
| `permissions` | `ai.duplicates.view` + `ai.duplicates.review` both exist ✅ |
| `erp_ai_duplicate_candidates` | Does NOT exist — migration required |
| `erp_ai_duplicate_candidate_events` | Does NOT exist — migration required |
| `parties` | `display_name`, `legal_name_en` available |
| `party_tax_registrations` | Has `party_id`, `trn` |
| `party_licenses` | Has `party_id`, `license_number`, `expiry_date`, `dms_license_document_id` |
| `party_bank_details` | Has `party_id`, `iban` |
| `party_contacts` | Has `party_id`, `email`, `phone` |
| `owner_companies` | Has `trade_name`, `legal_name_en` |
| `branches` | Has `trade_license_branch_ref` |
| `dms_upload_sessions` | Has `sha256_hash`, `document_id` — file hash duplicate detection ready |
| `dms_document_links` | Has `entity_type`, `entity_id`, `is_primary` — cross-entity link detection ready |

---

## Main Findings

### 1. Existing duplicate logic is limited

`detectPartyDuplicates()` exists but:
- Called only during form add/edit (not stored as persistent candidate)
- Uses `detect_possible_party_duplicates` DB RPC (good — can be reused)
- Does not scan organizations, branches, sites, or DMS documents
- No persistent candidate storage

### 2. Feature flag and permissions already seeded

`ERP_AI_DUPLICATE_DETECT` and both `ai.duplicates.*` permissions are ready. No flag migration needed.

### 3. New candidate tables are required

Neither `erp_ai_duplicate_candidates` nor `erp_ai_duplicate_candidate_events` exist. These must be created. The migration is clearly defined in the optional migration review SQL.

### 4. Existing `detect_possible_party_duplicates` RPC is reusable

The DB function accepts TRN, license, IBAN parameters (though the current server action doesn't use all of them). AI.3 can call this RPC for party scans without writing new SQL for simple cases.

### 5. DMS file hash duplicate detection infrastructure exists

`dms_upload_sessions.sha256_hash` + `is_duplicate` + `duplicate_document_id` already capture file hash duplicates during upload. AI.3 can scan across all sessions to surface these as persistent candidates.

### 6. Party licenses have DMS link column

`party_licenses.dms_license_document_id` directly links to the DMS document. This enables deterministic expiry conflict detection: compare `party_licenses.expiry_date` vs `dms_documents.expiry_date` for the linked trade license.

---

## Whether One-Phase Implementation is Recommended

**Yes — strongly recommended as one phase**, with these components:

| Component | Complexity | Notes |
|---|---|---|
| Migration (2 tables) | Low | Straightforward, no FK to non-existent tables |
| Deterministic detection engine | Medium | 9 SQL rules, well-defined |
| AI-assisted detection | Medium | Name similarity + content conflict, behind flag |
| Server actions (7) | Medium | Standard pattern |
| Admin review UI | Medium | List + comparison + actions |
| Record-level alerts | Low | Simple pending count query |
| AI.2 integration | Low | Add count to understanding view model |

**Total estimated complexity: Medium — one focused implementation run.**

---

## Whether Migration is Recommended

**Yes — migration is required.**

- `erp_ai_duplicate_candidates` table is essential
- `erp_ai_duplicate_candidate_events` is recommended for audit trail

Both tables follow the existing ERP patterns (BIGINT PK, RLS ENABLED+FORCED, soft delete, set_updated_at trigger).

---

## Whether Event Table is Recommended

**Yes — include in v1.**

Rationale:
- Audit trail of who reviewed, confirmed, or ignored a duplicate is important for compliance
- Consistent with `erp_ai_field_suggestion_events` pattern from COMMON AI.1B
- Lean table (5 columns) — minimal overhead
- Without it, review history is lost

---

## Biggest Risks

| Risk | Assessment |
|---|---|
| High false positive rate for name similarity | Medium — mitigated by confidence threshold ≥ 0.70 and easy Ignore action |
| Arabic name variants require careful AI prompt | Medium — test with UAE names in UAT |
| TRN column check in party_tax_registrations | Low — `trn` column confirmed present |
| Scan performance for large datasets | Low — all deterministic rules use SQL GROUP BY; well-indexed |
| User confusion between "duplicate candidate" and "confirmed merge action" | Low — clear UX copy: no Merge button |

---

## Recommended Next Action

**Sameer/ChatGPT review this plan and SQL review files before issuing the implementation prompt.**

Key approval decisions:
1. Confirm one-phase implementation
2. Confirm candidate table + events table in v1
3. Confirm admin UI route: `/admin/ai/duplicates` (vs `/admin/dms/intelligence/duplicates`)
4. Confirm AI-assisted rules (name similarity + content conflict) in v1
5. Confirm record-level alerts on Organization + Party forms
6. Confirm AI.3 feeds into AI.2 Understanding tab
7. Confirm max 50 AI calls per scan is acceptable cost ceiling

---

**End of Planning Report**

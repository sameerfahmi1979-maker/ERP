# ERP COMMON AI.3 — AI Duplicate / Conflict Detection Implementation Report

**Phase:** ERP COMMON AI.3 — Implementation  
**Date:** 2026-06-17  
**Status:** CLOSED / PASS ✅  

---

## Summary

Implemented a review-based duplicate and conflict detection system for Party, Organization, Branch, Work Site, and DMS documents. The system creates **review candidates only** — no auto-merge, delete, update, or unlink.

---

## Migration

**File:** `supabase/migrations/20260617120000_erp_common_ai_3_duplicate_candidates.sql`  
**Applied to live DB:** Yes (via `user-supabase`)

### Tables created

| Table | Purpose |
|---|---|
| `erp_ai_duplicate_candidates` | Duplicate/conflict review candidates (soft delete, candidate_key dedupe) |
| `erp_ai_duplicate_candidate_events` | Append-only audit trail |

### RLS

- Both tables: **ENABLED + FORCED**
- Candidates: SELECT (`ai.duplicates.view` / `ai.common.admin` / `system_admin`), INSERT (`ai.common.admin`), UPDATE (`ai.duplicates.review` / admin)
- Events: SELECT (view permission), INSERT (`ai.duplicates.review` — corrected per plan review)
- No DELETE policy on events (append-only)

### Feature flag

- `ERP_AI_DUPLICATE_DETECT` — **kept disabled** (not enabled in migration)

---

## Library (`src/lib/ai/common/duplicate-detection/`)

| File | Role |
|---|---|
| `types.ts` | Strict literal unions, scan/candidate types |
| `candidate-builder.ts` | Key builder, IBAN masking, evidence sanitization, persistence helpers |
| `deterministic-rules.ts` | 11 deterministic detection rules |
| `ai-rules.ts` | 2 AI-assisted rules (name similarity, wrong document link) |
| `scan-engine.ts` | `runDuplicateScan`, entity scan, supersede scope |
| `index.ts` | Barrel export |

---

## Deterministic rules (v1)

1. Same TRN across parties  
2. Same IBAN across parties (masked in storage)  
3. Same license number across parties  
4. Same email across party contacts  
5. Same normalized party display name  
6. Same normalized company trade name  
7. Same branch `trade_license_branch_ref`  
8. Same site name + emirate/area/address  
9. Same DMS file SHA256 hash  
10. Same DMS document linked to multiple entities  
11. Party license expiry vs linked DMS document expiry conflict  

---

## AI-assisted rules (v1)

1. **Similar names** — Arabic/English party/company name variants (prefilter + `callStructuredCompletion`, confidence ≥ 0.70)  
2. **Wrong document link** — AI summary vs linked entity name mismatch  

**Limits:** Max 50 AI calls per scan. Skipped if provider not configured or flag disabled.

---

## Server actions

**File:** `src/server/actions/ai/common/duplicate-detection.ts`

| Action | Permission |
|---|---|
| `scanForDuplicates` | `ai.common.admin` + flag |
| `scanDuplicateCandidatesForEntity` | `ai.common.admin` + flag |
| `getDuplicateCandidates` | `ai.duplicates.view` |
| `getDuplicateCandidateDetail` | `ai.duplicates.view` |
| `reviewDuplicateCandidate` | `ai.duplicates.review` |
| `markDuplicateCandidateResolved` | `ai.duplicates.review` |
| `ignoreDuplicateCandidate` | `ai.duplicates.review` |
| `supersedeDuplicateCandidates` | `ai.common.admin` |
| `getDuplicateCandidateCountForEntity` | `ai.duplicates.view` |
| `getDuplicateCandidateCountForDocument` | `ai.duplicates.view` |
| `getDuplicateCandidateSummary` | `ai.duplicates.view` |

Scan uses `createAdminClient()` after permission check for cross-entity reads/inserts.

---

## Admin UI

**Route:** `/admin/ai/duplicates`  
**Sidebar:** Administration → AI Duplicates  

Features:
- Summary cards (Pending, High Confidence, Confirmed, Ignored/Resolved)
- Status filter + candidate list + detail panel
- Scan card (Deterministic / Full with AI, Dry Run)
- Review actions: Confirm Duplicate, Confirm Conflict, Not a Duplicate, Ignore, Mark Resolved
- Open Record / Open Document links
- Disabled scan message when flag is off

**Explicitly NOT included:** Merge, Delete, Auto-fix, Bulk approve

---

## Record-level alerts

- `DuplicateCandidateAlert` on Party workspace form  
- `DuplicateCandidateAlert` on Organization workspace form  
- Amber alert with link to filtered duplicates page  

---

## AI.2 Understanding integration

- `duplicateCandidates` block added to `DmsDocumentUnderstanding`  
- Health score includes duplicate warning  
- Recommended action: Review duplicates  
- Understanding tab card when pending count > 0  

---

## Query keys / invalidation

Added to `query-keys.ts` and `invalidation.ts`:
- `duplicateCandidates`, `duplicateCandidateDetail`, `duplicateCandidateCounts`, `duplicateCandidateDocumentCount`

---

## Security

- IBAN masked (first4 + **** + last4) in `value_a`/`value_b`  
- No raw OCR/content/prompt/AI response in DB, logs, or UI  
- Confidential DMS documents: document_no only for non-admin in detail view  
- All AI via existing provider bridge — no direct OpenAI imports  

---

## Verification

| Check | Result |
|---|---|
| `npm run typecheck` | PASS (0 errors) |
| `npm run build` | PASS — route `/admin/ai/duplicates` present |

---

## UAT checklist

1. Enable `ERP_AI_DUPLICATE_DETECT` in AI Settings (UAT only)  
2. Run Deterministic Scan (dry run first)  
3. Verify candidates appear in `/admin/ai/duplicates`  
4. Review: Confirm Duplicate / Ignore / Mark Resolved  
5. Open Party/Org record — verify amber alert when pending candidates exist  
6. Open DMS document Understanding tab — verify duplicate count card  
7. Run Full Scan with AI (confirm ≤50 calls warning)  
8. Verify scan blocked when flag disabled; list/review still works  

---

## Not implemented (deferred)

- Auto-merge / merge wizard  
- Auto-delete / auto-unlink / auto-update  
- Bulk fix tools  
- Branch/Site record-level alerts  
- Scheduled background scan  
- Employee/Vehicle/Fleet duplicate detection  

---

## Recommended next phase

ERP COMMON AI.4 or approved module phase per Sameer/Dina priority (e.g., ERP HR Module 003A).

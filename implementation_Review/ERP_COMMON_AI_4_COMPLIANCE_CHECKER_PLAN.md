# ERP COMMON AI.4 — AI Compliance Checker Plan

**Phase:** ERP COMMON AI.4 — Planning  
**Date:** 2026-06-17  
**Status:** PLAN ONLY — not implemented  
**Basis:** Live DB audit, COMMON MD.1 rules, DMS.15 compliance summary, AI.2 Understanding, AI.3 duplicates, COMMON AI.1 field suggestions, ERP AI Roadmap Phase 4.

> **PLAN ONLY — No source files changed. No migrations applied. No flags enabled.**

---

## 1. Executive Summary

**Goal:** Build a safe, review-based AI.4 compliance checker that evaluates implemented ERP entities (company, party, branch, site) and their linked DMS documents against `dms_required_document_rules`, expiry/risk/completeness signals, and cross-AI open conflicts (AI.3 duplicates, AI.1 `conflict_detected` suggestions).

**Core principle:** Produce **compliance findings for human review** — no automatic approval, document creation, ERP updates, waivers, or resolution.

**Architecture:** Deterministic-first engine (free, high confidence) → optional limited AI-assisted notes (structured JSON, cost-capped) → persist findings in `erp_ai_compliance_findings` → admin review at `/admin/ai/compliance` → record-level alerts on Organization + Party → AI.2 Understanding integration.

**Key audit findings:**
- `ERP_AI_COMPLIANCE` flag exists (`is_enabled=false`) — use this; **`ERP_AI_COMPLIANCE_CHECKER` does not exist**
- `ai.compliance.view` + `ai.compliance.generate` permissions exist; **`ai.compliance.review` does not** (recommend adding)
- `dms_required_document_rules` table live with **8 seeded rules** (company=5, site=3; no party/branch seeds)
- `getDmsEntityDocumentComplianceSummary` computes expiry/risk but **`missingRequiredDocuments` is hardcoded to 0**
- AI.3 `erp_ai_duplicate_candidates` and AI.1 `conflict_detected` suggestions are integration-ready
- Roadmap proposed `erp_ai_compliance_snapshots` — **deferred to v1.1**; v1 uses findings table + computed entity summary

**Recommendation:** Implement as **one systematic phase** after plan approval. Low migration risk; high reuse of existing DMS/COMMON AI infrastructure.

---

## 2. Current Compliance Capability Inventory

| Capability | Location | Current behavior | Gap | Reusable for AI.4 |
|---|---|---|---|---|
| Required document rules master | `dms_required_document_rules` + CRUD in `dms-required-document-rules.ts` | 8 rules seeded; admin CRUD at `/admin/common-master-data/dms-required-documents` | No evaluator consumes rules | **Yes — primary input** |
| Entity document compliance summary | `getDmsEntityDocumentComplianceSummary()` in `entity-documents.ts` | Counts expired/expiring/high/critical risk linked docs | `missingRequiredDocuments: 0` stub | **Enhance + delegate to AI.4 engine** |
| Compliance cards UI | `dms-entity-document-compliance-cards.tsx` | 5 KPI cards (no missing count shown) | Missing-required card absent | **Extend with open findings count** |
| DMS expiry reminders | `expiry-reminders.ts` + `dms_expiry_reminders` | Per-document schedule [90..0 days] | Document-centric only | **Join via entity links** |
| DMS renewals | `renewals.ts` + `dms_renewal_requests` | Open renewal workflow per document | Not aggregated per entity | **Open renewal → finding** |
| DMS completeness/risk | `ai-completeness.ts`, `ai-risk.ts` | Per-document scores on `dms_documents` | Not entity-aggregated | **Read stored scores — no new AI** |
| AI.2 Understanding | `document-understanding.ts` + `understanding-builder.ts` | Document health score + recommended actions | No entity compliance | **Add compliance findings block** |
| AI.3 duplicates | `duplicate-detection.ts` + `erp_ai_duplicate_candidates` | Pending candidates with review UI | Separate from compliance | **Surface as `duplicate_conflict_open` findings** |
| COMMON AI.1 conflicts | `erp_ai_field_suggestions` where `suggestion_type='conflict_detected'` | Per-field pending conflicts | Only on generate | **Surface as `field_suggestion_conflict_open`** |
| Party license expiry vs DMS | AI.3 `conflict_license_expiry` rule | Already detects mismatch | Stored as duplicate candidate | **Also mirror as compliance finding OR cross-link** |
| Organization `compliance_status` | `owner_companies.compliance_status` | Manual dropdown (compliant/non_compliant/…) | Not AI-driven | **Read-only display; do NOT auto-update in v1** |
| Party compliance profiles | `party_compliance_profiles` | KYC/blacklist fields | Compliance tab disabled in UI | **Deferred — not v1 blocker** |

---

## 3. Current App and DB Audit Findings

### Live DB (verified 2026-06-17 via `user-supabase`)

| Item | Finding |
|---|---|
| Feature flag | `ERP_AI_COMPLIANCE` — `is_enabled=false`, `requires_human_review=false` |
| Permissions | `ai.compliance.view`, `ai.compliance.generate` — both active |
| `erp_ai_compliance_*` tables | **Do not exist** |
| `dms_required_document_rules` | 8 active rules; RLS ENABLED+FORCED |
| Required rules breakdown | company: TRADE_LICENSE (req), VAT_CERT (req), INSURANCE (req); TRN/POA optional; site: ACCESS/CICPA/ADNOC optional |
| Entity RLS | `dms_document_links`, `dms_documents`, `work_sites`, AI tables: FORCE RLS; `parties`, `owner_companies`, `branches`: RLS enabled only |

### Code gaps

1. No `src/lib/ai/common/compliance-checker/` folder
2. No compliance server actions beyond rules CRUD
3. Party uses `PartyDmsDocumentsTab` without compliance cards (org/branch/site use `DmsEntityDocumentsTab`)
4. No `/admin/ai/compliance` route (duplicates has `/admin/ai/duplicates` pattern to follow)
5. No feature flag check for `ERP_AI_COMPLIANCE` anywhere in codebase

---

## 4. Scope for AI.4 v1

### In scope — entity types

| Entity | DB table | Rules today | v1 checks |
|---|---|---|---|
| `company` | `owner_companies` | 5 seeded rules | Full deterministic suite |
| `site` | `work_sites` | 3 seeded rules | Full deterministic suite |
| `party` | `parties` | 0 rules (recommend seed) | All checks except rule-missing until seeds added |
| `branch` | `branches` | 0 rules (recommend seed) | Same as party |
| `dms_document` | `dms_documents` | N/A | Document-scoped scan via entity links |

### In scope — detection categories

- Missing required documents (rule engine)
- Expired / expiring-soon linked documents
- High/critical document risk
- Incomplete metadata (completeness score threshold)
- Missing OCR / AI summary / embedding readiness
- Open AI.3 duplicate/conflict candidates
- Open AI.1 `conflict_detected` field suggestions
- Party license expiry vs linked DMS document mismatch
- TRN mismatch (from AI.3 or party_tax_registrations vs doc metadata)
- Wrong document type vs required rule
- Open DMS renewal requests
- `blocks_activation` rule warning (report only)
- Confidential document admin-review note (non-admin viewers)

### Out of scope — deferred

See Section 5.

---

## 5. Out of Scope / Deferred Entities

| Item | Reason |
|---|---|
| employee, vehicle, equipment, workshop, inventory, transport, weighbridge | Modules not implemented |
| finance, projects, HSE compliance modules | Not built |
| Auto-fix / auto-waive / auto-upload / auto-create documents | Locked safety rule |
| Auto-update `owner_companies.compliance_status` | Human-only in v1 |
| Scheduled/cron background scans | On-demand only in v1 |
| `erp_ai_compliance_snapshots` aggregate table | Compute from findings in v1; add if perf needed |
| Full legal clause / ISO / ADNOC / HSE compliance engine | v2+ |
| Party compliance profiles / KYC tab enforcement | Party Master 5A.4 deferred |
| `entity_subtype` / scoped rule filtering (`owner_company_id`, `branch_id`, `department_id`) | v1.1 — evaluate all active rules for entity_type |
| AI-heavy document clause analysis | Optional v1.1 behind flag; max 20 calls/scan |

---

## 6. Compliance Finding Types and Taxonomy

| Finding Type | Method | Default Severity | Evidence (safe) | Recommended Action |
|---|---|---|---|---|
| `missing_required_document` | Deterministic | high/critical if `is_required` | rule_code, type_code, rule_name | Upload & link document via DMS inbox |
| `expired_document` | Deterministic | critical | document_no, expiry_date | Start renewal / upload new version |
| `expiring_soon_document` | Deterministic | medium/high | document_no, days_until_expiry | Plan renewal |
| `document_high_risk` | Deterministic | high | document_no, ai_risk_level | Review Intelligence tab |
| `document_critical_risk` | Deterministic | critical | document_no, ai_risk_level | Immediate review |
| `document_incomplete` | Deterministic | medium | completeness_score, missing field labels | Fill metadata |
| `missing_ocr` | Deterministic | medium | document_no, ocr status | Run OCR |
| `missing_ai_summary` | Deterministic | low/medium | document_no, summary status | Generate summary |
| `missing_embedding` | Deterministic | low | document_no, embedding status | Generate embedding |
| `unlinked_document` | Deterministic | info | entity has zero links | Link document |
| `wrong_document_type` | Deterministic | high | expected type_code, actual type_code | Replace or relink correct doc |
| `duplicate_conflict_open` | Deterministic (read AI.3) | high | candidate_type, candidate_id | Review in AI Duplicates |
| `field_suggestion_conflict_open` | Deterministic (read AI.1) | medium | field_label, suggestion_id | Review AI Review tab |
| `license_expiry_mismatch` | Deterministic | high | party license date, doc expiry | Reconcile license record |
| `trn_mismatch` | Deterministic | high | masked TRN values | Verify tax registration |
| `missing_required_metadata` | Deterministic | medium | missing field labels | Fill metadata |
| `missing_issue_date` | Deterministic | medium | rule requires issue_date | Add issue date |
| `confidential_document_requires_admin_review` | Deterministic | info | document_no only for non-admin | Request admin review |
| `open_renewal_request` | Deterministic | medium | renewal_no, status | Complete renewal workflow |
| `blocks_activation_warning` | Deterministic | high | rule_code with blocks_activation=true | Management review (no enforce) |
| `ai_compliance_note` | AI-assisted | varies | ai_reason capped 500 chars | Human review note |

**Confidence:** Deterministic findings = 0.95–1.00. AI notes ≥ 0.70 to persist.

---

## 7. Deterministic Compliance Rules

### Rule engine flow (per entity)

```
1. Load active dms_required_document_rules WHERE entity_type = :entityType AND is_active AND deleted_at IS NULL
2. Load linked documents via dms_document_links → dms_documents (+ type, risk, completeness, OCR, summary, embedding)
3. For each required rule:
   a. Find linked doc(s) matching document_type_id (or type_code)
   b. If is_required AND no matching active doc → missing_required_document
   c. If doc found but expired → expired_document
   d. If doc expiring within threshold (30d default, or rule.reminder_days_before_expiry min) → expiring_soon_document
   e. If requires_issue_date AND doc.issue_date IS NULL → missing_issue_date
   f. If linked doc type_id ≠ rule.document_type_id → wrong_document_type
   g. If blocks_activation → blocks_activation_warning (informational even if doc present)
4. For each linked document (not rule-specific):
   a. ai_risk_level high/critical → document_high_risk / document_critical_risk
   b. completeness_score < 0.6 → document_incomplete
   c. missing OCR/content → missing_ocr
   d. ai_summary_status not complete → missing_ai_summary
   e. summary_embedding_status not complete → missing_embedding (if semantic search flag on)
5. Cross-AI reads (no new AI calls):
   a. erp_ai_duplicate_candidates pending involving entity → duplicate_conflict_open
   b. erp_ai_field_suggestions pending conflict_detected for entity → field_suggestion_conflict_open
   c. party_licenses.dms_license_document_id expiry ≠ dms_documents.expiry_date → license_expiry_mismatch
6. dms_renewal_requests open statuses for linked docs → open_renewal_request
7. Build finding_key per finding; upsert open findings; supersede stale open findings on re-scan
```

### Thresholds (constants)

| Constant | Value |
|---|---|
| `COMPLIANCE_EXPIRING_SOON_DAYS` | 30 |
| `COMPLIANCE_INCOMPLETE_THRESHOLD` | 0.60 |
| `COMPLIANCE_MAX_FINDINGS_PER_ENTITY` | 200 |
| `COMPLIANCE_MAX_FINDINGS_PER_SCAN` | 2000 |

---

## 8. AI-Assisted Compliance Rules

**v1: Optional, disabled by default, max 20 AI calls per full scan.**

Use `callCommonAiStructuredCompletion()` via existing provider bridge — **never direct OpenAI**.

### AI Rule A: Document compliance note

**Trigger:** Linked document has complete AI summary + completeness evaluated; deterministic findings exist for entity; prefilter to top 5 docs with highest risk.

**Input (safe):** document title, type_code, ai_summary (capped 500), risk_level, completeness_score, list of deterministic finding types (no OCR/content).

**Output (Zod):**

```json
{ "notes": [{ "documentId": 1, "severity": "medium", "reason": "...", "confidence": 0.75 }] }
```

**Persist as:** `finding_type=ai_compliance_note`, `detection_method=ai` only if confidence ≥ 0.70.

### AI Rule B: Wrong entity/type hint (optional v1.1)

Reuse AI.3 `wrong_document_link` logic — do not duplicate; cross-reference existing AI.3 candidates instead of new AI calls in v1.

---

## 9. Finding Data Model

**Primary table:** `erp_ai_compliance_findings` (see optional migration review SQL)

### Finding key design

```
{finding_type}:{entity_type}:{entity_id}:{document_id|rule_id|source_id}:{field_code?}
```

Examples:
- `missing_required_document:company:3:rule:12` (rule_id=12)
- `expired_document:company:3:doc:88`
- `duplicate_conflict_open:party:45:candidate:102`
- `field_suggestion_conflict_open:party:45:suggestion:55:trade_name`

### Entity summary (computed, not stored in v1)

```typescript
interface EntityComplianceSummary {
  entityType: string;
  entityId: number;
  openFindingCount: number;
  criticalCount: number;
  highCount: number;
  overallStatus: 'ready' | 'missing_documents' | 'expired' | 'expiring_soon' | 'needs_review' | 'blocked_candidate';
  lastScannedAt: string | null;
}
```

Status derivation:
- Any `duplicate_conflict_open` critical → `blocked_candidate`
- Any `missing_required_document` → `missing_documents`
- Any `expired_document` → `expired`
- Any `expiring_soon_document` (no expired/missing) → `expiring_soon`
- Any other open finding → `needs_review`
- Else → `ready`

---

## 10. Finding Status Lifecycle

| Status | Meaning |
|---|---|
| `open` | Newly detected, awaiting review |
| `reviewed` | Seen, needs_more_review |
| `accepted` | Valid finding, action planned |
| `waived` | Management waived with reason |
| `resolved` | Addressed outside system (manual) |
| `false_positive` | Not a real issue |
| `superseded` | Replaced by newer scan |
| `failed` | Detection/storage error |

### Review decisions

`accepted`, `waived`, `resolved`, `false_positive`, `needs_more_review`

### Resolution types (stored in `review_decision` / event metadata)

`uploaded_required_document`, `metadata_fixed`, `document_renewed`, `risk_reviewed`, `duplicate_resolved`, `waived_by_management`, `not_applicable`, `needs_more_review`

**No automatic resolution in v1.**

---

## 11. Database Impact Review

| Change | Required? |
|---|---|
| `erp_ai_compliance_findings` | **Yes** |
| `erp_ai_compliance_finding_events` | **Recommended** (append-only audit) |
| `ai.compliance.review` permission | **Recommended** (parity with AI.3) |
| Party/branch rule seeds | **Recommended** (optional data migration) |
| `erp_ai_compliance_snapshots` | **Deferred** |
| Changes to existing tables | **None** |

---

## 12. SQL Review — Recommended / Optional

See:
- `implementation_Review/sql_review/ERP_COMMON_AI_4_SCHEMA_REVIEW.sql` (read-only audit queries)
- `implementation_Review/sql_review/ERP_COMMON_AI_4_OPTIONAL_MIGRATION_REVIEW.sql` (proposed DDL)

---

## 13. RLS / Permission / Confidentiality Design

### RLS (findings table)

| Operation | Policy |
|---|---|
| SELECT | `ai.compliance.view` OR `ai.common.admin` OR `system_admin` |
| INSERT | `ai.compliance.generate` OR `ai.common.admin` OR `system_admin` |
| UPDATE | `ai.compliance.review` OR `ai.compliance.generate` OR admin |
| DELETE | Soft delete only via admin |

### Event table

- Append-only; INSERT requires review/generate permission; no UPDATE/DELETE policies

### Confidentiality

- `hr`/`legal`/`executive` documents: non-admin users see `document_no` + finding type only; `ai_reason`/summary redacted
- Never store OCR/content/prompt in `evidence_json`
- TRN/IBAN masked in `expected_value`/`actual_value`

### Scan permission

- Full scan: `ai.common.admin` OR `system_admin`
- Entity scan: same
- List/review: `ai.compliance.view`
- Review actions: `ai.compliance.review` (or `ai.compliance.generate` fallback if review perm not added)

Also require underlying entity view permission where practical (best-effort TS gate).

---

## 14. Server Action Design

**File:** `src/server/actions/ai/common/compliance-checker.ts`

| Action | Permission | Flag gate |
|---|---|---|
| `scanComplianceFindings(input)` | `ai.common.admin` | `ERP_AI_COMPLIANCE` |
| `scanComplianceForEntity(input)` | `ai.common.admin` | `ERP_AI_COMPLIANCE` |
| `getComplianceFindings(filters)` | `ai.compliance.view` | None (existing findings readable) |
| `getComplianceFindingDetail(id)` | `ai.compliance.view` | None |
| `reviewComplianceFinding(input)` | `ai.compliance.review` | None |
| `markComplianceFindingResolved(input)` | `ai.compliance.review` | None |
| `waiveComplianceFinding(input)` | `ai.compliance.review` | None |
| `markComplianceFindingFalsePositive(input)` | `ai.compliance.review` | None |
| `getComplianceFindingCountForEntity(input)` | `ai.compliance.view` | None |
| `getComplianceFindingCountForDocument(input)` | `ai.compliance.view` | None |
| `getComplianceSummaryForEntity(input)` | `ai.compliance.view` | None |
| `isComplianceCheckerEnabled()` | public read | — |

**Audit events:** `ai_compliance_scan_started`, `ai_compliance_scan_completed`, `ai_compliance_finding_reviewed`, `ai_compliance_finding_waived`, `ai_compliance_finding_resolved`, `ai_compliance_findings_superseded`

Safe metadata only — no document content.

---

## 15. Compliance Engine Design

**Folder:** `src/lib/ai/common/compliance-checker/`

| File | Purpose |
|---|---|
| `types.ts` | Finding types, severities, statuses, scan input/result |
| `finding-builder.ts` | finding_key, evidence sanitization, masking |
| `rule-engine.ts` | Required document rule evaluation |
| `document-checks.ts` | Expiry, risk, completeness, OCR/summary/embedding |
| `cross-ai-checks.ts` | AI.3 + AI.1 reads |
| `ai-notes.ts` | Optional AI-assisted notes (v1 optional) |
| `scan-engine.ts` | `runComplianceScan`, supersede, persist |
| `index.ts` | Barrel |

**Scan uses `createAdminClient()` after permission check** (same pattern as AI.3 duplicate scan).

**Enhance existing:** `getDmsEntityDocumentComplianceSummary` → call rule engine for real `missingRequiredDocuments` count.

---

## 16. Review UI Design

**Route:** `/admin/ai/compliance`  
**Sidebar:** Administration → AI Compliance (after AI Duplicates)

**Components:** `src/features/ai/common/compliance-checker/`

- `compliance-findings-page-client.tsx` — summary cards, scan card, filters, list+detail
- `compliance-finding-list.tsx`
- `compliance-finding-detail.tsx`
- `compliance-finding-badges.tsx`
- `compliance-scan-card.tsx`
- `index.ts`

**Summary cards:** Open, Critical, High, Waived/Resolved

**Scan card:** Deterministic scan, optional AI notes, dry run, disabled message when flag off

**Review actions:** Accept, Waive, Mark Resolved, False Positive, Open Record, Open Document

**Explicitly forbidden:** Auto-fix, Auto-upload, Auto-waive-all, Bulk resolve

---

## 17. Record-Level Compliance Alert Design

**Component:** `ComplianceFindingAlert` (mirror `DuplicateCandidateAlert`)

| Form | Entity type | Required v1 |
|---|---|---|
| `organization-workspace-form.tsx` | `company` | **Yes** |
| `party-workspace-form.tsx` | `party` | **Yes** |
| `work-site-workspace-form.tsx` | `site` | Optional if trivial |
| `branch-workspace-form.tsx` | `branch` | Optional |

Alert: amber card with open finding count + link to `/admin/ai/compliance?entityType=&entityId=`

Does not block save. Does not auto-run scan.

**Also:** Extend `DmsEntityDocumentsTab` compliance cards with missing-required + open findings counts. Add compliance cards to Party (migrate to shared tab or add cards to `PartyDmsDocumentsTab`).

---

## 18. Integration with DMS AI.2 Understanding Center

**Files to update (implementation phase):**
- `src/lib/dms/understanding/types.ts` — add `complianceFindings: { openCount, hasCritical, reviewRoute }`
- `src/server/actions/dms/document-understanding.ts` — count open findings for document
- `src/lib/dms/understanding/understanding-builder.ts` — health warning + `REVIEW_COMPLIANCE` action
- `dms-document-understanding-section.tsx` — compliance findings card

Read-only — no scan trigger from Understanding tab.

---

## 19. Integration with AI.3 Duplicate / Conflict Detection

- During entity scan, query `erp_ai_duplicate_candidates` WHERE status=`pending` AND entity involved
- Create `duplicate_conflict_open` findings referencing `source_duplicate_candidate_id`
- Do NOT auto-resolve duplicates when compliance finding waived
- Understanding + compliance admin UI link to `/admin/ai/duplicates?entityType=&entityId=`
- Reuse `conflict_license_expiry` / `conflict_trn_value` / `wrong_document_link` candidate types

---

## 20. Integration with COMMON AI.1 Field Suggestions

- Query `erp_ai_field_suggestions` WHERE `entity_type` + `entity_id` + `status='pending'` + `suggestion_type='conflict_detected'`
- Create `field_suggestion_conflict_open` finding with `source_field_suggestion_id`
- Link recommended action to entity AI Review tab
- Do NOT auto-apply suggestions

---

## 21. Feature Flag Design

| Flag | Action |
|---|---|
| `ERP_AI_COMPLIANCE` | **Use existing flag** — do NOT create `ERP_AI_COMPLIANCE_CHECKER` |
| Default | Keep `is_enabled=false` after migration |
| Scan actions | Return controlled `FEATURE_DISABLED` when false |
| List/review/count | Work on existing findings even when flag false |

Set `requires_human_review=true` on flag during UAT (optional admin update — not in migration).

---

## 22. Audit and Logging Design

- `logAudit()` for scan start/complete and review actions (entity_id + safe counts)
- `erp_ai_compliance_finding_events` append-only for finding lifecycle
- `erp_ai_usage_logs` for AI note calls only (feature_area=`ERP_AI_COMPLIANCE`, no prompt/content)
- Never log: OCR, content_text, prompts, raw AI JSON, TRN/IBAN full values

---

## 23. Performance and Cost Control

| Control | Value |
|---|---|
| Max findings per entity | 200 |
| Max findings per full scan | 2000 |
| Max AI calls per scan | 20 (v1) |
| Dry run | Preview counts, no insert/supersede |
| Supersede on re-scan | Yes — open findings not re-detected → superseded |
| Deterministic first | Always |
| Scheduled scans | Deferred |

---

## 24. Error Handling and Idempotency

- `finding_key` + partial unique index on open status prevents duplicates (same as AI.3)
- Insert conflict → skip as `skippedExisting`
- Rule evaluation try/catch per entity — failed entities in `failedEntities[]` scan summary
- Supersede open findings in scope before insert (unless dry run)
- AI provider not configured → skip AI notes gracefully

---

## 25. Testing and UAT Plan

1. Enable `ERP_AI_COMPLIANCE` for UAT admin only
2. Company missing TRADE_LICENSE → `missing_required_document` finding
3. Link expired trade license → `expired_document`
4. All required docs valid → entity summary `ready`
5. High-risk linked doc → `document_high_risk`
6. Completeness < 60% → `document_incomplete`
7. Pending AI.3 candidate → `duplicate_conflict_open`
8. Pending AI.1 conflict_detected → `field_suggestion_conflict_open`
9. Waive finding with reason → status `waived` + event
10. False positive → status `false_positive`
11. User without `ai.compliance.view` → access denied
12. Confidential doc → redacted evidence for non-admin
13. Dry run → preview count, no DB writes
14. Re-scan → supersede old open findings, no duplicate keys
15. Organization/Party alert shows count + link
16. AI.2 Understanding shows compliance card

---

## 26. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| No party/branch rule seeds | Optional seed migration; checks still run for expiry/risk/AI cross-refs |
| Scoped rules not evaluated (`owner_company_id`, etc.) | Document in v1 limitation; v1.1 scoped filter |
| Performance on large entity sets | Cap findings; entity-scoped scans; admin batch with limit |
| Duplicate findings vs AI.3 overlap | Cross-link via source IDs; different review UIs OK |
| Permission gap (`ai.compliance.review` missing) | Add in migration OR fallback to generate+admin |
| Flag name confusion (`ERP_AI_COMPLIANCE` vs `_CHECKER`) | Use existing `ERP_AI_COMPLIANCE` only |
| Party compliance tab disabled | AI.4 alert on form is sufficient for v1 |

---

## 27. Implementation File Plan

### New files

```
src/lib/ai/common/compliance-checker/types.ts
src/lib/ai/common/compliance-checker/finding-builder.ts
src/lib/ai/common/compliance-checker/rule-engine.ts
src/lib/ai/common/compliance-checker/document-checks.ts
src/lib/ai/common/compliance-checker/cross-ai-checks.ts
src/lib/ai/common/compliance-checker/ai-notes.ts
src/lib/ai/common/compliance-checker/scan-engine.ts
src/lib/ai/common/compliance-checker/index.ts
src/server/actions/ai/common/compliance-checker.ts
src/features/ai/common/compliance-checker/compliance-findings-page-client.tsx
src/features/ai/common/compliance-checker/compliance-finding-badges.tsx
src/features/ai/common/compliance-checker/compliance-finding-alert.tsx
src/features/ai/common/compliance-checker/index.ts
src/app/(protected)/admin/ai/compliance/page.tsx
supabase/migrations/<timestamp>_erp_common_ai_4_compliance_findings.sql
implementation_Review/AI_Phases/Phase_Common_AI_4/ERP_COMMON_AI_4_COMPLIANCE_CHECKER_IMPLEMENTATION_REPORT.md
```

### Modified files

```
src/server/actions/dms/entity-documents.ts          — real missingRequiredDocuments
src/features/dms/entity-documents/dms-entity-document-compliance-cards.tsx
src/features/dms/entity-documents/dms-entity-documents-tab.tsx
src/features/organizations/organization-workspace-form.tsx
src/features/master-data/parties/party-workspace-form.tsx
src/features/master-data/parties/party-dms-documents-tab.tsx  — optional compliance cards
src/lib/dms/understanding/types.ts
src/lib/dms/understanding/understanding-builder.ts
src/server/actions/dms/document-understanding.ts
src/features/dms/documents/sections/dms-document-understanding-section.tsx
src/lib/query/query-keys.ts
src/lib/query/invalidation.ts
src/components/layout/app-sidebar.tsx
.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md
```

---

## 28. Exact Step-by-Step Cursor Implementation Sequence

1. Apply migration (`erp_ai_compliance_findings` + events + optional review permission + optional rule seeds)
2. Verify RLS live via schema review queries
3. Create `compliance-checker` lib (types → builders → rules → scan engine)
4. Create server actions with flag/permission gates
5. Enhance `getDmsEntityDocumentComplianceSummary`
6. Create admin UI at `/admin/ai/compliance`
7. Add sidebar link
8. Add `ComplianceFindingAlert` to Organization + Party forms
9. Extend DMS entity compliance cards (missing count + findings)
10. Integrate AI.2 Understanding (count + action + card)
11. Add query keys + invalidation helpers
12. Run typecheck + build
13. Implementation report + SOT update

---

## 29. Acceptance Criteria

1. Migration applied; RLS ENABLED+FORCED on both new tables
2. `ERP_AI_COMPLIANCE` remains disabled by default
3. Deterministic rule engine evaluates company rules against linked docs
4. `missingRequiredDocuments` no longer hardcoded to 0
5. Admin UI at `/admin/ai/compliance` with scan + review workflow
6. No auto-fix/auto-update/auto-create paths
7. AI.3 + AI.1 cross-references create findings without duplicate AI calls
8. Organization + Party record alerts functional
9. AI.2 Understanding shows compliance open count
10. Confidential documents redacted for non-admin
11. TS PASS + Build PASS

---

## 30. Rollback Plan

1. Disable `ERP_AI_COMPLIANCE` flag immediately
2. Admin UI shows "feature disabled" — existing findings remain readable
3. If critical issue: soft-delete all open findings (`deleted_at=now()`) via admin SQL
4. Drop tables only in dedicated cleanup migration after soak period (not v1)
5. Revert code deploy; findings table can remain without harm

---

## 31. Handoff Summary

### Design question answers

| # | Question | Answer |
|---|---|---|
| 1 | One phase safely? | **Yes** — mirrors AI.3 pattern; manageable scope |
| 2 | Deterministic only? | Required docs, expiry, risk, completeness, OCR/summary, cross-AI reads |
| 3 | AI assistance? | Optional notes only; max 20 calls; v1 can ship without |
| 4 | New finding table? | **Yes — `erp_ai_compliance_findings`** |
| 5 | Event table? | **Recommended for v1** |
| 6 | Avoid repeated findings? | `finding_key` + unique open index + supersede on re-scan |
| 7 | finding_key design? | `{type}:{entity}:{id}:{doc\|rule\|source}:{field?}` |
| 8 | Review UI location? | `/admin/ai/compliance` |
| 9 | Record alerts v1? | **Yes — Organization + Party** |
| 10 | AI.2 integration? | **Yes — read-only count + recommended action** |
| 11 | Confidential docs? | Redact evidence; document_no only for non-admin |
| 12 | AI.3 integration? | Read pending candidates → `duplicate_conflict_open` |
| 13 | AI.1 integration? | Read pending `conflict_detected` → `field_suggestion_conflict_open` |
| 14 | AI cost control? | Deterministic-first; AI optional; caps |
| 15 | Scan/review permissions? | generate/admin scan; view list; review waive/resolve |
| 16 | Scheduled scans? | **Deferred — on-demand only v1** |
| 17 | v2 deferrals? | Snapshots table, scoped rules, employee/fleet, auto-enforcement |

**Next step:** Sameer/ChatGPT review this plan + SQL review files → approve implementation prompt.

---

## Appendix: Feature Flag Name Correction

The planning prompt references `ERP_AI_COMPLIANCE_CHECKER`. **Live DB uses `ERP_AI_COMPLIANCE`.** Implementation must use the existing flag code to avoid duplicate flags and AI Settings UI confusion.

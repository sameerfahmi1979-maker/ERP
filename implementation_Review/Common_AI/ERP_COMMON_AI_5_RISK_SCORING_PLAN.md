# ERP COMMON AI.5 — AI Risk Scoring Plan

**Phase:** ERP COMMON AI.5 — Planning  
**Date:** 2026-06-17  
**Status:** PLAN ONLY — not implemented  
**Basis:** Live DB audit, DMS.12.3 document risk, AI.2 Understanding, AI.3 duplicates, AI.4 compliance, COMMON AI.1 field suggestions, ERP AI Roadmap Phase 5.

> **PLAN ONLY — No source files changed. No migrations applied. No flags enabled.**

---

## 1. Executive Summary

**Goal:** Build a unified, review-based **entity-level** risk scoring system for implemented ERP entities (company, party, branch, site) and DMS documents. AI.5 aggregates existing deterministic signals — DMS document risk/completeness/expiry, AI.4 compliance findings, AI.3 duplicate/conflict candidates, AI.1 `conflict_detected` suggestions, AI.2 Understanding health, OCR/summary/embedding readiness — into a **0–100 risk score** with level, reasons, breakdown, and review workflow.

**Core principle:** Produce **risk scores for human review** — no automatic blocking, approval, document creation, ERP status updates, compliance resolution, or suggestion apply.

**Architecture:** Deterministic-first scoring engine (free, high confidence) → optional limited AI-assisted narrative notes (structured JSON, cost-capped, v1 can ship without) → persist current score in `erp_ai_risk_scores` + append-only events in `erp_ai_risk_score_events` → admin review at `/admin/ai/risk` → record-level alerts on Organization + Party → AI.2 Understanding integration.

**Key audit findings:**
- `ERP_AI_RISK_SCORE` flag exists (`is_enabled=false`) — use this; **`ERP_AI_RISK_SCORING` does not exist**
- `DMS_RISK_SCORE` flag exists and is **enabled** — document risk already live on `dms_documents`
- `ai.risk.view` + `ai.risk.generate` permissions exist; **`ai.risk.review` does not** (recommend adding)
- `erp_ai_risk_*` tables **do not exist** — migration required
- AI.4 `erp_ai_compliance_findings` table exists (migration applied); 0 rows in UAT DB (no scans yet)
- AI.3 `erp_ai_duplicate_candidates` exists; 0 pending rows in UAT DB
- DMS: 17 documents, 5 with `ai_risk_score`; 0 high/critical document risk in UAT
- Roadmap proposed `erp_ai_risk_snapshots` — **deferred**; v1 uses `erp_ai_risk_scores` + events (AI.3/AI.4 pattern)

**Recommendation:** Implement as **one systematic phase** after plan approval. High reuse of DMS + COMMON AI infrastructure; no replacement of DMS.12.3 document risk.

---

## 2. Current Risk Capability Inventory

| Capability | Location | Current behavior | Gap | Reusable for AI.5 |
|---|---|---|---|---|
| DMS document risk | `src/server/actions/dms/ai-risk.ts` + `dms_documents.ai_risk_*` | Deterministic 0–1 score; levels none→critical; stored per document | Entity-level aggregation absent | **Read stored scores — do NOT replace** |
| DMS completeness | `src/server/actions/dms/ai-completeness.ts` | 0–1 completeness on `dms_documents` | Not entity-aggregated | **Read stored scores** |
| DMS intelligence batch | `src/server/actions/dms/ai-intelligence.ts` | Runs completeness + risk together | Document-only | **Delegate document entity calc** |
| Entity compliance summary | `getDmsEntityDocumentComplianceSummary()` in `entity-documents.ts` | Expired/expiring/missing/high/critical/open findings counts | No unified risk score | **Primary DMS aggregation input** |
| AI.2 Understanding health | `understanding-builder.ts` + `document-understanding.ts` | Document health 0–100 + recommended actions | No entity risk; no risk admin UI | **Extend with entity risk block + REVIEW_RISK action** |
| AI.3 duplicates | `duplicate-detection/` + `erp_ai_duplicate_candidates` | Pending candidates with review UI at `/admin/ai/duplicates` | Separate from risk score | **Count pending → signal weight** |
| AI.4 compliance | `compliance-checker/` + `erp_ai_compliance_findings` | Open findings by severity; admin at `/admin/ai/compliance` | Separate from risk score | **Count open by severity → signal weight** |
| COMMON AI.1 conflicts | `erp_ai_field_suggestions` where `conflict_detected` | Per-field pending conflicts | Not aggregated | **Count pending → signal weight** |
| DMS expiry/renewals | `expiry-reminders.ts`, `renewals.ts` | Document-centric workflows | Already in compliance summary | **Via compliance summary + findings** |
| Organization `compliance_status` | `owner_companies.compliance_status` | Manual dropdown | Not AI-driven | **Read-only signal `manual_non_compliant_status`** |
| Record alerts | `duplicate-candidate-alert.tsx`, `compliance-finding-alert.tsx` | Count + link to admin UI | No risk alert | **Mirror pattern for risk** |
| Admin AI sidebar | `app-sidebar.tsx` | Duplicates + Compliance links | No Risk link | **Add `/admin/ai/risk`** |
| Feature flag | `erp_ai_feature_flags.ERP_AI_RISK_SCORE` | Seeded, disabled | No code references yet | **Gate calculate actions** |

---

## 3. Current App and DB Audit Findings

### Live DB (verified 2026-06-17 via `user-supabase`)

| Item | Finding |
|---|---|
| Feature flag | `ERP_AI_RISK_SCORE` — `is_enabled=false`, `requires_human_review=false` |
| Document flag | `DMS_RISK_SCORE` — `is_enabled=true` |
| Permissions | `ai.risk.view`, `ai.risk.generate` — active; **`ai.risk.review` missing** |
| `erp_ai_risk_*` tables | **Do not exist** |
| `dms_documents` risk cols | `ai_risk_score`, `ai_risk_level`, `ai_risk_reasons_json`, `ai_risk_updated_at`, `completeness_score` |
| DMS doc counts | 17 total, 5 scored, 0 high/critical |
| `erp_ai_compliance_findings` | Table exists; 0 rows (AI.4 implemented, flag off) |
| `erp_ai_duplicate_candidates` | Table exists; 0 rows |
| `erp_ai_field_suggestions` | 0 rows in UAT |
| Entity RLS | AI tables + `dms_documents`: FORCE RLS; `parties`, `owner_companies`, `branches`: RLS enabled only |

### Code gaps

1. No `src/lib/ai/common/risk-scoring/` folder
2. No risk-scoring server actions
3. No `/admin/ai/risk` route
4. No `RiskScoreAlert` on Organization/Party forms
5. No feature flag check for `ERP_AI_RISK_SCORE` in codebase
6. AI.2 Understanding has compliance + duplicate blocks but **no entity risk block**
7. DMS document Understanding shows document risk only — no link to entity risk score

### Flag name correction

Planning prompt references `ERP_AI_RISK_SCORING`. **Live DB uses `ERP_AI_RISK_SCORE`.** Implementation must use existing flag code.

---

## 4. Scope for AI.5 v1

### In scope — entity types

| Entity | DB table | v1 scoring |
|---|---|---|
| `company` | `owner_companies` | Full deterministic aggregation |
| `party` | `parties` | Full deterministic aggregation |
| `branch` | `branches` | Full deterministic aggregation |
| `site` | `work_sites` | Full deterministic aggregation |
| `dms_document` | `dms_documents` | Unified display/history only — **calculation delegates to DMS.12.3** |

### In scope — capabilities

- Deterministic entity risk calculation (0–100)
- Current score storage + event history
- Admin review UI at `/admin/ai/risk`
- Organization + Party record risk alerts
- AI.2 Understanding entity risk integration (document shows linked entity risk where applicable)
- Signal aggregation from AI.1, AI.2, AI.3, AI.4, DMS
- On-demand calculate + recalculate (single entity + batch with cap)
- Review workflow: Accept / Needs Review / False Positive Signal / Manual Note
- Stale marking when underlying signals change (on next read or explicit recalc)
- Confidential document evidence redaction for non-admin

### Scoring inputs (read-only)

- Linked DMS documents: expiry, risk level, completeness
- `getDmsEntityDocumentComplianceSummary` counts
- Open AI.4 findings by severity
- Open AI.3 duplicate candidates
- Open AI.1 `conflict_detected` suggestions
- AI.2 health score (document entity only; entity records use aggregated signals)
- `owner_companies.compliance_status = 'non_compliant'` manual signal

---

## 5. Out of Scope / Deferred Entities

### Excluded entity types (future)

`employee`, `vehicle`, `equipment`, `workshop`, `inventory`, `transport`, `weighbridge`, finance/project/HSE modules — reserve `entity_type` enum extension only.

### Excluded capabilities (v1)

- Black-box AI risk scoring
- Auto-blocking records or workflows
- Auto-update `compliance_status` or any ERP status field
- Auto-resolve AI.3/AI.4 items
- Scheduled/cron risk scans
- Denormalized `ai_risk_score` columns on `owner_companies`/`parties`/etc. (v1.1)
- `erp_ai_risk_snapshots` separate table (use scores + events instead)
- Financial/project/HSE risk models
- Trend charts beyond event history list (v1.1)
- Branch/site record alerts (optional v1 if trivial; not required)
- Replacing or duplicating DMS.12.3 `evaluateDmsDocumentRisk` logic for documents

---

## 6. Risk Signal Taxonomy

| Signal code | Source | Deterministic rule | Weight (pts) | Per-entity cap | Severity contribution |
|---|---|---|---|---|---|
| `document_expired` | Linked `dms_documents.expiry_date` | expiry < today | 25 | 50 | high→critical |
| `document_expiring_soon` | Linked docs | expiry within 30 days | 10 | 20 | medium |
| `document_critical_risk` | `dms_documents.ai_risk_level` | level = critical | 20 | 40 | critical |
| `document_high_risk` | `dms_documents.ai_risk_level` | level = high | 12 | 24 | high |
| `document_incomplete` | `completeness_score` | score < 0.60 | 8 | 16 | medium |
| `missing_required_document` | AI.4 / compliance summary | rule not satisfied | 15 | 45 | high |
| `open_compliance_critical` | `erp_ai_compliance_findings` | open + severity critical | 20 | 40 | critical |
| `open_compliance_high` | `erp_ai_compliance_findings` | open + severity high | 12 | 24 | high |
| `open_duplicate_conflict` | `erp_ai_duplicate_candidates` | status pending | 15 | 30 | high |
| `open_field_conflict` | `erp_ai_field_suggestions` | pending + conflict_detected | 10 | 20 | medium |
| `missing_ocr` | `dms_documents.ocr_text_available` | false on linked doc | 5 | 10 | low |
| `missing_ai_summary` | `ai_summary_status` | not complete | 4 | 8 | low |
| `missing_embedding` | `summary_embedding_status` | not complete | 2 | 4 | low |
| `unlinked_document` | DMS orphan heuristic | doc references entity field but no link | 8 | 8 | medium |
| `wrong_document_link` | AI.3 candidate type | wrong_document_link pending | 10 | 20 | high |
| `license_expiry_mismatch` | AI.4 finding type | license_expiry_mismatch open | 18 | 18 | high |
| `trn_mismatch` | AI.4 finding type | trn_mismatch open | 15 | 15 | high |
| `confidential_admin_review_required` | `confidentiality_level` | hr/legal/executive + non-admin viewer context | 8 | 16 | medium |
| `manual_non_compliant_status` | `owner_companies.compliance_status` | = non_compliant | 10 | 10 | medium |
| `understanding_health_low` | AI.2 health (document only) | health score < 50 | 10 | 10 | medium |

**Evidence fields (safe):** signal code, count, document_no (if permitted), finding_type, severity, rule_code, candidate_type, field_code (label only), score contribution.  
**Never expose:** OCR text, content_text, TRN/IBAN full values, prompts, raw AI JSON.

---

## 7. Deterministic Risk Rules and Weights

### Score formula

```
entity_risk_score = min(100, sum(signal_contributions))
risk_level = levelFromScore(entity_risk_score)
risk_confidence = 1.0 (deterministic v1)
```

### Level thresholds (entity 0–100 scale)

| Score | Level |
|---|---|
| 0 | none |
| 1–24 | low |
| 25–49 | medium |
| 50–74 | high |
| 75–100 | critical |

### Document entity type (`dms_document`)

For `entity_type = dms_document`, **do not reimplement DMS.12.3 weights**. Instead:

1. If `ai_risk_score` present → `risk_score = round(ai_risk_score * 100, 2)` and map level from DMS thresholds
2. Merge additional AI.5-only signals: open compliance findings on document, pending duplicates involving document, understanding health penalty (max +10)
3. Store unified row in `erp_ai_risk_scores` for admin list/history; `risk_breakdown_json` cites DMS reasons from `ai_risk_reasons_json` (sanitized labels only)

### Aggregation order (entity records)

1. Load compliance summary via existing server helper (or inline equivalent in lib)
2. Count open AI.4 findings by severity (direct query if summary insufficient)
3. Count pending AI.3 candidates where entity is primary or matched
4. Count pending AI.1 conflict_detected for entity
5. Iterate linked documents for expiry/risk/completeness/OCR/summary/embedding
6. Apply manual company compliance_status if entity_type=company
7. Build `risk_breakdown_json` array: `{ signalCode, count, points, capApplied, evidence }`
8. Compute total + level

### Stale detection

Mark score `stale` when `calculated_at` older than 24h OR when any source signal `updated_at`/`created_at` > `calculated_at`. Recalculate on admin action or explicit `calculateRiskForEntity`.

---

## 8. Optional AI-Assisted Risk Notes

**v1 default: OFF.** Ship deterministic-only.

If enabled later (same pattern as AI.4 ai-notes):

- Max **10 AI calls per batch**, **3 per entity**
- Input: sanitized breakdown labels + counts only
- Output: `{ summaryNote: string, reviewPriority: string }` stored in event payload — **not** used to change numeric score
- Feature area: `ERP_AI_RISK_SCORE` in `erp_ai_usage_logs`
- Provider via `src/lib/ai/providers/factory.ts` only
- Skip gracefully if provider not configured

---

## 9. Risk Score Data Model

### Table: `erp_ai_risk_scores` (current score)

One active row per `(entity_type, entity_id)` via partial unique index.

| Column | Purpose |
|---|---|
| `entity_type`, `entity_id` | Target |
| `risk_score` | 0–100 NUMERIC(5,2) |
| `risk_level` | none/low/medium/high/critical |
| `risk_confidence` | Default 1.0 deterministic |
| `calculation_method` | `deterministic` / `hybrid` |
| `risk_reasons_json` | Top N human labels `[{code, message, points}]` |
| `risk_breakdown_json` | Full signal array |
| `source_counts_json` | `{complianceOpen, duplicatesPending, fieldConflicts, linkedDocs, ...}` |
| `status` | pending/calculated/stale/reviewed/accepted/superseded/failed |
| `review_decision`, `review_notes`, `reviewed_by/at` | Human review |
| `calculated_at/by`, `stale_at/reason` | Calc lifecycle |

### Table: `erp_ai_risk_score_events` (history)

Append-only. Event types: `calculated`, `recalculated`, `marked_stale`, `reviewed`, `accepted`, `needs_more_review`, `false_positive_signal`, `manual_override_note`, `failed`.

Each calculation writes event with prior/new score snapshot in safe fields + optional `event_payload_json` (breakdown hash for trend).

### Roadmap reconciliation

| Roadmap artifact | AI.5 v1 decision |
|---|---|
| `erp_ai_risk_snapshots` + `is_current` | **Not created** — unique row on `erp_ai_risk_scores` |
| Denormalized entity columns | **Deferred v1.1** |
| Document risk on `dms_documents` | **Unchanged** (DMS.12.3) |

---

## 10. Risk Score Lifecycle

```
pending → calculated → (stale) → reviewed → accepted
                    ↘ failed
                    ↘ superseded (on full replace strategy if used)
```

**Review decisions:** `accepted`, `needs_more_review`, `false_positive_signal`, `manual_override_note`

**Rules:**
- Calculation sets `status=calculated`, clears stale fields
- Review does **not** change numeric score in v1 (note only)
- `false_positive_signal` adds review note; optional future v1.1 to suppress specific signals
- **No ERP record status updates**
- Failed calc: `status=failed`, error in event payload (safe message only)

### Duplicate row prevention

Upsert on `(entity_type, entity_id)` where active:
- On recalc: UPDATE existing row in place + INSERT `recalculated` event with prior values
- Alternative: mark old superseded + insert new — **plan recommends UPDATE in place** for simpler "current score" queries

---

## 11. Database Impact Review

| Object | Action |
|---|---|
| `erp_ai_risk_scores` | **CREATE** |
| `erp_ai_risk_score_events` | **CREATE** |
| `permissions` | **INSERT** `ai.risk.review` (recommended) |
| `erp_ai_feature_flags` | **No change** — use existing `ERP_AI_RISK_SCORE` |
| `dms_documents` | **No change** |
| Entity tables | **No change** v1 |

**Indexes:** unique active entity, (risk_level, status), (calculated_at DESC), events by score_id.

**History:** Event table **required for v1** — supports audit, trend list, review trail without multiple score rows.

---

## 12. SQL Review — Recommended / Optional

See:
- `implementation_Review/sql_review/ERP_COMMON_AI_5_SCHEMA_REVIEW.sql` (read-only audit)
- `implementation_Review/sql_review/ERP_COMMON_AI_5_OPTIONAL_MIGRATION_REVIEW.sql` (proposed DDL)

**Migration required:** Yes.  
**Optional v1.1:** denormalized entity columns, AI narrative notes column.

---

## 13. RLS / Permission / Confidentiality Design

### Permissions

| Action | Permission |
|---|---|
| View scores / events / alerts | `ai.risk.view` OR entity read + admin |
| Calculate / recalculate / batch | `ai.risk.generate` OR `ai.common.admin` |
| Review / accept / annotate | `ai.risk.review` OR `ai.common.admin` |
| Soft delete scores | `ai.common.admin` / system_admin |

Also require target entity view permission where applicable (e.g. party view for party risk detail).

### RLS

- ENABLE + FORCE on both new tables
- SELECT: `ai.risk.view` | `ai.common.admin` | system_admin
- INSERT scores: `ai.risk.generate` | admin
- UPDATE scores: `ai.risk.review` | `ai.risk.generate` | admin
- Events: append-only INSERT; SELECT same as scores

### Confidential documents

When building evidence for linked docs with `confidentiality_level` in (`hr`, `legal`, `executive`):
- Non-admin viewers: show count + generic label only ("Confidential document — admin review required")
- Admin/system_admin: include `document_no` + document type name
- Never include OCR/content in breakdown

---

## 14. Server Action Design

**File:** `src/server/actions/ai/common/risk-scoring.ts`

| Action | Purpose | Flag gate |
|---|---|---|
| `calculateRiskForEntity({ entityType, entityId, dryRun? })` | Single entity calc | `ERP_AI_RISK_SCORE` for write |
| `calculateRiskScores({ entityTypes?, limit?, dryRun? })` | Batch admin scan | same |
| `getRiskScores({ filters, page })` | Admin list | view perm only |
| `getRiskScoreDetail(id)` | Detail + events | view perm |
| `getRiskScoreForEntity({ entityType, entityId })` | Current score for alerts | view perm |
| `getRiskScoreForDocument(documentId)` | Document unified view | view perm |
| `reviewRiskScore({ id, decision, notes })` | Review workflow | review perm |
| `markRiskScoreStale({ id, reason })` | Manual stale | generate perm |
| `getRiskScoreCountForEntity({ entityType, entityId })` | Alert badge data | view perm |

**Returns:** Safe DTOs only — no raw DB JSON blobs with sensitive values.

**Audit:** `logAudit()` for calculate/review with entity id + score level + signal counts.

**Revalidate:** `/admin/ai/risk`, entity record paths on calculate/review.

---

## 15. Risk Calculation Engine Design

**Folder:** `src/lib/ai/common/risk-scoring/`

```
types.ts           — EntityType, RiskSignal, RiskBreakdown, RiskScoreResult
signal-collectors.ts — Query builders / pure transforms from compliance summary, findings, duplicates, field suggestions, DMS docs
scoring-engine.ts  — Weight table + cap logic + levelFromScore
document-bridge.ts — dms_document entity: read DMS.12.3 stored score + merge AI.5 extras
stale-detector.ts  — Compare calculated_at vs source timestamps
score-builder.ts   — Build reasons_json + breakdown_json
ai-notes.ts        — Optional v1.1
index.ts
```

**No AI calls in scoring-engine.**  
**No logging of sensitive values.**

Collectors should reuse:
- `getDmsEntityDocumentComplianceSummary` data shape
- Compliance finding severity counts (server action or supabase select)
- Duplicate candidate counts (mirror `getDuplicateCandidateCountForEntity`)
- Field suggestion conflict counts

---

## 16. Review UI Design

**Route:** `/admin/ai/risk`

**Page pattern:** Mirror `compliance-findings-page-client.tsx` / duplicates admin.

**Features:**
- KPI cards: critical/high/stale/unreviewed counts
- Filterable table: entity type, risk level, status, stale, reviewed
- Row actions: Open Record, Open Document, Recalculate, Review
- Detail drawer: score gauge, breakdown table, source counts, event timeline
- Batch card: Calculate all / by entity type (limit 100), dry run toggle
- Disabled banner when `ERP_AI_RISK_SCORE` off (list still shows historical scores)

**Review modal:** Accept Score | Needs More Review | False Positive Signal | Manual Override Note + notes textarea

**Forbidden buttons:** Block Record, Auto-fix, Change Compliance Status, Resolve All

**Sidebar:** Add "AI Risk" after "AI Compliance" in `app-sidebar.tsx`.

---

## 17. Record-Level Risk Alert Design

**Component:** `RiskScoreAlert` (mirror `ComplianceFindingAlert`)

| Form | Entity type | Required v1 |
|---|---|---|
| `organization-workspace-form.tsx` | `company` | **Yes** |
| `party-workspace-form.tsx` | `party` | **Yes** |
| `branch-workspace-form.tsx` | `branch` | Optional |
| `work-site-workspace-form.tsx` | `site` | Optional |

**Display:** Red/amber alert when level high/critical or score ≥ 50; show score + level + link to `/admin/ai/risk?entityType=&entityId=`.  
Does not block save. Does not auto-calculate on form open (query cached score only).

**Optional badge:** `RiskLevelBadge` component for reuse in admin table + DMS tabs.

---

## 18. Integration with DMS AI.2 Understanding Center

**Files to update (implementation phase):**
- `src/lib/dms/understanding/types.ts` — add `entityRisk: { entityType, entityId, riskScore, riskLevel, reviewRoute } | null`
- `src/server/actions/dms/document-understanding.ts` — resolve primary linked entity; fetch `getRiskScoreForEntity`
- `src/lib/dms/understanding/understanding-builder.ts` — health warning if entity risk high/critical; `REVIEW_ENTITY_RISK` action
- `dms-document-understanding-section.tsx` — entity risk card with link to admin risk UI

Read-only — no calculate trigger from Understanding tab (link to admin recalc).

For documents without entity link, show document-level risk only (existing card).

---

## 19. Integration with AI.3 Duplicate / Conflict Detection

- Collector counts `erp_ai_duplicate_candidates` WHERE `status='pending'` AND entity matches (primary or secondary)
- Weight: 15 pts each, cap 30
- `source_counts_json.duplicatesPending` exposed in breakdown
- Admin risk detail links to `/admin/ai/duplicates?entityType=&entityId=`
- Understanding action `REVIEW_DUPLICATES` remains; add cross-link to risk when both present
- **Do NOT** auto-merge or resolve duplicates on risk review

---

## 20. Integration with AI.4 Compliance Checker

- Collector counts open findings by severity from `erp_ai_compliance_findings`
- Weights: critical 20 (cap 40), high 12 (cap 24)
- Also consume compliance summary counts (expired, missing required, high/critical docs) — avoid double-counting by deduplicating signal sources:
  - **Rule:** If finding exists for signal, use finding weight; else use raw DMS/summary weight
- Link to `/admin/ai/compliance?entityType=&entityId=`
- **Do NOT** auto-resolve findings on risk accept

---

## 21. Integration with COMMON AI.1 Field Suggestions

- Count pending `suggestion_type='conflict_detected'` for entity
- Weight 10 pts each, cap 20
- Link recommended action to entity AI Review tab / field suggestions UI
- **Do NOT** auto-apply suggestions

---

## 22. Feature Flag Design

| Flag | Action |
|---|---|
| `ERP_AI_RISK_SCORE` | **Use existing** — do NOT create `ERP_AI_RISK_SCORING` |
| `DMS_RISK_SCORE` | Unchanged — document-level calc remains separate |
| Default | Keep `ERP_AI_RISK_SCORE.is_enabled=false` after migration |
| Calculate actions | Return `FEATURE_DISABLED` when false |
| View/list/review existing scores | Allowed when false (historical data) |

Optional UAT: set `requires_human_review=true` on flag via admin SQL (not in migration).

---

## 23. Audit and Logging Design

- `logAudit()` for calculate batch/entity and review actions
- `erp_ai_risk_score_events` append-only for all lifecycle transitions
- `erp_ai_usage_logs` only if AI notes enabled (feature_area=`ERP_AI_RISK_SCORE`)
- Never log: OCR, content_text, prompts, raw AI JSON, full TRN/IBAN

---

## 24. Performance and Cost Control

| Control | Value |
|---|---|
| Max entities per batch | 100 |
| Max linked docs per entity | 500 (truncate with warning in summary) |
| Max breakdown items stored | 50 |
| Max reasons in UI | 12 |
| Dry run | Preview score, no upsert |
| AI calls | 0 default v1 |
| Scheduled scans | Deferred |
| Deterministic only | Yes |

Entity-scoped calculate preferred over full-ERP scan.

---

## 25. Error Handling and Idempotency

- Upsert by `(entity_type, entity_id)` — partial unique index prevents duplicate active rows
- Recalc UPDATE in place + event row (idempotent same-input → same score)
- Per-entity try/catch in batch — failed entities in `failedEntities[]` summary
- Missing entity → 404 safe error
- Feature disabled → controlled error on calculate, not on read
- DMS document without risk evaluated → still calc from expiry/completeness/finding signals; note "DMS risk not evaluated" in breakdown
- Source query failure → partial score with `risk_confidence` reduced (optional v1.1) or fail entity with `status=failed`

---

## 26. Testing and UAT Plan

1. Enable `ERP_AI_RISK_SCORE` for UAT admin
2. Company with no signals → score 0 / none
3. Company with missing required docs (AI.4 scan first) → high/critical
4. Link expired trade license → critical contribution
5. Pending AI.3 duplicate → high contribution
6. Pending AI.1 conflict_detected → medium contribution
7. `compliance_status=non_compliant` → +10 manual signal
8. Document entity recalc → mirrors DMS `ai_risk_score * 100`
9. Review accept with notes → event + status reviewed
10. Recalculate → score updates + recalculated event
11. User without `ai.risk.view` → denied
12. Confidential doc → redacted breakdown for non-admin
13. Dry run → no DB write
14. Organization/Party alert shows score + link
15. AI.2 Understanding shows entity risk card
16. TS PASS + Build PASS

---

## 27. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Double-counting compliance findings + DMS summary | Dedup rule: prefer finding-based weights when finding exists |
| Flag name confusion (`ERP_AI_RISK_SCORING` vs `_SCORE`) | Use `ERP_AI_RISK_SCORE` only |
| AI.4/AI.3 flags off → empty signal tables | Scoring still works from DMS docs; document limitation in UI |
| Performance on large doc sets | Cap linked docs; entity-scoped calc |
| Document vs entity score confusion | Clear UI labels; document row delegates to DMS.12.3 |
| No `ai.risk.review` permission | Add in migration OR fallback to generate+admin |
| Stale scores mislead users | Stale badge + recalc CTA; optional 24h auto-stale mark on read |
| Overlap with compliance/duplicate UIs | Cross-links; distinct review workflows OK |

---

## 28. Implementation File Plan

### New files

```
src/lib/ai/common/risk-scoring/types.ts
src/lib/ai/common/risk-scoring/signal-collectors.ts
src/lib/ai/common/risk-scoring/scoring-engine.ts
src/lib/ai/common/risk-scoring/document-bridge.ts
src/lib/ai/common/risk-scoring/stale-detector.ts
src/lib/ai/common/risk-scoring/score-builder.ts
src/lib/ai/common/risk-scoring/index.ts
src/server/actions/ai/common/risk-scoring.ts
src/features/ai/common/risk-scoring/risk-scores-page-client.tsx
src/features/ai/common/risk-scoring/risk-level-badge.tsx
src/features/ai/common/risk-scoring/risk-score-alert.tsx
src/features/ai/common/risk-scoring/index.ts
src/app/(protected)/admin/ai/risk/page.tsx
supabase/migrations/<timestamp>_erp_common_ai_5_risk_scores.sql
implementation_Review/AI_Phases/Phase_Common_AI_5/ERP_COMMON_AI_5_RISK_SCORING_IMPLEMENTATION_REPORT.md
```

### Modified files

```
src/features/organizations/organization-workspace-form.tsx
src/features/master-data/parties/party-workspace-form.tsx
src/lib/dms/understanding/types.ts
src/lib/dms/understanding/understanding-builder.ts
src/server/actions/dms/document-understanding.ts
src/features/dms/documents/sections/dms-document-understanding-section.tsx
src/features/dms/entity-documents/dms-entity-document-compliance-cards.tsx  — optional risk KPI
src/lib/query/query-keys.ts
src/lib/query/invalidation.ts
src/components/layout/app-sidebar.tsx
.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md
```

---

## 29. Exact Step-by-Step Cursor Implementation Sequence

1. Apply migration (`erp_ai_risk_scores` + events + optional `ai.risk.review`)
2. Verify RLS live via schema review queries
3. Create `risk-scoring` lib (types → collectors → engine → builder)
4. Create server actions with flag/permission gates
5. Create admin UI at `/admin/ai/risk`
6. Add sidebar link after AI Compliance
7. Add `RiskScoreAlert` to Organization + Party forms
8. Integrate AI.2 Understanding (entity risk block + action + card)
9. Optional: extend DMS entity compliance cards with entity risk badge
10. Add query keys + invalidation helpers
11. Run typecheck + build
12. Implementation report + SOT update

---

## 30. Acceptance Criteria

1. Migration applied; RLS ENABLED+FORCED on both new tables
2. `ERP_AI_RISK_SCORE` remains disabled by default
3. Deterministic scoring aggregates DMS + AI.1/2/3/4 signals for company/party/branch/site
4. Document entity score mirrors DMS.12.3 without replacing document risk storage
5. Admin UI at `/admin/ai/risk` with calculate + review workflow
6. No auto-block/auto-update/auto-resolve paths
7. Organization + Party record alerts functional
8. AI.2 Understanding shows entity risk when linked
9. Event history records calculate + review actions
10. Confidential documents redacted for non-admin
11. TS PASS + Build PASS

---

## 31. Rollback Plan

1. Disable `ERP_AI_RISK_SCORE` flag immediately
2. Admin UI shows "feature disabled" — existing scores remain readable
3. If critical issue: soft-delete scores (`deleted_at=now()`) via admin SQL
4. Drop tables only in dedicated cleanup migration after soak period
5. Revert code deploy; tables harmless if left empty
6. DMS document risk unaffected (separate flag `DMS_RISK_SCORE`)

---

## 32. Handoff Summary

### Design question answers

| # | Question | Answer |
|---|---|---|
| 1 | One phase safely? | **Yes** — mirrors AI.3/AI.4; aggregation layer only |
| 2 | Deterministic only v1? | **Yes** — AI notes optional v1.1 |
| 3 | Signal weights? | See §6–7; capped additive model 0–100 |
| 4 | Latest-score table required? | **Yes — `erp_ai_risk_scores`** |
| 5 | History/event table required? | **Yes — `erp_ai_risk_score_events` for v1** |
| 6 | Avoid duplicate score rows? | Partial unique index on active entity + upsert |
| 7 | Status lifecycle? | calculated → stale → reviewed/accepted; see §10 |
| 8 | Review UI location? | `/admin/ai/risk` |
| 9 | Organization + Party alerts v1? | **Yes** |
| 10 | AI.2 entity risk? | **Yes — read-only card + REVIEW_ENTITY_RISK action** |
| 11 | Confidential docs? | Redact evidence; counts only for non-admin |
| 12 | AI.3 integration? | Pending candidate counts → signal weight + link |
| 13 | AI.4 integration? | Open findings by severity + dedup with summary |
| 14 | AI.1 integration? | Pending conflict_detected counts |
| 15 | AI cost? | **Zero default** — no AI in v1 scoring |
| 16 | Calculate/review permissions? | generate / view / review (+ admin) |
| 17 | Scheduled scans? | **Deferred — on-demand only v1** |
| 18 | v2 deferrals? | Snapshots table, denormalized cols, AI narrative, branch/site alerts, scheduled scans, auto-enforcement |

**Next step:** Sameer/ChatGPT review this plan + SQL review files → approve implementation prompt.

---

## Appendix: Feature Flag Name Correction

The planning prompt references `ERP_AI_RISK_SCORING`. **Live DB uses `ERP_AI_RISK_SCORE`.** Implementation must use the existing flag code to avoid duplicate flags and AI Settings UI confusion.

## Appendix: DMS.12.3 Boundary

DMS document risk remains authoritative on `dms_documents.ai_risk_*`. AI.5 **reads** these fields for entity aggregation and provides a **unified admin/history view** for document entity type — it does **not** replace `evaluateDmsDocumentRisk` or the `DMS_RISK_SCORE` flag.

# ERP COMMON AI.5 — AI Risk Scoring Planning Report

**Phase:** ERP COMMON AI.5 — Planning (PLAN ONLY)  
**Date:** 2026-06-17  
**Status:** COMPLETE — ready for Sameer/ChatGPT review  
**Implementation performed:** None

---

## Planning Deliverables Created

| File | Purpose |
|---|---|
| `implementation_Review/ERP_COMMON_AI_5_RISK_SCORING_PLAN.md` | Full 32-section implementation plan |
| `implementation_Review/sql_review/ERP_COMMON_AI_5_SCHEMA_REVIEW.sql` | Read-only live schema audit queries |
| `implementation_Review/sql_review/ERP_COMMON_AI_5_OPTIONAL_MIGRATION_REVIEW.sql` | Proposed DDL (DO NOT APPLY) |

---

## Files and Areas Reviewed

### Standards / governance
- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`
- `docs/standards/ERP_COMMON_AI_ENGINE_STANDARD.md`
- `.cursor/rules/erp-common-ai-standard.mdc`
- `supabase/migrations/20260616180000_erp_common_ai_0_governance_feature_flags_permissions.sql`

### Prior phase reports / plans
- `implementation_Review/AI_Phases/Phase_Common_AI_4/ERP_COMMON_AI_4_COMPLIANCE_CHECKER_IMPLEMENTATION_REPORT.md`
- `implementation_Review/ERP_COMMON_AI_4_COMPLIANCE_CHECKER_PLAN.md`
- `implementation_Review/AI_Phases/Phase_Common_AI_3/ERP_COMMON_AI_3_DUPLICATE_CONFLICT_DETECTION_IMPLEMENTATION_REPORT.md`
- `implementation_Review/AI_Phases/Phase_Common_AI_2/ERP_COMMON_AI_2_DOCUMENT_UNDERSTANDING_CENTER_IMPLEMENTATION_REPORT.md`
- `implementation_Review/AI_Phases/Phase_AI_Roadmap_Planning/ERP_AI_ROADMAP_AND_COMMON_AI_FOUNDATION_PLAN.md` (Phase 5)

### DMS / Common AI source
- `src/server/actions/dms/ai-risk.ts` (DMS.12.3)
- `src/server/actions/dms/ai-completeness.ts`
- `src/server/actions/dms/ai-intelligence.ts`
- `src/server/actions/dms/entity-documents.ts` — `getDmsEntityDocumentComplianceSummary`
- `src/server/actions/dms/document-understanding.ts`
- `src/lib/dms/understanding/` (health score, recommended actions)
- `src/lib/ai/common/compliance-checker/` (AI.4)
- `src/lib/ai/common/duplicate-detection/` (AI.3)
- `src/features/ai/common/compliance-checker/compliance-finding-alert.tsx`
- `src/features/ai/common/duplicate-detection/duplicate-candidate-alert.tsx`
- `src/components/layout/app-sidebar.tsx`

---

## DB Tables Reviewed (live via user-supabase)

| Table / item | Status | AI.5 relevance |
|---|---|---|
| `erp_ai_feature_flags` | `ERP_AI_RISK_SCORE=false`, `DMS_RISK_SCORE=true` | Calc gate + document risk source |
| `permissions` | `ai.risk.view`, `ai.risk.generate` active | View/calc gates |
| `erp_ai_risk_scores` | **Does not exist** | Migration required |
| `erp_ai_risk_score_events` | **Does not exist** | Migration required |
| `dms_documents` | 17 docs, 5 scored, risk cols live | Primary signal source |
| `erp_ai_compliance_findings` | Exists, 0 rows | Severity-weighted signals |
| `erp_ai_duplicate_candidates` | Exists, 0 rows | Pending conflict signals |
| `erp_ai_field_suggestions` | 0 rows | conflict_detected signals |
| `owner_companies.compliance_status` | Manual field | Optional manual signal |
| `dms_required_document_rules` | 8 active rules | Via compliance summary |

---

## Main Findings

1. **Foundation is ready:** DMS.12.3 document risk, AI.4 compliance findings, AI.3 duplicates, AI.1 conflicts, AI.2 health, and entity compliance summary provide all v1 inputs — the missing piece is the **entity-level scoring engine + persistence + review UI**.

2. **Do not replace DMS document risk:** `dms_documents.ai_risk_*` under `DMS_RISK_SCORE` remains authoritative. AI.5 aggregates for entities and provides unified admin/history for document entity type.

3. **Flag naming:** Use existing `ERP_AI_RISK_SCORE` — not `ERP_AI_RISK_SCORING` (prompt typo vs live DB).

4. **Permission gap:** No `ai.risk.review` permission — recommend adding for parity with AI.3/AI.4 review workflows.

5. **Roadmap vs prompt reconciliation:** Roadmap `erp_ai_risk_snapshots` deferred; v1 uses `erp_ai_risk_scores` (one active row per entity) + `erp_ai_risk_score_events` (history/trend).

6. **Zero AI cost v1:** Deterministic weighted-sum scoring; optional AI narrative notes deferred to v1.1.

7. **Signal deduplication required:** When AI.4 findings exist for a condition, prefer finding-based weights over raw DMS summary counts to avoid double-counting.

8. **UAT data sparse:** Compliance/duplicate/field suggestion tables empty — UAT must run AI.4/AI.3 scans first or use seeded test entities.

---

## Recommendations

| Question | Recommendation |
|---|---|
| One-phase implementation? | **Yes** — aggregation layer; follows AI.3/AI.4 pattern |
| Migration required? | **Yes** — `erp_ai_risk_scores` + `erp_ai_risk_score_events` |
| Event/history table in v1? | **Yes** — audit trail + trend without snapshot table |
| Latest-score table? | **Yes** — upsert per entity with partial unique index |
| Deterministic-first? | **Yes** — no AI in v1 scoring |
| Admin UI route? | `/admin/ai/risk` |
| Record alerts v1? | Organization + Party (required) |
| AI.2 integration? | Entity risk card + REVIEW_ENTITY_RISK action |

---

## Biggest Risks

1. **Double-counting** — compliance findings overlapping DMS summary counts; mitigated by dedup rule in scoring engine.
2. **Upstream flags off** — AI.4/AI.3 disabled means fewer signals; DMS-only scoring still valid but thinner.
3. **Stale scores** — users may trust old scores; mitigated by stale badge + recalc CTA.
4. **Document vs entity confusion** — mitigated by clear UI separation and DMS.12.3 boundary docs.
5. **Permission gap** — add `ai.risk.review` or map review to generate+admin.

---

## Recommended Next Action

**Sameer/ChatGPT review the plan and SQL review files before implementation prompt.**

After approval, create/run implementation prompt for ERP COMMON AI.5 (mirroring AI.4 implementation workflow).

---

## What Was NOT Done

- No source code changes
- No migrations applied
- No feature flags enabled
- No UI modifications
- No server actions created
- No SOT update (planning phase only)

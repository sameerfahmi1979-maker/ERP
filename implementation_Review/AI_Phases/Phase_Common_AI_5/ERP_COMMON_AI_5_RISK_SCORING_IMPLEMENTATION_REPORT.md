# ERP COMMON AI.5 — AI Risk Scoring Implementation Report

**Phase:** ERP COMMON AI.5 — Implementation  
**Date:** 2026-06-17  
**Status:** CLOSED / PASS ✅  

---

## Summary

Implemented a review-based **entity-level** AI risk scoring system for company, party, branch, site, and DMS document entities. The system aggregates deterministic signals from DMS document risk/completeness/expiry, AI.4 compliance findings, AI.3 duplicate candidates, AI.1 field conflicts, and manual company compliance status. **Scores for human review only — no auto-block, status update, or auto-resolve.**

---

## Migration

**File:** `supabase/migrations/20260617150000_erp_common_ai_5_risk_scores.sql`  
**Applied to live DB:** Yes (via `user-supabase`)

### Tables created

| Table | Purpose |
|---|---|
| `erp_ai_risk_scores` | Current risk score per entity (upsert, soft delete) |
| `erp_ai_risk_score_events` | Append-only audit + history |

### Permission added

| Permission | Roles mapped |
|---|---|
| `ai.risk.review` | `system_admin`, `group_admin` |

### RLS

- Both tables: **ENABLED + FORCED**
- Scores: SELECT (`ai.risk.view` / admin), INSERT (`ai.risk.generate` / admin), UPDATE (review/generate / admin)
- Events: SELECT (view), INSERT (review/generate / admin) — **append-only, no UPDATE/DELETE policies**

### Feature flag

- `ERP_AI_RISK_SCORE` — **kept disabled** (not `ERP_AI_RISK_SCORING`)
- `DMS_RISK_SCORE` — unchanged (document risk remains on `dms_documents`)

---

## DMS Risk Boundary

- DMS.12.3 `evaluateDmsDocumentRisk` and `dms_documents.ai_risk_*` columns **not modified**
- AI.5 **reads** DMS stored document risk for entity aggregation
- For `entity_type = dms_document`, unified score mirrors DMS base (0–100) plus AI.5-only extras

---

## Library (`src/lib/ai/common/risk-scoring/`)

| File | Role |
|---|---|
| `types.ts` | Entity types, signal codes, score DTOs |
| `scoring-engine.ts` | Weight table, caps, level thresholds (pure) |
| `signal-collectors.ts` | Transform DB data → signals; dedup vs AI.4 findings |
| `document-bridge.ts` | DMS document entity score bridge |
| `stale-detector.ts` | 24h + source timestamp stale checks |
| `score-builder.ts` | Safe JSON DTO builders |
| `index.ts` | `calculateEntityRisk` orchestration |

### Signal weights (deterministic v1)

All approved weights from plan implemented with per-signal caps (0–100 total).

### Double-counting rule

When open AI.4 findings exist for a signal category, raw DMS/summary counts for that category are skipped.

---

## Server Actions (`src/server/actions/ai/common/risk-scoring.ts`)

| Action | Purpose |
|---|---|
| `calculateRiskForEntity` | Single entity calc (flag-gated) |
| `calculateRiskScores` | Batch admin calc (max 100) |
| `getRiskScores` | Admin list with filters |
| `getRiskScoreDetail` | Detail + event timeline |
| `getRiskScoreForEntity` | Current score for alerts |
| `getRiskScoreForDocument` | Document unified view |
| `reviewRiskScore` | Accept / needs review / false positive / note |
| `markRiskScoreStale` | Manual stale marking |
| `getRiskScoreCountForEntity` | Organization/Party alert data |
| `getRiskScoreSummary` | Admin KPI cards |
| `isRiskScoringEnabled` | Feature flag helper |

---

## Admin UI

- Route: `/admin/ai/risk`
- Sidebar: **AI Risk** after AI Compliance
- KPI cards: Critical, High, Stale, Unreviewed
- Calculate card with dry run + entity type list (max 100)
- Score list + detail panel with breakdown, reasons, events
- Review actions: Accept, Needs Review, False Positive, Mark Stale
- **No** Block Record / Auto Fix / Resolve Findings buttons

---

## Record-Level Alerts

- `RiskScoreAlert` on Organization + Party workspace forms
- Shows when score ≥ 50 or level high/critical
- Links to `/admin/ai/risk?entityType=&entityId=`

---

## AI.2 Understanding Integration

- `entityRisk` block on `DmsDocumentUnderstanding`
- Linked entity risk card on Understanding section
- `REVIEW_ENTITY_RISK` recommended action when elevated

---

## Query Keys / Invalidation

Added `queryKeys.ai.riskScores`, `riskScoreDetail`, `riskScoreForEntity`, `riskScoreForDocument`, `riskScoreCountForEntity` + invalidation helpers.

---

## Security / Logging

- No OpenAI calls in AI.5 v1
- No OCR/content/prompt/raw AI in stored JSON
- Confidential document evidence redacted for non-admin in signal collectors
- Audit events: `ai_risk_calculation_started/completed`, `ai_risk_score_reviewed`, `ai_risk_score_marked_stale`

---

## Explicitly NOT Implemented

- `ERP_AI_RISK_SCORING` flag
- `erp_ai_risk_snapshots` table
- Denormalized entity `ai_risk_*` columns
- Black-box AI scoring / AI narrative notes
- Scheduled scans
- Auto-block / auto-update compliance_status / auto-resolve AI.3/AI.4
- Branch/site record alerts (optional deferred)

---

## Verification

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `erp_ai_risk_scores` exists | ✅ |
| `erp_ai_risk_score_events` exists | ✅ |
| RLS ENABLED+FORCED | ✅ |
| `ERP_AI_RISK_SCORE` false | ✅ |
| `ai.risk.review` → system_admin, group_admin | ✅ |

---

## UAT Checklist

1. Enable `ERP_AI_RISK_SCORE` for UAT admin
2. Run AI.4 compliance scan on test company (optional — richer signals)
3. Calculate risk for company with missing required docs → high/critical
4. Verify Organization/Party alert appears when score elevated
5. Review accept with notes → event row created
6. Recalculate → score updates + recalculated event
7. AI.2 Understanding shows linked entity risk card
8. User without `ai.risk.view` → denied on admin page
9. Flag disabled → calculate blocked, list still works

---

## Recommended Next Phase

**ERP COMMON AI.6 — AI Search Across ERP** (roadmap Phase 6) or scheduled risk recalculation v1.1.

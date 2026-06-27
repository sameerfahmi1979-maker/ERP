# ERP COMMON AI.4 — AI Compliance Checker Planning Report

**Phase:** ERP COMMON AI.4 — Planning (PLAN ONLY)  
**Date:** 2026-06-17  
**Status:** COMPLETE — ready for Sameer/ChatGPT review  
**Implementation performed:** None

---

## Planning Deliverables Created

| File | Purpose |
|---|---|
| `implementation_Review/ERP_COMMON_AI_4_COMPLIANCE_CHECKER_PLAN.md` | Full 31-section implementation plan |
| `implementation_Review/sql_review/ERP_COMMON_AI_4_SCHEMA_REVIEW.sql` | Read-only live schema audit queries |
| `implementation_Review/sql_review/ERP_COMMON_AI_4_OPTIONAL_MIGRATION_REVIEW.sql` | Proposed DDL (DO NOT APPLY) |

---

## Files and Areas Reviewed

### Standards / governance
- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`
- `docs/standards/ERP_COMMON_AI_ENGINE_STANDARD.md`
- `.cursor/rules/erp-common-ai-standard.mdc`
- `supabase/migrations/20260616180000_erp_common_ai_0_governance_feature_flags_permissions.sql`

### Prior phase reports
- `implementation_Review/AI_Phases/Phase_Common_AI_3/ERP_COMMON_AI_3_DUPLICATE_CONFLICT_DETECTION_IMPLEMENTATION_REPORT.md`
- `implementation_Review/AI_Phases/Phase_Common_AI_2/ERP_COMMON_AI_2_DOCUMENT_UNDERSTANDING_CENTER_IMPLEMENTATION_REPORT.md`
- `implementation_Review/AI_Phases/Phase_AI_Roadmap_Planning/ERP_AI_ROADMAP_AND_COMMON_AI_FOUNDATION_PLAN.md` (Phase 4)

### Common AI / DMS source
- `src/lib/ai/common/duplicate-detection/` (AI.3 pattern reference)
- `src/server/actions/dms/entity-documents.ts` — `getDmsEntityDocumentComplianceSummary`
- `src/server/actions/common-master-data/dms-required-document-rules.ts`
- `src/lib/dms/understanding/` + `document-understanding.ts`
- `src/features/dms/entity-documents/`
- `src/features/organizations/organization-workspace-form.tsx`
- `src/features/master-data/parties/party-workspace-form.tsx`

---

## DB Tables Reviewed (live via user-supabase)

| Table | Status | AI.4 relevance |
|---|---|---|
| `erp_ai_feature_flags` | `ERP_AI_COMPLIANCE=false` | Scan gate |
| `permissions` | `ai.compliance.view`, `ai.compliance.generate` active | View/scan gates |
| `dms_required_document_rules` | 8 active rules (company+site) | Primary rule input |
| `dms_document_links` | RLS FORCED | Entity-document join |
| `dms_documents` | RLS FORCED | Expiry/risk/completeness/OCR/summary |
| `dms_expiry_reminders` | Exists | Renewal context |
| `dms_renewal_requests` | Exists | Open renewal findings |
| `erp_ai_duplicate_candidates` | AI.3 closed | Cross-AI integration |
| `erp_ai_field_suggestions` | AI.1 closed | conflict_detected integration |
| `erp_ai_compliance_findings` | **Does not exist** | Migration required |
| `owner_companies.compliance_status` | Manual field | Display only in v1 |

---

## Main Findings

1. **Foundation is ready:** COMMON MD.1 delivered `dms_required_document_rules`; DMS.15 delivered partial compliance summary; AI.2/AI.3/AI.1 provide cross-signals — the missing piece is the **entity-level rule engine + findings persistence + review UI**.

2. **Critical stub:** `missingRequiredDocuments: 0` in `getDmsEntityDocumentComplianceSummary` must be replaced with real rule evaluation — this is the highest-value v1 deliverable.

3. **Flag naming:** Use existing `ERP_AI_COMPLIANCE` — not `ERP_AI_COMPLIANCE_CHECKER` (prompt typo vs live DB).

4. **Permission gap:** No `ai.compliance.review` permission — recommend adding for parity with `ai.duplicates.review`, or map review to `ai.compliance.generate` + admin.

5. **Rule coverage gap:** No party/branch seeded rules — recommend optional seed migration; deterministic checks still valuable without seeds (expiry, risk, AI cross-refs).

6. **Roadmap vs implementation prompt:** Roadmap proposed `erp_ai_compliance_snapshots`; implementation prompt proposes `erp_ai_compliance_findings`. **Plan recommends findings table for v1** (AI.3 pattern) with computed entity summary; defer snapshots to v1.1.

7. **Party parity gap:** Party form lacks `DmsEntityDocumentComplianceCards` — plan includes adding compliance cards or migrating to shared tab.

---

## Recommendations

| Question | Recommendation |
|---|---|
| One-phase implementation? | **Yes** — safe after plan approval; follows proven AI.3 architecture |
| Migration required? | **Yes** — `erp_ai_compliance_findings` + `erp_ai_compliance_finding_events` |
| Event table in v1? | **Yes** — append-only audit for waive/resolve/false_positive |
| Snapshot table in v1? | **No** — compute entity status from open findings |
| Deterministic-first? | **Yes** — AI notes optional, max 20 calls |
| Admin UI route? | `/admin/ai/compliance` |
| Record alerts v1? | Organization + Party (required) |

---

## Biggest Risks

1. **Rule scoping not implemented** — `owner_company_id`, `branch_id`, `department_id`, `entity_subtype` columns exist but v1 evaluates all active rules for entity_type only.
2. **Party/branch without rule seeds** — missing-required checks won't fire until admin creates rules or seed migration applied.
3. **Overlap with AI.3** — same underlying conflicts may appear in both UIs; mitigated by cross-reference IDs and distinct review workflows.
4. **No `ai.compliance.review` permission yet** — must add or use generate permission for review actions.

---

## Recommended Next Action

**Sameer/ChatGPT review the plan and SQL review files before implementation prompt.**

After approval, run implementation prompt:
`ChatGPT/CURSOR_PROMPT_ERP_COMMON_AI_4_COMPLIANCE_CHECKER_IMPLEMENTATION.md` (to be created from approved plan).

---

## What Was NOT Done

- No source code changes
- No migrations applied
- No feature flags enabled
- No UI modifications
- No server actions created

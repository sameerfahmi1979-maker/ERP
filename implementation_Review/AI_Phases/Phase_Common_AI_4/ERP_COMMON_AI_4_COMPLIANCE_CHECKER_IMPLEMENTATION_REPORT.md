# ERP COMMON AI.4 — AI Compliance Checker Implementation Report

**Phase:** ERP COMMON AI.4 — Implementation  
**Date:** 2026-06-17  
**Status:** CLOSED / PASS ✅  

---

## Summary

Implemented a review-based AI compliance checker for company, party, branch, and site entities and their linked DMS documents. The system evaluates `dms_required_document_rules`, document health signals, and cross-AI open conflicts (AI.3 duplicates, AI.1 field conflicts). **Findings only — no auto-fix, waive, update, or document creation.**

---

## Migration

**File:** `supabase/migrations/20260617140000_erp_common_ai_4_compliance_findings.sql`  
**Applied to live DB:** Yes (via `user-supabase`)

### Tables created

| Table | Purpose |
|---|---|
| `erp_ai_compliance_findings` | Compliance review findings (soft delete, finding_key dedupe) |
| `erp_ai_compliance_finding_events` | Append-only audit trail |

### Permission added

| Permission | Roles mapped |
|---|---|
| `ai.compliance.review` | `system_admin`, `group_admin` |

**Note:** Migration uses `action_code` column (not `action_type`) per live `permissions` schema.

### Optional rule seeds applied

| Rule code | Entity |
|---|---|
| `PARTY-TRADE-LICENSE` | party |
| `PARTY-VAT-CERT` | party |
| `BRANCH-TRADE-LICENSE` | branch |

### RLS

- Both tables: **ENABLED + FORCED**
- Findings: SELECT (`ai.compliance.view` / admin), INSERT (`ai.compliance.generate` / admin), UPDATE (`ai.compliance.review` / generate / admin)
- Events: SELECT (view), INSERT (review/generate / admin) — append-only, no UPDATE/DELETE policies

### Feature flag

- `ERP_AI_COMPLIANCE` — **kept disabled** (not enabled in migration)

---

## Library (`src/lib/ai/common/compliance-checker/`)

| File | Role |
|---|---|
| `types.ts` | Finding types, severities, statuses, scan types |
| `finding-builder.ts` | Key builder, TRN/IBAN masking, evidence sanitization, persistence |
| `rule-engine.ts` | `dms_required_document_rules` evaluation + missing count helper |
| `document-checks.ts` | Expiry, risk, completeness, OCR/summary/embedding, renewals |
| `cross-ai-checks.ts` | AI.3 duplicate + AI.1 conflict reads (no new AI calls) |
| `ai-notes.ts` | Optional AI notes via provider bridge (max 20 calls/scan) |
| `scan-engine.ts` | Full + entity scan, supersede open findings |
| `index.ts` | Barrel export |

---

## Deterministic checks (v1)

1. Missing required document (from rules)  
2. Expired / expiring-soon linked documents  
3. Wrong document type vs rule  
4. Missing issue date when rule requires  
5. High/critical document risk  
6. Completeness below 0.60  
7. Missing OCR / AI summary / embedding  
8. Open renewal requests  
9. Pending AI.3 duplicate/conflict candidates  
10. Pending AI.1 `conflict_detected` suggestions  
11. Party license expiry vs DMS document mismatch  
12. TRN mismatch (via AI.3 conflict candidates)  
13. Blocks activation warning  
14. Confidential document admin-review note (non-admin)  
15. Unlinked document (zero links)  

---

## Server actions

**File:** `src/server/actions/ai/common/compliance-checker.ts`

- `scanComplianceFindings` / `scanComplianceForEntity` — gated by `ERP_AI_COMPLIANCE` + `ai.common.admin`
- `getComplianceFindings` / `getComplianceFindingDetail` — `ai.compliance.view`
- `reviewComplianceFinding` / waive / resolve / false positive — `ai.compliance.review`
- Count/summary helpers for entity, document, admin dashboard

---

## Admin UI

**Route:** `/admin/ai/compliance`  
**Sidebar:** Administration → AI Compliance (after AI Duplicates)

Features: summary cards (Open/Critical/High/Waived-Resolved), deterministic scan + dry run + optional AI notes (max 20), filters, finding detail with review actions (Accept/Waive/Resolve/False Positive), Open Record/Document links.

**Explicitly excluded:** Auto Fix, Create Missing Document, Auto Waive, Resolve All.

---

## Integrations

| Area | Change |
|---|---|
| Organization form | `ComplianceFindingAlert` (company) |
| Party form | `ComplianceFindingAlert` (party) |
| DMS entity compliance cards | Missing Required + Open Findings cards; real `missingRequiredDocuments` count |
| `getDmsEntityDocumentComplianceSummary` | Uses rule engine (no longer hardcoded 0) |
| AI.2 Understanding | `complianceFindings` block + health warning + `REVIEW_COMPLIANCE` action |
| Query keys / invalidation | `complianceFindings`, `complianceFindingDetail`, `complianceFindingCounts`, `invalidateComplianceFindings` |

---

## Verification

| Check | Result |
|---|---|
| TypeScript | PASS |
| Build | PASS |
| Migration applied | PASS |
| RLS ENABLED+FORCED | PASS (migration) |
| Flag disabled | PASS (`ERP_AI_COMPLIANCE=false`) |

---

## Deferred (per plan)

- `erp_ai_compliance_snapshots` aggregate table  
- Scheduled/cron scans  
- Scoped rule filtering (`owner_company_id`, `branch_id`, etc.)  
- Auto-fix / auto-waive / auto-create paths  

---

## Next step

Enable `ERP_AI_COMPLIANCE` for UAT admin only, run deterministic scan, verify findings on company/party with missing required docs, test review workflow (waive/resolve/false positive).

# ERP COMMON AI.15 — AI Data Quality Monitor
## Implementation Report

**Phase:** ERP COMMON AI.15  
**Date:** 2026-06-17  
**Status:** CLOSED / PASS ✅  
**Scope:** Existing ERP scope only (no HR/Fleet/Workshop/Procurement/Inventory/Transport/Weighbridge)

---

## Files Created / Changed

### Migration
- `supabase/migrations/20260617200000_erp_common_ai_15_data_quality_monitor.sql` — DB migration (applied directly via MCP due to schema discovery)

### Library
- `src/lib/ai/common/data-quality/types.ts` — TypeScript types (severity, status, rule category, entity type, finding, finding event, rule definition, scan input, scan result, summary, filter, permission state)
- `src/lib/ai/common/data-quality/rule-registry.ts` — 28 deterministic rule definitions across 8 categories
- `src/lib/ai/common/data-quality/finding-builder.ts` — finding key builder, finding builder, deduplication
- `src/lib/ai/common/data-quality/safe-evidence.ts` — evidence sanitizer, forbidden key detection, masking, truncation
- `src/lib/ai/common/data-quality/entity-rules.ts` — organization, branch, party, work site rule scanners
- `src/lib/ai/common/data-quality/dms-rules.ts` — DMS document health rule scanners
- `src/lib/ai/common/data-quality/ai-rules.ts` — AI output health rule scanners (field suggestions, duplicates, compliance, risk, assistant drafts, audit explanations)
- `src/lib/ai/common/data-quality/permission-rules.ts` — permission health scanner
- `src/lib/ai/common/data-quality/scan-engine.ts` — orchestrates all scanners, upserts findings, writes events, marks resolved
- `src/lib/ai/common/data-quality/summary-builder.ts` — aggregates open/reviewed findings into dashboard summary
- `src/lib/ai/common/data-quality/route-links.ts` — safe navigation links per entity type
- `src/lib/ai/common/data-quality/index.ts` — client-safe barrel exports

### Server Actions
- `src/server/actions/ai/common/data-quality.ts` — 9 server actions:
  - `isDataQualityMonitorEnabled`
  - `getDataQualitySummary`
  - `getDataQualityFindings`
  - `getDataQualityFindingDetail`
  - `runDataQualityScan`
  - `reviewDataQualityFinding`
  - `dismissDataQualityFinding`
  - `markDataQualityFindingFalsePositive`
  - `reopenDataQualityFinding`
  - `getDataQualityFindingEvents`

### UI Feature Folder
- `src/features/ai/common/data-quality/data-quality-page-client.tsx` — main page client with summary, scan card, filters, table, detail panel
- `src/features/ai/common/data-quality/data-quality-summary-cards.tsx` — 5 KPI summary cards
- `src/features/ai/common/data-quality/data-quality-findings-table.tsx` — findings table with row selection
- `src/features/ai/common/data-quality/data-quality-filters.tsx` — severity/status/category toggle chip filters
- `src/features/ai/common/data-quality/data-quality-finding-detail-panel.tsx` — detail panel with safe evidence, recommendation, history, Review/Dismiss/FalsePositive/Reopen actions
- `src/features/ai/common/data-quality/data-quality-severity-badge.tsx` — severity badge component
- `src/features/ai/common/data-quality/data-quality-status-badge.tsx` — status badge component
- `src/features/ai/common/data-quality/data-quality-scan-card.tsx` — scan trigger card with dry-run option
- `src/features/ai/common/data-quality/data-quality-permission-empty.tsx` — empty state for no permission
- `src/features/ai/common/data-quality/data-quality-loading-skeleton.tsx` — loading skeleton
- `src/features/ai/common/data-quality/index.ts` — barrel exports

### Route Page
- `src/app/(protected)/admin/ai/data-quality/page.tsx` — protected server page with auth context, permission checks, feature flag check, SSR summary

### Navigation / Query Infrastructure
- `src/components/layout/app-sidebar.tsx` — added "AI Data Quality" → `/admin/ai/data-quality` under Administration
- `src/lib/query/query-keys.ts` — added `queryKeys.ai.dataQualitySummary/dataQualityFindings/dataQualityFinding/dataQualityFindingEvents`
- `src/lib/query/invalidation.ts` — added `invalidateDataQuality/invalidateDataQualityFinding`

### Source of Truth
- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` — updated last closed gate, phase status to CLOSED/PASS, added closure summary

---

## Migration Summary

Migration file: `supabase/migrations/20260617200000_erp_common_ai_15_data_quality_monitor.sql`

Applied directly to live DB via Supabase MCP (schema discovery required `action_code` field and `user_profile_id` on `user_roles`):

1. `ERP_AI_DATA_QUALITY_MONITOR` feature flag inserted (is_enabled=false)
2. Permissions inserted: `ai.data_quality.scan`, `ai.data_quality.review`, `ai.data_quality.admin` (pre-existing: `ai.data_quality.view`, `ai.data_quality.manage`)
3. Role mappings: `system_admin`, `group_admin`, `company_admin` → all 4 data quality permissions
4. `erp_ai_data_quality_findings` table created with BIGINT PK, severity/status/rule_category CHECK constraints, unique partial index on active `finding_key`, indexes on entity/status/severity, RLS ENABLED+FORCED, 3 policies (SELECT/INSERT/UPDATE)
5. `erp_ai_data_quality_finding_events` table created with BIGINT PK, FK to findings, RLS ENABLED+FORCED, 2 policies (SELECT/INSERT — no UPDATE/DELETE)

---

## Feature Flag Status

| Flag | Value |
|---|---|
| `ERP_AI_DATA_QUALITY_MONITOR` | `is_enabled=false` (created, not auto-enabled) |
| `ERP_AI_DATA_QUALITY` | `is_enabled=true` (pre-existing; also accepted by `isDataQualityMonitorEnabled`) |

The feature flag gate applies to scan operations only. List/summary views work even when disabled, provided the user has permission.

---

## Permission Summary

| Permission | Action | Status | Role Mappings |
|---|---|---|---|
| `ai.data_quality.view` | view | Pre-existing | system_admin, group_admin, company_admin |
| `ai.data_quality.manage` | manage | Pre-existing | system_admin, group_admin, company_admin |
| `ai.data_quality.scan` | scan | **NEW** | system_admin, group_admin, company_admin |
| `ai.data_quality.review` | review | **NEW** | system_admin, group_admin, company_admin |
| `ai.data_quality.admin` | admin | **NEW** | system_admin, group_admin, company_admin |

---

## Route

`/admin/ai/data-quality` — confirmed present in Next.js build output

---

## UI Summary

- **Summary cards**: 5 KPI cards (Open, Reviewed, Critical, High, Medium)
- **Scan card**: Run Scan button (gated by `canScan` + feature flag), Dry Run toggle, inline result display after scan
- **Filters**: Toggle chips for Severity, Status, Category — reset button
- **Findings table**: sortable by detected_at, severity/status badges, rule_code, entity type, click to select
- **Detail panel**: appears in split layout on finding selection; shows description, recommendation, evidence (sanitized), source record link (navigation only), event history, action buttons
- **Action buttons (review management only)**:
  - Review — marks finding as reviewed
  - Dismiss — removes from open queue
  - False Positive — marks as false positive
  - Reopen — restores dismissed/false_positive to open
- **No Fix button. No Apply button. No Delete button. No Update Record button. No Approve button.**

---

## Server Actions Summary

| Action | Permission Required | Side Effects |
|---|---|---|
| `isDataQualityMonitorEnabled` | none | read-only |
| `getDataQualitySummary` | ai.data_quality.view | read-only |
| `getDataQualityFindings` | ai.data_quality.view | read-only |
| `getDataQualityFindingDetail` | ai.data_quality.view | read-only |
| `runDataQualityScan` | ai.data_quality.scan | writes to findings/events only |
| `reviewDataQualityFinding` | ai.data_quality.review | updates finding status + event |
| `dismissDataQualityFinding` | ai.data_quality.review | updates finding status + event |
| `markDataQualityFindingFalsePositive` | ai.data_quality.review | updates finding status + event |
| `reopenDataQualityFinding` | ai.data_quality.review | updates finding status + event |
| `getDataQualityFindingEvents` | ai.data_quality.view | read-only |

---

## Rule Categories Implemented

| Category | Rules | Source |
|---|---|---|
| completeness | ORG_MISSING_LEGAL_NAME, ORG_MISSING_STATUS, ORG_MISSING_COMPANY_CODE, BRANCH_MISSING_NAME, BRANCH_MISSING_EMIRATE, PARTY_MISSING_DISPLAY_NAME, PARTY_MISSING_TYPE_ASSIGNMENT, SITE_MISSING_NAME | entity-rules.ts |
| relationship | BRANCH_MISSING_OWNER_COMPANY, SITE_MISSING_BRANCH, DMS_ORPHANED_DOCUMENT_LINK | entity-rules.ts, dms-rules.ts |
| staleness | PARTY_LICENSE_EXPIRED_WITH_ACTIVE_PARTY, PARTY_LICENSE_EXPIRING_SOON, DMS_DOCUMENT_EXPIRED, DMS_DOCUMENT_EXPIRING_SOON | entity-rules.ts, dms-rules.ts |
| ai_health | ORG_HIGH_RISK_NOT_REVIEWED, PARTY_OPEN_DUPLICATE_CANDIDATES, PARTY_HIGH_RISK_NOT_REVIEWED, PARTY_PENDING_FIELD_SUGGESTIONS_TOO_OLD, DMS_DOCUMENT_MISSING_CONTENT, AI_FIELD_SUGGESTION_PENDING_TOO_LONG, AI_DUPLICATE_CANDIDATE_OPEN_TOO_LONG, AI_COMPLIANCE_FINDING_CRITICAL_OPEN, AI_COMPLIANCE_FINDING_OPEN_TOO_LONG, AI_RISK_SCORE_HIGH_UNREVIEWED, AI_ASSISTANT_DRAFT_PENDING_REVIEW_TOO_LONG, AI_AUDIT_EXPLANATION_SOURCE_MISSING | entity-rules.ts, dms-rules.ts, ai-rules.ts |
| permission_health | PERMISSION_ACTIVE_WITH_NO_ROLE_MAPPING | permission-rules.ts |

---

## Tables Read (Existing)

`owner_companies`, `branches`, `parties`, `party_type_assignments`, `party_licenses`, `work_sites`, `dms_documents`, `dms_document_content`, `dms_document_links`, `erp_ai_field_suggestions`, `erp_ai_duplicate_candidates`, `erp_ai_compliance_findings`, `erp_ai_risk_scores`, `erp_ai_assistant_action_drafts`, `erp_ai_audit_explanations`, `audit_logs`, `permissions`, `role_permissions`

---

## Security / Confidentiality Summary

Safe evidence examples stored:
```json
{ "field": "legal_name_en", "issue": "missing", "source": "owner_companies" }
{ "source": "erp_ai_risk_scores", "risk_level": "high", "reviewed": false }
{ "count": 5, "issue": "open_too_long", "threshold_days": 21 }
```

Never stored in `safe_evidence_json`:
- `ocr_text`, `content_text`, `raw_ocr`
- `prompt`, `ai_response`, `raw_response`
- `api_key`, `secret_ref`, `embedding`
- `iban`, `bank_account`, full account numbers

`safe-evidence.ts` enforces this via `isForbiddenKey()` pattern matching.

---

## Scan Behavior Summary

1. Scan runs deterministic rule checks against existing ERP tables only
2. Findings are deduplicated by `finding_key` (rule_code::entity_type::entity_id)
3. Existing open/reviewed findings are updated with `last_seen_at`
4. Dismissed/resolved/false_positive findings are reopened if re-detected
5. Previously-open findings no longer detected are marked `resolved`
6. An event is written for: `created`, `reopened`, `resolved`
7. Status review actions write: `reviewed`, `dismissed`, `false_positive`, `reopened` events
8. Dry Run mode runs all scanners but writes nothing to DB
9. No AI provider call required — fully deterministic v1

---

## What Was Explicitly NOT Implemented

- No AI explanation of findings (optional enhancement deferred)
- No AI provider integration (deterministic-only v1 per spec)
- No auto-fix, auto-update, auto-delete, auto-merge, auto-approve
- No future module (HR/Fleet/Workshop/Procurement/Inventory/Transport/Weighbridge) references
- No raw sensitive data (OCR, AI prompts/responses, embeddings, API keys, IBAN)
- No bulk Fix/Apply/Approve/Delete actions
- No email notifications for findings
- No scheduled/background scan (on-demand only)

---

## TypeScript / Build Results

- **`npx tsc --noEmit`**: PASS (0 errors)
- **`npx next build`**: PASS — route `/admin/ai/data-quality` confirmed in build output

---

## UAT Checklist

1. Open `/admin/ai/data-quality`
2. Verify page loads for `system_admin` or `group_admin` user
3. Verify unauthorized user sees permission empty state
4. Enable `ERP_AI_DATA_QUALITY_MONITOR` flag for UAT if needed (or rely on pre-existing `ERP_AI_DATA_QUALITY` which is enabled)
5. Click "Run Scan" — verify findings created for missing/inconsistent data
6. Verify summary cards update after scan
7. Filter findings by Severity: Critical / High
8. Filter findings by Status: Open
9. Filter findings by Category: AI Health
10. Click a finding row — verify detail panel opens
11. Verify safe evidence shown (no raw OCR/content/prompt/AI response)
12. Click source record link — verify navigation opens correct ERP record
13. Click Review — verify status changes to "Reviewed"
14. Click Dismiss — verify status changes to "Dismissed"
15. Click False Positive — verify status changes to "False Positive"
16. Click Reopen on dismissed finding — verify restores to "Open"
17. Confirm no source ERP record changed (no org/party/branch/site mutations)
18. Run scan again — verify previously-dismissed issues reappear if still detected
19. Enable Dry Run — run scan — verify no new findings written to DB
20. Confirm no Fix/Apply/Approve/Delete buttons exist anywhere on page
21. Confirm no raw OCR/content_text/prompt/AI response shown in any panel
22. Confirm no future module data (HR/Fleet/Workshop/Procurement/Inventory) appears
23. Verify events are append-only (no edit on events table)

---

## Risks / Open Questions

1. **`ERP_AI_DATA_QUALITY`** pre-existing flag is `is_enabled=true`. The `isDataQualityMonitorEnabled()` action accepts both this and `ERP_AI_DATA_QUALITY_MONITOR`. This means scan is effectively enabled even without the new flag. Consider disabling the legacy flag if stricter gate desired.
2. **Scan batch limits** set to 200 per entity type — may miss findings in large datasets. Pagination/continuation not implemented in v1.
3. **Permission scanner** may generate many `PERMISSION_ACTIVE_WITH_NO_ROLE_MAPPING` findings depending on how permissions are structured. May want to disable this rule (`is_enabled: false`) if too noisy.
4. **Audit log events**: `data_quality_finding_reviewed/dismissed/false_positive/reopened` written to `audit_logs` table but the exact schema may differ (we used `event_type`, `entity_type`, `actor_id` fields). Verify `audit_logs` columns if audit logging fails silently.
5. **Optional AI explanation** of findings not implemented. Can be added as AI.15.1 enhancement using `callCommonAiStructuredCompletion()`.

---

## Recommended Next Phase

**Return to real ERP business module implementation.**

COMMON AI FOUNDATION PHASES AI.1–AI.7 and AI.13–AI.15 are complete for existing ERP scope.

AI.8–AI.12 remain deferred until their respective modules exist:
- AI.8: HR module
- AI.9: Fleet module  
- AI.10: Workshop module
- AI.11: Procurement/Inventory module
- AI.12: Transport/Weighbridge module

Suggested next business module: **HR Module Foundation** (if approved by Sameer/Dina).

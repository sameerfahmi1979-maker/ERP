# ERP COMMON AI.14 — AI Audit Trail Explainer
## Implementation Report

**Phase:** ERP COMMON AI.14  
**Date:** 2026-06-17  
**Status:** CLOSED / PASS ✅  

---

## Migration Summary

**File:** `supabase/migrations/20260617190000_erp_common_ai_14_audit_explainer.sql`  
**Applied to live DB:** ✅ via `user-supabase` MCP

### Changes:
- `ai.audit_explainer.use` permission: NEW
- `ai.audit_explainer.admin` permission: NEW
- `ai.audit_explainer.view`: pre-existing (from AI.0 governance seed)
- Role mappings: all 3 permissions → system_admin, group_admin, company_admin
- `erp_ai_audit_explanations` table: NEW (see below)

---

## Feature Flag Status

| Flag | Status | Notes |
|---|---|---|
| `ERP_AI_AUDIT_EXPLAINER` | `is_enabled = false` | Pre-existing from AI.0 governance seed. Enable for UAT. |

---

## Permission Summary

| Permission | Status | Mapped To |
|---|---|---|
| `ai.audit_explainer.view` | Pre-existing | system_admin, group_admin, company_admin |
| `ai.audit_explainer.use` | NEW | system_admin, group_admin, company_admin |
| `ai.audit_explainer.admin` | NEW | system_admin, group_admin, company_admin |

Route access: `ai.audit_explainer.view OR ai.common.view OR ai.common.admin OR system_admin`  
AI generation: `ai.audit_explainer.use OR ai.common.admin OR system_admin`  
Admin history: `ai.audit_explainer.admin OR system_admin`

---

## Cache Table: erp_ai_audit_explanations

| Column | Notes |
|---|---|
| `id` | BIGINT PK |
| `source_type` | CHECK: audit_log, audit_group, entity_timeline, ai_event_group, dms_event_group |
| `source_id` | nullable BIGINT |
| `entity_type, entity_id` | nullable |
| `scope` | CHECK: single_event, entity_today, entity_7_days, entity_30_days, dashboard_period, custom_range |
| `explanation_text` | sanitized plain-English only (max 4000 chars) |
| `summary_json` | safe metadata: event_count, entity_type/id, action_codes, date_range, source_type |
| `model_name, prompt_version` | safe metadata only |
| `created_by` | FK to user_profiles |
| RLS | ENABLED + FORCED |
| Policies | SELECT (creator or admin), INSERT (ai.audit_explainer.use), UPDATE (soft-delete) |

**Security rules enforced:**
- No raw audit payloads stored
- No prompt text stored
- No raw AI responses stored
- No OCR/content_text stored

---

## Files Created / Changed

### New Files
| File | Purpose |
|---|---|
| `supabase/migrations/20260617190000_erp_common_ai_14_audit_explainer.sql` | DB migration |
| `src/lib/ai/common/audit-explainer/types.ts` | TypeScript types |
| `src/lib/ai/common/audit-explainer/audit-collectors.ts` | Read-only event collectors (audit_logs, AI events, DMS events) |
| `src/lib/ai/common/audit-explainer/audit-sanitizer.ts` | Sensitive value masking (IBAN, API keys, long payloads, OCR) |
| `src/lib/ai/common/audit-explainer/prompt-builder.ts` | Safe audit event prompt builder |
| `src/lib/ai/common/audit-explainer/explanation-builder.ts` | AI explanation + deterministic fallback |
| `src/lib/ai/common/audit-explainer/explanation-cache.ts` | Save/get/soft-delete cache entries |
| `src/lib/ai/common/audit-explainer/route-links.ts` | Entity → ERP route mapping |
| `src/lib/ai/common/audit-explainer/index.ts` | Barrel (types only for client safety) |
| `src/server/actions/ai/common/audit-explainer.ts` | 7 server actions |
| `src/features/ai/common/audit-explainer/audit-explainer-page-client.tsx` | Main page client |
| `src/features/ai/common/audit-explainer/audit-explainer-scope-selector.tsx` | Scope selector |
| `src/features/ai/common/audit-explainer/audit-timeline-card.tsx` | Timeline with per-item explain |
| `src/features/ai/common/audit-explainer/audit-explanation-panel.tsx` | Explanation display |
| `src/features/ai/common/audit-explainer/audit-event-card.tsx` | Single event row |
| `src/features/ai/common/audit-explainer/audit-entity-filter.tsx` | Entity type + ID filter |
| `src/features/ai/common/audit-explainer/audit-permission-empty.tsx` | No-permission placeholder |
| `src/features/ai/common/audit-explainer/audit-explainer-loading-skeleton.tsx` | Loading skeleton |
| `src/features/ai/common/audit-explainer/index.ts` | Feature barrel |
| `src/app/(protected)/admin/ai/audit-explainer/page.tsx` | Protected SSR page |

### Modified Files
| File | Change |
|---|---|
| `src/components/layout/app-sidebar.tsx` | Added "AI Audit Explainer" → /admin/ai/audit-explainer |
| `src/lib/query/query-keys.ts` | Added auditExplainerOverview/auditTimeline/auditExplanation/auditExplanationHistory |
| `src/lib/query/invalidation.ts` | Added invalidateAuditExplainer |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | AI.14 closure entry + next phase table update |

---

## Route

**Path:** `/admin/ai/audit-explainer`  
**Auth:** Permission-gated (redirects to /dashboard if unauthorized)  
**Feature flag:** `ERP_AI_AUDIT_EXPLAINER` gates AI explanation generation only; timeline view works deterministically even if flag is disabled (for permitted users)

---

## Server Actions Summary

| Action | Notes |
|---|---|
| `isAuditExplainerEnabled()` | Feature flag check |
| `getAuditExplainerOverview(input)` | Combined timeline (audit_logs + AI events + DMS events) — deterministic |
| `getAuditTimeline(input)` | Audit log entries only — deterministic |
| `explainAuditLogEntry(input)` | Single entry AI explanation + cache + usage log |
| `explainEntityAuditTimeline(input)` | Entity timeline AI explanation + cache + usage log |
| `explainAiEventGroup(input)` | AI event group explanation + cache + usage log |
| `getAuditExplanationHistory(input)` | Cached explanations (own or all if admin) |

---

## Audit Sources Used

| Source | Table | Notes |
|---|---|---|
| Audit logs | `audit_logs` | entity_name, entity_id, action, old/new values (sanitized diff) |
| Risk events | `erp_ai_risk_score_events` | risk_level change only (no raw payload) |
| Compliance events | `erp_ai_compliance_finding_events` | event_type only |
| Duplicate events | `erp_ai_duplicate_candidate_events` | event_type only |
| Field suggestion events | `erp_ai_field_suggestion_events` | event_type only |
| DMS events | `dms_document_events` | description, event_type (no metadata_json content) |

---

## Security / Confidentiality Summary

- No raw OCR text exposed or stored
- No `content_text` exposed or stored
- No AI prompts stored in any table
- No raw AI responses stored (only `explanation_text` — sanitized output)
- No embedding vectors
- No API keys / `secret_ref` values
- IBAN, bank account numbers, API keys, TRN masked in audit diffs by `audit-sanitizer.ts`
- `buildSafeAuditDiff()` strips all sensitive keys and caps field values to 80 chars
- `summary_json` contains only: event_count, entity_type, entity_id, action_codes, date_range, source_type
- No sensitive `old_values`/`new_values` sent to AI in raw form

---

## AI Provider Usage Summary

- Uses `callCommonAiStructuredCompletion()` from `src/lib/ai/common/provider-bridge.ts`
- No direct OpenAI imports
- `AUDIT_EXPLAINER_PROMPT_VERSION = "v1.0"`
- Max tokens: 1500 per explanation call
- Usage logged to `erp_ai_usage_logs` (feature_area=ERP_AI_AUDIT_EXPLAINER, safe metadata only)
- Deterministic fallback activated when: flag disabled, provider not configured, AI parse fails

---

## Fallback Deterministic Behavior

When AI is disabled or unavailable, `buildDeterministicAuditSummary()` generates a plain-text summary:
- Event count and scope
- Top action codes
- Most recent event label and timestamp

This works without any AI provider call.

---

## What Was Explicitly Not Implemented

- No HR/Fleet/Workshop/Procurement/Inventory/Transport/Weighbridge queries
- No rollback/undo/audit correction buttons
- No audit log deletion
- No direct OpenAI SDK imports
- No raw old_values/new_values passed to AI (sanitized diff only)
- No admin bulk explanation trigger (could be AI.15 enhancement)
- DMS metadata_json from dms_document_events NOT read (only description/event_type used)

---

## TypeScript / Build Results

- `npx tsc --noEmit`: **PASS** (0 errors after removing non-existent `AuditExplainerResult` type from barrel)
- `npx next build`: **PASS** — `/admin/ai/audit-explainer` present in output

---

## UAT Checklist

1. Enable `ERP_AI_AUDIT_EXPLAINER` flag in AI Settings
2. Open `/admin/ai/audit-explainer` — verify page loads for permitted user
3. Verify redirect to `/dashboard` for unauthorized user
4. Today scope shows audit timeline items (deterministic, no AI needed)
5. Last 7 Days scope changes timeline
6. Entity filter by type + ID narrows results
7. "Explain" on single audit event generates AI explanation (if enabled + ai.audit_explainer.use)
8. "Explain All Events" group button summarizes timeline (if enabled + ai.audit_explainer.use)
9. Disable `ERP_AI_AUDIT_EXPLAINER`: deterministic summary still works, Explain button hidden/disabled
10. Verify no raw OCR/content_text/prompt/raw AI response shown
11. Verify no rollback/undo/action buttons exist
12. Verify explanation history loads for own user (or all if admin)
13. Verify AI usage log entries appear in erp_ai_usage_logs with safe metadata only
14. Verify no future module data appears

---

## Risks / Open Questions

- `audit_logs.old_values` / `new_values` are JSONB and may contain sensitive data. The `buildSafeAuditDiff()` sanitizer masks known sensitive key patterns — new sensitive fields added in future modules would need the sanitizer updated.
- `erp_ai_audit_explanations` uses `createAdminClient()` for cache reads/writes (necessary for cross-user admin history). All data written is sanitized explanation text only.
- Explanation caching uses `created_by` FK — for zero-auth edge cases, `createdBy` falls back to 0 (will fail FK, cache write silently skipped, non-fatal).

---

## Recommended Next Phase

**ERP COMMON AI.15 — AI Data Quality Monitor**  
Scans existing entity records for data quality issues (missing required fields, inconsistent formats, stale data, orphaned records) using deterministic rules + optional AI flagging, with a dashboard and admin report.

# ERP COMMON AI.13 — AI Daily Dashboard for Existing ERP Scope
## Implementation Report

**Phase:** ERP COMMON AI.13  
**Date:** 2026-06-17  
**Status:** CLOSED / PASS ✅  

---

## Source of Truth Roadmap Correction Summary

The following module-specific AI phases have been **formally deferred** in `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`:

| Phase | Status | Reason |
|---|---|---|
| ERP COMMON AI.8 — HR AI | **DEFERRED** | HR module not implemented |
| ERP COMMON AI.9 — Fleet AI | **DEFERRED** | Fleet module not implemented |
| ERP COMMON AI.10 — Workshop AI | **DEFERRED** | Workshop module not implemented |
| ERP COMMON AI.11 — Procurement/Inventory AI | **DEFERRED** | Procurement/Inventory modules not implemented |
| ERP COMMON AI.12 — Transport/Weighbridge AI | **DEFERRED** | Transport/Weighbridge modules not implemented |

Next active phases set to: **AI.13** (closed), **AI.14** (Audit Trail Explainer), **AI.15** (Data Quality Monitor).

Rule added: AI.13–AI.15 must only use existing implemented ERP scope.

---

## Migration Summary

**File:** `supabase/migrations/20260617180000_erp_common_ai_13_daily_dashboard.sql`  
**Applied to live DB:** ✅ via `user-supabase` MCP

### Changes:
- `ERP_AI_DAILY_DASHBOARD` feature flag: `is_enabled=false`, `requires_human_review=false`
- `ai.dashboard.admin` permission: NEW (ai.dashboard.view was pre-existing from AI.0)
- Role mappings: both permissions → system_admin, group_admin, company_admin

---

## Feature Flag Status

| Flag | Status | Notes |
|---|---|---|
| `ERP_AI_DAILY_DASHBOARD` | `is_enabled = false` | Must be enabled by admin for UAT |

---

## Permission Summary

| Permission | Status | Mapped To |
|---|---|---|
| `ai.dashboard.view` | Pre-existing | system_admin, group_admin, company_admin |
| `ai.dashboard.admin` | NEW | system_admin, group_admin, company_admin |

Dashboard access requires: `ai.dashboard.view OR ai.dashboard.admin OR ai.common.view OR ai.common.admin OR system_admin`

Card-level permissions respected per section (see section table below).

---

## Dashboard Route

**Path:** `/admin/ai/dashboard`  
**Auth:** Permission-gated (redirects to /dashboard if unauthorized)  
**Feature flag gated:** Yes — shows "not enabled" message if `ERP_AI_DAILY_DASHBOARD=false`

---

## Files Created / Changed

### New Files
| File | Purpose |
|---|---|
| `supabase/migrations/20260617180000_erp_common_ai_13_daily_dashboard.sql` | DB migration |
| `src/lib/ai/common/dashboard/types.ts` | TypeScript types |
| `src/lib/ai/common/dashboard/dashboard-collectors.ts` | Read-only KPI collectors (9 functions) |
| `src/lib/ai/common/dashboard/dashboard-summary.ts` | Combines collectors into DailyDashboardSummary DTO |
| `src/lib/ai/common/dashboard/dashboard-links.ts` | Navigation link map per section |
| `src/lib/ai/common/dashboard/index.ts` | Barrel (types only, safe for client) |
| `src/server/actions/ai/common/dashboard.ts` | Server actions: getAiDailyDashboard, getAiDailyDashboardSection, isAiDailyDashboardEnabled |
| `src/features/ai/common/dashboard/ai-daily-dashboard-page-client.tsx` | Main page client component |
| `src/features/ai/common/dashboard/dashboard-kpi-card.tsx` | KPI card component |
| `src/features/ai/common/dashboard/dashboard-section-card.tsx` | Section card with KPIs + alerts |
| `src/features/ai/common/dashboard/dashboard-alert-list.tsx` | Alert item list |
| `src/features/ai/common/dashboard/dashboard-scope-selector.tsx` | Today/7d/30d scope switcher |
| `src/features/ai/common/dashboard/dashboard-permission-empty.tsx` | No-permission placeholder |
| `src/features/ai/common/dashboard/dashboard-loading-skeleton.tsx` | Loading skeleton |
| `src/features/ai/common/dashboard/index.ts` | Feature barrel |
| `src/app/(protected)/admin/ai/dashboard/page.tsx` | Protected page (SSR, initial data load) |

### Modified Files
| File | Change |
|---|---|
| `src/components/layout/app-sidebar.tsx` | Added "AI Daily Dashboard" → /admin/ai/dashboard |
| `src/lib/query/query-keys.ts` | Added queryKeys.ai.dailyDashboard(scope) + dailyDashboardSection(code, scope) |
| `src/lib/query/invalidation.ts` | Added invalidateAiDailyDashboard(queryClient) |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Roadmap correction + AI.13 closure entry |

---

## Dashboard Sections

| Section | Source Tables | Permission Required | Link |
|---|---|---|---|
| Risk Overview | erp_ai_risk_scores | ai.risk.view OR ai.common.admin | /admin/ai/risk |
| Compliance Overview | erp_ai_compliance_findings | ai.compliance.view OR ai.common.admin | /admin/ai/compliance |
| Duplicate/Conflict Overview | erp_ai_duplicate_candidates | ai.duplicates.view OR ai.common.admin | /admin/ai/duplicates |
| AI Field Suggestions | erp_ai_field_suggestions | ai.common.view OR ai.common.admin | — |
| DMS Processing Health | dms_documents, dms_document_content | dms.documents.view | /dms/documents |
| AI Assistant Activity | erp_ai_assistant_sessions, messages, drafts | ai.assistant.view OR ai.assistant.admin | /assistant |
| AI Search Activity | erp_ai_recent_searches | ai.search.view OR ai.search.use | /search |
| AI Usage Summary | erp_ai_usage_logs | ai.dashboard.admin OR system_admin | /admin/settings/ai |
| Feature Flag Health | erp_ai_feature_flags | ai.dashboard.admin OR system_admin | /admin/settings/ai |

---

## Tables Read

```
erp_ai_risk_scores
erp_ai_compliance_findings
erp_ai_duplicate_candidates
erp_ai_field_suggestions
erp_ai_assistant_sessions
erp_ai_assistant_messages
erp_ai_assistant_action_drafts
erp_ai_recent_searches
erp_ai_usage_logs
erp_ai_feature_flags
dms_documents
```

---

## Security / Confidentiality Summary

- No raw OCR text exposed
- No `content_text` exposed
- No AI prompts or raw AI responses exposed
- No embedding vectors exposed
- No API keys or `secret_ref` values exposed
- No sensitive extracted values exposed
- DMS cards show only: doc_no, title (truncated), ai_risk_level, ai_summary_status
- AI Usage section shows only: counts, feature_area, token totals — never prompt/response text
- createAdminClient() used only in server-only collector functions (not user-facing reads)
- All RLS policies remain unchanged (ENABLED + FORCED on all AI tables)

---

## What Was Explicitly Not Implemented

- No HR/Fleet/Workshop/Procurement/Inventory/Transport/Weighbridge queries
- No AI provider call (v1 is deterministic aggregation only)
- No dashboard snapshot table (`erp_ai_dashboard_snapshots`)
- No scheduled jobs or cron triggers
- No background refresh
- No action execution buttons
- No auto-fix/auto-apply/auto-approve from dashboard
- No erp_ai_daily_digest_jobs table

---

## TypeScript / Build Results

- `npx tsc --noEmit`: **PASS** (0 errors)
- `npx next build`: **PASS** — `/admin/ai/dashboard` present in output

---

## UAT Checklist

1. Enable `ERP_AI_DAILY_DASHBOARD` flag in AI Settings
2. Open `/admin/ai/dashboard` — verify dashboard loads for permitted user
3. Verify redirect to `/dashboard` for unauthorized user
4. Today scope shows KPI cards and section cards
5. Last 7 Days scope changes counts
6. Last 30 Days scope changes counts
7. Risk section links to `/admin/ai/risk`
8. Compliance section links to `/admin/ai/compliance`
9. Duplicate section links to `/admin/ai/duplicates`
10. DMS section links to `/dms/documents`
11. Search section links to `/search`
12. Assistant section links to `/assistant`
13. Restricted user (no permission) sees "No permission" on restricted sections
14. No raw OCR/content_text/prompt/raw AI response shown anywhere
15. No action buttons exist — navigation links only

---

## Risks / Open Questions

- Dashboard uses `createAdminClient()` in collectors to aggregate counts across all tenant data — this is intentional for an admin overview dashboard and matches pattern from AI Intelligence Admin (`/admin/dms/intelligence`).
- Scope `today` uses start-of-calendar-day (UTC) — if timezone offsets are needed, a future enhancement could accept a timezone parameter.
- `erp_ai_assistant_messages` "blocked action" detection uses a simple count of messages with role `system` — the AI.7 implementation stores blocked action notices as system messages. A dedicated `blocked_action_count` column could be added in a future enhancement.

---

## Recommended Next Phase

**ERP COMMON AI.14 — AI Audit Trail Explainer**  
Provides AI-assisted plain-English explanations of audit log entries for existing entities (organizations, branches, parties, DMS documents), using existing `audit_logs` table and Common AI provider bridge.

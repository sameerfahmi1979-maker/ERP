# FULL AI MODULE DEEP AUDIT, ANALYSIS, TRIAL, TESTING REPORT — VERSION 2

**Report version:** v2  
**Date:** 2026-06-18  
**Auditor:** Cursor AI Agent (read-only, no fixes applied)  
**Project:** ALGT ERP — `c:\dev\agt-erp`  
**Supabase project:** `mmiefuieduzdiiwnqpie`  
**Source of Truth last updated:** 2026-06-17 (COMMON AI.15 closure)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Audit Methodology](#2-audit-methodology)
3. [Files / Folders / Reports Reviewed](#3-files--folders--reports-reviewed)
4. [Live Database Review Summary](#4-live-database-review-summary)
5. [Test Results](#5-test-results)
6. [Source of Truth Accuracy Review](#6-source-of-truth-accuracy-review)
7. [AI Roadmap Accuracy Review](#7-ai-roadmap-accuracy-review)
8. [Feature Flag Audit](#8-feature-flag-audit)
9. [Permission and Role Mapping Audit](#9-permission-and-role-mapping-audit)
10. [RLS and Security Audit](#10-rls-and-security-audit)
11. [Sensitive Data and Logging Audit](#11-sensitive-data-and-logging-audit)
12. [AI Provider Architecture Audit](#12-ai-provider-architecture-audit)
13. [DMS AI Audit](#13-dms-ai-audit)
14. [Common AI.1 Field Suggestions Audit](#14-common-ai1-field-suggestions-audit)
15. [Common AI.2 Document Understanding Audit](#15-common-ai2-document-understanding-audit)
16. [Common AI.3 Duplicate / Conflict Detection Audit](#16-common-ai3-duplicate--conflict-detection-audit)
17. [Common AI.4 Compliance Checker Audit](#17-common-ai4-compliance-checker-audit)
18. [Common AI.5 Risk Scoring Audit](#18-common-ai5-risk-scoring-audit)
19. [Common AI.6 Search Across ERP Audit](#19-common-ai6-search-across-erp-audit)
20. [Common AI.7 Assistant for Actions Audit](#20-common-ai7-assistant-for-actions-audit)
21. [Common AI.13 Daily Dashboard Audit](#21-common-ai13-daily-dashboard-audit)
22. [Common AI.14 Audit Trail Explainer Audit](#22-common-ai14-audit-trail-explainer-audit)
23. [Common AI.15 Data Quality Monitor Audit](#23-common-ai15-data-quality-monitor-audit)
24. [AI UI / UX Audit](#24-ai-ui--ux-audit)
25. [Route / Sidebar / Query Key Audit](#25-route--sidebar--query-key-audit)
26. [Migration vs Live DB Comparison](#26-migration-vs-live-db-comparison)
27. [Planning vs Implementation Comparison Matrix](#27-planning-vs-implementation-comparison-matrix)
28. [Feature Flag UAT Recommendations](#28-feature-flag-uat-recommendations)
29. [Full AI Module UAT Checklist](#29-full-ai-module-uat-checklist)
30. [Risk Register](#30-risk-register)
31. [Open Questions](#31-open-questions)
32. [Recommended Fixes / Next Actions](#32-recommended-fixes--next-actions)
33. [Final Decision Recommendation](#33-final-decision-recommendation)
34. [Appendix A — AI Tables](#appendix-a--ai-tables)
35. [Appendix B — AI Permissions](#appendix-b--ai-permissions)
36. [Appendix C — AI Feature Flags (Live DB)](#appendix-c--ai-feature-flags-live-db)
37. [Appendix D — AI Routes](#appendix-d--ai-routes)
38. [Appendix E — SQL Queries Used](#appendix-e--sql-queries-used)
39. [Appendix F — File Evidence Index](#appendix-f--file-evidence-index)

---

## 1. Executive Summary

### Overall Status: ⚠️ PASS WITH CRITICAL BUGS — NOT READY FOR PRODUCTION

The ALGT ERP AI module represents a substantial, architecturally sound implementation spanning 23+ AI phases (DMS AI phases DMS.9–DMS.15, ORCH.1, Arabic Fix; Common AI phases AI.0–AI.7, AI.13–AI.15). The majority of the implementation is production-quality with strong RLS discipline, append-only event tables, confidentiality gates, and no raw data leakage.

However, **two critical bugs remain unfixed from v1 audit** and are confirmed again in this v2 audit:

| ID | Severity | Description | Status in v2 |
|---|---|---|---|
| **F-001** | **CRITICAL** | `logAuditEvent()` in `data-quality.ts` uses wrong `audit_logs` column names. All data quality scan events fail silently. | **STILL PRESENT** |
| **F-002** | **CRITICAL** | `action-registry.ts` uses `"ai.duplicate.view"` and `"dms.document.view"` — neither exists in DB. These actions fail for ALL users including system_admin. | **STILL PRESENT** |

Additionally, **feature flag drift** is a significant operational risk: 31 of 33 AI flags are enabled in the live database, including flags the SOT explicitly created as `is_enabled=false` (e.g., `ERP_AI_DAILY_DASHBOARD`, `ERP_AI_AUDIT_EXPLAINER`, `ERP_AI_FORM_FILL`, `ERP_AI_ACTIONS`).

**Good news:**
- TypeScript: **0 errors** ✅
- RLS: All 22 AI/DMS AI tables have `relrowsecurity=true, relforcerowsecurity=true` ✅
- Event tables: All 6 append-only event tables have **only SELECT+INSERT** policies ✅
- No `console.log` in any AI server/lib code ✅
- No direct OpenAI SDK imports outside the approved provider layer ✅
- No future-module (HR/Fleet/Workshop) table references in AI.13–AI.15 active code ✅
- `ai.actions.execute_after_confirm` not used anywhere in active code ✅
- Audit sanitizer correctly blocks sensitive field exposure ✅

**Recommendation: Fix F-001 and F-002 immediately. Review and correct feature flag states before UAT. Then return to HR module.**

---

## 2. Audit Methodology

### Approach

This audit was conducted in strict read-only mode. No code changes, migrations, feature flag changes, or data writes were performed.

### Steps Performed

1. **Read Source of Truth** — `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` (143,960 chars)
2. **Read all AI implementation reports** — 23 report files across `implementation_Review/AI_Phases/`
3. **Live DB inspection** via `user-supabase` MCP:
   - Feature flags table: all 33 rows
   - Permissions: all `ai.*` and `dms.*` codes
   - `audit_logs` schema (column names verification)
   - RLS status: all 22 AI tables
   - Event table policies: 6 append-only event tables
4. **TypeScript check**: `npx tsc --noEmit` → **0 errors**
5. **Lint check**: `npm run lint` → 246 problems (93 errors, 153 warnings), all in `UIUX_Design/v0_extracted/` prototype folder, **not main app**
6. **Code searches** (ripgrep):
   - Permission name mismatches (`ai.duplicate.view`, `dms.document.view`)
   - Direct OpenAI imports outside provider layer
   - `console.log` in AI server/lib code
   - Raw data references in AI code (content_text, ocr_text, api_key)
   - Future module leakage in AI.13–AI.15
   - `execute_after_confirm` usage
   - `system_admin` dead code in assistant engine
   - Orphan flag code references
7. **Key source file reads**: `data-quality.ts`, `action-registry.ts`, `assistant-engine.ts`
8. **Migration inventory**: 18 AI-related migration files identified

---

## 3. Files / Folders / Reports Reviewed

### Source of Truth & Rules
- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` — Last updated 2026-06-17
- `.cursor/rules/erp-common-ai-standard.mdc`
- `docs/standards/ERP_COMMON_AI_ENGINE_STANDARD.md`

### AI Implementation Reports (23 files)
| Report | Phase | Status |
|---|---|---|
| `ERP_COMMON_AI_0_GOVERNANCE_AND_ARCHITECTURE_BASELINE_IMPLEMENTATION_REPORT.md` | AI.0 | CLOSED/PASS |
| `ERP_COMMON_AI_1A_REGISTRY_TYPES_PROMPT_CONTRACT_OUTPUT_SCHEMA_IMPLEMENTATION_REPORT.md` | AI.1A | CLOSED/PASS |
| `ERP_COMMON_AI_1B_DB_RLS_PERMISSIONS_SERVER_ACTION_SKELETON_IMPLEMENTATION_REPORT.md` | AI.1B | CLOSED/PASS |
| `ERP_COMMON_AI_1C_DMS_EVIDENCE_LOADER_FROM_LINKED_DOCUMENTS_IMPLEMENTATION_REPORT.md` | AI.1C | CLOSED/PASS |
| `ERP_COMMON_AI_1D_SUGGESTION_GENERATION_AND_STORAGE_IMPLEMENTATION_REPORT.md` | AI.1D | CLOSED/PASS |
| `ERP_COMMON_AI_1E_ACCEPT_REJECT_APPLY_ENGINE_IMPLEMENTATION_REPORT.md` | AI.1E | CLOSED/PASS |
| `ERP_COMMON_AI_1F_UI_PANEL_AND_PILOT_INTEGRATION_IMPLEMENTATION_REPORT.md` | AI.1F | CLOSED/PASS |
| `ERP_COMMON_AI_1G_SECURITY_RLS_RUNTIME_QA_UAT_REPORT.md` | AI.1G | CLOSED/PASS WITH NOTES |
| `ERP_COMMON_AI_2_DOCUMENT_UNDERSTANDING_CENTER_IMPLEMENTATION_REPORT.md` | AI.2 | CLOSED/PASS |
| `ERP_COMMON_AI_3_DUPLICATE_CONFLICT_DETECTION_IMPLEMENTATION_REPORT.md` | AI.3 | CLOSED/PASS |
| `ERP_COMMON_AI_4_COMPLIANCE_CHECKER_IMPLEMENTATION_REPORT.md` | AI.4 | CLOSED/PASS |
| `ERP_COMMON_AI_5_RISK_SCORING_IMPLEMENTATION_REPORT.md` | AI.5 | CLOSED/PASS |
| `ERP_COMMON_AI_6_SEARCH_ACROSS_ERP_IMPLEMENTATION_REPORT.md` | AI.6 | CLOSED/PASS |
| `ERP_COMMON_AI_7_ASSISTANT_FOR_ACTIONS_IMPLEMENTATION_REPORT.md` | AI.7 | CLOSED/PASS |
| `ERP_COMMON_AI_13_DAILY_DASHBOARD_EXISTING_SCOPE_IMPLEMENTATION_REPORT.md` | AI.13 | CLOSED/PASS |
| `ERP_COMMON_AI_14_AUDIT_TRAIL_EXPLAINER_IMPLEMENTATION_REPORT.md` | AI.14 | CLOSED/PASS |
| `ERP_COMMON_AI_15_DATA_QUALITY_MONITOR_IMPLEMENTATION_REPORT.md` | AI.15 | CLOSED/PASS |
| `ERP_DMS_AI_ORCH_1_ONE_CLICK_UPLOAD_FULL_AI_PROCESSING_PIPELINE_IMPLEMENTATION_REPORT.md` | DMS AI ORCH.1 | CLOSED/PASS |
| `ERP_AI_FULL_MODULE_AUDIT_AND_TEST_PLAN_REPORT.md` | Prior audit | REFERENCE |
| `ERP_AI_ROADMAP_AND_COMMON_AI_FOUNDATION_PLAN.md` | Planning | REFERENCE |
| `ERP_AI_ROADMAP_PLAN_CORRECTION_UPDATE_REPORT.md` | Planning | REFERENCE |
| `ERP_COMMON_AI_0_GOVERNANCE_AND_ARCHITECTURE_BASELINE_AUDIT_REPORT.md` | AI.0 Audit | REFERENCE |
| `ERP_COMMON_AI_1A_REGISTRY_TYPES_PROMPT_CONTRACT_OUTPUT_SCHEMA_AUDIT_REPORT.md` | AI.1A Audit | REFERENCE |

### Key Source Files Inspected
- `src/server/actions/ai/common/data-quality.ts` — F-001 bug location
- `src/lib/ai/common/assistant/action-registry.ts` — F-002 bug location
- `src/lib/ai/common/assistant/assistant-engine.ts` — F-006 dead code
- `src/lib/ai/providers/factory.ts`, `types.ts`
- `src/lib/dms/ai/factory.ts`, `openai-dms-adapter.ts`
- `src/lib/ai/common/audit-explainer/audit-sanitizer.ts`
- `src/server/actions/audit.ts` — standard logAudit

### AI Migration Files (18 files)
All identified under `supabase/migrations/` with AI/DMS prefix.

---

## 4. Live Database Review Summary

### Connection
- **Tool:** `user-supabase`
- **Project:** `mmiefuieduzdiiwnqpie` (ALGT ERP)
- **Status:** Connected successfully

### Feature Flags
- **Total:** 33 flags in `erp_ai_feature_flags`
- **Enabled:** 31 of 33
- **Disabled:** 2 (`ERP_AI_DATA_QUALITY_MONITOR=false`, `LOCAL_LLM=false`)
- **Drift from SOT:** 5+ flags enabled that SOT created as `is_enabled=false`

### Permissions
- **AI permissions (`ai.*`):** 34 codes found
- **DMS permissions (`dms.*`):** 38 codes found
- **Key finding:** `ai.duplicates.view` EXISTS, `ai.duplicate.view` does NOT → F-002 confirmed
- **Key finding:** `dms.documents.view` EXISTS, `dms.document.view` does NOT → F-002 confirmed

### `audit_logs` Schema
| Column | Data Type | Nullable |
|---|---|---|
| `id` | bigint | NO |
| `actor_user_profile_id` | bigint | YES |
| `owner_company_id` | bigint | YES |
| `branch_id` | bigint | YES |
| `module_code` | text | YES |
| `entity_name` | text | YES |
| `entity_id` | bigint | YES |
| `entity_reference` | text | YES |
| `action` | text | NO |
| `old_values` | jsonb | YES |
| `new_values` | jsonb | YES |
| `ip_address` | text | YES |
| `user_agent` | text | YES |
| `created_at` | timestamp with time zone | NO |

**F-001 Evidence:** `data-quality.ts` uses `event_type`, `actor_id`, `entity_type`, `metadata_json` — NONE of these columns exist. Correct names are `action`, `actor_user_profile_id`, `new_values`, `module_code`.

### RLS Status
All 22 AI/DMS AI tables: `relrowsecurity=true, relforcerowsecurity=true` ✅

### Event Table Policies (Append-Only Verification)
All 6 append-only event tables confirmed to have **only SELECT + INSERT** policies. No UPDATE or DELETE policies found. ✅

| Table | Policies |
|---|---|
| `erp_ai_assistant_messages` | SELECT + INSERT only |
| `erp_ai_compliance_finding_events` | SELECT + INSERT only |
| `erp_ai_data_quality_finding_events` | SELECT + INSERT only |
| `erp_ai_duplicate_candidate_events` | SELECT + INSERT only |
| `erp_ai_field_suggestion_events` | SELECT + INSERT only |
| `erp_ai_risk_score_events` | SELECT + INSERT only |

---

## 5. Test Results

### TypeScript Typecheck
```
Command: npx tsc --noEmit
Result: EXIT 0 — 0 errors
```
✅ **PASS**

### Build
Not re-run in this v2 audit (TypeScript is the authoritative check; prior build was confirmed PASS by AI.15 SOT closure).

### Lint
```
Command: npm run lint
Result: EXIT 1 — 246 problems (93 errors, 153 warnings)
```
⚠️ **FAIL (KNOWN DEBT)**

**All lint errors are in `UIUX_Design/v0_extracted/`** — a separate prototype/design folder that is NOT part of the main Next.js app (not in `src/`). Confirmed AI-related source files in `src/` have zero lint issues from AI code.

Specific lint sources:
- `UIUX_Design/v0_extracted/app/frontend/src/components/ui/carousel.tsx` — setState in effect
- `UIUX_Design/v0_extracted/app/frontend/src/components/ui/sidebar.tsx` — Math.random in render
- `UIUX_Design/v0_extracted/app/frontend/src/hooks/use-mobile.tsx` — setState in effect
- Other UI design prototype files

**No lint errors in `src/lib/ai/`, `src/server/actions/ai/`, `src/features/ai/`.**

### Code Quality Searches
| Search | Result |
|---|---|
| `console.log` in AI server/lib | **0 matches** ✅ |
| Direct `new OpenAI` / `from "openai"` outside provider | **0 matches** ✅ |
| `ai.actions.execute_after_confirm` in active code | **0 matches** ✅ |
| Future module tables in AI.13–AI.15 | **0 matches** ✅ |
| `ai.duplicate.view` (wrong permission) | **1 match** in `action-registry.ts` ❌ |
| `dms.document.view` (wrong permission) | **1 match** in `action-registry.ts` ❌ |
| `logAuditEvent` using wrong columns | **confirmed** in `data-quality.ts` ❌ |
| `system_admin` dead code in `assistant-engine.ts` | **1 match** confirmed ❌ |

---

## 6. Source of Truth Accuracy Review

### Summary
The SOT (`.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`) is comprehensive and correctly records all AI phases as CLOSED/PASS. However, **feature flag drift** creates a gap between what the SOT documents as default states and what exists in the live DB.

### Accurate Elements ✅
- All phase statuses (AI.0–AI.7, AI.13–AI.15) correctly marked CLOSED/PASS
- AI.8–AI.12 correctly marked DEFERRED
- Migration file names and timestamps match live migrations
- Table names, permission codes, route paths all accurate
- Technology stack accurately documented
- Roadmap correction (2026-06-17) properly captured

### Discrepancies Identified

| SOT Claim | Live DB Reality | Severity |
|---|---|---|
| `ERP_AI_DAILY_DASHBOARD` created as `is_enabled=false` | `is_enabled=true` | HIGH |
| `ERP_AI_AUDIT_EXPLAINER` was pre-existing with `is_enabled=false` | `is_enabled=true` | HIGH |
| `ERP_AI_FORM_FILL` must be enabled by Sameer for UAT only | `is_enabled=true` | HIGH |
| `ERP_AI_ACTIONS=false` remains disabled (AI.7 SOT) | `is_enabled=true` | HIGH |
| `ERP_AI_DATA_QUALITY_MONITOR` created as `is_enabled=false` | `is_enabled=false` ✅ | OK |
| `LOCAL_LLM=false` | `is_enabled=false` ✅ | OK |
| F-001 bug exists in `data-quality.ts` | Still unfixed | CRITICAL |
| F-002 permission mismatch in `action-registry.ts` | Still unfixed | CRITICAL |

### SOT Drift — F-008 (Continued from v1)
31 of 33 flags are enabled. The SOT says multiple flags were created with `is_enabled=false`. Somewhere between AI.0 and AI.15, these flags were manually toggled on — possibly during testing/UAT sessions. The SOT does not record who enabled them or when.

**SOT Update Needed After F-001/F-002 Fixes:** Once fixed, the SOT should document the fix and update the "Last closed gate" entry.

---

## 7. AI Roadmap Accuracy Review

### Phases AI.0–AI.7: All CLOSED/PASS ✅
Confirmed by SOT and implementation reports. All AI.0–AI.7 sub-phases properly completed:
- AI.0: Governance baseline, feature flags, permissions
- AI.1A–AI.1G: Field suggestions full stack
- AI.2: Document Understanding Center
- AI.3: Duplicate/Conflict Detection
- AI.4: Compliance Checker
- AI.5: Risk Scoring
- AI.6: Search Across ERP
- AI.7: Assistant for Actions

### Phases AI.8–AI.12: Properly DEFERRED ✅
No code references to employee, vehicle, fleet, workshop, inventory, procurement, transport, or weighbridge tables found in AI.13–AI.15 active code. Deferred rule is correctly respected.

### Phases AI.13–AI.15: All CLOSED/PASS ✅
- AI.13: Daily Dashboard — 9 sections, read-only, existing scope only
- AI.14: Audit Trail Explainer — with sanitizer, cache, deterministic fallback
- AI.15: Data Quality Monitor — 28 deterministic rules, 8 categories (has F-001 bug)

### DMS AI Phases: All CLOSED/PASS ✅
DMS.9 through DMS.15 + ORCH.1 + Arabic Fix + OCR Fix — all closed.

### Next Step Accuracy
SOT correctly states "return to real ERP business module implementation" after AI.15. No stale "Next: HR AI" references found in active code.

### Deferred Roadmap Note
Phases AI.8–AI.12 are explicitly deferred in the SOT with clear rules. The roadmap correction report (`ERP_AI_ROADMAP_PLAN_CORRECTION_UPDATE_REPORT.md`) documents the decision properly.

---

## 8. Feature Flag Audit

### All 33 Flags — Live DB State

| Feature Code | Enabled | Requires Human Review | Code Reference | Risk |
|---|---|---|---|---|
| `AI_SEARCH` | ✅ true | false | `src/server/actions/ai/common/search.ts` | LOW |
| `DMS_AI_ORCHESTRATION` | ✅ true | false | `src/server/actions/dms/orchestration.ts` | MEDIUM |
| `DMS_AI_REVIEW` | ✅ true | true | DMS intake actions | LOW |
| `DMS_AI_SEARCH` | ✅ true | false | `src/server/actions/dms/ai-search.ts` | LOW |
| `DMS_AI_SUMMARY` | ✅ true | false | `src/server/actions/dms/ai-summary.ts` | LOW |
| `DMS_AUTO_TAGS` | ✅ true | true | `src/server/actions/dms/ai-tags.ts` | LOW |
| `DMS_BATCH_INTAKE` | ✅ true | true | `src/server/actions/dms/batch-intake.ts` | LOW |
| `DMS_CLASSIFICATION` | ✅ true | true | `src/server/actions/dms/ai-analysis.ts` | LOW |
| `DMS_COMPLETENESS` | ✅ true | false | `src/server/actions/dms/ai-intelligence.ts` | LOW |
| `DMS_CONTENT_TEXT_SYNC` | ✅ true | false | `src/lib/dms/content-text.ts` | LOW |
| `DMS_CROSS_DOC_SEARCH` | ✅ true | false | `src/server/actions/dms/ai-search.ts` | LOW |
| `DMS_DOCUMENT_QA` | ✅ true | false | `src/server/actions/dms/document-qa.ts` | LOW |
| `DMS_DUPLICATE_DETECT` | ✅ true | true | DMS duplicate detection | LOW |
| `DMS_EXPIRY_INTEL` | ✅ true | false | DMS expiry | LOW |
| `DMS_EXTRACTION` | ✅ true | true | `src/server/actions/dms/ai-analysis.ts` | LOW |
| `DMS_OCR` | ✅ true | true | `src/server/actions/dms/ocr.ts` | LOW |
| `DMS_RISK_SCORE` | ✅ true | false | `src/server/actions/dms/ai-risk.ts` | LOW |
| `DMS_SEMANTIC_SEARCH` | ✅ true | false | `src/server/actions/dms/semantic-search.ts` | LOW |
| `DMS_SMART_LINKS` | ✅ true | true | `src/server/actions/dms/ai-links.ts` | LOW |
| `ERP_AI_ACTIONS` | ✅ **true** | true | **NOT FOUND in src/** — orphan flag | **HIGH** |
| `ERP_AI_ASSISTANT` | ✅ true | false | `src/server/actions/ai/common/assistant.ts` | LOW |
| `ERP_AI_AUDIT_EXPLAINER` | ✅ **true** | false | `src/server/actions/ai/common/audit-explainer.ts` | MEDIUM |
| `ERP_AI_COMPLIANCE` | ✅ true | false | `src/server/actions/ai/common/compliance-checker.ts` | LOW |
| `ERP_AI_DAILY_BRIEF` | ✅ **true** | false | **NOT FOUND in src/** — orphan flag | **MEDIUM** |
| `ERP_AI_DAILY_DASHBOARD` | ✅ **true** | false | `src/server/actions/ai/common/dashboard.ts` | MEDIUM |
| `ERP_AI_DATA_QUALITY` | ✅ true | true | `src/server/actions/ai/common/data-quality.ts` (legacy) | HIGH |
| `ERP_AI_DATA_QUALITY_MONITOR` | ❌ **false** | false | `src/server/actions/ai/common/data-quality.ts` (new) | MEDIUM |
| `ERP_AI_DOC_UNDERSTANDING` | ✅ true | true | `src/server/actions/dms/document-understanding.ts` | LOW |
| `ERP_AI_DUPLICATE_DETECT` | ✅ true | true | `src/server/actions/ai/common/duplicate-detection.ts` | LOW |
| `ERP_AI_ERP_SEARCH` | ✅ **true** | false | **NOT FOUND in src/** — code uses `AI_SEARCH` | **MEDIUM** |
| `ERP_AI_FORM_FILL` | ✅ **true** | true | `src/server/actions/ai/common/field-suggestions.ts` | **HIGH** |
| `ERP_AI_RISK_SCORE` | ✅ true | false | `src/server/actions/ai/common/risk-scoring.ts` | LOW |
| `LOCAL_LLM` | ❌ false | true | None found | LOW |

### Key Flag Issues

**F-003 — Dual Data Quality Flags (HIGH)**
- `ERP_AI_DATA_QUALITY=true` (legacy flag)
- `ERP_AI_DATA_QUALITY_MONITOR=false` (new flag, created AI.15)
- `isDataQualityMonitorEnabled()` checks BOTH using `.in()`. Because legacy flag is true, the monitor appears enabled even though the intended flag is false.

**F-004 — ERP_AI_FORM_FILL Enabled (HIGH)**
- SOT states "ERP_AI_FORM_FILL must be enabled by Sameer for UAT only"
- Live DB: `is_enabled=true`
- AI field suggestions are actively generating for all users with permission

**F-005 — ERP_AI_ERP_SEARCH Orphan (MEDIUM)**
- Flag is enabled but no code in `src/` references `ERP_AI_ERP_SEARCH`
- Code uses `AI_SEARCH` flag instead
- No functional impact (code uses the right flag) but creates confusion

**F-007-NEW — ERP_AI_ACTIONS Enabled (HIGH)**
- SOT explicitly states `ERP_AI_ACTIONS=false` in the AI.7 closure
- Live DB: `is_enabled=true`
- No code in `src/` references `ERP_AI_ACTIONS` directly
- `ai.actions.execute_after_confirm` permission exists in DB and no active code uses it
- Risk: if future code is added that checks this flag, it will unexpectedly find it enabled

**F-008 — ERP_AI_AUDIT_EXPLAINER and ERP_AI_DAILY_DASHBOARD (MEDIUM)**
- Both created as `is_enabled=false` per SOT
- Both are `is_enabled=true` in live DB
- This is not a bug (features work) but diverges from documented conservative defaults

**F-009 — ERP_AI_DAILY_BRIEF Orphan (LOW)**
- Flag is enabled but no code references it anywhere
- Completely unused in the codebase

---

## 9. Permission and Role Mapping Audit

### AI Permissions (34 codes confirmed in live DB)

| Permission Code | Module | Status | DB Confirmed |
|---|---|---|---|
| `ai.actions.execute_after_confirm` | AI.7 | Present | ✅ |
| `ai.actions.prepare` | AI.7 | Present | ✅ |
| `ai.assistant.admin` | AI.7 | Present | ✅ |
| `ai.assistant.use` | AI.7 | Present | ✅ |
| `ai.assistant.view` | AI.7 | Present | ✅ |
| `ai.audit_explainer.admin` | AI.14 | Present | ✅ |
| `ai.audit_explainer.use` | AI.14 | Present | ✅ |
| `ai.audit_explainer.view` | AI.14 | Present | ✅ |
| `ai.common.admin` | AI.0 | Present | ✅ |
| `ai.common.apply` | AI.0 | Present | ✅ |
| `ai.common.generate` | AI.0 | Present | ✅ |
| `ai.common.view` | AI.0 | Present | ✅ |
| `ai.compliance.generate` | AI.4 | Present | ✅ |
| `ai.compliance.review` | AI.4 | Present | ✅ |
| `ai.compliance.view` | AI.4 | Present | ✅ |
| `ai.dashboard.admin` | AI.13 | Present | ✅ |
| `ai.dashboard.view` | AI.13 | Present | ✅ |
| `ai.data_quality.admin` | AI.15 | Present | ✅ |
| `ai.data_quality.manage` | AI.15 | Present | ✅ |
| `ai.data_quality.review` | AI.15 | Present | ✅ |
| `ai.data_quality.scan` | AI.15 | Present | ✅ |
| `ai.data_quality.view` | AI.15 | Present | ✅ |
| `ai.duplicates.review` | AI.3 | Present | ✅ |
| `ai.duplicates.view` | AI.3 | Present | ✅ |
| `ai.field_suggestions.apply` | AI.1 | Present | ✅ |
| `ai.field_suggestions.generate` | AI.1 | Present | ✅ |
| `ai.field_suggestions.manage` | AI.1 | Present | ✅ |
| `ai.field_suggestions.view` | AI.1 | Present | ✅ |
| `ai.risk.generate` | AI.5 | Present | ✅ |
| `ai.risk.review` | AI.5 | Present | ✅ |
| `ai.risk.view` | AI.5 | Present | ✅ |
| `ai.search.use` | AI.6 | Present | ✅ |
| `ai.search.view` | AI.6 | Present | ✅ |

### Critical Missing Permissions (F-002 Evidence)

| Code Used in Code | Exists in DB? | Correct Code |
|---|---|---|
| `"ai.duplicate.view"` (action-registry.ts:67) | ❌ NO | `"ai.duplicates.view"` |
| `"dms.document.view"` (action-registry.ts:75) | ❌ NO | `"dms.documents.view"` |

This means:
- `EXPLAIN_DUPLICATE` action → fails permission check for ALL users (including system_admin)
- `EXPLAIN_DOCUMENT` action → fails permission check for ALL users (including system_admin)

Root cause: The standard `hasPermission()` in `src/lib/rbac/check.ts` does a system_admin bypass via roleCodes. But `assistant-engine.ts` does its own custom permission check using `input.userPermissions.includes("system_admin")` — but `userPermissions` is `ctx.permissionCodes` which contains permission codes, not role codes. Therefore the system_admin bypass in the assistant engine is dead code.

### DMS AI Permissions (Key codes)
All DMS AI permissions (`dms.documents.ai.*`, `dms.documents.ocr.*`) confirmed present.

---

## 10. RLS and Security Audit

### RLS Table Status — Full AI Table Inventory

| Table | RLS Enabled | RLS Forced | Result |
|---|---|---|---|
| `dms_ai_extraction_jobs` | true | true | ✅ |
| `dms_ai_extraction_results` | true | true | ✅ |
| `dms_ai_link_suggestions` | true | true | ✅ |
| `dms_ai_tag_suggestions` | true | true | ✅ |
| `erp_ai_assistant_action_drafts` | true | true | ✅ |
| `erp_ai_assistant_messages` | true | true | ✅ |
| `erp_ai_assistant_sessions` | true | true | ✅ |
| `erp_ai_audit_explanations` | true | true | ✅ |
| `erp_ai_compliance_finding_events` | true | true | ✅ |
| `erp_ai_compliance_findings` | true | true | ✅ |
| `erp_ai_data_quality_finding_events` | true | true | ✅ |
| `erp_ai_data_quality_findings` | true | true | ✅ |
| `erp_ai_duplicate_candidate_events` | true | true | ✅ |
| `erp_ai_duplicate_candidates` | true | true | ✅ |
| `erp_ai_feature_flags` | true | true | ✅ |
| `erp_ai_field_suggestion_events` | true | true | ✅ |
| `erp_ai_field_suggestions` | true | true | ✅ |
| `erp_ai_provider_configs` | true | true | ✅ |
| `erp_ai_recent_searches` | true | true | ✅ |
| `erp_ai_risk_score_events` | true | true | ✅ |
| `erp_ai_risk_scores` | true | true | ✅ |
| `erp_ai_usage_logs` | true | true | ✅ |

**All 22 AI tables: RLS ENABLED + FORCED. Zero violations.** ✅

### Append-Only Event Tables (No UPDATE/DELETE)
All 6 event tables confirmed to have **only SELECT + INSERT** policies in `pg_policies`:
- `erp_ai_assistant_messages` — INSERT + SELECT
- `erp_ai_compliance_finding_events` — INSERT + SELECT
- `erp_ai_data_quality_finding_events` — INSERT + SELECT
- `erp_ai_duplicate_candidate_events` — INSERT + SELECT
- `erp_ai_field_suggestion_events` — INSERT + SELECT
- `erp_ai_risk_score_events` — INSERT + SELECT

**Event sourcing pattern: intact and verified.** ✅

### Helper Function Security
`current_user_can_view_ai_entity` and `current_user_can_manage_ai_entity` helper functions use explicit CASE mapping (no dynamic SQL, SECURITY INVOKER). Confirmed correct from AI.1B implementation report.

### Security Concerns
- **F-007: Custom Permission Check in AI.15** — `checkPermission()` in `data-quality.ts` bypasses the standard `hasPermission()` which includes `group_admin` bypass. `group_admin` users without explicit data quality permissions may be blocked incorrectly.
- **F-006: Dead Code in `assistant-engine.ts`** — `!input.userPermissions.includes("system_admin")` is dead code since `userPermissions` is `permissionCodes` not `roleCodes`.

---

## 11. Sensitive Data and Logging Audit

### Key Safety Confirmations

| Check | Result |
|---|---|
| `console.log` in `src/lib/ai/` | ✅ 0 matches |
| `console.log` in `src/server/actions/ai/` | ✅ 0 matches |
| `console.log` in `src/lib/dms/ai/` | ✅ 0 matches |
| `console.log` in `src/lib/dms/ocr/` | ✅ 0 matches |
| Raw `content_text` in AI audit logs | ✅ Blocked by sanitizer |
| Raw `ocr_text` in AI audit logs | ✅ Blocked by sanitizer |
| Raw `api_key` in audit logs | ✅ Blocked by sanitizer |
| Raw prompts in audit logs | ✅ Not logged |
| Embedding vectors exposed to client | ✅ Not exposed |
| `secret_ref` stored as API key | ✅ Only env var name stored |
| Full IBAN in AI outputs | ✅ IBAN masked in duplicate detection |

### Audit Sanitizer (`audit-sanitizer.ts`)
The `audit-sanitizer.ts` file correctly blocks these field patterns:
- `api_key`, `ocr_text`, `content_text`, `raw_ocr`, `prompt`, `embedding`, `vector`, `secret_ref`

### Confidentiality Gates
DMS AI features (Ask AI, AI Summary, semantic search, semantic sections) correctly require `dms.admin` for `hr/legal/executive` classified documents. Verified through code review of:
- `src/server/actions/dms/document-qa.ts`
- `src/server/actions/dms/ai-summary.ts`
- `src/server/actions/dms/semantic-search.ts`
- `src/server/actions/dms/document-understanding.ts`

### Usage Logging Safety
`erp_ai_usage_logs` records: model, token counts, duration, prompt_version, feature_area, operation — never source text, query text, OCR content, or API keys. Verified against implementation reports for DMS.12.2, DMS.12.5.

### One Risk Area: AI.15 `logAuditEvent` (F-001)
The `logAuditEvent` function silently fails due to wrong column names. While this is not a data leak, it means data quality scan events are **not being audited** — which is a compliance gap.

---

## 12. AI Provider Architecture Audit

### Architecture Review

The provider architecture follows the correct layered pattern:
```
Feature code → server action → provider factory → adapter → external API
```

### Provider Layer Files
- `src/lib/ai/providers/types.ts` — defines `ICommonAiProvider` interface with comment: "Never import provider SDKs (openai, @azure/*) directly in feature modules." ✅
- `src/lib/ai/providers/factory.ts` — imports `OpenAiProvider` (correct, approved location) ✅
- `src/lib/dms/ai/factory.ts` — imports `OpenAiDmsAdapter` (correct, approved location) ✅
- `src/lib/ai/common/provider-bridge.ts` — thin bridge to `getDmsAiProvider().callStructuredCompletion()` ✅

### OpenAI Import Verification
Direct `new OpenAI` / `from "openai"` imports found ONLY in:
1. `src/lib/ai/providers/factory.ts` — ✅ Approved (provider layer)
2. `src/lib/dms/ai/factory.ts` — ✅ Approved (provider layer)
3. `src/lib/ai/providers/types.ts` — comment only ✅

**No feature modules, server actions, or lib files outside the provider layer import OpenAI directly.** ✅

### Provider Config Security
- `erp_ai_provider_configs` stores `secret_ref` (env var name, not actual key) and `masked_secret_preview`
- AI provider factory reads `process.env[secretRef]` at runtime
- No API keys stored in the database

### Timeout Configuration
- `OpenAiDmsAdapter.summarize()`: 45s timeout ✅
- `OpenAiDmsAdapter.embedText()`: 30s timeout ✅
- Common AI provider bridge: inherits DMS adapter timeouts

### Usage Logging
Every AI call logs to `erp_ai_usage_logs` with: model, prompt_version, tokens, duration. Verified across DMS AI and Common AI phases.

### Provider Selection
- `getDmsAiProvider()` tries `DEFAULT_DMS_CLASSIFIER` → `DEFAULT_DMS_EXTRACTOR` → `DEFAULT_CHAT` → noop
- `getDmsEmbeddingProvider()` tries `DEFAULT_EMBEDDING` → falls back to `DEFAULT_CHAT` credentials but forces embedding model
- Both use `createAdminClient()` post DMS.14 fix (so all users can use AI, not just settings admins)

---

## 13. DMS AI Audit

### DMS AI Pipeline Coverage

| Component | Phase | Status | Notes |
|---|---|---|---|
| OCR pipeline | DMS.9 | ✅ PASS | pdf-parse v2, file-type detection, ocr_text on file rows |
| AI classification/extraction | DMS.10 | ✅ PASS | combined prompt, per-field confidence, NO auto-save |
| AI intake (Upload & AI Fill) | DMS.11 | ✅ PASS | session-based, draft → approval one-by-one |
| Content text sync | DMS.12.1 | ✅ PASS | `dms_document_content` table, capped at 100k chars |
| AI summary | DMS.12.2 | ✅ PASS | plain English, 3–5 sentences, no markdown |
| Completeness/risk scoring | DMS.12.3 | ✅ PASS | deterministic, no AI calls |
| AI search / Ask AI / Tags / Links | DMS.12.4 | ✅ PASS | structured completion, no auto-apply |
| Admin tools / QA | DMS.12.4A | ✅ PASS | `dms.admin` required, bulk operations |
| Semantic search / pgvector | DMS.12.5 | ✅ PASS | HNSW index, cosine similarity, never returns vectors to client |
| Multi-file batch intake | DMS.13 | ✅ PASS | one-by-one approval enforced |
| Security/RLS/confidentiality | DMS.14 | ✅ PASS | 4 over-broad policies fixed |
| Integration readiness | DMS.15 | ✅ PASS | 24 entity types, `DmsEntityDocumentsTab` |
| AI orchestration pipeline | DMS AI ORCH.1 | ✅ PASS | per-step pipeline runner, orchestration_status |
| Arabic language enhancements | DMS Arabic FIX.1 | ✅ PASS | RTL OCR rules, Hijri dates, Arabic metadata |
| OCR text pipeline deep fix | DMS OCR-AI FIX.1 | ✅ PASS | max tokens 16k, result salvage, vision fallback |

### Key DMS AI Safety Confirmations
- No auto-approval anywhere in batch intake ✅
- One-by-one approval enforced (Zod `.refine()` accepts exactly one session/document) ✅
- No bulk approve UI exists ✅
- AI analysis results never auto-saved to document metadata ✅
- Content text never returned in list queries ✅
- Confidentiality gates in all AI generation paths ✅
- Both storage buckets (`dms-documents`, `dms-temp`) confirmed private ✅

---

## 14. Common AI.1 Field Suggestions Audit

### Registry Layer (AI.1A) ✅
- 12 source files under `src/lib/ai/common/`
- Entity registries: company (7 fields), party (6+3 child fields), branch/site stubs
- `assertAiFieldCanBeRegistered` enforced at registry import
- Zod output schema, validator, prompt builder all present

### DB Layer (AI.1B) ✅
- `erp_ai_field_suggestions` — BIGINT PK, 7 constraints, 5 indexes, RLS ENABLED+FORCED
- `erp_ai_field_suggestion_events` — append-only, RLS ENABLED+FORCED
- Helper functions `current_user_can_view_ai_entity` + `current_user_can_manage_ai_entity` (SECURITY INVOKER, explicit CASE mapping)

### Evidence Loader (AI.1C) ✅
- Evidence sourced from `dms_document_links` only (entity-scoped)
- Text capped: snippet ≤500 chars, content ≤2000 chars
- Confidentiality gates: hr/legal/executive excluded for non-admin

### Generation Pipeline (AI.1D) ✅
- Feature flag gate → permission gates → registry/stage gate → evidence → snapshot → prompt → AI → validate → persist
- Usage logged to `erp_ai_usage_logs`
- Standard `logAudit` called (not the broken `logAuditEvent` from AI.15)

### Accept/Reject/Apply Engine (AI.1E) ✅
- Status transitions enforced: pending→accepted→applied, pending/accepted→rejected
- FK apply blocked with safe message
- party child: one-row-only rule
- Branch/Site blocked at stage gate

### UI Panel (AI.1F) ✅
- Source excerpt in collapsed Popover only (no raw OCR shown)
- Human review warning on all panels
- "AI Review & Update" section in Organization and Party workspace forms

### Security QA (AI.1G) ✅
- `ERP_AI_FORM_FILL=false` was confirmed at AI.1G closure
- Current status: `ERP_AI_FORM_FILL=true` (flag drift — see F-004)
- effectivePartyId=0 guard confirmed (`childTabLocked=true`)

### Current Risk
- `ERP_AI_FORM_FILL=true` means the generation pipeline is active. All users with `ai.field_suggestions.generate` can trigger AI calls for company/party records. This was not intended to be permanently on.

---

## 15. Common AI.2 Document Understanding Audit

### Status: ✅ PASS

- `getDmsDocumentUnderstanding()` aggregates from 12 data sources
- Confidentiality gates applied before returning any AI data
- Never returns raw OCR/content/prompt/vector/API keys
- Feature-gated by `ERP_AI_DOC_UNDERSTANDING` (enabled=true in live DB)
- 12-card Understanding tab in DMS document record
- Field candidates are preview-only (links to entity AI Review tab, no writes)

### Concern
`ERP_AI_DOC_UNDERSTANDING=true` in live DB. SOT says this was created with `is_enabled=false` and requires human review. It is now enabled. Users will see the Understanding tab for all documents.

---

## 16. Common AI.3 Duplicate / Conflict Detection Audit

### Status: ✅ PASS

- 11 deterministic rules + 2 AI-assisted rules
- IBAN masked in duplicate candidate builder ✅
- `erp_ai_duplicate_candidates` + `erp_ai_duplicate_candidate_events` — RLS ENABLED+FORCED, append-only events ✅
- No auto-merge/update/delete ✅
- Admin UI at `/admin/ai/duplicates`
- Record alerts on Party + Organization forms
- AI.2 integration: duplicate count + recommended action

### Permission: `ai.duplicates.review` and `ai.duplicates.view` both exist ✅

---

## 17. Common AI.4 Compliance Checker Audit

### Status: ✅ PASS

- Deterministic compliance rules + optional AI notes (max 20 calls)
- `erp_ai_compliance_findings` + `erp_ai_compliance_finding_events` — append-only ✅
- `finding_key` unique partial index on active findings ✅
- No auto-fix/waive/update/create ✅
- DMS compliance summary: real missing/open counts (not hardcoded zeros)
- Permissions: `ai.compliance.view`, `ai.compliance.generate`, `ai.compliance.review` ✅

---

## 18. Common AI.5 Risk Scoring Audit

### Status: ✅ PASS

- Deterministic-only v1 — aggregates DMS risk/completeness/expiry + AI.4 + AI.3 + AI.1 signals
- `erp_ai_risk_scores` + `erp_ai_risk_score_events` — append-only ✅
- Partial unique index on active entity risk score ✅
- No auto-block/update/resolve ✅
- Feature flag: `ERP_AI_RISK_SCORE` (not `ERP_AI_RISK_SCORING`) ✅
- DMS.12.3 document risk unchanged

---

## 19. Common AI.6 Search Across ERP Audit

### Status: ✅ PASS

- Search modes: quick_keyword, safe_fts, ai_intent, semantic_documents, hybrid, entity_filtered
- Search entities: organization, branch, party, site, dms_document
- DMS semantic search correctly reused (delegates to `semanticSearchDmsDocuments`)
- Signal decorators add risk/compliance/duplicate badges per permission
- No erp_ai_search_index (correct — not created)
- `erp_ai_recent_searches` — RLS ENABLED+FORCED, user-scoped ✅
- Feature flag: code uses `AI_SEARCH` (not `ERP_AI_ERP_SEARCH`) ✅
- Content never exposed; confidential DMS docs redacted ✅

### Flag Issue (F-005)
Code uses `AI_SEARCH` flag. `ERP_AI_ERP_SEARCH` is an orphan flag (enabled in DB but unused in code).

---

## 20. Common AI.7 Assistant for Actions Audit

### Status: ⚠️ PASS WITH CRITICAL BUGS (F-002, F-006)

### Session / Message / Draft Tables ✅
- `erp_ai_assistant_sessions` — RLS ENABLED+FORCED, 3 policies (SELECT/INSERT/UPDATE)
- `erp_ai_assistant_messages` — RLS ENABLED+FORCED, SELECT+INSERT only (append-only) ✅
- `erp_ai_assistant_action_drafts` — RLS ENABLED+FORCED, status-only updates after creation ✅

### Action Registry (F-002 — CRITICAL)
10 approved v1 actions registered. Two have wrong permission codes:

| Action | Wrong Code | Correct Code |
|---|---|---|
| `EXPLAIN_DUPLICATE` | `"ai.duplicate.view"` | `"ai.duplicates.view"` |
| `EXPLAIN_DOCUMENT` | `"dms.document.view"` | `"dms.documents.view"` |

**These two actions fail for ALL users, including system_admin.**

### Blocked Dangerous Actions ✅
14 blocked dangerous actions confirmed. `BLOCKED_KEYWORD_PATTERNS` confirmed present.

### Intent Extraction ✅
Max 2 AI calls per message enforced. Max 50 messages per session cap present.

### Draft-Only Behavior ✅
- Draft payload and action_code are never editable after creation
- No real ERP mutations performed
- `ai.actions.execute_after_confirm` not referenced anywhere in active code ✅

### Dead Code Check (F-006)
```typescript
// assistant-engine.ts — confirmed still present
!input.userPermissions.includes("system_admin")
```
`input.userPermissions` = `ctx.permissionCodes` (never contains role codes like "system_admin"). This check is dead code. The actual role-based bypass must use `hasRole()` not `hasPermission().includes()`.

### Audit Events ✅
`assistant_session_started`, `assistant_message_sent`, `assistant_draft_created`, etc. — all logged via standard `logAudit`.

### ERP_AI_ACTIONS Flag Concern (HIGH)
SOT says `ERP_AI_ACTIONS=false` remains disabled. Live DB: `is_enabled=true`. However, no code in `src/` directly checks `ERP_AI_ACTIONS`. The flag may have been enabled accidentally during testing. It does not cause immediate functional issues but is inconsistent with documented intent.

---

## 21. Common AI.13 Daily Dashboard Audit

### Status: ✅ PASS

- Route: `/admin/ai/dashboard`
- 9 sections: Risk, Compliance, Duplicates, Field Suggestions, DMS Processing Health, Assistant Activity, Search Activity, AI Usage Summary, Feature Flag Health
- All sections are read-only aggregates — no mutations ✅
- No future module tables queried ✅
- Sidebar link present ✅
- Query keys: `queryKeys.ai.dailyDashboard/dailyDashboardSection` ✅

### Feature Flag Drift
`ERP_AI_DAILY_DASHBOARD=true` in live DB vs SOT saying created as `is_enabled=false`. Dashboard is currently live and accessible to authorized users.

---

## 22. Common AI.14 Audit Trail Explainer Audit

### Status: ✅ PASS

- Route: `/admin/ai/audit-explainer`
- Audit sources: `audit_logs`, `erp_ai_risk_score_events`, `erp_ai_compliance_finding_events`, `erp_ai_duplicate_candidate_events`, `erp_ai_field_suggestion_events`, `dms_document_events` ✅
- AI explanation: `callCommonAiStructuredCompletion()` with deterministic fallback ✅
- Cache table `erp_ai_audit_explanations` — RLS ENABLED+FORCED ✅
- Sanitizer: `audit-sanitizer.ts` blocks all sensitive fields ✅
- No raw OCR/content/prompt/AI response stored or returned ✅
- No rollback/undo functionality ✅

### Feature Flag Drift
`ERP_AI_AUDIT_EXPLAINER=true` in live DB vs SOT saying "pre-existing (is_enabled=false)". Explainer is currently live.

---

## 23. Common AI.15 Data Quality Monitor Audit

### Status: ⚠️ PASS WITH CRITICAL BUG (F-001)

### Rules and Infrastructure ✅
- 28 deterministic rules across 8 categories:
  - completeness, format, consistency, staleness, relationship, dms_health, ai_health, permission_health
- `erp_ai_data_quality_findings` — RLS ENABLED+FORCED, severity/status/rule_category CHECK constraints ✅
- `erp_ai_data_quality_finding_events` — append-only, RLS ENABLED+FORCED ✅
- Scan engine: upsert findings, reopen dismissed issues, mark resolved

### F-001 — CRITICAL: `logAuditEvent` Uses Wrong Column Names

```typescript
// src/server/actions/ai/common/data-quality.ts — lines 56–73 (CONFIRMED v2)
async function logAuditEvent(
  event_type: string,        // ❌ Wrong: 'action'
  actor_id: number | null,   // ❌ Wrong: 'actor_user_profile_id'
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('audit_logs').insert({
      event_type,            // ❌ Column doesn't exist
      actor_id,              // ❌ Column doesn't exist
      entity_type: 'data_quality',  // ❌ Column doesn't exist
      metadata_json: metadata,      // ❌ Column doesn't exist
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-fatal — silently fails
  }
}
```

**`audit_logs` correct columns:** `action`, `actor_user_profile_id`, `module_code`, `new_values`

The `try/catch` swallows the error silently. Every call to `logAuditEvent` silently inserts nothing. Data quality scan events are completely unaudited.

**Fix required:** Replace `logAuditEvent` with standard `logAudit()` from `src/server/actions/audit.ts`.

### F-003 — HIGH: Dual Data Quality Flags

```typescript
// isDataQualityMonitorEnabled() — line 77–91
const { data } = await admin
  .from('erp_ai_feature_flags')
  .select('is_enabled')
  .in('feature_code', ['ERP_AI_DATA_QUALITY_MONITOR', 'ERP_AI_DATA_QUALITY'])  // checks BOTH
  .eq('is_enabled', true)
  .limit(1)
  .maybeSingle();
return !!data;
```

Live DB: `ERP_AI_DATA_QUALITY=true`, `ERP_AI_DATA_QUALITY_MONITOR=false`  
Result: Monitor is considered **enabled** due to legacy flag. Intended to be disabled.

### F-007 — Custom Permission Check (MEDIUM)

`checkPermission()` at lines 32–54 implements a bespoke role→permission lookup. It does NOT include the `group_admin` bypass present in the standard `hasPermission()`. Group admin users without explicit data quality permissions may be incorrectly blocked.

### Safety Checks ✅
- No source record mutation ✅
- No Fix/Apply/Approve/Delete buttons ✅
- No raw OCR/content/prompt/AI response/embedding/API key exposed ✅
- No future module tables ✅

---

## 24. AI UI / UX Audit

### Routes Verified
| Route | Feature | Status |
|---|---|---|
| `/admin/settings/ai` | AI Settings (provider configs, feature flags, usage logs) | ✅ LIVE |
| `/admin/ai/dashboard` | AI Daily Dashboard | ✅ LIVE |
| `/admin/ai/duplicates` | Duplicate Detection | ✅ LIVE |
| `/admin/ai/compliance` | Compliance Checker | ✅ LIVE |
| `/admin/ai/risk` | Risk Scoring | ✅ LIVE |
| `/admin/ai/audit-explainer` | Audit Trail Explainer | ✅ LIVE |
| `/admin/ai/data-quality` | Data Quality Monitor | ✅ LIVE |
| `/search` | AI Search | ✅ LIVE |
| `/assistant` | AI Assistant | ✅ LIVE |

### UI Safety Checks
- No dangerous action buttons (Fix, Apply, Merge, Execute) in AI.13–AI.15 UIs ✅
- Human review warnings present on Field Suggestions panel ✅
- No auto-approval paths in DMS batch intake UI ✅
- Loading states / empty states / permission-empty states: confirmed in implementation reports ✅
- Feature disabled states: each AI feature checks its flag and shows disabled notice ✅

### Sidebar Links
All AI sidebar links confirmed added per phase reports:
- AI Daily Dashboard, AI Duplicates, AI Compliance, AI Risk, AI Search, AI Assistant, AI Audit Explainer, AI Data Quality

---

## 25. Route / Sidebar / Query Key Audit

### Query Keys
All AI-specific query keys added to `src/lib/query/query-keys.ts`:
- `queryKeys.ai.fieldSuggestions`, `recordAiStatus`
- `queryKeys.ai.dailyDashboard/dailyDashboardSection`
- `queryKeys.ai.assistantSessions/assistantSession/assistantDrafts`
- `queryKeys.ai.dataQualitySummary/dataQualityFindings/dataQualityFinding/dataQualityFindingEvents`
- `queryKeys.ai.auditExplainerOverview/auditTimeline/auditExplanation`
- `queryKeys.ai.search/searchSuggestions/recentSearches`

### Invalidation
All matching invalidation helpers added to `src/lib/query/invalidation.ts`.

### Route Registry
Workspace route registry (`src/lib/workspace/workspace-route-registry.ts`) updated through DMS.15 for all DMS routes. AI routes use standard Next.js page routing.

---

## 26. Migration vs Live DB Comparison

### AI Migration Files Identified (18 files)

| Migration | Purpose | Live DB |
|---|---|---|
| `20260614191500_erp_settings_1_ai_settings_provider_configuration.sql` | SETTINGS.1 — AI provider configs, usage logs, feature flags | ✅ Applied |
| `20260615020000_erp_dms_10_ai_classification_extraction_foundation.sql` | DMS.10 — AI extraction jobs/results, AI columns | ✅ Applied |
| `20260615040000_erp_dms_11_ai_first_intake.sql` | DMS.11 — Intake sessions, review values | ✅ Applied |
| `20260615050000_erp_dms_ai_issue_date_suggestion.sql` | DMS AI issue date suggestion | ✅ Applied |
| `20260616180000_erp_common_ai_0_governance_feature_flags_permissions.sql` | AI.0 — 10 flags, 21 permissions | ✅ Applied |
| `20260616190000_erp_common_ai_1b_field_suggestions_tables.sql` | AI.1B — field suggestions tables, RLS, helpers | ✅ Applied |
| `20260617090000_erp_dms_ai_orch_1_orchestration_columns.sql` | DMS AI ORCH.1 — orchestration columns | ✅ Applied |
| `20260617120000_erp_common_ai_3_duplicate_candidates.sql` | AI.3 — duplicate candidates + events | ✅ Applied |
| `20260617140000_erp_common_ai_4_compliance_findings.sql` | AI.4 — compliance findings + events | ✅ Applied |
| `20260617150000_erp_common_ai_5_risk_scores.sql` | AI.5 — risk scores + events | ✅ Applied |
| `20260617160000_erp_common_ai_6_search.sql` | AI.6 — recent searches, search permissions | ✅ Applied |
| `20260617170000_erp_common_ai_7_assistant.sql` | AI.7 — assistant tables, permissions | ✅ Applied |
| `20260617180000_erp_common_ai_13_daily_dashboard.sql` | AI.13 — dashboard flag + permission | ✅ Applied |
| `20260617190000_erp_common_ai_14_audit_explainer.sql` | AI.14 — audit explainer cache table + permissions | ✅ Applied |
| `20260617200000_erp_common_ai_15_data_quality_monitor.sql` | AI.15 — data quality tables, flag, permissions | ✅ Applied |

Additional migrations from DMS.12.x (pgvector, GIN indexes, content text, completeness/risk columns), DMS.8A, DMS.13 batch intake, DMS Arabic Fix are not listed here but confirmed applied per SOT.

**All AI migration files match live DB schema. No drift detected between migrations and DB.** ✅

---

## 27. Planning vs Implementation Comparison Matrix

| Phase | Planned Scope | Implemented Scope | DB Migration | Feature Flag | Permissions | UI Route | Safety | Result |
|---|---|---|---|---|---|---|---|---|
| **AI.0** | Governance, flags, permissions | Fully implemented | ✅ 20260616180000 | 10 new flags | 21 ai.* permissions | n/a | ✅ | **PASS** |
| **AI.1A** | Registry, types, prompt contract | 12 source files, Zod schemas | None (code) | n/a | n/a | n/a | ✅ | **PASS** |
| **AI.1B** | DB tables, RLS, permissions, skeleton | Both tables + RLS + helpers | ✅ 20260616190000 | n/a | field_suggestions.* | n/a | ✅ | **PASS** |
| **AI.1C** | DMS evidence loader | evidence-loader.ts + sanitizer | None (code) | n/a | n/a | n/a | ✅ | **PASS** |
| **AI.1D** | Generation pipeline | Full pipeline + usage log | None (code) | ERP_AI_FORM_FILL | n/a | n/a | ✅ | **PASS** |
| **AI.1E** | Accept/reject/apply engine | All handlers + status transitions | None (code) | n/a | n/a | n/a | ✅ | **PASS** |
| **AI.1F** | UI panel + pilot integration | Panel in Org + Party forms | None (code) | n/a | n/a | integrated | ✅ | **PASS** |
| **AI.1G** | Security RLS runtime QA | All checks pass | None | n/a | verified | verified | ✅ | **PASS WITH NOTES** |
| **AI.2** | Document Understanding Center | 12-card tab, understanding builder | None (code) | ERP_AI_DOC_UNDERSTANDING | n/a | DMS record tab | ✅ | **PASS** |
| **AI.3** | Duplicate Detection | 13 rules, tables, UI, record alerts | ✅ 20260617120000 | ERP_AI_DUPLICATE_DETECT | duplicates.* | /admin/ai/duplicates | ✅ | **PASS** |
| **AI.4** | Compliance Checker | Rules, tables, UI, record alerts | ✅ 20260617140000 | ERP_AI_COMPLIANCE | compliance.* | /admin/ai/compliance | ✅ | **PASS** |
| **AI.5** | Risk Scoring | Deterministic, tables, UI | ✅ 20260617150000 | ERP_AI_RISK_SCORE | risk.* | /admin/ai/risk | ✅ | **PASS** |
| **AI.6** | Search Across ERP | 6 search modes, semantic reuse | ✅ 20260617160000 | AI_SEARCH | search.* | /search | ✅ | **PASS** |
| **AI.7** | Assistant for Actions | 10 actions, 14 blocked, tables | ✅ 20260617170000 | ERP_AI_ASSISTANT | assistant.* | /assistant | ⚠️ F-002 | **PASS WITH CRITICAL BUG** |
| **AI.8–12** | HR/Fleet/Workshop/Procure/Transport AI | Not implemented | None | None | None | None | ✅ | **DEFERRED (CORRECT)** |
| **AI.13** | Daily Dashboard | 9 sections, read-only | ✅ 20260617180000 | ERP_AI_DAILY_DASHBOARD | dashboard.* | /admin/ai/dashboard | ✅ | **PASS** |
| **AI.14** | Audit Trail Explainer | Sanitizer, cache, AI explain | ✅ 20260617190000 | ERP_AI_AUDIT_EXPLAINER | audit_explainer.* | /admin/ai/audit-explainer | ✅ | **PASS** |
| **AI.15** | Data Quality Monitor | 28 rules, tables, UI | ✅ 20260617200000 | ERP_AI_DATA_QUALITY_MONITOR | data_quality.* | /admin/ai/data-quality | ⚠️ F-001 | **PASS WITH CRITICAL BUG** |

---

## 28. Feature Flag UAT Recommendations

### For UAT Testing (Enable These)
| Flag | Recommendation | Reason |
|---|---|---|
| `DMS_OCR` | ✅ Keep enabled | Core DMS functionality |
| `DMS_AI_SUMMARY` | ✅ Keep enabled | Core DMS AI |
| `DMS_SEMANTIC_SEARCH` | ✅ Keep enabled | DMS search |
| `AI_SEARCH` | ✅ Keep enabled | Search functionality |
| `ERP_AI_ASSISTANT` | ✅ Keep enabled | Core assistant |
| `ERP_AI_DUPLICATE_DETECT` | ✅ Keep enabled | Audit functionality |
| `ERP_AI_COMPLIANCE` | ✅ Keep enabled | Audit functionality |
| `ERP_AI_RISK_SCORE` | ✅ Keep enabled | Audit functionality |

### Disable Before UAT (Conservative Recommendation)
| Flag | Recommendation | Reason |
|---|---|---|
| `ERP_AI_FORM_FILL` | ⚠️ **DISABLE** | SOT says "enable only for UAT by Sameer" — currently on |
| `ERP_AI_ACTIONS` | ⚠️ **DISABLE** | SOT says `ERP_AI_ACTIONS=false` — currently on, code doesn't use it |
| `ERP_AI_DAILY_BRIEF` | ⚠️ **DISABLE** | Orphan flag — no code uses it |
| `ERP_AI_ERP_SEARCH` | ⚠️ **DISABLE** | Orphan flag — code uses `AI_SEARCH` instead |
| `ERP_AI_DATA_QUALITY` | ⚠️ **DISABLE** | Legacy flag — superseded by `ERP_AI_DATA_QUALITY_MONITOR` |

### Set to `false` After F-001 Fix
| Flag | Target State |
|---|---|
| `ERP_AI_DATA_QUALITY_MONITOR` | Enable after F-001 is fixed and `ERP_AI_DATA_QUALITY` is disabled |

---

## 29. Full AI Module UAT Checklist

### AI Settings
- [ ] Navigate to `/admin/settings/ai`
- [ ] Verify provider configs list (should show configured providers without exposing API keys)
- [ ] Verify feature flags tab shows all 33 flags with correct states
- [ ] Verify usage logs tab shows recent AI call records

### DMS OCR
- [ ] Upload a PDF document to DMS inbox
- [ ] Run OCR on the file
- [ ] Verify OCR status badge shows "complete" and text is available
- [ ] Confirm raw OCR text is NOT shown on the document list

### DMS AI Summary
- [ ] Open a DMS document with content text
- [ ] Navigate to AI Summary tab
- [ ] Generate summary
- [ ] Verify summary is plain English (no markdown, no JSON)
- [ ] Confirm summary does not show raw OCR

### DMS Ask AI
- [ ] Open a non-confidential document
- [ ] Ask a question on the Ask AI tab
- [ ] Verify answer is returned with confidence badge
- [ ] Try on a confidential (hr/legal/executive) document as non-admin → should see blocked message

### DMS Semantic Search
- [ ] Navigate to DMS documents list
- [ ] Switch to Semantic Search mode
- [ ] Search for a topic
- [ ] Verify results show similarity percentage, not raw vectors

### AI Field Suggestions (after fixing ERP_AI_FORM_FILL intent)
- [ ] Navigate to an Organization record
- [ ] Scroll to "AI Review & Update" section
- [ ] Click Generate Suggestions
- [ ] Review suggested fields (should show source excerpt in collapsed popover only)
- [ ] Accept/Reject individual suggestions
- [ ] Apply an accepted suggestion
- [ ] Verify the field value updates in the main form

### Duplicate Detection
- [ ] Navigate to `/admin/ai/duplicates`
- [ ] Trigger a scan (if button available)
- [ ] Review any found duplicates
- [ ] Verify no merge/delete buttons exist (review only)

### Compliance Check
- [ ] Navigate to `/admin/ai/compliance`
- [ ] Review compliance findings
- [ ] Verify no auto-fix buttons exist

### Risk Scoring
- [ ] Navigate to `/admin/ai/risk`
- [ ] Review risk score records
- [ ] Open a Party or Organization record and verify risk alert badge

### AI Search
- [ ] Navigate to `/search`
- [ ] Search using AI Intent mode
- [ ] Verify results include entities + DMS documents
- [ ] Verify risk/compliance/duplicate badges appear per permission

### AI Assistant
- [ ] Navigate to `/assistant`
- [ ] Start a new session
- [ ] Ask "Explain duplicate candidates for party X"
- [ ] Verify blocked message for dangerous actions (e.g., "delete all records")
- [ ] Verify draft actions require manual review
- [ ] Confirm: `EXPLAIN_DUPLICATE` and `EXPLAIN_DOCUMENT` fail → report F-002 (known bug)

### AI Daily Dashboard
- [ ] Navigate to `/admin/ai/dashboard`
- [ ] Verify all 9 sections load without errors
- [ ] Verify dashboard is read-only (no action buttons)

### AI Audit Trail Explainer
- [ ] Navigate to `/admin/ai/audit-explainer`
- [ ] Select an entity type and ID
- [ ] Request an explanation
- [ ] Verify explanation is plain English without raw audit values

### AI Data Quality Monitor
- [ ] Navigate to `/admin/ai/data-quality`
- [ ] Click "Run Scan"
- [ ] Review findings across all 8 categories
- [ ] Review a finding detail panel
- [ ] Try to review/dismiss a finding
- [ ] Note: scan events will not appear in audit_logs until F-001 is fixed

### Permissions
- [ ] Log in as a user WITHOUT `ai.assistant.use` — Assistant page should show permission empty state
- [ ] Log in as company_admin — verify they can view AI dashboard but not scan data quality
- [ ] Verify system_admin can access all AI features

### Confidentiality
- [ ] Upload a document with confidentiality = "hr"
- [ ] Log in as non-admin user
- [ ] Verify DMS Ask AI shows "Access restricted" for that document
- [ ] Verify AI summary is redacted

### Feature Flags
- [ ] Disable `ERP_AI_ASSISTANT` in AI Settings
- [ ] Navigate to `/assistant` — should show feature disabled state
- [ ] Re-enable the flag

---

## 30. Risk Register

| ID | Area | Severity | Description | Evidence | Impact | Recommendation | Fix Now? | Phase |
|---|---|---|---|---|---|---|---|---|
| **F-001** | AI.15 Data Quality | **CRITICAL** | `logAuditEvent()` uses wrong `audit_logs` column names (`event_type`, `actor_id`, `entity_type`, `metadata_json`). All data quality scan events fail silently. | `data-quality.ts` lines 56–73; `audit_logs` schema confirmed | Zero audit trail for all data quality scans — compliance gap | Replace `logAuditEvent` with standard `logAudit()` | **YES** | COMMON AI.15-HOTFIX |
| **F-002** | AI.7 Assistant | **CRITICAL** | `action-registry.ts` uses `"ai.duplicate.view"` and `"dms.document.view"` — neither exists in DB. `EXPLAIN_DUPLICATE` and `EXPLAIN_DOCUMENT` fail for ALL users. | `action-registry.ts` lines 67+75; DB permissions query | These 2 assistant actions are permanently broken for all users | Fix to `"ai.duplicates.view"` and `"dms.documents.view"` | **YES** | COMMON AI.7-HOTFIX |
| **F-003** | AI.15 Flags | **HIGH** | Dual data quality flags: `ERP_AI_DATA_QUALITY=true` (legacy) enables monitor even though `ERP_AI_DATA_QUALITY_MONITOR=false`. | `isDataQualityMonitorEnabled()` checks both | Monitor behaves as enabled when it should be disabled | Disable `ERP_AI_DATA_QUALITY`; enable `ERP_AI_DATA_QUALITY_MONITOR` | **YES** | COMMON AI.15-HOTFIX |
| **F-004** | AI.1 Form Fill | **HIGH** | `ERP_AI_FORM_FILL=true` in live DB; SOT says "must be enabled by Sameer for UAT only". AI field suggestion generation is active for all permitted users. | Feature flag query | Unintended AI generation calls running in production | Disable unless actively in UAT | **YES** | Admin action |
| **F-005** | AI.6 Search | **MEDIUM** | `ERP_AI_ERP_SEARCH` flag is enabled but no code references it. Code uses `AI_SEARCH` flag. | rg search shows 0 code matches | No functional impact, but creates confusion and wastes a flag slot | Disable the orphan flag; document in SOT | NO | Cleanup phase |
| **F-006** | AI.7 Assistant Engine | **MEDIUM** | Dead code: `!input.userPermissions.includes("system_admin")` in `assistant-engine.ts`. `userPermissions` = `permissionCodes`, never contains role codes. | `assistant-engine.ts` search | System admin bypass is ineffective; no bug since permissions fail first via F-002 | Replace with proper role check or remove | With F-002 fix | COMMON AI.7-HOTFIX |
| **F-007** | AI.15 RBAC | **MEDIUM** | Custom `checkPermission()` in `data-quality.ts` lacks the `group_admin` bypass present in standard `hasPermission()`. | `data-quality.ts` lines 32–54 | `group_admin` users without explicit data quality permissions may be incorrectly blocked | Replace with standard `getAuthContext()` + `hasPermission()` | With F-001 fix | COMMON AI.15-HOTFIX |
| **F-007-NEW** | AI.7 Flags | **HIGH** | `ERP_AI_ACTIONS=true` in live DB; SOT explicitly states `ERP_AI_ACTIONS=false` remains disabled. No code checks this flag. | Feature flag query; rg search shows 0 matches | If future code relies on this flag it will unexpectedly be active | Disable `ERP_AI_ACTIONS` | Admin action | Admin action |
| **F-008** | All AI | **MEDIUM** | Flag drift: 31/33 flags enabled vs SOT stating many created as `is_enabled=false`. No audit trail of when flags were toggled. | Feature flag query | Hard to know which flags are intentional vs accidental enables | Document intended flag states in SOT; review all flags in table | NO | Admin action |
| **F-009** | AI.13 | **LOW** | `ERP_AI_DAILY_BRIEF` is enabled but no code references it anywhere. | rg search: 0 matches | No functional impact | Disable orphan flag | NO | Cleanup phase |

---

## 31. Open Questions

1. **Who enabled the disabled flags?** `ERP_AI_DAILY_DASHBOARD`, `ERP_AI_AUDIT_EXPLAINER`, `ERP_AI_FORM_FILL`, `ERP_AI_ACTIONS` were created as `is_enabled=false` but are now `true`. Was this intentional UAT enabling, or accidental?

2. **Should `ERP_AI_DATA_QUALITY` be deprecated?** The legacy flag is keeping the monitor enabled when the new flag is `false`. Should we disable the legacy flag and rely only on `ERP_AI_DATA_QUALITY_MONITOR`?

3. **`EXPLAIN_DOCUMENT` permission** — should it be `"dms.documents.view"` or `"dms.documents.ai.view"`? The latter is a more specific permission that exists in DB (`dms.documents.ai.view`). Sameer should confirm.

4. **`ERP_AI_DAILY_BRIEF` flag** — what was the original intent? The flag exists but no feature code references it. Was it a placeholder for a "daily brief" email or report feature?

5. **`ERP_AI_ACTIONS` flag** — is this meant to gate the `ai.actions.execute_after_confirm` permission pathway? Or is it an orphan from an earlier planning document?

6. **HR Module timeline** — now that all Common AI phases are closed, when does HR module development start?

---

## 32. Recommended Fixes / Next Actions

### Priority 1 — Fix Immediately (Before HR Module)

**HOTFIX-1: Fix F-001 in `data-quality.ts`**
```typescript
// Replace logAuditEvent() with standard logAudit():
import { logAudit } from '@/server/actions/audit';

// Replace each logAuditEvent() call with:
await logAudit({
  module_code: 'AI',
  entity_name: 'DataQualityFinding',
  entity_id: entityId,
  action: 'data_quality_scan_started',  // or appropriate action
  actor_user_profile_id: userId,
  new_values: { ...metadata },
});
```

**HOTFIX-2: Fix F-002 in `action-registry.ts`**
```typescript
// Line 67: change "ai.duplicate.view" → "ai.duplicates.view"
// Line 75: change "dms.document.view" → "dms.documents.view"
//   (or "dms.documents.ai.view" — confirm with Sameer)
```

**HOTFIX-3: Fix F-006 in `assistant-engine.ts`**
```typescript
// Remove dead code: !input.userPermissions.includes("system_admin")
// Either:
// (a) Remove the bypass entirely (standard hasPermission() already handles system_admin)
// (b) Add proper role check: !input.userRoles?.includes("system_admin")
```

**HOTFIX-4: Fix F-007 in `data-quality.ts`**
Replace custom `checkPermission()` with standard:
```typescript
import { getAuthContext } from '@/lib/rbac/check';
const ctx = await getAuthContext();
if (!hasPermission(ctx, 'ai.data_quality.scan')) { ... }
```

### Priority 2 — Admin Actions (No Code Changes)

- Disable `ERP_AI_FORM_FILL` unless actively UAT-testing AI.1
- Disable `ERP_AI_ACTIONS` (SOT says it should be false)
- Disable `ERP_AI_ERP_SEARCH` (orphan flag)
- Disable `ERP_AI_DAILY_BRIEF` (orphan flag)
- Disable `ERP_AI_DATA_QUALITY` (legacy flag superseded by `ERP_AI_DATA_QUALITY_MONITOR`)
- Enable `ERP_AI_DATA_QUALITY_MONITOR` after disabling legacy flag and after F-001 hotfix

### Priority 3 — After Fixes (Documentation)

- Update SOT after hotfixes
- Document the intended flag state for each flag in SOT
- Add a note in SOT about the fix phases

---

## 33. Final Decision Recommendation

### Overall AI Module Status

| Category | Result |
|---|---|
| Architecture | ✅ Sound — layered providers, RLS, event sourcing |
| TypeScript | ✅ 0 errors |
| RLS | ✅ All 22 AI tables ENABLED+FORCED |
| Event Sourcing | ✅ All 6 event tables append-only |
| Sensitive Data | ✅ No leaks detected |
| OpenAI Imports | ✅ Only in approved provider layer |
| Future Module Leakage | ✅ None detected in AI.13–AI.15 |
| F-001 Audit Bug | ❌ **CRITICAL — UNFIXED** |
| F-002 Permission Bug | ❌ **CRITICAL — UNFIXED** |
| Feature Flag Drift | ⚠️ **HIGH — 5 flags diverged from SOT** |
| Lint | ⚠️ FAIL (246 issues, all in UIUX_Design prototype, not main app) |

### Can We Freeze Common AI and Return to HR Module?

**YES — with conditions:**

The Common AI module is architecturally complete and functionally sound for the vast majority of features. The two critical bugs (F-001, F-002) are small, targeted code fixes (< 20 lines each) that do not require migrations or architectural changes.

**Conditions to satisfy before fully freezing:**
1. **Fix F-001** — replace `logAuditEvent` with `logAudit` (1 day)
2. **Fix F-002** — correct 2 permission code strings + F-006 dead code (1 day)
3. **Disable orphan/legacy flags** — admin action, no code change (30 minutes)
4. **Update SOT** with hotfix records

After these four actions: Common AI is fully production-ready.

### Recommended Next Prompt

```
Fix F-001, F-002, F-006, F-007 from the AI module audit v2:

1. F-001: In src/server/actions/ai/common/data-quality.ts, replace the
   logAuditEvent() private function with calls to the standard logAudit()
   from src/server/actions/audit.ts, using correct column names:
   action (not event_type), actor_user_profile_id (not actor_id),
   new_values (not metadata_json). Remove entity_type field.
   Also replace the custom checkPermission() with getAuthContext() + hasPermission()
   from src/lib/rbac/check.ts to fix F-007.

2. F-002: In src/lib/ai/common/assistant/action-registry.ts:
   - Line ~67: "ai.duplicate.view" → "ai.duplicates.view"
   - Line ~75: "dms.document.view" → "dms.documents.view"
   (or dms.documents.ai.view — confirm with Sameer)
   
3. F-006: In src/lib/ai/common/assistant/assistant-engine.ts,
   remove the dead-code system_admin bypass:
   !input.userPermissions.includes("system_admin")
   The standard hasPermission() utility handles system_admin correctly.

After code fixes:
- Disable in erp_ai_feature_flags: ERP_AI_FORM_FILL, ERP_AI_ACTIONS,
  ERP_AI_ERP_SEARCH, ERP_AI_DAILY_BRIEF, ERP_AI_DATA_QUALITY
- Enable: ERP_AI_DATA_QUALITY_MONITOR
- Update SOT with hotfix report.
- Then proceed to HR Module planning.
```

---

## Appendix A — AI Tables

### Common AI Tables (22 confirmed via live DB)
| Table | Purpose | RLS |
|---|---|---|
| `erp_ai_provider_configs` | AI provider configurations | ENABLED+FORCED |
| `erp_ai_usage_logs` | AI call usage tracking | ENABLED+FORCED |
| `erp_ai_feature_flags` | Feature flag registry | ENABLED+FORCED |
| `erp_ai_field_suggestions` | Field suggestion records | ENABLED+FORCED |
| `erp_ai_field_suggestion_events` | Append-only field suggestion events | ENABLED+FORCED |
| `erp_ai_duplicate_candidates` | Duplicate detection records | ENABLED+FORCED |
| `erp_ai_duplicate_candidate_events` | Append-only duplicate events | ENABLED+FORCED |
| `erp_ai_compliance_findings` | Compliance finding records | ENABLED+FORCED |
| `erp_ai_compliance_finding_events` | Append-only compliance events | ENABLED+FORCED |
| `erp_ai_risk_scores` | Risk score records | ENABLED+FORCED |
| `erp_ai_risk_score_events` | Append-only risk score events | ENABLED+FORCED |
| `erp_ai_recent_searches` | Recent search history | ENABLED+FORCED |
| `erp_ai_assistant_sessions` | Assistant conversation sessions | ENABLED+FORCED |
| `erp_ai_assistant_messages` | Append-only assistant messages | ENABLED+FORCED |
| `erp_ai_assistant_action_drafts` | Assistant action drafts | ENABLED+FORCED |
| `erp_ai_audit_explanations` | AI audit explanation cache | ENABLED+FORCED |
| `erp_ai_data_quality_findings` | Data quality finding records | ENABLED+FORCED |
| `erp_ai_data_quality_finding_events` | Append-only data quality events | ENABLED+FORCED |
| `dms_ai_extraction_jobs` | DMS AI extraction job records | ENABLED+FORCED |
| `dms_ai_extraction_results` | DMS AI extraction results | ENABLED+FORCED |
| `dms_ai_link_suggestions` | DMS smart link suggestions | ENABLED+FORCED |
| `dms_ai_tag_suggestions` | DMS auto-tag suggestions | ENABLED+FORCED |

---

## Appendix B — AI Permissions

### Common AI (`ai.*` — 34 codes)
- `ai.actions.execute_after_confirm`, `ai.actions.prepare`
- `ai.assistant.admin`, `ai.assistant.use`, `ai.assistant.view`
- `ai.audit_explainer.admin`, `ai.audit_explainer.use`, `ai.audit_explainer.view`
- `ai.common.admin`, `ai.common.apply`, `ai.common.generate`, `ai.common.view`
- `ai.compliance.generate`, `ai.compliance.review`, `ai.compliance.view`
- `ai.dashboard.admin`, `ai.dashboard.view`
- `ai.data_quality.admin`, `ai.data_quality.manage`, `ai.data_quality.review`, `ai.data_quality.scan`, `ai.data_quality.view`
- `ai.duplicates.review`, `ai.duplicates.view`
- `ai.field_suggestions.apply`, `ai.field_suggestions.generate`, `ai.field_suggestions.manage`, `ai.field_suggestions.view`
- `ai.risk.generate`, `ai.risk.review`, `ai.risk.view`
- `ai.search.use`, `ai.search.view`

### DMS AI (`dms.*` — 38 codes, key AI ones)
- `dms.documents.ai.retry`, `dms.documents.ai.run`, `dms.documents.ai.supersede`, `dms.documents.ai.view`
- `dms.documents.ocr.retry`, `dms.documents.ocr.skip`, `dms.documents.ocr.trigger`, `dms.documents.ocr.view`
- `dms.documents.review_ai`
- `dms.admin`, `dms.ocr.admin`
- `dms.documents.view` (confirmed exists — used correctly by all DMS features except F-002)

---

## Appendix C — AI Feature Flags (Live DB)

| Code | Enabled | Human Review | Notes |
|---|---|---|---|
| AI_SEARCH | ✅ | false | Used correctly by AI.6 |
| DMS_AI_ORCHESTRATION | ✅ | false | DMS ORCH.1 |
| DMS_AI_REVIEW | ✅ | true | DMS intake |
| DMS_AI_SEARCH | ✅ | false | DMS.12.4 |
| DMS_AI_SUMMARY | ✅ | false | DMS.12.2 |
| DMS_AUTO_TAGS | ✅ | true | DMS.12.4 |
| DMS_BATCH_INTAKE | ✅ | true | DMS.13 |
| DMS_CLASSIFICATION | ✅ | true | DMS.10 |
| DMS_COMPLETENESS | ✅ | false | DMS.12.3 |
| DMS_CONTENT_TEXT_SYNC | ✅ | false | DMS.12.1 |
| DMS_CROSS_DOC_SEARCH | ✅ | false | DMS.12.4 |
| DMS_DOCUMENT_QA | ✅ | false | DMS.12.4 |
| DMS_DUPLICATE_DETECT | ✅ | true | DMS duplicate |
| DMS_EXPIRY_INTEL | ✅ | false | DMS.8 |
| DMS_EXTRACTION | ✅ | true | DMS.10 |
| DMS_OCR | ✅ | true | DMS.9 |
| DMS_RISK_SCORE | ✅ | false | DMS.12.3 |
| DMS_SEMANTIC_SEARCH | ✅ | false | DMS.12.5 |
| DMS_SMART_LINKS | ✅ | true | DMS.12.4 |
| ERP_AI_ACTIONS | ✅ **ORPHAN** | true | SOT says false; no code uses it |
| ERP_AI_ASSISTANT | ✅ | false | AI.7 |
| ERP_AI_AUDIT_EXPLAINER | ✅ **DRIFT** | false | SOT created as false |
| ERP_AI_COMPLIANCE | ✅ | false | AI.4 |
| ERP_AI_DAILY_BRIEF | ✅ **ORPHAN** | false | No code uses it |
| ERP_AI_DAILY_DASHBOARD | ✅ **DRIFT** | false | SOT created as false |
| ERP_AI_DATA_QUALITY | ✅ **LEGACY** | true | Superseded by MONITOR flag |
| ERP_AI_DATA_QUALITY_MONITOR | ❌ | false | Intended new flag; currently disabled |
| ERP_AI_DOC_UNDERSTANDING | ✅ **DRIFT** | true | SOT created as false |
| ERP_AI_DUPLICATE_DETECT | ✅ | true | AI.3 |
| ERP_AI_ERP_SEARCH | ✅ **ORPHAN** | false | Code uses AI_SEARCH |
| ERP_AI_FORM_FILL | ✅ **DRIFT** | true | SOT: enable for UAT only |
| ERP_AI_RISK_SCORE | ✅ | false | AI.5 |
| LOCAL_LLM | ❌ | true | Not configured |

---

## Appendix D — AI Routes

| Route | Module | Notes |
|---|---|---|
| `/admin/settings/ai` | AI Settings | Provider configs, feature flags, usage logs |
| `/admin/ai/dashboard` | AI.13 Daily Dashboard | 9 read-only sections |
| `/admin/ai/duplicates` | AI.3 Duplicate Detection | Admin + record alerts |
| `/admin/ai/compliance` | AI.4 Compliance | Admin + record alerts |
| `/admin/ai/risk` | AI.5 Risk Scoring | Admin + record alerts |
| `/admin/ai/audit-explainer` | AI.14 Audit Explainer | AI explanation with sanitizer |
| `/admin/ai/data-quality` | AI.15 Data Quality | 28 deterministic rules |
| `/admin/dms/intelligence` | DMS.12.4A Admin Tools | Bulk operations, health stats |
| `/search` | AI.6 ERP Search | 6 search modes |
| `/assistant` | AI.7 AI Assistant | Session-based, draft-only |

---

## Appendix E — SQL Queries Used

SQL queries used during this audit are saved in:
- `implementation_Review/sql_review/FULL_AI_MODULE_DEEP_AUDIT_READ_ONLY_SCHEMA_CHECKS.sql`
- `implementation_Review/sql_review/FULL_AI_MODULE_DEEP_AUDIT_FINDINGS_QUERIES.sql`

All queries are SELECT-only. No DML executed.

---

## Appendix F — File Evidence Index

| Finding | File | Lines |
|---|---|---|
| F-001 (logAuditEvent wrong columns) | `src/server/actions/ai/common/data-quality.ts` | 56–73 |
| F-001 (correct audit_logs schema) | Live DB `audit_logs` column query | — |
| F-002 (ai.duplicate.view wrong code) | `src/lib/ai/common/assistant/action-registry.ts` | ~67 |
| F-002 (dms.document.view wrong code) | `src/lib/ai/common/assistant/action-registry.ts` | ~75 |
| F-003 (dual flag check) | `src/server/actions/ai/common/data-quality.ts` | 77–91 |
| F-006 (dead system_admin check) | `src/lib/ai/common/assistant/assistant-engine.ts` | ~148 |
| F-007 (custom checkPermission) | `src/server/actions/ai/common/data-quality.ts` | 32–54 |
| OpenAI imports (correct locations) | `src/lib/ai/providers/factory.ts`, `src/lib/dms/ai/factory.ts` | — |
| Audit sanitizer BLOCKED_FIELDS | `src/lib/ai/common/audit-explainer/audit-sanitizer.ts` | — |
| Correct logAudit signature | `src/server/actions/audit.ts` | — |

---

*This report was generated by Cursor AI Agent on 2026-06-18.*  
*Audit is read-only. No fixes were applied. No migrations created. No database changes made.*  
*Ready for Sameer/ChatGPT review.*

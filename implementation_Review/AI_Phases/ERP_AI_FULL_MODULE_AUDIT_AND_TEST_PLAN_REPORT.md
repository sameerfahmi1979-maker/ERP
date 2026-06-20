# ALGT ERP — Full AI Module Audit & Test Plan Report

**Report type:** Read-only audit (no fixes applied)  
**Date:** 2026-06-18  
**Auditor:** Cursor Agent (automated static + live DB + build verification)  
**Project:** `c:\dev\agt-erp`  
**Live Supabase:** `https://mmiefuieduzdiiwnqpie.supabase.co` (via `user-supabase` MCP)  
**Scope:** All implemented AI modules — SETTINGS.1, DMS AI (9–13, 12.x, ORCH.1, OCR-AI FIX.1), COMMON AI (0–7, 13–15)

---

## 1. Executive Summary

This report documents a **read-only audit** of every AI-related module in ALGT ERP. No code, database, or configuration changes were made during this audit.

| Area | Result | Notes |
|------|--------|-------|
| **Code inventory** | PASS | 87+ lib files, 9 Common AI server action modules, 18 DMS AI action files, 16 protected routes |
| **TypeScript** | PASS | `npx tsc --noEmit` — 0 errors |
| **Production build** | PASS | `npx next build` — all AI routes compiled |
| **AI table RLS** | PASS | 22 AI/DMS-AI tables: RLS enabled + forced |
| **Event tables append-only** | PASS | 6 event tables — SELECT/INSERT only, no UPDATE/DELETE policies |
| **Direct OpenAI SDK in features** | PASS | No `import OpenAI` in feature/server AI code (provider layer only) |
| **Future module leakage (HR/Fleet/etc.)** | PASS | No queries to deferred module tables in `src/lib/ai` |
| **Feature flag drift** | **FINDING** | Live DB: 32/33 AI flags `is_enabled=true`; seeds/docs expect many `false` |
| **Live runtime UAT (browser)** | **NOT EXECUTED** | Requires authenticated session; checklist provided below |
| **ChatGPT prompt folder** | **NOT FOUND** | `ChatGPT/` exists but contains 0 files in workspace snapshot |

**Overall audit posture:** Architecture and security patterns are **strong and consistent** with ERP AI standards. Primary gaps are **operational** (feature-flag drift, sparse test data in several AI tables, full browser UAT not run in this session) and **one migration file vs live DB schema mismatch** on AI.15 (documented, live DB correct).

---

## 2. Audit Methodology

### 2.1 What was performed (this session)

1. **Repository inventory** — recursive scan of `src/lib/ai/`, `src/lib/dms/ai|ocr|orchestration/`, `src/features/ai/`, `src/server/actions/ai/`, DMS AI actions, routes, migrations, standards, rules, 70+ implementation reports under `implementation_Review/AI_Phases/` and DMS AI phases.
2. **Static code analysis** — grep for OpenAI SDK imports, `console.log`, sensitive field exposure (`content_text`, `ocr_text`, `prompt`, `raw_response`), HR/Fleet table references, forbidden UI action labels.
3. **Live Supabase verification** — feature flags, provider configs, RLS status, policy counts, row counts, Supabase security advisors.
4. **Build verification** — TypeScript + Next.js build; route presence confirmed for all AI admin pages.
5. **Cross-reference** — implementation reports vs SOT (`.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`) vs `docs/standards/ERP_COMMON_AI_ENGINE_STANDARD.md`.

### 2.2 What was NOT performed (requires manual follow-up)

- Authenticated browser walkthrough of every screen (login required).
- End-to-end OpenAI API calls with cost-bearing operations at scale.
- RLS negative testing with multiple user roles (company_admin vs view-only) via PostgREST.
- Load/performance testing of batch scans, bulk embedding, batch intake.
- Penetration testing of `createAdminClient()` bypass paths.

### 2.3 Documents reviewed (representative)

| Category | Count / Location |
|----------|------------------|
| Implementation reports | 22 under `implementation_Review/AI_Phases/` + 15+ DMS AI reports |
| Planning reports | `ERP_COMMON_AI_*_PLAN*.md`, DMS 12 planning, AI roadmap |
| Standards | `docs/standards/ERP_COMMON_AI_ENGINE_STANDARD.md`, `ERP_DMS_AI_FIRST_UPLOAD_*` |
| Cursor rules | `erp-common-ai-standard.mdc`, `erp-ai-settings-standard.mdc`, `erp-dms-ai-first-upload-standard.mdc` |
| SQL migrations (AI) | 15 true AI migrations + DMS 12.x/OCR related |
| SQL reviews | `implementation_Review/sql_review/ERP_COMMON_AI_*`, `ERP_DMS_AI_ORCH_1_*` |
| Source of Truth | `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` |
| ChatGPT prompts | **Folder empty** — prompts referenced in SOT/reports only |

---

## 3. AI Module Inventory

### 3.1 Platform — SETTINGS.1 (AI Provider Configuration)

| Item | Path / Detail |
|------|---------------|
| Route | `/admin/settings/ai` |
| Server actions | `src/server/actions/settings/ai-settings.ts` (10 exports) |
| UI | `src/features/settings/ai/*` |
| Provider layer | `src/lib/ai/providers/factory.ts`, `openai-provider.ts`, `local-provider.ts` |
| Migration | `20260614191500_erp_settings_1_ai_settings_provider_configuration.sql` |
| Tables | `erp_ai_provider_configs`, `erp_ai_feature_flags`, `erp_ai_usage_logs` |

### 3.2 COMMON AI Phases

| Phase | Name | Route(s) | Server Actions | Status (SOT) |
|-------|------|----------|----------------|--------------|
| AI.0 | Governance baseline | — | — | CLOSED |
| AI.1A–1G | Field suggestions engine | Party/Org forms (embedded) | `field-suggestions.ts` (7 exports) | CLOSED |
| AI.2 | Document Understanding | DMS record tabs | `document-understanding.ts` | CLOSED |
| AI.3 | Duplicate detection | `/admin/ai/duplicates` | `duplicate-detection.ts` (12 exports) | CLOSED |
| AI.4 | Compliance checker | `/admin/ai/compliance` | `compliance-checker.ts` (13 exports) | CLOSED |
| AI.5 | Risk scoring | `/admin/ai/risk` | `risk-scoring.ts` (11 exports) | CLOSED |
| AI.6 | Search across ERP | `/search` | `search.ts` (7 exports) | CLOSED |
| AI.7 | Assistant for actions | `/assistant` | `assistant.ts` (10 exports) | CLOSED |
| AI.8–12 | Module-specific AI | — | — | **DEFERRED** |
| AI.13 | Daily dashboard | `/admin/ai/dashboard` | `dashboard.ts` (3 exports) | CLOSED |
| AI.14 | Audit explainer | `/admin/ai/audit-explainer` | `audit-explainer.ts` (7 exports) | CLOSED |
| AI.15 | Data quality monitor | `/admin/ai/data-quality` | `data-quality.ts` (10 exports) | CLOSED |

### 3.3 DMS AI Phases

| Phase | Capability | Key actions file |
|-------|------------|------------------|
| DMS.9 | OCR pipeline | `ocr.ts` (8 exports) |
| DMS.10 | Classification/extraction | `ai-analysis.ts` (6 exports) |
| DMS.11 | AI-first intake | `ai-intake.ts` (7 exports) |
| DMS.12.1 | Content text | `document-content.ts` |
| DMS.12.2 | AI summary | `ai-summary.ts` |
| DMS.12.3 | Completeness/risk | `ai-completeness.ts`, `ai-risk.ts` |
| DMS.12.4 | Search, Ask AI, tags, links | `ai-search.ts`, `document-qa.ts`, `ai-tags.ts`, `ai-links.ts` |
| DMS.12.5 | Semantic search (pgvector) | `semantic-search.ts` |
| DMS.13 | Batch intake | `batch-intake.ts` |
| DMS ORCH.1 | Full pipeline orchestration | `orchestration.ts` |
| DMS OCR-AI FIX.1 | Text pipeline repair | `intelligence-admin.ts`, `persist-file-ocr-result.ts` |
| DMS Intelligence Admin | `/admin/dms/intelligence` | `intelligence-admin.ts`, `ai-intelligence.ts` |

---

## 4. Master Test Plan (Detailed — For Full UAT Execution)

Use this section as the **executable test plan**. Mark each row Pass/Fail/Blocked during manual UAT.

### 4.1 Global preconditions

| # | Step | Expected |
|---|------|----------|
| G1 | Login as `system_admin` | All AI admin routes accessible |
| G2 | Login as `company_admin` (view-only AI perms) | View routes work; generate/scan/apply blocked |
| G3 | Login as user without `ai.*` | Redirect or permission empty state |
| G4 | Verify `OPENAI_API_KEY` in server env | AI Settings → Test Connection = success |
| G5 | Document current feature flag state before UAT | Snapshot `erp_ai_feature_flags` |

### 4.2 SETTINGS.1 — AI Settings

| # | Test | Steps | Expected |
|---|------|-------|----------|
| S1 | List providers | Open `/admin/settings/ai` | Shows DEFAULT_CHAT, DMS configs |
| S2 | Secret masking | View provider detail | Only `masked_secret_preview`, never full key |
| S3 | Test connection | Click Test on DEFAULT_CHAT | `last_test_status=success` |
| S4 | Feature flags panel | Toggle a flag off/on | UI reflects; DB updates |
| S5 | Usage logs | View usage table | Token counts only; no prompt text |
| S6 | Network inspection | DevTools → Network during load | No API keys in responses |

### 4.3 COMMON AI.1 — Field Suggestions (Party + Organization)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| F1 | Panel visibility | Open Party record → AI Review section | Panel renders with human-review warning |
| F2 | Generate (flag on) | Click Generate | Suggestions appear; usage logged |
| F3 | Generate (flag off) | Disable `ERP_AI_FORM_FILL` | Controlled error, no crash |
| F4 | Accept single | Accept one suggestion | Status → accepted |
| F5 | Apply single | Apply accepted suggestion | Target field updates; suggestion → applied |
| F6 | Reject | Reject suggestion | Status → rejected; no target mutation |
| F7 | Batch accept+apply | Select multiple → Accept Selected | Per-item results |
| F8 | Evidence safety | Expand source excerpt | Snippet capped; no full OCR/content_text |
| F9 | FK field block | Suggestion on FK field | Apply blocked with safe message |
| F10 | Branch/site gate | Open branch/site form | No AI panel (Stage 2 stub only) |
| F11 | RLS — other user | User B tries to read User A suggestions via API | Denied by RLS |
| F12 | Audit trail | After apply | `audit_logs` entry; no sensitive payload |

### 4.4 COMMON AI.2 — Document Understanding

| # | Test | Steps | Expected |
|---|------|-------|----------|
| U1 | Understanding tab | Open DMS document record | 12-card layout loads |
| U2 | Confidential doc | hr/legal/executive doc as non-admin | Redacted/blocked sections |
| U3 | Field candidates | View candidates block | Preview only; link to entity review |
| U4 | No raw OCR | Inspect network response | No `content_text`, no OCR body |

### 4.5 COMMON AI.3 — Duplicate Detection

| # | Test | Steps | Expected |
|---|------|-------|----------|
| D1 | Scan all | `/admin/ai/duplicates` → Run scan | Candidates created |
| D2 | Entity scan | Scan for specific party | Scoped results |
| D3 | Review | Mark reviewed | Status + event written |
| D4 | Resolve / ignore | Resolve or ignore candidate | Status updated; append-only event |
| D5 | Record alert | Party form header | Duplicate count badge if open |
| D6 | IBAN masking | View candidate evidence | Full IBAN never shown |
| D7 | No auto-merge | Confirm UI | No Merge/Auto-resolve buttons |

### 4.6 COMMON AI.4 — Compliance Checker

| # | Test | Steps | Expected |
|---|------|-------|----------|
| C1 | Scan | Run compliance scan | Findings in DB (live: 10 rows exist) |
| C2 | Critical open | Filter critical | List shows open critical |
| C3 | Review / waive / false positive | Each action | Status transitions + events |
| C4 | Party/org alerts | Record forms | Compliance alert component |
| C5 | DMS integration | Document understanding | Compliance count reflected |

### 4.7 COMMON AI.5 — Risk Scoring

| # | Test | Steps | Expected |
|---|------|-------|----------|
| R1 | Calculate entity | Trigger risk calc for party | Score persisted |
| R2 | Review | Mark reviewed | `reviewed_at` set |
| R3 | Stale detection | After underlying change | Stale flag if applicable |
| R4 | Admin page | `/admin/ai/risk` | List + detail |
| R5 | Deterministic-only | No OpenAI call for score | Usage log shows deterministic method |

### 4.8 COMMON AI.6 — Search Across ERP

| # | Test | Steps | Expected |
|---|------|-------|----------|
| SE1 | Quick keyword | `/search` mode quick | Results from parties/orgs/branches/sites |
| SE2 | AI intent mode | Natural language query | Intent JSON + results |
| SE3 | Semantic docs | Document semantic mode | Delegates to DMS semantic search |
| SE4 | Recent searches | Perform search | Saved in `erp_ai_recent_searches` (live: 16 rows) |
| SE5 | Clear recent | Clear history | Rows removed for user |
| SE6 | Confidential redaction | Search hits confidential DMS | Redacted in results |
| SE7 | Permission gate | User without `ai.search.use` | Blocked |

### 4.9 COMMON AI.7 — Assistant

| # | Test | Steps | Expected |
|---|------|-------|----------|
| A1 | Start session | `/assistant` → new session | Session row created |
| A2 | Send message | Ask "search for X" | Intent routed; response bubble |
| A3 | Blocked action | Ask "delete all parties" | Blocked response; no execution |
| A4 | Draft creation | Trigger PREPARE_* action | Draft in `erp_ai_assistant_action_drafts` |
| A5 | Draft review | Mark reviewed / accepted | Status-only update |
| A6 | Draft dismiss | Dismiss draft | Status dismissed |
| A7 | Message append-only | Attempt UPDATE on messages table | RLS denies |
| A8 | Max messages | Send 51+ messages | Cap enforced (50) |

### 4.10 COMMON AI.13 — Daily Dashboard

| # | Test | Steps | Expected |
|---|------|-------|----------|
| DB1 | Load dashboard | `/admin/ai/dashboard` | KPI cards + sections |
| DB2 | Scope selector | Today / 7d / 30d | Data refreshes |
| DB3 | Read-only | Inspect all buttons | Navigation links only; no Fix/Apply |
| DB4 | Flag off | Disable `ERP_AI_DAILY_DASHBOARD` | Page behavior per spec (view may still work) |
| DB5 | Section drill-down | Click section link | Navigates to source module |

### 4.11 COMMON AI.14 — Audit Explainer

| # | Test | Steps | Expected |
|---|------|-------|----------|
| AE1 | Timeline load | `/admin/ai/audit-explainer` | Timeline items |
| AE2 | Explain entry | Click Explain on audit item | Plain-English summary |
| AE3 | AI fallback | Disable provider / flag | Deterministic fallback text |
| AE4 | Cache | Re-explain same entry | Cached explanation returned |
| AE5 | Sanitizer | Inspect explanation | No IBAN/TRN/OCR/prompt text |
| AE6 | Usage log | After AI explain | Tokens logged; no prompt in `erp_ai_usage_logs` |

### 4.12 COMMON AI.15 — Data Quality Monitor

| # | Test | Steps | Expected |
|---|------|-------|----------|
| DQ1 | Load page | `/admin/ai/data-quality` | Summary + filters + table |
| DQ2 | Dry run scan | Dry Run enabled → Run | Counts shown; DB unchanged |
| DQ3 | Full scan | Run scan (flag must be on) | Findings upserted |
| DQ4 | Review / dismiss / FP / reopen | Each on a finding | Status + append-only event |
| DQ5 | Source link | Open Source Record | Navigates only; no mutation |
| DQ6 | No Fix button | Inspect detail panel | Review/Dismiss/FP/Reopen only |
| DQ7 | Evidence safety | View `safe_evidence_json` | No raw sensitive values |
| DQ8 | Flag gate | `ERP_AI_DATA_QUALITY_MONITOR=false` | Scan blocked unless `ERP_AI_DATA_QUALITY=true` (legacy) |

### 4.13 DMS AI — End-to-end document pipeline

| # | Test | Steps | Expected |
|---|------|-------|----------|
| M1 | Upload inbox | `/dms/inbox` upload PDF | Session created |
| M2 | AI Fill | Upload & AI Fill | Intake session with AI processing |
| M3 | Intake review | `/dms/intake/[sessionCode]` | Editable form + confidence badges |
| M4 | Approve & save | Approve | Document created; file promoted |
| M5 | OCR | Document → OCR tab → Run OCR | `ocr_text` stored server-side |
| M6 | AI Analysis | Run AI Analysis | Job + result rows (live: 79 jobs, 33 results) |
| M7 | AI Summary | Generate summary | `ai_summary` on document |
| M8 | Intelligence | Evaluate completeness/risk | Scores on document |
| M9 | Ask AI | Ask AI tab question | Answer card; confidential gated |
| M10 | Tag suggestions | Suggest → Accept | Tags applied (live: 4 tag suggestions) |
| M11 | Link suggestions | Suggest → Accept | Party link created |
| M12 | Semantic search | Generate embedding → search | Similarity results |
| M13 | Batch intake | Multi-file batch | One-by-one approval only |
| M14 | Orchestration | Post-draft pipeline | Step JSON safe (no OCR in JSON) |
| M15 | Intelligence admin | `/admin/dms/intelligence` | Bulk tools + health cards |

---

## 5. Database Audit Results

### 5.1 AI-related tables — RLS status (live verified)

All tables below: **`rls_enabled=true`, `rls_forced=true`**.

| Table | Policies | Notes |
|-------|----------|-------|
| `erp_ai_field_suggestions` | 3 (SELECT/INSERT/UPDATE) | Soft delete via UPDATE |
| `erp_ai_field_suggestion_events` | 2 (SELECT/INSERT) | Append-only ✅ |
| `erp_ai_duplicate_candidates` | 3 | |
| `erp_ai_duplicate_candidate_events` | 2 | Append-only ✅ |
| `erp_ai_compliance_findings` | 3 | |
| `erp_ai_compliance_finding_events` | 2 | Append-only ✅ |
| `erp_ai_risk_scores` | 3 | |
| `erp_ai_risk_score_events` | 2 | Append-only ✅ |
| `erp_ai_recent_searches` | 3 | User-scoped |
| `erp_ai_assistant_sessions` | 3 | |
| `erp_ai_assistant_messages` | 2 | Append-only ✅ |
| `erp_ai_assistant_action_drafts` | 3 | Status-only updates |
| `erp_ai_audit_explanations` | 3 | |
| `erp_ai_data_quality_findings` | 3 | |
| `erp_ai_data_quality_finding_events` | 2 | Append-only ✅ |
| `erp_ai_provider_configs` | 4 | |
| `erp_ai_feature_flags` | (RLS on) | |
| `erp_ai_usage_logs` | 2 | |
| `dms_ai_extraction_jobs` | 2 | |
| `dms_ai_extraction_results` | 2 | |
| `dms_ai_tag_suggestions` | 2 | |
| `dms_ai_link_suggestions` | 2 | |
| `dms_document_content` | 2 | `content_text` gated |

### 5.2 Helper functions (AI entity RLS)

| Function | Security | Linter note |
|----------|----------|-------------|
| `current_user_can_view_ai_entity` | INVOKER | WARN: mutable search_path |
| `current_user_can_manage_ai_entity` | INVOKER | WARN: mutable search_path |

### 5.3 Live row counts (runtime data snapshot)

| Table | Rows | Implication for testing |
|-------|------|-------------------------|
| `erp_ai_field_suggestions` | 0 | Field suggestion UAT needs seed run |
| `erp_ai_duplicate_candidates` | 0 | Duplicate UAT needs scan |
| `erp_ai_compliance_findings` | 10 | Compliance UI testable |
| `erp_ai_risk_scores` | 0 | Risk UAT needs calculation run |
| `erp_ai_recent_searches` | 16 | Search history exists |
| `erp_ai_assistant_sessions` | 0 | Assistant UAT needs session start |
| `erp_ai_audit_explanations` | 0 | Explainer cache empty |
| `erp_ai_data_quality_findings` | 0 | DQ scan not yet run in prod |
| `erp_ai_usage_logs` | 22 | Provider calls have occurred |
| `dms_ai_extraction_jobs` | 79 | DMS AI actively used |
| `dms_ai_extraction_results` | 33 | Results available for review |
| `dms_ai_tag_suggestions` | 4 | Tag flow partially exercised |
| `dms_ai_link_suggestions` | 0 | Link suggestions untested in prod |

### 5.4 Migration file vs live DB (AI.15 finding — documentation only)

**Finding:** `supabase/migrations/20260617200000_erp_common_ai_15_data_quality_monitor.sql` originally referenced `user_roles.user_id` and `role_permissions.role_code`. Live DB uses `user_roles.user_profile_id` and `role_permissions.role_id`. Live policies were applied with correct column names. **Re-run of raw migration file on fresh DB would fail** unless file matches live-applied version (file was updated post-implementation).

---

## 6. Feature Flag Audit (Live DB)

### 6.1 Critical drift: seeds vs live

Implementation reports and AI.0 migration seeded most flags with `is_enabled=false`. **Live DB as of audit date shows 32 of 33 flags enabled.**

| Flag | Live `is_enabled` | Typical seed/doc expectation |
|------|-------------------|------------------------------|
| `ERP_AI_FORM_FILL` | **true** | false (AI.1G: should enable only for UAT) |
| `ERP_AI_DAILY_DASHBOARD` | **true** | false (AI.13 migration) |
| `ERP_AI_AUDIT_EXPLAINER` | **true** | false (AI.0 seed) |
| `ERP_AI_DATA_QUALITY_MONITOR` | **false** | false ✅ |
| `ERP_AI_DATA_QUALITY` | **true** | legacy flag; enables DQ scan via fallback |
| `DMS_AI_ORCHESTRATION` | **true** | false (ORCH.1 migration) |
| `ERP_AI_ACTIONS` | **true** | false (AI.7: separate from assistant) |
| All DMS 12.x flags | **true** | mixed; many seeded true in 12.1 |

**Risk:** Features may be live in production without explicit Sameer approval gate documented in closure reports.

### 6.2 Flag ↔ route mapping verification

| Route | Expected gate flag(s) | Code verified |
|-------|----------------------|---------------|
| `/admin/settings/ai` | settings.ai.view | ✅ |
| `/admin/ai/*` | ai.common.view + module perm | ✅ page-level checks |
| `/search` | AI_SEARCH / ERP_AI_ERP_SEARCH | ✅ `isAiSearchEnabled()` |
| `/assistant` | ERP_AI_ASSISTANT | ✅ `isAssistantEnabled()` |
| DMS AI tabs | DMS_* flags per action | ✅ per-action checks |

---

## 7. Permission Audit

### 7.1 `ai.*` permissions (32 codes — all present in live DB)

Grouped by module: common (4), field_suggestions (4), duplicates (2), compliance (3), risk (3), search (2), actions (2), dashboard (2), audit_explainer (3), data_quality (5), assistant (3).

### 7.2 Role mappings (from AI.0 / phase migrations)

| Role | Expected AI perm count | Verified in AI.1G |
|------|------------------------|-------------------|
| system_admin | 21+ (now 32 with new phases) | ✅ |
| group_admin | 16+ | ✅ |
| company_admin | 8+ (view-heavy) | ✅ |

### 7.3 Server action permission pattern audit

| Module | Uses `getAuthContext` + `hasPermission` | Notes |
|--------|------------------------------------------|-------|
| field-suggestions.ts | ✅ | Canonical pattern |
| duplicate-detection.ts | ✅ | |
| compliance-checker.ts | ✅ | |
| risk-scoring.ts | ✅ | |
| search.ts | ✅ | |
| assistant.ts | ✅ | |
| dashboard.ts | ✅ | |
| audit-explainer.ts | ✅ | |
| **data-quality.ts** | **Partial** | Custom `checkPermission()` via admin client — **differs from standard RBAC helper** |

**Finding (AI.15):** `data-quality.ts` does not use `getAuthContext`/`hasPermission` from `@/lib/rbac/check`. It uses a bespoke admin-client permission join. Functionally may work for admins; **negative testing recommended** for edge roles.

---

## 8. Provider & API Audit

### 8.1 Active provider configuration (live)

| Config | Type | Model | Enabled | Last test |
|--------|------|-------|---------|-----------|
| DEFAULT_CHAT | openai | gpt-4.1 | ✅ | success |
| DEFAULT_DMS_CLASSIFIER | openai | gpt-4.1 | ✅ | success |
| DEFAULT_DMS_EXTRACTOR | openai | gpt-4.1 | ✅ | success |
| DEFAULT_EMBEDDING | openai | text-embedding-3-small | ✅ | success |
| DEFAULT_DMS_OCR | tesseract | — | ❌ | — |
| LOCAL_LLM_DEFAULT | local_ollama | — | ❌ | failed |
| ARABIC_OCR_AZURE | — | — | **Not configured** | Code supports; no DB row |

**Conclusion:** All generative AI calls route to **OpenAI GPT-4.1** and **text-embedding-3-small** via env `OPENAI_API_KEY`. Azure Document Intelligence adapter exists in code but is not provisioned.

### 8.2 Provider abstraction compliance

| Check | Result |
|-------|--------|
| Feature modules import OpenAI SDK directly | **PASS** — none found |
| DMS uses `getDmsAiProvider()` | ✅ |
| Common AI uses `callCommonAiStructuredCompletion()` | ✅ |
| Secrets in DB | **PASS** — `secret_ref` only |
| Usage logs store prompts | **PASS** — metadata only (22 logs) |

---

## 9. Security & Confidentiality Audit

### 9.1 Sensitive data handling (static code review)

| Pattern | Common AI lib | DMS AI actions |
|---------|---------------|----------------|
| `content_text` in list/search responses | Blocked by design | Gated in `documents.ts`, `document-content.ts` |
| `ocr_text` logged to console | **None** in AI lib/actions | OCR actions avoid logging text |
| Prompt/response in audit logs | Sanitized builders | DMS prompt-builders versioned |
| IBAN in duplicate evidence | Masked in `candidate-builder.ts` | N/A |
| Embedding vectors exposed | Not returned in search UI | RPC returns IDs + scores only |

### 9.2 UI safety buttons audit

| Module | Forbidden buttons (Fix/Auto-fix/Apply to record) | Result |
|--------|---------------------------------------------------|--------|
| AI.13 Dashboard | No action buttons | ✅ |
| AI.14 Audit Explainer | Explain only | ✅ |
| AI.15 Data Quality | Review/Dismiss/FP/Reopen only | ✅ |
| AI.3–5 Admin pages | Review/resolve — no auto-merge | ✅ (by design) |
| Field suggestions panel | Apply = explicit user action on suggestion | ✅ (intentional, gated) |

### 9.3 Supabase security advisors (AI-relevant excerpts)

| Lint | Level | AI relevance |
|------|-------|--------------|
| `search_dms_documents_by_embedding` mutable search_path | WARN | DMS 12.5 semantic search |
| `current_user_can_view/manage_ai_entity` mutable search_path | WARN | Common AI RLS helpers |
| `extension vector` in public | WARN | pgvector for embeddings |
| `extension pg_trgm` in public | WARN | Arabic/FTS search |
| RLS disabled: `dms_party_document_migration_map` | ERROR | Migration map — not AI core |
| Multiple `SECURITY DEFINER` RPCs callable by anon | WARN | Platform-wide; affects permission checks used by AI RLS |

---

## 10. Frontend / Route Audit

### 10.1 Routes confirmed in production build

```
/admin/settings/ai
/admin/ai/dashboard
/admin/ai/audit-explainer
/admin/ai/data-quality
/admin/ai/duplicates
/admin/ai/compliance
/admin/ai/risk
/admin/dms/intelligence
/assistant
/search
/dms/intake/[sessionCode]
/dms/inbox (+ batches)
/dms/documents/record/[id]  (AI tabs embedded)
```

### 10.2 Sidebar navigation (app-sidebar.tsx)

All AI admin links present under Administration + DMS groups: AI Settings, Daily Dashboard, Audit Explainer, Data Quality, Duplicates, Compliance, Risk, Search, Assistant, Batch Intake, AI Intelligence.

### 10.3 Pilot integration gaps (documented in reports)

| Integration point | Status |
|-------------------|--------|
| Party form — AI Review panel | ✅ Implemented (AI.1F) |
| Organization form — AI Review panel | ✅ Implemented |
| Branch form — AI Review panel | ❌ Not integrated (Stage 2 stub) |
| Work site form — AI Review panel | ❌ Not integrated (Stage 2 stub) |
| AI.2 Understanding tab on DMS | ✅ |
| Party/org duplicate/compliance/risk alerts | ✅ |

---

## 11. Backend Server Actions — Function Coverage Matrix

Legend: **I** = Implemented in code, **DB** = live data exists, **UAT** = browser test executed this audit

| Export | Module | I | DB | UAT |
|--------|--------|---|----|----|
| `generateAiFieldSuggestions` | AI.1 | ✅ | ❌ | ❌ |
| `getAiFieldSuggestions` | AI.1 | ✅ | ❌ | ❌ |
| `accept/apply/rejectAiFieldSuggestion` | AI.1 | ✅ | ❌ | ❌ |
| `getDmsDocumentUnderstanding` | AI.2 | ✅ | partial | ❌ |
| `scanForDuplicates` + 11 more | AI.3 | ✅ | ❌ | ❌ |
| `scanComplianceFindings` + 12 more | AI.4 | ✅ | ✅ | ❌ |
| `calculateRiskScores` + 10 more | AI.5 | ✅ | ❌ | ❌ |
| `searchAcrossErp` + 6 more | AI.6 | ✅ | ✅ | ❌ |
| `sendAssistantMessage` + 9 more | AI.7 | ✅ | ❌ | ❌ |
| `getAiDailyDashboard` + 2 | AI.13 | ✅ | N/A | ❌ |
| `explainAuditLogEntry` + 6 | AI.14 | ✅ | ❌ | ❌ |
| `runDataQualityScan` + 9 | AI.15 | ✅ | ❌ | ❌ |
| DMS OCR/AI/orchestration (50+ exports) | DMS | ✅ | ✅ | ❌ |

---

## 12. Findings Register (Audit Only — No Remediation Applied)

| ID | Severity | Area | Finding |
|----|----------|------|---------|
| F-01 | **HIGH** | Feature flags | 32/33 AI feature flags enabled in live DB vs documented false-by-default seeds |
| F-02 | **MEDIUM** | AI.15 | `ERP_AI_DATA_QUALITY=false` but legacy `ERP_AI_DATA_QUALITY=true` enables scan bypass |
| F-03 | **MEDIUM** | AI.15 | `data-quality.ts` uses non-standard RBAC pattern (admin client join vs `hasPermission`) |
| F-04 | **MEDIUM** | Migration | AI.15 migration file had schema mismatch (user_id vs user_profile_id) — live DB correct, file updated |
| F-05 | **MEDIUM** | Test data | Zero rows in field_suggestions, risk_scores, assistant_sessions — limits regression testing |
| F-06 | **LOW** | Provider | Azure Document Intelligence supported in code but not configured in DB |
| F-07 | **LOW** | OCR | DEFAULT_DMS_OCR (Tesseract) disabled; OCR relies on pdf-parse + GPT vision fallback |
| F-08 | **LOW** | LOCAL_LLM | Ollama provider test failed; correctly disabled |
| F-09 | **LOW** | Coverage | Branch/site AI registry stubs exist but no UI integration |
| F-10 | **LOW** | Prompts | `ChatGPT/` folder empty — phase prompts not in repo snapshot |
| F-11 | **INFO** | Advisors | AI helper functions flagged for mutable search_path |
| F-12 | **INFO** | Deferred | AI.8–AI.12 correctly not implemented |

---

## 13. Deferred Modules Verification

Confirmed **no implementation** of:

- HR AI (AI.8)
- Fleet AI (AI.9)
- Workshop AI (AI.10)
- Procurement/Inventory AI (AI.11)
- Transport/Weighbridge AI (AI.12)

Grep across `src/lib/ai` found **zero** references to HR/Fleet/Workshop/Procurement/Inventory/Weighbridge operational tables.

---

## 14. Recommended UAT Execution Order

For Sameer/Dina manual testing, recommended sequence:

1. **SETTINGS.1** — confirm provider + flag baseline  
2. **DMS pipeline** — upload → intake → OCR → analysis → summary → intelligence (validates provider)  
3. **AI.3 → AI.5** — scan duplicates, compliance, risk on real party/org data  
4. **AI.1** — field suggestions on one party with linked DMS docs  
5. **AI.6** — search modes + recent history  
6. **AI.7** — assistant sessions + blocked dangerous intents  
7. **AI.13 → AI.15** — dashboards and read-only monitors  
8. **AI.14** — audit explainer on real audit_logs  
9. **RLS negative tests** — second user role throughout  

Estimated manual effort: **3–5 days** for full matrix with two test roles.

---

## 15. Conclusion

ALGT ERP's AI foundation is **architecturally complete** for the approved existing ERP scope (COMMON AI.0–7, 13–15 + full DMS AI stack). Code quality, provider abstraction, RLS enforcement, and confidentiality patterns **align with documented standards**. Build and TypeScript verification **pass**.

The largest audit gaps are **operational**, not structural:

1. Feature flags appear **over-enabled** relative to phase closure documentation.  
2. Several AI tables have **no production data**, limiting evidence-based runtime testing.  
3. **Full browser UAT** was not executed in this automated audit session.  
4. **AI.15** permission path differs from the established RBAC pattern and should be validated with role matrix testing.

This document serves as both the **audit report** and the **master test plan** for completing full manual UAT.

---

## Appendix A — File Count Summary

| Location | Files (approx.) |
|----------|-----------------|
| `src/lib/ai/` | 87 |
| `src/features/ai/` | 64 |
| `src/server/actions/ai/common/` | 9 modules |
| `src/server/actions/dms/` (AI-related) | 18 |
| `src/lib/dms/ai/` | 6 |
| `src/lib/dms/ocr/` | 5 |
| `src/lib/dms/orchestration/` | 2 |
| AI migrations | 15 |
| Implementation reports (AI phases) | 22+ |

## Appendix B — SQL Migrations (AI filename match)

1. `20260614191500_erp_settings_1_ai_settings_provider_configuration.sql`  
2. `20260615020000_erp_dms_10_ai_classification_extraction_foundation.sql`  
3. `20260615040000_erp_dms_11_ai_first_intake.sql`  
4. `20260615050000_erp_dms_ai_issue_date_suggestion.sql`  
5. `20260616180000_erp_common_ai_0_governance_feature_flags_permissions.sql`  
6. `20260616190000_erp_common_ai_1b_field_suggestions_tables.sql`  
7. `20260617090000_erp_dms_ai_orch_1_orchestration_columns.sql`  
8. `20260617120000_erp_common_ai_3_duplicate_candidates.sql`  
9. `20260617140000_erp_common_ai_4_compliance_findings.sql`  
10. `20260617150000_erp_common_ai_5_risk_scores.sql`  
11. `20260617160000_erp_common_ai_6_search.sql`  
12. `20260617170000_erp_common_ai_7_assistant.sql`  
13. `20260617180000_erp_common_ai_13_daily_dashboard.sql`  
14. `20260617190000_erp_common_ai_14_audit_explainer.sql`  
15. `20260617200000_erp_common_ai_15_data_quality_monitor.sql`  

## Appendix C — Related DMS migrations (no "ai" in filename)

- `20260615010000` DMS.9 OCR  
- `20260615060000` DMS.12.1 content text  
- `20260615070000` DMS.12.3 indexes  
- `20260615080000` DMS.12.4 suggestion tables  
- `20260615100000` DMS.12.5 pgvector  
- `20260615120000` DMS.13 batch intake  

---

**End of report.** No fixes were applied. All findings are documented for review and prioritized UAT execution.

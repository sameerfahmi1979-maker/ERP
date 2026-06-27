# ERP COMMON AI.0 — Governance and Architecture Baseline — Implementation Report

**Phase:** ERP COMMON AI.0  
**Date:** 2026-06-16  
**Status:** CLOSED / PASS ✅  
**Scope:** Governance-only baseline — no Common AI engine implementation  

---

## Summary

Established the governance foundation for the Universal Internal AI Engine: architecture standard, Cursor protection rule, feature flags, permissions, and role mappings. No engine code, suggestion tables, or AI Review UI were created.

---

## Files Changed

| File | Action |
|---|---|
| `docs/standards/ERP_COMMON_AI_ENGINE_STANDARD.md` | **Created** — full governance standard (16 sections) |
| `.cursor/rules/erp-common-ai-standard.mdc` | **Created** — Cursor rule for Common AI work |
| `supabase/migrations/20260616180000_erp_common_ai_0_governance_feature_flags_permissions.sql` | **Created** — seed migration |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | **Updated** — phase closure + tracker row |

**No UI or server action changes** — existing AI Settings feature flags panel auto-lists flags from DB.

---

## Migration

| Item | Value |
|---|---|
| File | `20260616180000_erp_common_ai_0_governance_feature_flags_permissions.sql` |
| Applied to live DB | ✅ Yes (via `user-supabase` MCP) |
| New tables | None |
| Engine tables created | None (`erp_ai_field_suggestions`, etc. — not created) |

---

## Feature Flags Added (10)

All seeded with `is_enabled = false` (except pre-existing flags unchanged):

| Code | requires_human_review |
|---|---|
| `ERP_AI_FORM_FILL` | true |
| `ERP_AI_DOC_UNDERSTANDING` | true |
| `ERP_AI_DUPLICATE_DETECT` | true |
| `ERP_AI_COMPLIANCE` | false |
| `ERP_AI_RISK_SCORE` | false |
| `ERP_AI_ERP_SEARCH` | false |
| `ERP_AI_ACTIONS` | true |
| `ERP_AI_DAILY_BRIEF` | false |
| `ERP_AI_AUDIT_EXPLAINER` | false |
| `ERP_AI_DATA_QUALITY` | true |

Existing DMS and SETTINGS feature flags were not modified.

---

## Permissions Added (21)

Module code: `AI`

```
ai.common.view, ai.common.generate, ai.common.apply, ai.common.admin
ai.field_suggestions.view, ai.field_suggestions.generate, ai.field_suggestions.apply, ai.field_suggestions.manage
ai.duplicates.view, ai.duplicates.review
ai.compliance.view, ai.compliance.generate
ai.risk.view, ai.risk.generate
ai.search.use
ai.actions.prepare, ai.actions.execute_after_confirm
ai.dashboard.view, ai.audit_explainer.view
ai.data_quality.view, ai.data_quality.manage
```

---

## Role Mappings (live DB verified)

| Role | ai.* permissions |
|---|---|
| `system_admin` | 21 (all) |
| `group_admin` | 16 (view + generate + apply subset per roadmap) |
| `company_admin` | 8 (view-only subset) |

---

## Standards and Rules Created

- `docs/standards/ERP_COMMON_AI_ENGINE_STANDARD.md` — architecture, OpenAI usage, registry design, feature flags, permissions, RLS, audit, sensitive data, non-updatable fields, DMS evidence, Phase 1 sub-phases, deferred capabilities
- `.cursor/rules/erp-common-ai-standard.mdc` — locked decisions, provider rules, logging, forbidden patterns, phase 1 rules

---

## OpenAI Provider Confirmation (documented, not implemented)

Existing infrastructure remains the source:

- `erp_ai_provider_configs` + `erp_ai_usage_logs`
- `src/lib/ai/providers/factory.ts`
- `src/lib/dms/ai/factory.ts` + `openai-dms-adapter.ts`
- Live models: `gpt-4.1` (chat/DMS), `text-embedding-3-small` (embeddings)

Future Common AI must use shared provider layer — no direct OpenAI SDK in feature modules.

---

## Tests / Checks Performed

| Check | Result |
|---|---|
| `npm run typecheck` | PASS (0 errors) |
| `npm run build` | PASS |
| Live DB: 10 ERP_AI_* flags | PASS — all disabled |
| Live DB: 21 ai.* permissions | PASS |
| Live DB: role mappings | PASS |

---

## RLS / Security Confirmation

- No new tables — no new RLS policies required
- No Common AI server actions created
- No OpenAI calls for Common AI
- No sensitive data logging added
- Existing `erp_ai_feature_flags` RLS unchanged

---

## Explicit Confirmations (Phase 0 scope)

| Item | Status |
|---|---|
| Common AI engine code | ❌ Not implemented |
| `erp_ai_field_suggestions` table | ❌ Not created |
| `erp_ai_field_suggestion_events` table | ❌ Not created |
| `erp_ai_record_ai_status` table | ❌ Not created |
| `AiFieldSuggestionsPanel` UI | ❌ Not created |
| AI Review & Update tab on forms | ❌ Not added |
| MCP server | ❌ Not created |
| Public AI API routes | ❌ Not created |

---

## Risks / Open Questions

1. **Flag enablement** — All Common AI flags remain disabled until Sameer enables for UAT.
2. **Pre-existing `ERP_AI_ASSISTANT` flag** — Was already enabled in live DB from SETTINGS.1 seed; left unchanged (not a Common AI.0 flag).
3. **Phase 1 scope** — Must follow sub-phases 1A–1G; Stage 1 pilot = Organization + Party only.

---

## Recommended Next Phase

**ERP COMMON AI.1A — Registry, Types, Prompt Contract, Output Schema**

Code-only phase: define registry types, Zod output schemas, prompt contract constants under `src/lib/ai/common/` — no DB tables, no UI, no OpenAI calls.

---

## Related Documents

- Roadmap: `implementation_Review/AI_Phases/Phase_AI_Roadmap_Planning/ERP_AI_ROADMAP_AND_COMMON_AI_FOUNDATION_PLAN.md`
- Phase prompt: `ChatGPT/CURSOR_PROMPT_ERP_COMMON_AI_0_GOVERNANCE_AND_ARCHITECTURE_BASELINE.md`
- AI Settings rule: `.cursor/rules/erp-ai-settings-standard.mdc`

---

**End of Report**

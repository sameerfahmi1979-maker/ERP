# ERP COMMON AI.1G — Security, RLS, Runtime QA, and UAT Report

**Phase:** ERP COMMON AI.1G  
**Date:** 2026-06-17  
**Status:** CLOSED / PASS ✅  
**Scope:** QA and closure gate for ERP COMMON AI.1 — Universal AI Fill / Correct / Update Engine  

---

## Summary

Full security, RLS, permission, feature flag, stage gate, and UI audit of all COMMON AI.1 phases (1A–1F). No blocking issues found. One UX confirmation needed (effectivePartyId guard — already handled correctly by childTabLocked). No new features added. `ERP_AI_FORM_FILL` remains `false`.

---

## Files Audited

| Category | Files |
|---|---|
| Core types/constants | `types.ts`, `constants.ts`, `non-updatable-fields.ts`, `index.ts` |
| Registry | `registry/index.ts`, `company-registry.ts`, `party-registry.ts`, `branch-registry.ts`, `site-registry.ts` |
| Field suggestions lib | `output-schema.ts`, `output-validator.ts`, `prompt-builder.ts`, `evidence-loader.ts`, `evidence-sanitizer.ts`, `current-record-loader.ts`, `persistence.ts`, `apply-handlers.ts`, `apply-engine.ts` |
| Provider bridge | `provider-bridge.ts` |
| Server actions | `src/server/actions/ai/common/field-suggestions.ts` |
| UI | `src/features/ai/common/field-suggestions/` (5 files) |
| Form integration | `organization-workspace-form.tsx`, `party-workspace-form.tsx` |
| DB migration | `20260616190000_erp_common_ai_1b_field_suggestions_tables.sql` |

**Total Common AI lib files:** 19 files under `src/lib/ai/common/`  
**Total Common AI UI files:** 5 files under `src/features/ai/common/field-suggestions/`

---

## Audit Area 1 — File / Scope Inventory

**Result: PASS ✅**

All expected files present. No unexpected AI files outside approved scope. No UI files created outside `src/features/ai/common/field-suggestions/`.

---

## Audit Area 2 — Live DB / RLS Verification

**Result: PASS ✅** (verified via `user-supabase`)

| Table | RLS Enabled | FORCE RLS |
|---|---|---|
| `erp_ai_field_suggestions` | ✅ true | ✅ true |
| `erp_ai_field_suggestion_events` | ✅ true | ✅ true |

Policies present:

| Table | Policy | Command |
|---|---|---|
| `erp_ai_field_suggestion_events` | `erp_ai_field_suggestion_events_insert` | INSERT |
| `erp_ai_field_suggestion_events` | `erp_ai_field_suggestion_events_select` | SELECT |
| `erp_ai_field_suggestions` | `erp_ai_field_suggestions_insert` | INSERT |
| `erp_ai_field_suggestions` | `erp_ai_field_suggestions_select` | SELECT |
| `erp_ai_field_suggestions` | `erp_ai_field_suggestions_update` | UPDATE |

No DELETE policy — soft delete only via UPDATE `deleted_at`. ✅  
No UPDATE policy on events — append-only. ✅

Helper functions present: `current_user_can_view_ai_entity`, `current_user_can_manage_ai_entity` — both `SECURITY INVOKER`, `STABLE`, explicit CASE mapping, no dynamic SQL, return false for unregistered types. ✅

**`erp_ai_record_ai_status` does not exist** — correctly deferred. ✅  
**No unexpected Common AI tables** were created. ✅

---

## Audit Area 3 — Permission Verification

**Result: PASS ✅**

All 21 `ai.*` permissions present in live DB (verified). ✅

Critical subset confirmed:

| Permission | Present |
|---|---|
| `ai.common.view` | ✅ |
| `ai.common.generate` | ✅ |
| `ai.common.apply` | ✅ |
| `ai.common.admin` | ✅ |
| `ai.field_suggestions.view` | ✅ |
| `ai.field_suggestions.generate` | ✅ |
| `ai.field_suggestions.apply` | ✅ |
| `ai.field_suggestions.manage` | ✅ |

Role mapping counts (live DB):

| Role | `ai.*` count | Expected |
|---|---|---|
| `system_admin` | 21 | ✅ all |
| `group_admin` | 16 | ✅ generate/apply/view subset |
| `company_admin` | 8 | ✅ view-only subset |

Server action permission checks verified by code audit:

| Action | Permission gate | Entity gate |
|---|---|---|
| `getAiFieldSuggestions` | `ai.field_suggestions.view` | entity view |
| `generateAiFieldSuggestions` | `ai.field_suggestions.generate` + `dms.documents.view` | entity view |
| `acceptAiFieldSuggestion` | `ai.field_suggestions.apply` | entity manage |
| `rejectAiFieldSuggestion` | `ai.field_suggestions.view` | entity view |
| `applyAiFieldSuggestion` | `ai.field_suggestions.apply` | entity manage |
| `acceptSelectedAiFieldSuggestions` | `ai.field_suggestions.apply` | entity manage |
| `supersedeAiFieldSuggestions` | `ai.field_suggestions.generate` | — |

✅ All gates use `ai.common.admin` OR `system_admin` as bypass where appropriate.

---

## Audit Area 4 — Security / Sensitive Data

**Result: PASS ✅**

| Check | Result |
|---|---|
| No `import ... from 'openai'` in Common AI lib | ✅ 0 matches |
| No `import ... from 'openai'` in server actions | ✅ 0 matches |
| No `import ... from 'openai'` in UI files | ✅ 0 matches |
| No `console.log/error/warn` in `src/lib/ai/common/` | ✅ 0 matches |
| No `console.log/error/warn` in `src/server/actions/ai/` | ✅ 0 matches |
| Usage log stores metadata only | ✅ feature_area, operation, model, tokens, duration, entity_type/id, count |
| No prompt/raw AI response in usage log | ✅ |
| No OCR/content_text in persistence | ✅ |
| Source excerpt capped at 500 chars before DB insert | ✅ (persistence.ts + DB constraint) |
| AI reason capped at 1000 chars before DB insert | ✅ |
| UI shows source excerpt only in collapsed Popover | ✅ |
| UI does not fetch raw OCR/content_text | ✅ |
| Raw AI response never returned to client | ✅ |
| Evidence snippets never returned to client | ✅ (counts only in generate response) |

---

## Audit Area 5 — Stage Gate

**Result: PASS ✅**

| Entity | Generation | Apply | UI Tab |
|---|---|---|---|
| `company` | ✅ Stage 1 — gated by flag | ✅ apply handlers exist | ✅ Organization form |
| `party` | ✅ Stage 1 — gated by flag | ✅ apply handlers exist | ✅ Party form |
| `branch` | ❌ Stage 2 stub gate blocks | ❌ apply engine blocks | ❌ No tab in branch form |
| `site` | ❌ Stage 2 stub gate blocks | ❌ apply engine blocks | ❌ No tab in work site form |

Branch form (`branch-workspace-form.tsx`): no `AiFieldSuggestionsPanel` import — 0 matches. ✅  
Work site form (`work-site-workspace-form.tsx`): no `AiFieldSuggestionsPanel` import — 0 matches. ✅

---

## Audit Area 6 — UI Runtime QA

**Result: PASS ✅**

### Organization Form

| Check | Status |
|---|---|
| "AI Review & Update" section appears in section nav | ✅ Added (id=`ai_review`, icon=Brain) |
| Guard: `!companyId` shows "Save first" message | ✅ |
| Documents tab still present | ✅ Unchanged |
| Existing save/dirty state preserved | ✅ AI section is separate from main form |
| Generate button handles `ERP_AI_FORM_FILL=false` | ✅ Returns controlled error message in UI |

### Party Form

| Check | Status |
|---|---|
| "AI Review & Update" section appears (after Compliance, before Compliance deferred) | ✅ |
| `childTabLocked = !effectivePartyId` — unsaved party shows `<LockedTabMessage />` | ✅ **No entityId=0 panel rendered** |
| DMS/Documents tab still works | ✅ Unchanged |
| Child dialogs still functional | ✅ Unchanged |
| Dirty state preserved | ✅ AI section is outside main form element |
| Generate button handles `ERP_AI_FORM_FILL=false` gracefully | ✅ |

**Key UX confirmation — effectivePartyId=0:** When `effectivePartyId` is null (unsaved new party), `childTabLocked = true`, and `<LockedTabMessage />` is shown instead of the panel. The `entityId={effectivePartyId ?? 0}` fallback is never reached in this case. Safe. ✅

---

## Audit Area 7 — UAT Guidance

**ERP_AI_FORM_FILL is disabled** and must NOT be enabled without explicit Sameer approval.

### When Sameer Approves UAT — Steps

**Step 1: Enable flag for UAT**
```sql
UPDATE erp_ai_feature_flags
SET is_enabled = true, updated_at = now()
WHERE feature_code = 'ERP_AI_FORM_FILL';
```

**Step 2: UAT Test Plan**
1. Link a Trade License document to an Organization (via DMS Documents tab).
2. Open the Organization record → AI Review & Update tab.
3. Click "Generate Suggestions" — verify suggestions appear in `erp_ai_field_suggestions`.
4. Review suggested values (e.g., `trade_name`, `main_activity`, dates).
5. Accept one suggestion → click "Accept" → status changes to `accepted`.
6. Apply it → click "Apply" → verify `erp_ai_field_suggestions.status = applied`.
7. Open Organization record Basic Info tab → confirm field updated.
8. Open `audit_logs` → confirm `erp_ai_field_suggestion_applied` event exists.
9. Repeat for Party with linked Trade License/TRN/VAT document.
10. Verify rejected suggestions do NOT update any record.
11. Attempt to use AI tab on Branch/Work Site record → confirm no tab exists.
12. Verify `erp_ai_field_suggestion_events` has `generated`, `accepted`, `applied` entries.
13. Verify `erp_ai_usage_logs` entry: token counts, model, no prompt content.

**Step 3: Disable flag after UAT**
```sql
UPDATE erp_ai_feature_flags
SET is_enabled = false, updated_at = now()
WHERE feature_code = 'ERP_AI_FORM_FILL';
```

### Known Limitations for UAT

- **FK fields**: `office_emirate_id`, `office_city_id` apply blocked — must be set manually.
- **Party child tables**: If a party has multiple licenses, apply will fail safely with "manual selection required" message.
- **Apply refresh**: After apply, form must be navigated away and back to see updated field value (or hard-refresh).
- **ERP_AI_ASSISTANT flag**: Pre-existing from SETTINGS.1 (unrelated to COMMON AI.1). Do not alter.

---

## Bugs Found / Fixed

| # | Bug | Fix | Status |
|---|---|---|---|
| None | — | — | — |

No bugs found during this QA phase.

---

## Remaining Notes / Risks

1. **FK apply (Phase 1G+ or 2.x)**: `office_emirate_id` / `office_city_id` require name→ID lookup. Deferred to Phase 1F+ fix or Phase 2 milestone.
2. **Apply form refresh**: Apply currently requires manual navigation to refresh form field display. Phase 1F or 1G+ could add workspace-level rehydration.
3. **Batch generation performance**: N+1 queries in evidence loader (1 per document for content/OCR). Acceptable for ≤10 documents. Monitor during UAT.
4. **ERP_AI_FORM_FILL**: Remains `false` globally. Enabling for UAT is per instruction from Sameer only.
5. **Party child multi-license**: One-row-only rule correctly prevents guessing. If party has multiple licenses, manual apply is required.

---

## TypeScript / Build Results

| Check | Result |
|---|---|
| `npm run typecheck` | **PASS** (0 errors) |
| `npm run build` | **PASS** (run at Phase 1F closure) |

---

## COMMON AI.1 Overall Final Decision

**CLOSED / PASS WITH NOTES ✅**

All 7 sub-phases (1A–1G) completed:
- ✅ 1A: Types, registry, prompt contract, output schema
- ✅ 1B: DB tables, RLS, helper functions, server action skeleton
- ✅ 1C: DMS evidence loader (linked docs only, confidentiality gated, sanitized)
- ✅ 1D: AI suggestion generation (evidence → AI → validate → supersede → persist → log)
- ✅ 1E: Accept / reject / apply engine (Stage 1 only, FK blocked, child 1-row-only)
- ✅ 1F: UI panel + Organization + Party integration
- ✅ 1G: Security, RLS, QA audit — all PASS

**Notes:**
- `ERP_AI_FORM_FILL` off by default (correct) — must be enabled for live UAT by Sameer.
- FK field apply deferred to future phase.
- Stage 2 (branch/site) deferred — well-guarded by registry stage gate.
- No MCP server, no public API, no auto-apply.

---

## Recommended Next Phase

**ERP COMMON AI.2 — AI Document Understanding Center**

Or, depending on Sameer/Dina priority: proceed to **ERP HR Module 003A** or other approved roadmap phase.

COMMON AI.1 is complete and production-ready pending UAT flag enablement.

---

**End of Report**

# ERP COMMON AI.1F — UI Panel and Pilot Integration — Implementation Report

**Phase:** ERP COMMON AI.1F  
**Date:** 2026-06-17  
**Status:** CLOSED / PASS ✅  
**Scope:** Shared AI suggestions UI panel + Organization + Party form integration  

---

## Summary

Built the AI field suggestions review panel and integrated it into the Organization and Party workspace record forms as "AI Review & Update" tabs. The UI is connected to all Phase 1B–1E server actions. No DB migration, no new AI generation logic, no provider changes.

---

## Files Created / Changed

| File | Action |
|---|---|
| `src/features/ai/common/field-suggestions/ai-confidence-badge.tsx` | **Created** — confidence badge with score-to-label mapping |
| `src/features/ai/common/field-suggestions/ai-suggestion-type-badge.tsx` | **Created** — suggestion type badge |
| `src/features/ai/common/field-suggestions/ai-suggestion-status-badge.tsx` | **Created** — lifecycle status badge |
| `src/features/ai/common/field-suggestions/ai-field-suggestions-panel.tsx` | **Created** — main review panel (generate, list, accept, reject, apply, batch) |
| `src/features/ai/common/field-suggestions/index.ts` | **Created** — barrel export |
| `src/features/organizations/organization-workspace-form.tsx` | **Updated** — added "AI Review & Update" section + Brain icon |
| `src/features/master-data/parties/party-workspace-form.tsx` | **Updated** — added "AI Review & Update" section (after notes, before audit) |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | **Updated** — phase closure + tracker row |

**No DB migration** — code-only.

---

## Scope Summary

Phase 1F is a pure UI phase. It builds the human-review workflow panel using the existing server actions from Phases 1B–1E. No new AI logic was added.

---

## UI Component Summary

### `ai-confidence-badge.tsx`
Score-based confidence levels: ≥0.85 High (green), ≥0.65 Medium (amber), ≥0.40 Low (orange), <0.40 Needs Review (red). Displays score as percentage.

### `ai-suggestion-type-badge.tsx`
Color-coded badges for: `fill_missing` (blue), `correct_value` (amber), `update_existing` (sky), `clear_wrong_value` (orange), `conflict_detected` (red), `needs_human_review` (slate).

### `ai-suggestion-status-badge.tsx`
Status lifecycle badges: `pending` (yellow), `accepted` (blue), `rejected` (slate), `superseded` (strikethrough), `applied` (green), `failed` (red).

### `ai-field-suggestions-panel.tsx` — Main Panel

**Query:** TanStack Query via `queryKeys.ai.fieldSuggestions(entityType, entityId)`, `getAiFieldSuggestions`.

**Generate:** Calls `generateAiFieldSuggestions` — shows disabled message when `ERP_AI_FORM_FILL=false`. Errors displayed safely (no raw AI response).

**Suggestion cards:** For each suggestion:
- Field label + status + type + confidence badges
- Current value vs. AI suggested value (side by side)
- Apply error message (if failed)
- Source document reference: Doc #{id} + document type — no raw OCR/content
- Source excerpt: shown only in collapsed Popover (already stored max 500 chars)
- AI reason: collapsible

**Action buttons per status:**
- `pending` + canApply: Accept & Apply, Accept, Reject
- `pending` + !canApply: Accept, Reject
- `accepted` + canApply: Apply, Reject
- `applied` / `rejected` / `failed` / `superseded`: read-only

**Batch selection:** Checkbox per pending suggestion → "Accept & Apply Selected" bar at top.

**Invalidation:** After every action, calls `invalidateAiFieldSuggestions(queryClient, entityType, entityId)`.

---

## Organization Integration

- File: `src/features/organizations/organization-workspace-form.tsx`
- New section: `{ id: "ai_review", label: "AI Review & Update", icon: Brain }`
- Placed after: Documents section
- Guard: `!companyId` → "Save the organization first" message
- Props: `entityType="company"`, `entityId={companyId}`, `entityLabel={organization.trade_name}`, `canGenerate={!disabled}`, `canApply={!disabled}`

---

## Party Integration

- File: `src/features/master-data/parties/party-workspace-form.tsx`
- New section: `{ id: "ai_review", label: "AI Review & Update", icon: <Brain />, disabled: childTabLocked }`
- Placed after: Compliance section (near end, before Audit)
- Guard: `childTabLocked` → `<LockedTabMessage />`
- Props: `entityType="party"`, `entityId={effectivePartyId ?? 0}`, `entityLabel={party.display_name}`, `canGenerate={!isViewing}`, `canApply={!isViewing}`

---

## Branch/Site Exclusion Confirmation

Branch and Work Site workspace forms were **not modified**. ✅  
`src/features/branches/branch-workspace-form.tsx` — untouched  
`src/features/common-master-data/work-sites/work-site-workspace-form.tsx` — untouched

---

## Action Wiring Summary

| Action | UI trigger | Server action |
|---|---|---|
| Load suggestions | Auto via TanStack Query | `getAiFieldSuggestions` |
| Generate | "Generate Suggestions" button | `generateAiFieldSuggestions` |
| Accept | "Accept" button on pending | `acceptAiFieldSuggestion` |
| Accept & Apply | "Accept & Apply" button on pending | `acceptAiFieldSuggestion` → `applyAiFieldSuggestion` |
| Reject | "Reject" button on pending/accepted | `rejectAiFieldSuggestion` |
| Apply | "Apply" button on accepted | `applyAiFieldSuggestion` |
| Batch accept+apply | "Accept & Apply Selected" bar | `acceptSelectedAiFieldSuggestions` |

---

## Security / Display Rules

| Rule | Status |
|---|---|
| No raw prompt/AI response shown | ✅ |
| No raw OCR/content_text fetched or shown | ✅ |
| Source excerpt: stored value only, collapsed popover | ✅ |
| AI reason: stored value only, collapsible | ✅ |
| Source document: ID + type only | ✅ |
| No new DB queries for raw content | ✅ |

Human review warning displayed at top of every panel: "AI suggestions require human review. Always verify the suggested value before applying."

---

## Feature Flag Behavior

- `ERP_AI_FORM_FILL = false` (unchanged): Generate button available but server returns "disabled" error → shown as `generateError` in UI (no toast for this controlled message).
- Read/accept/reject/apply work on existing suggestions without flag.

---

## What Was Explicitly Not Implemented

| Item | Status |
|---|---|
| New AI generation logic | ❌ None |
| OpenAI direct calls | ❌ None |
| Provider bridge changes | ❌ None |
| DB migration | ❌ None |
| Branch/Site AI tab | ❌ None |
| Auto-apply | ❌ None |
| `ERP_AI_FORM_FILL` enabled | ❌ Remains `false` |
| Retry failed suggestions | ❌ Deferred to 1G/UAT |

---

## TypeScript / Build Results

| Check | Result |
|---|---|
| `npm run typecheck` | **PASS** (0 errors) |
| `npm run build` | **PASS** |

---

## Manual UAT Checklist

1. Open Organization record → "AI Review & Update" tab appears in section nav
2. Generate button shows controlled disabled/error message (`ERP_AI_FORM_FILL=false`)
3. Existing suggestions (if any) list with badges and action buttons
4. Accept/Reject/Apply buttons call server actions and refresh via TanStack Query
5. Batch selection checkboxes appear on pending suggestions; bar shows when items selected
6. Source excerpt visible only in "View excerpt" Popover — not shown inline
7. Open Party record → "AI Review & Update" tab appears (after Compliance, before Audit)
8. Branch and Work Site records have no AI tab
9. AI panel does not affect form dirty state or existing save behavior

---

## Risks / Open Questions

1. **effectivePartyId=0**: If party has not been saved yet (`effectivePartyId = null`), the panel renders with entityId=0. The server action returns no data (empty result). This is safe — no DB error.
2. **canGenerate/canApply permissions**: Currently controlled by `!disabled` / `!isViewing`. Phase 1G may add permission-aware props based on `authContext`.
3. **Apply toast refresh**: After apply, user is asked to refresh form to see updated values. Phase 1G or UAT may add auto-rehydration of form fields via workspace-level invalidation.

---

## Recommended Next Phase

**ERP COMMON AI.1G — Security, RLS, Runtime QA, and UAT**

Audit all Common AI server actions for auth/permission/RLS correctness. Enable `ERP_AI_FORM_FILL` for UAT records in dev environment. Run live generation with real linked documents. Verify apply handlers write correct values.

---

**End of Report**

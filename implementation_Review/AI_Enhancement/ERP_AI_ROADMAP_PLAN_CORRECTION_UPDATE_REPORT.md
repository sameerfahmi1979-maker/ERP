# ERP AI Roadmap Plan — Correction Update Report

**Date:** 2026-06-16  
**Type:** Plan-only correction pass  
**Trigger:** `ChatGPT/CURSOR_PROMPT_UPDATE_ERP_AI_ROADMAP_PLAN_CORRECTIONS_ONLY.md`

---

## Files Updated

| File | Action |
|---|---|
| `implementation_Review/ERP_AI_ROADMAP_AND_COMMON_AI_FOUNDATION_PLAN.md` | Updated in place with ChatGPT review corrections |
| `implementation_Review/ERP_AI_ROADMAP_PLAN_CORRECTION_UPDATE_REPORT.md` | Created (this report) |

---

## Summary of Changes

### Status and governance
- Updated plan status to **PLAN REVIEWED — APPROVED WITH MINOR CORRECTIONS PENDING FINAL APPROVAL**
- Added explicit note that no code, migrations, DB, UI, or implementation has been performed

### New section
- Added **ChatGPT Review Corrections to Apply Before Implementation** near the top (7 locked correction items)

### Phase 0 (smaller and safer)
- Reframed as **governance-only baseline**
- Removed heavy AI Settings UI requirements (overview card, Common AI section)
- Allowed only minimal flag visibility update if existing framework requires it
- Added explicit "must not include" list (no engine code, no suggestion tables, no UI panel)
- Added SOT update + implementation report as Phase 0 deliverables

### Phase 1 (split into sub-phases)
- Replaced single-block Phase 1 with **COMMON AI.1A through 1G**, each with:
  - Purpose, scope, expected files, must-not-do rules, acceptance criteria
- Added prominent rule: **Do not build the full Phase 1 in one Cursor run**

### RLS / permissions
- Replaced generic dynamic entity resolver guidance with **explicit pilot mapping only** (`company`, `branch`, `site`, `party`)
- Documented helper function names and v1 constraints (no dynamic SQL, no unregistered types)

### Sensitive data policy
- Added storage policy for `erp_ai_field_suggestions` (allowed vs not allowed columns)
- Rule that `current_value`, `suggested_value`, `source_excerpt`, `ai_reason` store minimal sanitized text only

### Non-updatable field rules
- Added comprehensive list of fields AI must never update
- Required explicit registry entries with safety classification

### Pilot rollout
- Staged runtime testing: **Stage 1 = Organization + Party**, **Stage 2 = Branch + Work Site** (after Stage 1 PASS)

### Implementation prompt roadmap
- Added **"Do not start implementation yet"** warning
- Replaced old Phase 1 prompt names with corrected **1A–1G** sequence

### Acceptance criteria and handoff
- Extended plan acceptance criteria (items 17–22)
- Updated handoff summary with staged pilot and Phase 0 gate

### Plan correction log
- Appended update log section at end of roadmap file

---

## Confirmation

**No code, migrations, database changes, UI components, or COMMON AI implementation was performed.**

This was a documentation-only correction pass on the existing roadmap plan file.

---

## Unresolved Questions / Risks

| Item | Notes |
|---|---|
| Phase 0 flag UI | Confirm whether `/admin/settings/ai` auto-lists new `erp_ai_feature_flags` rows or needs a minimal code touch |
| Organization vs common_md permissions | Map exact view/manage permission codes for `company` and `branch` during Phase 1B (both legacy and COMMON MD codes may apply) |
| Sensitive field redaction | Define exact masking rules for TRN, Emirates ID, passport in suggestion table columns during Phase 1D |
| RLS on owner_companies/branches/parties | Parent tables are RLS enabled but not forced — new AI tables should still use RLS FORCED; entity row access relies on server action permission checks |
| Stage 1 UAT data | Need real linked trade license / TRN / VAT documents on test Organization and Party records for meaningful UAT |

---

## Recommended Next Step

**ChatGPT/Sameer final review**, then generate the dedicated Cursor prompt:

```
ChatGPT/CURSOR_PROMPT_ERP_COMMON_AI_0_GOVERNANCE_AND_ARCHITECTURE_BASELINE.md
```

Do not start COMMON AI.1A or any implementation until Phase 0 prompt is explicitly approved.

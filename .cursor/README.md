# ALGT ERP — Cursor Project Rules

This folder contains project-level source-of-truth documentation for the Alliance Gulf Transport ERP.

## Files

| File | Purpose |
|---|---|
| **`ALGT_ERP_SOURCE_OF_TRUTH.md`** | Single merged guide — modules, phases, standards, debt, file paths. **Read before every phase.** |
| **`rules/algt-erp-source-of-truth.mdc`** | Always-on Cursor rule (`alwaysApply: true`) pointing agents to the guide |

## Protocol

**Before every ERP phase:** Read `ALGT_ERP_SOURCE_OF_TRUTH.md` → read phase prompt → read latest closure reports → verify Supabase if needed.

**After every ERP phase:** Write implementation report → **update `ALGT_ERP_SOURCE_OF_TRUTH.md`** → run typecheck/build → stop.

## Related docs (also authoritative)

- `docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md`
- `docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md`
- `docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md`
- `ERP_FULL_IMPLEMENTATION_GUIDE_FOR_NEXT_CHAT.md` (handoff companion; keep in sync when updating source of truth)

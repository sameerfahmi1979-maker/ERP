# OFFICIAL DOCS.1 — Package 8: Designer UI Retirement Report

- **Program:** Global Official Letters & Forms Generator + Report Designer Retirement
- **Package:** 8 — Designer UI retirement (Gate 8)
- **Date:** 2026-07-28
- **Environment:** Local dev + live Supabase `mmiefuieduzdiiwnqpie`

---

## 1. What Was Retired

The **Template Studio** (structured visual template editor, OUTPUT.3A/3B) was the last
user-facing design surface. The Puck visual editor was already removed in RETIRE.1.
Official documents are now exclusively fixed code-based templates under
`src/lib/official-documents/`.

## 2. Changes

| Step | Action | Detail |
|------|--------|--------|
| Navigation | **Removed** sidebar item "Template Studio" | `src/components/layout/app-sidebar.tsx` (Reports section); unused `PenLine` import removed |
| Entry point | **Removed** "Open Template Studio" row action on Templates & Branding | `src/features/report-center/report-templates-page-client.tsx`; unused `Eye` import removed |
| Feature flag | **Default flipped to `false`** | `isTemplateStudioEnabled()` in `src/lib/output/feature-flags.ts` — route page and every `template-studio` server action are gated on this flag and now refuse by default |
| DB archive | **Non-destructive archive** of 3 designer-era rows | Migration `20260728123000_official_docs_1_pkg8_archive_designer_era_templates.sql` (applied live) |

### Preserved (intentionally NOT removed in Package 8)

- Route page `src/app/(protected)/admin/reports/template-studio/page.tsx` — flag-gated; shows "Not Enabled" panel. Required for rollback.
- `src/server/actions/output/template-studio.ts` — flag-gated at entry; refuses when disabled.
- `src/lib/template-studio/*` libraries and workspace-route-registry entry — evaluated for removal in Package 9 only after proving no shared consumers.
- Template Governance queue (`/admin/reports/templates/governance`) — governance/audit surface, not a designer.
- **All** branding templates, company templates, default templates, issuance history, storage files — untouched.

## 3. Archived Rows (reversible status flip; no deletion)

| ID | template_code | Reason |
|----|--------------|--------|
| 15 | `DEFAULT_CERTIFICATE_TEMPLATE_V2_V3_V4` | Designer-era experiment ("To Whom It May Concern (v4)") |
| 20 | `sample-quotation-en` | Validation-spike sample |
| 21 | `bilingual-sample-en-ar` | Validation-spike sample |

Safety guards in the migration: rows had to be non-default, not soft-deleted, and
**not referenced** by any `erp_generated_pdf_documents` or `erp_output_public_links`
row (verified: only template id 1 is referenced by issuances). Archive is reversible
by restoring `governance_status`/`is_active`.

## 4. Gate 8 Verification

| Check | Result |
|-------|--------|
| Sidebar Reports menu no longer lists Template Studio | PASS (`official-docs-uat-evidence/pkg8-template-studio-retired-route.png` shows menu + route state) |
| Direct navigation to `/admin/reports/template-studio` | PASS — flag-gated "Template Studio — Not Enabled" panel, no editor |
| Templates & Branding page loads with no studio link | PASS — branding profiles (4) and templates (18) render normally |
| Historical viewing/reprint after retirement | PASS — fresh signed download URL issued for PPE Issue Form from Issued Documents history |
| Unit tests | PASS — 433/433 |
| Typecheck | PASS — 72 errors, identical to Package 0 baseline (0 new) |

## 5. Rollback Instructions

1. Set `OUTPUT_TEMPLATE_STUDIO_ENABLED=true` in the environment — the route and all
   studio server actions reactivate without code changes (they were preserved, only
   flag-gated).
2. Re-add the sidebar entry in `app-sidebar.tsx` (one line, see the Package 8 comment
   marker there).
3. If the archived sample templates are needed, restore them:
   `UPDATE erp_report_templates SET governance_status='draft', is_active=true, archived_at=NULL, archive_reason=NULL WHERE template_code IN ('DEFAULT_CERTIFICATE_TEMPLATE_V2_V3_V4','sample-quotation-en','bilingual-sample-en-ar');`

## 6. Gate 8 Verdict

**PASS.** No user-facing designer remains; history, reports, branding, and output
services are all intact. Package 9 (conditional code/dependency cleanup) may proceed.

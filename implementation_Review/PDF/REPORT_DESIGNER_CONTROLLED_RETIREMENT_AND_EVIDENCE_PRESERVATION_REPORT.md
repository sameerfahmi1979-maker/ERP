# Report Designer — Controlled Retirement & Evidence Preservation Report

- **Program:** OFFICIAL DOCS.1 (Packages 8–9)
- **Date:** 2026-07-28
- **Decision context:** The visual Report Designer (Puck, retired earlier in RETIRE.1) and its successor prototype (Template Studio, OUTPUT.3A/3B) were rejected for official documents. Replacement: fixed, versioned, code-based templates (`src/lib/official-documents/`) generated one-click from Employee Profile.

---

## 1. Retirement Sequence (Package 8 — UI)

| Step | Action |
|------|--------|
| 1 | Sidebar entry "Template Studio" removed (`src/components/layout/app-sidebar.tsx`) |
| 2 | "Open Template Studio" row action removed from Templates & Branding (`report-templates-page-client.tsx`) |
| 3 | Feature flag `OUTPUT_TEMPLATE_STUDIO_ENABLED` default flipped to `false` (interim, superseded by Package 9 removal) |
| 4 | 3 designer-era template rows archived **non-destructively** (migration `20260728123000…`, guarded: non-default, zero issuance/public-link references) |
| 5 | Historical reprint re-verified after retirement (fresh signed URL issued) |

Gate 8 evidence: `implementation_Review/HR/OFFICIAL_DOCS_1_PACKAGE_8_DESIGNER_UI_RETIREMENT_REPORT.md`,
screenshot `official-docs-uat-evidence/pkg8-template-studio-retired-route.png`.

## 2. Code & Dependency Removal (Package 9 — conditional, after Gate 8)

Removed with import-graph proof of non-use (full detail in
`implementation_Review/HR/OFFICIAL_DOCS_1_PACKAGE_9_CODE_DEPENDENCY_CLEANUP_REPORT.md`):

- Template Studio page client + block editor, TipTap rich-text editor,
  field-picker UI (5 files), empty `puck/` folder, studio server actions.
- 7 `@tiptap/*` npm packages (50 transitive packages).
- `isTemplateStudioEnabled` feature flag (both consumers deleted).
- `/admin/reports/template-studio` now renders a permanent "Retired" notice —
  old links and pinned workspace tabs do not 404.
- Governance "Create New Version" no longer routes to the retired studio.

## 3. Evidence & History Preserved (nothing destroyed)

| Artifact | Status |
|----------|--------|
| `spikes/report-designer-validation-spike-1*` (Spike 1 evidence, PDFs, reports) | PRESERVED |
| `spikes/official-docs-gate3/` visual baselines | PRESERVED |
| Legacy Puck evidence folder(s) | PRESERVED |
| `erp_report_templates` rows (incl. designer drafts) | PRESERVED — 3 sample rows archived (status flip only, reversible) |
| Issued PDFs (`erp_generated_pdf_documents` + `erp-generated-pdfs` storage) | PRESERVED — downloads re-verified post-retirement |
| Public verification links + QR | PRESERVED — `/verify/[token]` unaffected |
| Audit/issuance history | PRESERVED |
| Analytical reports & Excel/CSV exports (Class E) | UNAFFECTED — separate path, fetchers untouched |

## 4. Shared Components Intentionally Retained

| Module | Why retained |
|--------|--------------|
| `src/lib/template-studio/*` (schema/validate/diff/schema-to-el) | consumed by Template Governance security review and templates server actions |
| `src/lib/report-designer/*` (field-registry, binding-registry, prosemirror-renderer) | consumed by governance security review, templates actions, and lib/template-studio |
| Template Governance queue UI | production governance/audit surface |
| Templates & Branding page | branding profiles still drive official-document letterheads |

## 5. Rollback Position

The editor **UI code is deleted** (recoverable only from git history — commit
prior to Package 9). Data was never destroyed: archived template rows can be
restored with a single status-flip UPDATE (statement included in the Package 8
report). The official-documents generation path has no dependency on any
removed code.

## 6. Verdict

Retirement executed in the controlled order required by the program:
hide → verify history → archive non-destructively → prove non-use → remove.
Gates 8 and 9 both **PASS** with build/typecheck/tests green and zero
historical or analytical regression.

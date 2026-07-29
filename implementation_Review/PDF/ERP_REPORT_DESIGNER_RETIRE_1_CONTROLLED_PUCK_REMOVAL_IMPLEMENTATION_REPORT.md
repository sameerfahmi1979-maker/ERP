# ERP REPORT.DESIGNER.RETIRE.1 — Controlled Puck Removal — Implementation Report

- **Phase**: ERP GLOBAL OUTPUT FRAMEWORK — WP12 (RETIRE.1)
- **Date**: 2026-07-26
- **Status**: COMPLETE — Puck editor code and `@puckeditor/core` removed; all replacement paths verified intact

---

## 1. Prerequisites Reverified Immediately Before Removal

| Prerequisite | Evidence |
|---|---|
| WP2 evidence package complete | `implementation_Review/PDF/legacy_puck_evidence/` (inventory + studio mapping spec, checksummed) |
| OUTPUT.SPIKE.1 → OUTPUT.7 all passed | SOT entries + phase reports (WP3–WP11) |
| Full HR catalog onboarded | WP8 report |
| Ops Console + schedules UAT passed | WP10/WP11 reports |
| **Zero published template depends on a Puck layout** | Live DB query 2026-07-26: 18 templates; only #14 (archived) and #15 (draft) have `body_layout_json` (2 trivial blocks each); **all published templates have `has_puck_layout=false`** |
| Template Studio production-ready | WP7 report; runtime-verified post-removal |
| TipTap retained | `report-designer-rich-text-editor.tsx` kept (Template Studio dependency) |
| Pre-removal build/regression green | 408/408 unit tests, production build OK |

## 2. Removed (Puck-exclusive only — 25 files + 1 dependency)

- `src/features/report-designer/puck/` — config, shell, shell-loader, types (the only files importing the Puck runtime)
- `src/features/report-designer/blocks/` — 12 Puck `ComponentConfig` block files + barrel (`heading`, `body-text-section`, `key-value-section`, `divider`, `spacer`, `branding-header`, `company-logo`, `signatory`, `stamp`, `verification-qr`, `column-strip`, `report-table`, `index.ts`)
- `src/features/report-designer/report-designer-editor-client.tsx`, `report-designer-test-panel.tsx`, `formal-preview-panel.tsx`, `index.ts`
- Routes: `src/app/(protected)/admin/reports/editor/page.tsx` + `[templateId]/page.tsx` (confirmed 404 post-removal)
- Server actions used only by the editor: `report-designer-layout.ts`, `report-designer-test.ts`
- Registry entries: sidebar "Reports Editor", workspace-route-registry editor tabs, RBAC `/admin/reports/editor` entry
- Dependency: `@puckeditor/core` removed from `package.json` + lockfile (`npm uninstall`)

## 3. Kept (explicitly out of removal scope)

- **TipTap** (`report-designer-rich-text-editor.tsx` + `field-picker/` — imported by Template Studio's `studio-block-editor.tsx`)
- **`src/lib/report-designer/`** in full: `layout-schema.ts`, `production-renderer.ts`, `prosemirror-renderer.ts`, `prosemirror-plaintext.ts`, `visual-template-security-review.ts`, `field-registry/`, `constants.ts`, `types.ts` — engine-agnostic, no Puck package dependency, still used by template governance, generation (`templates.ts` dynamic import), and Studio. Historical `visual_editor_engine='puck'` **data values** remain valid and queryable.
- Executive Ledger, Gotenberg adapters, report registry, template governance, all DB rows (`body_layout_json` untouched), generated PDFs, runs, issuance/QR history, audits.

## 4. UI Repointing

- Sidebar: "Reports Editor" → **"Template Studio"** (`/admin/reports/template-studio`, `reports.manage`)
- Templates & Branding table: per-row "Open in Visual Editor" link → "Open Template Studio"
- Governance "New Version": post-create navigation now opens the Template Studio instead of the retired editor

## 5. Verification Results

| Check | Result |
|---|---|
| Lockfile integrity, `rg -i puck package.json package-lock.json` | 0 matches |
| Source-wide active reference scan (`@puckeditor`, `reports/editor`) | only 1 explanatory comment remains |
| TypeScript | no new errors (pre-existing `@/types/database` + `expiry-reminders.ts` errors unchanged) |
| Unit tests | **408/408 passed** |
| ESLint on all edited files | 0 errors (3 pre-existing warnings) |
| Production build | **passed** |
| Client + server bundle scan for `puckeditor` | **clean** (both `.next/static` and `.next/server`) |
| `/admin/reports/editor` | 404 ("Page not found") — no broken menu link points at it |
| Templates & Branding page | loads; 18 historical templates + 4 branding profiles queryable |
| Template Studio | loads (template picker, Save Draft) |
| Official issuance E2E (EL → Gotenberg → SHA-256) | **PASS** (`coordinator-adapter-e2e.mts`, render 929 ms, hash verified) |
| Schedules worker | unaffected (no shared code with removed files) |

## 6. Rollback

Git-only rollback: restore the 25 deleted files and registry lines from commit history and `npm install @puckeditor/core@^0.22.0`. No database or storage change was made in this work package — nothing to compensate.

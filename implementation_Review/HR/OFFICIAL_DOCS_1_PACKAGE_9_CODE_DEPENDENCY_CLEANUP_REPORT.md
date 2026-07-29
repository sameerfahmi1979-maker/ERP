# OFFICIAL DOCS.1 — Package 9: Conditional Code & Dependency Cleanup Report

- **Program:** Global Official Letters & Forms Generator + Report Designer Retirement
- **Package:** 9 — Conditional code/dependency cleanup (Gate 9)
- **Date:** 2026-07-28
- **Precondition:** Gate 8 passed (see `OFFICIAL_DOCS_1_PACKAGE_8_DESIGNER_UI_RETIREMENT_REPORT.md`)

---

## 1. Proof of Unused (import-graph analysis)

Full reverse-import search across `src/` established the designer-only chain:

```
route page → TemplateStudioPageClient → StudioBlockEditor
           → ReportDesignerRichTextEditor (TipTap) → field-picker components
```

No file outside this chain imported any of these modules. The TipTap npm
packages had exactly two importers, both inside the chain.

## 2. Removed

### Files (designer-only, zero external consumers)

| File | Was |
|------|-----|
| `src/features/template-studio/template-studio-page-client.tsx` | Studio editor page client |
| `src/features/template-studio/studio-block-editor.tsx` | Structured block editor |
| `src/features/report-designer/blocks/report-designer-rich-text-editor.tsx` | TipTap rich-text editor |
| `src/features/report-designer/field-picker/` (5 files) | Field-picker UI (only consumed by the rich-text editor) |
| `src/features/report-designer/puck/` | Already-empty folder (Puck removed in RETIRE.1) |
| `src/server/actions/output/template-studio.ts` | Studio server actions — only caller was the deleted page client |

### npm dependencies (50 packages removed)

`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-color`,
`@tiptap/extension-text-align`, `@tiptap/extension-text-style`,
`@tiptap/extension-typography`, `@tiptap/extension-underline`
— no remaining importer in `src/` after the file removals.

### Feature flag

`isTemplateStudioEnabled()` / `OUTPUT_TEMPLATE_STUDIO_ENABLED` removed from
`src/lib/output/feature-flags.ts` (both consumers were deleted files). A
tombstone comment records the removal.

### Route behavior

`/admin/reports/template-studio` now renders a permanent **"Template Studio —
Retired"** notice (server component, `reports.manage` guard kept) so old links
and previously-pinned workspace tabs do not 404. Route registries
(`route-access-registry`, `workspace-route-registry`) unchanged.

### UX fix

`template-governance-actions.tsx` "Create New Version" no longer navigates to
the retired studio; the toast now explains wording is fixed in code and
branding/metadata is edited from the Templates page. Unused `useRouter` removed.

## 3. Retained (shared dependencies with legitimate consumers)

| Module | Legitimate consumers |
|--------|---------------------|
| `src/lib/template-studio/*` (schema, validate, diff, schema-to-el) | `lib/template-governance/security-review.ts`, `server/actions/reports/template-governance.ts`, `server/actions/reports/templates.ts` |
| `src/lib/report-designer/*` (field-registry, binding-registry, prosemirror-renderer, …) | Template governance security review, templates actions, `lib/template-studio` |
| Template Governance queue UI | Production governance/audit surface |
| All DB rows, storage files, issuance history, evidence folders | Section: retain all DB/storage/history evidence — nothing touched |

`spikes/` evidence folders and `legacy_puck_evidence` remain untouched.

## 4. Gate 9 Verification

| Check | Result |
|-------|--------|
| Production build (`npm run build`) | PASS — exit 0, all routes compiled |
| Typecheck | PASS — 72 errors, identical to Package 0 baseline (0 new) |
| Unit tests | PASS — 433/433 |
| Lint on changed files | PASS — 0 errors |
| `/admin/reports/template-studio` | PASS — renders retired notice (browser-verified) |
| Templates & Branding page | PASS — 4 branding profiles, 18 templates render |
| Template Governance queue | PASS — status board + approver queue render (browser-verified) |
| Historical/analytical regression | NONE — issued-document download re-verified in Package 8; report fetchers untouched |

## 5. Gate 9 Verdict

**PASS.** Designer-only code and dependencies removed with proof of non-use;
shared libraries retained with named consumers; build, typecheck, lint, and
tests all green; no missing imports or routes.

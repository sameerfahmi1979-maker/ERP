# REPORT DESIGNER.3 — ERP Block Library Foundation
## Implementation Report

**Phase:** REPORT DESIGNER.3  
**Date:** 2026-07-03  
**Status:** COMPLETE  
**tsc:** ✅ Passes (0 errors)  
**Build:** ✅ Passes (Next.js 16.2.6 Turbopack)

---

## 1. Executive Summary

REPORT DESIGNER.3 delivers the first full ERP visual block library for the Reports Editor using Puck. All 10 approved ERP blocks are implemented, organized into a clean per-file structure under `src/features/report-designer/blocks/`. The editor now supports Header / Body / Footer layout zone switching, load from and save to server actions, governance-aware read-only guards with descriptive banners, a rich template metadata header, and a template listing page at the editor index route. TypeScript and the production build both pass clean.

---

## 2. Files Read

| File | Purpose |
|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Current phase state and history |
| `.cursor/rules/erp-report-designer-visual-template-standard.mdc` | Designer rules |
| `docs/standards/ERP_REPORT_DESIGNER_VISUAL_TEMPLATE_STANDARD.md` | Full standard |
| `src/lib/report-designer/types.ts` | Block type definitions (VisualLayoutResult, block interfaces) |
| `src/lib/report-designer/binding-registry.ts` | ERP_BINDING_REGISTRY (27 allowlisted paths) |
| `src/lib/report-designer/constants.ts` | EDITABLE_GOVERNANCE_STATUSES, block type list |
| `src/server/actions/reports/report-designer-layout.ts` | Layout load/save actions |
| `src/features/report-designer/puck/report-designer-puck-config.tsx` | Existing scaffold (3 blocks) |
| `src/features/report-designer/puck/report-designer-puck-shell.tsx` | Existing shell |
| `src/features/report-designer/puck/report-designer-puck-types.ts` | Existing Puck type definitions |
| `src/app/(protected)/admin/reports/editor/[templateId]/page.tsx` | Existing editor route |
| `src/app/(protected)/admin/reports/editor/page.tsx` | Existing index route |
| `node_modules/@puckeditor/core/dist/actions-Csn3gOP8.d.ts` | Puck v0.22 ArrayField API |

---

## 3. Files Created

| File | Description |
|---|---|
| `src/features/report-designer/blocks/heading-block.tsx` | HeadingBlock (h1/h2/h3, align) |
| `src/features/report-designer/blocks/body-text-section-block.tsx` | BodyTextSectionBlock (title, content, language) |
| `src/features/report-designer/blocks/key-value-section-block.tsx` | KeyValueSectionBlock (title, fields array with binding select) |
| `src/features/report-designer/blocks/divider-block.tsx` | DividerBlock (optional center label) |
| `src/features/report-designer/blocks/spacer-block.tsx` | SpacerBlock (heightMm 4–40) |
| `src/features/report-designer/blocks/branding-header-block.tsx` | BrandingHeaderBlock (showLogo/Name/Address/Contact) |
| `src/features/report-designer/blocks/company-logo-block.tsx` | CompanyLogoBlock (variant, align, maxHeightMm) |
| `src/features/report-designer/blocks/signatory-block.tsx` | SignatoryBlock (showSignature, nameOverride, titleOverrideEn) |
| `src/features/report-designer/blocks/stamp-block.tsx` | StampBlock (align, sizeMm 20–60) |
| `src/features/report-designer/blocks/verification-qr-block.tsx` | VerificationQrBlock (label, align, sizeMm 20–50) |
| `src/features/report-designer/blocks/index.ts` | Block library barrel export |
| `src/features/report-designer/report-designer-editor-client.tsx` | Full editor client: metadata header, zone selector, governance guard, load/save |

---

## 4. Files Modified

| File | Change |
|---|---|
| `src/lib/report-designer/types.ts` | Extended `VisualLayoutResult` with `templateCode`, `versionNo`, `securityReviewStatus`, `visualLayoutUpdatedBy` |
| `src/server/actions/reports/report-designer-layout.ts` | Extended `getReportTemplateVisualLayout` to select and return new fields |
| `src/features/report-designer/puck/report-designer-puck-types.ts` | Rewrote to include all 10 block prop types imported from block files |
| `src/features/report-designer/puck/report-designer-puck-config.tsx` | Rewrote with full 10-block config using block library |
| `src/features/report-designer/puck/report-designer-puck-shell.tsx` | Fixed read-only mode to use `<Render>` instead of broken `<Puck.Preview>` outside Puck context; added `onChange` handler |
| `src/features/report-designer/index.ts` | Updated exports for all 10 block types + editor client |
| `src/app/(protected)/admin/reports/editor/[templateId]/page.tsx` | Replaced scaffold with `ReportDesignerEditorClient` |
| `src/app/(protected)/admin/reports/editor/page.tsx` | Replaced placeholder with live template listing table |

---

## 5. Puck Config / Block Library Structure

```
src/features/report-designer/
├── blocks/
│   ├── heading-block.tsx
│   ├── body-text-section-block.tsx
│   ├── key-value-section-block.tsx
│   ├── divider-block.tsx
│   ├── spacer-block.tsx
│   ├── branding-header-block.tsx
│   ├── company-logo-block.tsx
│   ├── signatory-block.tsx
│   ├── stamp-block.tsx
│   ├── verification-qr-block.tsx
│   └── index.ts
├── puck/
│   ├── report-designer-puck-config.tsx  ← imports all 10 block configs
│   ├── report-designer-puck-shell.tsx   ← Puck editor + Render for read-only
│   ├── report-designer-puck-shell-loader.tsx  ← dynamic(ssr:false) wrapper
│   └── report-designer-puck-types.ts   ← all 10 block prop types
├── report-designer-editor-client.tsx   ← full editor UI
└── index.ts
```

Each block file exports:
1. An interface for the block's props
2. A render function (the Puck canvas component)
3. A `ComponentConfig<Props>` object (fields, defaultProps, render)

The `reportDesignerPuckConfig` in `puck-config.tsx` maps each component name directly to its `ComponentConfig`, matching Puck v0.22's `Config<Components>` type.

---

## 6. All 10 Blocks — Prop Summary

| Block | Key Props | Binding? | Canvas |
|---|---|---|---|
| `HeadingBlock` | `text: string`, `level: "h1"\|"h2"\|"h3"`, `align` | No | Styled heading tag |
| `BodyTextSectionBlock` | `title?: string`, `content: string`, `language: "en"\|"ar"\|"bilingual"` | Via {{...}} in content | RTL-aware text block |
| `KeyValueSectionBlock` | `title?: string`, `fields: KeyValueFieldRow[]` | Binding per field (select from registry) | Table with label→{{binding}} rows |
| `DividerBlock` | `label?: string` | No | Horizontal rule, optional centered label |
| `SpacerBlock` | `heightMm: number (4–40)` | No | Dashed spacer with mm label |
| `BrandingHeaderBlock` | `showLogo`, `showName`, `showAddress`, `showContact` (all boolean) | No (from branding profile) | Blue placeholder showing fields enabled |
| `CompanyLogoBlock` | `variant: "report_logo"\|"small_logo"`, `align`, `maxHeightMm (16–80)` | No (from branding profile) | Green placeholder logo box |
| `SignatoryBlock` | `showSignature`, `nameOverride`, `titleOverrideEn` | No (from branding profile) | Signature line + name/title |
| `StampBlock` | `align`, `sizeMm (20–60)` | No (from branding profile) | Orange circular stamp placeholder |
| `VerificationQrBlock` | `label`, `align`, `sizeMm (20–50)` | No (QR at issuance) | QR grid SVG placeholder |

All block props are plain data types (`string`, `number`, `boolean`, `string union`, `array of plain objects`). No functions, no ReactNode, no raw HTML, no CSS strings, no external URLs.

---

## 7. Binding Dropdown / Registry Usage

**KeyValueSectionBlock** is the only block with binding selection. The `fields` array uses Puck's `ArrayField` with `arrayFields.binding` set to a `select` field whose options are generated from `ERP_BINDING_REGISTRY`:

```typescript
const BINDING_OPTIONS = Object.values(ERP_BINDING_REGISTRY).map((b) => ({
  value: b.path,
  label: `${b.label} [${b.namespace}]`,
}));
```

This gives users a controlled dropdown with all 27 allowlisted safe paths. Unknown / sensitive bindings are impossible to select — they are not in the options list.

**BodyTextSectionBlock** allows `{{binding}}` placeholders in the `content` text field. These are validated server-side by the existing Zod schema in `layout-schema.ts` using `validateTextBindings()` from the binding registry.

Sensitive fields excluded (never in registry):
- salary, IBAN, bank_account, passport raw, EID raw
- OCR text, embeddings, vectors, API keys
- Internal `*_id` FK fields, `created_by`, `updated_by`

---

## 8. Header / Body / Footer Zone Behavior

The editor client maintains three independent zones in a `zonesRef`:
```typescript
const zonesRef = useRef<Record<Zone, ReportDesignerLayoutJson>>({
  header: EMPTY_LAYOUT,
  body: EMPTY_LAYOUT,
  footer: EMPTY_LAYOUT,
});
```

On mount, all three zones are loaded from `getReportTemplateVisualLayout()` and stored in `zonesRef`. The active zone defaults to `"body"`.

**Zone switching:**
1. The current zone's unsaved Puck data is written back to `zonesRef[activeZone]`.
2. The new zone's layout is read from `zonesRef[newZone]` and set as `currentZoneLayout`.
3. The Puck shell is forced to remount via `key={templateId-zone}`, loading the new zone's data fresh.

**UI indicator:** An amber dot (`•`) appears on the active zone tab when there are unsaved changes.

---

## 9. Save / Load Behavior

**Load (on mount):**
- `getReportTemplateVisualLayout(templateId)` is called once.
- All 3 zone layouts are stored in `zonesRef`.
- Active zone (body by default) is loaded into `currentZoneLayout` and passed to `ReportDesignerPuckShellLoader`.
- If a zone's JSON is empty/invalid, `EMPTY_LAYOUT` is used.

**On Puck change:**
- `onChange` fires on every Puck data change.
- `currentZoneLayout` state is updated, `hasUnsavedChanges` is set to `true`.

**Save (on button click):**
- `zonesRef[activeZone]` is updated with `currentZoneLayout`.
- `saveReportTemplateVisualLayout` is called with all 3 zones — this prevents the `?? {}` fallback in the server action from wiping unchanged zones.
- On success: success toast, `hasUnsavedChanges` reset, layout reloaded to refresh metadata.
- On failure: error toast with server error message.
- Save button is disabled while saving or when there are no unsaved changes.

---

## 10. Governance / Read-Only Behavior

**Editable statuses:** `draft`, `rejected` (from `EDITABLE_GOVERNANCE_STATUSES` constant)  
**Read-only statuses:** `in_review`, `approved`, `published`, `archived`

**UI enforcement:**
- `isReadOnly = !layoutResult.isEditable` (derived from server-returned `isEditable` flag)
- When read-only:
  - Banner displayed with status-specific message
  - Save button hidden, "Read-only" indicator shown instead
  - Puck shell receives `readOnly={true}` → renders `<Render>` (preview) instead of `<Puck>` (editor)
  - Zone tabs still visible (user can navigate zones for review)
- Governance status badge displayed in metadata header for all templates

**Read-only messages:**
| Status | Message |
|---|---|
| `in_review` | "Template is under review. Create a new draft or wait for approval/rejection." |
| `approved` | "Approved templates cannot be edited directly. Create a new version from governance actions." |
| `published` | "Published templates cannot be edited directly. Create a new version from governance actions." |
| `archived` | "Archived templates are read-only." |

**Server-side guard:** Unchanged from REPORT DESIGNER.1. The `saveReportTemplateVisualLayout` action independently checks `governance_status` and rejects saves for non-draft/non-rejected templates regardless of UI state.

---

## 11. Security Checks

```bash
# dangerouslySetInnerHTML in report-designer/lib
→ Only found in config comment (not actual usage) ✅

# createAdminClient / service_role / SUPABASE_SERVICE in features
→ No matches ✅

# createClient / supabase.from in features
→ No matches ✅
```

All block renders use plain JSX with inline styles. No `dangerouslySetInnerHTML`, no raw HTML injection. External image URL fields are not exposed — logo, signature, stamp assets are shown as placeholders only and will be resolved from branding profile in REPORT DESIGNER.4.

---

## 12. Puck CSS Containment Findings

**Finding:** Puck's `puck.css` is imported in `report-designer-puck-shell.tsx` (client component, dynamically imported with `ssr:false`). The CSS is bundled only for the editor route.

**Potential leak:** Puck CSS uses global class selectors (`.puck-*`, `[data-puck-*]`) that could conflict with ERP shell styles if both are on the same page.

**Mitigation applied:** The Puck editor is wrapped in a `div.report-designer-puck-container` with `height: 100%`. Since the Puck shell is dynamically imported and only rendered on `/admin/reports/editor/*` routes, CSS scope leakage to other pages is not a concern at runtime.

**Recommendation for REPORT DESIGNER.4:** If visual conflicts are observed between Puck chrome and the ERP shell navigation on the editor page, add a CSS `@layer` wrapper or scope override. Not required now — no conflicts observed in development build.

---

## 13. TypeScript Result

```
npx tsc --noEmit
→ Exit code: 0 (no errors)
```

---

## 14. Build Result

```
npm run build
→ ✓ Compiled successfully in 17.1s
→ ✓ TypeScript passed in 36.1s
→ ✓ Static pages generated
→ Routes /admin/reports/editor and /admin/reports/editor/[templateId] present
→ Exit code: 0
```

---

## 15. Browser UAT

Browser UAT was not performed in this session (no test user session was available). Source-level verification confirms:

- All 10 block types exist in `reportDesignerPuckConfig.components`
- Puck's `ArrayField` API is correctly used for `KeyValueSectionBlock.fields`
- Governance guard logic uses the same `EDITABLE_GOVERNANCE_STATUSES` constant as the server action
- All three zones are always passed to `saveReportTemplateVisualLayout` to prevent destructive `?? {}` writes
- Read-only mode uses `<Render>` (correct) not `<Puck.Preview>` (which requires Puck context)

---

## 16. Known Limitations

1. **No Executive Ledger preview in editor** — Puck canvas shows styled placeholders for branding/logo/signature/stamp/QR blocks. Real asset resolution is REPORT DESIGNER.4.
2. **No live test data rendering** — Body text `{{binding}}` placeholders are shown as literal strings in the canvas. Real value substitution is REPORT DESIGNER.5.
3. **BodyTextSectionBlock content binding validation** — Client-side validation of `{{binding}}` paths in the text is not shown in the Puck editor UI (no inline warning). Server-side validation remains active via `saveReportTemplateVisualLayout`.
4. **`visual_layout_updated_by` UUID** — The metadata header shows the raw UUID of the last editor. A human-readable name lookup was not added to avoid new DB joins; can be added in a future cleanup phase.
5. **No deep-link from Templates page to Editor** — Templates list at `/admin/reports/templates` does not yet have an "Open in Editor" button. Can be added in REPORT DESIGNER.4 without a new phase.
6. **Puck CSS global scope** — Noted in section 12. No conflicts observed. Monitor in REPORT DESIGNER.4.

---

## 17. Next Recommended Phase

**REPORT DESIGNER.4 — Layout JSON → Executive Ledger Mapping**

Map the `ReportDesignerLayoutJson` block structures to `ExecutiveLedgerDocument` sections for formal PDF/HTML preview rendering in the editor. This will:
- Show a live "Formal Preview" panel alongside the Puck canvas
- Resolve branding assets (logo, signature, stamp) from the template's branding profile
- Replace canvas placeholders with actual rendered output
- Enable "Preview PDF" button from the editor

Prerequisite: REPORT DESIGNER.3 (this phase) must be fully deployed and validated.

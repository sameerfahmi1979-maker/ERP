# REPORT DESIGNER.2 — Puck Installation, Type, Query Keys, Editor Shell Prep
## Implementation Report

**Phase:** REPORT DESIGNER.2  
**Date:** 2026-07-03  
**Status:** CLOSED / PASS ✅

---

## 1. Executive Summary

REPORT DESIGNER.2 successfully prepared the app for Puck-based visual editing. The correct `@puckeditor/core` v0.22.0 package was verified, installed, and documented. TypeScript types, report designer query keys, invalidation helpers, and a minimal Puck config scaffold were added. A route skeleton at `/admin/reports/editor` and `/admin/reports/editor/[templateId]` was created to prove Next.js App Router build/render boundaries. TypeScript passed cleanly and the production build passed.

---

## 2. Puck Package Verified

| Item | Value |
|---|---|
| **Package name** | `@puckeditor/core` |
| **Version installed** | `0.22.0` |
| **License** | MIT |
| **React peer dependency** | `^18.0.0 \|\| ^19.0.0` (compatible with React 19.2.4) |
| **Next.js compatibility** | Confirmed — Next.js 16 App Router supported |
| **Client-only requirement** | Yes — editor must be in `"use client"` component |
| **CSS import required** | Yes — `@puckeditor/core/puck.css` |
| **Previous package** | `@measured/puck` (deprecated as of Jan 2026 with Puck 0.21 migration to `@puckeditor` namespace) |
| **Why accepted** | MIT license, actively maintained (12k+ GitHub stars, v0.22 released April 2026), no CVEs, React/Next.js App Router native support |

---

## 3. Files Created

| File | Purpose |
|---|---|
| `src/features/report-designer/puck/report-designer-puck-types.ts` | Puck component prop types and `ReportDesignerPuckConfig` type alias |
| `src/features/report-designer/puck/report-designer-puck-config.tsx` | Minimal Puck config scaffold with 3 placeholder blocks (HeadingBlock, BodyTextSectionBlock, SpacerBlock) |
| `src/features/report-designer/puck/report-designer-puck-shell.tsx` | Puck editor shell client component (wraps `<Puck>`, handles data conversion) |
| `src/features/report-designer/puck/report-designer-puck-shell-loader.tsx` | Client wrapper for `dynamic()` with `ssr:false` (required by Next.js 16 — `ssr:false` cannot be used in Server Components) |
| `src/features/report-designer/index.ts` | Feature module public API re-exports |
| `src/app/(protected)/admin/reports/editor/page.tsx` | Editor index route skeleton (placeholder, redirects unauthorized users) |
| `src/app/(protected)/admin/reports/editor/[templateId]/page.tsx` | Template editor dynamic route (loads shell via `ReportDesignerPuckShellLoader`) |

---

## 4. Files Modified

| File | Change |
|---|---|
| `src/lib/query/query-keys.ts` | Added `queryKeys.reports.designer` with 5 keys |
| `src/lib/query/invalidation.ts` | Added 4 invalidation helpers for report designer |
| `src/lib/rbac/route-access-registry.ts` | Added `/admin/reports/editor` (requires `reports.manage`) |
| `src/lib/workspace/workspace-route-registry.ts` | Added editor index and record tab workspace entries |
| `src/components/layout/app-sidebar.tsx` | Added `PenLine` icon import and "Reports Editor" sidebar item under Reports |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Updated last closed gate and next recommended phase |

---

## 5. Package Install Changes

```
@puckeditor/core@0.22.0 (added — 65 new packages in dependency tree)
```

Notable transitive deps (all expected for a visual editor):
- `@dnd-kit/*` (drag-and-drop)
- `@tiptap/*` (rich text in Puck fields)
- `@measured/puck` — NOT installed (deprecated; using `@puckeditor/core`)

---

## 6. Query Keys Added

In `src/lib/query/query-keys.ts` under `queryKeys.reports.designer`:

```typescript
queryKeys.reports.designer.templates(params?)       → ["reports","designer","templates",params?]
queryKeys.reports.designer.template(templateId)     → ["reports","designer","template",templateId]
queryKeys.reports.designer.layout(templateId)       → ["reports","designer","layout",templateId]
queryKeys.reports.designer.validation(templateId)   → ["reports","designer","validation",templateId]
queryKeys.reports.designer.testOptions(templateId)  → ["reports","designer","test-options",templateId]
```

---

## 7. Invalidation Helpers Added

In `src/lib/query/invalidation.ts`:

```typescript
invalidateReportDesignerTemplates(queryClient)           // clears template list
invalidateReportDesignerTemplate(queryClient, id)        // clears template + layout
invalidateReportDesignerLayout(queryClient, id)          // clears layout only
invalidateReportDesignerTestOptions(queryClient, id)     // clears test options
```

---

## 8. Template Type and Fetch Alignment

**No changes were required.** `ReportTemplate` in `src/lib/report-center/types.ts` already included all visual layout columns as added in REPORT DESIGNER.1:

```typescript
// Already present from REPORT DESIGNER.1:
body_layout_json: Record<string, unknown>;
header_layout_json: Record<string, unknown>;
footer_layout_json: Record<string, unknown>;
style_json: Record<string, unknown>;
visual_editor_engine: string | null;
visual_layout_schema_version: number | null;
visual_layout_updated_at: string | null;
visual_layout_updated_by: number | null;
governance_status: TemplateGovernanceStatus;
security_review_status: TemplateSecurityReviewStatus;
version_no: number;
parent_template_id: number | null;
```

Server actions in `templates.ts` use `select("*")` which includes all columns.

---

## 9. Minimal Editor Shell / Scaffold Details

### Component architecture

```
ReportsEditorTemplatePage (Server Component)
  └── ReportDesignerPuckShellLoader ("use client", dynamic ssr:false)
        └── ReportDesignerPuckShell ("use client")
              └── <Puck config={reportDesignerPuckConfig} data={puckData} />
```

### Puck config (scaffold-only — full library in REPORT DESIGNER.3)

3 placeholder blocks:
- `HeadingBlock` — text, level (h1–h4), alignment (left/center/right)
- `BodyTextSectionBlock` — text, alignment (left/center/right/justify)
- `SpacerBlock` — height in px (4–200px)

All blocks: plain text props only, no HTML, no DB calls, no server imports.

### Layout conversion

`ReportDesignerLayoutJson` (REPORT DESIGNER.1 format) is structurally compatible with Puck's `Data` format. The `toPuckData()` helper in the shell converts between them.

### Known limitation — `ssr: false` in Server Components (fixed)

Next.js 16 does not allow `dynamic()` with `ssr:false` directly inside Server Components (only in Client Components). Fixed by extracting `ReportDesignerPuckShellLoader` as a `"use client"` wrapper that does the dynamic import. The Server Component page then uses this loader.

---

## 10. Route / Sidebar Changes

| Route | Purpose | Access |
|---|---|---|
| `/admin/reports/editor` | Index placeholder | `reports.manage` |
| `/admin/reports/editor/[templateId]` | Template editor skeleton | `reports.manage` |

Sidebar: one new item **"Reports Editor"** (icon: `PenLine`) added under Reports, after "Templates & Branding". Only visible to users with `reports.manage` permission.

---

## 11. Security Review

| Check | Result |
|---|---|
| `dangerouslySetInnerHTML` in feature/lib code | ✅ None (only in comment string) |
| `createAdminClient` in client feature code | ✅ None |
| `service_role`, `api_key`, `secret` in feature/lib code | ✅ None (only in comment strings) |
| Puck editor is client-only | ✅ Enforced via `"use client"` + `dynamic(ssr:false)` |
| No server-only imports in client components | ✅ Verified |
| No direct Supabase calls from Puck shell | ✅ None |
| Visual layout JSON only, no raw HTML renderer | ✅ No `dangerouslySetInnerHTML` |
| Approved/published templates remain non-editable | ✅ Enforced in REPORT DESIGNER.3+ (governance guard in save action already in DESIGNER.1) |
| RBAC on new routes | ✅ Both routes require `reports.manage` |

---

## 12. npm audit Result

8 vulnerabilities (6 moderate, 2 high) — **all pre-existing, none from `@puckeditor/core`**:

| Package | Severity | Status |
|---|---|---|
| `dompurify` | Moderate (3 CVEs) | Pre-existing; `npm audit fix` available |
| `hono` | High (5 CVEs) | Pre-existing; `npm audit fix` available |
| `js-yaml` | Moderate (1 CVE) | Pre-existing; `npm audit fix` available |
| `postcss` (via `next`) | Moderate | Pre-existing; fix requires `next` downgrade — breaking |
| `uuid` (via `exceljs`) | Moderate | Pre-existing; fix requires `exceljs` downgrade — breaking |
| `xlsx` | High (2 CVEs) | Pre-existing; **no fix available** (known SheetJS issue) |

`@puckeditor/core` itself introduced zero new vulnerabilities.

---

## 13. TypeScript Result

```
npx tsc --noEmit
Exit code: 0 — No errors
```

One fix required during implementation: Puck v0.22 `Config<Components>` maps component names directly to their prop types (e.g. `{ HeadingBlock: HeadingBlockProps }`), not wrapped in `{ props: HeadingBlockProps }`. Updated `ReportDesignerPuckComponents` type accordingly.

---

## 14. Build Result

```
npm run build
✓ Compiled successfully in 19.1s
✓ TypeScript passed in 40s
✓ Static pages generated (5/5)
Exit code: 0
```

New routes visible in build output:
- `ƒ /admin/reports/editor`
- `ƒ /admin/reports/editor/[templateId]`

---

## 15. Known Limitations

1. **Editor shell is scaffold-only.** No save integration yet. `onPublish` callback exists but no server action wired up. Full save is REPORT DESIGNER.3+.
2. **Only 3 placeholder blocks.** Full 10-block ERP library (Heading, BodyText, KeyValue, Divider, Spacer, BrandingHeader, CompanyLogo, Signatory, Stamp, VerificationQr) is REPORT DESIGNER.3.
3. **No governance guard in route.** The editor route shows the Puck shell for any template ID. Draft/rejected-only enforcement will be added in REPORT DESIGNER.3 when the template is actually fetched.
4. **No layout zone switching.** Header / Body / Footer zone tabs are REPORT DESIGNER.3.
5. **No Executive Ledger preview.** Visual layout → official output mapping is REPORT DESIGNER.4.
6. **Live Report Test** remains skeleton-only (REPORT DESIGNER.5).
7. **`puck.css` scoping.** Puck's CSS imports globally; proper scoping inside the ERP shell (iframe isolation or CSS containment) should be evaluated in REPORT DESIGNER.3.

---

## 16. Recommended Next Phase: REPORT DESIGNER.3

**REPORT DESIGNER.3 — ERP Block Library Foundation**

Build the full 10-block ERP block library with:
- Props matching REPORT DESIGNER.1 block schemas and binding registry
- Field panels for all block props including ERP data binding fields
- Layout zone selector (header / body / footer)
- Save integration wired to `saveReportTemplateVisualLayout` server action
- Governance guard — only draft/rejected templates editable
- Template metadata loaded from DB
- Basic block rendering preview

---

*Report created: 2026-07-03*

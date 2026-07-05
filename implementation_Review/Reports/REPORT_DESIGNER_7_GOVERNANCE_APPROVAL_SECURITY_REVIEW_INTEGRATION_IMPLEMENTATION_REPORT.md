# REPORT DESIGNER.7 — Governance, Approval & Security Review Integration
## Implementation Report

**Phase:** REPORT DESIGNER.7
**Date:** 2026-07-03
**Status:** CLOSED / PASS

---

## 1. Executive Summary

REPORT DESIGNER.7 successfully integrates the visual report designer with the existing
template governance, approval, security review, and official output guardrails. Visual
layouts are now subject to the same deterministic security analysis as legacy HTML
templates. Production visual rendering is gated to approved/published templates only.
The Reports Editor clearly communicates governance state and provides a safe print path
for visual templates.

---

## 2. Files Read

- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`
- `src/lib/template-governance/security-review.ts` — existing security review engine
- `src/server/actions/reports/template-governance.ts` — governance actions
- `src/features/report-designer/report-designer-editor-client.tsx` — editor UI
- `src/lib/report-designer/types.ts` — layout types
- `src/lib/report-designer/binding-registry.ts` — safe binding allowlist
- `src/lib/report-designer/constants.ts` — block type allowlist
- `src/lib/report-designer/index.ts` — public API barrel
- `src/features/report-center/letter-preview-dialog.tsx` — production preview
- `src/server/actions/reports/templates.ts` — template server actions

---

## 3. Files Created

| File | Purpose |
|---|---|
| `src/lib/report-designer/visual-template-security-review.ts` | Pure security review functions for visual layout JSON |

---

## 4. Files Modified

| File | What Changed |
|---|---|
| `src/lib/template-governance/security-review.ts` | Extended `TemplateContentFields` to include visual layout columns; `runTemplateSecurityReview` now delegates to `reviewVisualTemplateLayoutSecurity` when visual fields are present |
| `src/server/actions/reports/template-governance.ts` | `submitTemplateForReview` and `runTemplateSecurityReviewAction` now fetch and pass visual layout columns to `runTemplateSecurityReview`; `createTemplateDraftVersion` now copies `visual_editor_engine` and `visual_layout_schema_version` |
| `src/server/actions/reports/templates.ts` | `renderVisualTemplateForLetterPreview` now checks `governance_status IN ('approved', 'published')` before rendering visual layout; adds `governance_status` to the select |
| `src/features/report-designer/report-designer-editor-client.tsx` | `ReadOnlyBanner` enhanced with per-status colors and "Go to Governance" link; new `TestPreviewOnlyBanner` component shown in Test Report tab for non-approved templates |
| `src/features/report-center/letter-preview-dialog.tsx` | `handlePrint` and `handlePDF` now prefer `visualHtml` when available — safe window.print() path for visual templates |
| `src/lib/report-designer/index.ts` | Added exports for `reviewVisualTemplateLayoutSecurity`, `reviewVisualLayoutZone`, `extractVisualLayoutBindings`, `VisualTemplateSecurityReviewInput`, `VisualTemplateSecurityReviewResult` |

---

## 5. Governance/Security Review Changes

### 5.1 New: `visual-template-security-review.ts`

A new pure-function module (`src/lib/report-designer/visual-template-security-review.ts`) provides:

- **`reviewVisualTemplateLayoutSecurity(input)`** — Full visual layout security review  
  - Validates `visual_editor_engine` (only `null` or `puck`)  
  - Validates `visual_layout_schema_version` (≤ `CURRENT_LAYOUT_SCHEMA_VERSION`)  
  - Parses each zone (header/body/footer) with `ReportDesignerLayoutJsonSchema`  
  - Checks all block types against the 10-block allowlist  
  - Recursively scans all block props for:
    - Unsafe HTML tags (`<script>`, `<iframe>`, `<object>`, etc.)
    - Event handler keys (`onClick`, `onLoad`, `onError`, etc.)
    - Unsafe protocol strings (`javascript:`, `data:text/html`, etc.)
    - Secret/credential patterns (`service_role`, `api_key=`, etc.)
    - SQL injection fragments
  - Validates all `{{binding}}` placeholders against `ERP_BINDING_REGISTRY`
  - Checks for sensitive binding fragments (salary, IBAN, medical, etc.)
  - Enforces per-zone payload size limit (64 KB)
  - Scans `style_json` similarly
  - Returns `SecurityFinding[]` using the same structure as the existing engine

- **`reviewVisualLayoutZone(zoneRaw, zoneName)`** — Single-zone inspector  
- **`extractVisualLayoutBindings(input)`** — Lists all binding paths used by the visual layout

### 5.2 Existing engine integration

`runTemplateSecurityReview` in `security-review.ts` was extended to:
- Accept optional visual layout fields in `TemplateContentFields`
- When visual fields are present, call `reviewVisualTemplateLayoutSecurity` via a lazy `require()` (avoids circular dependency at module level) and merge findings
- Return contract unchanged (`SecurityReviewResult` with `passed`, `severity`, `findings`)

### 5.3 Governance actions updated

- **`submitTemplateForReview`**: Now selects and passes visual layout columns to `runTemplateSecurityReview`. Unsafe visual layouts fail submission.
- **`runTemplateSecurityReviewAction`**: Same — visual layout included in the review.
- **`approveTemplate`**: Already blocks on `security_review_status === 'failed'` — inherits the new visual findings automatically.
- **`publishTemplate`**: Already checks `security_review_status` — inherits.
- **`createTemplateDraftVersion`**: Now copies `visual_editor_engine` and `visual_layout_schema_version` to new draft (previously missing). `visual_layout_updated_at/by` reset to null for the new draft.

---

## 6. Production Visual Rendering Gate Behavior

In `renderVisualTemplateForLetterPreview` (called from `LetterPreviewDialog` formal view):

```
if governance_status NOT IN ('approved', 'published'):
  return { ok: true, hasVisualLayout: false }
  → caller silently falls back to legacy ExecutiveLedger rendering
```

This means:
- **Approved/Published templates** → visual layout rendered and shown in the formal preview iframe
- **Draft/In Review/Rejected/Archived templates** → `hasVisualLayout: false` returned → fallback to legacy rendering (no error shown to user)

This gate is intentionally silent to maintain UX continuity — the formal preview still works via the legacy path while the template is pending governance.

---

## 7. Test Report Behavior After DESIGNER.7

**Reports Editor → Test Report tab:**
- Still works for all governance statuses including draft and rejected
- No governance gate in `runReportDesignerTest` (intentionally draft-safe)
- New **`TestPreviewOnlyBanner`** appears when governance status is NOT approved/published:
  - `"Test preview only — this template is Draft and is not approved for official output."`
  - Shows "Submit for Review" link to `/admin/reports/templates`
- Banner is suppressed for approved/published templates (no false noise)

Context separation is clear:

| Context | Draft-safe? | Gate |
|---|---|---|
| Reports Editor Test Report | ✅ Yes | No governance gate (explicit test mode) |
| LetterPreviewDialog formal view | ❌ No | `governance_status IN ('approved', 'published')` |
| QR issuance | ❌ No | Existing `checkTemplateIsIssuable` gate (unchanged) |

---

## 8. Visual PDF/Print Status

### Implemented (Print via window.print)

`handlePrint` and `handlePDF` in `LetterPreviewDialog` now detect `visualHtml` and use it for the print path:

```typescript
if (formalView && visualHtml) {
  // Open new window with visual HTML and trigger print dialog
  win.document.write(visualHtml);
  win.print();
}
```

This reuses the already-rendered Executive Ledger HTML from `renderVisualTemplateZones`. The HTML is sanitized server-side — no raw user content. The user's browser print dialog handles PDF export (Save to PDF).

### Not implemented (deferred to DESIGNER.8)

A dedicated server-side PDF rendering engine (Puppeteer/WeasyPrint) for visual templates is out of scope for this phase per the prompt. The window.print() approach is the safe minimal path.

---

## 9. Security Grep Results

### Grep 1: `dangerouslySetInnerHTML`
```
src/features/report-designer/report-designer-test-panel.tsx: *  - HTML rendered in <iframe srcDoc={...}> — no dangerouslySetInnerHTML
src/features/report-designer/formal-preview-panel.tsx: *  - Rendered inside <iframe srcDoc={...}> — no dangerouslySetInnerHTML in React
src/features/report-designer/puck/report-designer-puck-config.tsx: *  - No dangerouslySetInnerHTML in any block render
```
✅ Comments/docs only. No actual usage.

### Grep 2: `erp_output_public_links | createOutputPublicLink`
```
Only comments/doc strings in test/preview files.
```
✅ Zero runtime calls from test/preview paths.

### Grep 3: `erp_report_runs | erp_report_delivery_logs | erp_email_queue | queueEmail | sendEmail`
```
Only comments/doc strings in test/preview files.
```
✅ Zero runtime calls from test/preview paths.

### Grep 4: `createAdminClient | service_role | SUPABASE_SERVICE` in `src/features/report-designer`
```
(no output)
```
✅ No service role usage in client-facing features.

### Grep 5: Sensitive field patterns
All matches are in deny-list definitions, comments, and masking code — no exposure of actual values.
✅ No sensitive data in visual layout paths.

### Grep 6: `onClick | onLoad | onError | javascript: | data:text/html | <script | <iframe | <object | <embed`
All matches are in:
- React UI button `onClick` handlers (valid React syntax)
- Pattern definition strings inside `security-review.ts` (the deny-list itself)
- Inline comment docs noting that `<iframe srcDoc={...}>` is used safely
✅ No unsafe HTML injected into DOM.

---

## 10. Side-Effect Prevention Proof

| Side Effect | Status |
|---|---|
| `erp_report_runs` insert | ❌ Never from test/preview — confirmed by grep |
| `erp_output_public_links` insert | ❌ Never from test/preview — confirmed by grep |
| `erp_report_delivery_logs` insert | ❌ Never from test/preview — confirmed by grep |
| `erp_email_queue` insert | ❌ Never from test/preview — confirmed by grep |
| Production visual render for draft templates | ❌ Blocked by governance gate in `renderVisualTemplateForLetterPreview` |
| Visual layout save for non-draft/non-rejected | ❌ Blocked by `saveReportTemplateVisualLayout` server action governance guard (existing, unchanged) |

---

## 11. TypeScript Result

```
npx tsc --noEmit → exit code 0 (no errors)
```

---

## 12. Build Result

```
npm run build → exit code 0
All pages compiled successfully
```

---

## 13. Browser/Manual UAT Checklist

| Test | Expected |
|---|---|
| Submit a visual template with unknown block type | Security review fails, submission blocked |
| Submit a visual template with `{{salary.amount}}` binding | Security review fails (sensitive binding) |
| Submit a visual template with `<script>` in a block prop | Security review fails (unsafe HTML tag) |
| Submit a clean visual template (approved block types, safe bindings) | Security review passes, status advances to `in_review` |
| Approve a template with failed security review | Blocked with error |
| Run `runTemplateSecurityReviewAction` on a visual template | Returns findings for both legacy HTML and visual layout |
| Open `LetterPreviewDialog` formal view with a draft Puck template | Falls back to legacy rendering silently |
| Open `LetterPreviewDialog` formal view with an approved Puck template | Visual iframe renders |
| Click Print in LetterPreviewDialog with visual iframe showing | Opens new window with visual HTML + browser print dialog |
| Open Reports Editor → Test Report tab on a draft template | `TestPreviewOnlyBanner` shows |
| Open Reports Editor → Test Report tab on an approved template | No banner, test still works |
| Create new draft version from approved template | New draft copies `visual_editor_engine` and `visual_layout_schema_version` |
| Attempt to save visual layout on an in_review template | Blocked by server action governance guard |

---

## 14. Known Limitations

| Limitation | Notes |
|---|---|
| Full server-side PDF for visual templates | Not implemented in DESIGNER.7. window.print() is the safe minimal path. Full PDF requires Puppeteer/WeasyPrint — deferred to DESIGNER.8. |
| Security review uses lazy `require()` | To avoid circular module dependency between `security-review.ts` (template-governance) and `visual-template-security-review.ts` (report-designer). This is a known pattern acceptable for server-only code. |
| `employee.last_working_date` and `employee.work_site` bindings | Not added — source columns not confirmed safe in this phase. Deferred. |
| No `ReportTableBlock` | Table rendering for Report Filters mode deferred to DESIGNER.8/9. |

---

## 15. Next Recommended Phase

**REPORT DESIGNER.8 — Runtime UAT Closure & Advanced Table Designer**

Scope candidates:
- Full server-side PDF rendering for visual templates (Puppeteer)
- `ReportTableBlock` for Report Filters tabular data
- `employee.last_working_date` and `employee.work_site` safe binding additions
- Runtime UAT checklist execution and closure sign-off
- Final production hardening for visual template issuance

---

*REPORT DESIGNER.7 is closed. Do not start DESIGNER.8 without explicit phase prompt approval.*

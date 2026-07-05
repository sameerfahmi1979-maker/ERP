# Report Designer UX Plan — Correction Report
## TipTap Rich Text, Multi-Column Layout, Dynamic Module Field Browser

**Phase:** REPORT DESIGNER UX PLAN CORRECTION  
**Date:** 2026-07-04  
**Type:** Planning correction — no implementation code written  
**Author:** Cursor (planning agent)  
**Correction source:** `ChatGPT/CURSOR_PROMPT_REPORT_DESIGNER_UX_PLAN_CORRECTION_TIPTAP_DYNAMIC_MODULE_FIELD_BROWSER.md`

---

## 1. Confirmation: No Implementation Performed

This report covers planning and documentation changes only.

- No application source code was modified.
- No TypeScript files were created or edited.
- No database migration was created or applied.
- No npm dependency was installed.
- No TipTap package was installed.
- `tsc --noEmit` and `npm run build` were not required (no runtime code changed).

---

## 2. Files Read

| File | Purpose |
|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Full SOT context, phase tracker, Report Designer closure summary |
| `ChatGPT/CURSOR_PROMPT_REPORT_DESIGNER_UX_PLAN_CORRECTION_TIPTAP_DYNAMIC_MODULE_FIELD_BROWSER.md` | Correction instructions from Sameer |
| `src/lib/report-designer/binding-registry.ts` | Current ERP_BINDING_REGISTRY — 30 allowlisted paths across 4 namespaces |
| `src/lib/report-designer/types.ts` | Current block types — 11 block types in union |
| `src/lib/report-designer/constants.ts` | REPORT_DESIGNER_BLOCK_TYPES, PERMITTED_FONT_FAMILIES, MAX_BLOCK_TEXT_LENGTH, etc. |
| `implementation_Review/Reports/REPORT_DESIGNER_9_FINAL_ROLLOUT_ADVANCED_FORMAT_SUPPORT_IMPLEMENTATION_REPORT.md` | DESIGNER.9 closure context |

---

## 3. Files Modified

| File | Change |
|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Updated `Last updated` line; replaced "CLOSED — wait for next priority" with UX roadmap section; added Future Module Update Rule |
| `implementation_Review/Reports/REPORT_DESIGNER_UX_IMPROVEMENT_PLAN.md` | **New file** — full corrected plan (supersedes discarded earlier draft) |

---

## 4. Sameer's Decisions Captured

| Decision | What was corrected |
|---|---|
| Multi-column layout must support ALL zones (Header, Body, Footer) | Previous draft was footer-only |
| TipTap rich text is REQUIRED in UX.1 | Previous draft deferred TipTap to DESIGNER.12 |
| Dynamic module field browser is REQUIRED in UX.2 | Previous draft deferred to a future "REPORT BUILDER" series |
| Registry must be expandable for future ERP modules | Previous draft had no onboarding contract for new modules |
| Sensitive fields are restricted-by-default, NOT permanently blocked | Previous draft said salary/IBAN/medical are "permanently excluded" |
| Raw HTML / CSS / JavaScript remains permanently blocked regardless of permission | Confirmed and preserved |
| QR link rule preserved unchanged | Test/preview never creates real QR/public links |
| Future module update rule is mandatory for all new module implementations | New rule — not in previous draft |

---

## 5. Corrections Made to the Plan

### 5.1 Multi-Column Layout

**Previous:** Footer-only "Footer Strip" block with Sig/Stamp/QR fixed.

**Corrected:** General-purpose `ColumnStripBlock` usable in Header, Body, and Footer zones.

Key design decisions in the corrected plan:
- Fixed slot approach (v1) rather than arbitrary nested Puck blocks — keeps security surface small
- Layouts: `equal`, `left-wide`, `right-wide`, `2-col`, `3-col`
- Child blocks per slot: limited to single permitted block (no nesting, no `ReportTableBlock` in slots)
- Maps to new `ExecutiveLedgerColumnSection` in EL types/renderer
- No raw CSS from user props

### 5.2 TipTap

**Previous:** Deferred to DESIGNER.12 (optional, after structured props in DESIGNER.10).

**Corrected:** Required in UX.1.

Key design decisions:
- Storage: ProseMirror JSON — not raw HTML
- `bindingToken` custom node for `{{path}}` token insertion
- Allowed: bold, italic, underline, text color (safe hex), font size (8–36px), lists, alignment
- Blocked: raw HTML node, Link (deferred), Image, code blocks, iframes, scripts, embeds
- Paste sanitization required
- `BodyTextSectionBlock.richContent` replaces plain `content` string (with backward compat)

### 5.3 Dynamic Module Field Browser

**Previous:** Deferred to a future "REPORT BUILDER" series.

**Corrected:** Required in UX.2.

Key design decisions:
- Controlled `ReportFieldRegistry` — not automatic DB column scanning
- Registry entries include: module_code, entity_code, field_path, field_label, data_type, sensitivity_level, required_permission, allowed_template_types, resolver_key, sample_value, is_active, is_planned
- TypeScript-backed first (not DB-backed)
- Field picker UI grouped by module/entity with search
- Restricted fields show lock badge with explanation

### 5.4 Sensitive Field Rule

**Previous:** "Permanently blocked regardless of request — governance decision, not technical."

**Corrected:**

```
Sensitive fields are blocked by default.
They may be printed in official outputs when ALL of the following gates pass:
1. User has required_permission (e.g. reports.sensitive_fields.use)
2. Template type is in the field's allowed_template_types list
3. Template is approved/published via governance
4. Security review passes
5. Output mode is "official" (not preview/test)
6. Preview/test mode shows *** masked placeholder
7. Usage is recorded in audit_logs
```

Raw HTML/CSS/JavaScript remains permanently blocked even for authorized users.

### 5.5 Future Module Update Rule (New)

A standing rule is now codified in the SOT:

> Whenever a new ERP module is implemented or significantly enhanced, the implementation phase MUST review whether the module needs Report Designer field registry support. If yes, it must add allowlisted fields, resolver keys, sample values, sensitivity classification, security review coverage, and SOT update.

---

## 6. Updated Phase Roadmap

| Phase | Title | Status |
|---|---|---|
| REPORT DESIGNER UX.1 | TipTap Rich Text + Multi-Column Layout Foundation | PLANNED |
| REPORT DESIGNER UX.2 | Dynamic Expandable Module Field Registry and Field Picker | PLANNED |
| REPORT DESIGNER UX.3 | Restricted/Sensitive Field Governance and Official Output Controls | PLANNED |

The phases must be sequential. They must not be merged unless Sameer/Dina explicitly accept the risk.

---

## 7. Source of Truth Changes Made

### Header / Last Updated

```
Before: 2026-07-03 (REPORT DESIGNER.9 — Final Rollout — CLOSED / PASS — DESIGNER SERIES CLOSED)
After:  2026-07-04 (REPORT DESIGNER UX ROADMAP — Planning/Correction — UX.1/UX.2/UX.3 PLANNED)
```

### Last Recommended Phase (line ~979)

```
Before: "REPORT DESIGNER SERIES CLOSED — wait for next approved ERP priority from Sameer/Dina."
After:  Full UX roadmap section with:
        - Phase table (UX.1, UX.2, UX.3) with PLANNED status
        - UX.1/UX.2/UX.3 summaries
        - Corrected sensitive field rule
        - Future Module Update Rule (standing rule with examples)
```

---

## 8. Open Questions for Sameer/Dina

These are preserved from the plan document and require answers before UX.1 implementation starts.

| # | Question | Proposed Default |
|---|---|---|
| 1 | ColumnStripBlock slots: any permitted block, or curated subset only? | Curated subset (KV Section, Logo, Signatory, Stamp, QR) |
| 2 | TipTap link support in v1? | Defer — no links in v1 formal documents |
| 3 | Global sensitive field permission code? | `reports.sensitive_fields.use` |
| 4 | Template types allowed for salary fields? | `salary_certificate`, `offer_letter` |
| 5 | Template types allowed for passport/EID fields? | `government_forms`, `visa_letter` |
| 6 | Template types allowed for medical data? | `medical_fitness_letter` |
| 7 | Registry storage: TypeScript-backed or DB-backed? | TypeScript-backed first |
| 8 | End of service date — authoritative source column? | Needs DB confirmation |
| 9 | Employee mobile number sensitivity level? | `internal` (acceptable in formal letters) |
| 10 | Phase approval: sequential individually or batch approval? | Sequential, individually approved |

---

## 9. Implementation Files That Will Be Touched (When UX.1 Starts)

These files will need modification in the UX.1 implementation phase. **Not modified now.**

| File | Expected change |
|---|---|
| `src/lib/report-designer/types.ts` | Add `ColumnStripBlock` type; update `BodyTextSectionBlock` for rich content |
| `src/lib/report-designer/constants.ts` | Add `ColumnStripBlock` to `REPORT_DESIGNER_BLOCK_TYPES`; schema version bump |
| `src/lib/report-designer/layout-schema.ts` | Add `ColumnStripBlockSchema`; update `BodyTextSectionBlockSchema` |
| `src/lib/report-designer/visual-template-security-review.ts` | Validate ProseMirror JSON; validate column slot blocks |
| `src/lib/report-designer/layout-to-executive-ledger.ts` | Map `ColumnStripBlock` to `ExecutiveLedgerColumnSection` |
| `src/lib/executive-ledger/types.ts` | Add `ExecutiveLedgerColumnSection` |
| `src/lib/executive-ledger/html-renderer.ts` | Add `renderColumnSection()`; render rich text JSON |
| `src/features/report-designer/blocks/` | New `column-strip-block.tsx`; update `body-text-section-block.tsx` |
| `src/features/report-designer/puck/report-designer-puck-config.tsx` | Register new block |
| `package.json` / lockfile | TipTap package installation |

---

*No implementation was performed. This report documents planning decisions and corrections only.*

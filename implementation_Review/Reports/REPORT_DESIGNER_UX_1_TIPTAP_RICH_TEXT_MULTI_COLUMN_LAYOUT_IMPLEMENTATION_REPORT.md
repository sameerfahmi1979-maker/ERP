# REPORT DESIGNER UX.1 — Implementation Report
## TipTap Rich Text + Multi-Column Layout Foundation

**Status:** CLOSED / PASS  
**Date:** 2026-07-04  
**Phase:** REPORT DESIGNER UX.1

---

## 1. Overview

Implements the first UX improvement phase of the Report Designer:

1. **Part A** — Safe TipTap rich text editing for `BodyTextSectionBlock`, with server-side ProseMirror JSON renderer.
2. **Part B** — Controlled multi-column layout block (`ColumnStripBlock`) usable in Header, Body, and Footer zones, with Executive Ledger integration.
3. **Part C** — Security review, schema, and mapper extensions.
4. **Schema version bump** — from `1` to `2` (backward compatible, old layouts still parse).

---

## 2. Files Read

| File | Purpose |
|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | SOT — current phase state |
| `.cursor/rules/algt-erp-source-of-truth.mdc` | Global ERP rules |
| `implementation_Review/Reports/REPORT_DESIGNER_UX_IMPROVEMENT_PLAN.md` | Corrected UX plan |
| `implementation_Review/Reports/REPORT_DESIGNER_UX_PLAN_CORRECTION_*.md` | Correction report |
| `src/lib/report-designer/types.ts` | Current block type definitions |
| `src/lib/report-designer/constants.ts` | Schema version + block types |
| `src/lib/report-designer/layout-schema.ts` | Zod validation schemas |
| `src/lib/report-designer/visual-template-security-review.ts` | Security review engine |
| `src/lib/report-designer/layout-to-executive-ledger.ts` | Block-to-EL mapper |
| `src/lib/executive-ledger/types.ts` | EL section types |
| `src/lib/executive-ledger/html-renderer.ts` | EL HTML renderer |
| `src/features/report-designer/blocks/*` | All block components |
| `src/features/report-designer/puck/*` | Puck config and types |
| `src/lib/report-designer/binding-registry.ts` | ERP binding allowlist |

---

## 3. Files Created

| File | Purpose |
|---|---|
| `src/lib/report-designer/prosemirror-renderer.ts` | Server-side ProseMirror JSON → safe HTML |
| `src/features/report-designer/blocks/report-designer-rich-text-editor.tsx` | TipTap editor React component (client-only) |
| `src/features/report-designer/blocks/column-strip-block.tsx` | ColumnStripBlock Puck component + config |

---

## 4. Files Modified

| File | Change |
|---|---|
| `src/lib/report-designer/types.ts` | Added `ProseMirrorDocJson`, `richContent` to `BodyTextSectionBlock`, `ColumnStripSlot`, `ColumnStripBlock`; bumped `CURRENT_LAYOUT_SCHEMA_VERSION` → 2 |
| `src/lib/report-designer/constants.ts` | Bumped `REPORT_DESIGNER_SCHEMA_VERSION` → 2; added `ColumnStripBlock` to `REPORT_DESIGNER_BLOCK_TYPES` |
| `src/lib/report-designer/layout-schema.ts` | Added `richContent` field schema to `BodyTextSectionBlockSchema`; added `ColumnStripSlotSchema` + `ColumnStripBlockSchema`; registered in discriminated union |
| `src/lib/report-designer/visual-template-security-review.ts` | Added `validateBindingsInRichContent()`; added `BodyTextSectionBlock` richContent deep validation; added `ColumnStripBlock` slot/layout validation |
| `src/lib/report-designer/layout-to-executive-ledger.ts` | Added `renderProseMirrorDocToHtml` import; updated `mapBodyTextSection` to handle `richContent`; added `mapColumnStripSlot` + `mapColumnStripBlock`; registered `ColumnStripBlock` case in `processZone` |
| `src/lib/executive-ledger/types.ts` | Added `richHtml?` to `ExecutiveLedgerBodySection`; added `ExecutiveLedgerColumnSlot`; added `ExecutiveLedgerColumnSection`; updated `ExecutiveLedgerSection` union |
| `src/lib/executive-ledger/html-renderer.ts` | Imported `ExecutiveLedgerColumnSection` + `ExecutiveLedgerColumnSlot`; updated `renderBodySection` to use `richHtml` when present; added `renderColumnSlot` + `renderColumnSection`; registered `column` case in `renderSection` |
| `src/features/report-designer/blocks/body-text-section-block.tsx` | Replaced plain textarea with TipTap `richContent` custom field; added `richContent` prop; canvas shows ✦ Rich Text indicator |
| `src/features/report-designer/blocks/index.ts` | Exported `columnStripBlockConfig` + `ColumnStripBlockProps` |
| `src/features/report-designer/puck/report-designer-puck-types.ts` | Added `ColumnStripBlockProps` to component map |
| `src/features/report-designer/puck/report-designer-puck-config.tsx` | Registered `ColumnStripBlock` component |

---

## 5. Dependencies Installed

```
@tiptap/react              — React bindings for TipTap editor
@tiptap/starter-kit        — Bold, italic, lists, paragraph, hardBreak, etc.
@tiptap/extension-underline — Underline mark
@tiptap/extension-text-style — TextStyle mark (base for custom font attributes)
@tiptap/extension-color    — Text color via textStyle
@tiptap/extension-text-align — textAlign attribute for paragraphs
```

**npm audit result:** 8 vulnerabilities (6 moderate, 2 high) — same count as before TipTap install. **Zero new vulnerabilities introduced by TipTap packages.**

---

## 6. TipTap Architecture Summary

### Storage Format
- Rich text stored as **ProseMirror JSON** in `BodyTextSectionBlock.props.richContent`.
- Legacy `content: string` field remains present and required for backward compatibility.
- When `richContent` is present and valid, it takes priority in the server-side renderer.
- When `richContent` is absent, the legacy `content` string rendering is used exactly as before.

### Custom `FontSize` Extension
- Defined inline in `report-designer-rich-text-editor.tsx` using `Extension.create()`.
- Extends `textStyle` mark attributes to include `fontSize` (integer 8–36).
- No additional npm packages required — built on the already-installed `@tiptap/extension-text-style`.

### Extensions Enabled
| Extension | Purpose |
|---|---|
| `StarterKit` (partial) | Bold, italic, bulletList, orderedList, hardBreak, paragraph, text |
| `Underline` | Underline mark |
| `TextStyle` | Base for custom text attributes |
| `FontSize` | Custom: fontSize attribute 8–36px |
| `Color` | Hex color attribute via textStyle |
| `TextAlign` | textAlign on paragraphs (left/center/right/justify) |

### Extensions Explicitly Disabled / Blocked
`heading`, `blockquote`, `code`, `codeBlock`, `horizontalRule`, `strike` (via StarterKit.configure), plus Link, Image, CodeBlock, HorizontalRule, Strike never installed.

### Binding Token Approach (v1)
- Users type `{{binding.path}}` manually as plain text inside TipTap.
- No custom `bindingToken` node in UX.1 — deferred to UX.2 field picker.
- Security review recursively validates all text node content for binding paths.
- Unresolved tokens are preserved as `{{path}}` in the output (visible in preview).

---

## 7. Allowed / Blocked Node and Mark List

### Allowed Nodes
`doc`, `paragraph`, `text`, `hardBreak`, `bulletList`, `orderedList`, `listItem`

### Allowed Marks
`bold`, `italic`, `underline`, `textStyle`

### Allowed Attributes
| Attribute | Validation |
|---|---|
| `paragraph.attrs.textAlign` | Enum: `left \| center \| right \| justify` |
| `textStyle.attrs.fontSize` | Integer 8–36 only |
| `textStyle.attrs.color` | Hex regex `^#[0-9a-fA-F]{6}$` only |

### Permanently Blocked (ignored by renderer, rejected by security review)
Raw HTML nodes, `<script>`, `<iframe>`, `<object>`, `<embed>`, `<applet>`, `<style>`, Link extension, Image extension, CodeBlock, Code mark, Blockquote, HorizontalRule, Strike, `javascript:`, `data:`, `file:` protocols, arbitrary pasted HTML attributes.

---

## 8. Rich Text Storage and Rendering

### Editor → Storage
1. TipTap editor in Puck property panel produces ProseMirror JSON.
2. `richContent` field stores the JSON directly.
3. `content` (legacy plain text) remains for backward compat.

### Rendering Path
1. `layout-to-executive-ledger.ts`: checks `richContent`, calls `renderProseMirrorDocToHtml()`.
2. `prosemirror-renderer.ts`: walks nodes/marks, applies escaping, resolves `{{...}}` tokens.
3. Result stored in `ExecutiveLedgerBodySection.richHtml`.
4. `html-renderer.ts`: when `richHtml` is present, injects it directly (instead of `elTextToParagraphs(content)`).
5. The `richHtml` is ONLY set by `layout-to-executive-ledger.ts`, never from user props.

### Fallback
- Old templates with no `richContent` → `content` string path unchanged.
- Existing EL documents without `richHtml` → body renderer falls back to `elTextToParagraphs(content)`.

---

## 9. ColumnStripBlock Architecture Summary

### Design Choice: Curated Fixed Slots
- Used curated flat slot model (`leftSlot`, `centerSlot`, `rightSlot`) instead of arbitrary nested Puck zones.
- Each slot has `contentType` (enum) + type-specific props (flat).
- Works reliably with Puck's `type: "object"` field — no custom render logic needed for prop editing.
- No nested ColumnStripBlocks allowed.
- No BrandingHeaderBlock or ReportTableBlock inside slots (full-width only).

### Layout Presets (CSS flex)
| Preset | Left | Center | Right |
|---|---|---|---|
| `equal` / `2-col` | 50% | — | 50% |
| `left-wide` | 70% | — | 30% |
| `right-wide` | 30% | — | 70% |
| `3-col` | 33% | 34% | 33% |

All widths generated from code — no user CSS strings.

### Slot Content Types
| contentType | Maps to |
|---|---|
| `none` | Empty slot (omitted from output) |
| `logo` | Company logo image from branding context |
| `heading` | `ExecutiveLedgerBodySection` (title only) |
| `text` | `ExecutiveLedgerBodySection` with resolved content |
| `key_value` | `ExecutiveLedgerKeyValueSection` (single row) |
| `signatory` | Pre-rendered trusted HTML (name + signature image) |
| `stamp` | Pre-rendered trusted HTML (stamp image) |
| `qr` | Pre-rendered trusted HTML (QR placeholder) |

### Typical Use Cases
- **Footer**: Signatory + Stamp + QR Code (3-col preset)
- **Header**: Company Logo + Document Title (left-wide preset)
- **Body**: Employee KV fields + Document Details (equal 2-col)

---

## 10. Security Review Behavior

### BodyTextSectionBlock with richContent
- Checks `richContent.type === "doc"` 
- Checks JSON payload size (max ~65KB)
- Scans all nodes recursively with `scanJsonObject()` for unsafe patterns
- Calls `validateBindingsInRichContent()` to validate `{{path}}` tokens in text nodes
- If `richContent` contains unknown binding paths → `warning` finding
- If `richContent` contains sensitive binding fragments → `block` finding

### ColumnStripBlock
- Validates `layout` is one of the 5 allowed presets
- Validates no blocked content types (`BrandingHeaderBlock`, `ReportTableBlock`, `ColumnStripBlock`) in any slot
- Scans all slot props recursively with `scanJsonObject()`
- Validates any `kvBinding` path against the binding registry
- Any text content in slots is scanned for binding validity

---

## 11. Test Mode Behavior

All existing test modes continue to work unchanged:
- Sample Data mode → `buildSampleBindingValues()` populates `{{...}}` tokens
- Employee Record mode → live DB values populate tokens
- Company Context mode → company binding values
- Report Filters mode → preview rows for ReportTableBlock

`richContent` is rendered in all modes: the ProseMirror renderer receives whatever `bindingValues` map the test mode provides.

---

## 12. Side-Effect Prevention Proof

Security grep confirms:
- **Zero** `erp_report_runs` writes in test/preview paths.
- **Zero** `erp_output_public_links` writes in test/preview paths.
- **Zero** `erp_report_delivery_logs` writes in test/preview paths.
- **Zero** `queueEmail`/`sendEmail` writes in test/preview paths.
- **Zero** `dangerouslySetInnerHTML` in any React component — all matches are doc comments.
- **Zero** service_role usage in `src/features/report-designer`.

`onerror=` present only in trusted server-generated image fallback HTML (same pattern as pre-existing `html-renderer.ts`).

---

## 13. Security Grep Results

```
1. dangerouslySetInnerHTML: ZERO actual uses — all matches are doc comment strings only.
2. erp_output_public_links: Only in public-verification.ts (gated, production path) and deny-list comments.
3. erp_report_runs/email: Only in runner.ts and schedules.ts (production paths). Zero in preview/test paths.
4. service_role in report-designer features: ZERO matches.
5. <script|<iframe|onerror: 
   - <iframe: only in srcDoc preview panels (approved path).
   - onerror: only in server-generated image fallback HTML (trusted code, pre-existing pattern).
   - javascript: only in UNSAFE_PROTOCOL_PATTERN deny-list regex.
```

---

## 14. TypeScript Result

```
npx tsc --noEmit → Exit code 0 — No errors.
```

---

## 15. Build Result

```
npm run build → Exit code 0 — Compiled successfully in 21.4s.
All 175+ routes generated. No build errors or warnings related to UX.1.
```

---

## 16. Known Limitations

1. **Binding field picker (UX.1 limitation)**: Users must manually type `{{binding.path}}` tokens in TipTap. The dynamic field browser (module-grouped picker) is planned for UX.2.
2. **Canvas rich text preview**: The Puck canvas shows a plain text fallback + "✦ Rich Text" indicator, not the formatted output. Formatted output is visible only in the test/formal preview iframes.
3. **Column slot key-value**: Only supports a single KV field per slot. For multi-field KV, use a dedicated `KeyValueSectionBlock` instead.
4. **Logo/stamp/signature in column slots**: These render from the current branding profile. If no logo/stamp URL is resolved, the slot is empty.
5. **RTL support in richContent**: TipTap `textAlign` can set RTL visually, but the `language` prop for automatic RTL direction is not propagated into the rich renderer in UX.1. This is a known limitation — UX.2 will address.
6. **fontFamily per-block**: Not implemented in UX.1. Font family is set at document level only (via layout root props).

---

## 17. Next Recommended Phase

**REPORT DESIGNER UX.2 — Dynamic Field Registry Browser**

UX.2 introduces:
- `ReportFieldRegistry` — module-grouped, sensitivity-classified field registry
- Dynamic field picker in the Puck property panel (replaces manual `{{path}}` typing)
- TipTap `bindingToken` custom node (inline chip display)
- Expandable module support (HR, Finance, Operations, etc.)

> Prerequisite: UX.1 must be stable in production for at least 1 sprint before UX.2 starts.

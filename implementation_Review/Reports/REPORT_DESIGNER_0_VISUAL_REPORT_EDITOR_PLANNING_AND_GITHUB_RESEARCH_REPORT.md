# REPORT DESIGNER.0
## Visual Reports Editor — Planning, Architecture Audit, GitHub Research & Implementation Roadmap

**Phase:** REPORT DESIGNER.0 — Planning and Architecture Audit  
**Date:** 2026-07-03  
**Author:** AI Planning Agent  
**Status:** DRAFT — Awaiting Sameer review and approval before any implementation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Audit](#2-current-architecture-audit)
3. [Database Schema Audit](#3-database-schema-audit)
4. [Current UI Limitation Analysis](#4-current-ui-limitation-analysis)
5. [Target Workflow](#5-target-workflow)
6. [GitHub/Web Research Comparison](#6-githubweb-research-comparison)
7. [Recommended Library](#7-recommended-library)
8. [Alternative Options and Rejection Reasons](#8-alternative-options-and-rejection-reasons)
9. [Proposed UI/UX Design](#9-proposed-uiux-design)
10. [Proposed Data Model](#10-proposed-data-model)
11. [Proposed Visual Layout JSON Schema](#11-proposed-visual-layout-json-schema)
12. [Proposed ERP Block Library](#12-proposed-erp-block-library)
13. [Proposed Data-Binding Registry](#13-proposed-data-binding-registry)
14. [Proposed Safe Renderer Architecture](#14-proposed-safe-renderer-architecture)
15. [Governance Integration Plan](#15-governance-integration-plan)
16. [Security Model](#16-security-model)
17. [MCP / API / Tooling Requirements](#17-mcp--api--tooling-requirements)
18. [Detailed Implementation Phases](#18-detailed-implementation-phases)
19. [Risks and Mitigation](#19-risks-and-mitigation)
20. [Final Recommendation](#20-final-recommendation)

---

## 1. Executive Summary

The ALGT ERP currently has a solid report execution pipeline (REPORT.2–REPORT.5) and a mature branding/template governance system (BRANDING.1–BRANDING.9). However, template design today requires developer code changes — there is no in-app visual editor. Users can only configure show/hide toggles and metadata; the actual letter/report layout is fixed in code (the Executive Ledger engine).

This planning phase evaluates and recommends a **Visual Reports Editor** — a drag-and-drop, block-based template designer that integrates with the existing governance workflow, branding system, and Executive Ledger renderer. The goal is a controlled, ERP-safe designer that allows authorized users to create and modify document templates without writing code.

**Key findings:**

- The existing `erp_report_templates` table already has `body_layout_json`, `header_layout_json`, `footer_layout_json`, and `style_json` columns anticipating this feature — these are currently unused `NULL`.
- The Executive Ledger engine (`src/lib/executive-ledger/`) is the canonical output renderer. Any visual editor must produce JSON that maps to `ExecutiveLedgerDocument` format, not raw HTML.
- **Puck** (`puckeditor/puck`) is the recommended library: MIT, React-native, JSON output, fully customizable component system, no vendor lock-in, actively maintained (12,900+ stars, v0.21.2 April 2026).
- The implementation should be phased across 9 phases (REPORT DESIGNER.1–.9), each independently shippable and reversible.
- Governance gate must remain: only `approved` or `published` templates can be used for official output or QR verification.

---

## 2. Current Architecture Audit

### 2.1 Report System Layers

The current report system has five distinct layers:

```
Layer 1 — Registry (DB)
  erp_report_registry — what reports exist, permissions, branding strategy, filter/column schemas

Layer 2 — Fetcher (Code)
  src/lib/report-center/report-fetchers.ts — REPORT_FETCHERS dispatch map (28 report codes)
  Each fetcher: async (filters, permissionCodes) → ReportDataResult

Layer 3 — Template / Branding (DB + Code)
  erp_report_templates — metadata, show/hide flags, layout JSON (currently unused)
  erp_report_branding_profiles — company identity, assets, theme colors
  erp_branding_assets — new unified asset storage (BRANDING.1)
  resolveTemplatePreview() — maps template + profile → ExportBrandingContext

Layer 4 — Executive Ledger (Code)
  src/lib/executive-ledger/ — builds ExecutiveLedgerDocument + renders to A4 HTML
  src/features/executive-ledger/ — preview components (iframe-based)

Layer 5 — Output
  PDF export (browser print API), Excel, CSV, Email, Public QR verification
```

### 2.2 Executive Ledger Document Model

The current formal output model (`ExecutiveLedgerDocument`) supports these section types:

| Section Type | Content |
|---|---|
| `body` | Multi-paragraph text, EN/AR/bilingual |
| `key_value` | Label+value rows (the primary HR letter format) |
| `table` | Headers + rows + optional totals |
| `divider` | Visual separator with optional label |

The renderer (`renderExecutiveLedgerHtml`) produces print-ready A4 HTML. It is server-safe, XSS-hardened, and uses `ExportBrandingContext` (pre-resolved signed URLs, never raw Supabase paths).

**Critical insight:** The visual editor must produce JSON that resolves to `ExecutiveLedgerDocument` — not raw HTML. The renderer remains the single rendering authority. The editor is a visual way to compose the document model.

### 2.3 Template Governance System

From BRANDING.7–BRANDING.8, the governance lifecycle is fully implemented:

```
draft → in_review → approved → published → archived
                 ↓
             rejected → (back to draft)
```

- `submitted_at/by`, `approved_at/by`, `rejected_at/by`, `published_at/by`, `archived_at/by` — all in DB
- `security_review_status`: `pending | passed | failed | skipped`
- `erp_report_template_events` — full audit trail
- `parent_template_id` — version chain support
- `createTemplateDraftVersion` — creates new draft from approved/published (immutable once approved)

### 2.4 Current Template Form Capabilities

`TemplateForm` (CRUD via ERPChildDialogForm) allows editing:

- `template_name`, `template_code`, `template_type`
- `branding_profile_id` (combobox)
- `default_orientation`, `page_size`, `font_family`, `language_mode`
- `show_logo`, `show_small_logo`, `show_address`, `show_trn`, `show_license`
- `show_signatory`, `show_stamp`, `show_watermark`, `watermark_text`
- `is_default`, `is_active`

**Not editable in UI:** `body_layout_json`, `header_layout_json`, `footer_layout_json`, `style_json`, `body_html_en/ar`, `custom_css`.

### 2.5 Navigation and RBAC

Current Reports sidebar:
- Report Center → `/admin/reports`
- Templates & Branding → `/admin/reports/templates`
- Report History → `/admin/reports/history`
- Report Schedules → `/admin/reports/schedules`

Current `reports.*` permissions:
`reports.view`, `reports.manage`, `reports.run`, `reports.export`, `reports.sign`, `reports.publish`, `reports.template.approve`, `reports.history.view`, `reports.schedule.view/manage`, `reports.verify.admin`, `reports.column_profiles.manage`, `reports.email`

---

## 3. Database Schema Audit

### 3.1 `erp_report_templates` — Full Column Inventory

| Column | Type | Status | Purpose |
|---|---|---|---|
| `id` | bigint PK | Active | — |
| `template_code` | text NOT NULL | Active | Unique code |
| `template_name` | text NOT NULL | Active | Display name |
| `template_type` | text NOT NULL | Active | letter/certificate/report/etc |
| `branding_profile_id` | bigint FK | Active | Links to profile |
| `default_orientation` | text | Active | portrait/landscape |
| `page_size` | text | Active | A4/A3/Letter |
| `font_family` | text | Active | Font selector |
| `language_mode` | text | Active | en/ar/bilingual |
| `show_logo` | boolean | Active | Toggle |
| `show_small_logo` | boolean | Active | Toggle |
| `show_address` | boolean | Active | Toggle |
| `show_trn` | boolean | Active | Toggle |
| `show_license` | boolean | Active | Toggle |
| `show_signatory` | boolean | Active | Toggle |
| `show_stamp` | boolean | Active | Toggle |
| `show_watermark` | boolean | Active | Toggle |
| `requires_stamp_permission` | boolean | Active | Security gate |
| `watermark_text` | text | Active | Text watermark |
| `body_html_en` | text | **UNUSED — NULL** | Legacy HTML body |
| `body_html_ar` | text | **UNUSED — NULL** | Legacy HTML body AR |
| `custom_css` | text | **UNUSED — NULL** | Legacy CSS |
| `header_layout_json` | jsonb | **UNUSED — NULL** | **Future visual editor** |
| `footer_layout_json` | jsonb | **UNUSED — NULL** | **Future visual editor** |
| `body_layout_json` | jsonb | **UNUSED — NULL** | **Future visual editor** |
| `style_json` | jsonb | **UNUSED — NULL** | **Future visual editor** |
| `version_no` | integer | Active | Version tracking |
| `is_default` | boolean | Active | Default flag |
| `is_active` | boolean | Active | Active flag |
| `parent_template_id` | bigint FK | Active | Version chain |
| `governance_status` | text NOT NULL | Active | Governance lifecycle |
| `submitted_at/by` | timestamp/bigint | Active | Governance audit |
| `approved_at/by/notes` | timestamp/bigint/text | Active | Governance audit |
| `rejected_at/by/reason` | timestamp/bigint/text | Active | Governance audit |
| `published_at/by` | timestamp/bigint | Active | Governance audit |
| `archived_at/by/reason` | timestamp/bigint/text | Active | Governance audit |
| `security_review_status` | text NOT NULL | Active | Security review |
| `security_review_notes/at/by` | text/timestamp/bigint | Active | Security review audit |
| `created/updated/deleted` | timestamps + FKs | Active | Standard audit |

**Key observation:** The schema already anticipates visual layout storage via `header_layout_json`, `body_layout_json`, `footer_layout_json`, and `style_json`. No new columns are needed for the visual editor layout storage — only data model definition work is required.

### 3.2 Governance Tables

- `erp_report_template_events` — `template_id`, `event_type`, `actor_user_profile_id`, `occurred_at`, `payload_json`, `notes` — complete audit trail per template

### 3.3 Public Links

- `erp_output_public_links` — `template_id` FK is required for letter/certificate/form issuance. Visual editor templates must pass the governance gate before being usable here.

### 3.4 RLS Policies

- `erp_report_templates` — RLS enforced; service role (admin client) used for all server actions
- All mutations checked against `reports.manage`, `reports.template.approve`, `reports.publish` permissions
- Visual editor mutations must route through server actions — never direct client DB access

---

## 4. Current UI Limitation Analysis

| Capability | Current State | Gap |
|---|---|---|
| View templates | ✅ Table with governance badges | — |
| Edit template metadata | ✅ ERPChildDialogForm | — |
| Edit show/hide toggles | ✅ TemplateForm | — |
| Design letter body visually | ❌ Not possible | **Core gap** |
| Add/remove/reorder sections | ❌ Not possible | **Core gap** |
| Drag and drop blocks | ❌ Not possible | **Core gap** |
| Place ERP data fields | ❌ Not possible | **Core gap** |
| Place logo, QR, stamp visually | ❌ Only toggles | **Core gap** |
| A4 canvas preview | ❌ Only live Executive Ledger preview | Gap |
| Style text (color, size, bold) | ❌ Not possible | Gap |
| Two/three-column layout | ❌ Fixed key_value only | Gap |
| Table blocks | ❌ Fixed table section type | Gap |
| Preview with real data | ✅ Via LetterPreviewDialog | Partial |
| Governance workflow | ✅ Full submit/approve/publish | — |
| Version management | ✅ Create new draft version | — |
| QR issuance gating | ✅ Requires approved/published | — |

---

## 5. Target Workflow

```
Reports Editor (single new menu item)
├── List — all templates with governance status filter
├── Create new template
│   ├── 1. Enter metadata (template_code, name, type, branding, page settings)
│   ├── 2. Save as draft
│   ├── 3. Click "Open Visual Editor"
│   ├── 4. Drag/drop ERP blocks onto A4 canvas
│   ├── 5. Bind ERP data fields to data blocks
│   ├── 6. Preview with sample data
│   ├── 7. Save draft (auto-saves body_layout_json)
│   ├── 8. Submit for review
│   └── → Governance workflow (approve → publish)
├── Edit draft template
│   └── Same as above from step 3
├── View approved/published template
│   ├── View-only visual editor (read mode)
│   └── "Create New Version" for edits
└── Governance queue link → /admin/reports/templates/governance
```

---

## 6. GitHub/Web Research Comparison

| Criteria | **Puck** | **GrapesJS** | **Craft.js** | **pdfme** | **ReportBro** | **Carbone** |
|---|---|---|---|---|---|---|
| **GitHub URL** | [puckeditor/puck](https://github.com/puckeditor/puck) | [GrapesJS/grapesjs](https://github.com/GrapesJS/grapesjs) | [prevwong/craft.js](https://github.com/prevwong/craft.js) | [pdfme/pdfme](https://github.com/pdfme/pdfme) | [jobsta/reportbro-designer](https://github.com/jobsta/reportbro-designer) | [carboneio/carbone](https://github.com/carboneio/carbone) |
| **Stars (Jul 2026)** | ~12,900 | ~25,670 | ~12,000 | ~4,437 | ~1,600 | ~3,200 |
| **License** | MIT | BSD-3-Clause | MIT | MIT | **Dual: GPL/Commercial** | AGPL + Commercial |
| **Activity** | Active — v0.21.2 Apr 2026 | Active — v0.23.2 Jun 2026 | Low — last commit 2024 | Active — 2026 | Active (Python-focused) | Active |
| **React/Next.js** | ✅ Native React | ⚠️ Client-only, needs `dynamic({ ssr: false })` | ✅ React framework | ⚠️ Vanilla JS designer, React gen | ❌ Vanilla JS plugin | ❌ Node.js/any |
| **TypeScript** | ✅ Full TS (66.8%) | ✅ Full TS (90.9%) | ✅ Full TS | ✅ Full TS | ❌ ES6 JS only | ⚠️ Partial |
| **Drag/drop** | ✅ Built-in | ✅ Built-in | ✅ Built-in | ✅ Coordinate-based | ✅ Built-in | ❌ Word/Excel template |
| **Layout JSON output** | ✅ Clean JSON, your schema | ⚠️ Outputs HTML/CSS (not JSON) | ✅ Serializable JSON state | ✅ JSON schemas | ✅ JSON definition | ✅ Template variables |
| **Custom ERP components** | ✅ Define any React component as block | ⚠️ Define JS blocks, limited React | ✅ Any React component | ⚠️ Fixed element types | ⚠️ Fixed element types | ❌ No component concept |
| **Restrict unsafe behavior** | ✅ You control allowed blocks entirely | ⚠️ Requires custom plugin to restrict | ✅ You define allowed components | ✅ Schema-based, limited types | ⚠️ Allows JS expressions | ❌ Template injection risk |
| **Data binding** | ✅ Via custom components | ⚠️ Via GrapesJS variables | ✅ Via component props | ⚠️ Via input fields only | ✅ Parameter binding | ✅ Marker syntax `{d.field}` |
| **Print/PDF friendly** | ✅ Renders to your HTML; use existing EL renderer | ⚠️ HTML/CSS output; prints but not A4-precise | ✅ Same as Puck | ✅ Native PDF generation | ✅ Native PDF/XLSX via Python | ✅ Native DOCX/PDF |
| **Security risks** | Low — you own block definitions | Medium — raw HTML/CSS editing possible | Low — you define components | Low — fixed schema types | Medium — JS expressions allowed | Medium — template injection |
| **Integration complexity** | Low — `npm install @puckeditor/core`, React component | Medium — SSR issues, Backbone.js dependency | High — no built-in UI, build everything | Medium — antd UI design conflict | High — Python backend required | High — different output paradigm |
| **Vendor lock-in** | None — data is your JSON | None — open source | None | Low — MIT | Medium — commercial license | Medium — AGPL |
| **ALGT ERP fit** | ✅ **Excellent** | ⚠️ Possible but costly | ⚠️ Requires enormous UI build | ⚠️ PDF-only, antd conflict | ❌ Python stack, dual license | ❌ Wrong paradigm |
| **Verdict** | **RECOMMENDED** | Possible alternative | Too much build work | PDF sub-use case only | Rejected | Rejected |

### Additional candidates evaluated

| Library | GitHub | Assessment |
|---|---|---|
| **react-page** (react-page/react-page) | ~9k stars, MIT | Similar to Puck but older, less active |
| **Builder.io SDK** | Commercial + open-source core | Overengineered SaaS for ERP use |
| **TipTap Editor** | ~27k stars, MIT | Rich text only, not block/canvas layout |
| **Plate.js** | ~10k stars, MIT | Rich text Slate-based, not document canvas |
| **Blocknote** | ~7k stars, MIT | Notion-style block editor; not A4 canvas |

---

## 7. Recommended Library

### **Puck (`@puckeditor/core`) — RECOMMENDED**

**GitHub:** https://github.com/puckeditor/puck  
**License:** MIT  
**Stars:** ~12,900 (July 2026)  
**Latest:** v0.21.2 (April 2026), actively maintained  
**TypeScript:** Yes (66.8% of codebase)  
**Weekly npm downloads:** ~583,000/mo  

### Why Puck is the right choice

**1. React-native, no SSR workarounds**  
Puck is a React component. In the App Router, add `"use client"` — that's it. No dynamic import with `{ ssr: false }` hacks, no Backbone.js dependency, no 11MB bundle of legacy HTML template engine.

**2. You own the block definitions — perfect for ERP safety**  
Puck requires you to define which components (blocks) are available. You cannot accidentally allow dangerous blocks. Every ERP block (EmployeeField, BrandingLogoBlock, KeyValueSection, etc.) is a controlled React component that you write. Users can only place blocks you explicitly define.

**3. JSON output maps cleanly to ExecutiveLedgerDocument**  
Puck serializes to a structured JSON `Data` object containing an array of blocks with their props. This maps 1:1 to the `ExecutiveLedgerDocument.sections[]` array. The visual editor becomes a graphical way to build the same document model the renderer already understands.

**4. No vendor lock-in**  
The layout JSON is your schema, stored in `body_layout_json`. If Puck is ever abandoned, the renderer still works from the stored JSON — you would just lose the editor UI.

**5. Clean governance integration**  
Draft layout JSON is committed only on explicit "Save Draft" action. `governance_status` stays `draft` until submitted. Approved/published templates render the editor in view-only mode — edit is blocked, only "Create New Version" is offered.

**6. Preview with Executive Ledger**  
The existing `ExecutiveLedgerPreview` (iframe srcdoc) continues to be used for preview. The Puck canvas shows a structural block view; the real preview shows the actual rendered output via the existing EL renderer. This dual-view approach is clean and reuses all existing code.

### Puck integration sketch

```tsx
// REPORT DESIGNER.2 — rough concept only
"use client";
import { Puck, type Config } from "@puckeditor/core";

const erpPuckConfig: Config = {
  components: {
    KeyValueSection: { ... },      // maps to EL key_value section
    BodyTextSection: { ... },      // maps to EL body section
    TableSection: { ... },         // maps to EL table section
    BrandingHeaderBlock: { ... },  // controlled branding header
    DataFieldBlock: { ... },       // single ERP data field
    DividerBlock: { ... },         // maps to EL divider section
  },
};

export function ReportDesignerEditor({ template, onSave }) {
  return (
    <Puck
      config={erpPuckConfig}
      data={template.body_layout_json ?? { content: [], root: {} }}
      onPublish={(data) => onSave(data)}
    />
  );
}
```

---

## 8. Alternative Options and Rejection Reasons

### GrapesJS — Rejected as primary, possible fallback
- **Pro:** 25,670 stars, very mature, powerful plugin ecosystem
- **Con 1:** Designed for HTML/CSS output (web pages), not structured document JSON. Converting GrapesJS HTML to an EL-compatible model is complex and brittle.
- **Con 2:** Backbone.js dependency (`underscore`, `backbone`) is a legacy footgun in a React 18/Next.js app.
- **Con 3:** Client-only restriction requires SSR workaround in App Router.
- **Con 4:** Raw HTML/CSS editing exposes security surface: even with blocks, users can potentially inject raw HTML, unsafe CSS.
- **Verdict:** Could work for a full WYSIWYG HTML editor in a future phase (REPORT DESIGNER.9+) if we want full free-form layout. Too complex for the structured ERP block approach.

### Craft.js — Rejected as primary, useful reference
- **Pro:** Clean React-first architecture, MIT, full TypeScript
- **Con 1:** Zero built-in UI — you build 100% of toolbar, panels, drag handles, property editors. Equivalent to building Puck from scratch.
- **Con 2:** Low activity — last significant commit was 2024.
- **Con 3:** Significantly more implementation work than Puck for the same result.
- **Verdict:** Puck solved the "no built-in UI" problem that makes Craft.js too costly.

### pdfme — Rejected as primary, viable for PDF-only sub-phase
- **Pro:** Native PDF output, WYSIWYG coordinate designer, good TypeScript, MIT
- **Con 1:** Coordinate-based absolute positioning — not compatible with ERP's print/screen/email multi-output model. A coordinate-based PDF template cannot be rendered to screen HTML.
- **Con 2:** Designer UI built with `antd` — major design system conflict with the ERP's Tailwind/Shadcn/Base UI stack.
- **Con 3:** Limited dynamic content support — tables with variable row counts are difficult.
- **Verdict:** Could be introduced in a later phase (REPORT DESIGNER.9) as an **optional PDF-only mode** for fixed-layout documents (ID cards, badges, certificates with exact coordinate placement). Not suitable as the primary editor.

### ReportBro — Rejected
- **License:** Dual GPL/Commercial. Commercial license required for proprietary ERP. Cost and vendor dependency unacceptable.
- **Stack:** Server-side renderer is Python-only (`reportbro-lib`). Incompatible with Next.js/Node.js server actions.
- **Verdict:** Hard reject.

### Carbone — Rejected
- Office document template approach (DOCX/XLSX markers) — fundamentally different paradigm from visual canvas editing.
- AGPL license requires open-sourcing the application unless commercial license purchased.
- No visual canvas.
- **Verdict:** Wrong tool for this problem.

---

## 9. Proposed UI/UX Design

### 9.1 Navigation

Add one new sidebar item under **Reports**:

```
Reports
├── Report Center         (/admin/reports)
├── Templates & Branding  (/admin/reports/templates)
├── Reports Editor        (/admin/reports/editor)   ← NEW
├── Report History        (/admin/reports/history)
└── Report Schedules      (/admin/reports/schedules)
```

Public Links and Template Governance remain accessible via links within Templates & Branding (not sidebar items).

### 9.2 Reports Editor Route Structure

All editor functionality lives under a single workspace module:

```
/admin/reports/editor
  → Workspace tab: "Reports Editor"
  → Lists all templates user can manage (governance_status filter)
  → "New Template" button → opens metadata form → saves → opens visual editor

/admin/reports/editor/[templateId]
  → Workspace tab: "{template_name} — Editor"
  → Full visual editor (Puck canvas) for draft templates
  → View-only mode for approved/published (with "Create New Version" CTA)
```

### 9.3 Visual Editor Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [← Back to Editor List]  Template Name — Draft         [Save] [Submit] │
├──────────────┬─────────────────────────────────┬───────────────────────┤
│              │                                 │                       │
│  Block       │        A4 Canvas                │  Properties           │
│  Library     │                                 │  Panel                │
│              │  ┌─────────────────────────┐   │                       │
│  ─ Branding  │  │ [Header Zone]           │   │  Selected Block:      │
│  ─ Text      │  │ Company Logo  Date Ref  │   │  KeyValueSection      │
│  ─ Data      │  ├─────────────────────────┤   │                       │
│  ─ Layout    │  │ [Body Zone]             │   │  Title: "Details"     │
│  ─ Table     │  │  [Block 1: Key/Value]   │   │  Fields: [+Add Row]   │
│  ─ Output    │  │  [Block 2: Body Text]   │   │  Emphasized: [ ]      │
│              │  │  [Block 3: Table]       │   │                       │
│              │  ├─────────────────────────┤   │                       │
│              │  │ [Footer Zone]           │   │                       │
│              │  │ TRN  License  QR Code   │   │                       │
│              │  └─────────────────────────┘   │                       │
│              │                                 │                       │
│              ├─────────────────────────────────┤                       │
│              │  [Data View] [Formal Preview]   │                       │
└──────────────┴─────────────────────────────────┴───────────────────────┘
```

- **Left panel:** Block library (grouped by family)
- **Center:** A4 canvas (Puck drag/drop area) + preview toggle
- **Right panel:** Selected block property editor (Puck's built-in property system)
- **Top bar:** Template name, governance status badge, Save Draft, Submit for Review

### 9.4 Preview Mode

"Formal Preview" button triggers `ExecutiveLedgerPreview` (existing iframe component) using the currently saved `body_layout_json` resolved to an `ExecutiveLedgerDocument`. This is the same rendered output the user will see in production.

### 9.5 Governance Actions

Same `GovernanceActionsDropdown` component used in Templates & Branding admin, embedded directly in the Editor header. No separate governance page needed for basic flows.

---

## 10. Proposed Data Model

### 10.1 Storage Decision: Option A (extend `erp_report_templates`)

**Recommendation: Option A** — use the existing `body_layout_json`, `header_layout_json`, `footer_layout_json`, `style_json` columns.

**Reasons:**
- These columns already exist in the DB schema — no new migration needed to store layout JSON.
- Version control is already handled by `parent_template_id` + `version_no` + `createTemplateDraftVersion` server action. A separate version table would duplicate this.
- The governance lifecycle (draft → in_review → approved → published) already tracks the lifecycle of the visual layout as part of the template.
- Each `createTemplateDraftVersion` call copies `body_layout_json` to the new draft, preserving version history.

**Option B (separate version table) is over-engineered** for this use case. It would require joining two tables for every template render, without adding any capability that Option A with the existing versioning system doesn't already provide.

**New migration needed:** Only to add two tracking columns:

```sql
-- REPORT DESIGNER.1 migration (minimal)
ALTER TABLE erp_report_templates 
  ADD COLUMN IF NOT EXISTS visual_editor_engine text DEFAULT 'puck',
  ADD COLUMN IF NOT EXISTS visual_layout_schema_version integer DEFAULT 1;
```

`visual_editor_engine` — identifies which editor produced the layout (future-proofs engine upgrades).  
`visual_layout_schema_version` — enables schema migrations if the block format evolves.

### 10.2 Layout JSON Stored in `body_layout_json`

The Puck `Data` structure is stored directly:

```json
{
  "schemaVersion": 1,
  "engine": "puck",
  "content": [
    {
      "type": "KeyValueSection",
      "props": {
        "title": "Employee Details",
        "fields": [
          { "label": "Employee Name", "binding": "employee.full_name_en" },
          { "label": "Employee Code", "binding": "employee.employee_code" },
          { "label": "Department",    "binding": "employee.department" }
        ]
      }
    },
    {
      "type": "BodyTextSection",
      "props": {
        "content": "This letter certifies that {{employee.full_name_en}} has been employed...",
        "language": "en"
      }
    },
    {
      "type": "DividerBlock",
      "props": {}
    }
  ],
  "root": {
    "props": {
      "orientation": "portrait",
      "pageSize": "A4",
      "fontFamily": "inter"
    }
  }
}
```

`header_layout_json` and `footer_layout_json` follow the same structure for header/footer zones.  
`style_json` stores theme overrides if the user customizes colors beyond the branding profile.

---

## 11. Proposed Visual Layout JSON Schema

### 11.1 Block Schema Concept (Zod-validated on save and render)

```typescript
// Block type discriminated union
type ERPBlock =
  | KeyValueSectionBlock
  | BodyTextSectionBlock
  | TableSectionBlock
  | BrandingHeaderBlock
  | DataFieldBlock
  | DividerBlock
  | SpacerBlock
  | TwoColumnBlock
  | VerificationQrBlock
  | SignatoryBlock;

// Example: KeyValueSection
interface KeyValueSectionBlock {
  type: "KeyValueSection";
  props: {
    title?: string;                        // section heading
    fields: Array<{
      label: string;                       // static label text
      binding: string;                     // data binding key e.g. "employee.full_name_en"
      emphasized?: boolean;               // bold value
      isSubHeader?: boolean;              // acts as sub-section header
    }>;
  };
}

// Example: BodyTextSection
interface BodyTextSectionBlock {
  type: "BodyTextSection";
  props: {
    content: string;                       // text with {{binding}} placeholders
    language: "en" | "ar" | "bilingual";
    title?: string;
  };
}

// Example: TableSection
interface TableSectionBlock {
  type: "TableSection";
  props: {
    title?: string;
    dataSource: string;                    // data binding key e.g. "report.rows"
    columns: Array<{
      header: string;
      binding: string;                     // column field key
      width?: number;                      // relative width
    }>;
    showTotals: boolean;
    totalsLabel?: string;
  };
}
```

### 11.2 Layout JSON Root

```typescript
interface ERPLayoutJSON {
  schemaVersion: number;           // increment when block schema changes
  engine: "puck";                  // editor engine identifier
  content: ERPBlock[];             // ordered blocks array
  root: {
    props: {
      orientation: "portrait" | "landscape";
      pageSize: "A4" | "A3" | "Letter";
      fontFamily: string;
    };
  };
}
```

### 11.3 Zod Validation

A comprehensive Zod schema validates every block at:
1. **Save time** (server action) — reject invalid blocks before storing
2. **Render time** — reject before invoking `renderExecutiveLedgerHtml`
3. **Security review** — static analysis of all `binding` paths against the allowed registry

---

## 12. Proposed ERP Block Library

Blocks are organized into 6 families. Each block maps to one or more `ExecutiveLedgerSection` types or top-level document properties.

### Family A: Branding Blocks
| Block | Maps to EL | Description |
|---|---|---|
| `BrandingHeaderBlock` | `branding` context | Full company header (logo, name, address) |
| `CompanyLogoBlock` | `branding.logoUrl` | Logo only |
| `CompanyNameBlock` | `branding.companyNameEn/Ar` | Legal name |
| `AddressBlock` | `branding.addressBlockEn` | Address display |
| `TrnBlock` | `branding.trn` | TRN display |
| `LicenseBlock` | `branding.tradeLicenseNo` | Trade license |
| `WatermarkBlock` | Document watermark | Text or image watermark |

### Family B: Text Blocks
| Block | Maps to EL | Description |
|---|---|---|
| `HeadingBlock` | Custom body section | H1/H2 heading text |
| `BodyTextSection` | `body` section | Multi-paragraph text with bindings |
| `BilingualTextSection` | `body` section, bilingual | EN+AR parallel text |
| `NoteBoxBlock` | `notes` field | Info box / note |
| `LegalDisclaimerBlock` | `terms` field | Terms/legal list |
| `FooterTextBlock` | `footerOverride` | Footer text override |

### Family C: Data Blocks
| Block | Maps to EL key_value row | Description |
|---|---|---|
| `KeyValueSection` | `key_value` section | Multiple label+value pairs |
| `DataFieldBlock` | Single key_value row | One field from data binding |
| `DateFieldBlock` | Date-formatted binding | Formatted date field |
| `ReferenceNumberBlock` | Document reference | Auto-formatted ref (e.g. `EXP/2026/0001`) |
| `StatusBadgeBlock` | Status display | Visual status indicator |

### Family D: Layout Blocks
| Block | Maps to EL | Description |
|---|---|---|
| `DividerBlock` | `divider` section | Horizontal rule with optional label |
| `SpacerBlock` | Whitespace | Vertical space |
| `TwoColumnBlock` | CSS grid wrapper | Two-column section |
| `ThreeColumnBlock` | CSS grid wrapper | Three-column section |
| `BorderBoxBlock` | Bordered container | Info card |
| `HeaderBandBlock` | Section header | Colored header band |
| `SectionBlock` | Logical grouping | Named section container |

### Family E: Table Blocks
| Block | Maps to EL table | Description |
|---|---|---|
| `TableSection` | `table` section | Dynamic data table |
| `StaticTableBlock` | `table` section | Fixed rows/columns |
| `TotalsRowBlock` | `table.totals` | Totals/summary row |
| `KpiSummaryBlock` | Custom display | KPI cards row |

### Family F: Output/Security Blocks
| Block | Maps to EL | Description |
|---|---|---|
| `VerificationQrBlock` | `verification` | QR code (requires approved template + public link) |
| `VerificationNoticeBlock` | `verification.label` | "Scan to verify" text |
| `SignatoryBlock` | `signatoryOverride` | Signatory name, title, signature line |
| `ApprovalAreaBlock` | Custom section | Prepared by / Approved by rows |
| `StampAreaBlock` | Stamp gated by `reports.sign` | Stamp placement |

**Security rules per block family:**
- Branding blocks: All values resolved server-side from `ExportBrandingContext` — never raw user input
- Data blocks: Bindings validated against allowed registry — no free-form SQL or expressions
- Output blocks: QR block requires issuable template status; stamp requires `reports.sign` permission
- Layout blocks: No HTML allowed in text props — all text XSS-escaped by renderer

---

## 13. Proposed Data-Binding Registry

### 13.1 Design Principle

The data binding registry exposes an approved set of field paths only. No raw SQL, no arbitrary object paths, no computed expressions are allowed. Bindings are validated at:
1. Design time — picker shows only allowed fields
2. Save time — Zod validates all bindings against the registry
3. Render time — renderer replaces only known bindings, unknown bindings render as empty

### 13.2 Binding Namespaces

```typescript
const ERP_BINDING_REGISTRY = {
  // Employee namespace — from HR fetchers
  "employee.full_name_en":       { label: "Employee Name (EN)", type: "text" },
  "employee.full_name_ar":       { label: "Employee Name (AR)", type: "text" },
  "employee.employee_code":      { label: "Employee Code", type: "text" },
  "employee.designation":        { label: "Designation", type: "text" },
  "employee.department":         { label: "Department", type: "text" },
  "employee.branch":             { label: "Branch", type: "text" },
  "employee.owner_company":      { label: "Company", type: "text" },
  "employee.joining_date":       { label: "Joining Date", type: "date" },
  "employee.last_working_date":  { label: "Last Working Date", type: "date" },
  "employee.nationality":        { label: "Nationality", type: "text" },
  "employee.employment_status":  { label: "Employment Status", type: "text" },
  "employee.work_site":          { label: "Work Site", type: "text" },

  // Company namespace — from branding profile
  "company.legal_name_en":       { label: "Company Name (EN)", type: "text" },
  "company.legal_name_ar":       { label: "Company Name (AR)", type: "text" },
  "company.address_block_en":    { label: "Address", type: "text" },
  "company.trn":                 { label: "TRN", type: "text" },
  "company.trade_license_no":    { label: "Trade License No.", type: "text" },
  "company.phone":               { label: "Phone", type: "text" },
  "company.email":               { label: "Email", type: "text" },
  "company.website":             { label: "Website", type: "text" },

  // Document namespace — system-generated
  "document.title":              { label: "Document Title", type: "text" },
  "document.ref":                { label: "Reference Number", type: "text" },
  "document.generated_at":       { label: "Generated Date", type: "date" },
  "document.issue_date":         { label: "Issue Date", type: "date" },
  "document.qr_verification_url": { label: "Verification URL", type: "url", security: "qr_required" },

  // Report namespace — from report runner
  "report.title":                { label: "Report Title", type: "text" },
  "report.code":                 { label: "Report Code", type: "text" },
  "report.rows":                 { label: "Report Data Rows", type: "table_data" },
  "report.total_rows":           { label: "Total Rows", type: "number" },
} as const;
```

### 13.3 Blocked Fields (never in binding registry)

These fields must never appear in the binding registry regardless of context:

```
employee.salary_*          — all salary fields
employee.bank_account_*    — banking details
employee.iban_*            — IBAN
employee.passport_*        — passport number/expiry
employee.eid_*             — Emirates ID
employee.visa_*            — visa details
employee.medical_*         — medical records
employee.*_document_id     — internal DMS IDs
*.*_profile_id             — internal FK IDs
*.created_by / updated_by  — internal user IDs
```

These are blocked by the security model (BRANDING.6 sanitizer rules) and should never reach the public verification payload.

---

## 14. Proposed Safe Renderer Architecture

```
visual_layout_json (stored in erp_report_templates.body_layout_json)
    │
    ▼
1. Load + Zod validate layout JSON
   - Validate block types against allowed block schema
   - Validate all bindings against ERP_BINDING_REGISTRY
   - Reject if any unknown type or binding found
    │
    ▼
2. Resolve data context (server-side only)
   - Run report fetcher → flat data row
   - Resolve branding → ExportBrandingContext
   - Bind {{binding}} placeholders to actual values
   - Apply redaction (sensitive_profile rules from erp_report_registry)
    │
    ▼
3. Map blocks → ExecutiveLedgerDocument
   - KeyValueSection block → EL key_value section
   - BodyTextSection block → EL body section
   - TableSection block → EL table section
   - BrandingHeaderBlock → EL branding context
   - VerificationQrBlock → EL verification block
   - etc.
    │
    ▼
4. renderExecutiveLedgerHtml(elDoc)
   - Existing renderer, unchanged
   - XSS-escapes all text via elEscapeHtml / elEscapeAttr
   - No raw HTML from user input ever reaches the renderer
    │
    ▼
5. Output
   - Screen (iframe preview via ExecutiveLedgerPreview)
   - PDF (browser print)
   - Public QR (requires approved/published status)
```

**Key security property:** User-authored content (block props, binding values) is always treated as data, never as markup. The renderer handles all HTML generation from the EL document model.

---

## 15. Governance Integration Plan

The visual editor integrates with the existing governance system without changes to governance logic:

| Scenario | Editor behavior |
|---|---|
| Template is `draft` | Visual editor fully interactive; Save Draft updates `body_layout_json` |
| User saves | Server action updates `body_layout_json` + `visual_layout_schema_version`, keeps `governance_status = draft` |
| User submits for review | `submitTemplateForReview` server action (existing); status → `in_review`; editor becomes read-only |
| Template is `in_review` | Editor read-only; approver can view |
| Approver approves | `approveTemplate` (existing); status → `approved`; editor fully locked |
| Template is `approved` | Editor shows view-only canvas with "Create New Version" CTA |
| Admin publishes | `publishTemplate` (existing); status → `published` |
| Template is `published` | Editor shows view-only canvas with "Create New Version" CTA; template is issuable |
| User creates new version | `createTemplateDraftVersion` (existing) copies `body_layout_json` to new draft; user resumes editing |
| Template is `rejected` | Editor unlocked for the submitter to fix and resubmit |

**Security review integration:** `runTemplateSecurityReviewAction` (existing) can be extended in REPORT DESIGNER.7 to include static analysis of the visual layout JSON — scan for disallowed bindings, suspicious text content, unusual block combinations.

---

## 16. Security Model

### 16.1 Client-side Editor Security

| Threat | Mitigation |
|---|---|
| User injects custom JavaScript | Puck blocks are controlled React components — no `<script>` allowed in block props |
| User injects raw HTML | Text props are plain strings — renderer escapes all text via `elEscapeHtml` |
| User injects inline event handlers | Block props are typed (string/number/boolean) — no event handler type in schema |
| Unsafe CSS injection | `style_json` is a controlled set of tokens (colors from palette, font from whitelist) — no `content:url()`, no `expression()` |
| iframe/embed/object | Not in block library — only defined blocks allowed |
| External HTTP asset URLs | All image assets come from `erp_branding_assets` (Supabase Storage signed URLs) or data bindings — no free-text URL props |
| Direct storage path exposure | Assets resolved server-side via `resolveReportBrandingProfileAssetUrls` — signed URLs only |
| Service role / API key in layout | Block props are data-typed — no string that could contain credentials |
| Data binding to sensitive fields | `ERP_BINDING_REGISTRY` allowlist — salary, IBAN, passport blocked at design time |
| Layout JSON bypass | All bindings re-validated at render time — even if DB is modified directly |
| Unauthorized layout save | Server action checks `reports.manage` permission before any write |
| Approved template modification | `updateReportTemplate` blocks edits for `approved`/`published` status (BRANDING.8 guard) |

### 16.2 Public Verification Payload Security

All existing public verification sanitizer rules (BRANDING.6) apply regardless of whether a template uses visual layout or the default EL sections. The sanitizer operates on the final output payload — it doesn't matter how the document was designed.

### 16.3 New Permissions Required

Recommendation: **reuse existing permissions** rather than adding new ones. The editor is a UI over the existing template system:

| Action | Permission |
|---|---|
| View editor, list templates | `reports.view` |
| Create/edit draft template layout | `reports.manage` |
| Preview template with data | `reports.view` + `reports.run` |
| Submit template for review | `reports.manage` |
| Approve/reject template | `reports.template.approve` |
| Publish template | `reports.publish` |
| Run security review | `reports.template.approve` |

**No new permissions needed for REPORT DESIGNER.1–.8.** If a more granular `reports.editor.*` permission set is desired (e.g., to allow HR managers to design templates without full `reports.manage`), it can be added in a separate permissions migration. This is deferred unless Sameer requests it.

---

## 17. MCP / API / Tooling Requirements

| Tool | Purpose | Required |
|---|---|---|
| **user-supabase MCP** | DB schema inspection, migration execution, RLS/policy verification | Yes |
| **Browser automation** | UAT — test visual editor drag/drop, block placement, preview, QR issuance | Yes (REPORT DESIGNER.8) |
| **TypeScript build** (`tsc --noEmit`) | Validate types after each phase | Yes (each phase) |
| **Next.js build** (`npm run build`) | Full build verification | Yes (each phase) |
| **npm audit** | Check `@puckeditor/core` for vulnerabilities before install | Yes (REPORT DESIGNER.2) |
| **Zod** | Schema validation for layout JSON — already in project | Yes (REPORT DESIGNER.1) |
| GitHub/web research | Already completed in this phase | Done |

**No new external SaaS dependencies.** All rendering, storage, and output go through existing infrastructure.

---

## 18. Detailed Implementation Phases

---

### REPORT DESIGNER.1 — DB Schema, Layout Standard & Zod Validation

**Objective:** Define and validate the visual layout JSON schema. Extend the DB with 2 minimal columns. No UI.

**Files affected:**
- `supabase/migrations/YYYYMMDD_report_designer_1_layout_schema.sql` — new migration
- `src/lib/report-center/layout-schema.ts` (new) — Zod schema for ERPLayoutJSON
- `src/lib/report-center/types.ts` — add `visual_editor_engine`, `visual_layout_schema_version` to `ReportTemplate`
- `src/server/actions/reports/templates.ts` — include new columns in select/update

**DB changes:**
```sql
ALTER TABLE erp_report_templates
  ADD COLUMN IF NOT EXISTS visual_editor_engine text DEFAULT 'puck',
  ADD COLUMN IF NOT EXISTS visual_layout_schema_version integer DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_erp_report_templates_engine 
  ON erp_report_templates(visual_editor_engine) 
  WHERE visual_editor_engine IS NOT NULL;
```

**UAT checklist:**
- Zod schema validates a known-good layout JSON without errors
- Zod schema rejects a layout with an unknown block type
- Zod schema rejects a layout with a disallowed data binding
- TypeScript and build pass

**Risks:** Low — additive only  
**Stop condition:** Zod schema defined and tested; new DB columns applied; types updated

---

### REPORT DESIGNER.2 — Visual Editor Shell & Reports Editor Route

**Objective:** Install Puck, create the Reports Editor route and list page, create the visual editor shell (empty canvas), add navigation item.

**Files affected (new):**
- `src/app/(protected)/admin/reports/editor/page.tsx` — server component, list view
- `src/app/(protected)/admin/reports/editor/[templateId]/page.tsx` — server component, editor page
- `src/features/report-center/report-editor-list.tsx` — client: list of templates with edit CTA
- `src/features/report-center/report-designer-shell.tsx` — client: Puck editor + zone layout
- `src/lib/rbac/route-access-registry.ts` — register new routes
- `src/lib/workspace/workspace-route-registry.ts` — register editor tabs
- `src/components/layout/app-sidebar.tsx` — add Reports Editor menu item
- `package.json` — add `@puckeditor/core`

**Files modified:**
- `src/server/actions/reports/templates.ts` — `getReportTemplateForEditor` (includes `body_layout_json`)
- `src/server/actions/reports/templates.ts` — `saveReportTemplateDraftLayout` (validates + saves layout JSON)

**DB changes:** None (from REPORT DESIGNER.1)

**Security/RLS:**
- Editor route requires `reports.manage` in route-access-registry
- `saveReportTemplateDraftLayout` checks `reports.manage` + blocks approved/published

**UAT checklist:**
- Reports Editor appears in sidebar for users with `reports.manage`
- Template list loads with governance status badges
- Clicking a draft template opens the visual editor page
- Empty Puck canvas renders without errors
- Save Draft updates `body_layout_json` in DB
- Build and TypeScript pass

**Risks:** Medium — first `@puckeditor/core` install; npm audit before installing  
**Stop condition:** Empty editor shell working; save/load of layout JSON round-trips correctly

---

### REPORT DESIGNER.3 — ERP Block Library Foundation

**Objective:** Implement all 6 block families as Puck component definitions. Each block renders correctly in Puck's preview.

**Files affected (new):**
- `src/features/report-designer/blocks/` (directory)
  - `branding-blocks.tsx` — BrandingHeaderBlock, CompanyLogoBlock, etc.
  - `text-blocks.tsx` — BodyTextSection, HeadingBlock, etc.
  - `data-blocks.tsx` — KeyValueSection, DataFieldBlock, etc.
  - `layout-blocks.tsx` — DividerBlock, SpacerBlock, TwoColumnBlock, etc.
  - `table-blocks.tsx` — TableSection, StaticTableBlock, etc.
  - `output-blocks.tsx` — VerificationQrBlock, SignatoryBlock, etc.
  - `index.ts` — Puck config object
- `src/features/report-designer/erp-puck-config.ts` — assembled `Config` for Puck

**DB changes:** None  
**Security:** All blocks use typed props, no HTML injection possible  
**UAT checklist:**
- All block families visible in the Puck block library panel
- Each block can be dragged onto canvas
- Block properties appear in the right panel on selection
- Blocks render correct preview in Puck canvas

**Risks:** Medium — significant component implementation work  
**Stop condition:** All planned blocks defined, draggable, and property-editable

---

### REPORT DESIGNER.4 — Data Binding Registry & Field Picker

**Objective:** Implement `ERP_BINDING_REGISTRY`, integrate it with Puck blocks as field picker dropdowns, validate bindings at save time.

**Files affected (new):**
- `src/lib/report-center/binding-registry.ts` — `ERP_BINDING_REGISTRY` constant, types, helper functions
- `src/features/report-designer/binding-field-picker.tsx` — UI picker component for selecting bindings
- `src/lib/report-center/layout-schema.ts` — extend Zod schema to validate all bindings against registry

**Files modified:**
- `src/features/report-designer/blocks/data-blocks.tsx` — wire field picker to DataFieldBlock, KeyValueSection
- `src/server/actions/reports/templates.ts` — `saveReportTemplateDraftLayout` runs binding validation

**DB changes:** None  
**Security:** Allowlist enforced at design time and save time; blocked fields documented  
**UAT checklist:**
- Field picker shows categorized list of allowed bindings
- Blocked fields (salary, IBAN, passport) not visible in picker
- Saving a layout with an unknown binding returns a validation error
- TypeScript and build pass

**Risks:** Low  
**Stop condition:** Field picker working; binding validation enforced server-side

---

### REPORT DESIGNER.5 — Visual Preview with Sample / Real Data

**Objective:** Add preview mode that renders the current layout JSON through the Executive Ledger renderer using sample or real employee data.

**Files affected (new):**
- `src/lib/report-center/layout-to-el.ts` — `mapLayoutJsonToElDocument(layoutJson, dataContext, brandingCtx)` mapper function
- `src/server/actions/reports/designer-preview.ts` — `previewReportDesignerLayout(templateId, previewParams)` server action

**Files modified:**
- `src/features/report-designer/report-designer-shell.tsx` — add "Formal Preview" tab using `ExecutiveLedgerPreview`
- `src/features/report-center/letter-preview-dialog.tsx` — use `body_layout_json` if present (new flow) vs legacy EL build (old flow)

**DB changes:** None  
**Security:**
- `previewReportDesignerLayout` checks `reports.view` + `reports.run`
- Data binding resolver uses same `applyRedaction` as live runner
- Preview never issues public links or QR

**UAT checklist:**
- Preview renders a letter with real employee data
- Employee name, code, department appear in correct blocks
- Company logo, header colors from branding profile appear
- Preview renders the same as production output

**Risks:** Medium — `mapLayoutJsonToElDocument` is the critical integration point  
**Stop condition:** Preview renders correctly for all block types with sample data

---

### REPORT DESIGNER.6 — Safe Renderer & Production Integration

**Objective:** Wire `body_layout_json` into the live output pipeline. When a template has visual layout, use it instead of the default EL section builder.

**Files affected:**
- `src/lib/report-center/layout-to-el.ts` — stabilise and harden
- `src/features/report-center/letter-preview-dialog.tsx` — use layout-based EL document for templates with `body_layout_json`
- `src/server/actions/reports/runner.ts` — detect `body_layout_json` and use layout renderer path

**DB changes:** None  
**Security:**
- Full Zod validation run at render time (not just at save time)
- All text values pass through `elEscapeHtml`
- Stamp/signature access gated by `reports.sign` (unchanged from existing)

**UAT checklist:**
- Official HR letter output uses visual layout when template has `body_layout_json`
- Public QR verification uses correct visual layout content
- Fallback to default EL section builder when `body_layout_json` is NULL (backward compatible)

**Risks:** High — modifies live output pipeline; requires thorough testing  
**Stop condition:** Live output matches preview; no regressions in existing template output

---

### REPORT DESIGNER.7 — Governance, Approval & Security Review Integration

**Objective:** Integrate visual editor fully with governance workflow. Extend security review to scan layout JSON. Ensure view-only mode for approved/published.

**Files affected:**
- `src/features/report-designer/report-designer-shell.tsx` — view-only mode when not draft/rejected
- `src/server/actions/reports/template-governance.ts` — extend `runTemplateSecurityReviewAction` to scan `body_layout_json` bindings
- `src/features/report-center/template-governance-actions.tsx` — ensure GovernanceActionsDropdown works in editor context

**DB changes:** None  
**Security:**
- Security review scans all bindings against registry; fails review if disallowed binding found
- Security review scans for any `type` not in allowed block list

**UAT checklist:**
- Draft template — editor fully interactive
- In-review template — editor read-only, govActions visible
- Approved/Published — editor fully locked, "Create New Version" CTA visible
- Security review flags unknown bindings
- Submit → approve → publish flow works end-to-end

**Risks:** Low (governance system already fully implemented)  
**Stop condition:** Full governance lifecycle works in editor; security review catches bad bindings

---

### REPORT DESIGNER.8 — Runtime UAT with HR Letters, Certificates, Forms

**Objective:** Browser-based end-to-end UAT. Design a template, go through full governance, issue a letter with QR, verify publicly.

**Scope:**
- Experience Letter
- Salary Certificate
- NOC
- ALGT Certificate (certificate type)
- HR PPE Form
- One report-type template (HR Employee List)

**UAT checklist:**
- Design template with visual editor from scratch → save draft
- Submit for review → approve → publish
- Open HR letter for employee → select published template → Issue QR
- Scan QR → public verification page shows correct data
- Save as PDF → branding appears correctly
- Print → A4 layout correct

**Risks:** Medium — integration bugs likely; good opportunity to catch regressions  
**Stop condition:** All 6 output types verified via visual editor templates

---

### REPORT DESIGNER.9 — Rollout to Report Tables & Advanced Layouts

**Objective:** Extend visual editor to tabular report output (HR Employee List, attendance, leave). Add advanced layout blocks (grouped tables, KPI rows, multi-page support).

**Additional blocks:**
- `GroupedTableSection` — table with row grouping by a field
- `KpiSummaryBlock` — KPI card row (count, sum, avg)
- `PageBreakBlock` — forced page break for multi-page reports
- `ConditionalBlock` — show/hide block based on binding value (restricted expressions only)

**DB changes:** None planned  
**Risks:** High — multi-page and conditional logic are complex  
**Stop condition:** At least one report-type template (HR_EMPLOYEE_LIST) fully designed and rendered via visual editor

---

## 19. Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Puck API breaks in a future version | Low | Medium | Pin `@puckeditor/core` version; layout JSON is in our schema, not Puck's internal format |
| `mapLayoutJsonToElDocument` becomes a maintenance burden | Medium | Medium | Keep it small and well-typed; Zod schema enforces no breaking changes to block types |
| Users find visual editor confusing vs simple text-based editor | Medium | Low | Keep existing metadata form approach for simple templates; visual editor is opt-in |
| Performance: large layout JSON causes slow preview | Low | Low | Preview is client-side iframe; large documents only affect the iframe re-render |
| Security: user finds a way to inject bad content via text fields | Low | High | Zod validation + `elEscapeHtml` in renderer; defense in depth |
| Puck's canvas doesn't match exact A4 rendering | Medium | Medium | Use "Formal Preview" tab (real EL renderer) as the authoritative preview; Puck canvas is structural only |
| Integration breaks existing HR letter flow | Medium | High | Backward-compat: use layout JSON only if `body_layout_json IS NOT NULL`; null = legacy EL builder |
| TypeScript complexity from Puck generics | Low | Low | Puck has good TypeScript support; pin to stable version |

---

## 20. Final Recommendation

### Proceed with REPORT DESIGNER.1

**Recommended approach:**
1. Use **Puck** (`@puckeditor/core`) as the visual editor framework — MIT, React-native, JSON output, no vendor lock-in
2. Store visual layout in existing `body_layout_json`, `header_layout_json`, `footer_layout_json` columns — no major new DB tables needed
3. Map visual layout JSON to `ExecutiveLedgerDocument` — preserves all existing rendering, security, and output infrastructure
4. Integrate with existing governance, branding, and QR verification systems without changes to those systems
5. Add one new sidebar item: "Reports Editor" under Reports module
6. Implement in 9 phases (REPORT DESIGNER.1–.9), each independently shippable

**Before REPORT DESIGNER.1 begins, Sameer should confirm:**

- [ ] Puck is approved as the visual editor library
- [ ] The block library scope (all 6 families, or start with a subset?)
- [ ] Data binding registry scope — approved as specified, or additions/removals needed?
- [ ] New permissions (`reports.editor.*`) wanted, or reuse existing `reports.manage`?
- [ ] Phase REPORT DESIGNER.9 (report tables) — is this in scope for the first rollout?

**Suggested first phase to approve:** REPORT DESIGNER.1 (schema + Zod) — zero UI impact, zero risk, establishes the type system for all subsequent phases.

---

*End of REPORT DESIGNER.0 Planning Report*

*Next: Awaiting Sameer review and approval. Do not begin REPORT DESIGNER.1 until explicitly instructed.*

# ERP Report Designer — Visual Template Standard
**Phase:** REPORT DESIGNER.1 — DB Schema, Layout Standard, Zod Validation  
**Status:** Foundation established  
**Last updated:** 2026-07-03

---

## 1. Purpose and Scope

The Visual Reports Editor is a future module that allows authorized ERP users to design formal document templates visually, without touching code. It replaces the current static body_html_en / body_html_ar columns with a structured, governed, Zod-validated JSON layout.

This standard governs all aspects of the visual template system: storage, validation, blocks, bindings, test mode, and security.

---

## 2. Navigation and UI Placement

**One menu item only under Reports:**

```
Reports → Reports Editor
```

Do **not** create multiple sidebar items. The Reports Editor is a single screen that can open any draft template.

---

## 3. Storage Columns

All visual layout JSON is stored in `erp_report_templates`:

| Column | Type | Purpose |
|---|---|---|
| `body_layout_json` | jsonb | Main document body zone |
| `header_layout_json` | jsonb | Header zone (logo, company name) |
| `footer_layout_json` | jsonb | Footer zone (QR, signatory, page number) |
| `style_json` | jsonb | Future: theme overrides (color, spacing) |
| `visual_editor_engine` | text | Engine that produced this layout (default: `puck`) |
| `visual_layout_schema_version` | integer | Schema version for migration guards |
| `visual_layout_updated_at` | timestamptz | Timestamp of last visual edit |
| `visual_layout_updated_by` | bigint → user_profiles | User who last edited the visual layout |

The columns `body_layout_json`, `header_layout_json`, `footer_layout_json`, and `style_json` existed before REPORT DESIGNER.1 (added in BRANDING migrations) and defaulted to `{}`.

---

## 4. Visual Editor Engine

**Puck** is the approved editor engine for ALGT ERP.

- Library: [`measured-co/puck`](https://github.com/measuredco/puck) (MIT License)
- Output: JSON (`ReportDesignerLayoutJson`) — never raw HTML
- Integration: REPORT DESIGNER.3+
- Schema version: stored in `visual_layout_schema_version` and `layout.schemaVersion`

---

## 5. Layout JSON Standard

### Root shape

```typescript
interface ReportDesignerLayoutJson {
  schemaVersion: number;     // must be <= CURRENT_LAYOUT_SCHEMA_VERSION
  engine: 'puck';            // only 'puck' is allowed
  content: ReportDesignerBlock[];
  root: {
    props: {
      orientation?: 'portrait' | 'landscape';
      pageSize?: 'A4' | 'A3' | 'Letter';
      fontFamily?: string;   // must be in PERMITTED_FONT_FAMILIES
      languageMode?: 'en' | 'ar' | 'bilingual';
    };
  };
}
```

### Zone rules

| Zone | Column | Max blocks | Notes |
|---|---|---|---|
| Body | `body_layout_json` | 50 | Main content — most blocks allowed |
| Header | `header_layout_json` | 50 | Typically: BrandingHeaderBlock, CompanyLogoBlock |
| Footer | `footer_layout_json` | 50 | Typically: VerificationQrBlock, SignatoryBlock, StampBlock |

---

## 6. Approved Block Types (REPORT DESIGNER.1)

All blocks must be from the approved set — no free-form HTML blocks exist.

| Block Type | Purpose |
|---|---|
| `HeadingBlock` | H1/H2/H3 heading — static text only |
| `BodyTextSectionBlock` | Free-form text with `{{binding}}` placeholders |
| `KeyValueSectionBlock` | Key→value detail rows (employee details, etc.) |
| `DividerBlock` | Visual horizontal divider |
| `SpacerBlock` | Vertical whitespace (4–40mm) |
| `BrandingHeaderBlock` | Full company header from branding profile |
| `CompanyLogoBlock` | Standalone logo from branding profile |
| `SignatoryBlock` | Signatory area (name, title, optional signature) |
| `StampBlock` | Official stamp from branding profile |
| `VerificationQrBlock` | QR code placeholder — rendered at issuance time |

Future blocks (REPORT DESIGNER.4+): `TableBlock`, `ChartBlock`, `BadgeBlock`, `ConditionalBlock`.

---

## 7. Data Binding Registry

All `{{binding}}` placeholders must be validated against `ERP_BINDING_REGISTRY` in `src/lib/report-designer/binding-registry.ts`.

Unknown bindings fail Zod validation and the template cannot be saved.

### Approved namespaces

```
employee.*   — employee profile fields (no salary, no IBAN, no document numbers)
company.*    — company/branding profile fields
document.*   — document-level metadata (ref, date, QR URL)
report.*     — report-level metadata (title, code, row count)
```

### Example bindings

```
employee.full_name_en, employee.designation, employee.joining_date
company.legal_name_en, company.trn, company.address_block_en
document.ref, document.issue_date, document.qr_verification_url
report.title, report.code, report.total_rows
```

---

## 8. Sensitive Field Exclusions

The following fields must **never** appear in `ERP_BINDING_REGISTRY` and must **never** be exposed in visual templates:

```
salary, basic_salary, total_salary, allowances, deductions
iban, bank_account, account_number
passport_number (raw), eid_number (raw), visa_uid (raw)
medical data, health data, insurance details
ocr_text, extracted_text
prompt, embedding, vector
*_id internal FK columns
created_by, updated_by
service_role, api_key, secret, token values
```

If a template designer requests a sensitive field, it must be declined and an approved alternative must be offered (e.g., use `employee.designation` instead of salary data).

---

## 9. Zod Validation Rules

All layout JSON must pass `ReportDesignerLayoutJsonSchema` from `src/lib/report-designer/layout-schema.ts` before any save or render.

Rules enforced by Zod:

- `schemaVersion` must be `>= 1` and `<= CURRENT_LAYOUT_SCHEMA_VERSION`
- `engine` must be `"puck"`
- `content` length must be `<= MAX_BLOCKS_PER_ZONE` (50)
- All text props: max 4000 chars; no HTML tags; no script injection
- All `binding` fields in `KeyValueSectionBlock` must be in `SAFE_BINDING_PATHS`
- All `{{binding}}` placeholders in `BodyTextSectionBlock.content` must be allowlisted
- `fontFamily` must be in `PERMITTED_FONT_FAMILIES`
- Numeric ranges enforced: spacer 4–40mm, logo 16–80mm, stamp 20–60mm, QR 20–50mm

---

## 10. Governance Integration

Visual layout edits are governed by the existing template governance lifecycle:

| Status | Can edit visual layout? |
|---|---|
| `draft` | ✅ Yes |
| `rejected` | ✅ Yes (revise and resubmit) |
| `in_review` | ❌ No — under review |
| `approved` | ❌ No — use "Create New Version" |
| `published` | ❌ No — use "Create New Version" |
| `archived` | ❌ No |

To modify a published template: create a new draft version via the governance "New Version" action (BRANDING.7).

---

## 11. Live Report Test Capability

### Target workflow (REPORT DESIGNER.5)

1. Open Reports Editor
2. Open a draft template
3. Design layout blocks
4. Click **Test Report**
5. ERP shows a dialog: select test mode + context (employee, company, filters)
6. System runs report data fetcher in test mode (read-only, no side effects)
7. System resolves safe data context (no sensitive fields)
8. System validates all layout bindings against the resolved context
9. System renders the preview via Executive Ledger engine
10. User can adjust layout and test again

### Test mode invariants

- NEVER create public QR links
- NEVER write report runs or audit outputs
- NEVER send emails
- NEVER publish templates
- Always redact sensitive fields
- Always use existing fetchers (HR letter fetchers, report runners)
- Sample fallback data when no live record selected

### Foundation (REPORT DESIGNER.1)

Types and schemas in `src/lib/report-designer/live-test-schema.ts`.  
Server action skeletons in `src/server/actions/reports/report-designer-test.ts`.  
Full execution in REPORT DESIGNER.5.

---

## 12. Renderer Boundary

The visual layout JSON is **never** rendered directly as HTML.

The rendering pipeline is:

```
ReportDesignerLayoutJson
  ↓ (REPORT DESIGNER.4 — mapping layer)
ExecutiveLedgerDocument
  ↓ renderExecutiveLedgerHtml()
Safe HTML string → PDF / Print / Preview
```

This boundary ensures:
- No raw HTML injection from template designers
- No CSS injection
- No XSS via binding values
- All output goes through the same Executive Ledger sanitization pipeline as current templates

---

## 13. Server Action Security Rules

All server actions in `src/server/actions/reports/report-designer-layout.ts` and `report-designer-test.ts` must follow:

1. `getAuthContext()` before any logic
2. `hasPermission(authCtx, "reports", "manage")` for write actions
3. `hasPermission(authCtx, "reports", "view")` for read actions
4. `createAdminClient()` only after permission gate
5. Zod validation on all inputs
6. Governance guard: block saves for `approved`, `published`, `in_review`, `archived`
7. Audit log with structural metadata only — never full layout JSON
8. `revalidatePath()` after writes

---

## 14. Files Reference

| File | Purpose |
|---|---|
| `src/lib/report-designer/types.ts` | TypeScript interfaces for all blocks + DTOs |
| `src/lib/report-designer/constants.ts` | Engine, schema version, permitted values |
| `src/lib/report-designer/binding-registry.ts` | Allowlisted binding paths + validation helpers |
| `src/lib/report-designer/layout-schema.ts` | Zod schemas for all blocks + layout root |
| `src/lib/report-designer/layout-validation.ts` | Validation helpers + audit metadata builder |
| `src/lib/report-designer/live-test-schema.ts` | Live test types, Zod schemas, sample data |
| `src/lib/report-designer/index.ts` | Public API re-exports |
| `src/server/actions/reports/report-designer-layout.ts` | Load/save/validate layout actions |
| `src/server/actions/reports/report-designer-test.ts` | Test options + run skeleton actions |
| `supabase/migrations/20260703000001_*.sql` | Migration: add visual tracking columns |

---

## 15. Future Phases

| Phase | Scope |
|---|---|
| REPORT DESIGNER.2 | `ReportTemplate` TypeScript type update + query-keys + Puck installation |
| REPORT DESIGNER.3 | Puck component config + ERP block UI components |
| REPORT DESIGNER.4 | Layout JSON → ExecutiveLedgerDocument mapping layer |
| REPORT DESIGNER.5 | Live Report Test execution with real HR data |
| REPORT DESIGNER.6 | Governance integration (submit for review from editor) |
| REPORT DESIGNER.7 | Print / PDF export from editor |
| REPORT DESIGNER.8 | Reports Editor route + workspace tab integration |
| REPORT DESIGNER.9 | Final UAT + security audit + rollout |
